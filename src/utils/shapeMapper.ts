/**
 * Maps PowerPoint AutoShapeType constants to PptxGenJS shape types
 */

import { ShapeInfo, ShapeType, ShapeCategory } from "../types/shapes";
import { ExtractedShape } from "../extractor/types";

/**
 * PowerPoint AutoShapeType constants mapped to PptxGenJS types
 * Reference: https://docs.microsoft.com/en-us/office/vba/api/office.msoautoshapetype
 */
const AUTOSHAPE_TYPE_MAP: Record<number, ShapeType> = {
  // Basic shapes
  1: "rectangle", // msoShapeRectangle
  2: "parallelogram", // msoShapeParallelogram
  3: "trapezoid", // msoShapeTrapezoid
  4: "diamond", // msoShapeDiamond
  5: "roundRectangle", // msoShapeRoundedRectangle
  6: "octagon", // msoShapeOctagon
  7: "triangle", // msoShapeIsoscelesTriangle
  8: "triangle", // msoShapeRightTriangle
  9: "ellipse", // msoShapeOval
  10: "hexagon", // msoShapeHexagon
  11: "cross", // msoShapeCross
  12: "plus", // msoShapeRegularPentagon
  13: "star", // msoShape5pointStar
  17: "heart", // msoShapeHeart
  19: "pentagon", // msoShapePentagon

  // Arrows
  36: "leftArrow", // msoShapeLeftArrow
  37: "downArrow", // msoShapeDownArrow
  38: "upArrow", // msoShapeUpArrow
  39: "rightArrow", // msoShapeRightArrow
  40: "leftRightArrow", // msoShapeLeftRightArrow
  41: "upDownArrow", // msoShapeUpDownArrow
  42: "quadArrow", // msoShapeQuadArrow
  43: "notchedRightArrow", // msoShapeNotchedRightArrow
  44: "bentArrow", // msoShapeBentArrow
  45: "uturnArrow", // msoShapeUTurnArrow
  46: "leftArrowCallout", // msoShapeLeftArrowCallout
  47: "rightArrowCallout", // msoShapeRightArrowCallout
  48: "upArrowCallout", // msoShapeUpArrowCallout
  49: "downArrowCallout", // msoShapeDownArrowCallout
  52: "circularArrow", // msoShapeCircularArrow
  55: "chevron", // msoShapeChevron

  // Flowchart
  109: "flowChartProcess", // msoShapeFlowchartProcess
  110: "flowChartAlternateProcess", // msoShapeFlowchartAlternateProcess
  111: "flowChartDecision", // msoShapeFlowchartDecision
  112: "flowChartInputOutput", // msoShapeFlowchartData
  113: "flowChartPredefinedProcess", // msoShapeFlowchartPredefinedProcess
  114: "flowChartInternalStorage", // msoShapeFlowchartInternalStorage
  115: "flowChartDocument", // msoShapeFlowchartDocument
  116: "flowChartMultidocument", // msoShapeFlowchartMultidocument
  117: "flowChartTerminator", // msoShapeFlowchartTerminator
  118: "flowChartPreparation", // msoShapeFlowchartPreparation
  119: "flowChartManualInput", // msoShapeFlowchartManualInput
  120: "flowChartManualOperation", // msoShapeFlowchartManualOperation
  121: "flowChartConnector", // msoShapeFlowchartConnector
  122: "flowChartOffpageConnector", // msoShapeFlowchartOffpageConnector
  125: "flowChartMagneticTape", // msoShapeFlowchartMagneticTape
  126: "flowChartMagneticDisk", // msoShapeFlowchartMagneticDisk
  127: "flowChartMagneticDrum", // msoShapeFlowchartMagneticDrum
  128: "flowChartDisplay", // msoShapeFlowchartDisplay
  129: "flowChartDelay", // msoShapeFlowchartDelay
  134: "flowChartSort", // msoShapeFlowchartSort
  135: "flowChartExtract", // msoShapeFlowchartExtract
  136: "flowChartMerge", // msoShapeFlowchartMerge
  137: "flowChartOnlineStorage", // msoShapeFlowchartOnlineStorage
  138: "flowChartSummingJunction", // msoShapeFlowchartSummingJunction
  139: "flowChartOr", // msoShapeFlowchartOr
  140: "flowChartCollate", // msoShapeFlowchartCollate
  141: "flowChartPunchedCard", // msoShapeFlowchartCard
  142: "flowChartPunchedTape", // msoShapeFlowchartPunchedTape

  // Callouts
  56: "wedgeRectCallout", // msoShapeRectangularCallout
  57: "wedgeRoundRectCallout", // msoShapeRoundedRectangularCallout
  58: "wedgeEllipseCallout", // msoShapeOvalCallout
  106: "cloudCallout", // msoShapeCloudCallout
  61: "borderCallout1", // msoShapeLineCallout1
  62: "borderCallout2", // msoShapeLineCallout2
  63: "borderCallout3", // msoShapeLineCallout3
  64: "accentCallout1", // msoShapeLineCallout4
  65: "borderCallout1", // msoShapeLineCallout1WithAccentBar
  66: "borderCallout2", // msoShapeLineCallout2WithAccentBar
  67: "borderCallout3", // msoShapeLineCallout3WithAccentBar
  68: "accentCallout1", // msoShapeLineCallout4WithAccentBar
  70: "callout1", // msoShapeLineCallout1WithBorder
  71: "callout2", // msoShapeLineCallout2WithBorder
  72: "callout3", // msoShapeLineCallout3WithBorder
  73: "accentCallout1", // msoShapeLineCallout4WithBorder
  74: "accentBorderCallout1", // msoShapeLineCallout1WithBorderAndAccentBar
  75: "accentBorderCallout2", // msoShapeLineCallout2WithBorderAndAccentBar
  76: "accentBorderCallout3", // msoShapeLineCallout3WithBorderAndAccentBar
};

