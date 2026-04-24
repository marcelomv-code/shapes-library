/**
 * mockFs — in-memory fs wrapper for Vitest.
 *
 * Uses `vi.mock("node:fs")` and `vi.mock("node:fs/promises")` to replace
 * both sync and promise flavours of `fs` with a map-backed volume. The
 * helpers here keep test setup terse and isolated: each test calls
 * `mockFsReset()` then seeds files with `mockFsSeed({...})`.
 *
 * Scope — Only the subset the source tree actually calls is modeled:
 *   existsSync, statSync, readFileSync, writeFileSync, mkdirSync,
 *   readdirSync, renameSync, copyFileSync, unlinkSync, rmSync.
 * Promise: readFile, writeFile, access, unlink, mkdir, rm, rename,
 *          copyFile, readdir, stat.
 *
 * This intentionally avoids pulling in `memfs` so the helper stays a
 * ~150-line dependency-free shim. If the needs of Phase 2+ exceed this
 * coverage, swap to memfs in one place.
 */
import { vi } from "vitest";
import { dirname, normalize, posix, sep } from "node:path";

type FileEntry = { type: "file"; content: Buffer; mtimeMs: number };
type DirEntry = { type: "dir"; mtimeMs: number };
type Entry = FileEntry | DirEntry;

const volume = new Map<string, Entry>();

function norm(p: string): string {
  // Normalize to forward slashes and strip trailing separator.
  const n = normalize(p).split(sep).join(posix.sep);
  return n.length > 1 && n.endsWith(posix.sep) ? n.slice(0, -1) : n;
}

function ensureDirExists(path: string): void {
  const parts = norm(path).split(posix.sep).filter(Boolean);
  let acc = norm(path).startsWith(posix.sep) ? "" : ".";
  for (const p of parts) {
    acc = acc === "" ? `/${p}` : acc === "." ? p : `${acc}/${p}`;
    if (!volume.has(acc)) {
      volume.set(acc, { type: "dir", mtimeMs: Date.now() });
    }
  }
}

/** Remove every seeded file. Call in `beforeEach`. */
export function mockFsReset(): void {
  volume.clear();
}

/** Seed the volume with `{ path: contentString | Buffer | null }` entries.
 *  `null` creates a directory; strings/Buffers create files. */
export function mockFsSeed(entries: Record<string, string | Buffer | null>): void {
  for (const [rawPath, value] of Object.entries(entries)) {
    const p = norm(rawPath);
    ensureDirExists(dirname(p));
    if (value === null) {
      volume.set(p, { type: "dir", mtimeMs: Date.now() });
    } else {
      const content = typeof value === "string" ? Buffer.from(value, "utf8") : value;
      volume.set(p, { type: "file", content, mtimeMs: Date.now() });
    }
  }
}

/** Inspect the volume (for assertions). Returns `undefined` if missing. */
export function mockFsRead(path: string): Buffer | undefined {
  const e = volume.get(norm(path));
  return e?.type === "file" ? e.content : undefined;
}

export function mockFsExists(path: string): boolean {
  return volume.has(norm(path));
}

export function mockFsList(prefix = ""): string[] {
  const p = prefix ? norm(prefix) : "";
  return Array.from(volume.keys()).filter((k) => (p ? k.startsWith(p) : true));
}

function statFromEntry(path: string, e: Entry) {
  return {
    isFile: () => e.type === "file",
    isDirectory: () => e.type === "dir",
    isSymbolicLink: () => false,
    size: e.type === "file" ? e.content.byteLength : 0,
    mtime: new Date(e.mtimeMs),
    mtimeMs: e.mtimeMs,
    ctime: new Date(e.mtimeMs),
    ctimeMs: e.mtimeMs,
    birthtime: new Date(e.mtimeMs),
    birthtimeMs: e.mtimeMs,
    atime: new Date(e.mtimeMs),
    atimeMs: e.mtimeMs,
    // Convenience for tests that read the path back.
    _mockPath: path,
  };
}

function raise(code: string, syscall: string, path: string): never {
  const err = new Error(`${code}: ${syscall} '${path}'`) as NodeJS.ErrnoException;
  err.code = code;
  err.syscall = syscall;
  err.path = path;
  throw err;
}

