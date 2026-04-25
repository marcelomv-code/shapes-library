/**
 * Barrel export for the PowerShell infrastructure module.
 *
 * Call sites import via RELATIVE path -- the repo does not enable the
 * tsconfig `@/*` alias at bundle time (Raycast's `ray build` uses its own
 * bundler, and no current import uses `@/`):
 *
 *   import { runPowerShellFile, resolvePsScript } from "../infra/powershell";
 *
 * Phase 4 migrated the 8 existing spawn("powershell", ...) invocations
 * (across 7 files) to `runPowerShellFile` + bundled scripts in `assets/ps/`.
 * The legacy `runPowerShellScript` entrypoint remains for ad-hoc PS strings
 * (e.g. future migrations that haven't promoted a script to `assets/ps/` yet).
 */

export { runPowerShellScript, runPowerShellFile, PS_DEFAULT_ARGS } from "./runner";
export type { PSParamValue } from "./runner";
export { psSingleQuote, psPath, encodePSCommand } from "./escape";
export { resolvePsScript } from "./scripts";
export type { PsScriptName } from "./scripts";
export type { PSRunOptions, PSResult, PSFailureReason, PSDroppedBytes } from "./types";
