import { useState } from "react";
import {
  Detail,
  Form,
  ActionPanel,
  Action,
  showToast,
  Toast,
  popToRoot,
  Icon,
  useNavigation,
  launchCommand,
  LaunchType,
  getPreferenceValues,
  Clipboard,
  showInFinder,
} from "@raycast/api";
import { join } from "path";
import { existsSync, mkdirSync, copyFileSync } from "fs";

import { captureShapeFromPowerPoint } from "./extractor";
import { mapToShapeInfo, getShapeTypeName } from "./utils/shapeMapper";
import { addShapeToLibrary, shapeExists, updateShapeInLibrary } from "./utils/shapeSaver";
import { getLibraryRoot } from "./utils/paths";
import { ShapeInfo, ShapeCategory, Preferences } from "./types/shapes";
import { loadCategories } from "./utils/categoryManager";

interface CaptureFormValues {
  shapeName: string;
  category: ShapeCategory;
  description: string;
  tags: string;
}

function SaveForm({ shape }: { shape: ShapeInfo }) {
  const { pop } = useNavigation();
  const prefs = getPreferenceValues<Preferences>();

  async function handleSubmit(values: CaptureFormValues) {
    const toast = await showToast({ style: Toast.Style.Animated, title: "Saving shape..." });
    try {
      const updated: ShapeInfo = {
        ...shape,
        name: values.shapeName || shape.name,
        category: values.category,
        description: values.description || shape.description,
        tags: values.tags ? values.tags.split(",").map((t) => t.trim()) : shape.tags,
        preview: `${values.category}/placeholder.png`,
      };

      if (shapeExists(updated.id, updated.category)) {
        toast.style = Toast.Style.Failure;
        toast.title = "Shape already exists";
        toast.message = `ID '${updated.id}' already in ${updated.category}`;
        return;
      }

      const jsonPath = addShapeToLibrary(updated);

      // If picture PNG provided by extractor (carried via __tempPng), move to assets and set preview
      try {
        const tempPng: string | undefined = (shape as any).__tempPng;
        if (tempPng && existsSync(tempPng)) {
          const outDir = join(getLibraryRoot(), "assets", updated.category);
          if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
          const outPng = join(outDir, `${updated.id}.png`);
          copyFileSync(tempPng, outPng);
          updateShapeInLibrary(updated.id, updated.category, { preview: `${updated.category}/${updated.id}.png` });
        }
      } catch {}

      // Generate preview (Windows)
      if (process.platform === "win32") {
        try {
          const { generatePreview } = await import("./utils/previewGenerator");
          await generatePreview(updated);
        } catch {}
      }

      // Add to deck if enabled
      if (prefs.useLibraryDeck) {
        let src: string | null = null;
        if (updated.nativePptx) {
          src = join(getLibraryRoot(), updated.nativePptx);
        } else {
          const { generateShapePptx } = await import("./generator/pptxGenerator");
          src = await generateShapePptx(updated);
        }
        try {
          const slide = await (await import("./utils/deck")).addShapeToDeckFromPptx(src);
          updateShapeInLibrary(updated.id, updated.category, { deckSlide: slide });
        } catch {}
      }

      toast.style = Toast.Style.Success;
      toast.title = "Shape saved!";
      toast.message = `JSON: ${jsonPath}`;

      try {
        await launchCommand({ name: "shape-picker", type: LaunchType.UserInitiated });
      } catch {}

      await popToRoot({ clearSearchBar: true });
    } catch (err) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to save shape";
      toast.message = err instanceof Error ? err.message : "Unknown error";
    }
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save to Library" icon={Icon.SaveDocument} onSubmit={handleSubmit} />
          <Action title="Cancel" icon={Icon.XMarkCircle} onAction={() => pop()} />
        </ActionPanel>
      }
    >
      <Form.Description
        title="Capture Status"
        text={`- Extracted from PowerPoint\n- Shape type: ${getShapeTypeName(shape.pptxDefinition?.type as any)}\n- Native PPTX: ${shape.nativePptx ? "OK" : "Missing"}`}
      />

      <Form.Separator />

      <Form.TextField
        id="shapeName"
        title="Shape Name"
        placeholder="Enter a descriptive name"
        defaultValue={shape.name}
      />
      <Form.Dropdown id="category" title="Category" defaultValue={shape.category}>
        {loadCategories().map((cat) => (
          <Form.Dropdown.Item key={cat.id} value={cat.id} title={cat.name} />
        ))}
      </Form.Dropdown>
      <Form.TextArea
        id="description"
        title="Description"
        placeholder="Optional description"
        defaultValue={shape.description}
      />
      <Form.TextField
        id="tags"
        title="Tags"
        placeholder="tag1, tag2, tag3"
        defaultValue={shape.tags?.join(", ") || ""}
      />
    </Form>
  );
}

