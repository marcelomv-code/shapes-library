import { showToast, Toast, showInFinder, Clipboard } from "@raycast/api";
import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";
import { tmpdir } from "os";
import { getLibraryRoot } from "./utils/paths";

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
    const script = `
$ErrorActionPreference = "Stop"
$s='${zipPath.replace(/'/g, "''")}'
$d='${destDir.replace(/'/g, "''")}'
if (-not (Test-Path $d)) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
Expand-Archive -LiteralPath $s -DestinationPath $d -Force
`;
    await runPs(script);
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const unzip = spawn("unzip", ["-o", zipPath, "-d", destDir], { stdio: "ignore" });
    unzip.on("error", (e) => reject(e));
    unzip.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`unzip failed (${code})`))));
  });
}

function runPs(script: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tmp = join(tmpdir(), `import_${Date.now()}.ps1`);
    try {
      require("fs").writeFileSync(tmp, script, "utf-8");
    } catch (e) {
      return reject(e as Error);
    }
    const ps = spawn("powershell", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", tmp]);
    ps.on("error", (e) => done(e));
    ps.on("close", (code) => done(code === 0 ? null : new Error(`PowerShell failed (${code})`)));
    function done(err: Error | null) {
      try {
        require("fs").unlinkSync(tmp);
      } catch {}
      if (err) reject(err);
      else resolve();
    }
  });
}
