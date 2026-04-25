/**
 * Vitest shim for `@raycast/api`.
 *
 * Wired via `vitest.config.ts` alias: every `import x from "@raycast/api"`
 * in source or test code resolves to this file.
 *
 * The shim covers three concerns:
 *
 *   1. Passive surface the pure modules read — `getPreferenceValues`,
 *      `environment.supportPath`, `environment.assetsPath`.
 *   2. Active surface the pure modules call — `showToast`,
 *      `launchCommand`, `open`, `popToRoot`, `closeMainWindow`,
 *      `Clipboard`. These are `vi.fn()` spies so tests can assert
 *      "was showToast called with X?" without extra plumbing.
 *   3. Enums/constants referenced at module top level — `Toast.Style`,
 *      `Icon`, `Color`. Returned as Proxies so any accessor resolves
 *      to a string stand-in.
 *
 * `__raycast` is the test-only back door: prefs / support path mutators
 * plus a `reset()` that tests/setup.ts drives per-test. `toasts` is a
 * captured log of every `showToast` payload, useful for assertions.
 */
import { vi } from "vitest";

type Prefs = Record<string, unknown>;

export type ToastOptions = {
  style?: string;
  title?: string;
  message?: string;
  primaryAction?: unknown;
};

const state: {
  prefs: Prefs;
  supportPath: string;
  assetsPath: string;
  toasts: ToastOptions[];
} = {
  prefs: {},
  supportPath: "",
  assetsPath: "",
  toasts: [],
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

export const showToast = vi.fn(async (opts: ToastOptions) => {
  state.toasts.push(opts);
  return { hide: vi.fn(), show: vi.fn() };
});

export const launchCommand = vi.fn();
export const open = vi.fn();
export const popToRoot = vi.fn();
export const closeMainWindow = vi.fn();

export const Clipboard = {
  copy: vi.fn(),
  paste: vi.fn(),
  read: vi.fn(),
};

export const Toast = {
  Style: { Success: "SUCCESS", Failure: "FAILURE", Animated: "ANIMATED" },
};

// Raycast ships `Icon` and `Color` as enums of string tokens. Source
// code reads members like `Icon.Stars` or `Color.Red`; we return the
// property name verbatim so comparisons against string literals still
// work in tests.
export const Icon = new Proxy({}, { get: (_t, name) => String(name) });
export const Color = new Proxy({}, { get: (_t, name) => String(name) });

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
  /** Clear captured toasts and reset spy histories (non-destructive of
   *  `vi.fn()` implementations). */
  resetSpies(): void {
    state.toasts.length = 0;
    showToast.mockClear();
    launchCommand.mockClear();
    open.mockClear();
    popToRoot.mockClear();
    closeMainWindow.mockClear();
    Clipboard.copy.mockClear();
    Clipboard.paste.mockClear();
    Clipboard.read.mockClear();
  },
  /** Inspect captured toast payloads. Returns the live array — do not
   *  mutate directly; use `resetSpies()` to clear. */
  get toasts(): ReadonlyArray<ToastOptions> {
    return state.toasts;
  },
  reset(): void {
    state.prefs = {};
    state.supportPath = "";
    state.assetsPath = "";
    state.toasts.length = 0;
    showToast.mockClear();
    launchCommand.mockClear();
    open.mockClear();
    popToRoot.mockClear();
    closeMainWindow.mockClear();
    Clipboard.copy.mockClear();
    Clipboard.paste.mockClear();
    Clipboard.read.mockClear();
  },
};
