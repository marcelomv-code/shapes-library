import pptxgen from "pptxgenjs";
type PptxShapeName = pptxgen.SHAPE_NAME;
type PptxShapeProps = pptxgen.ShapeProps;
import { open, showToast, Toast, getPreferenceValues } from "@raycast/api";
import { writeFileSync } from "fs";
import { join } from "path";
import { ShapeInfo, Preferences, ShapeFill, ShapeLine } from "../types/shapes";
import { getLibraryRoot } from "../utils/paths";
import { runPowerShellFile, resolvePsScript } from "../infra/powershell";
import { writeTempFile, scheduleCleanup as scheduleTempCleanup } from "../infra/temp";

/**
 * Normalize color format to ensure it starts with #
 * This handles both old format (RRGGBB) and new format (#RRGGBB)
 * and ensures colors are always interpreted as absolute RGB, not theme colors
 */
function normalizeColor(color: string | undefined): string | undefined {
  if (!color) return undefined;
  // If already has #, return as is
  if (color.startsWith("#")) return color;
  // If it's a 6-character hex string, add # prefix
  if (/^[0-9A-Fa-f]{6}$/.test(color)) return `#${color}`;
  // Otherwise return as is (might be a named color)
  return color;
}

/**
 * Normalize fill properties to ensure color format is correct
 */
function normalizeFill(fill: ShapeFill | undefined): ShapeFill | undefined {
  if (!fill) return undefined;
  return {
    ...fill,
    color: normalizeColor(fill.color),
  };
}

/**
 * Normalize line properties to ensure color format is correct
 */
function normalizeLine(line: ShapeLine | undefined): ShapeLine | undefined {
  if (!line) return undefined;
  return {
    ...line,
    color: normalizeColor(line.color),
  };
}

/**
 * Generate a temporary PowerPoint file with the specified shape
 * @param shape - Shape definition to generate
 * @returns Path to the generated temporary file
 */
export async function generateShapePptx(shape: ShapeInfo): Promise<string> {
  const pres = new pptxgen();

  // Set presentation properties
  pres.layout = "LAYOUT_16x9";
  pres.author = "PowerPoint Shapes Library";
  pres.company = "Raycast Extension";
  pres.subject = shape.name;
  pres.title = `${shape.name} - Shape Template`;

  // Add a slide
  const slide = pres.addSlide();

  // Add the shape based on the definition
  const shapeDef = shape.pptxDefinition;
  if (!shapeDef) {
    throw new Error(`Shape '${shape.id}' has no pptxDefinition. Recapture the shape or provide a native PPTX.`);
  }

  // Normalize colors to ensure absolute RGB format with # prefix
  // This prevents theme color interpretation and ensures consistent colors
  const shapeOptions: PptxShapeProps = {
    x: shapeDef.x,
    y: shapeDef.y,
    w: shapeDef.w,
    h: shapeDef.h,
    fill: normalizeFill(shapeDef.fill) as PptxShapeProps["fill"],
    line: normalizeLine(shapeDef.line) as PptxShapeProps["line"],
    shadow: shapeDef.shadow,
    rotate: shapeDef.rotate,
    flipH: shapeDef.flipH,
    flipV: shapeDef.flipV,
    // carry optional adjustments (rectRadius, etc.)
    ...(shapeDef as unknown as PptxShapeProps),
  };
  slide.addShape(shapeDef.type as unknown as PptxShapeName, shapeOptions);

  // Phase 15: delegate path generation + tracking to tempManager.
  // The `shape_<safeName>` prefix keeps filenames grep-friendly in
  // logs; tempManager appends `_<timestamp>-<counter>` for uniqueness.
  const safeName = shape.id.replace(/[^a-z0-9-]/gi, "_");
  const data = (await pres.write({ outputType: "nodebuffer" })) as Buffer;
  return writeTempFile(`shape_${safeName}`, "pptx", data);
}

/**
 * Open a shape in PowerPoint
 * @param shape - Shape to open
 */
export async function openShapeInPowerPoint(shape: ShapeInfo): Promise<void> {
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Generating shape...",
    message: shape.name,
  });

  try {
    let tempPath: string | undefined;

    // Windows: insert directly into the active presentation to avoid opening temp windows
    if (process.platform === "win32") {
      const prefs = getPreferenceValues<Preferences>();
      let srcPptx: string;
      if (shape.nativePptx) {
        srcPptx = join(getLibraryRoot(), shape.nativePptx.replace(/^[\\/]+/, ""));
      } else {
        if (prefs.forceExactShapes || shape.nativeOnly) {
          throw new Error(
            "Native PPTX required. Recapture this shape to generate a native PPTX file with your template theme."
          );
        }
        srcPptx = await generateShapePptx(shape);
        tempPath = srcPptx;
      }
      await insertIntoActivePresentationWindows(srcPptx);
    } else {
      // macOS fallback: open a new file
      if (shape.nativePptx) {
        const abs = join(getLibraryRoot(), shape.nativePptx.replace(/^[\\/]+/, ""));
        await open(abs);
      } else {
        tempPath = await generateShapePptx(shape);
        await open(tempPath);
      }
    }

    // Update toast
    toast.style = Toast.Style.Success;
    toast.title = process.platform === "win32" ? "Shape inserted" : "Shape opened in PowerPoint";
    toast.message =
      process.platform === "win32" ? "Shape pasted into active slide" : "Copy the shape (Ctrl+C / Cmd+C) to use it";

    // Schedule cleanup if enabled
    const preferences = getPreferenceValues<Preferences>();
    if (preferences.autoCleanup && tempPath) {
      scheduleTempCleanup(tempPath, 60000); // 60 seconds
    }
  } catch (error) {
    toast.style = Toast.Style.Failure;
    toast.title = "Failed to generate shape";
    toast.message = error instanceof Error ? error.message : "Unknown error";
    throw error;
  }
}

/**
 * Export shape definition as JSON file
 * @param shape - Shape to export
 * @param outputPath - Path to save the JSON file
 */
export function exportShapeDefinition(shape: ShapeInfo, outputPath: string): void {
  const json = JSON.stringify(shape, null, 2);
  writeFileSync(outputPath, json, "utf-8");
}

async function insertIntoActivePresentationWindows(srcPptx: string): Promise<void> {
  // Phase 4: delegates to assets/ps/insert-active.ps1 via runPowerShellFile.
  // The `ERROR:` sentinel used by the legacy inline script is still honored
  // by the runner (maps to `reason: "protocol-error"`), so the error surface
  // here stays identical -- Error.message is the post-"ERROR:" text.
  const result = await runPowerShellFile(resolvePsScript("insert-active"), { SrcPptx: srcPptx });
  if (result.ok === false) {
    throw new Error(result.message);
  }
}
