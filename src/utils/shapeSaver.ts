/**
 * Save captured shapes to JSON files
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync, copyFileSync } from "fs";
import { join, basename, dirname } from "path";
import { environment } from "@raycast/api";
import { getShapesDir as getShapesDirUtil, getAssetsDir, getLibraryRoot } from "./paths";
import { ShapeInfo, ShapeCategory } from "../types/shapes";
import { loadCategories, getCategoryIds } from "./categoryManager";

/**
 * Get path to shapes directory
 */
function getShapesDir(): string {
  return getShapesDirUtil();
}

/**
 * Get path to category JSON file
 */
function getCategoryFilePath(category: ShapeCategory): string {
  const shapesDir = getShapesDir();
  return join(shapesDir, `${category}.json`);
}

/**
 * Load existing shapes from a category file
 */
function loadCategoryShapes(category: ShapeCategory): ShapeInfo[] {
  const filePath = getCategoryFilePath(category);

  if (!existsSync(filePath)) {
    return [];
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    console.error(`Failed to load ${category} shapes:`, error);
    return [];
  }
}

/**
 * Save shapes to a category file
 */
function saveCategoryShapes(category: ShapeCategory, shapes: ShapeInfo[]): void {
  const filePath = getCategoryFilePath(category);

  try {
    // Sort shapes alphabetically by name
    const sortedShapes = shapes.sort((a, b) => a.name.localeCompare(b.name));

    // Write with pretty formatting
    const json = JSON.stringify(sortedShapes, null, 2);
    writeFileSync(filePath, json, "utf-8");
    try {
      console.log(`[ShapeSaver] Saved ${category}.json to ${filePath}`);
    } catch {}
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to save shapes to ${category}.json at ${filePath}: ${msg}`);
  }
}

/**
 * Check if a shape with the same ID already exists
 */
export function shapeExists(id: string, category: ShapeCategory): boolean {
  const shapes = loadCategoryShapes(category);
  return shapes.some((shape) => shape.id === id);
}

/**
 * Add a captured shape to the library
 */
export function addShapeToLibrary(shape: ShapeInfo): string {
  const { category } = shape;

  // Load existing shapes
  const shapes = loadCategoryShapes(category);

  // Check if shape ID already exists
  const existingIndex = shapes.findIndex((s) => s.id === shape.id);

  if (existingIndex !== -1) {
    // Replace existing shape
    shapes[existingIndex] = shape;
  } else {
    // Add new shape
    shapes.push(shape);
  }

  // Save updated shapes
  saveCategoryShapes(category, shapes);
  return getCategoryFilePath(category);
}

/**
 * Update an existing shape in the library
 */
export function updateShapeInLibrary(id: string, category: ShapeCategory, updates: Partial<ShapeInfo>): void {
  const shapes = loadCategoryShapes(category);

  const index = shapes.findIndex((s) => s.id === id);

  if (index === -1) {
    throw new Error(`Shape with ID '${id}' not found in ${category} category`);
  }

  // Update shape
  shapes[index] = {
    ...shapes[index],
    ...updates,
    id, // Ensure ID doesn't change
    category, // Ensure category doesn't change
  };

  saveCategoryShapes(category, shapes);
}

/**
 * Remove a shape from the library
 */
export function removeShapeFromLibrary(id: string, category: ShapeCategory): void {
  const shapes = loadCategoryShapes(category);

  const filteredShapes = shapes.filter((s) => s.id !== id);

  if (filteredShapes.length === shapes.length) {
    throw new Error(`Shape with ID '${id}' not found in ${category} category`);
  }

  saveCategoryShapes(category, filteredShapes);
}

/**
 * Get count of shapes in each category
 */
export function getShapeCounts(): Record<string, number> {
  const categoryIds = getCategoryIds();

  const counts: Record<string, number> = {};

  categoryIds.forEach((category) => {
    const shapes = loadCategoryShapes(category);
    counts[category] = shapes.length;
  });

  return counts;
}

/**
 * Get total number of shapes across all categories
 */
export function getTotalShapeCount(): number {
  const counts = getShapeCounts();
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}

/**
 * Move preview file from old category to new category
 * Returns the new preview path
 */
export function movePreviewToCategory(
  shape: ShapeInfo,
  oldCategory: ShapeCategory,
  newCategory: ShapeCategory
): string {
  const assetsDir = getAssetsDir();

  // Build old and new paths
  const oldPreviewPath = join(assetsDir, `${oldCategory}/${shape.id}.png`);
  const newCategoryDir = join(assetsDir, newCategory);
  const newPreviewPath = join(assetsDir, `${newCategory}/${shape.id}.png`);

  // Ensure new category directory exists
  if (!existsSync(newCategoryDir)) {
    mkdirSync(newCategoryDir, { recursive: true });
  }

  // Move the file if it exists
  if (existsSync(oldPreviewPath)) {
    try {
      renameSync(oldPreviewPath, newPreviewPath);
      console.log(`[ShapeSaver] Moved preview from ${oldPreviewPath} to ${newPreviewPath}`);
    } catch (error) {
      // If rename fails (maybe cross-device), try copy + delete
      try {
        copyFileSync(oldPreviewPath, newPreviewPath);
        // Don't delete old file to be safe - user can clean up manually
        console.log(`[ShapeSaver] Copied preview from ${oldPreviewPath} to ${newPreviewPath}`);
      } catch (copyError) {
        console.error(`[ShapeSaver] Failed to move preview:`, copyError);
      }
    }
  }

  return `${newCategory}/${shape.id}.png`;
}

/**
 * Auto-repair function: finds orphaned preview PNGs and moves them to correct category folder
 * based on what's defined in the JSON files.
 *
 * @param force - If true, forces repair even if it already ran before
 */
export function repairOrphanedPreviews(force = false): number {
  const assetsDir = getAssetsDir();
  const categories = getCategoryIds();

  let repairedCount = 0;

  // Check if repair already ran (create a marker file)
  const repairMarker = join(getLibraryRoot(), ".preview_repair_done");
  if (!force && existsSync(repairMarker)) {
    console.log("[ShapeSaver] Preview repair already completed");
    return 0;
  }

  console.log("[ShapeSaver] Starting orphaned preview repair...");

  // For each category, check if previews are in correct location
  for (const category of categories) {
    const shapes = loadCategoryShapes(category);
    const categoryDir = join(assetsDir, category);

    // Ensure category directory exists
    if (!existsSync(categoryDir)) {
      mkdirSync(categoryDir, { recursive: true });
    }

    for (const shape of shapes) {
      const expectedPath = join(assetsDir, shape.preview);

      // If preview doesn't exist at expected location, search for it
      if (!existsSync(expectedPath)) {
        console.log(`[ShapeSaver] Preview missing for ${shape.id} at ${expectedPath}`);

        // Search in all category folders
        for (const searchCategory of categories) {
          const searchPath = join(assetsDir, `${searchCategory}/${shape.id}.png`);

          if (existsSync(searchPath) && searchCategory !== category) {
            // Found it in wrong folder! Move it
            try {
              renameSync(searchPath, expectedPath);
              console.log(`[ShapeSaver] ✓ Moved ${shape.id}.png from ${searchCategory}/ to ${category}/`);
              repairedCount++;
              break;
            } catch (error) {
              // Try copy instead
              try {
                copyFileSync(searchPath, expectedPath);
                console.log(`[ShapeSaver] ✓ Copied ${shape.id}.png from ${searchCategory}/ to ${category}/`);
                repairedCount++;
                break;
              } catch (copyError) {
                console.error(`[ShapeSaver] Failed to repair ${shape.id}:`, copyError);
              }
            }
          }
        }
      }
    }
  }

  // Mark repair as done
  try {
    writeFileSync(repairMarker, new Date().toISOString(), "utf-8");
    console.log(`[ShapeSaver] Preview repair completed. Fixed ${repairedCount} previews.`);
  } catch (error) {
    console.error("[ShapeSaver] Failed to write repair marker:", error);
  }

  return repairedCount;
}