export default function CaptureShape() {
  const [isCapturing, setIsCapturing] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [captured, setCaptured] = useState<ShapeInfo | null>(null);
  const [lastLogs, setLastLogs] = useState<string[]>([]);

  async function handleCapture() {
    setIsCapturing(true);
    setStatus("Extracting shape...");
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Capturing shape...",
      message: "Select a shape in PowerPoint",
    });
    try {
      const result: any = await captureShapeFromPowerPoint();
      if (Array.isArray(result.logs)) setLastLogs(result.logs as string[]);

      if (!result.success || !result.shape) {
        toast.style = Toast.Style.Failure;
        toast.title = "Failed to capture shape";
        toast.message = result.error || "Unknown error";
        setStatus("Capture failed.");
        return;
      }

      setStatus("Mapping shape...");
      const shapeInfo = mapToShapeInfo(result.shape);
      try {
        (shapeInfo as any).__tempPng = (result.shape as any).pngTempPath;
      } catch {}

      // Optional auto-save
      const prefs = getPreferenceValues<Preferences>();
      if (prefs.autoSaveAfterCapture) {
        const jsonPath = addShapeToLibrary(shapeInfo);
        if (prefs.useLibraryDeck) {
          let src: string | null = null;
          if (shapeInfo.nativePptx) src = join(getLibraryRoot(), shapeInfo.nativePptx);
          else {
            const { generateShapePptx } = await import("./generator/pptxGenerator");
            src = await generateShapePptx(shapeInfo);
          }
          try {
            const slide = await (await import("./utils/deck")).addShapeToDeckFromPptx(src);
            updateShapeInLibrary(shapeInfo.id, shapeInfo.category, { deckSlide: slide });
          } catch {}
        }
        if (process.platform === "win32") {
          try {
            const { generatePreview } = await import("./utils/previewGenerator");
            await generatePreview(shapeInfo);
          } catch {}
        }
        // Move temp PNG preview if provided
        try {
          const tempPng: string | undefined = (result.shape as any).pngTempPath;
          if (tempPng && existsSync(tempPng)) {
            const outDir = join(getLibraryRoot(), "assets", shapeInfo.category);
            if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
            const outPng = join(outDir, `${shapeInfo.id}.png`);
            copyFileSync(tempPng, outPng);
            updateShapeInLibrary(shapeInfo.id, shapeInfo.category, {
              preview: `${shapeInfo.category}/${shapeInfo.id}.png`,
            });
          }
        } catch {}

        toast.style = Toast.Style.Success;
        toast.title = "Shape saved!";
        toast.message = `JSON: ${jsonPath}`;
        await popToRoot({ clearSearchBar: true });
        return;
      }

      toast.style = Toast.Style.Success;
      toast.title = "Shape captured!";
      toast.message = `${shapeInfo.name} - ${getShapeTypeName(result.shape.type)}`;
      setStatus("Captured. Review and save.");
      setCaptured(shapeInfo);
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Error capturing shape";
      toast.message = error instanceof Error ? error.message : "Unknown error";
      setStatus("Error.");
    } finally {
      setIsCapturing(false);
    }
  }

  if (captured) {
    return <SaveForm shape={captured} />;
  }

  const md = `# Capture Selected Shape\n\n**Status:** ${status || "Idle — press Enter to capture."}\n\n**Instructions**\n\n- Open PowerPoint\n- Select the shape you want to capture\n- Press Enter or click \"Capture Selected Shape\"\n\n**Notes**\n\n- Groups and Pictures are saved as native (100% fidelity)\n- Use \"Save to Library\" to save JSON/preview and add to the Deck (if enabled)`;

  return (
    <Detail
      isLoading={isCapturing}
      markdown={md}
      actions={
        <ActionPanel>
          <Action title="Capture Selected Shape" icon={Icon.Download} onAction={handleCapture} />
          <Action
            title="Copy Debug Log"
            icon={Icon.Clipboard}
            shortcut={{ modifiers: ["cmd"], key: "l" }}
            onAction={() => {
              try {
                const text = lastLogs.length ? lastLogs.join("\n") : status || "No log";
                Clipboard.copy(text);
                showToast({ style: Toast.Style.Success, title: "Copied" });
              } catch {}
            }}
          />
          <Action title="Open Library Folder" icon={Icon.Folder} onAction={() => showInFinder(getLibraryRoot())} />
        </ActionPanel>
      }
    />
  );
}
