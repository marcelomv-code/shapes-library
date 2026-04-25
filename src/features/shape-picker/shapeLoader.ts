import { readFileSync, existsSync, mkdirSync, readdirSync, copyFileSync } from "fs";
import { join } from "path";
import { environment, showToast, Toast } from "@raycast/api";
import { getShapesDir as getShapesDirUtil } from "../../utils/paths";
import { ShapeInfo, ShapeCategory } from "../../types/shapes";
import { getCachedShapes, setCachedShapes } from "../../utils/cache";
import { loadCategories } from "../../utils/categoryManager";
import { createLogger } from "../../infra/logger";

const log = createLogger("ShapeLoader");

/**
 * Ensure the support shapes folder exists and seed it from packaged defaults
 * when empty. Returns the resolved shapes directory path.
 */
export function ensureSupportShapesSeed(): string {
  // Persistent shapes location (library root can be customized)
  const supportShapes = getShapesDirUtil();
  if (!existsSync(supportShapes)) {
    try {
      mkdirSync(supportShapes, { recursive: true });
    } catch {
      /* noop: creation failures are tolerated — readdirSync below reports */
    }
  }
  // Seed with packaged defaults if directory is empty
  try {
    const current = readdirSync(supportShapes).filter((f) => f.endsWith(".json"));
    if (current.length === 0) {
      const packaged = join(environment.assetsPath, "shapes");
      try {
        const seeds = readdirSync(packaged).filter((f) => f.endsWith(".json"));
        for (const f of seeds) {
          copyFileSync(join(packaged, f), join(supportShapes, f));
        }
      } catch {
        /* noop: assets/shapes may not exist in dev builds */
      }
    }
  } catch {
    /* noop: readdirSync failure is tolerated */
  }
  return supportShapes;
}

/** Thin wrapper that resolves the shapes directory lazily. */
export function getShapesDir(): string {
  return ensureSupportShapesSeed();
}

/**
 * Load shapes from a single category's JSON file.
 * @param category - category id to load
 * @param useCache - whether to use the in-memory cache
 */
export async function loadShapesFromCategory(category: ShapeCategory, useCache: boolean): Promise<ShapeInfo[]> {
  const shapesDir = getShapesDir();
  const filePath = join(shapesDir, `${category}.json`);

  if (!existsSync(filePath)) {
    log.warn(`Shapes file not found: ${filePath}`);
    return [];
  }

  if (useCache) {
    const cached = getCachedShapes(category, filePath);
    if (cached) {
      return cached;
    }
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    const shapes: ShapeInfo[] = JSON.parse(content);

    if (useCache) {
      setCachedShapes(category, filePath, shapes);
    }

    return shapes;
  } catch (error) {
    log.error(`Failed to load shapes from ${category}:`, error);
    await showToast({
      style: Toast.Style.Failure,
      title: "Failed to load shapes",
      message: `Could not load ${category} shapes`,
    });
    return [];
  }
}

/**
 * Load every shape from every registered category, sorted alphabetically.
 */
export async function loadAllShapes(useCache: boolean): Promise<ShapeInfo[]> {
  const categories = loadCategories();
  const categoryIds = categories.map((c) => c.id);

  const results = await Promise.allSettled(categoryIds.map((cat) => loadShapesFromCategory(cat, useCache)));

  const allShapes: ShapeInfo[] = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      allShapes.push(...result.value);
    } else {
      log.error(`Failed to load ${categoryIds[index]} shapes:`, result.reason);
    }
  });

  return allShapes.sort((a, b) => a.name.localeCompare(b.name));
}
