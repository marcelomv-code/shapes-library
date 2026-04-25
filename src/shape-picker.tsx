import { useState, useEffect } from "react";
import { Grid, showToast, Toast, getPreferenceValues, Icon, confirmAlert, Alert } from "@raycast/api";
import { ShapeInfo, Preferences, CategoryOption, ShapeCategory } from "./types/shapes";
import { getCachedShapes as _warmCache, clearCache } from "./utils/cache";
import { removeShapeFromLibrary } from "./utils/shapeSaver";
import { loadCategories } from "./utils/categoryManager";
import { loadShapesFromCategory, loadAllShapes } from "./features/shape-picker/shapeLoader";
import { ShapeGridItem } from "./features/shape-picker/ShapeGridItem";

// `_warmCache` is re-exported to keep the module graph stable across the
// Phase 6 split; remove when cache.ts is folded into the feature folder.
void _warmCache;

/**
 * Build category options for the Grid dropdown from the configured
 * categories. "All Shapes" is prepended as the default view.
 */
function buildCategoryOptions(): CategoryOption[] {
  const categories = loadCategories();
  return [{ title: "All Shapes", value: "all" }, ...categories.map((c) => ({ title: c.name, value: c.id }))];
}

/** Arguments passed through from the Raycast command metadata. */
interface CommandArguments {
  category?: string;
}

/**
 * Root component for the "Search Shapes" command. Owns the shape list,
 * the selected category, and hand-offs to the feature modules under
 * src/features/shape-picker/.
 */
export default function ShapePicker(props: { arguments: CommandArguments }) {
  const { category: initialCategory } = props.arguments;
  const preferences = getPreferenceValues<Preferences>();
  const [isLoading, setIsLoading] = useState(true);
  const [shapes, setShapes] = useState<ShapeInfo[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory || "all");
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>(buildCategoryOptions());

  /** Load shapes for the currently selected category, with optional cache bypass. */
  async function loadShapes(bypassCache = false) {
    setIsLoading(true);

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Loading shapes...",
    });

    try {
      const useCache = preferences.enableCache && !bypassCache;

      let loadedShapes: ShapeInfo[];
      if (selectedCategory === "all") {
        loadedShapes = await loadAllShapes(useCache);
      } else {
        loadedShapes = await loadShapesFromCategory(selectedCategory as ShapeCategory, useCache);
      }

      setShapes(loadedShapes);

      toast.style = Toast.Style.Success;
      toast.title = "Shapes loaded";
      toast.message = `Found ${loadedShapes.length} shapes`;
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to load shapes";
      toast.message = error instanceof Error ? error.message : "Unknown error";
    } finally {
      setIsLoading(false);
    }
  }

  function handleCategoryChange(newCategory: string) {
    setSelectedCategory(newCategory);
  }

  async function handleRefresh() {
    clearCache();
    setCategoryOptions(buildCategoryOptions());
    await loadShapes(true);
  }

  async function handleDeleteShape(shape: ShapeInfo) {
    const confirmed = await confirmAlert({
      title: "Delete Shape",
      message: `Are you sure you want to delete "${shape.name}"? This action cannot be undone.`,
      primaryAction: {
        title: "Delete",
        style: Alert.ActionStyle.Destructive,
      },
    });

    if (!confirmed) {
      return;
    }

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Deleting shape...",
      message: shape.name,
    });

    try {
      removeShapeFromLibrary(shape.id, shape.category);

      toast.style = Toast.Style.Success;
      toast.title = "Shape deleted";
      toast.message = `${shape.name} removed from library`;

      clearCache();
      await loadShapes(true);
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to delete shape";
      toast.message = error instanceof Error ? error.message : "Unknown error";
    }
  }

  // Load shapes on mount and when category changes
  useEffect(() => {
    loadShapes();
  }, [selectedCategory]);

  return (
    <Grid
      isLoading={isLoading}
      searchBarPlaceholder="Search shapes by name or tags..."
      searchBarAccessory={
        <Grid.Dropdown tooltip="Select Category" onChange={handleCategoryChange} value={selectedCategory}>
          {categoryOptions.map((option) => (
            <Grid.Dropdown.Item key={option.value} title={option.title} value={option.value} />
          ))}
        </Grid.Dropdown>
      }
      columns={5}
      fit={Grid.Fit.Contain}
      inset={Grid.Inset.Medium}
    >
      {shapes.map((shape) => (
        <ShapeGridItem key={shape.id} shape={shape} onRefresh={handleRefresh} onDelete={handleDeleteShape} />
      ))}

      {!isLoading && shapes.length === 0 && (
        <Grid.EmptyView
          icon={Icon.MagnifyingGlass}
          title="No shapes found"
          description="Try changing the category or search query"
        />
      )}
    </Grid>
  );
}
