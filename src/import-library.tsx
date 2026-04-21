import { showToast, Toast, showInFinder, Clipboard } from "@raycast/api";
import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";
import { tmpdir } from "os";
import { getLibraryRoot } from "./utils/paths";
import { runPowerShellFile, resolvePsScript } from "./infra/powershell";

interface Args {
  zipPath: string;
}

export default async function ImportLibrary(props: { arguments: Args }) {
  const toast = await showToast({ style: Toast.Style.Animated, title: "Importing library..." });
  try {
    const zip = props.arguments.zipPath?.trim();
    if (!zip || !existsSync(zip)) {
      toast.style = Toast.Style.Failure;
      toast.title = "ZIP not found";
      toast.message = zip || "Provide a valid zipPath argument";
      return;
    }

    const root = getLibraryRoot();
    const temp = join(tmpdir(), `libimp_${Date.now()}`);

    await unzipCrossPlatform(zip, temp);

    // Copy folders if present
    copyDirIfExists(join(temp, "shapes"), join(root, "shapes"));
    copyDirIfExists(join(temp, "assets"), join(root, "assets"));
    copyDirIfExists(join(temp, "native"), join(root, "native"));
    if (existsSync(join(temp, "library_deck.pptx"))) {
      copyFileSync(join(temp, "library_deck.pptx"), join(root, "library_deck.pptx"));
    }

    toast.style = Toast.Style.Success;
    toast.title = "Library imported";
    toast.message = root;
    try {
      await Clipboard.copy(root);
    } catch {}
    try {
      await showInFinder(root);
    } catch {}
  } catch (err) {
    toast.style = Toast.Style.Failure;
    toast.title = "Import failed";
    toast.message = err instanceof Error ? err.message : "Unknown error";
  }
}

function copyDirIfExists(src: string, dest: string) {
  if (!existsSync(src)) return;
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    const s = join(src, name);
    const d = join(dest, name);
    if (statSync(s).isDirectory()) {
      copyDirIfExists(s, d);
    } else {
      // ensure parent exists
      mkdirSync(join(d, ".."), { recursive: true });
      copyFileSync(s, d);
    }
  }
}

async function unzipCrossPlatform(zipPath: string, destDir: string): Promise<void> {
  if (process.platform === "win32") {
    // Phase 4: assets/ps/unzip.ps1 creates $destDir if missing then runs
    // Expand-Archive. No OK sentinel -- runner maps non-zero exit to an
    // `exit-nonzero` failure, and we re-throw its message.
    const result = await runPowerShellFile(resolvePsScript("unzip"), { ZipPath: zipPath, DestDir: destDir });
    if (result.ok === false) throw new Error(result.message);
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const unzip = spawn("unzip", ["-o", zipPath, "-d", destDir], { stdio: "ignore" });
    unzip.on("error", (e) => reject(e));
    unzip.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`unzip failed (${code})`))));
  });
}
