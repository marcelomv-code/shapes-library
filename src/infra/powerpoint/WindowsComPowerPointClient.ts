/**
 * Windows PowerPoint adapter -- drives PowerPoint via COM automation
 * through the hardened PowerShell runner (Phases 3 and 4).
 *
 * Phase 5 folded the former `src/extractor/windowsExtractor.ts` and
 * `src/utils/deck.ts` into this single adapter. The COM/PS plumbing
 * (kill-timer, stdout buffering, STEP* line breadcrumbs) is untouched --
 * only the API shape changed to match the `PowerPointClient` port.
 */

import { existsSync, mkdirSync, renameSync, copyFileSync, unlinkSync } from "fs";
import { join } from "path";
import { getPreferenceValues } from "@raycast/api";
import { getNativeDir, getLibraryRoot } from "../../utils/paths";
import { runPowerShellFile, resolvePsScript, PSResult } from "../powershell";
import type { PowerPointClient } from "../../domain/powerpoint/PowerPointClient";
import type { ExtractedShape, ExtractionResult } from "../../domain/powerpoint/types";
import { parseCompactDeckStdout } from "../../domain/powerpoint/parseCompactDeck";
import { buildTempName, cleanupTemp } from "../temp";
import { createLogger } from "../logger";

const log = createLogger("PowerShell");

/**
 * Canonical library deck filename. Centralised here so both the factory
 * and any external consumer (e.g. `getDeckPath()` helper) agree.
 */
export const DECK_FILENAME = "library_deck.pptx";

export class WindowsComPowerPointClient implements PowerPointClient {
  async captureSelectedShape(): Promise<ExtractionResult> {
    const prefs = getPreferenceValues<{ skipNativeSave?: boolean; templatePath?: string }>();
    const supportPath = getLibraryRoot();
    const nativeDir = getNativeDir();
    try {
      if (!existsSync(nativeDir)) mkdirSync(nativeDir, { recursive: true });
    } catch {
      /* mkdir race -- another process created it; safe to ignore */
    }
    const ts = Date.now();
    const relNative = `native/shape_captured_${ts}.pptx`;
    const absNative = join(supportPath, "native", `shape_captured_${ts}.pptx`);
    const templatePath = prefs.templatePath?.trim() || "";

    // Phase 4 rationale preserved: 60s cap matches the Phase 3 runner
    // default and handles cold PowerPoint COM round-trips (~20s worst
    // observed). The streaming 30s->45s->60s ramp was retired when we
    // switched from piped stdout to buffered output.
    const result = await runPowerShellFile(
      resolvePsScript("extract-selected-shape"),
      { DestPath: absNative, TemplatePath: templatePath, RelNative: relNative },
      { timeoutMs: 60_000 }
    );

    const stdout = result.stdout;
    const stderr = result.stderr;

    // Preserve the UI log panel: replay stdout/stderr through the same
    // line-by-line breadcrumbs the streaming loop used to emit.
    const logs: string[] = [];
    for (const line of stdout.split(/\r?\n/)) {
      const l = line.trim();
      if (l.length > 0) {
        log.info("STDOUT:", l);
        logs.push(l);
      }
    }
    for (const line of stderr.split(/\r?\n/)) {
      const l = line.trim();
      if (l.length > 0) {
        log.error("STDERR:", l);
        logs.push(`[stderr] ${l}`);
      }
    }

    if (result.ok === false) {
      if (result.reason === "protocol-error") {
        return { success: false, error: result.message, logs, stdout, stderr };
      }
      // Preserve the legacy "look for ERROR: line in stdout first"
      // heuristic for the exit-nonzero / timeout / spawn-failed paths.
      const errLine = stdout
        .trim()
        .split("\n")
        .find((l) => l.trim().startsWith("ERROR:"));
      if (errLine) {
        return { success: false, error: errLine.trim().replace(/^ERROR:/, ""), logs, stdout, stderr };
      }
      return {
        success: false,
        error: `PowerShell failed (${result.code ?? "n/a"}). ${stderr || stdout || result.message}`,
        logs,
        stdout,
        stderr,
      };
    }

    const output = stdout.trim();
    const jsonLine = output.split("\n").find((l) => l.trim().startsWith("{"));
    if (!jsonLine) {
      log.error("No JSON found. Full output:", output);
      return { success: false, error: "No JSON data in PowerShell output", logs, stdout, stderr };
    }

    try {
      const data = JSON.parse(jsonLine);
      const shape: ExtractedShape = {
        name: data.name || "Unnamed",
        type: data.type || 1,
        autoShapeName: data.autoShapeName,
        position: { x: data.left || 1, y: data.top || 1 },
        size: { width: data.width || 2, height: data.height || 2 },
        rotation: typeof data.rotation === "number" ? data.rotation : 0,
        adjustments: Array.isArray(data.adjustments) ? data.adjustments : undefined,
        nativePptxRelPath: typeof data.nativePptxRelPath === "string" ? data.nativePptxRelPath : undefined,
        isGroup: data.isGroup === true,
        isPicture: data.isPicture === true,
        pngTempPath: typeof data.pngTempPath === "string" ? data.pngTempPath : undefined,
        fill: {
          color: data.fillColor,
          transparency: data.fillTransparency,
        },
        line: {
          color: data.lineColor,
          weight: typeof data.lineWeight === "number" ? data.lineWeight : 1,
          transparency: data.lineTransparency,
        },
      };
      return { success: true, shape, logs, stdout, stderr };
    } catch (e) {
      return { success: false, error: `Failed to parse JSON: ${e}`, logs, stdout, stderr };
    }
  }

