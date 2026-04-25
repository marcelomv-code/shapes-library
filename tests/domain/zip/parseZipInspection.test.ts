/**
 * Phase 12 contract tests — inspect-zip.ps1 + `unzip -l` stdout parsers.
 *
 * Fixtures under `tests/fixtures/zip-inspect/` mirror what the inspector
 * actually produces. Tests exercise success, explicit ERROR line, and every
 * malformed branch the parser distinguishes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseZipInspectionStdout, parseUnzipListingOutput } from "../../../src/domain/zip/parseZipInspection";
import { assertZipEntries, DEFAULT_ZIP_LIMITS } from "../../../src/domain/zip/zipSafety";

const FIXTURES_DIR = join(__dirname, "..", "..", "fixtures", "zip-inspect");
const loadFixture = (name: string): string => readFileSync(join(FIXTURES_DIR, name), "utf8");

describe("parseZipInspectionStdout — inspect-zip.ps1", () => {
  it("parses a legitimate archive listing", () => {
    const r = parseZipInspectionStdout(loadFixture("safe.txt"));
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    expect(r.entries).toHaveLength(5);
    expect(r.entries[0]).toEqual({ name: "shapes/", size: 0, isDirectory: true });
    expect(r.entries[1]).toEqual({ name: "shapes/rectangle.json", size: 1234, isDirectory: false });
    expect(r.entries[4].name).toBe("native/shape_captured_1.pptx");
    expect(r.entries[4].size).toBe(9100);
  });

  it("reports the ERROR line", () => {
    const r = parseZipInspectionStdout(loadFixture("inspect-error.txt"));
    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.reason).toBe("error-line");
      expect(r.error).toBe("Zip not found: C:\\does\\not\\exist.zip");
    }
  });

  it("preserves a zip-slip path intact so the validator can catch it later", () => {
    const r = parseZipInspectionStdout(loadFixture("zip-slip.txt"));
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    expect(r.entries.map((e) => e.name)).toContain("../../../Windows/System32/evil.dll");
    // And the downstream validator refuses it.
    const v = assertZipEntries(r.entries);
    expect(v.ok).toBe(false);
  });

  it("preserves a zipbomb size so the validator can catch it later", () => {
    const r = parseZipInspectionStdout(loadFixture("zipbomb.txt"));
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    const big = r.entries.find((e) => e.name === "data/bomb.bin");
    expect(big?.size).toBe(10_737_418_240);
    const v = assertZipEntries(r.entries);
    expect(v.ok).toBe(false);
    if (v.ok === false) expect(v.violation.kind).toBe("entry-size");
  });

  it("rejects a malformed line (non-numeric size)", () => {
    const r = parseZipInspectionStdout(loadFixture("malformed.txt"));
    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.reason).toBe("malformed");
      expect(r.error).toContain("Non-numeric size");
    }
  });

  it("rejects output missing the OK: terminator", () => {
    const r = parseZipInspectionStdout(loadFixture("missing-terminator.txt"));
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toBe("missing-terminator");
  });

  it("rejects when OK:<count> disagrees with parsed entries", () => {
    const r = parseZipInspectionStdout(loadFixture("count-mismatch.txt"));
    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.reason).toBe("count-mismatch");
      expect(r.error).toMatch(/5/);
    }
  });

  it("rejects entirely empty output", () => {
    const r = parseZipInspectionStdout("");
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toBe("missing-terminator");
  });

  it("tolerates CRLF line endings", () => {
    const r = parseZipInspectionStdout("0|a/\r\n10|a/b.txt\r\nOK:2\r\n");
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    expect(r.entries).toHaveLength(2);
    expect(r.entries[1].name).toBe("a/b.txt");
  });

  it("rejects a line missing the pipe separator", () => {
    const r = parseZipInspectionStdout("no-pipe-here\nOK:1\n");
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toBe("malformed");
  });
});

describe("parseUnzipListingOutput — unzip -l", () => {
  it("parses the listing produced by info-zip unzip", () => {
    const r = parseUnzipListingOutput(loadFixture("unzip-list-safe.txt"));
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    expect(r.entries).toHaveLength(3);
    expect(r.entries[0]).toEqual({ name: "shapes/", size: 0, isDirectory: true });
    expect(r.entries[1]).toEqual({
      name: "shapes/rectangle.json",
      size: 1234,
      isDirectory: false,
    });
    // Names can contain spaces — important that the column slice respects them.
    expect(r.entries[2].name).toBe("assets/preview name.png");
    expect(r.entries[2].size).toBe(5678);
  });

  it("preserves unsafe paths for the downstream validator", () => {
    const r = parseUnzipListingOutput(loadFixture("unzip-list-zipslip.txt"));
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    expect(r.entries.some((e) => e.name === "../../etc/passwd")).toBe(true);
    const v = assertZipEntries(r.entries);
    expect(v.ok).toBe(false);
  });

  it("rejects output without a header row", () => {
    const r = parseUnzipListingOutput("Archive:  junk.zip\n(no listing)\n");
    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.reason).toBe("malformed");
      expect(r.error).toMatch(/header/i);
    }
  });

  it("rejects output missing the dividers", () => {
    const r = parseUnzipListingOutput("  Length      Date    Time    Name\n0 x x shapes/\n");
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.error).toMatch(/divider/i);
  });
});

describe("integration — parser + validator", () => {
  it("end-to-end: safe fixture passes full pipeline", () => {
    const parsed = parseZipInspectionStdout(loadFixture("safe.txt"));
    expect(parsed.ok).toBe(true);
    if (parsed.ok !== true) return;
    const v = assertZipEntries(parsed.entries, DEFAULT_ZIP_LIMITS);
    expect(v.ok).toBe(true);
  });
});
