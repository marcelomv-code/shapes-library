import { Form, ActionPanel, Action, showToast, Toast, useNavigation } from "@raycast/api";
import { getLibraryRoot } from "../../utils/paths";
import { importLibraryZip } from "./libraryZip";

/**
 * Prompt the user for a ZIP path, then import into the active Library
 * Folder. Success/failure is reported via toast.
 */
export function ImportLibraryForm() {
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
