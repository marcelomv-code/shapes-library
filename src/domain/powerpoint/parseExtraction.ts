/**
 * Pure parser for the PowerShell extract-selected-shape.ps1 stdout contract.
 *
 * Phase 11 lifted this out of `WindowsComPowerPointClient.captureSelectedShape`
 * so it can be exercised by fixture-driven contract tests with zero PowerShell,
 * COM, or filesystem dependencies.
 *
 * The PS script emits a mix of:
 *   - STEP* progress breadcrumbs on stdout (plain text, ignored by us)
 *   - A single compressed JSON object on a line starting with `{`
 *   - On failure: a line prefixed with `ERROR:`
 *
 * These helpers translate that text into domain types without touching the
 * runner or any side-effecting API.
 */
import type { ExtractedShape } from "./types";

/**
 * Shape of the JSON object produced by extract-selected-shape.ps1.
 * All fields are optional because the script only emits the ones that
 * apply to the selected shape (fill/line are skipped for pictures and
 * groups, adjustments may be empty, nativePptxRelPath only appears on
 * successful save, etc).
 */
export interface RawExtractionJson {
  name?: string;
  type?: number;
  autoShapeName?: string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  rotation?: number;
  adjustments?: number[];
  nativePptxRelPath?: string;
  isGroup?: boolean;
  isPicture?: boolean;
  pngTempPath?: string;
  fillColor?: string;
  fillTransparency?: number;
  lineColor?: string;
  lineWeight?: number;
  lineTransparency?: number;
}

/**
 * Discriminated-union result of stdout parsing. Mirrors the three branches
 * the adapter used to handle inline: (1) success, (2) explicit ERROR: line,
 * (3) missing/invalid JSON.
 */
export type ExtractionParseResult =
  | { ok: true; shape: ExtractedShape }
  | { ok: false; reason: "error-line"; error: string }
  | { ok: false; reason: "no-json"; error: string }
  | { ok: false; reason: "invalid-json"; error: string };

/**
 * Find the first `ERROR:<msg>` line in stdout and return the message part
 * (with the `ERROR:` prefix stripped). Returns undefined when absent.
 *
 * Kept as a separate export because the adapter's failure branch (timeout,
 * non-zero exit) uses it without going through full JSON parsing.
 */
export function findErrorLine(stdout: string): string | undefined {
  const errLine = stdout
    .trim()
    .split("\n")
    .find((l) => l.trim().startsWith("ERROR:"));
  if (!errLine) return undefined;
  return errLine.trim().replace(/^ERROR:/, "");
}

/**
 * Find the first line in stdout that starts with `{`. The PS script emits
 * exactly one such line per successful run (compressed JSON).
 */
function findJsonLine(stdout: string): string | undefined {
  return stdout
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith("{"));
}

/**
 * Convert the raw PS-emitted JSON object into an ExtractedShape, applying
 * the same defaults the adapter used inline (name -> "Unnamed", type -> 1,
 * rotation -> 0, width/height -> 2, position -> 1/1, lineWeight -> 1).
 */
export function mapExtractionData(data: RawExtractionJson): ExtractedShape {
  return {
    name: typeof data.name === "string" && data.name.length > 0 ? data.name : "Unnamed",
    type: typeof data.type === "number" ? data.type : 1,
    autoShapeName: typeof data.autoShapeName === "string" ? data.autoShapeName : undefined,
    position: {
      x: typeof data.left === "number" ? data.left : 1,
      y: typeof data.top === "number" ? data.top : 1,
    },
    size: {
      width: typeof data.width === "number" ? data.width : 2,
      height: typeof data.height === "number" ? data.height : 2,
    },
    rotation: typeof data.rotation === "number" ? data.rotation : 0,
    adjustments: Array.isArray(data.adjustments) ? data.adjustments : undefined,
    nativePptxRelPath: typeof data.nativePptxRelPath === "string" ? data.nativePptxRelPath : undefined,
    isGroup: data.isGroup === true,
    isPicture: data.isPicture === true,
    pngTempPath: typeof data.pngTempPath === "string" ? data.pngTempPath : undefined,
    fill: {
      color: typeof data.fillColor === "string" ? data.fillColor : undefined,
      transparency: typeof data.fillTransparency === "number" ? data.fillTransparency : undefined,
    },
    line: {
      color: typeof data.lineColor === "string" ? data.lineColor : undefined,
      weight: typeof data.lineWeight === "number" ? data.lineWeight : 1,
      transparency: typeof data.lineTransparency === "number" ? data.lineTransparency : undefined,
    },
  };
}

/**
 * Parse the full stdout blob produced by extract-selected-shape.ps1 and
 * return a discriminated-union result. Priority order matches the legacy
 * adapter: explicit `ERROR:` line wins, then the `{` JSON line, then a
 * "no JSON" failure. Invalid JSON surfaces as `invalid-json`.
 */
export function parseExtractionStdout(stdout: string): ExtractionParseResult {
  const err = findErrorLine(stdout);
  if (err !== undefined) {
    return { ok: false, reason: "error-line", error: err };
  }

  const jsonLine = findJsonLine(stdout);
  if (!jsonLine) {
    return { ok: false, reason: "no-json", error: "No JSON data in PowerShell output" };
  }

  let data: RawExtractionJson;
  try {
    data = JSON.parse(jsonLine) as RawExtractionJson;
  } catch (e) {
    return { ok: false, reason: "invalid-json", error: `Failed to parse JSON: ${e}` };
  }

  return { ok: true, shape: mapExtractionData(data) };
}
