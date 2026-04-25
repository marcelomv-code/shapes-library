/**
 * Phase 15 — centralised temp file + directory lifecycle manager.
 *
 * Before this module existed, temp files were created ad-hoc across
 * `pptxGenerator.ts` (shape pptx files), `import-library.tsx` (zip
 * extraction staging) and `powershell/runner.ts` (script dumps). Only
 * `pptxGenerator` tracked and cleaned up its leaks; the import path
 * leaked one temp directory per import forever.
 *
 * The manager keeps a module-level `Set<string>` of tracked paths, a
 * pluggable timer so tests can fast-forward scheduled cleanups, and
 * a pure `buildTempName` helper that every consumer funnels through.
 * Cleanup is tolerant of missing files (race with external deletion)
 * and recursive when the tracked path is a directory.
 *
 * Consumers that do not care about tracking (e.g. the PS runner, which
 * has its own tight-loop cleanup) can still call `buildTempName`
 * standalone — it is a pure string function.
 */

import { existsSync, rmSync, statSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createLogger } from "../logger";

const log = createLogger("TempManager");

/**
 * Injectable timer contract. Matches the subset of the node `setTimeout`
 * surface we use. Tests replace it with an immediate scheduler so
 * `scheduleCleanup` becomes synchronous.
 */
export type TimerFn = (callback: () => void, delayMs: number) => unknown;

/** Set of paths currently eligible for `cleanupAllTemps`. */
const tracked: Set<string> = new Set();

/** Counter breaks ties when two paths are requested in the same ms. */
let counter = 0;

let activeTimer: TimerFn = (cb, delayMs) => setTimeout(cb, delayMs);

/**
 * Replace the scheduling implementation. Returns the previous one so
 * tests can restore it in `afterEach`. Process-wide, not per-call.
 */
export function setTimerFn(fn: TimerFn): TimerFn {
  const previous = activeTimer;
  activeTimer = fn;
  return previous;
}

/** Reset the timer to the default `setTimeout`-backed impl. */
export function resetTimerFn(): void {
  activeTimer = (cb, delayMs) => setTimeout(cb, delayMs);
}

/**
 * Compose a unique path under `tmpdir()`. Pure — does NOT create the
 * file, touch disk, or track the path. Callers that want tracking call
 * `trackTemp` afterward or use `writeTempFile`.
 *
 * Format: `<prefix>_<timestamp>-<counter>[.<ext>]`. The monotonic
 * counter guarantees uniqueness within the same ms tick.
 */
export function buildTempName(prefix: string, ext?: string): string {
  // Replace unsafe chars with `_`, collapse runs, trim leading/trailing
  // `_`. An all-unsafe input (e.g. "///") collapses to "" and falls back
  // to "tmp" so callers never produce underscore-only prefixes.
  const safePrefix =
    prefix
      .replace(/[^A-Za-z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "") || "tmp";
  counter = (counter + 1) % 1_000_000;
  const suffix = ext ? `.${ext.replace(/^\.+/, "")}` : "";
  return join(tmpdir(), `${safePrefix}_${Date.now()}-${counter}${suffix}`);
}

/** Register an existing path for later cleanup. Idempotent. */
export function trackTemp(path: string): void {
  tracked.add(path);
}

/** Remove the path from tracking without deleting it from disk. */
export function untrackTemp(path: string): void {
  tracked.delete(path);
}

/**
 * Write `data` to a fresh temp path and track it. Returns the path.
 * Use for files that must exist before the path is handed to another
 * process (e.g. PowerPoint open).
 */
export function writeTempFile(prefix: string, ext: string, data: Buffer | string): string {
  const path = buildTempName(prefix, ext);
  writeFileSync(path, data);
  tracked.add(path);
  return path;
}

/**
 * Create a fresh directory under tmpdir and track it. The directory
 * exists on return; callers can populate it freely. Cleanup removes
 * the directory AND its contents recursively.
 */
export function createTempDir(prefix: string): string {
  const path = buildTempName(prefix);
  mkdirSync(path, { recursive: true });
  tracked.add(path);
  return path;
}

/**
 * Schedule a cleanup `delayMs` in the future. The returned handle is
 * whatever `activeTimer` returns (node Timeout or test stub). Pending
 * timers hold the process alive — callers can wrap with
 * `.unref?.()` if they do not want that.
 */
export function scheduleCleanup(path: string, delayMs: number): unknown {
  return activeTimer(() => cleanupTemp(path), delayMs);
}

/**
 * Remove the tracked path (file OR directory). Swallows
 * not-found and busy errors — the file may still be open by
 * another process (PowerPoint holds the pptx a few seconds after
 * insertion). Logs failures via the scoped logger; never throws.
 */
export function cleanupTemp(path: string): void {
  try {
    if (!existsSync(path)) {
      tracked.delete(path);
      return;
    }
    const isDir = statSync(path).isDirectory();
    rmSync(path, { recursive: isDir, force: true, maxRetries: 0 });
    tracked.delete(path);
  } catch (error) {
    log.error(`Failed to cleanup temp: ${path}`, error);
  }
}

/** Clean up every tracked path. Best-effort — continues past errors. */
export function cleanupAllTemps(): void {
  for (const path of Array.from(tracked)) {
    cleanupTemp(path);
  }
}

/** Current tracked-path count. Mostly for tests and diagnostics. */
export function getActiveTempCount(): number {
  return tracked.size;
}

/**
 * Test-only: drop tracking without touching disk. Paired with
 * `resetTimerFn` in `afterEach` blocks to restore a clean state.
 */
export function __resetTrackingForTests(): void {
  tracked.clear();
  counter = 0;
}
