/**
 * Centralized PowerShell runner.
 *
 * The 8 existing `spawn("powershell", ...)` sites (across 7 files) all repeat
 * the same shape:
 *   1) write script to tmpdir() as `*.ps1`
 *   2) spawn powershell with -NoProfile -NonInteractive -ExecutionPolicy Bypass -File
 *   3) buffer stdout/stderr
 *   4) unlink the temp file in a `done()` closure
 *   5) map exit code / "ERROR:" prefix to a thrown Error
 *
 * This module implements that pattern once with hardening added:
 *   - UTF-8 BOM on the temp .ps1 so Windows PowerShell 5.1 reads non-ASCII
 *     content correctly (without a BOM, PS 5.1 parses .ps1 as cp1252).
 *   - Byte-accurate output caps (not UTF-16 char counts), accumulated in
 *     Buffer[] to avoid truncating mid-codepoint.
 *   - Timeout + AbortSignal, both leading to deterministic resolution.
 *   - Discriminated-union result -- never throws/rejects.
 *   - Collision-proof temp filename (Date.now() + 4-byte random).
 *   - -InputFormat None to guarantee stdin is empty (belt-and-suspenders).
 *   - Strict `script` input validation.
 *
 * Scaffolding only in Phase 3 -- no existing file imports this. Phase 4
 * migrates call sites using RELATIVE imports (path alias `@/` is not
 * wired up in the Raycast bundler):
 *   import { runPowerShellScript } from "../infra/powershell";
 */

