import { Form, ActionPanel, Action, showToast, Toast, useNavigation } from "@raycast/api";
import { ShapeInfo, ShapeCategory } from "../../types/shapes";
import { updateShapeInLibrary, removeShapeFromLibrary } from "../../utils/shapeSaver";
import { loadCategories } from "../../utils/categoryManager";

/**
 * Form values captured by EditShapeForm.
 */
interface EditShapeFormValues {
  name: string;
  category: ShapeCategory;
  tags: string;
}

/**
 * Edit a shape's metadata (name, category, tags). When the category changes
 * the preview PNG is moved to the new category folder and the shape is
 * re-added under the new category id.
 */
export function EditShapeForm({ shape, onSave }: { shape: ShapeInfo; onSave: () => void }) {
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
        const { movePreviewToCategory } = await import("../../utils/shapeSaver");
        const newPreviewPath = movePreviewToCategory(shape, oldCategory, newCategory);

        // Add to new category with updates
        const updatedShape: ShapeInfo = {
          ...shape,
          name: values.name,
          category: newCategory,
          tags: values.tags ? values.tags.split(",").map((t) => t.trim()) : [],
          preview: newPreviewPath,
        };

        const { addShapeToLibrary } = await import("../../utils/shapeSaver");
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
          <Action title="Cancel" onAction={() => pop()} />
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
