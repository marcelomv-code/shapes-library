/**
 * mockRaycast — ergonomic handle over the aliased Raycast shim.
 *
 * The previous draft tried to layer a second `vi.mock` on top of the
 * vitest alias (`@raycast/api` → `tests/mocks/raycast-api.ts`). That
 * double-mocking collided: vitest routes relative imports of the same
 * resolved file through the same mock registry, so the factory would
 * swallow the shim's own `__raycast` export. Removed.
 *
 * The shim itself (`tests/mocks/raycast-api.ts`) now hosts the spies
 * directly. This module just re-exports them so tests can read either
 * `import { raycast } from "../helpers/mockRaycast"` (ergonomic) or
 * `import { showToast, __raycast } from "@raycast/api"` (natural for
 * code under test to share call sites).
 */
import {
  Clipboard,
  __raycast,
  closeMainWindow,
  launchCommand,
  open,
  popToRoot,
  showToast,
  type ToastOptions,
} from "../mocks/raycast-api";

export type { ToastOptions };

export type RaycastMockSurface = {
  showToast: typeof showToast;
  launchCommand: typeof launchCommand;
  open: typeof open;
  popToRoot: typeof popToRoot;
  closeMainWindow: typeof closeMainWindow;
  Clipboard: typeof Clipboard;
  readonly toasts: ReadonlyArray<ToastOptions>;
};

const surface: RaycastMockSurface = {
  showToast,
  launchCommand,
  open,
  popToRoot,
  closeMainWindow,
  Clipboard,
  get toasts(): ReadonlyArray<ToastOptions> {
    return __raycast.toasts;
  },
};

/** Clear spy histories and captured toasts. `tests/setup.ts` already
 *  calls `__raycast.reset()` per-test, which covers the same ground;
 *  this function stays for tests that want a fine-grained reset inside
 *  an `it` block. */
export function resetRaycastMocks(): void {
  __raycast.resetSpies();
}

/** Back-compat shim — importing this module is already enough to get
 *  the mocks wired (via the vitest alias). Returns the shared surface
 *  so call sites reading `const raycast = installRaycastMocks()` keep
 *  compiling. */
export function installRaycastMocks(): RaycastMockSurface {
  return surface;
}

/** Re-exports for ergonomic access in tests. */
export { __raycast as raycastState };
export const raycast = surface;
