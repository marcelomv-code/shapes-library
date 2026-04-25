/**
 * Phase 11 contract tests — extract-selected-shape.ps1 stdout -> ExtractedShape.
 *
 * These tests pin the parser contract against realistic PowerShell stdout
 * captures in `tests/fixtures/extractor/*.txt`. They are pure: no COM, no
 * runner, no Raycast. Each fixture represents one real-world branch of
 * the PS script (basic shape / rounded / arrow / flowchart / group /
 * picture / ERROR line / malformed JSON / no JSON / empty object).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  parseExtractionStdout,
  findErrorLine,
  mapExtractionData,
  RawExtractionJson,
} from "../../../src/domain/powerpoint/parseExtraction";

const FIXTURES_DIR = join(__dirname, "..", "..", "fixtures", "extractor");
const loadFixture = (name: string): string => readFileSync(join(FIXTURES_DIR, name), "utf8");

describe("findErrorLine", () => {
  it("returns the message when stdout has an ERROR: line", () => {
    const stdout = loadFixture("no-shape-selected.txt");
    expect(findErrorLine(stdout)).toBe(
      "No shape selected (Selection.Type=0 None). Click the shape border (not the text), ensure only one shape is selected."
    );
  });

  it("returns undefined when stdout has no ERROR: line", () => {
    const stdout = loadFixture("rectangle-success.txt");
    expect(findErrorLine(stdout)).toBeUndefined();
  });

  it("strips only the leading ERROR: prefix", () => {
    expect(findErrorLine("ERROR:something: inner: detail")).toBe("something: inner: detail");
  });

  it("returns the first ERROR: line when multiple exist", () => {
    const stdout = "STEP1\nERROR:first\nERROR:second\n";
    expect(findErrorLine(stdout)).toBe("first");
  });
});

describe("parseExtractionStdout — success paths", () => {
  it("parses a basic rectangle with STEP breadcrumbs around the JSON", () => {
    const stdout = loadFixture("rectangle-success.txt");
    const result = parseExtractionStdout(stdout);
    expect(result.ok).toBe(true);
    if (result.ok !== true) return;
    expect(result.shape.name).toBe("Rectangle 1");
    expect(result.shape.type).toBe(1);
    expect(result.shape.autoShapeName).toBe("msoShapeRectangle");
    expect(result.shape.position).toEqual({ x: 1.25, y: 2.5 });
    expect(result.shape.size).toEqual({ width: 3, height: 1.5 });
    expect(result.shape.rotation).toBe(0);
    expect(result.shape.adjustments).toEqual([]);
    expect(result.shape.nativePptxRelPath).toBe("native/shape_captured_1700000000000.pptx");
    expect(result.shape.fill).toEqual({ color: "#4472C4", transparency: 0 });
    expect(result.shape.line).toEqual({ color: "#2E528F", weight: 0.75, transparency: 0 });
    expect(result.shape.isGroup).toBe(false);
    expect(result.shape.isPicture).toBe(false);
  });

  it("parses a rounded rectangle with rotation and adjustments", () => {
    const stdout = loadFixture("rounded-rectangle.txt");
    const result = parseExtractionStdout(stdout);
    expect(result.ok).toBe(true);
    if (result.ok !== true) return;
    expect(result.shape.type).toBe(5);
    expect(result.shape.autoShapeName).toBe("msoShapeRoundedRectangle");
    expect(result.shape.rotation).toBe(15);
    expect(result.shape.adjustments).toEqual([0.125]);
    expect(result.shape.fill.transparency).toBe(0.25);
  });

  it("parses a right arrow (lineWeight=1, no fillTransparency)", () => {
    const stdout = loadFixture("right-arrow.txt");
    const result = parseExtractionStdout(stdout);
    expect(result.ok).toBe(true);
    if (result.ok !== true) return;
    expect(result.shape.type).toBe(39);
    expect(result.shape.autoShapeName).toBe("msoShapeRightArrow");
    expect(result.shape.fill.color).toBe("#ED7D31");
    expect(result.shape.fill.transparency).toBeUndefined();
    expect(result.shape.line.weight).toBe(1);
  });

  it("parses a flowchart decision shape", () => {
    const stdout = loadFixture("flowchart-decision.txt");
    const result = parseExtractionStdout(stdout);
    expect(result.ok).toBe(true);
    if (result.ok !== true) return;
    expect(result.shape.type).toBe(111);
    expect(result.shape.autoShapeName).toBe("msoShapeFlowchartDecision");
    expect(result.shape.isGroup).toBe(false);
    expect(result.shape.isPicture).toBe(false);
  });

  it("parses a group selection (isGroup=true, no fill/line metadata)", () => {
    const stdout = loadFixture("group-selection.txt");
    const result = parseExtractionStdout(stdout);
    expect(result.ok).toBe(true);
    if (result.ok !== true) return;
    expect(result.shape.isGroup).toBe(true);
    expect(result.shape.isPicture).toBe(false);
    expect(result.shape.name).toBe("Group 42");
    expect(result.shape.fill.color).toBeUndefined();
    expect(result.shape.line.color).toBeUndefined();
    // Default lineWeight=1 is applied even when the script omits it.
    expect(result.shape.line.weight).toBe(1);
  });

  it("parses a picture selection (isPicture=true, pngTempPath echoed)", () => {
    const stdout = loadFixture("picture-selection.txt");
    const result = parseExtractionStdout(stdout);
    expect(result.ok).toBe(true);
    if (result.ok !== true) return;
    expect(result.shape.isPicture).toBe(true);
    expect(result.shape.isGroup).toBe(false);
    expect(result.shape.pngTempPath).toBe("C:\\Users\\u\\AppData\\Local\\Temp\\raycast-cap-abc.png");
    expect(result.shape.type).toBe(13);
  });

  it("applies defaults for a near-empty JSON object", () => {
    const stdout = loadFixture("minimal-defaults.txt");
    const result = parseExtractionStdout(stdout);
    expect(result.ok).toBe(true);
    if (result.ok !== true) return;
    expect(result.shape.name).toBe("Unnamed");
    expect(result.shape.type).toBe(1);
    expect(result.shape.position).toEqual({ x: 1, y: 1 });
    expect(result.shape.size).toEqual({ width: 2, height: 2 });
    expect(result.shape.rotation).toBe(0);
    expect(result.shape.adjustments).toBeUndefined();
    expect(result.shape.nativePptxRelPath).toBeUndefined();
    expect(result.shape.isGroup).toBe(false);
    expect(result.shape.isPicture).toBe(false);
    expect(result.shape.line.weight).toBe(1);
  });
});

describe("parseExtractionStdout — failure paths", () => {
  it("surfaces an ERROR: line with reason='error-line'", () => {
    const stdout = loadFixture("no-shape-selected.txt");
    const result = parseExtractionStdout(stdout);
    expect(result.ok).toBe(false);
    if (result.ok !== false) return;
    expect(result.reason).toBe("error-line");
    expect(result.error).toContain("No shape selected");
  });

  it("surfaces the textbox rejection ERROR: line", () => {
    const stdout = loadFixture("textbox-rejected.txt");
    const result = parseExtractionStdout(stdout);
    expect(result.ok).toBe(false);
    if (result.ok !== false) return;
    expect(result.reason).toBe("error-line");
    expect(result.error).toBe("Text boxes are not supported. Select a basic shape instead.");
  });

  it("reports reason='no-json' when stdout has STEP lines but no JSON", () => {
    const stdout = loadFixture("no-json.txt");
    const result = parseExtractionStdout(stdout);
    expect(result.ok).toBe(false);
    if (result.ok !== false) return;
    expect(result.reason).toBe("no-json");
    expect(result.error).toBe("No JSON data in PowerShell output");
  });

  it("reports reason='invalid-json' when the JSON line is truncated", () => {
    const stdout = loadFixture("malformed-json.txt");
    const result = parseExtractionStdout(stdout);
    expect(result.ok).toBe(false);
    if (result.ok !== false) return;
    expect(result.reason).toBe("invalid-json");
    expect(result.error).toMatch(/^Failed to parse JSON:/);
  });

  it("ERROR: line wins over a trailing JSON line (priority check)", () => {
    const stdout = 'STEP1\nERROR:failed early\n{"name":"Too late","type":1}\n';
    const result = parseExtractionStdout(stdout);
    expect(result.ok).toBe(false);
    if (result.ok !== false) return;
    expect(result.reason).toBe("error-line");
    expect(result.error).toBe("failed early");
  });

  it("accepts empty stdout as no-json", () => {
    const result = parseExtractionStdout("");
    expect(result.ok).toBe(false);
    if (result.ok !== false) return;
    expect(result.reason).toBe("no-json");
  });
});

describe("mapExtractionData — defaults", () => {
  it("coerces missing type, rotation, and position", () => {
    const data: RawExtractionJson = { name: "X" };
    const shape = mapExtractionData(data);
    expect(shape.type).toBe(1);
    expect(shape.rotation).toBe(0);
    expect(shape.position).toEqual({ x: 1, y: 1 });
    expect(shape.size).toEqual({ width: 2, height: 2 });
    expect(shape.line.weight).toBe(1);
  });

  it("treats a zero-length name as Unnamed", () => {
    const shape = mapExtractionData({ name: "" });
    expect(shape.name).toBe("Unnamed");
  });

  it("preserves a zero rotation without replacing it with a default", () => {
    const shape = mapExtractionData({ rotation: 0 });
    expect(shape.rotation).toBe(0);
  });

  it("rejects a non-array adjustments value", () => {
    // Simulate a malformed-but-typed payload. Cast through unknown to bypass
    // the compile-time contract while still exercising the runtime guard.
    const shape = mapExtractionData({ adjustments: "oops" as unknown as number[] });
    expect(shape.adjustments).toBeUndefined();
  });

  it("preserves explicit zero fill transparency", () => {
    const shape = mapExtractionData({ fillColor: "#fff", fillTransparency: 0 });
    expect(shape.fill.transparency).toBe(0);
  });
});
