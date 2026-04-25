import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, utimesSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { __raycast } from "../mocks/raycast-api";
import { resetLibraryRootCache, __setSandboxRoots } from "../../src/utils/paths";
import {
  loadCategories,
  saveCategories,
  invalidateCategoriesCache,
  getCategoryIds,
  getCategoryDisplayName,
  getCategoryById,
  addCategory,
  renameCategory,
  deleteCategory,
  categoryExists,
  generateCategoryId,
  getShapeCountInCategory,
} from "../../src/utils/categoryManager";

let tmpRoot: string;

beforeEach(() => {
  resetLibraryRootCache();
  invalidateCategoriesCache();
  tmpRoot = mkdtempSync(join(tmpdir(), "shapes-cats-"));
  // Linux runners place tmpdir() under /tmp, outside homedir(); allow it explicitly.
  __setSandboxRoots([tmpRoot]);
  __raycast.setPrefs({ libraryPath: tmpRoot });
});

afterEach(() => {
  resetLibraryRootCache();
  invalidateCategoriesCache();
  __setSandboxRoots(undefined);
  if (existsSync(tmpRoot)) rmSync(tmpRoot, { recursive: true, force: true });
});

describe("loadCategories", () => {
  it("seeds defaults on first run and persists categories.json", () => {
    const categories = loadCategories();
    const ids = categories.map((c) => c.id).sort();
    expect(ids).toEqual(["arrows", "basic", "callouts", "flowchart"]);

    const file = join(tmpRoot, "categories.json");
    expect(existsSync(file)).toBe(true);
    const parsed = JSON.parse(readFileSync(file, "utf-8"));
    expect(parsed.categories.length).toBe(4);
  });

  it("returns a shallow copy (mutations do not leak into the cache)", () => {
    const first = loadCategories();
    first.push({ id: "leaked", name: "leaked" });
    const second = loadCategories();
    expect(second.some((c) => c.id === "leaked")).toBe(false);
  });

  it("picks up external mtime changes", () => {
    loadCategories(); // seed
    const file = join(tmpRoot, "categories.json");
    const custom = {
      categories: [
        { id: "basic", name: "Basic Shapes" },
        { id: "extra", name: "Extra" },
      ],
    };
    writeFileSync(file, JSON.stringify(custom), "utf-8");
    // Force mtime to move forward in case the write lands in the same tick.
    const future = new Date(Date.now() + 2000);
    utimesSync(file, future, future);

    const cats = loadCategories();
    expect(cats.map((c) => c.id).sort()).toEqual(["basic", "extra"]);
  });

  it("returns defaults on malformed JSON without throwing", () => {
    loadCategories(); // seed
    invalidateCategoriesCache();
    const file = join(tmpRoot, "categories.json");
    writeFileSync(file, "{ not json", "utf-8");
    const future = new Date(Date.now() + 2000);
    utimesSync(file, future, future);

    const cats = loadCategories();
    expect(cats.map((c) => c.id)).toContain("basic");
  });
});

describe("saveCategories", () => {
  it("writes and updates the in-process cache", () => {
    saveCategories([{ id: "alpha", name: "Alpha" }]);
    expect(loadCategories()).toEqual([{ id: "alpha", name: "Alpha" }]);
  });

  it("throws with a readable message on write failure", () => {
    // Warm the path cache to a known-good dir, then remove the dir so
    // writeFileSync will hit ENOENT. Avoids the `/proc`-fallback path that
    // would silently degrade onto an empty supportPath and write into CWD.
    loadCategories();
    rmSync(tmpRoot, { recursive: true, force: true });
    expect(() => saveCategories([{ id: "x", name: "X" }])).toThrow(/Failed to save categories/);
  });
});

describe("lookup helpers", () => {
  it("getCategoryIds returns the current id list", () => {
    expect(getCategoryIds().sort()).toEqual(["arrows", "basic", "callouts", "flowchart"]);
  });

  it("getCategoryDisplayName returns the display name, falls back to the id", () => {
    expect(getCategoryDisplayName("basic")).toBe("Basic Shapes");
    expect(getCategoryDisplayName("not-a-category")).toBe("not-a-category");
  });

  it("getCategoryById returns the record or undefined", () => {
    expect(getCategoryById("arrows")).toEqual({ id: "arrows", name: "Arrows" });
    expect(getCategoryById("missing")).toBeUndefined();
  });

  it("categoryExists reflects the current list", () => {
    expect(categoryExists("basic")).toBe(true);
    expect(categoryExists("missing")).toBe(false);
  });
});

