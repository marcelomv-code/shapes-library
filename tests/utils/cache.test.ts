import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, utimesSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { getCachedShapes, setCachedShapes, clearCache, clearCategoryCache, getCacheStats } from "../../src/utils/cache";
import type { ShapeInfo } from "../../src/types/shapes";

/**
 * The cache module keeps a single module-level map. Every test starts by
 * wiping it via `clearCache()` so earlier tests do not leak state.
 */

let tmpRoot: string;

function sampleShape(id: string): ShapeInfo {
  return {
    id,
    name: `Shape ${id}`,
    category: "basic",
    preview: `${id}.svg`,
  };
}

beforeEach(() => {
  clearCache();
  tmpRoot = mkdtempSync(join(tmpdir(), "shapes-cache-"));
});

afterEach(() => {
  clearCache();
  if (existsSync(tmpRoot)) rmSync(tmpRoot, { recursive: true, force: true });
});

describe("cache", () => {
  it("returns null on miss", () => {
    const filePath = join(tmpRoot, "basic.json");
    writeFileSync(filePath, "[]");
    expect(getCachedShapes("basic", filePath)).toBeNull();
  });

  it("stores and retrieves shapes for a category", () => {
    const filePath = join(tmpRoot, "basic.json");
    writeFileSync(filePath, "[]");
    const shapes = [sampleShape("a"), sampleShape("b")];

    setCachedShapes("basic", filePath, shapes);

    expect(getCachedShapes("basic", filePath)).toEqual(shapes);
  });

  it("invalidates when the file mtime changes", () => {
    const filePath = join(tmpRoot, "basic.json");
    writeFileSync(filePath, "[]");
    setCachedShapes("basic", filePath, [sampleShape("x")]);

    // Bump mtime by one second in the future.
    const future = new Date(Date.now() + 1000);
    utimesSync(filePath, future, future);

    expect(getCachedShapes("basic", filePath)).toBeNull();
  });

  it("returns null and drops the entry when file is missing", () => {
    const filePath = join(tmpRoot, "gone.json");
    writeFileSync(filePath, "[]");
    setCachedShapes("basic", filePath, [sampleShape("x")]);
    rmSync(filePath);

    expect(getCachedShapes("basic", filePath)).toBeNull();
    // Entry should be dropped, so stats reflect an empty cache.
    expect(getCacheStats().categoriesInCache).toBe(0);
  });

  it("does not cache when setCachedShapes is called against a missing file", () => {
    const filePath = join(tmpRoot, "no-such.json");
    setCachedShapes("basic", filePath, [sampleShape("x")]);

    expect(getCacheStats().categoriesInCache).toBe(0);
  });

  it("clearCategoryCache drops only the named category", () => {
    const basic = join(tmpRoot, "basic.json");
    const arrows = join(tmpRoot, "arrows.json");
    writeFileSync(basic, "[]");
    writeFileSync(arrows, "[]");
    setCachedShapes("basic", basic, [sampleShape("a")]);
    setCachedShapes("arrows", arrows, [sampleShape("b")]);

    clearCategoryCache("basic");

    expect(getCachedShapes("basic", basic)).toBeNull();
    expect(getCachedShapes("arrows", arrows)).toEqual([sampleShape("b")]);
  });

  it("clearCache drops everything", () => {
    const basic = join(tmpRoot, "basic.json");
    const arrows = join(tmpRoot, "arrows.json");
    writeFileSync(basic, "[]");
    writeFileSync(arrows, "[]");
    setCachedShapes("basic", basic, [sampleShape("a")]);
    setCachedShapes("arrows", arrows, [sampleShape("b")]);

    clearCache();

    expect(getCacheStats().categoriesInCache).toBe(0);
    expect(getCacheStats().totalShapesCached).toBe(0);
  });

  it("getCacheStats reports counts across categories", () => {
    const basic = join(tmpRoot, "basic.json");
    const arrows = join(tmpRoot, "arrows.json");
    writeFileSync(basic, "[]");
    writeFileSync(arrows, "[]");
    setCachedShapes("basic", basic, [sampleShape("a"), sampleShape("b")]);
    setCachedShapes("arrows", arrows, [sampleShape("c")]);

    const stats = getCacheStats();

    expect(stats.categoriesInCache).toBe(2);
    expect(stats.totalShapesCached).toBe(3);
    expect(stats.categories.sort()).toEqual(["arrows", "basic"]);
  });
});
