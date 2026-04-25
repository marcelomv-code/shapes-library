import { environment, getPreferenceValues } from "@raycast/api";
import { existsSync, mkdirSync, realpathSync } from "fs";
import { dirname, join, isAbsolute, normalize, relative, resolve } from "path";
import { homedir } from "os";

type Prefs = { libraryPath?: string };

function expandUserPath(p: string): string {
  if (!p) return p;
  let out = p.trim();
  if ((out.startsWith('"') && out.endsWith('"')) || (out.startsWith("'") && out.endsWith("'"))) {
    out = out.slice(1, -1);
  }
  // Expand %VAR% on Windows
  out = out.replace(/%([A-Za-z0-9_]+)%/g, (_, v) => process.env[v] || "");
  // Expand ~ to home
  if (out.startsWith("~")) {
    out = join(homedir(), out.slice(1));
  }
  // If relative, anchor to home
  if (!isAbsolute(out)) {
    out = join(homedir(), out);
  }
  // Users can type forward slashes on Windows ("C:/foo/bar" or
  // "%VAR%/subdir"). `path.normalize` collapses them to the platform
  // separator so the returned path is consistent with what the rest of
  // the code expects (and with what `join` produces elsewhere).
  return normalize(out);
}

// Memoized library root. Raycast command processes are short-lived and the
// `libraryPath` preference can only change between invocations, so a single
// resolution per process is safe. Reset via `resetLibraryRootCache()` in tests.
let cachedLibraryRoot: string | undefined;

// Sandbox roots override — tests only. In production we always derive the
// allowed roots from `homedir()` + `environment.supportPath`.
let sandboxRootsOverride: string[] | undefined;

function defaultSandboxRoots(): string[] {
  return [homedir(), environment.supportPath].filter((r): r is string => Boolean(r));
}

// Resolve a path through any filesystem links / Windows 8.3 short names so
// the sandbox compares canonical forms. `os.homedir()` returns the long
// form (`C:\Users\m.vieira`) while `os.tmpdir()` may return the short form
// (`C:\Users\M9F72~1.VIE\AppData\Local\Temp`); `path.relative` is purely
// string-based and would treat them as different ancestors.
//
// For paths that don't exist yet (a fresh `libraryPath` the user just
// configured) we walk up to the nearest existing ancestor, realpath that,
// and re-attach the missing tail.
function safeRealPath(p: string): string {
  const abs = resolve(p);
  try {
    return realpathSync.native(abs);
  } catch {
    let current = abs;
    let tail = "";
    while (true) {
      const parent = dirname(current);
      if (parent === current) return abs;
      const segment = current.slice(parent.length).replace(/^[\\/]+/, "");
      tail = tail ? join(segment, tail) : segment;
      current = parent;
      try {
        return join(realpathSync.native(current), tail);
      } catch {
        // continue walking up
      }
    }
  }
}

function isWithinRoot(child: string, root: string): boolean {
  const rel = relative(safeRealPath(root), safeRealPath(child));
  // `relative` returns "" for same dir, "..." for ascending, "x/y" for
  // descending. An absolute return means the two paths are on different
  // Windows drives — also out of sandbox.
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function assertWithinSandbox(absPath: string): void {
  const roots = sandboxRootsOverride ?? defaultSandboxRoots();
  if (!roots.some((r) => isWithinRoot(absPath, r))) {
    throw new Error(`Library path out of sandbox: ${absPath}`);
  }
}

export function getLibraryRoot(): string {
  if (cachedLibraryRoot !== undefined) return cachedLibraryRoot;

  const prefs = getPreferenceValues<Prefs>();
  const configured =
    prefs.libraryPath && prefs.libraryPath.trim().length > 0 ? expandUserPath(prefs.libraryPath) : undefined;
  if (configured) assertWithinSandbox(configured);
  const base = configured || environment.supportPath;
  try {
    if (!existsSync(base)) mkdirSync(base, { recursive: true });
  } catch (e) {
    // Fallback to supportPath if creation failed
    if (!existsSync(environment.supportPath)) {
      try {
        mkdirSync(environment.supportPath, { recursive: true });
      } catch {}
    }
    cachedLibraryRoot = environment.supportPath;
    return cachedLibraryRoot;
  }
  cachedLibraryRoot = base;
  return cachedLibraryRoot;
}

/**
 * Invalidate the memoized library root. Intended for tests or for callers that
 * mutate the `libraryPath` preference mid-process (not a current use case).
 */
export function resetLibraryRootCache(): void {
  cachedLibraryRoot = undefined;
}

/**
 * Test-only hook: override the sandbox roots used by `getLibraryRoot()`.
 * Pass `undefined` to restore the default `[homedir(), environment.supportPath]`.
 */
export function __setSandboxRoots(roots: string[] | undefined): void {
  sandboxRootsOverride = roots;
}

export function getShapesDir(): string {
  const dir = join(getLibraryRoot(), "shapes");
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  } catch {}
  return dir;
}

export function getAssetsDir(): string {
  const dir = join(getLibraryRoot(), "assets");
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  } catch {}
  return dir;
}

export function getNativeDir(): string {
  const dir = join(getLibraryRoot(), "native");
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  } catch {}
  return dir;
}
