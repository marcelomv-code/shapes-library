# Refactor/Hardening Progress

Sequenced rollout of the shapes-library hardening plan. One phase per Cowork session.

## State

- **Branch:** `refactor/hardening` (from `main`)
- **Current phase:** Phase 3 complete
- **Next phase:** Phase 4 — PS scripts (extract inline PS to `scripts/ps/*.ps1` and migrate call sites to `@/infra/powershell`)
- **Last updated:** 2026-04-20

## Baseline findings (Phase 0)

Captured in `.audit/` without modifying any source file.

| Artifact | File | Summary |
|---|---|---|
| npm ci | `baseline-npm-ci.txt` | Blocked by OneDrive file lock on `node_modules/.package-lock.json`. Existing install used for downstream checks. |
| TypeScript | `baseline-tsc.txt` | `tsc --noEmit` exits 2. ~350 lines of diagnostics. Errors stem from React/JSX typing mismatch (ReactNode incompatibility). |
| ESLint | `baseline-lint.txt` | **110 errors.** No warnings. Dominant rules: `no-empty`, `@typescript-eslint/no-explicit-any`, `@typescript-eslint/no-unused-vars`, `no-var-requires`. |
| npm audit | `baseline-audit.json` | **6 high** vulnerabilities. 0 critical. 402 total deps (100 prod, 277 dev). |
| LOC inventory | `baseline-loc.csv` | 20 TS/TSX files in `src/`. God-component confirmed: `shape-picker.tsx` = 839 LOC. |

## Top files by LOC (targets for Phase 6 split)

```
src/shape-picker.tsx                839
src/extractor/windowsExtractor.ts   367
src/utils/shapeMapper.ts            337
src/manage-categories.tsx           292
src/extractor/windowsExtractorV2.ts 286   <- DELETE in Phase 1
src/generator/pptxGenerator.ts      284
src/utils/shapeSaver.ts             279
src/capture-shape.tsx               274
src/extractor/windowsExtractorV3.ts 215   <- DELETE in Phase 1
```

## Known environment constraints

1. **OneDrive file locking** prevents `npm ci` and full `git` lock cleanup from the Linux sandbox. Workarounds:
   - Keep existing `node_modules` tree; avoid `npm ci` / `npm install` inside the sandbox.
   - If a phase requires fresh install, run `npm ci` from the host PowerShell, then resume Cowork.
2. **Network egress** from sandbox is limited (observed `EAI_AGAIN www.raycast.com` during `npm run lint`). Schema validation of `package.json` is expected to fail offline; ignore those specific errors when comparing pre/post diffs.
3. Path for host edits: `C:\Users\m.vieira\OneDrive - Accenture\Desenvolvimentos\Shapes-libreary-v3\shapes-library`
4. Path for sandbox bash: `/sessions/peaceful-dazzling-clarke/mnt/Shapes-libreary-v3/shapes-library`

## Phase log

| Phase | Status | Commit | Notes |
|---|---|---|---|
| 0 — Baseline | DONE | (no code change) | Branch `refactor/hardening` created. `.audit/` populated. |
| 1 — Dead code | DONE | (see commit below) | Deleted V2/V3 extractors (501 LOC). Removed 20 unused imports + dead `getAssetsDir`/`handleRepairPreviews`. Lint 110→89 errors (-21). tsc 351→350 lines (unchanged JSX-typing baseline). "Log string" fix: no malformed logs found in live code; item was resolved by V2/V3 deletion (30 redundant console calls removed with them). |
| 2 — Categories | DONE | (see commit below) | Aligned display names to IDs in `src/utils/categoryManager.ts` (arrows→"Arrows", flowchart→"Flowchart", callouts→"Callouts"; basic→"Basic Shapes" kept). Synced seed `assets/categories.json`. tsc 70 errors (=phase1), lint 89 errors (=phase1). No regressions. |
| 3 — PS hardening | DONE | (see commits below) | Scaffolded `src/infra/powershell/`: `types.ts` (PSResult union with `droppedBytes`, PSRunOptions, PSFailureReason), `escape.ts` (psSingleQuote NUL-safe, psPath, encodePSCommand for -EncodedCommand), `runner.ts` (runPowerShellScript: UTF-8 BOM on temp .ps1 so PS 5.1 reads non-ASCII correctly; byte-accurate output caps via Buffer[] to avoid mid-codepoint truncation; 60s timeout; AbortSignal; `-InputFormat None`; validates non-empty script; collision-proof temp name), `index.ts` barrel. Zero call-site migration — Phase 4 flips 8 spawn("powershell", …) invocations across 7 files: extractor/windowsExtractor.ts, generator/pptxGenerator.ts, import-library.tsx, shape-picker.tsx (x3), utils/deck.ts, utils/previewGenerator.ts. Bundled hotfix: removed stray `}` left in `src/utils/categoryManager.ts` by the Phase 2 commit. tsc 70 errors (=phase2), lint 89 errors (=phase2). No regressions. |
| 4 — PS scripts | PENDING | — | Extract inline PS to `scripts/ps/*.ps1`. |
| 5 — Ports/Adapters | PENDING | — | `PowerPointClient` interface + adapters. |
| 6 — Split picker | PENDING | — | 840-line god component. |
| 7 — TS strict | PENDING | — | Enable strict, remove `any`. |
| 8 — ESM imports | PENDING | — | Replace `require("fs")`. |
| 9 — Memoization | PENDING | — | Category + library-root caches. |
| 10 — TDD base | PENDING | — | vitest + 80% thresholds. |
| 11 — Contract tests | PENDING | — | Extractor parsing fixtures. |
| 12 — Zip security | PENDING | — | Zip Slip + zipbomb guards. |
| 13 — CI/CD | PENDING | — | Workflows, CODEOWNERS, husky. |
| 14 — Logging | PENDING | — | PII-safe logger. |
| 15 — Temp/deck | PENDING | — | tempManager + compactDeck. |
| 16 — Docs | PENDING | — | README security/architecture. |
| 17 — Local build | MANUAL | — | Run on host PS. |
| 18 — ray develop | MANUAL | — | Host. |
| 19 — Acceptance | MANUAL | — | 12 scenarios. |
| 20 — Publish | OPTIONAL | — | Store release. |

## How to resume

Open a new Cowork session and say:
> Retome o plano shapes-library a partir da Fase N. O estado atual está em `.audit/progress.md` dentro do projeto.

Cowork will re-mount the folder, read this file, and continue.
