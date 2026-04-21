/**
 * Manage Categories Command
 *
 * Allows users to add, rename, and delete categories in the Shapes Library.
 */

import { useState } from "react";
import {
  List,
  ActionPanel,
  Action,
  Icon,
  showToast,
  Toast,
  Form,
  useNavigation,
  confirmAlert,
  Alert,
  launchCommand,
  LaunchType,
} from "@raycast/api";
import {
  loadCategories,
  addCategory,
  renameCategory,
  deleteCategory,
  getShapeCountInCategory,
  CategoryConfig,
} from "./utils/categoryManager";

/**
 * Add Category Form
 */
function AddCategoryForm({ onSave }: { onSave: () => void }) {
  const { pop } = useNavigation();
  const [nameError, setNameError] = useState<string | undefined>();
  const [idError, setIdError] = useState<string | undefined>();

  async function handleSubmit(values: { name: string; id: string }) {
    // Validate
    if (!values.name.trim()) {
      setNameError("Name is required");
      return;
    }
    if (!values.id.trim()) {
      setIdError("ID is required");
      return;
    }

    const toast = await showToast({ style: Toast.Style.Animated, title: "Creating category..." });

    try {
      addCategory(values.id.trim(), values.name.trim());

      toast.style = Toast.Style.Success;
      toast.title = "Category created!";
      toast.message = values.name;

      pop();
      onSave();
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to create category";
      toast.message = error instanceof Error ? error.message : "Unknown error";
    }
  }

  function handleNameChange() {
    setNameError(undefined);
    // Auto-generate ID from name
  }

  function handleIdChange() {
    setIdError(undefined);
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Create Category" icon={Icon.Plus} onSubmit={handleSubmit} />
          <Action title="Cancel" icon={Icon.XMarkCircle} onAction={() => pop()} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="name"
        title="Display Name"
        placeholder="My Custom Category"
        error={nameError}
        onChange={handleNameChange}
        autoFocus
      />
      <Form.TextField
        id="id"
        title="Category ID"
        placeholder="my-custom-category"
        info="Lowercase, alphanumeric, dashes only. This is used internally to organize files."
        error={idError}
        onChange={handleIdChange}
      />
      <Form.Description text="Tip: The ID should be a simple identifier like 'templates' or 'my-shapes'. It cannot be changed later." />
    </Form>
  );
}

/**
 * Rename Category Form
 */
function RenameCategoryForm({ category, onSave }: { category: CategoryConfig; onSave: () => void }) {
  const { pop } = useNavigation();
  const [nameError, setNameError] = useState<string | undefined>();

  async function handleSubmit(values: { name: string }) {
    if (!values.name.trim()) {
      setNameError("Name is required");
      return;
    }

    const toast = await showToast({ style: Toast.Style.Animated, title: "Renaming category..." });

    try {
      renameCategory(category.id, values.name.trim());

      toast.style = Toast.Style.Success;
      toast.title = "Category renamed!";
      toast.message = `${category.name} → ${values.name}`;

      pop();
      onSave();
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to rename category";
      toast.message = error instanceof Error ? error.message : "Unknown error";
    }
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Rename Category" icon={Icon.Pencil} onSubmit={handleSubmit} />
          <Action title="Cancel" icon={Icon.XMarkCircle} onAction={() => pop()} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="name"
        title="New Display Name"
        placeholder="Enter new name"
        defaultValue={category.name}
        error={nameError}
        onChange={() => setNameError(undefined)}
        autoFocus
      />
      <Form.Description text={`Category ID: ${category.id} (cannot be changed)`} />
    </Form>
  );
}

/**
 * Main Manage Categories component
 */
export default function ManageCategories() {
  const { push } = useNavigation();
  const [categories, setCategories] = useState<CategoryConfig[]>(loadCategories());

  function refreshCategories() {
    setCategories(loadCategories());
  }

  async function handleDeleteCategory(category: CategoryConfig) {
    const shapeCount = getShapeCountInCategory(category.id);

    if (shapeCount > 0) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Cannot delete category",
        message: `"${category.name}" contains ${shapeCount} shape(s). Move or delete them first.`,
      });
      return;
    }

    const confirmed = await confirmAlert({
      title: "Delete Category",
      message: `Are you sure you want to delete "${category.name}"? This action cannot be undone.`,
      primaryAction: {
        title: "Delete",
        style: Alert.ActionStyle.Destructive,
      },
    });

    if (!confirmed) return;

    const toast = await showToast({ style: Toast.Style.Animated, title: "Deleting category..." });

    try {
      deleteCategory(category.id);

      toast.style = Toast.Style.Success;
      toast.title = "Category deleted!";
      toast.message = category.name;

      refreshCategories();
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to delete category";
      toast.message = error instanceof Error ? error.message : "Unknown error";
    }
  }

  async function handleOpenShapePicker(categoryId?: string) {
    try {
      await launchCommand({
        name: "shape-picker",
        type: LaunchType.UserInitiated,
        arguments: { category: categoryId || "" },
      });
    } catch {
      await showToast({ style: Toast.Style.Failure, title: "Failed to open Shape Picker" });
    }
  }

  return (
    <List searchBarPlaceholder="Search categories...">
      <List.Section title="Categories" subtitle={`${categories.length} total`}>
        {categories.map((category) => {
          const shapeCount = getShapeCountInCategory(category.id);
          return (
            <List.Item
              key={category.id}
              title={category.name}
              accessories={[{ text: `${shapeCount} shape${shapeCount !== 1 ? "s" : ""}` }]}
              actions={
                <ActionPanel>
                  <ActionPanel.Section title="Category Actions">
                    <Action
                      title="Rename Category"
                      icon={Icon.Pencil}
                      onAction={() => push(<RenameCategoryForm category={category} onSave={refreshCategories} />)}
                    />
                    <Action
                      title="Delete Category"
                      icon={Icon.Trash}
                      style={Action.Style.Destructive}
                      shortcut={{ modifiers: ["ctrl"], key: "x" }}
                      onAction={() => handleDeleteCategory(category)}
                    />
                  </ActionPanel.Section>
                  <ActionPanel.Section title="Add">
                    <Action
                      title="Add New Category"
                      icon={Icon.Plus}
                      shortcut={{ modifiers: ["cmd"], key: "n" }}
                      onAction={() => push(<AddCategoryForm onSave={refreshCategories} />)}
                    />
                  </ActionPanel.Section>
                  <ActionPanel.Section title="Navigate">
                    <Action
                      title={`Open "${category.name}" in Shape Picker`}
                      icon={Icon.AppWindowGrid3x3}
                      shortcut={{ modifiers: ["cmd"], key: "o" }}
                      onAction={() => handleOpenShapePicker(category.id)}
                    />
                  </ActionPanel.Section>
                </ActionPanel>
              }
            />
          );
        })}
      </List.Section>

      {categories.length === 0 && (
        <List.EmptyView
          icon={Icon.List}
          title="No categories"
          description="Add your first category to get started"
          actions={
            <ActionPanel>
              <Action
                title="Add New Category"
                icon={Icon.Plus}
                onAction={() => push(<AddCategoryForm onSave={refreshCategories} />)}
              />
            </ActionPanel>
          }
        />
      )}
    </List>
  );
}