/**
 * Optional mapping by enum name when available
 */
const AUTOSHAPE_NAME_MAP: Record<string, ShapeType> = {
  msoShapeRectangle: "rectangle",
  msoShapeRoundedRectangle: "roundRectangle",
  msoShapeOval: "ellipse",
  msoShapeIsoscelesTriangle: "triangle",
  msoShapeRightTriangle: "triangle",
  msoShapeDiamond: "diamond",
  msoShapeHexagon: "hexagon",
  msoShapeOctagon: "octagon",
  msoShapeParallelogram: "parallelogram",
  msoShapeTrapezoid: "trapezoid",
  msoShapePentagon: "pentagon",
  msoShapeHeart: "heart",
  // Arrows
  msoShapeLeftArrow: "leftArrow",
  msoShapeDownArrow: "downArrow",
  msoShapeUpArrow: "upArrow",
  msoShapeRightArrow: "rightArrow",
  msoShapeLeftRightArrow: "leftRightArrow",
  msoShapeUpDownArrow: "upDownArrow",
  msoShapeQuadArrow: "quadArrow",
  msoShapeNotchedRightArrow: "notchedRightArrow",
  msoShapeBentArrow: "bentArrow",
  msoShapeUTurnArrow: "uturnArrow",
  msoShapeLeftArrowCallout: "leftArrowCallout",
  msoShapeRightArrowCallout: "rightArrowCallout",
  msoShapeUpArrowCallout: "upArrowCallout",
  msoShapeDownArrowCallout: "downArrowCallout",
  msoShapeCircularArrow: "circularArrow",
  msoShapeChevron: "chevron",
  // Flowchart
  msoShapeFlowchartProcess: "flowChartProcess",
  msoShapeFlowchartAlternateProcess: "flowChartAlternateProcess",
  msoShapeFlowchartDecision: "flowChartDecision",
  msoShapeFlowchartData: "flowChartInputOutput",
  msoShapeFlowchartPredefinedProcess: "flowChartPredefinedProcess",
  msoShapeFlowchartInternalStorage: "flowChartInternalStorage",
  msoShapeFlowchartDocument: "flowChartDocument",
  msoShapeFlowchartMultidocument: "flowChartMultidocument",
  msoShapeFlowchartTerminator: "flowChartTerminator",
  msoShapeFlowchartPreparation: "flowChartPreparation",
  msoShapeFlowchartManualInput: "flowChartManualInput",
  msoShapeFlowchartManualOperation: "flowChartManualOperation",
  msoShapeFlowchartConnector: "flowChartConnector",
  msoShapeFlowchartOffpageConnector: "flowChartOffpageConnector",
  msoShapeFlowchartDisplay: "flowChartDisplay",
  msoShapeFlowchartDelay: "flowChartDelay",
  msoShapeFlowchartSort: "flowChartSort",
  msoShapeFlowchartExtract: "flowChartExtract",
  msoShapeFlowchartMerge: "flowChartMerge",
  msoShapeFlowchartOnlineStorage: "flowChartOnlineStorage",
  msoShapeFlowchartSummingJunction: "flowChartSummingJunction",
  msoShapeFlowchartOr: "flowChartOr",
  // Callouts
  msoShapeRectangularCallout: "wedgeRectCallout",
  msoShapeRoundedRectangularCallout: "wedgeRoundRectCallout",
  msoShapeOvalCallout: "wedgeEllipseCallout",
  msoShapeCloudCallout: "cloudCallout",
  // Plaque / Tag-like (approximate)
  msoShapePlaque: "roundRectangle",
  msoShapePlaqueTabs: "roundRectangle",
};

