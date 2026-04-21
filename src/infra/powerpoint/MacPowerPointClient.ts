/**
 * macOS PowerPoint adapter -- drives PowerPoint via AppleScript.
 *
 * Phase 5 note: the adapter implements only `captureSelectedShape()`;
 * the deck / clipboard / insert operations remain Windows-only for now
 * because the underlying PowerShell scripts (`add-shape-to-deck.ps1`,
 * `insert-from-deck.ps1`, etc.) have no AppleScript counterpart. Calls
 * to those methods throw an explicit platform-unsupported error so the
 * UI layer can translate it into a toast rather than a silent no-op.
 *
 * The AppleScript body is lifted verbatim from the pre-Phase-5
 * `src/extractor/macExtractor.ts` to preserve behaviour -- only the
 * wrapper shape (function -> class method) changed.
 */

import { exec } from "child_process";
import { promisify } from "util";
import type { PowerPointClient } from "../../domain/powerpoint/PowerPointClient";
import type { ExtractedShape, ExtractionResult } from "../../domain/powerpoint/types";

const execAsync = promisify(exec);

export class MacPowerPointClient implements PowerPointClient {
  async captureSelectedShape(): Promise<ExtractionResult> {
    const script = `
    tell application "Microsoft PowerPoint"
      if (count of presentations) = 0 then
        return "ERROR:No presentation is open"
      end if

      tell active presentation
        if (count of (get selection shapes)) = 0 then
          return "ERROR:No shape selected. Please select a shape in PowerPoint."
        end if

        set selectedShape to first item of (get selection shapes)

        -- Extract properties
        set shapeName to name of selectedShape
        set shapeType to shape type of selectedShape as integer

        -- Get position and size (in points, will convert to inches)
        set leftPos to left position of selectedShape
        set topPos to top position of selectedShape
        set shapeWidth to width of selectedShape
        set shapeHeight to height of selectedShape

        -- Get rotation
        set rotationAngle to rotation of selectedShape

        -- Convert points to inches (72 points = 1 inch)
        set leftInches to (leftPos / 72) as text
        set topInches to (topPos / 72) as text
        set widthInches to (shapeWidth / 72) as text
        set heightInches to (shapeHeight / 72) as text

        -- Return as delimited string (JSON is complex in AppleScript)
        return shapeName & "|" & shapeType & "|" & leftInches & "|" & topInches & "|" & widthInches & "|" & heightInches & "|" & rotationAngle
      end tell
    end tell`;

    try {
      const { stdout, stderr } = await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
      const out = stdout.trim();
      if (out.startsWith("ERROR:")) {
        return { success: false, error: out.replace(/^ERROR:/, ""), stdout, stderr };
      }
      const parts = out.split("|");
      if (parts.length < 7) {
        return { success: false, error: `Unexpected AppleScript output: ${out}`, stdout, stderr };
      }
      const [name, typeStr, left, top, width, height, rotation] = parts;
      const shape: ExtractedShape = {
        name: name || "Unnamed",
        type: parseInt(typeStr, 10) || 1,
        position: { x: parseFloat(left) || 1, y: parseFloat(top) || 1 },
        size: { width: parseFloat(width) || 2, height: parseFloat(height) || 2 },
        rotation: parseFloat(rotation) || 0,
        fill: {},
        line: { weight: 1 },
      };
      return { success: true, shape, stdout, stderr };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async copyShapeToClipboard(_pptxPath: string): Promise<void> {
    throw new Error("copyShapeToClipboard is not supported on macOS");
  }

  async copyDeckSlideToClipboard(_deckPath: string, _slideIndex: number): Promise<void> {
    throw new Error("copyDeckSlideToClipboard is not supported on macOS");
  }

  async insertSlide(_deckPath: string, _slideIndex: number): Promise<void> {
    throw new Error("insertSlide is not supported on macOS");
  }

  async addSlideFromPptx(_deckPath: string, _sourcePath: string): Promise<number> {
    throw new Error("addSlideFromPptx is not supported on macOS");
  }

  async createDeck(_templatePath?: string): Promise<string> {
    throw new Error("createDeck is not supported on macOS");
  }
}