import { spawn } from "child_process";
import { randomBytes } from "crypto";
import { unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import type { PSDroppedBytes, PSFailureReason, PSResult, PSRunOptions } from "./types";

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_STDOUT = 5 * 1024 * 1024;
const DEFAULT_MAX_STDERR = 1 * 1024 * 1024;
const UTF8_BOM = "\uFEFF";

/**
 * Standard args passed to every PS spawn. Kept as a constant so Phase 4
 * migrations have a single point of truth; call sites MUST NOT build their
 * own arg arrays.
 *
 * `-InputFormat None` prevents PS from ever blocking on stdin -- important
 * when running under Raycast where the parent process may not drain stdin.
 */
export const PS_DEFAULT_ARGS = [
  "-NoProfile",
  "-NonInteractive",
  "-InputFormat",
  "None",
  "-ExecutionPolicy",
  "Bypass",
  "-File",
] as const;

/**
 * Execute a PowerShell script string. Materializes to a temp `.ps1` file
 * first (matches current call-site behavior and gives line-numbered
 * errors), spawns `powershell.exe`, and tears the file down on completion.
 *
 * NEVER rejects. Check `result.ok`.
 */
export async function runPowerShellScript(script: string, options: PSRunOptions = {}): Promise<PSResult> {
  if (process.platform !== "win32") {
    return fail("unsupported-platform", "PowerShell is only available on Windows hosts.", null);
  }

  if (typeof script !== "string" || script.trim().length === 0) {
    return fail("invalid-input", "runPowerShellScript requires a non-empty script string.", null);
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxStdout = options.maxStdoutBytes ?? DEFAULT_MAX_STDOUT;
  const maxStderr = options.maxStderrBytes ?? DEFAULT_MAX_STDERR;
  const prefix = options.tempPrefix ?? "ps-run";

  // Short random suffix so concurrent runs never collide on the same temp
  // path (Date.now() alone is not unique enough under load).
  const suffix = randomBytes(4).toString("hex");
  const tempPath = join(tmpdir(), `${prefix}-${Date.now()}-${suffix}.ps1`);

  try {
    // Prepend UTF-8 BOM so Windows PowerShell 5.1 parses the file as UTF-8
    // instead of the active ANSI codepage (cp1252 for most en-US installs).
    // Without this, accented characters in paths/content are silently
    // mangled by PS's file loader.
    await writeFile(tempPath, UTF8_BOM + script, { encoding: "utf8" });
  } catch (err) {
    return fail("write-failed", `Failed to write temp PS script: ${(err as Error).message}`, null);
  }

  const result = await spawnAndCollect(tempPath, timeoutMs, maxStdout, maxStderr, options.signal);

  if (!options.keepTempFile) {
    // Fire-and-forget -- OneDrive + Windows can briefly hold files open.
    // Leaking a kilobyte in tmpdir() is acceptable vs. delaying the result.
    unlink(tempPath).catch(() => undefined);
  }

  return result;
}

/**
 * Low-level spawn + output collection. Split out so a future
 * `runPowerShellFile` overload (Phase 4, once scripts live in
 * `scripts/ps/*.ps1`) can reuse the same state machine.
 */
function spawnAndCollect(
  scriptPath: string,
  timeoutMs: number,
  maxStdout: number,
  maxStderr: number,
  signal: AbortSignal | undefined,
): Promise<PSResult> {
  return new Promise((resolve) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const dropped: PSDroppedBytes = { stdout: 0, stderr: 0 };
    let settled = false;

    const child = spawn("powershell", [...PS_DEFAULT_ARGS, scriptPath], { signal });

    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            if (settled) return;
            try {
              child.kill("SIGKILL");
            } catch {
              /* ignore -- process may already be gone */
            }
            settle(
              fail(
                "timeout",
                `PowerShell script exceeded ${timeoutMs}ms timeout.`,
                null,
                decode(stdoutChunks),
                decode(stderrChunks),
                dropped,
              ),
            );
          }, timeoutMs)
        : null;

    child.stdout?.on("data", (chunk: Buffer) => {
      const remaining = maxStdout - stdoutBytes;
      if (remaining <= 0) {
        dropped.stdout += chunk.length;
        return;
      }
      if (chunk.length <= remaining) {
        stdoutChunks.push(chunk);
        stdoutBytes += chunk.length;
      } else {
        stdoutChunks.push(chunk.subarray(0, remaining));
        stdoutBytes += remaining;
        dropped.stdout += chunk.length - remaining;
      }
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const remaining = maxStderr - stderrBytes;
      if (remaining <= 0) {
        dropped.stderr += chunk.length;
        return;
      }
      if (chunk.length <= remaining) {
        stderrChunks.push(chunk);
        stderrBytes += chunk.length;
      } else {
        stderrChunks.push(chunk.subarray(0, remaining));
        stderrBytes += remaining;
        dropped.stderr += chunk.length - remaining;
      }
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.name === "AbortError") {
        settle(
          fail("aborted", "PowerShell run aborted.", null, decode(stdoutChunks), decode(stderrChunks), dropped),
        );
        return;
      }
      settle(
        fail(
          "spawn-failed",
          `Failed to spawn PowerShell: ${err.message}`,
          null,
          decode(stdoutChunks),
          decode(stderrChunks),
          dropped,
        ),
      );
    });

    child.on("close", (code) => {
      const stdout = decode(stdoutChunks) + truncNote(dropped.stdout);
      const stderr = decode(stderrChunks) + truncNote(dropped.stderr);

      if (code === 0) {
        // Preserve the legacy "ERROR:..." sentinel used by current call
        // sites so Phase 4 can migrate one file at a time without rewriting
        // the scripts. Surface as protocol-error.
        const trimmed = stdout.trim();
        if (trimmed.startsWith("ERROR:")) {
          settle(
            fail(
              "protocol-error",
              trimmed.slice("ERROR:".length).trim() || "PowerShell reported ERROR.",
              0,
              stdout,
              stderr,
              dropped,
            ),
          );
          return;
        }
        settle({ ok: true, code: 0, stdout, stderr, droppedBytes: dropped });
        return;
      }

      settle(
        fail(
          "exit-nonzero",
          `PowerShell exited with code ${code}. ${stderr.trim() || stdout.trim() || "(no output)"}`,
          code ?? null,
          stdout,
          stderr,
          dropped,
        ),
      );
    });

    function settle(result: PSResult) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    }
  });
}

function decode(chunks: Buffer[]): string {
  return chunks.length === 0 ? "" : Buffer.concat(chunks).toString("utf8");
}

function truncNote(bytes: number): string {
  return bytes > 0 ? `\n[...${bytes} bytes truncated]` : "";
}

function fail(
  reason: PSFailureReason,
  message: string,
  code: number | null,
  stdout = "",
  stderr = "",
  droppedBytes: PSDroppedBytes = { stdout: 0, stderr: 0 },
): PSResult {
  return { ok: false, reason, message, code, stdout, stderr, droppedBytes };
}
