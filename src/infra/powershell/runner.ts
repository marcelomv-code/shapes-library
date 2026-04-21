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
 * Phase 4 adds `runPowerShellFile` for bundled scripts under `assets/ps/`.
 * Call sites use RELATIVE imports (path alias `@/` is not wired up in the
 * Raycast bundler):
 *   import { runPowerShellFile, resolvePsScript } from "../infra/powershell";
 */

import { spawn } from "child_process";
import { randomBytes } from "crypto";
import { access, unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import type { PSDroppedBytes, PSFailureReason, PSResult, PSRunOptions } from "./types";

/**
 * Parameter value passed to a .ps1 `param()` block. Booleans are converted
 * to PS switch syntax (`-Foo` with no value when true, omitted when false).
 * `null`/`undefined` values are skipped so call sites can pass optional
 * args without conditional arg-array building.
 */
export type PSParamValue = string | number | boolean | null | undefined;

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
 * Execute a pre-existing `.ps1` file with named parameters. The file is
 * expected to live under `assets/ps/` (use `resolvePsScript` to build the
 * absolute path) and to start with a `param(...)` block that accepts the
 * keys in `params`.
 *
 * `params` values are serialized as `-<Name> <value>` pairs appended after
 * `-File <scriptPath>`. Booleans render as PS switch flags: `true` emits
 * `-Name` (switch present), `false` omits the arg (switch absent). Strings
 * are passed verbatim -- PowerShell receives them as separate argv entries
 * so no escaping of quotes/spaces is needed (no shell interpolation).
 *
 * Unlike `runPowerShellScript`, this does NOT write a temp file or prepend
 * a BOM -- the .ps1 in `assets/ps/` already ships with its BOM, so there's
 * no encoding issue. It also means the line numbers in error messages
 * point at the real script, not a tmpdir copy.
 *
 * NEVER rejects. Check `result.ok`.
 */
export async function runPowerShellFile(
  scriptPath: string,
  params: Record<string, PSParamValue> = {},
  options: PSRunOptions = {},
): Promise<PSResult> {
  if (process.platform !== "win32") {
    return fail("unsupported-platform", "PowerShell is only available on Windows hosts.", null);
  }

  if (typeof scriptPath !== "string" || scriptPath.trim().length === 0) {
    return fail("invalid-input", "runPowerShellFile requires a non-empty scriptPath.", null);
  }

  try {
    await access(scriptPath);
  } catch {
    // Surface as invalid-input rather than spawn-failed -- the runner's
    // contract says spawn-failed means PATH/permissions, not "the
    // caller-supplied path doesn't exist". This also lets callers choose
    // between "script missing" (likely a packaging bug) and "PS failed".
    return fail("invalid-input", `PS script not found: ${scriptPath}`, null);
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxStdout = options.maxStdoutBytes ?? DEFAULT_MAX_STDOUT;
  const maxStderr = options.maxStderrBytes ?? DEFAULT_MAX_STDERR;

  const extraArgs: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "boolean") {
      if (value) extraArgs.push(`-${key}`);
      continue;
    }
    extraArgs.push(`-${key}`, String(value));
  }

  return spawnAndCollect(scriptPath, timeoutMs, maxStdout, maxStderr, options.signal, extraArgs);
}

/**
 * Low-level spawn + output collection. Shared state machine for both
 * `runPowerShellScript` (temp-file path) and `runPowerShellFile`
 * (bundled-asset path). `extraArgs` are appended after the `-File` arg
 * for the file-based overload; the script-based overload passes `[]`.
 */
function spawnAndCollect(
  scriptPath: string,
  timeoutMs: number,
  maxStdout: number,
  maxStderr: number,
  signal: AbortSignal | undefined,
  extraArgs: readonly string[] = [],
): Promise<PSResult> {
  return new Promise((resolve) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const dropped: PSDroppedBytes = { stdout: 0, stderr: 0 };
    let settled = false;

    const child = spawn("powershell", [...PS_DEFAULT_ARGS, scriptPath, ...extraArgs], { signal });

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
