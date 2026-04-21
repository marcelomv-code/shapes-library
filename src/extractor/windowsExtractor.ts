/**
 * Windows PowerPoint shape extractor using COM automation.
 *
 * Phase 4: script body now lives at assets/ps/extract-selected-shape.ps1
 * and is invoked via runPowerShellFile. The STEP*-tagged stdout lines are
 * still emitted by the script and collected here for the UI log panel;
 * because result.stdout is buffered (not streamed), the kill-timer
 * extension trick from Phase 3 is no longer needed -- timeouts now live
 * on the runner via PSRunOptions.timeoutMs.
 */

import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { ExtractedShape, ExtractionResult } from "./types";
import { getPreferenceValues } from "@raycast/api";
import { getNativeDir, getLibraryRoot } from "../utils/paths";
import { runPowerShellFile, resolvePsScript } from "../infra/powershell";

/**
 * Extract selected shape from PowerPoint (reliable spawn approach)
 */
export async function extractSelectedShapeWindows(): Promise<ExtractionResult> {
  const prefs = getPreferenceValues<{ skipNativeSave?: boolean; templatePath?: string }>();
  // Prepare native output path inside Raycast assets
  const supportPath = getLibraryRoot();
  const nativeDir = getNativeDir();
  try {
    if (!existsSync(nativeDir)) mkdirSync(nativeDir, { recursive: true });
  } catch {}
  const ts = Date.now();
  const relNative = `native/shape_captured_${ts}.pptx`;
  const absNative = join(supportPath, "native", `shape_captured_${ts}.pptx`);
  const templatePath = prefs.templatePath?.trim() || "";

  // Phase 4: 60s cap matches the Phase 3 runner default and is plenty for
  // the worst observed COM round-trip (template open + save-as ~ 20s on
  // cold PowerPoint). The old inline code ramped 30s -> 45s -> 60s based
  // on streaming STEPx markers; we instead cap flat at 60s because we're
  // buffering output rather than streaming it.
  const result = await runPowerShellFile(
    resolvePsScript("extract-selected-shape"),
    { DestPath: absNative, TemplatePath: templatePath, RelNative: relNative },
    { timeoutMs: 60_000 },
  );

  const stdout = result.stdout;
  const stderr = result.stderr;
  // Preserve the UI log panel: replay stdout/stderr through the same
  // line-by-line breadcrumbs the streaming loop used to emit.
  const logs: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const l = line.trim();
    if (l.length > 0) {
      console.log("[PowerShell STDOUT]:", l);
      logs.push(l);
    }
  }
  for (const line of stderr.split(/\r?\n/)) {
    const l = line.trim();
    if (l.length > 0) {
      console.error("[PowerShell STDERR]:", l);
      logs.push(`[stderr] ${l}`);
    }
  }

  if (result.ok === false) {
    // protocol-error = script emitted "ERROR:<msg>" -- surface the raw
    // message so "No shape selected" etc. show up identically to Phase 3.
    if (result.reason === "protocol-error") {
      return { success: false, error: result.message, logs, stdout, stderr };
    }
    // Any other failure (exit-nonzero, timeout, spawn-failed) -- preserve
    // the legacy "look for ERROR: line in stdout first" heuristic in case
    // PS exited non-zero WITHOUT emitting the clean OK/ERROR protocol.
    const errLine = stdout
      .trim()
      .split("\n")
      .find((l) => l.trim().startsWith("ERROR:"));
    if (errLine) {
      return { success: false, error: errLine.trim().replace(/^ERROR:/, ""), logs, stdout, stderr };
    }
    return {
      success: false,
      error: `PowerShell failed (${result.code ?? "n/a"}). ${stderr || stdout || result.message}`,
      logs,
      stdout,
      stderr,
    };
  }

  const output = stdout.trim();
  const jsonLine = output.split("\n").find((l) => l.trim().startsWith("{"));
  if (!jsonLine) {
    console.error("No JSON found. Full output:", output);
    return { success: false, error: "No JSON data in PowerShell output", logs, stdout, stderr };
  }

  try {
    const data = JSON.parse(jsonLine);
    const shape: ExtractedShape = {
      name: data.name || "Unnamed",
      type: data.type || 1,
      autoShapeName: data.autoShapeName,
      position: { x: data.left || 1, y: data.top || 1 },
      size: { width: data.width || 2, height: data.height || 2 },
      rotation: typeof data.rotation === "number" ? data.rotation : 0,
      adjustments: Array.isArray(data.adjustments) ? data.adjustments : undefined,
      nativePptxRelPath: typeof data.nativePptxRelPath === "string" ? data.nativePptxRelPath : undefined,
      isGroup: data.isGroup === true,
      isPicture: data.isPicture === true,
      pngTempPath: typeof data.pngTempPath === "string" ? data.pngTempPath : undefined,
      fill: {
        color: data.fillColor,
        transparency: data.fillTransparency,
      },
      line: {
        color: data.lineColor,
        weight: typeof data.lineWeight === "number" ? data.lineWeight : 1,
        transparency: data.lineTransparency,
      },
    };

    return { success: true, shape, logs, stdout, stderr };
  } catch (e) {
    return { success: false, error: `Failed to parse JSON: ${e}`, logs, stdout, stderr };
  }
}