  async copyShapeToClipboard(pptxPath: string): Promise<void> {
    // Delegates to assets/ps/copy-via-powerpoint.ps1. The runner surfaces
    // the "ERROR:" protocol-error message in result.message so the legacy
    // error text (e.g. "No active PowerPoint window") flows through
    // unchanged to the fallback branch in shape-picker.
    const result = await runPowerShellFile(resolvePsScript("copy-via-powerpoint"), { PptxPath: pptxPath });
    throwIfFailed(result);
  }

  async copyDeckSlideToClipboard(deckPath: string, slideIndex: number): Promise<void> {
    // Phase 4 extracted this flow into copy-from-deck.ps1 (placeholder /
    // copyright filters + clipboard copy). The deck must already exist
    // at deckPath; the port contract makes createDeck() the caller's
    // responsibility before this call.
    const result = await runPowerShellFile(resolvePsScript("copy-from-deck"), {
      DeckPath: deckPath,
      SlideIndex: slideIndex,
    });
    throwIfFailed(result);
  }

  async insertSlide(deckPath: string, slideIndex: number): Promise<void> {
    // insert-from-deck.ps1 requires an open active presentation; its
    // "No presentation is open" guard still surfaces as protocol-error
    // through the runner.
    const result = await runPowerShellFile(resolvePsScript("insert-from-deck"), {
      DeckPath: deckPath,
      SlideIndex: slideIndex,
    });
    throwIfFailed(result);
  }

  async addSlideFromPptx(deckPath: string, sourcePath: string): Promise<number> {
    const result = await runPowerShellFile(resolvePsScript("add-shape-to-deck"), {
      DeckPath: deckPath,
      SrcPptx: sourcePath,
    });
    throwIfFailed(result);
    const m = /^OK:(\d+)/m.exec(result.stdout.trim());
    if (!m) throw new Error(`Failed to add to deck: ${result.stdout}`);
    return parseInt(m[1], 10);
  }

  async createDeck(templatePath?: string): Promise<string> {
    const deck = deckPathFromLibraryRoot();
    const dir = join(deck, "..");
    if (!existsSync(dir)) {
      try {
        mkdirSync(dir, { recursive: true });
      } catch {
        /* dir race */
      }
    }
    if (existsSync(deck)) return deck;

    // Fallback preference read here rather than in the caller preserves
    // the pre-Phase-5 behaviour where `ensureDeck()` grabbed templatePath
    // itself. The port signature accepts an explicit override so tests
    // and mocks don't need Raycast preferences mocked.
    const resolvedTemplate =
      typeof templatePath === "string" && templatePath.trim().length > 0
        ? templatePath.trim()
        : (getPreferenceValues<{ templatePath?: string }>().templatePath?.trim() ?? "");

    const result = await runPowerShellFile(resolvePsScript("ensure-deck"), {
      DeckPath: deck,
      TemplatePath: resolvedTemplate,
    });
    throwIfFailed(result);
    return deck;
  }

  async compactDeck(deckPath: string): Promise<{ slideCount: number; bytes: number }> {
    if (!existsSync(deckPath)) {
      throw new Error(`Deck not found: ${deckPath}`);
    }
    // Phase 15: PowerPoint SaveAs a temp path, then atomically move the
    // temp over the original. The PS script does not overwrite the deck
    // in place because COM's SaveAs against the currently-open path is
    // unreliable on some Windows builds.
    const tempDeck = buildTempName("compact-deck", "pptx");
    try {
      const psResult = await runPowerShellFile(resolvePsScript("compact-deck"), {
        DeckPath: deckPath,
        TempPath: tempDeck,
      });
      throwIfFailed(psResult);
      const parsed = parseCompactDeckStdout(psResult.stdout);
      if (parsed.ok === false) {
        throw new Error(`compact-deck parser: ${parsed.message}`);
      }
      // Windows' `renameSync` fails cross-volume; fall back to copy+unlink
      // when the temp dir and library root live on different drives.
      try {
        renameSync(tempDeck, deckPath);
      } catch {
        copyFileSync(tempDeck, deckPath);
        try {
          unlinkSync(tempDeck);
        } catch {
          /* leave the copy for the cleanup pass below */
        }
      }
      return { slideCount: parsed.slideCount, bytes: parsed.bytes };
    } finally {
      cleanupTemp(tempDeck);
    }
  }
}

/**
 * Canonical deck path resolver. Kept at module scope (not a method) so
 * that both the factory (to expose `getDeckPath()`) and the
 * `createDeck()` implementation share exactly one source of truth.
 */
export function deckPathFromLibraryRoot(): string {
  return join(getLibraryRoot(), DECK_FILENAME);
}

/**
 * Bridge the runner's discriminated-union result onto the `throw`-based
 * API this adapter exposes. Lifted verbatim from the Phase 4 deck.ts
 * helper -- kept as a small helper rather than inlined so future cleanup
 * (e.g. returning the full PSResult to callers and letting them render a
 * toast directly) has one place to change.
 */
function throwIfFailed(result: PSResult): asserts result is Extract<PSResult, { ok: true }> {
  if (result.ok === false) {
    throw new Error(result.message);
  }
}
