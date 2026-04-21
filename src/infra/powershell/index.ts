/**
 * Barrel export for the PowerShell infrastructure module.
 *
 * Call sites should import from here (not from individual files):
 *   import { runPowerShellScript, psPath } from "@/infra/powershell";
 *
 * Scaffolding landed in Phase 3; call-site migration happens in Phase 4.
 */

export { runPowerShellScript, PS_DEFAULT_ARGS } from "./runner";
export { psSingleQuote, psPath, encodePSCommand } from "./escape";
export type { PSRunOptions, PSResult, PSFailureReason } from "./types";
