/**
 * Phase 11 contract tests — shapeMapper (mapToShapeInfo + helpers).
 *
 * Feeds realistic ExtractedShape payloads (some read through the Phase 11
 * fixture pipeline, some built inline for branch coverage) into the
 * mapper and pins the public contract: category routing, native-only
 * short-circuit, rectRadius wiring, id/tag generation, supported-type
 * lookup helpers.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  mapToShapeInfo,
  getShapeTypeName,
  isSupportedShapeType,
  getSupportedShapeTypes,
} from "../../src/utils/shapeMapper";
import type { ExtractedShape } from "../../src/domain/powerpoint/types";
import { parseExtractionStdout } from "../../src/domain/powerpoint/parseExtraction";

const FIXTURES_DIR = join(__dirname, "..", "fixtures", "extractor");

function shapeFromFixture(name: string): ExtractedShape {
  const stdout = readFileSync(join(FIXTURES_DIR, name), "utf8");
  const result = parseExtractionStdout(stdout);
  if (result.ok !== true) {
    throw new Error(`Fixture ${name} did not parse: ${result.error}`);
  }
  return result.shape;
}

function baseShape(overrides: Partial<ExtractedShape> = {}): ExtractedShape {
  return {
    name: "Shape",
    type: 1,
    position: { x: 1, y: 1 },
    size: { width: 2, height: 1 },
    rotation: 0,
    fill: {},
    line: {},
    ...overrides,
  };
}

describe("mapToShapeInfo — category routing", () => {
  it("routes a rectangle to the 'basic' category", () => {
    const info = mapToShapeInfo(shapeFromFixture("rectangle-success.txt"));
    expect(info.category).toBe("basic");
    expect(info.pptxDefinition?.type).toBe("rectangle");
  });

  it("routes a rounded rectangle to 'basic' and wires rectRadius from adj[0]", () => {
    const info = mapToShapeInfo(shapeFromFixture("rounded-rectangle.txt"));
    expect(info.category).toBe("basic");
    expect(info.pptxDefinition?.type).toBe("roundRectangle");
    expect(info.pptxDefinition?.rectRadius).toBe(0.125);
    expect(info.pptxDefinition?.rotate).toBe(15);
  });

  it("routes right arrow (type 39) to 'arrows'", () => {
    const info = mapToShapeInfo(shapeFromFixture("right-arrow.txt"));
    expect(info.category).toBe("arrows");
    expect(info.pptxDefinition?.type).toBe("rightArrow");
  });

  it("routes flowchart decision (type 111) to 'flowchart'", () => {
    const info = mapToShapeInfo(shapeFromFixture("flowchart-decision.txt"));
    expect(info.category).toBe("flowchart");
    expect(info.pptxDefinition?.type).toBe("flowChartDecision");
  });

  it("routes a callout (type 56, msoShapeRectangularCallout) to 'callouts'", () => {
    const info = mapToShapeInfo(
      baseShape({ type: 56, autoShapeName: "msoShapeRectangularCallout", name: "Callout 1" })
    );
    expect(info.category).toBe("callouts");
    expect(info.pptxDefinition?.type).toBe("wedgeRectCallout");
  });

  it("routes chevron (type 55) to 'arrows' via string-match branch", () => {
    const info = mapToShapeInfo(baseShape({ type: 55, name: "Chevron 1" }));
    expect(info.category).toBe("arrows");
    expect(info.pptxDefinition?.type).toBe("chevron");
  });
});

describe("mapToShapeInfo — native-only paths", () => {
  it("marks groups as nativeOnly and drops pptx type hints to rectangle", () => {
    const info = mapToShapeInfo(shapeFromFixture("group-selection.txt"));
    expect(info.nativeOnly).toBe(true);
    expect(info.category).toBe("basic");
    // Native-only falls back to the rectangle default in pptxDefinition.type,
    // but the generator won't use it — nativePptx takes precedence at insert.
    expect(info.pptxDefinition?.type).toBe("rectangle");
    expect(info.nativePptx).toBe("native/shape_captured_1700000000004.pptx");
  });

  it("marks pictures as nativeOnly", () => {
    const info = mapToShapeInfo(shapeFromFixture("picture-selection.txt"));
    expect(info.nativeOnly).toBe(true);
    expect(info.nativePptx).toBe("native/shape_captured_1700000000005.pptx");
  });

  it("leaves nativeOnly undefined (not false) for regular shapes", () => {
    const info = mapToShapeInfo(shapeFromFixture("rectangle-success.txt"));
    expect(info.nativeOnly).toBeUndefined();
  });
});

describe("mapToShapeInfo — chooseType precedence", () => {
  it("prefers autoShapeName over the numeric map", () => {
    // type=9999 has no numeric mapping, but msoShapeOval resolves to ellipse.
    const info = mapToShapeInfo(baseShape({ type: 9999, autoShapeName: "msoShapeOval", name: "Oval 1" }));
    expect(info.pptxDefinition?.type).toBe("ellipse");
  });

  it("falls back to the numeric map when autoShapeName is absent", () => {
    const info = mapToShapeInfo(baseShape({ type: 9, name: "Oval 2" }));
    expect(info.pptxDefinition?.type).toBe("ellipse");
  });

  it("uses the 'tag'/'label'/'etiqueta' heuristic for unmapped types", () => {
    expect(mapToShapeInfo(baseShape({ type: 9999, name: "My Tag" })).pptxDefinition?.type).toBe("roundRectangle");
    expect(mapToShapeInfo(baseShape({ type: 9999, name: "Product Label" })).pptxDefinition?.type).toBe(
      "roundRectangle"
    );
    expect(mapToShapeInfo(baseShape({ type: 9999, name: "Etiqueta Principal" })).pptxDefinition?.type).toBe(
      "roundRectangle"
    );
  });

  it("falls back to rectangle when nothing matches", () => {
    const info = mapToShapeInfo(baseShape({ type: 9999, name: "mystery-shape" }));
    expect(info.pptxDefinition?.type).toBe("rectangle");
  });
});

describe("mapToShapeInfo — pptx definition wiring", () => {
  it("omits rotate when rotation is zero", () => {
    const info = mapToShapeInfo(shapeFromFixture("rectangle-success.txt"));
    expect(info.pptxDefinition?.rotate).toBeUndefined();
  });

  it("omits fill when no color is present", () => {
    const info = mapToShapeInfo(shapeFromFixture("group-selection.txt"));
    expect(info.pptxDefinition?.fill).toBeUndefined();
  });

  it("wires fill + line objects when colors are present", () => {
    const info = mapToShapeInfo(shapeFromFixture("rounded-rectangle.txt"));
    expect(info.pptxDefinition?.fill).toEqual({ color: "#70AD47", transparency: 0.25 });
    expect(info.pptxDefinition?.line).toEqual({ color: "#507E32", width: 1.5, transparency: 0 });
  });

  it("does not set rectRadius for non-roundRectangle shapes even with adj", () => {
    const info = mapToShapeInfo(shapeFromFixture("right-arrow.txt"));
    expect(info.pptxDefinition?.rectRadius).toBeUndefined();
    expect(info.pptxDefinition?.adj).toEqual([0.5, 0.5]);
  });
});

describe("mapToShapeInfo — identity + tags", () => {
  it("generates an id prefixed with 'captured-' and sanitized from the name", () => {
    const info = mapToShapeInfo(baseShape({ type: 1, name: "My Cool Shape" }));
    expect(info.id).toMatch(/^captured-my-cool-shape-[a-z0-9]+$/);
  });

  it("collapses non-alphanumeric runs into single dashes (trailing punctuation is preserved as a dash)", () => {
    // The sanitizer runs [^a-z0-9]+ → "-" without trimming edges, so a
    // trailing "!" becomes a trailing dash which then concatenates with
    // the "-<timestamp>" separator. This pins that exact behaviour.
    const info = mapToShapeInfo(baseShape({ type: 1, name: "My Cool Shape!" }));
    expect(info.id).toMatch(/^captured-my-cool-shape--[a-z0-9]+$/);
  });

  it("uses customName over extracted.name when provided", () => {
    const info = mapToShapeInfo(baseShape({ type: 1, name: "Original" }), "Renamed Box");
    expect(info.name).toBe("Renamed Box");
    expect(info.id).toMatch(/^captured-renamed-box-/);
    expect(info.tags).toContain("renamed");
    expect(info.tags).toContain("box");
    expect(info.tags).not.toContain("original");
  });

  it("tags include 'captured', category, expanded type parts, and name parts >2 chars", () => {
    const info = mapToShapeInfo(baseShape({ type: 111, name: "First Decision Node" }));
    expect(info.tags).toContain("captured");
    expect(info.tags).toContain("flowchart");
    // camelCase "flowChartDecision" -> "flow chart decision"
    expect(info.tags).toContain("flow");
    expect(info.tags).toContain("chart");
    expect(info.tags).toContain("decision");
    // name parts
    expect(info.tags).toContain("first");
    expect(info.tags).toContain("node");
  });

  it("deduplicates tags", () => {
    const info = mapToShapeInfo(baseShape({ type: 111, name: "decision decision decision" }));
    const occurrences = (info.tags ?? []).filter((t) => t === "decision").length;
    expect(occurrences).toBe(1);
  });

  it("sets preview path under the resolved category", () => {
    const info = mapToShapeInfo(baseShape({ type: 39, name: "Arrow 1" }));
    expect(info.preview).toBe("arrows/placeholder.png");
  });
});

describe("getShapeTypeName", () => {
  it("returns a Title-Cased name for a known AutoShapeType", () => {
    expect(getShapeTypeName(5)).toBe("Round Rectangle");
    expect(getShapeTypeName(111)).toBe("Flow Chart Decision");
  });

  it("returns 'Unknown (n)' for unmapped AutoShapeType values", () => {
    expect(getShapeTypeName(9999)).toBe("Unknown (9999)");
  });
});

describe("isSupportedShapeType / getSupportedShapeTypes", () => {
  it("reports whether an AutoShapeType constant is supported", () => {
    expect(isSupportedShapeType(1)).toBe(true);
    expect(isSupportedShapeType(111)).toBe(true);
    expect(isSupportedShapeType(9999)).toBe(false);
  });

  it("getSupportedShapeTypes returns numeric constants and is consistent with isSupportedShapeType", () => {
    const types = getSupportedShapeTypes();
    expect(types.length).toBeGreaterThan(20);
    for (const t of types) {
      expect(Number.isFinite(t)).toBe(true);
      expect(isSupportedShapeType(t)).toBe(true);
    }
  });
});
