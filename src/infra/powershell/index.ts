/**
 * Barrel export for the PowerShell infrastructure module.
 *
 * Call sites import via RELATIVE path -- the repo does not enable the
 * tsconfig `@/*` alias at bundle time (Raycast's `ray build` uses its own
 * bundler, and no current import uses `@/`):
 *
 *   import { runPowerShellScript, psPath } from "../infra/powershell";
 *
 * Phase 4 migrates the 8 existing spawn("powershell", ...) invocations
 * (across 7 files) to use this module.
 */

export { runPowerShellScript, PS_DEFAULT_ARGS } from "./runner";
export { psSingleQuote, psPath, encodePSCommand } from "./escape";
export type { PSRunOptions, PSResult, PSFailureReason, PSDroppedBytes } from "./types";
