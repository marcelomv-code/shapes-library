/**
 * Centralized PowerShell runner.
 *
 * Today every PS invocation in this extension repeats the same pattern:
 *   1) write script to tmpdir() as `*.ps1`
 *   2) spawn powershell with -NoProfile -NonInteractive -ExecutionPolicy Bypass -File
 *   3) buffer stdout/stderr
 *   4) unlink the temp file in a `done()` closure
 *   5) map exit code / "ERROR:" prefix to a thrown Error
 *
 * This module implements that pattern once, adds hardening (timeout,
 * AbortSignal, output caps, NUL-stripping, explicit protocol errors),
 * and returns a discriminated-union result so callers do not have to
 * wrap every call in try/catch.
 *
 * Scaffolding only in Phase 3 — no existing file imports this yet.
 * Phase 4 will migrate the six current call sites:
 *   - src/extractor/windowsExtractor.ts
 *   - src/generator/pptxGenerator.ts
 *   - src/import-library.tsx
 *   - src/shape-picker.tsx (x3)
 *   - src/utils/deck.ts
 *   - src/utils/previewGenerator.ts
 */

import { spawn } from "child_process";
import { randomBytes } from "crypto";
import { unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import type { PSFailureReason, PSResult, PSRunOptions } from "./types";

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_STDOUT = 5 * 1024 * 1024;
const DEFAULT_MAX_STDERR = 1 * 1024 * 1024;

/**
 * Standard args passed to every PS spawn. Kept as a constant so that
 * Phase 4 migrations have a single point of truth; call sites MUST NOT
 * build their own arg arrays.
 */
export const PS_DEFAULT_ARGS = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File"] as const;

/**
 * Execute a PowerShell script string. Materializes to a temp `.ps1` file
 * first (matches current call-site behavior and gives useful error lines),
 * spawns `powershell.exe`, and tears the file down on completion.
 *
 * This function NEVER rejects. Check `result.ok`.
 */
export async function runPowerShellScript(script: string, options: PSRunOptions = {}): Promise<PSResult> {
  if (process.platform !== "win32") {
    return fail("unsupported-platform", "PowerShell is only available on Windows hosts.", null);
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxStdout = options.maxStdoutBytes ?? DEFAULT_MAX_STDOUT;
  const maxStderr = options.maxStderrBytes ?? DEFAULT_MAX_STDERR;
  const prefix = options.tempPrefix ?? "ps-run";

  // Include a short random suffix so concurrent runs never collide on the
  // same temp path (Date.now() alone is not unique enough under load).
  const suffix = randomBytes(4).toString("hex");
  const tempPath = join(tmpdir(), `${prefix}-${Date.now()}-${suffix}.ps1`);

  try {
    await writeFile(tempPath, script, { encoding: "utf8" });
  } catch (err) {
    return fail(
      "write-failed",
      `Failed to write temp PS script: ${(err as Error).message}`,
      null,
    );
  }

  const result = await spawnAndCollect(tempPath, timeoutMs, maxStdout, maxStderr, options.signal);

  if (!options.keepTempFile) {
    // Deliberately ignore unlink errors — OneDrive + Windows can briefly
    // hold the file open. Leaking a kilobyte in tmpdir() is acceptable.
    unlink(tempPath).catch(() => undefined);
  }

  return result;
}

/**
 * Low-level spawn + output collection. Split out so it can be reused by a
 * future `runPowerShellFile` overload (Phase 4, once scripts live in
 * `scripts/ps/*.ps1` and are invoked by path instead of materialized).
 */
function spawnAndCollect(
  scriptPath: string,
  timeoutMs: number,
  maxStdout: number,
  maxStderr: number,
  signal: AbortSignal | undefined,
): Promise<PSResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let stdoutDropped = 0;
    let stderrDropped = 0;
    let settled = false;

    const child = spawn("powershell", [...PS_DEFAULT_ARGS, scriptPath], { signal });

    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            if (settled) return;
            try {
              child.kill("SIGKILL");
            } catch {
              /* ignore */
            }
            settle(fail("timeout", `PowerShell script exceeded ${timeoutMs}ms timeout.`, null, stdout, stderr));
          }, timeoutMs)
        : null;

    child.stdout?.on("data", (chunk: Buffer) => {
      const remaining = maxStdout - stdout.length;
      if (remaining <= 0) {
        stdoutDropped += chunk.length;
        return;
      }
      stdout += chunk.toString("utf8", 0, Math.min(chunk.length, remaining));
      if (chunk.length > remaining) stdoutDropped += chunk.length - remaining;
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const remaining = maxStderr - stderr.length;
      if (remaining <= 0) {
        stderrDropped += chunk.length;
        return;
      }
      stderr += chunk.toString("utf8", 0, Math.min(chunk.length, remaining));
      if (chunk.length > remaining) stderrDropped += chunk.length - remaining;
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.name === "AbortError") {
        settle(fail("aborted", "PowerShell run aborted.", null, stdout, stderr));
        return;
      }
      settle(fail("spawn-failed", `Failed to spawn PowerShell: ${err.message}`, null, stdout, stderr));
    });

    child.on("close", (code) => {
      if (stdoutDropped > 0) stdout += `\n[...${stdoutDropped} bytes truncated]`;
      if (stderrDropped > 0) stderr += `\n[...${stderrDropped} bytes truncated]`;

      if (code === 0) {
        // Preserve the legacy "ERROR:..." sentinel used by current call sites.
        // If a Phase 4 migration still emits it, surface as protocol-error.
        const trimmed = stdout.trim();
        if (trimmed.startsWith("ERROR:")) {
          settle(
            fail("protocol-error", trimmed.slice("ERROR:".length).trim() || "PowerShell reported ERROR.", 0, stdout, stderr),
          );
          return;
        }
        settle({ ok: true, code: 0, stdout, stderr });
        return;
      }

      settle(
        fail(
          "exit-nonzero",
          `PowerShell exited with code ${code}. ${stderr.trim() || stdout.trim() || "(no output)"}`,
          code ?? null,
          stdout,
          stderr,
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

function fail(
  reason: PSFailureReason,
  message: string,
  code: number | null,
  stdout = "",
  stderr = "",
): PSResult {
  return { ok: false, reason, message, code, stdout, stderr };
}
