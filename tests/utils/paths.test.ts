import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";
import { __raycast } from "../mocks/raycast-api";
import {
  getLibraryRoot,
  getShapesDir,
  getAssetsDir,
  getNativeDir,
  resetLibraryRootCache,
  __setSandboxRoots,
} from "../../src/utils/paths";

let tmpRoot: string;
let supportPath: string;

beforeEach(() => {
  resetLibraryRootCache();
  __setSandboxRoots(undefined);
  tmpRoot = mkdtempSync(join(tmpdir(), "shapes-paths-"));
  // Use tmpRoot as the Raycast support path so existing tests that anchor
  // libraryPath under tmpRoot stay inside the default sandbox.
  supportPath = tmpRoot;
  __raycast.setSupportPath(supportPath);
});

afterEach(() => {
  resetLibraryRootCache();
  __setSandboxRoots(undefined);
  if (existsSync(tmpRoot)) rmSync(tmpRoot, { recursive: true, force: true });
});

describe("getLibraryRoot", () => {
  it("falls back to supportPath when libraryPath is empty", () => {
    __raycast.setPrefs({ libraryPath: "" });
    const root = getLibraryRoot();
    expect(root).toBe(supportPath);
    expect(existsSync(root)).toBe(true);
  });

  it("uses libraryPath when provided (absolute)", () => {
    const custom = join(tmpRoot, "my-library");
    __raycast.setPrefs({ libraryPath: custom });
    const root = getLibraryRoot();
    expect(root).toBe(custom);
    expect(existsSync(custom)).toBe(true);
  });

  it("memoizes the resolution across calls", () => {
    __raycast.setPrefs({ libraryPath: join(tmpRoot, "lib-a") });
    const first = getLibraryRoot();

    // Change prefs after first resolve — cache must win.
    __raycast.setPrefs({ libraryPath: join(tmpRoot, "lib-b") });
    const second = getLibraryRoot();

    expect(second).toBe(first);
  });

  it("resetLibraryRootCache() forces re-resolution", () => {
    __raycast.setPrefs({ libraryPath: join(tmpRoot, "lib-a") });
    const first = getLibraryRoot();

    resetLibraryRootCache();
    const newRoot = join(tmpRoot, "lib-b");
    __raycast.setPrefs({ libraryPath: newRoot });
    const second = getLibraryRoot();

    expect(second).toBe(newRoot);
    expect(second).not.toBe(first);
  });

  it("strips surrounding double quotes from libraryPath", () => {
    const custom = join(tmpRoot, "quoted");
    __raycast.setPrefs({ libraryPath: `"${custom}"` });
    expect(getLibraryRoot()).toBe(custom);
  });

  it("strips surrounding single quotes from libraryPath", () => {
    const custom = join(tmpRoot, "quoted-s");
    __raycast.setPrefs({ libraryPath: `'${custom}'` });
    expect(getLibraryRoot()).toBe(custom);
  });

  it("expands %VAR% style environment references", () => {
    process.env.__SHAPES_TEST_ROOT = tmpRoot;
    try {
      __raycast.setPrefs({ libraryPath: "%__SHAPES_TEST_ROOT%/envlib" });
      const root = getLibraryRoot();
      expect(root).toBe(join(tmpRoot, "envlib"));
    } finally {
      delete process.env.__SHAPES_TEST_ROOT;
    }
  });

  it("expands ~ to the home directory", () => {
    // Point libraryPath at ~/<something unique under home>. We do not create
    // anything; `mkdirSync(recursive: true)` will make the path, but we pick
    // a clearly scoped subfolder name and immediately remove it below.
    const marker = `shapes-library-test-${process.pid}-${Date.now()}`;
    __raycast.setPrefs({ libraryPath: `~/${marker}` });

    const root = getLibraryRoot();
    const expected = join(homedir(), marker);
    try {
      expect(root).toBe(expected);
    } finally {
      if (existsSync(expected)) rmSync(expected, { recursive: true, force: true });
    }
  });

  it("anchors a relative libraryPath to the home directory", () => {
    const marker = `shapes-library-rel-${process.pid}-${Date.now()}`;
    __raycast.setPrefs({ libraryPath: marker });
    const root = getLibraryRoot();
    const expected = join(homedir(), marker);
    try {
      expect(root).toBe(expected);
    } finally {
      if (existsSync(expected)) rmSync(expected, { recursive: true, force: true });
    }
  });
});

describe("sandbox", () => {
  it("rejects an absolute libraryPath outside the sandbox", () => {
    const allowed = join(tmpRoot, "allowed");
    __setSandboxRoots([allowed]);
    __raycast.setPrefs({ libraryPath: join(tmpRoot, "outside") });
    expect(() => getLibraryRoot()).toThrow(/out of sandbox/i);
  });

  it("rejects a libraryPath that escapes the sandbox via .. traversal", () => {
    const allowed = join(tmpRoot, "scoped");
    __setSandboxRoots([allowed]);
    // Relative path. expandUserPath anchors to homedir() then normalizes;
    // enough `..` segments climb out of homedir() and out of `allowed`.
    __raycast.setPrefs({ libraryPath: "../".repeat(20) + "etc" });
    expect(() => getLibraryRoot()).toThrow(/out of sandbox/i);
  });

  it("accepts a libraryPath inside an explicit sandbox root", () => {
    const inside = join(tmpRoot, "inside");
    __setSandboxRoots([tmpRoot]);
    __raycast.setPrefs({ libraryPath: inside });
    expect(getLibraryRoot()).toBe(inside);
    expect(existsSync(inside)).toBe(true);
  });

  it("accepts a libraryPath under the default supportPath sandbox root", () => {
    // No override — default roots are [homedir(), supportPath]. The
    // beforeEach configured supportPath = tmpRoot, so anything under
    // tmpRoot must pass.
    const inside = join(tmpRoot, "default-ok");
    __raycast.setPrefs({ libraryPath: inside });
    expect(getLibraryRoot()).toBe(inside);
  });

  it("accepts a libraryPath under the default homedir sandbox root", () => {
    // No override — homedir() is the other default sandbox root.
    const marker = `shapes-library-sandbox-${process.pid}-${Date.now()}`;
    __raycast.setPrefs({ libraryPath: `~/${marker}` });
    const expected = join(homedir(), marker);
    try {
      expect(getLibraryRoot()).toBe(expected);
    } finally {
      if (existsSync(expected)) rmSync(expected, { recursive: true, force: true });
    }
  });
});

describe("derived directories", () => {
  beforeEach(() => {
    __raycast.setPrefs({ libraryPath: join(tmpRoot, "lib") });
  });

  it("getShapesDir returns <root>/shapes and creates it", () => {
    const dir = getShapesDir();
    expect(dir).toBe(join(tmpRoot, "lib", "shapes"));
    expect(existsSync(dir)).toBe(true);
  });

  it("getAssetsDir returns <root>/assets and creates it", () => {
    const dir = getAssetsDir();
    expect(dir).toBe(join(tmpRoot, "lib", "assets"));
    expect(existsSync(dir)).toBe(true);
  });

  it("getNativeDir returns <root>/native and creates it", () => {
    const dir = getNativeDir();
    expect(dir).toBe(join(tmpRoot, "lib", "native"));
    expect(existsSync(dir)).toBe(true);
  });
});
