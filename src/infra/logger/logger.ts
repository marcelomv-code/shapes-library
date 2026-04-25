/**
 * Phase 14 — scoped logger that redacts PII before anything reaches console.*.
 *
 * Usage:
 *
 *     import { createLogger } from "../infra/logger";
 *     const log = createLogger("Import");
 *     log.info("root=%s", root);
 *     log.error("Import failed:", err);
 *
 * Each log line is prefixed with `[<scope>]` so the output matches the ad-hoc
 * `[Export] ...` / `[Import] ...` conventions the codebase already uses — no
 * grep muscle memory needs to change.
 *
 * The logger is intentionally thin: no log shipping, no level filtering, no
 * structured fields. That's scope for a later phase; Phase 14's goal is to
 * close the PII-leak hole, not to build Winston.
 */

import { redactArgs } from "./redact";

/** Log levels we surface. Everything maps onto a matching `console.*` call. */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Public shape of a scoped logger. Matches the subset of `console.*` we
 * actually use in the codebase today; adding new methods later means adding
 * new sinks here, which is exactly the point of the indirection.
 */
export interface Logger {
  readonly scope: string;
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

/**
 * Sink abstraction. Tests substitute this with a capturing sink so they can
 * assert on the redacted payloads without mocking `console`.
 */
export interface LogSink {
  debug(args: unknown[]): void;
  info(args: unknown[]): void;
  warn(args: unknown[]): void;
  error(args: unknown[]): void;
}

/**
 * Default sink forwards to `console.*`. Raycast surfaces these in the dev
 * console during `ray develop` and swallows them at install time, which is
 * exactly what we want.
 */
const consoleSink: LogSink = {
  debug: (args) => console.debug(...args),
  info: (args) => console.log(...args),
  warn: (args) => console.warn(...args),
  error: (args) => console.error(...args),
};

let activeSink: LogSink = consoleSink;

/**
 * Swap the sink at runtime. Returns the previous sink so tests can restore it.
 * Process-wide state, not per-logger — callers should use `afterEach` to reset.
 */
export function setLogSink(sink: LogSink): LogSink {
  const previous = activeSink;
  activeSink = sink;
  return previous;
}

/** Restore the default console sink (idempotent). */
export function resetLogSink(): void {
  activeSink = consoleSink;
}

/**
 * Create a logger bound to a scope. Every emitted line is prefixed with
 * `[<scope>]` and every argument — strings, objects, Errors — is run through
 * `redactArgs` before it reaches the sink.
 */
export function createLogger(scope: string): Logger {
  const prefix = `[${scope}]`;
  const emit = (level: LogLevel, args: unknown[]): void => {
    // redactArgs is a shallow copy; prepending `prefix` is safe.
    const sanitized = [prefix, ...redactArgs(args)];
    activeSink[level](sanitized);
  };
  return {
    scope,
    debug: (...args) => emit("debug", args),
    info: (...args) => emit("info", args),
    warn: (...args) => emit("warn", args),
    error: (...args) => emit("error", args),
  };
}
