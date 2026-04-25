import { describe, it, expect } from "vitest";
import { parseCompactDeckStdout } from "../../../src/domain/powerpoint/parseCompactDeck";

describe("parseCompactDeckStdout", () => {
  it("parses a clean OK line", () => {
    const result = parseCompactDeckStdout("OK:12|345678\n");
    expect(result).toEqual({ ok: true, slideCount: 12, bytes: 345678 });
  });

  it("accepts Write-Host breadcrumbs before the OK line", () => {
    const stdout = "Creating deck handle...\nSaved to C:\\Users\\x\\tmp.pptx\nOK:3|1024\n";
    const result = parseCompactDeckStdout(stdout);
    expect(result).toEqual({ ok: true, slideCount: 3, bytes: 1024 });
  });

  it("tolerates CRLF line endings", () => {
    const result = parseCompactDeckStdout("noise\r\nOK:1|2\r\n");
    expect(result).toEqual({ ok: true, slideCount: 1, bytes: 2 });
  });

  it("prefers the ERROR line over any OK line on the same buffer", () => {
    // If PS writes ERROR then exits 1, trailing OK text is junk.
    const stdout = "OK:5|100\nERROR:Access denied\n";
    const result = parseCompactDeckStdout(stdout);
    expect(result).toEqual({ ok: false, reason: "error-line", message: "Access denied" });
  });

  it("extracts the ERROR message verbatim (trimmed)", () => {
    const result = parseCompactDeckStdout("ERROR:Deck is locked by PowerPoint\n");
    expect(result).toEqual({
      ok: false,
      reason: "error-line",
      message: "Deck is locked by PowerPoint",
    });
  });

  it("reports no-ok-line when stdout has no sentinel at all", () => {
    const result = parseCompactDeckStdout("Hello world\n");
    expect(result).toEqual({
      ok: false,
      reason: "no-ok-line",
      message: "No OK sentinel in compact-deck output",
    });
  });

  it("reports malformed-ok-line when the OK pipe token is missing", () => {
    const result = parseCompactDeckStdout("OK:12\n");
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.reason).toBe("malformed-ok-line");
    }
  });

  it("reports malformed-ok-line when values are non-numeric", () => {
    const result = parseCompactDeckStdout("OK:xx|yy\n");
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.reason).toBe("malformed-ok-line");
    }
  });

  it("is an empty-string pass-through (no OK, no ERROR)", () => {
    const result = parseCompactDeckStdout("");
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe("no-ok-line");
  });
});
