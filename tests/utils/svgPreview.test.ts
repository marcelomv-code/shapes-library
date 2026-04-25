import { describe, it, expect } from "vitest";
import { generateSvgPreview, svgToDataUrl } from "../../src/utils/svgPreview";
import type { ShapeInfo } from "../../src/types/shapes";

function shape(partial: Partial<ShapeInfo> = {}): ShapeInfo {
  return {
    id: "test",
    name: "Test",
    category: "basic",
    preview: "test.svg",
    ...partial,
  };
}

describe("generateSvgPreview", () => {
  it("wraps output in an <svg> element with a canvas background", () => {
    const svg = generateSvgPreview(shape());
    expect(svg).toMatch(/^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg).toMatch(/<rect width="400" height="300" fill="#f5f5f5"\/>/);
  });

  it("defaults to a rectangle when pptxDefinition is absent", () => {
    const svg = generateSvgPreview(shape());
    expect(svg).toMatch(/<rect x="[^"]+" y="[^"]+" width="[^"]+" height="[^"]+"/);
    expect(svg).toMatch(/fill="#4472C4"/);
    expect(svg).toMatch(/stroke="#2E5AAA"/);
  });

  it("honours custom fill and stroke", () => {
    const svg = generateSvgPreview(
      shape({
        pptxDefinition: {
          type: "rectangle",
          x: 0,
          y: 0,
          w: 2,
          h: 2,
          fill: { color: "FF0000" },
          line: { color: "00FF00", width: 3 },
        },
      })
    );
    expect(svg).toMatch(/fill="#FF0000"/);
    expect(svg).toMatch(/stroke="#00FF00"/);
    expect(svg).toMatch(/stroke-width="3"/);
  });

  it("emits a rounded rect for roundRectangle", () => {
    const svg = generateSvgPreview(shape({ pptxDefinition: { type: "roundRectangle", x: 0, y: 0, w: 2, h: 2 } }));
    expect(svg).toMatch(/rx="10"/);
    expect(svg).toMatch(/ry="10"/);
  });

  it("emits an <ellipse> for ellipse", () => {
    const svg = generateSvgPreview(shape({ pptxDefinition: { type: "ellipse", x: 0, y: 0, w: 2, h: 2 } }));
    expect(svg).toMatch(/<ellipse/);
  });

  it("emits a <polygon> for triangle and diamond", () => {
    expect(generateSvgPreview(shape({ pptxDefinition: { type: "triangle", x: 0, y: 0, w: 2, h: 2 } }))).toMatch(
      /<polygon/
    );
    expect(generateSvgPreview(shape({ pptxDefinition: { type: "diamond", x: 0, y: 0, w: 2, h: 2 } }))).toMatch(
      /<polygon/
    );
  });

  it.each(["rightArrow", "leftArrow", "upArrow", "downArrow"] as const)("emits an arrow polygon for %s", (type) => {
    const svg = generateSvgPreview(shape({ pptxDefinition: { type, x: 0, y: 0, w: 2, h: 2 } }));
    expect(svg).toMatch(/<polygon points="/);
  });

  it("falls back to a labelled rectangle for unknown shape types", () => {
    const svg = generateSvgPreview(
      shape({
        name: "Mystery",
        // Force an unmapped case to trigger the default branch.
        pptxDefinition: { type: "pentagon", x: 0, y: 0, w: 2, h: 2 },
      })
    );
    expect(svg).toMatch(/<text/);
    expect(svg).toContain(">Mystery</text>");
  });
});

describe("svgToDataUrl", () => {
  it("produces a base64 data URL that round-trips", () => {
    const svg = "<svg/>";
    const url = svgToDataUrl(svg);
    expect(url.startsWith("data:image/svg+xml;base64,")).toBe(true);
    const payload = url.slice("data:image/svg+xml;base64,".length);
    expect(Buffer.from(payload, "base64").toString("utf-8")).toBe(svg);
  });
});
