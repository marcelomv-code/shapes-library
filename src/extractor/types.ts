/**
 * Types for shape extraction from PowerPoint
 */

/**
 * Extracted shape data from PowerPoint
 */
export interface ExtractedShape {
  name: string;
  type: number; // PowerPoint AutoShapeType constant
  /** Optional: PowerPoint enum name (e.g., msoShapeRoundedRectangle) */
  autoShapeName?: string;
  /** True when selection is a group or multiple shapes */
  isGroup?: boolean;
  position: {
    x: number; // in inches
    y: number; // in inches
  };
  size: {
    width: number; // in inches
    height: number; // in inches
  };
  rotation: number; // in degrees
  /** Shape adjustments (PowerPoint-specific), 1-based collection flattened */
  adjustments?: number[];
  /** Relative path under assets (e.g., native/shape_xxx.pptx) */
  nativePptxRelPath?: string;
  isPicture?: boolean;
  pngTempPath?: string;
  fill: {
    color?: string; // hex color without #
    transparency?: number;
  };
  line: {
    color?: string; // hex color without #
    weight?: number; // in points
    transparency?: number;
  };
}

/**
 * Extraction result with status
 */
export interface ExtractionResult {
  success: boolean;
  shape?: ExtractedShape;
  error?: string;
  logs?: string[]; // stdout lines captured for UI
  stdout?: string; // raw stdout
  stderr?: string; // raw stderr
}
