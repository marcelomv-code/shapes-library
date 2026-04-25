/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Enable Cache - Cache shape definitions for faster loading. */
  enableCache: boolean;
  /** Auto Cleanup Temp Files - Automatically delete temporary PowerPoint files after 60 seconds. */
  autoCleanup: boolean;
  /** Library Folder - Absolute folder path to store shapes JSON, previews, and native PPTX. Leave empty to use the Raycast support directory. */
  libraryPath?: string;
  /** Auto-Save After Capture - Automatically save the captured shape to the library without showing the form. */
  autoSaveAfterCapture: boolean;
  /** Force Exact Shapes Only - Block open and copy actions if there is no native PPTX available for 100% fidelity. */
  forceExactShapes: boolean;
  /** Use PPTX Library Deck - Store shapes inside a single PPTX deck and copy from it. */
  useLibraryDeck: boolean;
  /** Skip Native PPTX Save at Capture - Avoid saving a PPTX during capture for a faster and more reliable flow. Native insert still works and you can save later. */
  skipNativeSave: boolean;
  /** PowerPoint Template File (Optional) - Path to a PPTX template with your company theme. If provided, all captures will use this template's theme, colors, and fonts. Leave empty to use the Office default theme. */
  templatePath?: string;
};

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences;

declare namespace Preferences {
  /** Preferences accessible in the `shape-picker` command */
  export type ShapePicker = ExtensionPreferences & {};
  /** Preferences accessible in the `capture-shape` command */
  export type CaptureShape = ExtensionPreferences & {};
  /** Preferences accessible in the `manage-categories` command */
  export type ManageCategories = ExtensionPreferences & {};
}

declare namespace Arguments {
  /** Arguments passed to the `shape-picker` command */
  export type ShapePicker = {
    /** Category ID */
    category: string;
  };
  /** Arguments passed to the `capture-shape` command */
  export type CaptureShape = {};
  /** Arguments passed to the `manage-categories` command */
  export type ManageCategories = {};
}
