/**
 * Pure parser for the `inspect-zip.ps1` stdout contract.
 *
 * Phase 12 (Zip Slip + zipbomb guards). Paired with:
 *   - `assets/ps/inspect-zip.ps1` (Windows, System.IO.Compression.ZipFile)
 *   - `parseUnzipListingOutput` below (non-Windows, `unzip -l`)
 *
 * Both pipelines funnel into a common `ZipEntrySummary[]` so the downstream
 * safety checks in `zipSafety.ts` don't need to care where the entry list
 * came from.
 *
 * inspect-zip.ps1 line format:
 *     <UncompressedBytes>|<FullName>
 *
 * Followed by a terminator line:
 *     OK:<count>
 *
 * On failure the script emits a single `ERROR:<msg>` line instead.
 */
import type { ZipEntrySummary } from "./zipSafety";

export type InspectionParseResult =
  | { ok: true; entries: ZipEntrySummary[] }
  | { ok: false; reason: "error-line" | "missing-terminator" | "count-mismatch" | "malformed"; error: string };

/**
 * Parse inspect-zip.ps1 stdout. Returns a discriminated union mirroring the
 * three legitimate outcomes: success (entries), explicit ERROR line, or
 * malformed output (missing `OK:` terminator / count mismatch / unparseable
 * line).
 *
 * Blank lines are tolerated. STEP-style breadcrumbs are NOT expected (the PS
 * script intentionally emits only entry lines + sentinel) but any stray line
 * that is neither `OK:<n>`, `ERROR:<msg>`, nor matches `<size>|<name>` is
 * treated as malformed — better to fail closed than to silently ignore lines
 * that a future change might introduce.
 */
export function parseZipInspectionStdout(stdout: string): InspectionParseResult {
  const lines = stdout.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) {
    return { ok: false, reason: "missing-terminator", error: "Empty inspector output" };
  }

  const errorLine = lines.find((l) => l.startsWith("ERROR:"));
  if (errorLine) {
    return { ok: false, reason: "error-line", error: errorLine.replace(/^ERROR:/, "") };
  }

  // Terminator must be the last non-empty line to catch producers that emit
  // additional data after the sentinel (protocol drift → fail closed).
  const terminator = lines[lines.length - 1];
  const okMatch = /^OK:(\d+)$/.exec(terminator);
  if (!okMatch) {
    return { ok: false, reason: "missing-terminator", error: `No OK: terminator (last line: ${terminator})` };
  }
  const expectedCount = Number(okMatch[1]);

  const entries: ZipEntrySummary[] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i];
    const pipeAt = line.indexOf("|");
    if (pipeAt < 0) {
      return { ok: false, reason: "malformed", error: `Unparseable line: ${line}` };
    }
    const sizeStr = line.slice(0, pipeAt);
    const name = line.slice(pipeAt + 1);
    // Reject if the size isn't a non-negative integer; negative / NaN / empty
    // all fall through to assertZipEntries' `negative-size` later, but we can
    // surface the clearer parse error here.
    if (!/^\d+$/.test(sizeStr)) {
      return { ok: false, reason: "malformed", error: `Non-numeric size in line: ${line}` };
    }
    entries.push({
      name,
      size: Number(sizeStr),
      isDirectory: name.endsWith("/"),
    });
  }

  if (entries.length !== expectedCount) {
    return {
      ok: false,
      reason: "count-mismatch",
      error: `Terminator says ${expectedCount} entries, parsed ${entries.length}`,
    };
  }

  return { ok: true, entries };
}

/**
 * Parse `unzip -l <zip>` stdout into the same `ZipEntrySummary[]` shape.
 *
 * Expected layout (portable-info-zip `unzip` 6.x):
 *
 *     Archive:  example.zip
 *       Length      Date    Time    Name
 *     ---------  ---------- -----   ----
 *             0  2024-01-01 12:34   shapes/
 *           123  2024-01-01 12:34   shapes/rectangle.json
 *     ---------                     -------
 *           123                     2 files
 *
 * We identify the data region as the lines between the two `---------` dividers
 * and slice out `<length>` and `<name>` by character columns driven by the
 * position of "Name" in the header (name can contain spaces, so whitespace
 * splitting fails on names like "my file.txt").
 */
export function parseUnzipListingOutput(stdout: string): InspectionParseResult {
  const lines = stdout.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => /^\s*Length\s+Date\s+Time\s+Name\s*$/.test(l));
  if (headerIdx < 0) {
    return { ok: false, reason: "malformed", error: "No header row in unzip output" };
  }
  const nameCol = lines[headerIdx].indexOf("Name");
  if (nameCol < 0) {
    return { ok: false, reason: "malformed", error: "Cannot locate Name column" };
  }

  const dividers: number[] = [];
  for (let i = headerIdx + 1; i < lines.length && dividers.length < 2; i++) {
    if (/^-+\s+/.test(lines[i]) || /^-+\s*$/.test(lines[i]) || /^-{3,}/.test(lines[i])) {
      dividers.push(i);
    }
  }
  if (dividers.length < 2) {
    return { ok: false, reason: "malformed", error: "Missing divider rows in unzip output" };
  }

  const entries: ZipEntrySummary[] = [];
  for (let i = dividers[0] + 1; i < dividers[1]; i++) {
    const line = lines[i];
    if (line.trim().length === 0) continue;
    const sizeStr = line.slice(0, nameCol).trim().split(/\s+/)[0];
    const name = line.slice(nameCol);
    if (!/^\d+$/.test(sizeStr)) {
      return { ok: false, reason: "malformed", error: `Non-numeric size in unzip line: ${line}` };
    }
    entries.push({
      name,
      size: Number(sizeStr),
      isDirectory: name.endsWith("/"),
    });
  }

  return { ok: true, entries };
}
