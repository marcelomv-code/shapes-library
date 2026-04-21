import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { showToast, Toast, getPreferenceValues } from "@raycast/api";
import { ShapeInfo, Preferences } from "../../types/shapes";
import { getLibraryRoot } from "../../utils/paths";
import { generateShapePptx } from "../../generator/pptxGenerator";
import { getPowerPointClient, getDeckPath } from "../../infra/powerpoint";

/**
 * Copy a shape to the Windows clipboard so the user can paste it directly
 * into PowerPoint. Three paths (in preference order):
 *   1. Deck slide copy (when `useLibraryDeck` pref is on and the shape
 *      carries a `deckSlide` index).
 *   2. Native PPTX copy (uses `shape.nativePptx` under the library root).
 *   3. Generated PPTX fallback (calls `generateShapePptx`).
 * If `forceExactShapes` or `shape.nativeOnly` is set, the fallback path is
 * blocked and the toast instructs the user to recapture.
 */
export async function copyShapeToClipboard(shape: ShapeInfo): Promise<void> {
  if (process.platform !== "win32") {
    await showToast({ style: Toast.Style.Failure, title: "Copy not supported on macOS yet" });
    return;
  }

  const toast = await showToast({ style: Toast.Style.Animated, title: "Copying shape..." });
  let srcPptx: string | null = null;
  let isTemp = false;
  try {
    const prefs = getPreferenceValues<Preferences>();
    if (prefs.useLibraryDeck && typeof shape.deckSlide === "number") {
      await getPowerPointClient().copyDeckSlideToClipboard(getDeckPath(), shape.deckSlide);
      toast.style = Toast.Style.Success;
      toast.title = "Shape copied (deck)";
      toast.message = "Ctrl+V in PowerPoint";
      return;
    }

    const requireNative =
      (getPreferenceValues<Preferences>().forceExactShapes ?? false) === true || shape.nativeOnly === true;
    if (shape.nativePptx) {
      srcPptx = join(getLibraryRoot(), shape.nativePptx);
    }
    if (requireNative && (!srcPptx || !existsSync(srcPptx))) {
      toast.style = Toast.Style.Failure;
      toast.title = "Native PPTX required";
      toast.message = "Recapture this shape to generate a native PPTX file with your template theme.";
      return;
    }
    if (!srcPptx || !existsSync(srcPptx)) {
      srcPptx = await generateShapePptx(shape);
      isTemp = true;
    }

    try {
      await runCopyViaPowerPoint(srcPptx);
    } catch (primaryErr) {
      const requireNative2 =
        (getPreferenceValues<Preferences>().forceExactShapes ?? false) === true || shape.nativeOnly === true;
      if (requireNative2) {
        throw primaryErr;
      }
      // Fallback: generate a fresh PPTX and try again
      const fallback = await generateShapePptx(shape);
      isTemp = true;
      await runCopyViaPowerPoint(fallback);
      try {
        unlinkSync(fallback);
      } catch {
        /* noop: temp cleanup failure is non-fatal */
      }
    }

    toast.style = Toast.Style.Success;
    toast.title = "Shape copied";
    toast.message = "Switch to PowerPoint and press Ctrl+V";
  } catch (err) {
    toast.style = Toast.Style.Failure;
    toast.title = "Failed to copy";
    toast.message = err instanceof Error ? err.message : "Unknown error";
  } finally {
    if (isTemp && srcPptx) {
      try {
        unlinkSync(srcPptx);
      } catch {
        /* noop: temp cleanup failure is non-fatal */
      }
    }
  }
}

/**
 * Phase 5: delegates through the PowerPointClient port -- the Windows
 * adapter still drives assets/ps/copy-via-powerpoint.ps1 but the port's
 * `copyShapeToClipboard` throws on failure so the surrounding fallback
 * branch in copyShapeToClipboard catches the original "No active
 * PowerPoint window" message unchanged.
 */
export async function runCopyViaPowerPoint(pptxPath: string): Promise<void> {
  await getPowerPointClient().copyShapeToClipboard(pptxPath);
}
