# Security Posture

> Scope: end-user extension that reads/writes PowerPoint files locally and
> shells out to PowerShell on Windows. No network egress at runtime.

This document reflects the state of the `refactor/hardening` branch
through Phase 15 (tempManager + compactDeck). Each section pins a
defense to the Phase that introduced it so future contributors can
retrace the rationale without digging through commit history.

## Threat model

The extension handles three classes of input that cross a trust
boundary into the user's machine:

1. **PowerPoint files** the user chooses to capture or insert. Trusted
   by the user's intent; untrusted by content (may embed macros, OLE
   objects, external links — all handled by PowerPoint itself, not by
   this extension).
2. **Library ZIP exports** imported from other users. Fully untrusted.
   The attack surface is extraction — zip-slip and zip-bomb payloads
   must not be able to write outside the library root or exhaust disk.
3. **PowerShell script arguments** passed from TypeScript to the runner.
   Even though the scripts ship with the extension, user input (file
   paths, preferences) flows into them as `-Key value` pairs and must
   not allow command injection.

Secrets (Raycast token, user email) never enter log output.

## Defenses

### 1. Library ZIP import — zip-slip + zip-bomb guards (Phase 12)

Every ZIP goes through `src/domain/zip/zipSafety.ts::assertZipEntries`
**before** any extraction tool runs. The validator rejects entries
with:

- empty names
- null-byte characters
- POSIX absolute paths (`/etc/...`)
- Windows drive-letter absolutes (`C:\...`)
- UNC paths (`\\host\share`, normalized to `//host/share` then refused)
- any `..` path component, at any depth, evaluated against the canonical
  forward-slash form so a backslash-disguised escape (`shapes\..\..\evil`)
  is rejected as `parent-escape`

Backslash separators are accepted (Windows `Compress-Archive` and Explorer's
"Send to ZIP" both write them in violation of the ZIP spec), but only after
normalization to `/`. Every check above runs on the canonical form.

Limits enforced via `DEFAULT_ZIP_LIMITS` (`src/domain/zip/zipSafety.ts`):

| Limit           | Default | Rationale                         |
| --------------- | ------- | --------------------------------- |
| `maxTotalBytes` | 500 MiB | Stops 10-GiB zipbomb class        |
| `maxEntries`    | 10 000  | Prevents inode exhaustion         |
| `maxEntryBytes` | 200 MiB | Per-file cap on decompressed size |

Entry listing uses `[System.IO.Compression.ZipFile]::OpenRead` on
Windows (no extraction) via `assets/ps/inspect-zip.ps1`, and `unzip -l`
elsewhere. The sole import entry point
(`src/features/shape-picker/libraryZip.ts::importLibraryZip`, invoked
by `ImportLibraryForm` from the shape-picker) funnels through
`assertZipIsSafe` before `Expand-Archive` / `unzip -o`.

### 2. PowerShell runner — injection resistance (Phases 3, 4)

All PS invocations go through `src/infra/powershell/runner.ts`. Scripts
live in `assets/ps/*.ps1` (UTF-8 BOM); arguments are passed as
separate `-Key value` tokens after `-File <path>`, never concatenated
into a command string. The runner:

- writes the script to a fresh temp file (`runPowerShellScript`) or
  resolves a bundled file (`runPowerShellFile`), never eval'd inline.
- sets `-InputFormat None` so PS does not read stdin.
- caps stdout/stderr by byte count (not character count) to avoid
  mid-codepoint truncation.
- enforces a 60s default timeout with a kill-timer and AbortSignal.
- tolerates `$null`, empty strings, and NUL characters in arguments
  via `psSingleQuote` / `psPath` helpers (`src/infra/powershell/escape.ts`).

Every script opens with `$ErrorActionPreference = "Stop"` and wraps in
`try { ... } catch { "ERROR:$($_.Exception.Message)"; exit 1 }` so
failures surface as protocol errors rather than silent partial runs.

### 3. Temp file lifecycle — tracked cleanup (Phase 15)

