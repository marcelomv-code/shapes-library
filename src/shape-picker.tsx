import { useState, useEffect } from "react";
import {
  Grid,
  ActionPanel,
  Action,
  showToast,
  Toast,
  getPreferenceValues,
  Icon,
  confirmAlert,
  Alert,
  showInFinder,
  Form,
  useNavigation,
  launchCommand,
  LaunchType,
} from "@raycast/api";
import { readFileSync, existsSync, mkdirSync, readdirSync, copyFileSync } from "fs";
import { join } from "path";
import { environment } from "@raycast/api";
import { getShapesDir as getShapesDirUtil, getLibraryRoot } from "./utils/paths";
import { ShapeInfo, Preferences, CategoryOption, ShapeCategory } from "./types/shapes";
import { openShapeInPowerPoint, generateShapePptx } from "./generator/pptxGenerator";
import { copyFromDeckToClipboard, insertFromDeckIntoActive } from "./utils/deck";
import { getCachedShapes, setCachedShapes, clearCache } from "./utils/cache";
import { updateShapeInLibrary, removeShapeFromLibrary } from "./utils/shapeSaver";
import { generateSvgPreview, svgToDataUrl } from "./utils/svgPreview";
import { spawn } from "child_process";
import { loadCategories, getCategoryDisplayName } from "./utils/categoryManager";
import { runPowerShellFile, resolvePsScript } from "./infra/powershell";

/**
 * Build category options for dropdown dynamically
 */
function buildCategoryOptions(): CategoryOption[] {
  const categories = loadCategories();
  return [{ title: "All Shapes", value: "all" }, ...categories.map((c) => ({ title: c.name, value: c.id }))];
}

/**
 * Form values for editing shape
 */
interface EditShapeFormValues {
  name: string;
  category: ShapeCategory;
  tags: string;
}

/**
 * Edit Shape Form Component
 */
function EditShapeForm({ shape, onSave }: { shape: ShapeInfo; onSave: () => void }) {
  const { pop } = useNavigation();

  async function handleSubmit(values: EditShapeFormValues) {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Updating shape...",
    });

    try {
      const oldCategory = shape.category;
      const newCategory = values.category;

      // If category changed, we need to move the shape
      if (oldCategory !== newCategory) {
        // Remove from old category
        removeShapeFromLibrary(shape.id, oldCategory);

        // Move the preview file physically from old to new category folder
        const { movePreviewToCategory } = await import("./utils/shapeSaver");
        const newPreviewPath = movePreviewToCategory(shape, oldCategory, newCategory);

        // Add to new category with updates
        const updatedShape: ShapeInfo = {
          ...shape,
          name: values.name,
          category: newCategory,
          tags: values.tags ? values.tags.split(",").map((t) => t.trim()) : [],
          preview: newPreviewPath, // Use the actual moved preview path
        };

        const { addShapeToLibrary } = await import("./utils/shapeSaver");
        addShapeToLibrary(updatedShape);
      } else {
        // Just update in the same category
        const updates: Partial<ShapeInfo> = {
          name: values.name,
          tags: values.tags ? values.tags.split(",").map((t) => t.trim()) : [],
        };

        updateShapeInLibrary(shape.id, shape.category, updates);
      }

      toast.style = Toast.Style.Success;
      toast.title = "Shape updated!";
      toast.message = `Updated ${values.name}`;

      // Go back and refresh
      pop();
      onSave();
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to update shape";
      toast.message = error instanceof Error ? error.message : "Unknown error";
    }
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Changes" onSubmit={handleSubmit} />
          <Action title="Cancel" onAction={() => pop()} shortcut={{ modifiers: ["cmd"], key: "w" }} />
        </ActionPanel>
      }
    >
      <Form.TextField id="name" title="Shape Name" placeholder="Enter shape name" defaultValue={shape.name} autoFocus />
      <Form.Dropdown id="category" title="Category" defaultValue={shape.category}>
        {loadCategories().map((cat) => (
          <Form.Dropdown.Item key={cat.id} value={cat.id} title={cat.name} />
        ))}
      </Form.Dropdown>
      <Form.TextField
        id="tags"
        title="Tags"
        placeholder="tag1, tag2, tag3"
        defaultValue={shape.tags?.join(", ") || ""}
      />
      <Form.Description text={`ID: ${shape.id}`} />
    </Form>
  );
}