describe("addCategory", () => {
  it("validates id format", () => {
    expect(() => addCategory("Bad Id", "Whatever")).toThrow(/lowercase/);
    expect(() => addCategory("snake_case", "x")).toThrow(/lowercase/);
  });

  it("rejects duplicate ids", () => {
    expect(() => addCategory("basic", "Again")).toThrow(/already exists/);
  });

  it("adds a new category and seeds an empty shapes json", () => {
    addCategory("my-cat", "My Cat");
    expect(categoryExists("my-cat")).toBe(true);
    const shapesJson = join(tmpRoot, "shapes", "my-cat.json");
    expect(existsSync(shapesJson)).toBe(true);
    expect(readFileSync(shapesJson, "utf-8")).toBe("[]");
  });
});

describe("renameCategory", () => {
  it("changes the display name", () => {
    renameCategory("basic", "Fundamentals");
    expect(getCategoryDisplayName("basic")).toBe("Fundamentals");
  });

  it("throws when the id is unknown", () => {
    expect(() => renameCategory("missing", "X")).toThrow(/not found/);
  });
});

describe("deleteCategory", () => {
  it("throws when the id is unknown", () => {
    expect(() => deleteCategory("missing")).toThrow(/not found/);
  });

  it("refuses to delete a category that still contains shapes", () => {
    addCategory("temp", "Temp");
    const shapesJson = join(tmpRoot, "shapes", "temp.json");
    writeFileSync(shapesJson, JSON.stringify([{ id: "s1" }]));
    expect(() => deleteCategory("temp")).toThrow(/contains 1 shape/);
  });

  it("deletes an empty category", () => {
    addCategory("empty-cat", "Empty");
    expect(deleteCategory("empty-cat")).toBe(true);
    expect(categoryExists("empty-cat")).toBe(false);
  });
});

describe("getShapeCountInCategory", () => {
  it("returns 0 when the shapes file is absent", () => {
    expect(getShapeCountInCategory("never-created")).toBe(0);
  });

  it("returns 0 for malformed shapes file", () => {
    addCategory("junk-cat", "Junk");
    writeFileSync(join(tmpRoot, "shapes", "junk-cat.json"), "not json");
    expect(getShapeCountInCategory("junk-cat")).toBe(0);
  });

  it("returns 0 when shapes file holds a non-array payload", () => {
    addCategory("obj-cat", "Obj");
    writeFileSync(join(tmpRoot, "shapes", "obj-cat.json"), JSON.stringify({ foo: 1 }));
    expect(getShapeCountInCategory("obj-cat")).toBe(0);
  });

  it("counts array entries", () => {
    addCategory("c1", "C1");
    writeFileSync(join(tmpRoot, "shapes", "c1.json"), JSON.stringify([{ id: "a" }, { id: "b" }, { id: "c" }]));
    expect(getShapeCountInCategory("c1")).toBe(3);
  });
});

describe("invalidateCategoriesCache", () => {
  it("drops the memo so the next load re-reads the file", () => {
    loadCategories(); // warm
    const file = join(tmpRoot, "categories.json");
    writeFileSync(
      file,
      JSON.stringify({
        categories: [
          { id: "basic", name: "B" },
          { id: "fresh", name: "F" },
        ],
      }),
      "utf-8"
    );
    // Do NOT bump mtime — simulate a same-mtime write collision.
    invalidateCategoriesCache();
    const cats = loadCategories();
    expect(cats.map((c) => c.id).sort()).toEqual(["basic", "fresh"]);
  });
});

describe("generateCategoryId", () => {
  it("lowercases, dashes word breaks, and trims edges", () => {
    expect(generateCategoryId("My Custom Category")).toBe("my-custom-category");
    expect(generateCategoryId("  Leading/Trailing!!  ")).toBe("leading-trailing");
    expect(generateCategoryId("a__b--c")).toBe("a-b-c");
  });

  it("returns an empty string if no alphanumerics survive", () => {
    expect(generateCategoryId("!!!")).toBe("");
  });
});