const sync = {
  existsSync(p: string): boolean {
    return volume.has(norm(p));
  },
  statSync(p: string) {
    const e = volume.get(norm(p));
    if (!e) raise("ENOENT", "stat", p);
    return statFromEntry(p, e);
  },
  readFileSync(p: string, encoding?: BufferEncoding | { encoding?: BufferEncoding }) {
    const e = volume.get(norm(p));
    if (!e || e.type !== "file") raise("ENOENT", "open", p);
    const enc = typeof encoding === "string" ? encoding : encoding?.encoding;
    return enc ? (e as FileEntry).content.toString(enc) : (e as FileEntry).content;
  },
  writeFileSync(p: string, data: string | Buffer) {
    ensureDirExists(dirname(norm(p)));
    const content = typeof data === "string" ? Buffer.from(data, "utf8") : data;
    volume.set(norm(p), { type: "file", content, mtimeMs: Date.now() });
  },
  mkdirSync(p: string, opts?: { recursive?: boolean }) {
    if (opts?.recursive) ensureDirExists(norm(p));
    else volume.set(norm(p), { type: "dir", mtimeMs: Date.now() });
  },
  readdirSync(p: string) {
    const np = norm(p);
    if (!volume.has(np)) raise("ENOENT", "scandir", p);
    const prefix = np === posix.sep ? posix.sep : `${np}${posix.sep}`;
    const out = new Set<string>();
    for (const key of volume.keys()) {
      if (key.startsWith(prefix)) {
        const rest = key.slice(prefix.length);
        const head = rest.split(posix.sep)[0];
        if (head) out.add(head);
      }
    }
    return Array.from(out);
  },
  renameSync(from: string, to: string) {
    const src = volume.get(norm(from));
    if (!src) raise("ENOENT", "rename", from);
    volume.delete(norm(from));
    ensureDirExists(dirname(norm(to)));
    volume.set(norm(to), src);
  },
  copyFileSync(from: string, to: string) {
    const src = volume.get(norm(from));
    if (!src || src.type !== "file") raise("ENOENT", "copyfile", from);
    ensureDirExists(dirname(norm(to)));
    volume.set(norm(to), { type: "file", content: Buffer.from((src as FileEntry).content), mtimeMs: Date.now() });
  },
  unlinkSync(p: string) {
    if (!volume.delete(norm(p))) raise("ENOENT", "unlink", p);
  },
  rmSync(p: string, opts?: { recursive?: boolean; force?: boolean }) {
    const np = norm(p);
    if (opts?.recursive) {
      const prefix = `${np}${posix.sep}`;
      for (const k of Array.from(volume.keys())) {
        if (k === np || k.startsWith(prefix)) volume.delete(k);
      }
      return;
    }
    if (!volume.delete(np) && !opts?.force) raise("ENOENT", "unlink", p);
  },
};

const promises = {
  async readFile(p: string, encoding?: BufferEncoding) {
    return sync.readFileSync(p, encoding);
  },
  async writeFile(p: string, data: string | Buffer) {
    sync.writeFileSync(p, data);
  },
  async access(p: string) {
    if (!volume.has(norm(p))) raise("ENOENT", "access", p);
  },
  async unlink(p: string) {
    sync.unlinkSync(p);
  },
  async mkdir(p: string, opts?: { recursive?: boolean }) {
    sync.mkdirSync(p, opts);
  },
  async rm(p: string, opts?: { recursive?: boolean; force?: boolean }) {
    sync.rmSync(p, opts);
  },
  async rename(from: string, to: string) {
    sync.renameSync(from, to);
  },
  async copyFile(from: string, to: string) {
    sync.copyFileSync(from, to);
  },
  async readdir(p: string) {
    return sync.readdirSync(p);
  },
  async stat(p: string) {
    return sync.statSync(p);
  },
};

/**
 * Installs `vi.mock` wiring for `node:fs` and `node:fs/promises` so any
 * module under test that imports them transparently hits the in-memory
 * volume. Call this once at the top of a test file (it's idempotent).
 */
export function installFsMocks(): void {
  vi.mock("node:fs", () => ({ ...sync, default: sync, promises }));
  vi.mock("node:fs/promises", () => ({ ...promises, default: promises }));
  vi.mock("fs", () => ({ ...sync, default: sync, promises }));
  vi.mock("fs/promises", () => ({ ...promises, default: promises }));
}

export const mockFs = { sync, promises };
