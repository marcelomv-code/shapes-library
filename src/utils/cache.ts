import { statSync } from "fs";
import { ShapeCache, ShapeInfo } from "../types/shapes";

/**
 * In-memory cache for shape data
 */
const cache: ShapeCache = {};

/**
 * Get cached shapes for a category
 * @param category - Category to get shapes for
 * @param filePath - Path to the JSON file
 * @returns Cached shapes or null if cache miss
 */
export function getCachedShapes(category: string, filePath: string): ShapeInfo[] | null {
  const cacheEntry = cache[category];

  if (!cacheEntry) {
    return null;
  }

  try {
    // Check if file has been modified
    const stats = statSync(filePath);
    const currentModified = stats.mtime.getTime();

    if (cacheEntry.lastModified === currentModified) {
      return cacheEntry.shapes;
    }

    // File modified, invalidate cache
    delete cache[category];
    return null;
  } catch (error) {
    // File doesn't exist or can't be accessed
    delete cache[category];
    return null;
  }
}

/**
 * Set cached shapes for a category
 * @param category - Category to cache shapes for
 * @param filePath - Path to the JSON file
 * @param shapes - Shapes to cache
 */
export function setCachedShapes(category: string, filePath: string, shapes: ShapeInfo[]): void {
  try {
    const stats = statSync(filePath);
    const lastModified = stats.mtime.getTime();

    cache[category] = {
      shapes,
      lastModified,
      category: category as any,
    };
  } catch (error) {
    // Can't cache if file doesn't exist
    console.error(`Failed to cache shapes for ${category}:`, error);
  }
}

/**
 * Clear all cached shapes
 */
export function clearCache(): void {
  Object.keys(cache).forEach((key) => {
    delete cache[key];
  });
}

/**
 * Clear cached shapes for a specific category
 * @param category - Category to clear
 */
export function clearCategoryCache(category: string): void {
  delete cache[category];
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  const categories = Object.keys(cache);
  const totalShapes = categories.reduce((sum, cat) => sum + cache[cat].shapes.length, 0);

  return {
    categoriesInCache: categories.length,
    totalShapesCached: totalShapes,
    categories: categories,
  };
}
