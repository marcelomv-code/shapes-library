/**
 * Type contracts for the PowerShell runner infrastructure.
 *
 * These types are consumed by `runner.ts` and re-exported from the barrel
 * `index.ts`. They exist so that call sites can adopt a strict, consistent
 * shape for PS invocations instead of hand-rolling `spawn("powershell", ...)`
 * in every file.
 *
 * Scaffolding only — no callers consume these yet. Migration happens in
 * Phase 4 (extract inline scripts to `scripts/ps/*.ps1`).
 */

/**
 * Options accepted by the PowerShell runner. All fields are optional.
 */
export interface PSRunOptions {
  /**
   * Hard kill the PS process after this many milliseconds.
   * Defaults to 60_000 (60s). Use `0` to disable (not recommended).
   */
  timeoutMs?: number;

  /**
   * Forwarded to `child_process.spawn` to cooperatively abort the run.
   * When aborted, the runner resolves with `{ok: false, reason: "aborted"}`.
   */
  signal?: AbortSignal;

  /**
   * Filename prefix used when materializing the temp `.ps1` file on disk.
   * The runner appends `-${Date.now()}.ps1`. Defaults to `ps-run`.
   */
  tempPrefix?: string;

  /**
   * Max bytes of stdout to retain in memory. Excess is discarded.
   * Defaults to 5 * 1024 * 1024 (5 MiB). Guards against runaway output.
   */
  maxStdoutBytes?: number;

  /**
   * Max bytes of stderr to retain. Defaults to 1 * 1024 * 1024 (1 MiB).
   */
  maxStderrBytes?: number;

  /**
   * When true, keep the temp `.ps1` file on disk after the run (for debugging).
   * Defaults to false.
   */
  keepTempFile?: boolean;
}

/**
 * Reasons a run may fail without producing a process exit code.
 */
export type PSFailureReason =
  | "unsupported-platform" // non-Windows host
  | "spawn-failed" // spawn error event (PATH / permissions)
  | "timeout" // exceeded options.timeoutMs
  | "aborted" // AbortSignal fired
  | "write-failed" // writing the temp .ps1 failed
  | "exit-nonzero" // process exited with non-zero code
  | "protocol-error"; // stdout tagged ERROR: or no usable payload

/**
 * Structured result of a PS run. Always resolves — never rejects —
 * so callers can use `if (!result.ok)` without try/catch noise.
 */
export type PSResult =
  | {
      ok: true;
      stdout: string;
      stderr: string;
      code: 0;
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
    };
