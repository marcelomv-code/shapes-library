import { existsSync } from "fs";
import { join } from "path";
import {
  Grid,
  ActionPanel,
  Action,
  Icon,
  showToast,
  Toast,
  showInFinder,
  getPreferenceValues,
  useNavigation,
  launchCommand,
  LaunchType,
} from "@raycast/api";
import { ShapeInfo, Preferences } from "../../types/shapes";
import { getLibraryRoot } from "../../utils/paths";
import { openShapeInPowerPoint } from "../../generator/pptxGenerator";
import { getPowerPointClient, getDeckPath } from "../../infra/powerpoint";
import { generateSvgPreview, svgToDataUrl } from "../../utils/svgPreview";
import { getCategoryDisplayName } from "../../utils/categoryManager";
import { EditShapeForm } from "./EditShapeForm";
import { ImportLibraryForm } from "./ImportLibraryForm";
import { copyShapeToClipboard } from "./clipboard";
import { exportLibraryZip } from "./libraryZip";

interface ShapeGridItemProps {
  shape: ShapeInfo;
  onRefresh: () => Promise<void> | void;
  onDelete: (shape: ShapeInfo) => Promise<void> | void;
}

/**
 * Single Grid.Item for a shape — renders the preview (PNG if present, SVG
 * fallback otherwise) and the full ActionPanel (copy, open, share, manage,
 * refresh, edit, delete).
 */
export function ShapeGridItem({ shape, onRefresh, onDelete }: ShapeGridItemProps) {
  const { push } = useNavigation();

  const pngPath = join(getLibraryRoot(), "assets", shape.category, `${shape.id}.png`);
  const pngExists = existsSync(pngPath);

  let previewSource: string;
  if (pngExists) {
    // Convert Windows path to file:// URL (required for Raycast Windows v0.44+)
    previewSource = `file:///${pngPath.replace(/\\/g, "/")}`;
  } else {
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
                  await getPowerPointClient().insertSlide(getDeckPath(), shape.deckSlide as number);
                } else {
                  await openShapeInPowerPoint(shape);
                }
              }}
            />
          </ActionPanel.Section>

          <ActionPanel.Section title="Utility">
            <ActionPanel.Submenu title="Share Library" icon={Icon.Upload} shortcut={{ modifiers: ["cmd"], key: "s" }}>
              <Action title="Export Library (zip)" icon={Icon.Upload} onAction={exportLibraryZip} />
              <Action title="Import Library (zip)" icon={Icon.Download} onAction={() => push(<ImportLibraryForm />)} />
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
              onAction={() => onRefresh()}
            />
            <Action
              title="Edit Shape"
              icon={Icon.Pencil}
              shortcut={{ modifiers: ["cmd"], key: "e" }}
              onAction={() => push(<EditShapeForm shape={shape} onSave={() => onRefresh()} />)}
            />
            <Action title="Open Library Folder" icon={Icon.Folder} onAction={() => showInFinder(getLibraryRoot())} />
            <Action
              title="Delete Shape"
              icon={Icon.Trash}
              style={Action.Style.Destructive}
              shortcut={{ modifiers: ["ctrl"], key: "x" }}
              onAction={() => onDelete(shape)}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}
