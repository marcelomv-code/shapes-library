/**
 * Phase 12 contract tests — Zip Slip + zipbomb guards.
 *
 * Pins the exact rules enforced by `src/domain/zip/zipSafety.ts`. Every
 * violation class has at least one positive and one negative case so the
 * detector's boundary is unambiguous.
 */
import { describe, it, expect } from "vitest";
import {
  validateEntryPath,
  assertZipEntries,
  describeZipViolation,
  DEFAULT_ZIP_LIMITS,
} from "../../../src/domain/zip/zipSafety";

describe("validateEntryPath — rejection cases (Zip Slip)", () => {
  it("rejects empty string", () => {
    const r = validateEntryPath("");
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toBe("empty");
  });

  it("rejects whitespace-only", () => {
    const r = validateEntryPath("   ");
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toBe("empty");
  });

  it("rejects a null byte embedded in the name", () => {
    const r = validateEntryPath("shapes/evil\0.json");
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toBe("null-byte");
  });

  it("normalizes Windows-producer backslashes to forward slashes", () => {
    // PowerShell's Compress-Archive (and Explorer's Send-To Compressed Folder)
    // write entries with `\` separators in violation of the ZIP spec. We
    // accept them, normalized, so legit Windows-built archives import.
    const r = validateEntryPath("shapes\\sub\\file.json");
    expect(r.ok).toBe(true);
    if (r.ok === true) expect(r.normalized).toBe("shapes/sub/file.json");
  });

  it("rejects a UNC-style backslash-prefixed name as absolute-windows", () => {
    // `\\evil\share\x` normalizes to `//evil/share/x` — caught by the
    // absolute-windows check that runs against the canonical form.
    const r = validateEntryPath("\\\\evil\\share\\x");
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toBe("absolute-windows");
  });

  it("catches parent-escape inside a backslash-only path after normalization", () => {
    const r = validateEntryPath("shapes\\..\\..\\Windows\\System32\\evil.dll");
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toBe("parent-escape");
  });

  it("rejects absolute POSIX paths starting with /", () => {
    const r = validateEntryPath("/etc/passwd");
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toBe("absolute-posix");
  });

  it("rejects double-slash (UNC via forward slashes)", () => {
    const r = validateEntryPath("//server/share/x");
    expect(r.ok).toBe(false);
    // Leading / short-circuits as absolute-posix before the // check.
    if (r.ok === false) expect(["absolute-posix", "absolute-windows"]).toContain(r.reason);
  });

  it("rejects drive-letter paths regardless of separator", () => {
    for (const name of ["C:", "C:/foo", "c:/foo/bar", "D:"]) {
      const r = validateEntryPath(name);
      expect(r.ok).toBe(false);
      if (r.ok === false) expect(r.reason).toBe("drive-letter");
    }
  });

  it("rejects parent-escape via ..", () => {
    const r = validateEntryPath("shapes/../etc/passwd");
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toBe("parent-escape");
  });

  it("rejects leading ..", () => {
    const r = validateEntryPath("../outside.json");
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toBe("parent-escape");
  });

  it("rejects when .. is the only segment", () => {
    const r = validateEntryPath("..");
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toBe("parent-escape");
  });

  it("rejects a trailing /..", () => {
    const r = validateEntryPath("shapes/..");
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toBe("parent-escape");
  });
});

describe("validateEntryPath — acceptance cases", () => {
  it("accepts a plain relative file path", () => {
    const r = validateEntryPath("shapes/rectangle.json");
    expect(r.ok).toBe(true);
    if (r.ok === true) expect(r.normalized).toBe("shapes/rectangle.json");
  });

  it("accepts a relative path with a trailing slash (directory entry)", () => {
    const r = validateEntryPath("shapes/");
    expect(r.ok).toBe(true);
    if (r.ok === true) expect(r.normalized).toBe("shapes/");
  });

  it("tolerates . segments (no-op)", () => {
    const r = validateEntryPath("shapes/./rectangle.json");
    expect(r.ok).toBe(true);
    if (r.ok === true) expect(r.normalized).toBe("shapes/rectangle.json");
  });

  it("tolerates a leading ./", () => {
    const r = validateEntryPath("./shapes/rectangle.json");
    expect(r.ok).toBe(true);
    if (r.ok === true) expect(r.normalized).toBe("shapes/rectangle.json");
  });

  it("accepts paths with spaces and unicode", () => {
    const r = validateEntryPath("shapes/my shape αβγ.json");
    expect(r.ok).toBe(true);
    if (r.ok === true) expect(r.normalized).toBe("shapes/my shape αβγ.json");
  });

  it("accepts deeply nested paths", () => {
    const r = validateEntryPath("a/b/c/d/e/f/g/h.json");
    expect(r.ok).toBe(true);
  });

  it("collapses runs of internal slashes", () => {
    // Empty segments from // are dropped by the normalizer, which is safe
    // because no segment is named '..' or '.'.
    const r = validateEntryPath("shapes//rectangle.json");
    expect(r.ok).toBe(true);
    if (r.ok === true) expect(r.normalized).toBe("shapes/rectangle.json");
  });
});