function chooseType(extracted: ExtractedShape): ShapeType {
  // Prefer enum name mapping when available
  if (extracted.autoShapeName && AUTOSHAPE_NAME_MAP[extracted.autoShapeName]) {
    return AUTOSHAPE_NAME_MAP[extracted.autoShapeName];
  }
  // Fallback to numeric map
  if (AUTOSHAPE_TYPE_MAP[extracted.type]) {
    return AUTOSHAPE_TYPE_MAP[extracted.type];
  }
  // Heuristics for tag-like names (approximate using rounded rectangle)
  const nm = (extracted.name || "").toLowerCase();
  if (nm.includes("tag") || nm.includes("etiqueta") || nm.includes("label")) {
    return "roundRectangle";
  }
  return "rectangle";
}

/**
 * Determine category based on shape type
 */
function getCategoryFromType(shapeType: ShapeType): ShapeCategory {
  if (shapeType.startsWith("flowChart")) {
    return "flowchart";
  }

  if (
    shapeType.includes("Arrow") ||
    shapeType.includes("arrow") ||
    shapeType.includes("Chevron") ||
    shapeType.includes("chevron")
  ) {
    return "arrows";
  }

  if (shapeType.includes("Callout") || shapeType.includes("callout")) {
    return "callouts";
  }

  return "basic";
}

/**
 * Generate a unique ID for the captured shape
 */
function generateShapeId(name: string): string {
  const sanitized = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const timestamp = Date.now().toString(36);
  return `captured-${sanitized}-${timestamp}`;
}

/**
 * Generate tags based on shape name and type
 */
function generateTags(name: string, shapeType: ShapeType, category: ShapeCategory): string[] {
  const tags: string[] = ["captured"];

  // Add category as tag
  tags.push(category);

  // Add shape type parts
  const typeParts = shapeType
    .replace(/([A-Z])/g, " $1")
    .trim()
    .toLowerCase()
    .split(" ");
  tags.push(...typeParts);

  // Add name parts
  const nameParts = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((p) => p.length > 2);
  tags.push(...nameParts);

  // Remove duplicates
  return Array.from(new Set(tags));
}

/**
 * Map extracted PowerPoint shape to ShapeInfo format
 */
export function mapToShapeInfo(extracted: ExtractedShape, customName?: string): ShapeInfo {
  const isNativeOnly = !!(extracted as any).isGroup || extracted.isPicture === true;

  // Map using enum-name mapping > numeric mapping > heuristics (only when not native-only)
  const pptxType = isNativeOnly ? undefined : chooseType(extracted);
  const category: ShapeCategory = isNativeOnly ? "basic" : getCategoryFromType(pptxType as ShapeType);

  const id = generateShapeId(customName || extracted.name);
  const tags = generateTags(customName || extracted.name, (pptxType || "rectangle") as ShapeType, category);

  const shapeInfo: ShapeInfo = {
    id,
    name: customName || extracted.name,
    category,
    description: `Captured from PowerPoint${(extracted as any).isGroup ? " (Group)" : extracted.isPicture ? " (Picture)" : ""} (Type: ${extracted.type})`,
    tags,
    preview: `${category}/placeholder.png`,
    pptxDefinition: {
      type: (pptxType || "rectangle") as ShapeType,
      x: extracted.position.x,
      y: extracted.position.y,
      w: extracted.size.width,
      h: extracted.size.height,
      rotate: extracted.rotation !== 0 ? extracted.rotation : undefined,
      adj: extracted.adjustments,
      rectRadius:
        (pptxType as any) === "roundRectangle" && extracted.adjustments && extracted.adjustments.length > 0
          ? extracted.adjustments[0]
          : undefined,
      fill: extracted.fill.color
        ? {
            color: extracted.fill.color,
            transparency: extracted.fill.transparency,
          }
        : undefined,
      line: extracted.line.color
        ? {
            color: extracted.line.color,
            width: extracted.line.weight || 1,
            transparency: extracted.line.transparency,
          }
        : undefined,
    },
    nativePptx: extracted.nativePptxRelPath,
    nativeOnly: isNativeOnly || undefined,
  };

  try {
    console.log(
      `[Mapper] AutoShapeType=${extracted.type} Name=${extracted.autoShapeName || "(n/a)"} -> ${
        isNativeOnly ? "Native-only" : `PptxType=${pptxType}`
      }`
    );
  } catch {}

  return shapeInfo;
}

/**
 * Get human-readable name for PowerPoint AutoShapeType
 */
export function getShapeTypeName(autoShapeType: number): string {
  const pptxType = AUTOSHAPE_TYPE_MAP[autoShapeType];

  if (!pptxType) {
    return `Unknown (${autoShapeType})`;
  }

  // Convert camelCase to Title Case
  return pptxType
    .replace(/([A-Z])/g, " $1")
    .trim()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Check if AutoShapeType is supported by PptxGenJS
 */
export function isSupportedShapeType(autoShapeType: number): boolean {
  return autoShapeType in AUTOSHAPE_TYPE_MAP;
}

/**
 * Get list of all supported AutoShapeType constants
 */
export function getSupportedShapeTypes(): number[] {
  return Object.keys(AUTOSHAPE_TYPE_MAP).map(Number);
}
