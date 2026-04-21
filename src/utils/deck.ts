import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { getLibraryRoot } from "./paths";
import { getPreferenceValues } from "@raycast/api";
import { runPowerShellFile, resolvePsScript, PSResult } from "../infra/powershell";

export function getDeckPath(): string {
  const root = getLibraryRoot();
  return join(root, "library_deck.pptx");
}

/**
 * Delete the existing library deck (useful when theme needs to be updated)
 */
export function deleteDeck(): void {
  const deck = getDeckPath();
  if (existsSync(deck)) {
    try {
      require("fs").unlinkSync(deck);
    } catch {}
  }
}

export async function ensureDeck(): Promise<string> {
  const deck = getDeckPath();
  const dir = join(deck, "..");
  if (!existsSync(dir)) {
    try {
      mkdirSync(dir, { recursive: true });
    } catch {}
  }
  if (existsSync(deck)) return deck;

  // Get template path from preferences
  const prefs = getPreferenceValues<{ templatePath?: string }>();
  const templatePath = prefs.templatePath?.trim() || "";

  // Phase 4: assets/ps/ensure-deck.ps1 creates the deck from a template
  // (if supplied) or a blank Office-theme presentation.
  const result = await runPowerShellFile(resolvePsScript("ensure-deck"), {
    DeckPath: deck,
    TemplatePath: templatePath,
  });
  throwIfFailed(result);
  return deck;
}

export async function addShapeToDeckFromPptx(sourcePptx: string): Promise<number> {
  const deck = await ensureDeck();
  // Phase 4: assets/ps/add-shape-to-deck.ps1 pastes slide-1 shapes of
  // $SrcPptx as the next slide of the deck and echoes "OK:<idx>".
  const result = await runPowerShellFile(resolvePsScript("add-shape-to-deck"), {
    DeckPath: deck,
    SrcPptx: sourcePptx,
  });
  throwIfFailed(result);
  const m = /^OK:(\d+)/m.exec(result.stdout.trim());
  if (!m) throw new Error(`Failed to add to deck: ${result.stdout}`);
  return parseInt(m[1], 10);
}

export async function copyFromDeckToClipboard(slideIndex: number): Promise<void> {
  const deck = await ensureDeck();
  // Phase 4: assets/ps/copy-from-deck.ps1 mirrors the old inline copy
  // script (placeholder/copyright filters + clipboard copy).
  const result = await runPowerShellFile(resolvePsScript("copy-from-deck"), {
    DeckPath: deck,
    SlideIndex: slideIndex,
  });
  throwIfFailed(result);
}

export async function insertFromDeckIntoActive(slideIndex: number): Promise<void> {
  const deck = await ensureDeck();
  // Phase 4: assets/ps/insert-from-deck.ps1 requires an open active
  // presentation; the "No presentation is open" guard is still surfaced as
  // a protocol-error through the runner.
  const result = await runPowerShellFile(resolvePsScript("insert-from-deck"), {
    DeckPath: deck,
    SlideIndex: slideIndex,
  });
  throwIfFailed(result);
}

/**
 * Bridge the runner's discriminated-union result onto the `throw`-based
 * API this module has exposed since Phase 0. Kept as a small helper rather
 * than inlined so future cleanup (e.g. returning the full PSResult to
 * callers and letting them render a toast directly) has one place to
 * change.
 */
function throwIfFailed(result: PSResult): asserts result is Extract<PSResult, { ok: true }> {
  if (result.ok === false) {
    throw new Error(result.message);
  }
}
