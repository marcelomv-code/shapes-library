/**
 * Vitest mock shim for `@raycast/api`.
 *
 * Only the surface touched by the pure modules under test is implemented:
 * `environment.supportPath` (used by `paths.getLibraryRoot`) and
 * `getPreferenceValues` (used for `libraryPath` lookup).
 *
 * Tests drive behavior by mutating `__raycast.setPrefs(...)` and
 * `__raycast.setSupportPath(...)` in `tests/setup.ts` or per-test
 * `beforeEach` blocks.
 */

type Prefs = Record<string, unknown>;

const state: {
  prefs: Prefs;
  supportPath: string;
  assetsPath: string;
} = {
  prefs: {},
  supportPath: "",
  assetsPath: "",
};

export const environment = {
  get supportPath(): string {
    return state.supportPath;
  },
  get assetsPath(): string {
    return state.assetsPath;
  },
};

export function getPreferenceValues<T = Prefs>(): T {
  return state.prefs as T;
}

/** Test-only hooks — not part of the real Raycast surface. */
export const __raycast = {
  setPrefs(prefs: Prefs): void {
    state.prefs = { ...prefs };
  },
  setSupportPath(path: string): void {
    state.supportPath = path;
  },
  setAssetsPath(path: string): void {
    state.assetsPath = path;
  },
  reset(): void {
    state.prefs = {};
    state.supportPath = "";
    state.assetsPath = "";
  },
};
