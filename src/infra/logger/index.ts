/**
 * Phase 14 — logger barrel. Re-exports the surface callers should use.
 * Keep this file tiny; direct imports of `redact.ts`/`logger.ts` are fine
 * but the barrel prevents churn if the internal layout moves later.
 */
export { createLogger, setLogSink, resetLogSink } from "./logger";
export type { Logger, LogLevel, LogSink } from "./logger";
export { redactString, redactValue, redactArgs, REDACTED } from "./redact";
