/**
 * Type contracts for the PowerShell runner infrastructure.
 *
 * Consumed by `runner.ts` and re-exported from the barrel `index.ts`.
 * Call sites should adopt these types instead of hand-rolling
 * `spawn("powershell", ...)` in every file.
 *
 * Scaffolding only -- Phase 4 migrates the 8 existing spawn invocations
 * (across 7 files) to `runPowerShellScript`.
 */

/**
 * Options accepted by the PowerShell runner. All fields are optional.
 */
export interface PSRunOptions {
  /**
   * Hard-kill the PS process after this many milliseconds.
   * Defaults to 60_000 (60s). Use `0` to disable (not recommended).
   */
  timeoutMs?: number;

  /**
   * Forwarded to `child_process.spawn` to cooperatively abort the run.
   * When aborted, the runner resolves with `{ok: false, reason: "aborted"}`.
   */
  signal?: AbortSignal;

  /**
   * Filename prefix for the temp `.ps1`. The runner appends
   * `-${Date.now()}-${random}.ps1`. Defaults to `ps-run`.
   */
  tempPrefix?: string;

  /**
   * Max bytes of stdout to retain. Excess is discarded but counted in
   * `droppedBytes.stdout` in the result for observability.
   * Defaults to 5 * 1024 * 1024 (5 MiB). Guards against runaway output.
   */
  maxStdoutBytes?: number;

  /**
   * Max bytes of stderr to retain. Defaults to 1 * 1024 * 1024 (1 MiB).
   */
  maxStderrBytes?: number;

  /**
   * When true, keep the temp `.ps1` file on disk after the run.
   * Useful for debugging. Defaults to false.
   */
  keepTempFile?: boolean;
}

/**
 * Reasons a run may fail without producing a process exit code.
 */
export type PSFailureReason =
  | "unsupported-platform" // non-Windows host
  | "invalid-input" // empty/whitespace-only script, etc.
  | "spawn-failed" // spawn error event (PATH / permissions)
  | "timeout" // exceeded options.timeoutMs
  | "aborted" // AbortSignal fired
  | "write-failed" // writing the temp .ps1 failed
  | "exit-nonzero" // process exited with non-zero code
  | "protocol-error"; // stdout tagged "ERROR:" (legacy sentinel)

/**
 * Bytes dropped when output exceeded max*Bytes caps. Useful for surfacing
 * "output truncated" warnings in the UI layer without re-reading logs.
 */
export interface PSDroppedBytes {
  stdout: number;
  stderr: number;
}

/**
 * Discriminated-union result of a PS run. Always resolves -- never rejects --
 * so callers use `if (!result.ok)` without try/catch.
 *
 * Strings are decoded as UTF-8. Callers that expect a non-UTF-8 console
 * encoding must override Console.OutputEncoding inside the script itself
 * (e.g. `[Console]::OutputEncoding = [Text.UTF8Encoding]::new()`).
 */
export type PSResult =
  | {
      ok: true;
      stdout: string;
      stderr: string;
      code: 0;
      droppedBytes: PSDroppedBytes;
    }
  | {
      ok: false;
      reason: PSFailureReason;
      /** Human-readable message, safe to surface in UI toasts. */
      message: string;
      /** Process exit code when available (null for pre-spawn failures). */
      code: number | null;
      stdout: string;
      stderr: string;
      droppedBytes: PSDroppedBytes;
    };
