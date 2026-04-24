/**
 * Pure validators for zip archive safety. Phase 12 (Zip Slip + zipbomb guards).
 *
 * Designed to run BEFORE extraction so a malicious archive never touches the
 * destination filesystem. The adapters (inspect-zip.ps1 on Windows, `unzip -l`
 * elsewhere) supply the entry list; this module is responsible for deciding
 * whether the list is safe to extract.
 *
 * Two independent threats are covered:
 *
 *  1. Zip Slip — entries whose path escapes the destination via absolute paths,
 *     Windows drive letters, or `..` segments. Canonical reference:
 *     https://snyk.io/research/zip-slip-vulnerability
 *
 *  2. Zipbomb — archives that expand to many orders of magnitude more than
 *     their on-disk size, exhausting storage or memory. We cap (a) total
 *     uncompressed bytes, (b) entry count, and (c) any single entry's size.
 *
 * All functions are pure: no fs, no child_process, no Raycast. They take plain
 * values and return discriminated-union results so callers can pattern-match
 * without catching exceptions.
 */

/** Limit set applied during validation. All values are upper bounds. */
export interface ZipLimits {
  /** Hard cap on the sum of `size` across all entries. */
  maxTotalBytes: number;
  /** Hard cap on the number of entries. */
  maxEntries: number;
  /** Hard cap on any single entry's uncompressed size. */
  maxEntryBytes: number;
}

/**
 * Default limits sized for the shapes-library import surface (`library_export_*.zip`).
 *
 *  - `maxTotalBytes` 500 MiB — library exports observed so far stay under 5 MiB.
 *    Two orders of magnitude of headroom lets legitimate growth through.
 *  - `maxEntries` 10_000 — per-category asset folders top out in the low hundreds.
 *  - `maxEntryBytes` 200 MiB — no single file in an export should approach this;
 *    hitting it means either corruption or a crafted single-entry bomb.
 */
export const DEFAULT_ZIP_LIMITS: ZipLimits = {
  maxTotalBytes: 500 * 1024 * 1024,
  maxEntries: 10_000,
  maxEntryBytes: 200 * 1024 * 1024,
};

/**
 * Entry summary as produced by the inspector adapters. `size` is uncompressed
 * bytes (reading `Length` from `System.IO.Compression.ZipArchiveEntry` on
 * Windows, or the "Length" column of `unzip -l` elsewhere). Directory entries
 * report size 0 and are skipped by the size/slip checks but counted toward
 * `maxEntries`.
 */
export interface ZipEntrySummary {
  name: string;
  size: number;
  isDirectory?: boolean;
}

/** Reasons a single entry path may be rejected. */
export type EntryPathViolation =
  | "empty"
  | "absolute-posix"
  | "absolute-windows"
  | "drive-letter"
  | "null-byte"
  | "parent-escape"
  | "backslash";

export type EntryPathResult = { ok: true; normalized: string } | { ok: false; reason: EntryPathViolation };

/**
 * Validate a single zip entry name. Returns `ok:true` with the forward-slash
 * normalized relative path on success, or a typed violation on failure.
 *
 * Contract:
 *  - Empty / whitespace-only names are rejected.
 *  - Backslashes are rejected outright. Legit zips use forward slashes; a
 *    backslash-only separator is either a crafted Windows-escape attempt or
 *    a producer bug we would rather surface than silently normalize.
 *  - Absolute POSIX paths (`/foo`), absolute UNC (`\\host\share\...`) and
 *    drive-letter paths (`C:\foo`, `C:/foo`) are rejected.
 *  - Null bytes (`\0`) are rejected — they truncate C-string filesystem calls.
 *  - After splitting on `/`, any segment equal to `..` is a parent escape.
 *    A trailing `/` (directory entry) is accepted.
 *  - `.` segments are permitted and dropped (producers sometimes emit them).
 *
 * Note: we deliberately do NOT resolve symlinks — the inspector never extracts
 * anything, so symlink-based Zip Slip is moot at this stage. The adapter layer
 * must still use `Expand-Archive` / `unzip` (neither honors in-archive symlinks
 * as links by default on Windows; `unzip` needs `-s-` to be safe but defaults
 * to treating them as regular files anyway).
 */