Pre-Phase-15 the library leaked at least one temp directory per import
and one pptx per failed insert. `src/infra/temp/tempManager.ts` now
centralises all temp paths:

- Unique filenames via `buildTempName(prefix, ext)` — sanitised prefix,
  monotonic per-millisecond counter.
- Tracking Set so `cleanupAllTemps` can drain leftovers on teardown.
- Cleanup is tolerant of missing files (race) and recursive for
  directories.
- Scheduled cleanup runs via an injectable timer, so tests do not
  wait on real `setTimeout`.

Migrated call sites: `src/generator/pptxGenerator.ts` (shape pptx
generation + autoCleanup schedule) and `src/import-library.tsx`
(zip-extraction staging directory — wrapped in `try/finally` to
guarantee cleanup even on mid-copy failures).

### 4. PII-safe logging (Phase 14)

`src/infra/logger/redact.ts` runs every logged argument through seven
ordered rules before a sink call:

1. Windows home (`C:\Users\m.vieira\...`) → `C:\Users\<REDACTED>\...`
2. Windows home with forward slashes (`C:/Users/...`) → same.
3. macOS home (`/Users/m.vieira/...`) → `/Users/<REDACTED>/...`
4. Linux home (`/home/mvieira/...`) → `/home/<REDACTED>/...`
5. OneDrive org segment (`OneDrive - Accenture`) → `OneDrive - <REDACTED>`
6. Email local-part (preserves the domain for ops triage).
7. Long alphanumeric token (32+ chars) — catches tokens the earlier
   rules miss.

Rule ordering matters: `windows-home` precedes `long-token` so the
username segment is replaced before the catch-all token regex can
match. Replacements are idempotent — running redaction twice yields
the same output.

Callers use `createLogger(scope)` from `src/infra/logger`; every
argument flows through `redactArgs` on the way to the sink. Tests
substitute the sink via `setLogSink` / `resetLogSink`.

### 5. Strict TypeScript (Phase 7)

`tsconfig.strict: true` and `noImplicitAny: true`. 13 `any` usages
removed across the extension. Strict nullability catches missing
`pptxDefinition` and missing preference values at compile time; the
guards in `pptxGenerator.ts::generateShapePptx` and
`WindowsComPowerPointClient` rely on this.

### 6. CI gates (Phase 13)

`.github/workflows/ci.yml` runs on every push to `refactor/hardening`
and every PR to `main`. Required gates:

- `prettier --check`
- `tsc --noEmit`
- `npm test` (vitest + v8 coverage; 30% baseline thresholds enforced)

Advisory gates annotate PRs without blocking delivery:

- `eslint` — sits at a 40-error pre-existing baseline; future cleanup
  is a dedicated phase.
- `ray build` — Ubuntu behavior of the Raycast Store packager has not
  been validated.

`npm audit --audit-level=moderate` runs in a separate advisory job.

Husky pre-commit (`./.husky/pre-commit`) formats staged files via
`lint-staged` and runs `tsc --noEmit` — kept short so the hook does
not erode developer trust.

## Known unresolved gaps

- **ESLint baseline (40 errors)** — `no-empty`, `no-case-declarations`,
  `no-useless-escape` across pre-hardening files. Not a Phase 7 or 15
  regression; the CI advisory step surfaces them as `::warning::` for
  opportunistic cleanup.
- **macOS coverage of deck flows** — `MacPowerPointClient` throws on
  `copyDeckSlideToClipboard`, `insertSlide`, `addSlideFromPptx`,
  `createDeck`, `compactDeck`. Feature parity with Windows requires
  AppleScript equivalents that have not been written.
- **Native PPTX trust** — a malicious `shape_captured_*.pptx` inside a
  library ZIP cannot escape the library root (Phase 12 guard), but its
  content is still opened by PowerPoint at paste time. Macro and
  external-link risks live with PowerPoint's own trust-center settings.

## Reporting a vulnerability

Open a private GitHub security advisory on this repository. Do not
file a public issue.
