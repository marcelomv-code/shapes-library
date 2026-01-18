import pptxgen from "pptxgenjs";
import { open, showToast, Toast, getPreferenceValues, environment } from "@raycast/api";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { ShapeInfo, Preferences, ShapeFill, ShapeLine } from "../types/shapes";
import { spawn } from "child_process";
import { getLibraryRoot } from "../utils/paths";

/**
 * Active temporary files that need cleanup
 */
const activeTempFiles: Set<string> = new Set();

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

  // Normalize colors to ensure absolute RGB format with # prefix
  // This prevents theme color interpretation and ensures consistent colors
  slide.addShape(shapeDef.type as any, {
    x: shapeDef.x,
    y: shapeDef.y,
    w: shapeDef.w,
    h: shapeDef.h,
    fill: normalizeFill(shapeDef.fill),
    line: normalizeLine(shapeDef.line),
    shadow: shapeDef.shadow,
    rotate: shapeDef.rotate,
    flipH: shapeDef.flipH,
    flipV: shapeDef.flipV,
    // carry optional adjustments
    ...(shapeDef as any),
  } as any);

  // Generate unique filename with timestamp
  const timestamp = Date.now();
  const safeName = shape.id.replace(/[^a-z0-9-]/gi, "_");
  const filename = `shape_${safeName}_${timestamp}.pptx`;
  const tempPath = join(tmpdir(), filename);

  // Write file to temp directory
  const data = (await pres.write({ outputType: "nodebuffer" })) as Buffer;
  writeFileSync(tempPath, data);

  // Track temp file for cleanup
  activeTempFiles.add(tempPath);

  return tempPath;
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
          throw new Error("Native PPTX required. Recapture this shape to generate a native PPTX file with your template theme.");
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
      scheduleCleanup(tempPath, 60000); // 60 seconds
    }
  } catch (error) {
    toast.style = Toast.Style.Failure;
    toast.title = "Failed to generate shape";
    toast.message = error instanceof Error ? error.message : "Unknown error";
    throw error;
  }
}

/**
 * Schedule cleanup of a temporary file
 * @param filePath - Path to the file to clean up
 * @param delayMs - Delay in milliseconds before cleanup
 */
function scheduleCleanup(filePath: string, delayMs: number): void {
  setTimeout(() => {
    cleanupTempFile(filePath);
  }, delayMs);
}

/**
 * Clean up a temporary file
 * @param filePath - Path to the file to clean up
 */
export function cleanupTempFile(filePath: string): void {
  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
      activeTempFiles.delete(filePath);
    }
  } catch (error) {
    // Silently fail - file might be in use by PowerPoint
    console.error(`Failed to cleanup temp file: ${filePath}`, error);
  }
}

/**
 * Clean up all active temporary files
 */
export function cleanupAllTempFiles(): void {
  activeTempFiles.forEach((filePath) => {
    cleanupTempFile(filePath);
  });
}

/**
 * Get count of active temporary files
 */
export function getActiveTempFilesCount(): number {
  return activeTempFiles.size;
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
  return new Promise((resolve, reject) => {
    const safeSrc = srcPptx.replace(/'/g, "''");
    const script = `
$ErrorActionPreference = "Stop"
try {
  $ppt = [Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application')
  if ($ppt.Presentations.Count -eq 0) { Write-Output 'ERROR:No presentation is open'; exit 1 }
  $dest = $ppt.ActiveWindow.View.Slide
  if ($null -eq $dest) { $dest = $ppt.ActivePresentation.Slides.Item(1) }

  $src = $ppt.Presentations.Open('${safeSrc}', $true, $false, $false)
  $s1 = $src.Slides.Item(1)
  if ($s1.Shapes.Count -eq 0) { Write-Output 'ERROR:Source slide has no shapes'; $src.Close(); exit 1 }
  # Filter out footer/slide number/date placeholders and copyright text
  $validNames = @()
  foreach ($shape in $s1.Shapes) {
    $skip = $false
    try {
      $phType = $shape.PlaceholderFormat.Type
      if ($phType -eq 6 -or $phType -eq 13 -or $phType -eq 16) { $skip = $true }
    } catch {}
    if (-not $skip) {
      try {
        $txt = $shape.TextFrame.TextRange.Text
        if ($txt -match 'Copyright|©') { $skip = $true }
      } catch {}
    }
    if (-not $skip) { $validNames += $shape.Name }
  }
  if ($validNames.Count -eq 0) { Write-Output 'ERROR:No valid shapes to copy'; $src.Close(); exit 1 }
  $s1.Shapes.Range($validNames).Copy()
  $dest.Shapes.Paste() | Out-Null
  $src.Close()
  Write-Output 'OK'
} catch {
  Write-Output "ERROR:$($_.Exception.Message)"; exit 1
}
`;

    const tmpPath = join(tmpdir(), `raycast-insert-${Date.now()}.ps1`);
    try {
      writeFileSync(tmpPath, script, "utf-8");
    } catch (e) {
      return reject(e as Error);
    }
    const ps = spawn("powershell", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", tmpPath]);
    let stdout = "";
    let stderr = "";
    ps.stdout.on("data", (d) => (stdout += d.toString()));
    ps.stderr.on("data", (d) => (stderr += d.toString()));
    ps.on("error", (err) => done(err));
    ps.on("close", (code) => done(code === 0 ? null : new Error(`PowerShell failed (${code}). ${stderr || stdout}`)));
    function done(err: Error | null) {
      try {
        unlinkSync(tmpPath);
      } catch {}
      if (err) return reject(err);
      if (stdout.trim().startsWith("ERROR:")) return reject(new Error(stdout.trim().slice(6)));
      resolve();
    }
  });
}
