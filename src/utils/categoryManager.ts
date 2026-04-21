/**
 * Category Manager - Handle dynamic categories for the Shapes Library
 *
 * Categories are stored in {LibraryRoot}/categories.json and can be
 * added, renamed, or deleted by the user.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { getLibraryRoot, getShapesDir } from "./paths";

/**
 * Category configuration
 */
export interface CategoryConfig {
  id: string; // Internal key (e.g., "basic", "my-custom")
  name: string; // Display name (e.g., "Basic Shapes", "My Custom Category")
}

/**
 * Categories file structure
 */
interface CategoriesFile {
  categories: CategoryConfig[];
}

/**
 * Default categories (used for initial setup/migration)
 */
const DEFAULT_CATEGORIES: CategoryConfig[] = [
  { id: "basic", name: "Basic Shapes" },
  { id: "arrows", name: "Arrows" },
  { id: "flowchart", name: "Flowchart" },
  { id: "callouts", name: "Callouts" },
];

/**
 * Get path to categories.json in Library folder
 */
function getCategoriesFilePath(): string {
  return join(getLibraryRoot(), "categories.json");
}

/**
 * Load categories from Library folder
 * If file doesn't exist, creates it with default categories
 */
export function loadCategories(): CategoryConfig[] {
  const filePath = getCategoriesFilePath();

  if (!existsSync(filePath)) {
    // First run - create with defaults
    saveCategories(DEFAULT_CATEGORIES);
    return DEFAULT_CATEGORIES;
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    const data: CategoriesFile = JSON.parse(content);
    return data.categories || DEFAULT_CATEGORIES;
  } catch (error) {
    console.error("[CategoryManager] Failed to load categories:", error);
    return DEFAULT_CATEGORIES;
  }
}

/**
 * Save categories to Library folder
 */
export function saveCategories(categories: CategoryConfig[]): void {
  const filePath = getCategoriesFilePath();
  const data: CategoriesFile = { categories };

  try {
    writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    console.log(`[CategoryManager] Saved ${categories.length} categories to ${filePath}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to save categories: ${msg}`);
  }
}

/**
 * Get all category IDs
 */
export function getCategoryIds(): string[] {
  return loadCategories().map((c) => c.id);
}

/**
 * Get display name for a category ID
 */
export function getCategoryDisplayName(categoryId: string): string {
  const categories = loadCategories();
  const found = categories.find((c) => c.id === categoryId);
  return found?.name || categoryId;
}

/**
 * Get category config by ID
 */
export function getCategoryById(categoryId: string): CategoryConfig | undefined {
  return loadCategories().find((c) => c.id === categoryId);
}

/**
 * Add a new category
 * @param id - Unique identifier (lowercase, alphanumeric, dashes allowed)
 * @param name - Display name
 */
export function addCategory(id: string, name: string): void {
  // Validate ID format
  const validId = /^[a-z0-9-]+$/.test(id);
  if (!validId) {
    throw new Error("Category ID must be lowercase, alphanumeric, with dashes only");
  }

  const categories = loadCategories();

  // Check if ID already exists
  if (categories.some((c) => c.id === id)) {
    throw new Error(`Category with ID "${id}" already exists`);
  }

  categories.push({ id, name });
  saveCategories(categories);

  // Create empty shapes JSON for the new category
  const shapesDir = getShapesDir();
  const shapesFile = join(shapesDir, `${id}.json`);
  if (!existsSync(shapesFile)) {
    writeFileSync(shapesFile, "[]", "utf-8");
  }
}

/**
 * Rename a category (change display name only, ID stays the same)
 */
export function renameCategory(categoryId: string, newName: string): void {
  const categories = loadCategories();
  const index = categories.findIndex((c) => c.id === categoryId);

  if (index === -1) {
    throw new Error(`Category "${categoryId}" not found`);
  }

  categories[index].name = newName;
  saveCategories(categories);
}

/**
 * Get number of shapes in a category
 */
export function getShapeCountInCategory(categoryId: string): number {
  const shapesDir = getShapesDir();
  const shapesFile = join(shapesDir, `${categoryId}.json`);

  if (!existsSync(shapesFile)) {
    return 0;
  }

  try {
    const content = readFileSync(shapesFile, "utf-8");
    const shapes = JSON.parse(content);
    return Array.isArray(shapes) ? shapes.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Delete a category (only if empty)
 * @returns true if deleted, throws error if not empty
 */
export function deleteCategory(categoryId: string): boolean {
  const categories = loadCategories();
  const index = categories.findIndex((c) => c.id === categoryId);

  if (index === -1) {
    throw new Error(`Category "${categoryId}" not found`);
  }

  // Check if category has shapes
  const shapeCount = getShapeCountInCategory(categoryId);
  if (shapeCount > 0) {
    throw new Error(
      `Cannot delete category "${categories[index].name}" - it contains ${shapeCount} shape(s). Move or delete the shapes first.`
    );
  }

  // Remove from list
  categories.splice(index, 1);
  saveCategories(categories);

  return true;
}

/**
 * Check if a category exists
 */
export function categoryExists(categoryId: string): boolean {
  return loadCategories().some((c) => c.id === categoryId);
}

/**
 * Generate a valid category ID from a display name
 * e.g., "My Custom Category" -> "my-custom-category"
 */
export function generateCategoryId(displayName: string): string {
  return displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
