/**
 * Factory + barrel for the PowerPoint adapter layer.
 *
 * Call sites resolve the right adapter through `getPowerPointClient()`;
 * the factory picks by `process.platform` and caches a module-scoped
 * instance (Raycast commands are short-lived processes, so a singleton
 * is safe and avoids constructing the class on every action).
 *
 * Tests can inject a specific adapter via `setPowerPointClient()` (e.g.
 * pass a `MockPowerPointClient`) and should call `resetPowerPointClient()`
 * in `afterEach` to avoid cross-test contamination.
 *
 * `getDeckPath()` is exposed here so call sites resolve the canonical
 * deck path WITHOUT reaching into the Windows adapter directly -- keeps
 * the import surface flat and mock-friendly.
 */

import type { PowerPointClient } from "../../domain/powerpoint/PowerPointClient";
import { WindowsComPowerPointClient, deckPathFromLibraryRoot } from "./WindowsComPowerPointClient";
import { MacPowerPointClient } from "./MacPowerPointClient";

export type { PowerPointClient } from "../../domain/powerpoint/PowerPointClient";
export type { ExtractedShape, ExtractionResult } from "../../domain/powerpoint/types";
export { WindowsComPowerPointClient } from "./WindowsComPowerPointClient";
export { MacPowerPointClient } from "./MacPowerPointClient";
export { MockPowerPointClient } from "./MockPowerPointClient";
export type { MockResponses } from "./MockPowerPointClient";

let cachedClient: PowerPointClient | undefined;

/**
 * Returns the PowerPoint adapter for the current platform. Caches the
 * instance so repeated calls within a command don't re-construct the
 * class. Throws for unsupported platforms rather than returning a
 * silent no-op -- the UI layer should surface this as a toast.
 */
export function getPowerPointClient(): PowerPointClient {
  if (cachedClient) return cachedClient;

  if (process.platform === "win32") {
    cachedClient = new WindowsComPowerPointClient();
  } else if (process.platform === "darwin") {
    cachedClient = new MacPowerPointClient();
  } else {
    throw new Error(`Unsupported operating system: ${process.platform}. Only Windows and macOS are supported.`);
  }
  return cachedClient;
}

/**
 * Override the adapter. Intended for tests -- production code should
 * use `getPowerPointClient()` and let the factory pick.
 */
export function setPowerPointClient(client: PowerPointClient): void {
  cachedClient = client;
}

/**
 * Clear the cached adapter. Call from `afterEach` so the next test
 * starts from a clean slate.
 */
export function resetPowerPointClient(): void {
  cachedClient = undefined;
}

/**
 * Canonical library deck path. Derived from `environment` preferences
 * (library root); centralised here so both the Windows adapter's
 * `createDeck()` implementation and external call sites agree on the
 * exact filename.
 */
export function getDeckPath(): string {
  return deckPathFromLibraryRoot();
}
