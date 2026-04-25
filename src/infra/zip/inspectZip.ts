/**
 * Pre-extraction zip inspector.
 *
 * Phase 12. Bridges the pure validators in `src/domain/zip/` with the OS-level
 * inspection tools (`inspect-zip.ps1` on Windows, `unzip -l` on macOS/Linux)
 * so both import call sites (`features/shape-picker/libraryZip.ts` and
 * `src/import-library.tsx`) can refuse Zip Slip / zipbomb payloads before
 * anything touches the destination filesystem.
 *
 * This module is intentionally the ONLY layer that does I/O for safety
 * checking. The `src/domain/zip/*` modules stay pure and fully unit-testable.
 */
import { spawn } from "child_process";
import {
  parseZipInspectionStdout,
  parseUnzipListingOutput,
  type InspectionParseResult,
} from "../../domain/zip/parseZipInspection";
import { assertZipEntries, describeZipViolation, DEFAULT_ZIP_LIMITS, type ZipLimits } from "../../domain/zip/zipSafety";
import { runPowerShellFile, resolvePsScript } from "../powershell";

/**
 * Inspect a zip and throw if it violates Zip Slip / zipbomb guards.
 *
 * On Windows, runs `assets/ps/inspect-zip.ps1` (System.IO.Compression.ZipFile)
 * which lists each entry's uncompressed size and name without extracting.
 * Elsewhere, runs `unzip -l <zip>` and parses the tabular listing.
 *
 * Returns summary counts on success for logging; throws an Error with a
 * descriptive message on any failure mode (inspector error, parse error,
 * validation violation).
 *
 * `limits` defaults to `DEFAULT_ZIP_LIMITS`. Callers that import from
 * constrained sources can tighten them.
 */
export async function assertZipIsSafe(
  zipPath: string,
  limits: ZipLimits = DEFAULT_ZIP_LIMITS
): Promise<{ totalBytes: number; entryCount: number }> {
  const parseResult = await inspectZipEntries(zipPath);
  if (parseResult.ok === false) {
    throw new Error(`Zip inspection failed (${parseResult.reason}): ${parseResult.error}`);
  }

  const validation = assertZipEntries(parseResult.entries, limits);
  if (validation.ok === false) {
    throw new Error(describeZipViolation(validation.violation));
  }

  return { totalBytes: validation.totalBytes, entryCount: validation.entryCount };
}

/**
 * Low-level: return the parsed entry list without running the safety checks.
 * Exposed so tests or tooling can inspect without enforcing limits.
 */
export async function inspectZipEntries(zipPath: string): Promise<InspectionParseResult> {
  if (process.platform === "win32") {
    const result = await runPowerShellFile(resolvePsScript("inspect-zip"), { Zip: zipPath });
    if (result.ok === false) {
      return {
        ok: false,
        reason: "error-line",
        error: result.message || `PowerShell failed (${result.code ?? "n/a"})`,
      };
    }
    return parseZipInspectionStdout(result.stdout);
  }

  const stdout = await runUnzipList(zipPath);
  return parseUnzipListingOutput(stdout);
}

function runUnzipList(zipPath: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    const child = spawn("unzip", ["-l", zipPath]);
    child.stdout.on("data", (d) => chunks.push(Buffer.from(d)));
    child.stderr.on("data", (d) => errChunks.push(Buffer.from(d)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks).toString("utf8"));
      } else {
        reject(new Error(`unzip -l failed (${code}): ${Buffer.concat(errChunks).toString("utf8")}`));
      }
    });
  });
}
