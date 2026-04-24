import { existsSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";
import { showToast, Toast } from "@raycast/api";
import { getLibraryRoot } from "../../utils/paths";
import { runPowerShellFile, resolvePsScript } from "../../infra/powershell";
import { assertZipIsSafe } from "../../infra/zip/inspectZip";
import { invalidateCategoriesCache } from "../../utils/categoryManager";
import { createLogger } from "../../infra/logger";

const exportLog = createLogger("Export");
const importLog = createLogger("Import");

/**
 * Export the library (shapes, assets, native, deck) into a timestamped ZIP
 * under the Library Folder. Uses assets/ps/export-library.ps1 on Windows and
 * native `zip` elsewhere. Logs breadcrumbs to the Raycast dev console.
 */
export async function exportLibraryZip(): Promise<void> {
  const root = getLibraryRoot();
  const hasShapes = existsSync(join(root, "shapes"));
  const hasAssets = existsSync(join(root, "assets"));
  const hasNative = existsSync(join(root, "native"));
  const hasDeck = existsSync(join(root, "library_deck.pptx"));

  exportLog.info(`Root: ${root}`);
  exportLog.info(`Folders present -> shapes:${hasShapes} assets:${hasAssets} native:${hasNative} deck:${hasDeck}`);

  const toast = await showToast({ style: Toast.Style.Animated, title: "Exporting library..." });

  try {
    const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 13);
    const dest = join(root, `library_export_${ts}.zip`);

    if (process.platform === "win32") {
      // Phase 4: assets/ps/export-library.ps1 keeps the staging-folder
      // workaround (Compress-Archive misbehaves with multiple -Path inputs)
      // and emits "OK:<dest>" on success.
      const result = await runPowerShellFile(resolvePsScript("export-library"), { Root: root, Dest: dest });
      if (result.stdout) exportLog.info(`[stdout] ${result.stdout.trim()}`);
      if (result.stderr) exportLog.error(`[stderr] ${result.stderr.trim()}`);
      if (result.ok === false) {
        throw new Error(`PowerShell failed (${result.code ?? "n/a"}). ${result.message}`);
      }
      if (!/^OK:/m.test(result.stdout)) {
        throw new Error(`Unexpected output: ${result.stdout}`);
      }
    } else {
      // macOS/Linux: zip present directories only
      const include: string[] = [];
      if (hasShapes) include.push("shapes");
      if (hasAssets) include.push("assets");
      if (hasNative) include.push("native");
      if (hasDeck) include.push("library_deck.pptx");
      if (include.length === 0) throw new Error("Nothing to export");
      const args = ["-r", dest, ...include];
      exportLog.info(`Running: zip ${args.join(" ")}`);
      await new Promise<void>((resolve, reject) => {
        const zip = spawn("zip", args, { cwd: root });
        zip.stdout.on("data", (d) => exportLog.info(`[zip] ${d.toString().trim()}`));
        zip.stderr.on("data", (d) => exportLog.error(`[zip-err] ${d.toString().trim()}`));
        zip.on("error", (e) => reject(e));
        zip.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`zip failed (${code})`))));
      });
    }

    toast.style = Toast.Style.Success;
    toast.title = "Library exported";
    toast.message = root;
  } catch (e) {
    exportLog.error("Failed:", e);
    toast.style = Toast.Style.Failure;
    toast.title = "Export failed";
    toast.message = e instanceof Error ? e.message : "Unknown error";
  }
}

/**
 * Import a library ZIP into the current Library Folder. Expand-Archive on
 * Windows, `unzip -o` elsewhere. Throws if the zip is missing or the runner
 * reports failure.
 */
export async function importLibraryZip(zipPath: string): Promise<void> {
  const root = getLibraryRoot();
  if (!zipPath || !existsSync(zipPath)) throw new Error("ZIP not found");
  importLog.info(`root=${root} zip=${zipPath}`);

  // Phase 12 defense-in-depth: refuse zip-slip / zipbomb payloads
  // before any extraction tool touches the filesystem. Throws with a
  // human-readable message on any violation.
  const safety = await assertZipIsSafe(zipPath);
  importLog.info(`zip guard ok entries=${safety.entryCount} bytes=${safety.totalBytes}`);

  if (process.platform === "win32") {
    const result = await runPowerShellFile(resolvePsScript("import-library"), { Zip: zipPath, Dest: root });
    if (result.stdout) importLog.info(`[stdout] ${result.stdout.trim()}`);
    if (result.stderr) importLog.error(`[stderr] ${result.stderr.trim()}`);
    if (result.ok === false) {
      throw new Error(`PowerShell failed (${result.code ?? "n/a"}). ${result.message}`);
    }
    if (!/^OK:/m.test(result.stdout)) {
      throw new Error(`Unexpected output: ${result.stdout}`);
    }
    // Imports may overwrite categories.json outside of saveCategories.
    invalidateCategoriesCache();
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const unzip = spawn("unzip", ["-o", zipPath, "-d", root]);
    unzip.stdout.on("data", (d) => importLog.info(`[unzip] ${d.toString().trim()}`));
    unzip.stderr.on("data", (d) => importLog.error(`[unzip-err] ${d.toString().trim()}`));
    unzip.on("error", (e) => reject(e));
    unzip.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`unzip failed (${code})`))));
  });
  // Same rationale for non-Windows hosts.
  invalidateCategoriesCache();
}
