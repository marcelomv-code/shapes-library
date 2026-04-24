/**
 * Resolves bundled PowerShell script files.
 *
 * Runtime .ps1 files live under `assets/ps/` -- Raycast's build pipeline
 * bundles the `assets/` tree alongside the JS output, and `environment.assetsPath`
 * points to that tree at both dev (`ray develop`) and install time
 * (Raycast Store). Folder-level deviation from the Phase 4 plan text
 * (`scripts/ps/*.ps1`): `scripts/` is dev-only and is NOT shipped with the
 * extension, so scripts there would be missing at runtime. `assets/ps/` is
 * the only correct home for runtime-needed PS files in a Raycast extension.
 *
 * All scripts in `assets/ps/` ship with a UTF-8 BOM so PS 5.1 parses them
 * as UTF-8 rather than the active ANSI codepage (cp1252). Parameters are
 * passed via standard PS `param()` blocks; the runner forwards named args
 * after the `-File <path>` switch.
 */

import { environment } from "@raycast/api";
import { join } from "path";

/**
 * Enumerated script names. Narrowing the type prevents typos at call sites
 * (and makes a `grep "PsScriptName"` list of all known scripts trivial).
 */
export type PsScriptName =
  | "insert-active"
  | "unzip"
  | "export-library"
  | "import-library"
  | "copy-via-powerpoint"
  | "extract-selected-shape"
  | "ensure-deck"
  | "add-shape-to-deck"
  | "copy-from-deck"
  | "insert-from-deck"
  | "export-pptx-to-png"
  | "inspect-zip"
  | "compact-deck";

/**
 * Absolute path to a bundled .ps1 script. Caller passes the raw base name
 * (no extension) and this resolves it under `environment.assetsPath/ps/`.
 */
export function resolvePsScript(name: PsScriptName): string {
  return join(environment.assetsPath, "ps", `${name}.ps1`);
}
