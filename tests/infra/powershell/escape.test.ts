import { describe, it, expect } from "vitest";
import { psSingleQuote, psPath, encodePSCommand } from "../../../src/infra/powershell/escape";

describe("psSingleQuote", () => {
  it("leaves plain ASCII untouched", () => {
    expect(psSingleQuote("hello world")).toBe("hello world");
  });

  it("doubles single quotes per PS literal rules", () => {
    expect(psSingleQuote("it's")).toBe("it''s");
    expect(psSingleQuote("''")).toBe("''''");
  });

  it("strips NUL bytes while preserving surrounding text", () => {
    expect(psSingleQuote("a\u0000b\u0000c")).toBe("abc");
  });

  it("preserves tabs and newlines inside the literal", () => {
    expect(psSingleQuote("line1\nline2\tend")).toBe("line1\nline2\tend");
  });

  it("returns empty string for nullish input", () => {
    // @ts-expect-error — exercising defensive null branch
    expect(psSingleQuote(null)).toBe("");
    // @ts-expect-error — exercising defensive undefined branch
    expect(psSingleQuote(undefined)).toBe("");
  });

  it("coerces non-string input to string before escaping", () => {
    // @ts-expect-error — number coerced to string
    expect(psSingleQuote(42)).toBe("42");
  });

  it("handles a path with apostrophes and NULs combined", () => {
    expect(psSingleQuote("C:\\Users\\O'Brien\u0000\\file.pptx")).toBe("C:\\Users\\O''Brien\\file.pptx");
  });
});

describe("psPath", () => {
  it("aliases psSingleQuote for filesystem paths", () => {
    const path = "C:\\Program Files\\Microsoft Office\\root\\Office16";
    expect(psPath(path)).toBe(psSingleQuote(path));
  });

  it("escapes an apostrophe inside a Windows path", () => {
    expect(psPath("C:\\Users\\d'Artagnan\\lib")).toBe("C:\\Users\\d''Artagnan\\lib");
  });
});

describe("encodePSCommand", () => {
  it("produces a base64 UTF-16LE encoding suitable for -EncodedCommand", () => {
    const script = "Write-Host 'hi'";
    const encoded = encodePSCommand(script);
    // Round-trip through the same encoding PowerShell uses for -EncodedCommand.
    const decoded = Buffer.from(encoded, "base64").toString("utf16le");
    expect(decoded).toBe(script);
  });

  it("handles non-ASCII characters (UTF-16LE round trip)", () => {
    const script = "Write-Host 'olá — mundo'";
    const decoded = Buffer.from(encodePSCommand(script), "base64").toString("utf16le");
    expect(decoded).toBe(script);
  });

  it("emits a valid base64 string (only base64 alphabet)", () => {
    const encoded = encodePSCommand("Get-Process");
    expect(encoded).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});
