/**
 * Domain types for PowerPoint shape extraction.
 *
 * Phase 5 moved these from `src/extractor/types.ts` into the domain layer so
 * both the port (`PowerPointClient`) and its adapters reference one
 * authoritative source. `src/extractor/types.ts` now re-exports from here
 * for any legacy call sites that still import from the old path.
 */

/**
 * Extracted shape data from PowerPoint. Produced by the
 * `PowerPointClient.captureSelectedShape()` port.
 */
export interface ExtractedShape {
  name: string;
  /** PowerPoint AutoShapeType constant. */
  type: number;
  /** Optional: PowerPoint enum name (e.g., msoShapeRoundedRectangle). */
  autoShapeName?: string;
  /** True when selection is a group or multiple shapes. */
  isGroup?: boolean;
  position: {
    /** inches */
    x: number;
    /** inches */
    y: number;
  };
  size: {
    /** inches */
    width: number;
    /** inches */
    height: number;
  };
  /** degrees */
  rotation: number;
  /** Shape adjustments (PowerPoint-specific), 1-based collection flattened. */
  adjustments?: number[];
  /** Relative path under library root (e.g., native/shape_xxx.pptx). */
  nativePptxRelPath?: string;
  isPicture?: boolean;
  pngTempPath?: string;
  fill: {
    /** hex color without # */
    color?: string;
    transparency?: number;
  };
  line: {
    /** hex color without # */
    color?: string;
    /** points */
    weight?: number;
    transparency?: number;
  };
}

/**
 * Extraction result. Union-shaped in spirit (success/failure) but kept as a
 * flat interface for backward compatibility with pre-Phase-5 call sites
 * (notably `capture-shape.tsx`) that destructure `success` without narrowing.
 */
export interface ExtractionResult {
  success: boolean;
  shape?: ExtractedShape;
  error?: string;
  /** stdout lines captured for UI log panel */
  logs?: string[];
  stdout?: string;
  stderr?: string;
}