describe("assertZipEntries — limit enforcement (zipbomb)", () => {
  it("accepts a small legitimate archive", () => {
    const r = assertZipEntries([
      { name: "shapes/", size: 0 },
      { name: "shapes/a.json", size: 1234 },
      { name: "assets/preview.png", size: 5678 },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok === true) {
      expect(r.entryCount).toBe(3);
      expect(r.totalBytes).toBe(1234 + 5678);
    }
  });

  it("rejects when entry count exceeds maxEntries", () => {
    const entries = Array.from({ length: 6 }, (_, i) => ({ name: `f${i}.txt`, size: 1 }));
    const r = assertZipEntries(entries, { maxEntries: 5, maxTotalBytes: 1000, maxEntryBytes: 1000 });
    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.violation.kind).toBe("too-many-entries");
      if (r.violation.kind === "too-many-entries") {
        expect(r.violation.actual).toBe(6);
        expect(r.violation.limit).toBe(5);
      }
    }
  });

  it("rejects when a single entry exceeds maxEntryBytes", () => {
    const r = assertZipEntries([{ name: "huge.bin", size: 600 }], {
      maxEntries: 10,
      maxTotalBytes: 10_000,
      maxEntryBytes: 500,
    });
    expect(r.ok).toBe(false);
    if (r.ok === false && r.violation.kind === "entry-size") {
      expect(r.violation.name).toBe("huge.bin");
      expect(r.violation.actual).toBe(600);
      expect(r.violation.limit).toBe(500);
    } else {
      expect.fail("expected entry-size violation");
    }
  });

  it("rejects when total bytes exceed maxTotalBytes", () => {
    const r = assertZipEntries(
      [
        { name: "a.bin", size: 400 },
        { name: "b.bin", size: 400 },
        { name: "c.bin", size: 400 },
      ],
      { maxEntries: 10, maxTotalBytes: 1000, maxEntryBytes: 1000 }
    );
    expect(r.ok).toBe(false);
    if (r.ok === false && r.violation.kind === "total-size") {
      expect(r.violation.actual).toBe(1200);
      expect(r.violation.limit).toBe(1000);
    } else {
      expect.fail("expected total-size violation");
    }
  });

  it("rejects an entry with a negative reported size", () => {
    const r = assertZipEntries([{ name: "bad.bin", size: -1 }]);
    expect(r.ok).toBe(false);
    if (r.ok === false && r.violation.kind === "negative-size") {
      expect(r.violation.name).toBe("bad.bin");
    } else {
      expect.fail("expected negative-size violation");
    }
  });

  it("rejects an entry with an unsafe path (zip-slip in list form)", () => {
    const r = assertZipEntries([
      { name: "shapes/safe.json", size: 100 },
      { name: "../etc/passwd", size: 50 },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok === false && r.violation.kind === "entry-path") {
      expect(r.violation.name).toBe("../etc/passwd");
      expect(r.violation.reason).toBe("parent-escape");
    } else {
      expect.fail("expected entry-path violation");
    }
  });

  it("accepts a zero-entry archive (no-op)", () => {
    const r = assertZipEntries([]);
    expect(r.ok).toBe(true);
    if (r.ok === true) {
      expect(r.entryCount).toBe(0);
      expect(r.totalBytes).toBe(0);
    }
  });

  it("uses DEFAULT_ZIP_LIMITS when none supplied", () => {
    const r = assertZipEntries([{ name: "x.bin", size: DEFAULT_ZIP_LIMITS.maxEntryBytes + 1 }]);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.violation.kind).toBe("entry-size");
  });

  it("NaN / Infinity sizes are coerced to 0 rather than crashing", () => {
    const r = assertZipEntries([
      { name: "a.bin", size: Number.NaN },
      { name: "b.bin", size: Number.POSITIVE_INFINITY },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok === true) expect(r.totalBytes).toBe(0);
  });
});

describe("describeZipViolation", () => {
  it("renders too-many-entries", () => {
    expect(describeZipViolation({ kind: "too-many-entries", actual: 9, limit: 5 })).toBe(
      "Zip rejected: 9 entries exceed limit of 5"
    );
  });

  it("renders total-size", () => {
    expect(describeZipViolation({ kind: "total-size", actual: 123, limit: 100 })).toBe(
      "Zip rejected: uncompressed size 123 bytes exceeds limit of 100 bytes"
    );
  });

  it("renders entry-size with name", () => {
    expect(describeZipViolation({ kind: "entry-size", name: "big.bin", actual: 99, limit: 50 })).toBe(
      'Zip rejected: entry "big.bin" is 99 bytes (limit 50)'
    );
  });

  it("renders entry-path with reason", () => {
    expect(describeZipViolation({ kind: "entry-path", name: "../x", reason: "parent-escape" })).toBe(
      'Zip rejected: unsafe entry path "../x" (parent-escape)'
    );
  });

  it("renders negative-size", () => {
    expect(describeZipViolation({ kind: "negative-size", name: "x", actual: -1 })).toBe(
      'Zip rejected: entry "x" has negative size -1'
    );
  });
});