export function validateEntryPath(name: string): EntryPathResult {
  if (typeof name !== "string" || name.length === 0 || name.trim().length === 0) {
    return { ok: false, reason: "empty" };
  }
  if (name.includes("\0")) {
    return { ok: false, reason: "null-byte" };
  }
  if (name.includes("\\")) {
    return { ok: false, reason: "backslash" };
  }
  if (name.startsWith("/")) {
    return { ok: false, reason: "absolute-posix" };
  }
  // Windows drive-letter: C:, C:/, C:\ (backslash already filtered above, but
  // catch any `X:` regardless of separator in case a producer smuggled just
  // the letter).
  if (/^[A-Za-z]:/.test(name)) {
    return { ok: false, reason: "drive-letter" };
  }
  // UNC-style (should have been caught by backslash above but double-belt).
  if (name.startsWith("//")) {
    return { ok: false, reason: "absolute-windows" };
  }

  const segments: string[] = [];
  for (const raw of name.split("/")) {
    if (raw === "" || raw === ".") continue; // tolerate ./ and trailing/ empties
    if (raw === "..") {
      return { ok: false, reason: "parent-escape" };
    }
    segments.push(raw);
  }

  // Re-join without any leading / and preserve trailing slash for directory entries.
  const trailing = name.endsWith("/") ? "/" : "";
  return { ok: true, normalized: segments.join("/") + trailing };
}

/** Reasons a zip as a whole may be rejected. */
export type ZipViolation =
  | { kind: "too-many-entries"; actual: number; limit: number }
  | { kind: "total-size"; actual: number; limit: number }
  | { kind: "entry-size"; name: string; actual: number; limit: number }
  | { kind: "entry-path"; name: string; reason: EntryPathViolation }
  | { kind: "negative-size"; name: string; actual: number };

export type ZipValidationResult =
  | { ok: true; totalBytes: number; entryCount: number }
  | { ok: false; violation: ZipViolation };

/**
 * Validate a complete entry list against limits and per-entry path rules.
 *
 * Short-circuits on the first violation and reports which entry tripped it.
 * This is deliberate: the UI surfaces a single actionable error rather than a
 * paged list of violations, and a malicious zip only needs one to be refused.
 *
 * The check order is chosen so cheap structural checks run first
 * (`maxEntries` -> path validation -> per-entry size -> total size accumulation).
 *
 * `limits` defaults to `DEFAULT_ZIP_LIMITS`. Callers that want a tighter bound
 * (e.g. rejecting any zip > 50 MiB during a restricted-mode import) pass their
 * own.
 */
export function assertZipEntries(
  entries: readonly ZipEntrySummary[],
  limits: ZipLimits = DEFAULT_ZIP_LIMITS
): ZipValidationResult {
  if (entries.length > limits.maxEntries) {
    return {
      ok: false,
      violation: { kind: "too-many-entries", actual: entries.length, limit: limits.maxEntries },
    };
  }

  let total = 0;
  for (const entry of entries) {
    const pathResult = validateEntryPath(entry.name);
    if (pathResult.ok === false) {
      return { ok: false, violation: { kind: "entry-path", name: entry.name, reason: pathResult.reason } };
    }

    const size = Number.isFinite(entry.size) ? entry.size : 0;
    if (size < 0) {
      return { ok: false, violation: { kind: "negative-size", name: entry.name, actual: size } };
    }
    if (size > limits.maxEntryBytes) {
      return {
        ok: false,
        violation: { kind: "entry-size", name: entry.name, actual: size, limit: limits.maxEntryBytes },
      };
    }

    total += size;
    if (total > limits.maxTotalBytes) {
      return {
        ok: false,
        violation: { kind: "total-size", actual: total, limit: limits.maxTotalBytes },
      };
    }
  }

  return { ok: true, totalBytes: total, entryCount: entries.length };
}

/**
 * Human-readable rendering for a zip violation. Used by the adapter when
 * rethrowing so both the Raycast toast and the dev-console log carry the same
 * message. Kept here (pure module) so the message wording is covered by tests.
 */
export function describeZipViolation(v: ZipViolation): string {
  switch (v.kind) {
    case "too-many-entries":
      return `Zip rejected: ${v.actual} entries exceed limit of ${v.limit}`;
    case "total-size":
      return `Zip rejected: uncompressed size ${v.actual} bytes exceeds limit of ${v.limit} bytes`;
    case "entry-size":
      return `Zip rejected: entry "${v.name}" is ${v.actual} bytes (limit ${v.limit})`;
    case "entry-path":
      return `Zip rejected: unsafe entry path "${v.name}" (${v.reason})`;
    case "negative-size":
      return `Zip rejected: entry "${v.name}" has negative size ${v.actual}`;
  }
}