function ImportLibraryForm() {
  const { pop } = useNavigation();
  async function handleSubmit(values: { zipPath: string }) {
    const toast = await showToast({ style: Toast.Style.Animated, title: "Importing library..." });
    try {
      await importLibraryZip(values.zipPath);
      toast.style = Toast.Style.Success;
      toast.title = "Library imported";
      toast.message = getLibraryRoot();
      pop();
    } catch (e) {
      toast.style = Toast.Style.Failure;
      toast.title = "Import failed";
      toast.message = e instanceof Error ? e.message : "Unknown error";
    }
  }
  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Import" onSubmit={handleSubmit} />
          <Action title="Cancel" onAction={() => pop()} />
        </ActionPanel>
      }
    >
      <Form.TextField id="zipPath" title="ZIP Path" placeholder="C:\\path\\to\\library_export_*.zip" />
    </Form>
  );
}

/**
 * Export the library (shapes, assets, native, deck) into a timestamped ZIP under the Library Folder.
 * Includes robust logging to the Raycast dev console and toasts for user feedback.
 */
async function exportLibraryZip(): Promise<void> {
  const root = getLibraryRoot();
  const hasShapes = existsSync(join(root, "shapes"));
  const hasAssets = existsSync(join(root, "assets"));
  const hasNative = existsSync(join(root, "native"));
  const hasDeck = existsSync(join(root, "library_deck.pptx"));

  console.log(`[Export] Root: ${root}`);
  console.log(
    `[Export] Folders present -> shapes:${hasShapes} assets:${hasAssets} native:${hasNative} deck:${hasDeck}`
  );

  const toast = await showToast({ style: Toast.Style.Animated, title: "Exporting library..." });

  try {
    const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 13);
    const dest = join(root, `library_export_${ts}.zip`);

    if (process.platform === "win32") {
      // Phase 4: assets/ps/export-library.ps1 keeps the staging-folder
      // workaround (Compress-Archive misbehaves with multiple -Path inputs)
      // and emits "OK:<dest>" on success. The [Export] stdout/stderr
      // breadcrumbs are preserved by logging result.stdout / result.stderr
      // after the run (no longer streamed, but still captured for triage).
      const result = await runPowerShellFile(resolvePsScript("export-library"), { Root: root, Dest: dest });
      if (result.stdout) console.log(`[Export][stdout] ${result.stdout.trim()}`);
      if (result.stderr) console.error(`[Export][stderr] ${result.stderr.trim()}`);
      if (result.ok === false) {
        throw new Error(`PowerShell failed (${result.code ?? "n/a"}). ${result.message}`);
      }
      if (!/^OK:/m.test(result.stdout)) {
        throw new Error(`Unexpected output: ${result.stdout}`);
      }
    } else {
      // macOS/Linux: zip present directories only
      const include: string[] = [];
      if (hasShapes) include.push("shapes");
      if (hasAssets) include.push("assets");
      if (hasNative) include.push("native");
      if (hasDeck) include.push("library_deck.pptx");
      if (include.length === 0) throw new Error("Nothing to export");
      const args = ["-r", dest, ...include];
      console.log(`[Export] Running: zip ${args.join(" ")}`);
      await new Promise<void>((resolve, reject) => {
        const zip = spawn("zip", args, { cwd: root });
        zip.stdout.on("data", (d) => console.log(`[Export][zip] ${d.toString().trim()}`));
        zip.stderr.on("data", (d) => console.error(`[Export][zip-err] ${d.toString().trim()}`));
        zip.on("error", (e) => reject(e));
        zip.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`zip failed (${code})`))));
      });
    }

    toast.style = Toast.Style.Success;
    toast.title = "Library exported";
    toast.message = root;
  } catch (e) {
    console.error("[Export] Failed:", e);
    toast.style = Toast.Style.Failure;
    toast.title = "Export failed";
    toast.message = e instanceof Error ? e.message : "Unknown error";
  }
}

