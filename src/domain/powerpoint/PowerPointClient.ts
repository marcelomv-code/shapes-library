/**
 * Port (interface) for PowerPoint automation.
 *
 * Phase 5 introduces this port as the boundary between UI / feature code
 * (e.g. `shape-picker.tsx`, `capture-shape.tsx`) and platform-specific
 * adapters that drive PowerPoint (Windows COM via PowerShell, macOS
 * AppleScript, or in-memory mock for tests).
 *
 * Design notes:
 * - Paths are passed explicitly for deck operations so the domain never
 *   reaches into Raycast preferences (`getLibraryRoot`) itself. Callers
 *   resolve the deck path via the `getDeckPath()` helper exported by the
 *   infra factory, keeping prefs/env coupling at the edge.
 * - `createDeck` is idempotent: if the deck already exists at the
 *   canonical path the adapter must return the existing path unchanged.
 *   The name follows the Phase 5 plan's nomenclature even though the
 *   semantic is "ensure or create".
 * - The `copyDeckSlideToClipboard` method is a Phase 5 addendum (not in
 *   the original plan interface) needed to preserve parity with the
 *   pre-refactor "copy from library_deck slide N" fidelity path. Without
 *   it, the `useLibraryDeck` preference would have to go through the
 *   slower "export slide -> pptx -> copy-via-powerpoint" round-trip.
 */

import type { ExtractionResult } from "./types";

export interface PowerPointClient {
  /**
   * Capture the currently-selected shape from the active PowerPoint
   * presentation. Returns `{success: false}` with a human-readable `error`
   * when no presentation is open or no shape is selected rather than
   * throwing -- the UI surfaces the message verbatim in a toast.
   */
  captureSelectedShape(): Promise<ExtractionResult>;

  /**
   * Copy the shape contained in `pptxPath` to the system clipboard by
   * opening the file in the active PowerPoint instance and invoking
   * Copy on slide 1's shape(s). Throws on any PowerPoint-side error.
   * Windows-only in practice; Mac/Mock adapters should throw or no-op.
   */
  copyShapeToClipboard(pptxPath: string): Promise<void>;

  /**
   * Copy a specific slide from the library deck to the clipboard.
   * Used by the `useLibraryDeck` fidelity path in `shape-picker.tsx` so
   * the shape retains its native theme without an intermediate pptx
   * round-trip.
   */
  copyDeckSlideToClipboard(deckPath: string, slideIndex: number): Promise<void>;

  /**
   * Insert slide `slideIndex` from the library deck as a new slide in
   * the currently-active PowerPoint presentation. Throws "No
   * presentation is open" (verbatim) if none is active -- caller treats
   * this message as user-facing.
   */
  insertSlide(deckPath: string, slideIndex: number): Promise<void>;

  /**
   * Append the first slide of `sourcePath` (a single-shape pptx produced
   * by `captureSelectedShape` or `generateShapePptx`) as the next slide
   * of the deck at `deckPath`. Returns the new slide's 1-based index.
   */
  addSlideFromPptx(deckPath: string, sourcePath: string): Promise<number>;

  /**
   * Ensure the library deck exists, creating it from `templatePath` if
   * supplied (else from a blank Office-theme presentation). Idempotent:
   * returns the deck path unchanged if the deck already exists.
   */
  createDeck(templatePath?: string): Promise<string>;
}
