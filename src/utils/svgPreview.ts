import { ShapeInfo } from "../types/shapes";

/**
 * Generate SVG preview for a shape instantly
 * Much faster than PowerPoint COM API
 */
export function generateSvgPreview(shape: ShapeInfo): string {
  const def = shape.pptxDefinition ?? { type: "rectangle", x: 0, y: 0, w: 2, h: 2 };

  // Convert inches to pixels (assuming 96 DPI)
  const scale = 96;
  const width = 400;
  const height = 300;

  // Calculate shape bounds in SVG
  const shapeWidth = (def.w || 2) * scale;
  const shapeHeight = (def.h || 2) * scale;
  const shapeX = width / 2 - shapeWidth / 2;
  const shapeY = height / 2 - shapeHeight / 2;

  // Get fill color
  const fillColor = def.fill?.color || "4472C4";
  const fill = `#${fillColor}`;

  // Get stroke
  const strokeColor = def.line?.color || "2E5AAA";
  const strokeWidth = def.line?.width || 1;
  const stroke = `#${strokeColor}`;

  // Generate SVG based on shape type
  let shapeSvg = "";

  switch (def.type) {
    case "rectangle":
      shapeSvg = `<rect x="${shapeX}" y="${shapeY}" width="${shapeWidth}" height="${shapeHeight}"
                   fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;

    case "roundRectangle":
      shapeSvg = `<rect x="${shapeX}" y="${shapeY}" width="${shapeWidth}" height="${shapeHeight}"
                   rx="10" ry="10" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;

    case "ellipse":
      const rx = shapeWidth / 2;
      const ry = shapeHeight / 2;
      const cx = shapeX + rx;
      const cy = shapeY + ry;
      shapeSvg = `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"
                   fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;

    case "triangle":
      const p1x = shapeX + shapeWidth / 2;
      const p1y = shapeY;
      const p2x = shapeX;
      const p2y = shapeY + shapeHeight;
      const p3x = shapeX + shapeWidth;
      const p3y = shapeY + shapeHeight;
      shapeSvg = `<polygon points="${p1x},${p1y} ${p2x},${p2y} ${p3x},${p3y}"
                   fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;

    case "diamond":
      const dx1 = shapeX + shapeWidth / 2;
      const dy1 = shapeY;
      const dx2 = shapeX + shapeWidth;
      const dy2 = shapeY + shapeHeight / 2;
      const dx3 = shapeX + shapeWidth / 2;
      const dy3 = shapeY + shapeHeight;
      const dx4 = shapeX;
      const dy4 = shapeY + shapeHeight / 2;
      shapeSvg = `<polygon points="${dx1},${dy1} ${dx2},${dy2} ${dx3},${dy3} ${dx4},${dy4}"
                   fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      break;

    case "rightArrow":
      shapeSvg = generateArrowSvg(shapeX, shapeY, shapeWidth, shapeHeight, "right", fill, stroke, strokeWidth);
      break;

    case "leftArrow":
      shapeSvg = generateArrowSvg(shapeX, shapeY, shapeWidth, shapeHeight, "left", fill, stroke, strokeWidth);
      break;

    case "upArrow":
      shapeSvg = generateArrowSvg(shapeX, shapeY, shapeWidth, shapeHeight, "up", fill, stroke, strokeWidth);
      break;

    case "downArrow":
      shapeSvg = generateArrowSvg(shapeX, shapeY, shapeWidth, shapeHeight, "down", fill, stroke, strokeWidth);
      break;

    default:
      // Fallback: draw a rectangle for unknown shapes
      shapeSvg = `<rect x="${shapeX}" y="${shapeY}" width="${shapeWidth}" height="${shapeHeight}"
                   fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>
                   <text x="${width / 2}" y="${height / 2 + 60}" text-anchor="middle"
                   font-family="Arial" font-size="14" fill="#666">${shape.name}</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="#f5f5f5"/>
    ${shapeSvg}
  </svg>`;
}

function generateArrowSvg(
  x: number,
  y: number,
  w: number,
  h: number,
  direction: "left" | "right" | "up" | "down",
  fill: string,
  stroke: string,
  strokeWidth: number
): string {
  const points: string[] = [];

  switch (direction) {
    case "right":
      points.push(
        `${x},${y + h * 0.3}`,
        `${x + w * 0.7},${y + h * 0.3}`,
        `${x + w * 0.7},${y}`,
        `${x + w},${y + h * 0.5}`,
        `${x + w * 0.7},${y + h}`,
        `${x + w * 0.7},${y + h * 0.7}`,
        `${x},${y + h * 0.7}`
      );
      break;
    case "left":
      points.push(
        `${x + w},${y + h * 0.3}`,
        `${x + w * 0.3},${y + h * 0.3}`,
        `${x + w * 0.3},${y}`,
        `${x},${y + h * 0.5}`,
        `${x + w * 0.3},${y + h}`,
        `${x + w * 0.3},${y + h * 0.7}`,
        `${x + w},${y + h * 0.7}`
      );
      break;
    case "up":
      points.push(
        `${x + w * 0.3},${y + h}`,
        `${x + w * 0.3},${y + h * 0.3}`,
        `${x},${y + h * 0.3}`,
        `${x + w * 0.5},${y}`,
        `${x + w},${y + h * 0.3}`,
        `${x + w * 0.7},${y + h * 0.3}`,
        `${x + w * 0.7},${y + h}`
      );
      break;
    case "down":
      points.push(
        `${x + w * 0.3},${y}`,
        `${x + w * 0.3},${y + h * 0.7}`,
        `${x},${y + h * 0.7}`,
        `${x + w * 0.5},${y + h}`,
        `${x + w},${y + h * 0.7}`,
        `${x + w * 0.7},${y + h * 0.7}`,
        `${x + w * 0.7},${y}`
      );
      break;
  }

  return `<polygon points="${points.join(" ")}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
}

/**
 * Convert SVG string to data URL for use in Raycast
 */
export function svgToDataUrl(svg: string): string {
  const encoded = Buffer.from(svg).toString("base64");
  return `data:image/svg+xml;base64,${encoded}`;
}