/**
 * Import a library ZIP into the current Library Folder.
 */
async function importLibraryZip(zipPath: string): Promise<void> {
  const root = getLibraryRoot();
  if (!zipPath || !existsSync(zipPath)) throw new Error("ZIP not found");
  console.log(`[Import] root=${root} zip=${zipPath}`);

  if (process.platform === "win32") {
    // Phase 4: assets/ps/import-library.ps1 does Expand-Archive and emits
    // "OK:<dest>". Same diagnostic breadcrumbs as the export path above.
    const result = await runPowerShellFile(resolvePsScript("import-library"), { Zip: zipPath, Dest: root });
    if (result.stdout) console.log(`[Import][stdout] ${result.stdout.trim()}`);
    if (result.stderr) console.error(`[Import][stderr] ${result.stderr.trim()}`);
    if (result.ok === false) {
      throw new Error(`PowerShell failed (${result.code ?? "n/a"}). ${result.message}`);
    }
    if (!/^OK:/m.test(result.stdout)) {
      throw new Error(`Unexpected output: ${result.stdout}`);
    }
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const unzip = spawn("unzip", ["-o", zipPath, "-d", root]);
    unzip.stdout.on("data", (d) => console.log(`[Import][unzip] ${d.toString().trim()}`));
    unzip.stderr.on("data", (d) => console.error(`[Import][unzip-err] ${d.toString().trim()}`));
    unzip.on("error", (e) => reject(e));
    unzip.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`unzip failed (${code})`))));
  });
}

/**
 * Get path to shapes directory
 */
function ensureSupportShapesSeed(): string {
  // Persistent shapes location (library root can be customized)
  const supportShapes = getShapesDirUtil();
  if (!existsSync(supportShapes)) {
    try {
      mkdirSync(supportShapes, { recursive: true });
    } catch {}
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
      } catch {}
    }
  } catch {}
  return supportShapes;
}

function getShapesDir(): string {
  return ensureSupportShapesSeed();
}

/**
 * Load shapes from a JSON file
 * @param category - Category to load shapes for
 * @param useCache - Whether to use cache
 */
async function loadShapesFromCategory(category: ShapeCategory, useCache: boolean): Promise<ShapeInfo[]> {
  const shapesDir = getShapesDir();
  const filePath = join(shapesDir, `${category}.json`);

  // Check if file exists
  if (!existsSync(filePath)) {
    console.warn(`Shapes file not found: ${filePath}`);
    return [];
  }

  // Try to get from cache if enabled
  if (useCache) {
    const cached = getCachedShapes(category, filePath);
    if (cached) {
      return cached;
    }
  }

  try {
    // Load from file
    const content = readFileSync(filePath, "utf-8");
    const shapes: ShapeInfo[] = JSON.parse(content);

    // Cache if enabled
    if (useCache) {
      setCachedShapes(category, filePath, shapes);
    }

    return shapes;
  } catch (error) {
    console.error(`Failed to load shapes from ${category}:`, error);
    await showToast({
      style: Toast.Style.Failure,
      title: "Failed to load shapes",
      message: `Could not load ${category} shapes`,
    });
    return [];
  }
}

/**
 * Load all shapes from all categories
 * @param useCache - Whether to use cache
 */
async function loadAllShapes(useCache: boolean): Promise<ShapeInfo[]> {
  const categories = loadCategories();
  const categoryIds = categories.map((c) => c.id);

  const results = await Promise.allSettled(categoryIds.map((cat) => loadShapesFromCategory(cat, useCache)));

  const allShapes: ShapeInfo[] = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      allShapes.push(...result.value);
    } else {
      console.error(`Failed to load ${categoryIds[index]} shapes:`, result.reason);
    }
  });

  // Sort alphabetically by name
  return allShapes.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Arguments passed to the command
 */
