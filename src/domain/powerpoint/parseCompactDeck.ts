/**
 * Phase 15 — pure parser for the `compact-deck.ps1` protocol.
 *
 * The PowerShell script emits one of:
 *   OK:<slideCount>|<bytes>
 *   ERROR:<message>
 * ...possibly preceded by `Write-Host` breadcrumbs. The parser scans
 * for an ERROR line first (errors take priority over spurious OK
 * noise), then the OK line.
 *
 * Why a pure module: the adapter (WindowsComPowerPointClient) cannot
 * be tested without a live PowerPoint COM server, but the
 * stdout-to-result mapping is a deterministic string transform we
 * MUST pin with contract tests. Same rationale as Phase 11's
 * `parseExtraction.ts` and Phase 12's `parseZipInspection.ts`.
 */

/** Shape of a successful compact-deck stdout parse. */
export interface CompactDeckSuccess {
  ok: true;
  slideCount: number;
  bytes: number;
}

/** Shape of a failed compact-deck parse, with the reason and message. */
export interface CompactDeckFailure {
  ok: false;
  reason: "error-line" | "no-ok-line" | "malformed-ok-line";
  message: string;
}

export type CompactDeckResult = CompactDeckSuccess | CompactDeckFailure;

/**
 * Parse raw `compact-deck.ps1` stdout. Tolerant to CRLF and to extra
 * lines before/after the OK sentinel (Write-Host breadcrumbs).
 */
export function parseCompactDeckStdout(stdout: string): CompactDeckResult {
  const lines = stdout.split(/\r?\n/);
  const error = lines.find((l) => l.trim().startsWith("ERROR:"));
  if (error) {
    return {
      ok: false,
      reason: "error-line",
      message: error.trim().replace(/^ERROR:\s*/, ""),
    };
  }
  const ok = lines.find((l) => l.trim().startsWith("OK:"));
  if (!ok) {
    return {
      ok: false,
      reason: "no-ok-line",
      message: "No OK sentinel in compact-deck output",
    };
  }
  const match = /^OK:(\d+)\|(\d+)\s*$/.exec(ok.trim());
  if (!match) {
    return {
      ok: false,
      reason: "malformed-ok-line",
      message: `Unparseable OK line: ${ok.trim()}`,
    };
  }
  const slideCount = parseInt(match[1], 10);
  const bytes = parseInt(match[2], 10);
  if (!Number.isFinite(slideCount) || !Number.isFinite(bytes)) {
    return {
      ok: false,
      reason: "malformed-ok-line",
      message: `Non-numeric OK values: ${ok.trim()}`,
    };
  }
  return { ok: true, slideCount, bytes };
}