interface CommandArguments {
  category?: string;
}

/**
 * Main shape picker component
 */
export default function ShapePicker(props: { arguments: CommandArguments }) {
  const { category: initialCategory } = props.arguments;
  const preferences = getPreferenceValues<Preferences>();
  const { push } = useNavigation();
  const [isLoading, setIsLoading] = useState(true);
  const [shapes, setShapes] = useState<ShapeInfo[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory || "all");
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>(buildCategoryOptions());

  /**
   * Load shapes based on selected category
   */
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

  /**
   * Handle category change
   */
  function handleCategoryChange(newCategory: string) {
    setSelectedCategory(newCategory);
  }

  /**
   * Handle refresh action
   */
  async function handleRefresh() {
    clearCache();
    setCategoryOptions(buildCategoryOptions()); // Reload categories
    await loadShapes(true);
  }

  /**
   * Handle delete shape
   */
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

      // Refresh the list
      clearCache();
      await loadShapes(true);
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to delete shape";
      toast.message = error instanceof Error ? error.message : "Unknown error";
    }
  }

  /**
   * Copy shape object to clipboard so user can paste in PowerPoint (Windows)
   */
  async function copyShapeToClipboard(shape: ShapeInfo) {
    if (process.platform !== "win32") {
      await showToast({ style: Toast.Style.Failure, title: "Copy not supported on macOS yet" });
      return;
    }

    const toast = await showToast({ style: Toast.Style.Animated, title: "Copying shape..." });
    let srcPptx: string | null = null;
    let isTemp = false;
    try {
      const prefs = getPreferenceValues<Preferences>();
      if (prefs.useLibraryDeck && typeof shape.deckSlide === "number") {
        await copyFromDeckToClipboard(shape.deckSlide);
        toast.style = Toast.Style.Success;
        toast.title = "Shape copied (deck)";
        toast.message = "Ctrl+V in PowerPoint";
        return;
      }
      const requireNative =
        (getPreferenceValues<Preferences>().forceExactShapes ?? false) === true || shape.nativeOnly === true;
      if (shape.nativePptx) {
        srcPptx = join(getLibraryRoot(), shape.nativePptx);
      }
      if (requireNative && (!srcPptx || !existsSync(srcPptx))) {
        toast.style = Toast.Style.Failure;
        toast.title = "Native PPTX required";
        toast.message = "Recapture this shape to generate a native PPTX file with your template theme.";
        return;
      }
      if (!srcPptx || !existsSync(srcPptx)) {
        srcPptx = await generateShapePptx(shape);
        isTemp = true;
      }

      try {
        await runCopyViaPowerPoint(srcPptx);
      } catch (primaryErr) {
        const requireNative2 =
          (getPreferenceValues<Preferences>().forceExactShapes ?? false) === true || shape.nativeOnly === true;
        if (requireNative2) {
          throw primaryErr;
        }
        // Fallback: generate a fresh PPTX and try again
        const fallback = await generateShapePptx(shape);
        isTemp = true;
        await runCopyViaPowerPoint(fallback);
        try {
          require("fs").unlinkSync(fallback);
        } catch {}
      }

      toast.style = Toast.Style.Success;
      toast.title = "Shape copied";
      toast.message = "Switch to PowerPoint and press Ctrl+V";
    } catch (err) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to copy";
      toast.message = err instanceof Error ? err.message : "Unknown error";
    } finally {
      if (isTemp && srcPptx) {
        try {
          require("fs").unlinkSync(srcPptx);
        } catch {}
      }
    }
  }

  async function runCopyViaPowerPoint(pptxPath: string): Promise<void> {
    // Phase 4: delegates to assets/ps/copy-via-powerpoint.ps1. The runner
    // surfaces the "ERROR:" protocol-error message in result.message, so
    // the legacy error text (e.g. "No active PowerPoint window") flows
    // through unchanged for the fallback branch in copyShapeToClipboard.
    const result = await runPowerShellFile(resolvePsScript("copy-via-powerpoint"), { PptxPath: pptxPath });
    if (result.ok === false) throw new Error(result.message);
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
      {shapes.map((shape) => {
        // Try to use PNG preview first, fallback to SVG
        const pngPath = join(getLibraryRoot(), "assets", shape.category, `${shape.id}.png`);
        const pngExists = existsSync(pngPath);

        let previewSource: string;
        if (pngExists) {
          // Convert Windows path to file:// URL (required for Raycast Windows v0.44+)
          previewSource = `file:///${pngPath.replace(/\\/g, "/")}`;
        } else {
          // Fallback to SVG for instant preview
          const svg = generateSvgPreview(shape);
          previewSource = svgToDataUrl(svg);
        }

        return (
          <Grid.Item
            key={shape.id}
            title={shape.name}
            subtitle={`${getCategoryDisplayName(shape.category)}${shape.nativeOnly ? " • Native-Only" : ""}`}
            content={{ source: previewSource }}
            keywords={[shape.name, shape.category, ...(shape.tags || [])]}
            actions={
              <ActionPanel>
                <ActionPanel.Section title="Shape Actions">
                  <Action
                    title="Copy Shape to Clipboard"
                    icon={Icon.Clipboard}
                    onAction={() => copyShapeToClipboard(shape)}
                  />
                  <Action
                    title="Open in Powerpoint"
                    icon={Icon.Document}
                    onAction={async () => {
                      const prefs = getPreferenceValues<Preferences>();
                      if (prefs.useLibraryDeck && typeof shape.deckSlide === "number") {
                        await insertFromDeckIntoActive(shape.deckSlide as number);
                      } else {
                        await openShapeInPowerPoint(shape);
                      }
                    }}
                  />
                </ActionPanel.Section>

                <ActionPanel.Section title="Utility">
                  <ActionPanel.Submenu
                    title="Share Library"
                    icon={Icon.Upload}
                    shortcut={{ modifiers: ["cmd"], key: "s" }}
                  >
                    <Action title="Export Library (zip)" icon={Icon.Upload} onAction={exportLibraryZip} />
                    <Action
                      title="Import Library (zip)"
                      icon={Icon.Download}
                      onAction={() => push(<ImportLibraryForm />)}
                    />
                  </ActionPanel.Submenu>
                  <Action
                    title="Manage Categories"
                    icon={Icon.List}
                    shortcut={{ modifiers: ["cmd"], key: "m" }}
                    onAction={async () => {
                      try {
                        await launchCommand({ name: "manage-categories", type: LaunchType.UserInitiated });
                      } catch {
                        await showToast({
                          style: Toast.Style.Failure,
                          title: "Command not found",
                          message: "Manage Categories command is not available",
                        });
                      }
                    }}
                  />
                  <Action
                    title="Refresh Shapes"
                    icon={Icon.ArrowClockwise}
                    shortcut={{ modifiers: ["cmd"], key: "r" }}
                    onAction={handleRefresh}
                  />
                  <Action
                    title="Edit Shape"
                    icon={Icon.Pencil}
                    shortcut={{ modifiers: ["cmd"], key: "e" }}
                    onAction={() => push(<EditShapeForm shape={shape} onSave={handleRefresh} />)}
                  />
                  <Action
                    title="Open Library Folder"
                    icon={Icon.Folder}
                    onAction={() => showInFinder(getLibraryRoot())}
                  />
                  <Action
                    title="Delete Shape"
                    icon={Icon.Trash}
                    style={Action.Style.Destructive}
                    shortcut={{ modifiers: ["ctrl"], key: "x" }}
                    onAction={() => handleDeleteShape(shape)}
                  />
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        );
      })}

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
