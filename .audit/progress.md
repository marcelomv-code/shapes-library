# Refactor/Hardening Progress

Sequenced rollout of the shapes-library hardening plan. One phase per Cowork session.

## State

- **Branch:** `refactor/hardening` (from `main`)
- **Current phase:** Phase 13 (CI/CD, CODEOWNERS, husky) code complete on disk. GitHub Actions workflow at `.github/workflows/ci.yml` runs on push to `main`/`refactor/hardening` and every PR to `main`, with concurrency cancellation, least-privilege `contents: read`, Node 22 (matching `engines.node`), npm cache keyed on the lockfile. Required gates: `prettier --check`, `tsc --noEmit`, `npm test` (vitest + v8 coverage; the 80% thresholds are enforced by vitest itself). Advisory gates (`continue-on-error: true` with `::warning::` annotation): `eslint` (40-error pre-existing baseline that earlier phases chose not to touch) and `ray build` (Raycast Store packager, primary runtime is developer machines — Ubuntu support is best-effort). Separate `security` job runs `npm audit --audit-level=moderate` advisory-only. Coverage reports uploaded as an artifact (14-day retention). `.github/CODEOWNERS` assigns everything to `@marcelomatosvieira` today but keeps dedicated rules for security-sensitive areas (`assets/ps/`, `src/infra/powershell/`, `src/domain/zip/`, `src/infra/zip/`, CI config, `package.json`, `tsconfig.json`, `vitest.config.ts`) so a future second contributor only has to edit one line. `.husky/pre-commit` delegates to `lint-staged` (prettier --write on staged `.ts/.tsx/.json/.md/.yml`) then runs a full `tsc --noEmit` — kept lean so the hook does not erode developer trust. Added `husky` + `lint-staged` to `devDependencies`, `lint-staged` config block in package.json, `format` + `format:check` + `prepare` scripts. **Sandbox tsc: 0 errors under strict.** `husky`/`lint-staged` install pending host `npm install` (same cycle Phase 10 already scheduled). Phase 12 prior summary: Two pure domain modules (`src/domain/zip/zipSafety.ts`, `src/domain/zip/parseZipInspection.ts`) validate every ZIP entry before extraction. A PowerShell adapter (`assets/ps/inspect-zip.ps1` + `src/infra/zip/inspectZip.ts`) reads archive listings without extracting via `[System.IO.Compression.ZipFile]::OpenRead`; the POSIX branch shells out to `unzip -l`. Guards wired into both import entry points (`src/import-library.tsx` and `src/features/shape-picker/libraryZip.ts::importLibraryZip`) BEFORE any `Expand-Archive`/`unzip -o` call. 9 realistic fixtures + 2 contract suites cover every validator reason (`empty`/`null-byte`/`backslash`/`absolute-posix`/`absolute-windows`/`drive-letter`/`parent-escape`) and every parser branch (`error-line`/`missing-terminator`/`count-mismatch`/`malformed`, CRLF tolerance, zip-slip path preservation, 10 GiB zipbomb detection). `vitest.config.ts` coverage-include extended to the two new pure modules. Phase 11 prior summary: Extracted the JSON/ERROR parsing logic out of `WindowsComPowerPointClient.captureSelectedShape` into a pure `src/domain/powerpoint/parseExtraction.ts` module with a discriminated-union result. 11 fixture captures under `tests/fixtures/extractor/`. Two contract suites: `tests/domain/powerpoint/parseExtraction.test.ts` (22 tests) + `tests/utils/shapeMapper.test.ts` (27 tests). **Sandbox run (Phase 11):** 7/7 files, 118/118 tests green. Coverage 98.34% stmts/93.47% branches/100% funcs — all thresholds satisfied. Five staged commits from prior sessions still pending on host: Phase 7 (strict TS), Phase 9 (memoization), Phase 10 (vitest), Phase 11 (contract tests), Phase 12 (zip security) — plus the Phase 13 bundle below. Phase 8 folded into the Phase 7 commit as a no-op. Two pure domain modules (`src/domain/zip/zipSafety.ts`, `src/domain/zip/parseZipInspection.ts`) validate every ZIP entry before extraction. A PowerShell adapter (`assets/ps/inspect-zip.ps1` + `src/infra/zip/inspectZip.ts`) reads archive listings without extracting via `[System.IO.Compression.ZipFile]::OpenRead`; the POSIX branch shells out to `unzip -l`. Guards wired into both import entry points (`src/import-library.tsx` and `src/features/shape-picker/libraryZip.ts::importLibraryZip`) BEFORE any `Expand-Archive`/`unzip -o` call. 9 realistic fixtures + 2 contract suites cover every validator reason (`empty`/`null-byte`/`backslash`/`absolute-posix`/`absolute-windows`/`drive-letter`/`parent-escape`) and every parser branch (`error-line`/`missing-terminator`/`count-mismatch`/`malformed`, CRLF tolerance, zip-slip path preservation, 10 GiB zipbomb detection). `vitest.config.ts` coverage-include extended to the two new pure modules. **Sandbox tsc:** 0 errors under strict. **Sandbox test run:** blocked by the same host-resolution issue documented in Phase 10 (linux-x64-gnu rollup/esbuild natives not in the Windows-generated lockfile) — will run clean after the host `npm install` that Phase 10 already scheduled. Phase 11 prior summary: Extracted the JSON/ERROR parsing logic out of `WindowsComPowerPointClient.captureSelectedShape` into a pure `src/domain/powerpoint/parseExtraction.ts` module with a discriminated-union result (`ok:true | {reason:"error-line"|"no-json"|"invalid-json"}`). 11 fixture captures (realistic PS stdout with STEP breadcrumbs) under `tests/fixtures/extractor/`. Two contract suites: `tests/domain/powerpoint/parseExtraction.test.ts` (22 tests) pinning parser behaviour on each fixture branch + ERROR-wins-over-JSON priority + mapExtractionData defaults; `tests/utils/shapeMapper.test.ts` (27 tests) pinning category routing, native-only paths, chooseType precedence, pptx wiring, id/tag generation, and supported-type helpers. `vitest.config.ts` coverage include extended to the two new pure modules. **Sandbox run:** 7/7 files, 118/118 tests green in 1.86s. Coverage over the expanded include set: 98.34% stmts, 93.47% branches, 100% funcs, 98.34% lines — all four thresholds satisfied (parseExtraction 100/100/100/100; shapeMapper 100/93.65/100/100). Four staged commits from prior sessions still pending on host: Phase 7 (strict TS), Phase 9 (memoization), Phase 10 (vitest), Phase 11 (contract tests) — plus the Phase 12 bundle below. Phase 8 folded into the Phase 7 commit as a no-op. Extracted the JSON/ERROR parsing logic out of `WindowsComPowerPointClient.captureSelectedShape` into a pure `src/domain/powerpoint/parseExtraction.ts` module with a discriminated-union result (`ok:true | {reason:"error-line"|"no-json"|"invalid-json"}`). 11 fixture captures (realistic PS stdout with STEP breadcrumbs) under `tests/fixtures/extractor/`. Two contract suites: `tests/domain/powerpoint/parseExtraction.test.ts` (22 tests) pinning parser behaviour on each fixture branch + ERROR-wins-over-JSON priority + mapExtractionData defaults; `tests/utils/shapeMapper.test.ts` (27 tests) pinning category routing, native-only paths, chooseType precedence, pptx wiring, id/tag generation, and supported-type helpers. `vitest.config.ts` coverage include extended to the two new pure modules. **Sandbox run:** 7/7 files, 118/118 tests green in 1.86s. Coverage over the expanded include set: 98.34% stmts, 93.47% branches, 100% funcs, 98.34% lines — all four thresholds satisfied (parseExtraction 100/100/100/100; shapeMapper 100/93.65/100/100). Three staged commits from prior sessions still pending on host: Phase 7 (strict TS), Phase 9 (memoization), Phase 10 (vitest) — plus the Phase 11 bundle below. Phase 8 folded into the Phase 7 commit as a no-op.
- **Next phase:** Phase 15 — Temp manager + compactDeck
- **Last updated:** 2026-04-21

Phase 14 (PII-safe logger) landed in-sandbox on 2026-04-21. New `src/infra/logger/` (`redact.ts` pure module, `logger.ts` scoped wrapper with pluggable sink, `index.ts` barrel). 8 call sites migrated off `console.*` to `createLogger(scope)` — scope tags preserve the existing `[Export]`/`[Import]`/`[PowerShell]`/`[Cache]`/`[Mapper]`/`[ShapeSaver]`/`[ShapeLoader]`/`[PptxGen]`/`[CategoryManager]` grep conventions. New contract suite `tests/infra/logger/redact.test.ts` covers every rule (win-home both slash styles, mac-home, linux-home, OneDrive org, email preserving domain, long-token, short-hex passthrough, idempotence, recursive objects/arrays, Error special-case, circular guard, `redactArgs` shallow copy). `vitest.config.ts` coverage-include extended with `src/infra/logger/redact.ts`. **Sandbox npm test blocked** on the same linux-native binaries already queued for host `npm install` (Phase 10 + 11 + 12 + 13 — unchanged). Sandbox OneDrive mount also still serves truncated views of 6 logger call-site files from a previous OneDrive fsync (Windows Read tool confirms files are canonical on disk); host tsc run clears it.

## How to resume the backlog

From host PowerShell in the repo root:

```powershell
cd 'C:\Users\m.vieira\OneDrive - Accenture\Desenvolvimentos\Shapes-libreary-v3\shapes-library'
powershell -ExecutionPolicy Bypass -File .\.audit\commit-backlog.ps1
```

The script preflights `tsc` (0 errors) and `eslint` (≤40 errors) before committing, then writes three commits (Phase 7 / Phase 9 / audit) and stops. Re-running after any failure is safe — it picks up remaining staged changes.

## Phase 5 post-mortem (tsc/lint dump review)

The phase5 `tsc --noEmit` and `ray lint` outputs show 69 TS2786 JSX errors and 62 ESLint errors. None is a Phase 5 regression.

- **TS2786 (69 errors, all `<Component> cannot be used as a JSX component`)**: pre-existing baseline issue (baseline had 70; Phase 5's shape-picker refactor collapsed one by line-shift). Root cause: `package.json` pinned `react ^18.2.0` / `@types/react ^18.3.0`, but `@raycast/api@1.102.7` declares both in `dependencies` **and** `peerDependencies` as `react 19.0.0` / `@types/react 19.0.10`, and ships a nested copy under `node_modules/@raycast/api/node_modules/@types/react`. Two type trees coexist. React 19's `FunctionComponent` returns `ReactNode | Promise<ReactNode>` (Server Components) and React 19's `ReactNode` includes `bigint` — neither is assignable to React 18's `ReactNode`, so every Raycast JSX component (`Form`, `ActionPanel`, `Action`, `List`, `Detail`, `Grid`, ...) fails.
- **Fix (Phase 5.1, applied)**: bumped devDeps to `react 19.0.0`, `@types/react 19.0.10`, `@types/node 22.13.10` (the versions Raycast pins). No source change. **Host-side follow-up required**: `npm install` from host PowerShell so `node_modules` is deduped — the sandbox cannot install due to the known OneDrive lock (constraint #1).
- **ESLint (62 errors)**: also pre-existing. Trajectory: baseline 110 → Phase 1 89 → Phase 5 62 (net −48). Remaining rules (`no-empty` on intentional swallowed catches, `no-explicit-any`, `no-var-requires`, `no-case-declarations`, `no-useless-escape`) are out of Phase 5's scope and tracked for Phase 6+ (several cluster inside `shape-picker.tsx`, which Phase 6 will split).
- **Audit file encoding drift (cosmetic)**: `.audit/phase5-tsc.txt` and `.audit/phase5-lint.txt` were written by PowerShell `| Tee-Object`, which emits UTF-16 LE with CRLF. Earlier phases used UTF-8. From Phase 6 onward, dump with `2>&1 | Out-File -FilePath .audit\phaseN-<tool>.txt -Encoding utf8` to stay consistent.

## Baseline findings (Phase 0)

Captured in `.audit/` without modifying any source file.

| Artifact      | File                  | Summary                                                                                                                                                |
| ------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| npm ci        | `baseline-npm-ci.txt` | Blocked by OneDrive file lock on `node_modules/.package-lock.json`. Existing install used for downstream checks.                                       |
| TypeScript    | `baseline-tsc.txt`    | `tsc --noEmit` exits 2. ~350 lines of diagnostics. Errors stem from React/JSX typing mismatch (ReactNode incompatibility).                             |
| ESLint        | `baseline-lint.txt`   | **110 errors.** No warnings. Dominant rules: `no-empty`, `@typescript-eslint/no-explicit-any`, `@typescript-eslint/no-unused-vars`, `no-var-requires`. |
| npm audit     | `baseline-audit.json` | **6 high** vulnerabilities. 0 critical. 402 total deps (100 prod, 277 dev).                                                                            |
| LOC inventory | `baseline-loc.csv`    | 20 TS/TSX files in `src/`. God-component confirmed: `shape-picker.tsx` = 839 LOC.                                                                      |

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
5. **Sandbox cleanup needed after Phase 4:** `src/_test_narrow.ts` (a 10-byte `export {};` placeholder left from TS narrowing diagnosis). Cannot delete from sandbox — OneDrive denies `rm` Operation not permitted. Delete from host before commit: `Remove-Item shapes-library/src/_test_narrow.ts`.
6. **Git index corruption observed during Phase 4:** `fatal: unable to read 960e1615...`. Cannot repair from sandbox (same OneDrive perm block). Fix from host PowerShell before committing: `Remove-Item shapes-library/.git/index; git -C shapes-library reset`.

## Phase log

| Phase               | Status                                                  | Commit              | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------- | ------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 — Baseline        | DONE                                                    | (no code change)    | Branch `refactor/hardening` created. `.audit/` populated.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 1 — Dead code       | DONE                                                    | (see commit below)  | Deleted V2/V3 extractors (501 LOC). Removed 20 unused imports + dead `getAssetsDir`/`handleRepairPreviews`. Lint 110→89 errors (-21). tsc 351→350 lines (unchanged JSX-typing baseline). "Log string" fix: no malformed logs found in live code; item was resolved by V2/V3 deletion (30 redundant console calls removed with them).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2 — Categories      | DONE                                                    | (see commit below)  | Aligned display names to IDs in `src/utils/categoryManager.ts` (arrows→"Arrows", flowchart→"Flowchart", callouts→"Callouts"; basic→"Basic Shapes" kept). Synced seed `assets/categories.json`. tsc 70 errors (=phase1), lint 89 errors (=phase1). No regressions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 3 — PS hardening    | DONE                                                    | (see commits below) | Scaffolded `src/infra/powershell/`: `types.ts` (PSResult union with `droppedBytes`, PSRunOptions, PSFailureReason), `escape.ts` (psSingleQuote NUL-safe, psPath, encodePSCommand for -EncodedCommand), `runner.ts` (runPowerShellScript: UTF-8 BOM on temp .ps1 so PS 5.1 reads non-ASCII correctly; byte-accurate output caps via Buffer[] to avoid mid-codepoint truncation; 60s timeout; AbortSignal; `-InputFormat None`; validates non-empty script; collision-proof temp name), `index.ts` barrel. Zero call-site migration — Phase 4 flips 8 spawn("powershell", …) invocations across 7 files: extractor/windowsExtractor.ts, generator/pptxGenerator.ts, import-library.tsx, shape-picker.tsx (x3), utils/deck.ts, utils/previewGenerator.ts. Bundled hotfix: removed stray `}` left in `src/utils/categoryManager.ts` by the Phase 2 commit. tsc 70 errors (=phase2), lint 89 errors (=phase2). No regressions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 4 — PS scripts      | DONE                                                    | (see commit below)  | Extracted 8 inline PS invocations (across 7 files) into 11 parameterized `.ps1` files bundled under `assets/ps/` (deviation from plan: `scripts/ps/` would not be bundled by `ray build` — Raycast only packages `assets/`). New `runPowerShellFile(scriptPath, params, options)` added to runner — appends `-Key value` pairs after `-File`, treats booleans as switch flags. New `resolvePsScript(name)` helper in `src/infra/powershell/scripts.ts` resolves `environment.assetsPath/ps/<name>.ps1`. All 11 `.ps1` files carry UTF-8 BOM. Migrated call sites: generator/pptxGenerator.ts (insert-active), import-library.tsx (unzip), shape-picker.tsx (export-library, import-library, copy-via-powerpoint), extractor/windowsExtractor.ts (extract-selected-shape — flat 60s timeout replaces streaming 30s→45s→60s ramp), utils/deck.ts (ensure-deck, add-shape-to-deck, copy-from-deck, insert-from-deck — new `throwIfFailed` helper with `asserts result is Extract<PSResult, {ok:true}>`), utils/previewGenerator.ts (export-pptx-to-png). **Narrowing fix:** Since `tsconfig.strict: false`, `if (!result.ok)` fails to narrow the discriminated union (TS widens the literal types). All 8 call sites use `if (result.ok === false)` instead. tsc 70 errors (=phase3), lint 66 errors (< phase3's 89 — dead PS-string noise removed along with the inline spawn bodies). No regressions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 5 — Ports/Adapters  | DONE                                                    | c14b202 + 3d8b35a   | Introduced `PowerPointClient` port in `src/domain/powerpoint/` (`PowerPointClient.ts` + `types.ts`). Adapters in `src/infra/powerpoint/`: `WindowsComPowerPointClient.ts` (folded from `src/extractor/windowsExtractor.ts` + `src/utils/deck.ts`), `MacPowerPointClient.ts` (folded from `src/extractor/macExtractor.ts`; deck/clipboard methods throw platform-unsupported), `MockPowerPointClient.ts` (records calls, default happy-path returns, consumer-overridable `responses`). Factory + barrel at `src/infra/powerpoint/index.ts` exposes `getPowerPointClient()` (lazy-cached singleton, platform-picked), `setPowerPointClient(c)` / `resetPowerPointClient()` for tests, and `getDeckPath()` helper. **Deviation from plan's 5-method interface:** added `copyDeckSlideToClipboard(deckPath, slideIndex)` as 6th method to preserve the `useLibraryDeck` fidelity path in shape-picker (else deck-slide copies would round-trip through an intermediate pptx file). Call sites updated: `src/capture-shape.tsx` (3 replacements: `captureShapeFromPowerPoint()` → `getPowerPointClient().captureSelectedShape()`; 2× `addShapeToDeckFromPptx(src)` → `getPowerPointClient().addSlideFromPptx(getDeckPath(), src)`); `src/shape-picker.tsx` (3 replacements: `copyFromDeckToClipboard` → `copyDeckSlideToClipboard`, `insertFromDeckIntoActive` → `insertSlide`, `runCopyViaPowerPoint` body → client `copyShapeToClipboard`). **Pending host action (bash blocked on stale OneDrive mount):** git rm the now-orphaned `src/extractor/{index,windowsExtractor,macExtractor,types}.ts` + `src/utils/deck.ts`, then tsc+commit. Host commands are listed below the Phase log.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 6 — Split picker    | DONE                                                    | (pending commit)    | `shape-picker.tsx` 685 → 153 LOC. New folder `src/features/shape-picker/` (6 files, 591 LOC): `shapeLoader.ts` (108, seed + load-by-category + load-all), `libraryZip.ts` (104, export/import PS + zip/unzip), `EditShapeForm.tsx` (100, form + category move), `ImportLibraryForm.tsx` (39, zip prompt), `clipboard.ts` (100, copy paths — deck / native / generated fallback), `ShapeGridItem.tsx` (140, Grid.Item + ActionPanel). Root component now owns only category state, `loadShapes`, `handleRefresh`, `handleDeleteShape`, and the outer `<Grid>`. **tsc: 0 errors** (Phase 5.1 React-19 realignment is now in effect — `node_modules/@types/react@19.0.10` — down from 70 TS2786). **Lint: 62 → 56 errors** (-6, from commented noop catches in extracted modules; all remaining errors pre-existing — `no-empty`, `no-explicit-any`, `no-case-declarations`, `no-useless-escape` — none inside the new feature folder). Zero behavior change; all public command entry points unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 7 — TS strict       | DONE (commit pending — run `.audit/commit-backlog.ps1`) | (pending commit)    | `tsconfig.strict: true`, `noImplicitAny: true`. Removed all 13 `any` usages: capture-shape.tsx (5: `__tempPng` hack replaced by `tempPng` prop/state; `ExtractionResult` typed; `as unknown as number` for `getShapeTypeName`), generator/pptxGenerator.ts (3: `pptx.SHAPE_NAME`/`pptx.ShapeProps` via `typeof pptxgen` namespace types; added guard for `!shapeDef`), utils/cache.ts (1: `ShapeCategory = string` already, cast was noop), utils/previewGenerator.ts (1: same), utils/shapeMapper.ts (3: `extracted.isGroup` already on `ExtractedShape`, `pptxType ?? "rectangle"` discriminated against `"roundRectangle"` literal). New TS18048 errors surfaced by strict fixed with: (a) `pptxGenerator.ts` throw-guard when `shape.pptxDefinition` missing; (b) `svgPreview.ts` default-to-rectangle fallback. **tsc: 0 errors** (under strict). **Lint: 56 → 40 errors** (−16, `@typescript-eslint/no-explicit-any` class eliminated). Bundled hotfix: truncated 171 trailing NULs in `src/features/shape-picker/ShapeGridItem.tsx` (Phase 6 leftover; caused 171 TS1127 "Invalid character" errors — unrelated to Phase 7 scope but blocked a clean baseline).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 8 — ESM imports     | DONE (no-op)                                            | (no code change)    | Verification-only. `grep -rE "\brequire\s*\(\|createRequire\|module\.exports\|exports\."` across `src/` returns 0 matches; only a literal `// ALWAYS require native PPTX` comment in `utils/previewGenerator.ts:30`. All 16 baseline `no-var-requires` sites were collaterally resolved by Phases 1 (V2/V3 extractor delete), 3/4 (PS runner extraction), 6 (shape-picker split), 7 (strict-mode). `phase7-lint.txt` already shows 0 `no-var-requires` errors. No files modified in Phase 8.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 9 — Memoization     | DONE (commit pending — run `.audit/commit-backlog.ps1`) | (pending commit)    | Module-level cache in `getLibraryRoot()` (paths.ts) + mtime-keyed cache in `loadCategories()` (categoryManager.ts). Cache self-refresh on `saveCategories`. Explicit `invalidateCategoriesCache()` wired into `importLibraryZip()` both branches. Shallow-clone returns protect the cache from caller mutations. Exports `resetLibraryRootCache()` and `invalidateCategoriesCache()` for Phase 10 tests. Three files edited: `src/utils/paths.ts`, `src/utils/categoryManager.ts`, `src/features/shape-picker/libraryZip.ts`. **Verified in-sandbox:** `tsc --noEmit` → 0 errors under strict; `eslint` → 40 (baseline); `prettier --check` → clean. Sandbox mount staleness resolved via virtiofs→bindfs `cp` refresh pattern.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 10 — TDD base       | DONE (commit pending on host)                           | (pending commit)    | `vitest.config.ts` (v8 coverage, 80% thresholds on lines/stmts/funcs/branches, `@raycast/api` aliased to `tests/mocks/raycast-api.ts`). `tests/` tree: `setup.ts`, `mocks/raycast-api.ts`, `infra/powershell/escape.test.ts` (12), `utils/cache.test.ts` (8), `utils/categoryManager.test.ts` (25), `utils/paths.test.ts` (12), `utils/svgPreview.test.ts` (12) = 69 tests. `coverage/` added to `.gitignore`. **Sandbox run:** 5/5 files, 69/69 tests green in 5.26s. Coverage over the included set: 97.04% stmts, 90.75% branches, 100% funcs, 97.04% lines — all four thresholds satisfied. Known uncovered regions (paths.ts 43-50 double-fallback, categoryManager.ts 105-108 post-write statSync race, svgPreview.ts 16-17 missing-dim coalesce) are documented in `.audit/phase10-coverage.txt` and left for Phase 11 contract tests. **Sandbox linux binaries:** `@rollup/rollup-linux-x64-gnu@4.60.2` and `@esbuild/linux-x64@0.27.7` hand-placed into `node_modules/` because the host-generated lockfile only ships win32 binaries. These are unpacked tarballs — a host `npm ci` will replace them cleanly. `tsc --noEmit` still 0 errors (tests excluded from `src/**/*` include; vitest uses esbuild).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 11 — Contract tests | DONE (commit pending on host)                           | (pending commit)    | Extracted parser from `WindowsComPowerPointClient` into pure `src/domain/powerpoint/parseExtraction.ts` (findErrorLine, mapExtractionData, parseExtractionStdout returning a discriminated union). 11 fixtures under `tests/fixtures/extractor/` covering every PS branch (rectangle, rounded, right-arrow, flowchart-decision, group, picture, no-shape-selected, textbox-rejected, malformed-json, no-json, minimal-defaults). Two contract suites: `tests/domain/powerpoint/parseExtraction.test.ts` (22 tests) + `tests/utils/shapeMapper.test.ts` (27 tests). `vitest.config.ts` coverage include extended to both new modules. **Sandbox run:** 7/7 files, 118/118 tests green (+49 vs Phase 10). Coverage: 98.34% stmts, 93.47% branches, 100% funcs, 98.34% lines — both thresholds and scope widened. parseExtraction.ts at 100/100/100/100; shapeMapper.ts at 100/93.65/100/100. `WindowsComPowerPointClient.captureSelectedShape` now delegates to the pure parser; behaviour is byte-for-byte identical (error-line priority, no-json console.error breadcrumb, success shape contract). Fixed OneDrive trailing-NUL corruption in the adapter file during the extraction.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 12 — Zip security   | DONE (commit pending on host)                           | (pending commit)    | Defense-in-depth against hostile archives before any extraction. Two pure modules: `src/domain/zip/zipSafety.ts` (`ZipLimits`/`DEFAULT_ZIP_LIMITS` 500 MiB total / 10_000 entries / 200 MiB per-entry; `validateEntryPath` rejecting empty, null-byte, backslash, `/absolute`, `C:drive-letter`, UNC `//host`, and any `..` segment; `assertZipEntries` aggregating to `ZipViolation` union; `describeZipViolation` for human-readable messages) and `src/domain/zip/parseZipInspection.ts` (`parseZipInspectionStdout` for the inspect-zip.ps1 `<size>\|<name>\nOK:<count>` protocol; `parseUnzipListingOutput` for info-zip `unzip -l` column format that respects spaces in names; both return an `InspectionParseResult` discriminated union with reason `"error-line"`/`"missing-terminator"`/`"count-mismatch"`/`"malformed"`). New PS script `assets/ps/inspect-zip.ps1` (UTF-8 BOM) uses `[System.IO.Compression.ZipFile]::OpenRead` to enumerate entries WITHOUT extracting, emits `{Length}\|{FullName}` per entry terminated by `OK:<count>`, or `ERROR:<msg>`; added to `PsScriptName` union in `src/infra/powershell/scripts.ts`. Adapter `src/infra/zip/inspectZip.ts::assertZipIsSafe(zipPath, limits?)` dispatches to the PS script on Windows or `spawn("unzip", ["-l", zipPath])` elsewhere, funnels through the parser and validator, throws with a rich message on violation. Guards wired into BOTH import entry points BEFORE any extraction: `src/import-library.tsx` (Raycast no-view command) and `src/features/shape-picker/libraryZip.ts::importLibraryZip`. 9 realistic fixtures under `tests/fixtures/zip-inspect/` (`safe.txt`, `zip-slip.txt`, `zipbomb.txt`, `inspect-error.txt`, `malformed.txt`, `missing-terminator.txt`, `count-mismatch.txt`, `unzip-list-safe.txt`, `unzip-list-zipslip.txt`). Two contract suites: `tests/domain/zip/zipSafety.test.ts` (exhaustive per-reason + limit enforcement + describe rendering) and `tests/domain/zip/parseZipInspection.test.ts` (every parser branch + end-to-end parser+validator integration). `vitest.config.ts` coverage-include extended with both pure modules. **tsc (sandbox): 0 errors under strict.** **Test run pending the same host `npm install` already scheduled by Phase 10** (Windows-authored lockfile ships only win32 rollup/esbuild binaries; linux-x64-gnu natives handled by the host install, not committable from sandbox). |
| 13 — CI/CD          | DONE (commit pending on host)                           | (pending commit)    | GitHub Actions at `.github/workflows/ci.yml` with two jobs. `verify` (Ubuntu, Node 22, matrix-ready) runs `npm ci` → `prettier --check` → `npm run typecheck` → `npm test` as required gates, then `eslint` + `ray build` as `continue-on-error: true` advisory steps surfaced via `::warning::` annotations. Coverage reports uploaded as a 14-day artifact. `security` job runs `npm audit --audit-level=moderate` advisory-only. Least-privilege `permissions: contents: read` and `concurrency.cancel-in-progress` configured at workflow scope. `.github/CODEOWNERS` routes all paths to `@marcelomatosvieira` with dedicated blocks for security-sensitive surfaces (`assets/ps/`, `src/infra/powershell/`, `src/domain/zip/`, `src/infra/zip/`, CI config, top-level tsconfig/vitest/package manifests). `.husky/pre-commit` delegates to `lint-staged` (prettier --write on staged `.ts/.tsx/.json/.md/.yml`) then runs a full `tsc --noEmit`; kept intentionally short to avoid hook erosion. Added `husky` + `lint-staged` to `devDependencies`, `lint-staged` glob config, and `format`/`format:check`/`prepare` scripts to `package.json`. **Sandbox tsc: 0 errors.** Husky activation (`npx husky` or `npm install`) deferred to the host, together with the `node_modules` refresh that Phase 10/11/12 already queued.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 14 — Logging        | DONE (commit pending on host)                           | (pending commit)    | Pure PII-redaction module `src/infra/logger/redact.ts` (7 rules: win-home, win-home-fwd, mac-home, linux-home, OneDrive org, email domain-preserving, long-token 32+; `redactString` idempotent; `redactValue` recursive with WeakSet circular guard and Error special-case; `redactArgs` shallow copy for `console.*`-style arg lists). Scoped-logger wrapper `src/infra/logger/logger.ts` (`createLogger(scope)` prefixes `[<scope>]`, runs every arg through `redactArgs`; pluggable `LogSink` with `setLogSink`/`resetLogSink` for test substitution; default forwards to `console.*`, `info` → `console.log`). Barrel at `src/infra/logger/index.ts`. 8 call sites rewired: `features/shape-picker/libraryZip.ts` (Export + Import scopes, 14 sites), `features/shape-picker/shapeLoader.ts` (ShapeLoader, 3), `generator/pptxGenerator.ts` (PptxGen, 1), `infra/powerpoint/WindowsComPowerPointClient.ts` (PowerShell, 3), `utils/cache.ts` (Cache, 1), `utils/categoryManager.ts` (CategoryManager, 2), `utils/shapeMapper.ts` (Mapper, 1), `utils/shapeSaver.ts` (ShapeSaver, 11). Contract suite `tests/infra/logger/redact.test.ts` exercises every rule plus idempotence, circular guard, and Error redaction. `vitest.config.ts` coverage-include extended with `src/infra/logger/redact.ts`. **Sandbox npm test:** blocked on the same host `npm install` already queued by Phases 10/11/12/13 (linux rollup/esbuild shims). Sandbox tsc clean on all new logger files; 6 pre-existing call-site files still serve truncated views via the OneDrive mount (host tsc run clears it).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 15 — Temp/deck      | PENDING                                                 | —                   | tempManager + compactDeck.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 16 — Docs           | PENDING                                                 | —                   | README security/architecture.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 17 — Local build    | MANUAL                                                  | —                   | Run on host PS.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 18 — ray develop    | MANUAL                                                  | —                   | Host.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 19 — Acceptance     | MANUAL                                                  | —                   | 12 scenarios.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 20 — Publish        | OPTIONAL                                                | —                   | Store release.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

## How to resume

Open a new Cowork session and say:

> Retome o plano shapes-library a partir da Fase N. O estado atual está em `.audit/progress.md` dentro do projeto.

Cowork will re-mount the folder, read this file, and continue.

## Phase 5 — fixup pending on host

Phase 5 committed as `c14b202`. Post-commit tsc/lint surfaced three classes of issues,
two already patched on disk (Cowork edits on Windows), one blocked by a stale OneDrive
mount that prevented Prettier from parsing the files from the sandbox.

**Patched by Cowork on disk (unstaged):**

1. `src/utils/shapeMapper.ts` — fixed orphan import `../extractor/types` → `../domain/powerpoint/types`.
2. `src/infra/powerpoint/MacPowerPointClient.ts` — removed `_`-prefixed unused params;
   params are now referenced inside the thrown error messages (satisfies
   `@typescript-eslint/no-unused-vars` and gives richer platform-unsupported errors).

**Deferred to host (sandbox can't see the full file bytes via OneDrive mount):**

3. Prettier on `src/infra/powerpoint/index.ts`, `WindowsComPowerPointClient.ts`,
   `src/infra/powershell/runner.ts` (last one is pre-existing from Phase 3).

From `C:\Users\m.vieira\OneDrive - Accenture\Desenvolvimentos\Shapes-libreary-v3\shapes-library`:

```powershell
# 1. Format.
npx prettier --write src/infra/powerpoint/ src/utils/shapeMapper.ts src/infra/powershell/runner.ts

# 2. Typecheck — expected: no regression vs the 70-line JSX/ReactNode baseline.
npx tsc --noEmit 2>&1 | Tee-Object .audit/phase5-tsc.txt

# 3. Lint — expected: no regression vs phase4-lint.txt's 66 count.
npm run lint 2>&1 | Tee-Object .audit/phase5-lint.txt

# 4. Stage + commit the fixup.
git add src/utils/shapeMapper.ts `
       src/infra/powerpoint/MacPowerPointClient.ts `
       src/infra/powerpoint/index.ts `
       src/infra/powerpoint/WindowsComPowerPointClient.ts `
       src/infra/powershell/runner.ts `
       .audit/phase5-tsc.txt .audit/phase5-lint.txt `
       .audit/progress.md
git commit -m "fix(phase5): repair shapeMapper import, Mac adapter lint, Prettier"
```

If tsc/lint regress, compare against `.audit/phase3-tsc.txt` / `.audit/phase3-lint.txt`
to isolate Phase 5's contribution.

## Phase 6 — commit pending on host

Phase 6 changes are staged on disk but the sandbox git commit failed with
`.git/index.lock: Operation not permitted` — same OneDrive lock seen in
earlier phases. Files are already staged; the user only needs to commit
from host PowerShell.

**Files staged (added/modified):**

- `src/shape-picker.tsx` (M, 685 → 153 LOC)
- `src/features/shape-picker/shapeLoader.ts` (A)
- `src/features/shape-picker/libraryZip.ts` (A)
- `src/features/shape-picker/EditShapeForm.tsx` (A)
- `src/features/shape-picker/ImportLibraryForm.tsx` (A)
- `src/features/shape-picker/clipboard.ts` (A)
- `src/features/shape-picker/ShapeGridItem.tsx` (A)
- `.audit/phase6-tsc.txt` (A, empty — tsc exit 0)
- `.audit/phase6-lint.txt` (A, 56 errors)
- `.audit/progress.md` (M)

From `C:\Users\m.vieira\OneDrive - Accenture\Desenvolvimentos\Shapes-libreary-v3\shapes-library`:

```powershell
# 1. Clear the stale lock (if it's still there).
Remove-Item .git/index.lock -ErrorAction SilentlyContinue

# 2. Re-verify staging (should list the 10 files above).
git status --short

# 3. Format the new feature folder.
npx prettier --write src/features/shape-picker/ src/shape-picker.tsx

# 4. Re-run tsc + lint just to confirm nothing drifted during prettier.
npx tsc --noEmit 2>&1 | Out-File .audit/phase6-tsc.txt -Encoding utf8
npx eslint src --ext .ts,.tsx 2>&1 | Out-File .audit/phase6-lint.txt -Encoding utf8

# 5. Commit.
git add src/shape-picker.tsx src/features/ .audit/phase6-tsc.txt .audit/phase6-lint.txt .audit/progress.md
git commit -m "refactor(phase6): split shape-picker.tsx into src/features/shape-picker/"
```

After commit, resume Cowork with:

> Retome o plano shapes-library a partir da Fase 7.

## Phase 8 — verification results (no commit needed)

Phase 8 asked for replacing `require("fs")` ESM-wise. Audit shows the work is
already done; no code change was required in-session.

**Evidence captured from sandbox grep (src/ only):**

| Pattern                | Matches                                                                         |
| ---------------------- | ------------------------------------------------------------------------------- |
| `require\(`            | 0                                                                               |
| `createRequire`        | 0                                                                               |
| `module\.exports`      | 0                                                                               |
| `exports\.`            | 0                                                                               |
| literal word `require` | 1 (comment in `utils/previewGenerator.ts:30` — `// ALWAYS require native PPTX`) |

**How the 16 baseline sites disappeared without a dedicated phase:**

- `extractor/windowsExtractorV2.ts`, `windowsExtractorV3.ts` — deleted in Phase 1 (dead code).
- `shape-picker.tsx` lines 587/601/643/656 — past the current EOF; file is 153 LOC after Phase 6 split. Remaining requires landed in `features/shape-picker/*` modules which were rewritten as ESM during extraction.
- `capture-shape.tsx` 172/185, `utils/paths.ts` 20, `utils/previewGenerator.ts` 83/98, `utils/shapeSaver.ts` 206 — rewritten during Phase 3/4 PS-runner migration and Phase 7 strict-mode pass; `phase7-lint.txt` shows 0 `no-var-requires` errors.

**No host action required for Phase 8.** Next session should proceed directly to Phase 9 (Memoization).

Resume command:

> Retome o plano shapes-library a partir da Fase 9.

## Phase 9 — host verification + commit pending

Cowork edited three source files; the Linux sandbox's OneDrive mount kept serving
truncated versions and `npx tsc --noEmit` returned three bogus parse errors
(unterminated block/comment at the very last edited line of each file). Windows-side
Read confirms the files are complete. Re-run tsc/lint from host PowerShell so the
local filesystem is canonical.

**Files modified:**

- `src/utils/paths.ts` (+ memoize `getLibraryRoot`, export `resetLibraryRootCache`)
- `src/utils/categoryManager.ts` (+ mtime-keyed cache, export `invalidateCategoriesCache`, return shallow clones)
- `src/features/shape-picker/libraryZip.ts` (+ `invalidateCategoriesCache()` after both import branches)

**Why memoize these two in particular:**

- `getLibraryRoot()` is hit ≥15× per render cycle (shape grid, `ShapeGridItem`, every clipboard/edit/insert action). Before the cache each call did `getPreferenceValues` + `expandUserPath` (regex/home-join) + `existsSync`/`mkdirSync`. Now: constant-time pointer read after the first call.
- `loadCategories()` is hit from render loops in `capture-shape.tsx`, `EditShapeForm.tsx`, `shape-picker.tsx`, `shapeLoader.ts`, `manage-categories.tsx`. Before the cache each call did `existsSync` + `readFileSync` + `JSON.parse`. Now: `statSync` only (mtime compare) when cache is warm.

**Cache correctness contract:**

- `getLibraryRoot()` cache is evergreen for the process lifetime. Raycast commands are separate processes, so preference changes are picked up on the next command invocation.
- `loadCategories()` cache is keyed on `(filePath, mtimeMs)`. External writes to `categories.json` (library import, manual edits) invalidate naturally via mtime change. Internal writes via `saveCategories()` update the cache pointer + mtime in-place. Shallow-clone return means the mutator pattern (`loadCategories().push()` → `saveCategories()`) is safe.
- Explicit `invalidateCategoriesCache()` is called from `importLibraryZip()` (both Windows PS and non-Windows unzip branches) as belt-and-suspenders against same-mtime collisions.

From `C:\Users\m.vieira\OneDrive - Accenture\Desenvolvimentos\Shapes-libreary-v3\shapes-library`:

```powershell
# 1. Clear any stale git/index lock (OneDrive sometimes pins it).
Remove-Item .git/index.lock -ErrorAction SilentlyContinue

# 2. Format.
npx prettier --write src/utils/paths.ts src/utils/categoryManager.ts src/features/shape-picker/libraryZip.ts

# 3. Typecheck — expected: 0 errors (matches phase7-tsc baseline).
npx tsc --noEmit 2>&1 | Out-File .audit/phase9-tsc.txt -Encoding utf8

# 4. Lint — expected: 40 errors (matches phase7-lint; Phase 9 touches comments/types only, no new lint classes).
npx eslint src --ext .ts,.tsx 2>&1 | Out-File .audit/phase9-lint.txt -Encoding utf8

# 5. Stage + commit.
git add src/utils/paths.ts src/utils/categoryManager.ts src/features/shape-picker/libraryZip.ts `
       .audit/phase9-tsc.txt .audit/phase9-lint.txt .audit/progress.md
git commit -m "refactor(phase9): memoize getLibraryRoot and loadCategories"
```

If tsc reports regressions, diff against the expected shapes documented in the
\"Cache correctness contract\" block above before rolling forward.

After commit, resume Cowork with:

> Retome o plano shapes-library a partir da Fase 10.

## Phase 10 — host verification + commit pending

Vitest scaffolding landed in-sandbox and runs green. Because `package-lock.json`
was generated on Windows, the sandbox needed linux-native shims for rollup and
esbuild that are NOT in the lockfile; those were placed by hand in `node_modules/`
and must NOT be committed. A host `npm install` (or `npm ci`) will restore the
canonical tree.

**Files modified / added:**

- `vitest.config.ts` (A — v8 coverage, 80% thresholds, scoped `include`)
- `tests/setup.ts` (A)
- `tests/mocks/raycast-api.ts` (A)
- `tests/infra/powershell/escape.test.ts` (A)
- `tests/utils/cache.test.ts` (A)
- `tests/utils/categoryManager.test.ts` (A)
- `tests/utils/paths.test.ts` (A)
- `tests/utils/svgPreview.test.ts` (A)
- `.gitignore` (M — add `coverage/`)
- `.audit/phase10-test.txt` (A)
- `.audit/phase10-coverage.txt` (A)
- `.audit/progress.md` (M)

**Why `tests/` as a top-level folder (not `src/**/\*.test.ts`):\*\*

`tsconfig.json` includes `src/**/*` and rootDir-locks compilation under `src/`.
Co-locating tests with source would either leak into `dist/` on `ray build`
or require a second tsconfig. A separate `tests/` tree keeps the production
compile graph clean — vitest uses its own esbuild transform and does not
depend on `tsc`.

**Why coverage is scoped (`coverage.include`):**

The 80% bar targets the pure, unit-testable surface: PS escape helpers,
the path/category memo layer, the SVG preview generator, the shape cache.
Raycast view components, PowerShell adapters, and the pptx generator are
out-of-scope until Phase 11 (contract tests) and Phase 15 (temp/deck
integration). Widening the `include` before those phases would force
shallow tests that game the metric without catching real bugs.

From `C:\Users\m.vieira\OneDrive - Accenture\Desenvolvimentos\Shapes-libreary-v3\shapes-library`:

```powershell
# 0. Clear any stale git/index lock.
Remove-Item .git/index.lock -ErrorAction SilentlyContinue

# 1. Refresh node_modules so Windows binaries are canonical and the
#    sandbox-placed linux shims are removed. This is the right moment to
#    cycle the lock (phases 7 and 9 were also waiting on this).
npm install

# 2. Format (tests + config).
npx prettier --write vitest.config.ts tests/

# 3. Typecheck — tsc only sees src/**/*, so this is unchanged from Phase 9.
npx tsc --noEmit 2>&1 | Out-File .audit/phase10-tsc.txt -Encoding utf8

# 4. Run tests with coverage. Expected: 5 files, 69 tests, all thresholds pass.
npm test 2>&1 | Out-File .audit/phase10-test.txt -Encoding utf8

# 5. Lint the new files. Expected: no new errors (40 baseline unchanged).
npx eslint src tests --ext .ts,.tsx 2>&1 | Out-File .audit/phase10-lint.txt -Encoding utf8

# 6. Stage + commit. Do NOT add `coverage/` or `node_modules/` — the
#    sandbox-placed linux rollup/esbuild shims must not be tracked.
git add vitest.config.ts tests/ .gitignore `
       .audit/phase10-test.txt .audit/phase10-coverage.txt .audit/progress.md
git commit -m "test(phase10): vitest + 80% coverage thresholds (pure modules)"
```

After commit, resume Cowork with:

> Retome o plano shapes-library a partir da Fase 11.

## Phase 11 — host verification + commit pending

Pure parser carved out of `WindowsComPowerPointClient.captureSelectedShape` and
backed by realistic stdout fixtures. Two new contract suites pin the extraction
contract and the shape mapper. Sandbox coverage expanded from 5 files / 69 tests
(97.04% stmts) to 7 files / 118 tests (98.34% stmts).

**Files added:**

- `src/domain/powerpoint/parseExtraction.ts` (A — `RawExtractionJson`, `ExtractionParseResult` discriminated union, `findErrorLine`, `mapExtractionData`, `parseExtractionStdout`)
- `tests/fixtures/extractor/rectangle-success.txt` (A)
- `tests/fixtures/extractor/rounded-rectangle.txt` (A — rotation 15, adjustments [0.125], fillTransparency 0.25)
- `tests/fixtures/extractor/right-arrow.txt` (A — no fillTransparency, lineWeight 1)
- `tests/fixtures/extractor/flowchart-decision.txt` (A — type 111)
- `tests/fixtures/extractor/group-selection.txt` (A — isGroup true, no fill/line)
- `tests/fixtures/extractor/picture-selection.txt` (A — isPicture true, pngTempPath)
- `tests/fixtures/extractor/no-shape-selected.txt` (A — ERROR: line)
- `tests/fixtures/extractor/textbox-rejected.txt` (A — ERROR: line)
- `tests/fixtures/extractor/malformed-json.txt` (A — truncated JSON)
- `tests/fixtures/extractor/no-json.txt` (A — STEP lines only)
- `tests/fixtures/extractor/minimal-defaults.txt` (A — `{}` → defaults)
- `tests/domain/powerpoint/parseExtraction.test.ts` (A — 22 tests)
- `tests/utils/shapeMapper.test.ts` (A — 27 tests)
- `.audit/phase11-test.txt` (A)
- `.audit/phase11-coverage.txt` (A)

**Files modified:**

- `src/infra/powerpoint/WindowsComPowerPointClient.ts` (M — captureSelectedShape now delegates to `parseExtractionStdout` + `findErrorLine`; ~50 LOC inline parsing removed; protocol-error / ERROR-line / no-json branches preserved)
- `vitest.config.ts` (M — `coverage.include` extended with `src/domain/powerpoint/parseExtraction.ts` and `src/utils/shapeMapper.ts`)
- `.audit/progress.md` (M)

**Why a separate pure module:**

The PS-to-shape decode is the highest-risk slice of the extraction pipeline
(edge cases: empty stdout, ERROR: interleaved with JSON, truncated JSON,
missing fields). Keeping it inside the adapter made it untestable without
either mocking the runner or booting COM. A ~100-line pure module with a
discriminated-union result is fixture-testable, has a single call site, and
preserves the "ERROR: line wins over trailing JSON" priority that the legacy
inline code relied on (this priority is explicitly pinned as a test).

**Why 11 fixtures (and not synthetic JSON):**

Every fixture is a realistic stdout capture — `STEP0 Start`, `STEP_FILEOK ...`,
the compressed-JSON line, then `STEP8 Done`. Synthesised `JSON.stringify`
inputs would miss the breadcrumb framing that `parseExtractionStdout` has to
pick apart. Two fixtures (`no-shape-selected`, `textbox-rejected`) exercise
the `ERROR:` priority branch; one (`malformed-json`) exercises `JSON.parse`
failure; one (`no-json`) exercises the "found STEP but no `{`" branch;
one (`minimal-defaults`) exercises `mapExtractionData` defaults end-to-end.

From `C:\Users\m.vieira\OneDrive - Accenture\Desenvolvimentos\Shapes-libreary-v3\shapes-library`:

```powershell
# 0. Clear any stale git/index lock.
Remove-Item .git/index.lock -ErrorAction SilentlyContinue

# 1. Format. (Windows host — no NUL corruption to repair.)
npx prettier --write src/domain/powerpoint/parseExtraction.ts `
                     src/infra/powerpoint/WindowsComPowerPointClient.ts `
                     tests/domain/powerpoint/parseExtraction.test.ts `
                     tests/utils/shapeMapper.test.ts `
                     vitest.config.ts

# 2. Typecheck — expected: 0 errors (matches Phase 10 baseline).
npx tsc --noEmit 2>&1 | Out-File .audit/phase11-tsc.txt -Encoding utf8

# 3. Run tests with coverage. Expected: 7 files, 118 tests, all thresholds pass.
npm test 2>&1 | Out-File .audit/phase11-test.txt -Encoding utf8

# 4. Lint. Expected: no regression from Phase 10's 40 baseline.
npx eslint src tests --ext .ts,.tsx 2>&1 | Out-File .audit/phase11-lint.txt -Encoding utf8

# 5. Stage + commit. Keep fixtures + src + tests + vitest.config in one bundle.
git add src/domain/powerpoint/parseExtraction.ts `
       src/infra/powerpoint/WindowsComPowerPointClient.ts `
       tests/domain/powerpoint/parseExtraction.test.ts `
       tests/utils/shapeMapper.test.ts `
       tests/fixtures/extractor/ `
       vitest.config.ts `
       .audit/phase11-tsc.txt .audit/phase11-lint.txt `
       .audit/phase11-test.txt .audit/phase11-coverage.txt `
       .audit/progress.md
git commit -m "test(phase11): extractor parsing fixtures + shapeMapper contract tests"
```

After commit, resume Cowork with:

> Retome o plano shapes-library a partir da Fase 12.

## Phase 12 — host verification + commit pending

Pre-extraction guards landed: a pure domain layer that validates every entry in a
ZIP against zip-slip + zipbomb rules, an inspection adapter that enumerates the
archive without extracting it, and call-site wiring into both import flows.

**Files added:**

- `src/domain/zip/zipSafety.ts` (A — `ZipLimits`, `DEFAULT_ZIP_LIMITS`, `ZipEntrySummary`, `EntryPathViolation`, `validateEntryPath`, `ZipViolation`, `assertZipEntries`, `describeZipViolation`)
- `src/domain/zip/parseZipInspection.ts` (A — `InspectionParseResult`, `parseZipInspectionStdout`, `parseUnzipListingOutput`)
- `src/infra/zip/inspectZip.ts` (A — `assertZipIsSafe(zipPath, limits?)` adapter dispatching to PS on Windows, `unzip -l` elsewhere)
- `assets/ps/inspect-zip.ps1` (A — UTF-8 BOM; `ZipFile::OpenRead` entry enumeration; `size|name` lines + `OK:<count>` or `ERROR:<msg>`)
- `tests/domain/zip/zipSafety.test.ts` (A)
- `tests/domain/zip/parseZipInspection.test.ts` (A)
- `tests/fixtures/zip-inspect/safe.txt` (A)
- `tests/fixtures/zip-inspect/zip-slip.txt` (A)
- `tests/fixtures/zip-inspect/zipbomb.txt` (A — 10 GiB entry to stress entry-size violation)
- `tests/fixtures/zip-inspect/inspect-error.txt` (A)
- `tests/fixtures/zip-inspect/malformed.txt` (A — non-numeric size)
- `tests/fixtures/zip-inspect/missing-terminator.txt` (A)
- `tests/fixtures/zip-inspect/count-mismatch.txt` (A)
- `tests/fixtures/zip-inspect/unzip-list-safe.txt` (A — spaces in names exercise column-width logic)
- `tests/fixtures/zip-inspect/unzip-list-zipslip.txt` (A)

**Files modified:**

- `src/infra/powershell/scripts.ts` (M — `"inspect-zip"` added to the `PsScriptName` union)
- `src/import-library.tsx` (M — pre-extraction `await assertZipIsSafe(zip)` call)
- `src/features/shape-picker/libraryZip.ts` (M — pre-extraction `await assertZipIsSafe(zipPath)` call in `importLibraryZip`; prints `entryCount`/`totalBytes` breadcrumb on success)
- `vitest.config.ts` (M — `coverage.include` extended with `src/domain/zip/parseZipInspection.ts` and `src/domain/zip/zipSafety.ts`)
- `.audit/progress.md` (M)

**Why a two-layer (pure + adapter) split:**

All path-validation and limit-enforcement logic lives in the pure domain module.
It has zero `fs`/`child_process`/`@raycast/api` dependencies and is trivially
fuzz-tested via fixtures. The adapter only sees `ZipEntrySummary[]`, so the
Windows-vs-POSIX branching collapses into "choose a listing producer, then
hand to the pure pipeline." This mirrors Phase 5's ports/adapters pattern
and Phase 11's extraction-parser split — same rationale: the untestable slice
is the shell, not the rules.

**Why inspect without extracting:**

The only way zip-slip/zipbomb guards are meaningful is if they run BEFORE
`Expand-Archive` or `unzip -o` touch the filesystem. `[System.IO.Compression.ZipFile]::OpenRead`
on Windows and `unzip -l` on POSIX both enumerate the central directory
cheaply (O(entries), no decompression, no bytes written). The resulting
`ZipEntrySummary[]` is then validated by the pure module; only on success
do we hand off to the existing extract commands. If the archive lies about
its sizes, it still gets blocked on Expand-Archive's own failure path —
but we've eliminated the common cases first.

**Why limits are conservative (500 MiB / 10 000 / 200 MiB):**

A legitimate library export is shapes + assets + native pptx + deck — the
largest observed in practice is ~40 MiB with ~1 500 entries. The limits leave
an order of magnitude of headroom for realistic growth while still blocking
petabyte-class decompression bombs. Callers can override via the second
parameter to `assertZipEntries` / `assertZipIsSafe` if a genuinely larger
archive ever appears.

From `C:\Users\m.vieira\OneDrive - Accenture\Desenvolvimentos\Shapes-libreary-v3\shapes-library`:

```powershell
# 0. Clear any stale git/index lock.
Remove-Item .git/index.lock -ErrorAction SilentlyContinue

# 1. Format.
npx prettier --write src/domain/zip/ src/infra/zip/ `
                     src/infra/powershell/scripts.ts `
                     src/import-library.tsx `
                     src/features/shape-picker/libraryZip.ts `
                     tests/domain/zip/ `
                     vitest.config.ts

# 2. Typecheck — expected: 0 errors.
npx tsc --noEmit 2>&1 | Out-File .audit/phase12-tsc.txt -Encoding utf8

# 3. Run tests with coverage. Expected: the Phase 11 suite PLUS the two new
#    zip suites, all thresholds still satisfied.
npm test 2>&1 | Out-File .audit/phase12-test.txt -Encoding utf8

# 4. Lint. Expected: no regression from the 40-error baseline.
npx eslint src tests --ext .ts,.tsx 2>&1 | Out-File .audit/phase12-lint.txt -Encoding utf8

# 5. Stage + commit. Include the PS script, both pure modules, the adapter,
#    every fixture, both test suites, the wiring edits, and the coverage-include bump.
git add src/domain/zip/ src/infra/zip/ `
       src/infra/powershell/scripts.ts `
       src/import-library.tsx `
       src/features/shape-picker/libraryZip.ts `
       assets/ps/inspect-zip.ps1 `
       tests/domain/zip/ tests/fixtures/zip-inspect/ `
       vitest.config.ts `
       .audit/phase12-tsc.txt .audit/phase12-lint.txt `
       .audit/phase12-test.txt `
       .audit/progress.md
git commit -m "feat(phase12): zip slip + zipbomb guards on library import"
```

After commit, resume Cowork with:

> Retome o plano shapes-library a partir da Fase 13.

## Phase 13 — host verification + commit pending

CI workflow, CODEOWNERS, and a lean husky pre-commit hook all landed on
disk. Husky's `install` step runs on `npm install` via the new `prepare`
script; until the host refreshes `node_modules`, the hook file exists
but is not yet registered in `.git/config` (`core.hooksPath`).

**Files added:**

- `.github/workflows/ci.yml` (A — `verify` + `security` jobs)
- `.github/CODEOWNERS` (A)
- `.husky/pre-commit` (A — chmod +x already applied)

**Files modified:**

- `package.json` (M — husky + lint-staged in devDependencies; `lint-staged` config; `format`, `format:check`, `prepare` scripts)
- `.audit/progress.md` (M)

**Why the three required gates (Prettier, tsc, vitest) and not ESLint/build:**

Prettier, tsc, and vitest are the gates the codebase currently passes
cleanly and has passed for several phases. They express the minimum
contract that must hold on every merge to `main`. ESLint stops at 40
pre-existing errors (from `no-empty`, `no-case-declarations`,
`no-useless-escape`) that deliberate earlier phases classified as
"out of scope" — failing CI on them would reject every PR until a
dedicated cleanup phase lands. Similarly, `ray build` is the Raycast
Store packager; its Ubuntu behaviour has not been validated yet, so a
hard gate there would produce flaky runs. Both are kept as advisory
steps that annotate the PR with `::warning::` and surface the trend
without blocking delivery.

**Why the pre-commit is just lint-staged + tsc:**

Hooks that take more than a few seconds get disabled. The two steps
here — prettier on staged files and a project-wide typecheck — are the
minimum that actually prevents broken commits. Vitest is intentionally
NOT in the pre-commit: full test runs belong in CI, not on every
`git commit`. If needed, a `pre-push` hook can add `npm test` later.

**Why `prepare` uses `husky || true`:**

`husky` v9 ships a single binary. On a bare checkout where
`node_modules` is not yet installed, `prepare` still runs (npm invokes
it during `npm install` AFTER dependency resolution). The `|| true`
keeps `npm ci` from failing on environments where `husky` is absent
(CI after install-prune, etc.) — a standard idiom for this hook.

From `C:\Users\m.vieira\OneDrive - Accenture\Desenvolvimentos\Shapes-libreary-v3\shapes-library`:

```powershell
# 0. Clear any stale git/index lock.
Remove-Item .git/index.lock -ErrorAction SilentlyContinue

# 1. Refresh node_modules so husky/lint-staged and the linux shims get
#    replaced canonically. This is the deferred install from Phase 10
#    finally executing.
npm install

# 2. Confirm husky activated (writes .git/config core.hooksPath = .husky).
git config --get core.hooksPath  # expected: .husky

# 3. Format. Expected: nothing to do (these files already formatted).
npx prettier --write package.json .github/ .husky/ .audit/progress.md

# 4. Typecheck (no source change, but sanity check).
npx tsc --noEmit 2>&1 | Out-File .audit/phase13-tsc.txt -Encoding utf8

# 5. Run tests to confirm the new devDeps don't break anything. Expected
#    pass count: Phase 12 count (all zip suites + Phase 11 + Phase 10 + pure utils).
npm test 2>&1 | Out-File .audit/phase13-test.txt -Encoding utf8

# 6. Lint. Expected: 40-error pre-existing baseline, same as Phase 10.
npx eslint src tests --ext .ts,.tsx 2>&1 | Out-File .audit/phase13-lint.txt -Encoding utf8

# 7. Stage + commit. Include everything new + the updated manifest + the
#    lockfile updates from `npm install`.
git add .github/ .husky/ `
       package.json package-lock.json `
       .audit/phase13-tsc.txt .audit/phase13-lint.txt .audit/phase13-test.txt `
       .audit/progress.md
git commit -m "ci(phase13): GitHub Actions + CODEOWNERS + husky pre-commit"
```

After commit, resume Cowork with:

> Retome o plano shapes-library a partir da Fase 14.

## Phase 14 — host verification + commit pending

PII-safe logger landed: a pure redaction module, a scoped logger wrapper with a
pluggable sink, and eight call-site migrations off `console.*`. Sandbox `npm test`
is gated by the same linux-native binaries that Phases 10/11/12/13 already queued
for the deferred host `npm install`; host PowerShell flushes everything in one go.

**Files added:**

- `src/infra/logger/redact.ts` (A — `REDACTED` sentinel, 7-rule table, `redactString`, `redactValue`, `redactArgs`)
- `src/infra/logger/logger.ts` (A — `LogLevel`, `Logger`, `LogSink`, `createLogger`, `setLogSink`, `resetLogSink`, default `consoleSink`)
- `src/infra/logger/index.ts` (A — barrel re-exports)
- `tests/infra/logger/redact.test.ts` (A — per-rule + recursive + circular + Error + shallow-copy coverage)

**Files modified (console.\* → scoped logger):**

- `src/features/shape-picker/libraryZip.ts` (M — `exportLog = createLogger("Export")`, `importLog = createLogger("Import")`; 14 sites)
- `src/features/shape-picker/shapeLoader.ts` (M — `createLogger("ShapeLoader")`; 3 sites)
- `src/generator/pptxGenerator.ts` (M — `createLogger("PptxGen")`; 1 site)
- `src/infra/powerpoint/WindowsComPowerPointClient.ts` (M — `createLogger("PowerShell")`; 3 sites)
- `src/utils/cache.ts` (M — `createLogger("Cache")`; 1 site)
- `src/utils/categoryManager.ts` (M — `createLogger("CategoryManager")`; 2 sites)
- `src/utils/shapeMapper.ts` (M — `createLogger("Mapper")`; 1 site)
- `src/utils/shapeSaver.ts` (M — `createLogger("ShapeSaver")`; 11 sites)
- `vitest.config.ts` (M — `coverage.include` extended with `src/infra/logger/redact.ts`)
- `.audit/progress.md` (M)

**Why a pure redact module + thin wrapper (not a single logger class):**

The redaction rules are the part that earns its keep: they are the reason the
logger exists. Keeping them in `redact.ts` with zero I/O means they're fuzz-
testable from fixtures alone — exactly the same rationale as Phase 11
(`parseExtraction.ts`) and Phase 12 (`zipSafety.ts`). The `logger.ts` wrapper
is deliberately ~100 LOC: scope prefix, level dispatch, sink indirection. No
structured fields, no levelled filtering, no transports. Those belong to a
later phase if we ever ship logs off-machine; Phase 14's job is to close the
PII-leak hole without over-engineering.

**Why rule ordering matters (windows-home, onedrive-org, email, long-token):**

Rules run in declaration order. `windows-home` MUST precede `long-token` so
that the username segment of `C:\Users\m.vieira\...` is replaced by the
targeted rule before the catch-all 32+ char token regex can match a username
that contains enough alphanumerics. Similarly `onedrive-org` runs before
`email` so "Org Name" with hyphens does not get partially eaten by the email
pattern. Every rule replaces its match with a string that contains the
literal `<REDACTED>` sentinel — `<`, `>`, and `/` are outside the long-token
character class, so idempotence follows mechanically.

**Why scope tags preserve the legacy `[Export]`/`[Import]`/... prefixes:**

The codebase already logs with those tags hand-written into the strings
(`console.log("[Export] ...")`). Grep muscle memory and any existing devtool
filters depend on them. `createLogger("Export")` emits the same literal
prefix, just centralised — so no developer workflow changes and any future
structured log shipping inherits the scope as a first-class field.

**Why email rule preserves the domain:**

Ops triage of "tenant's Gmail vs corporate O365" is useful; who the email
belongs to is not. Replacing only the local-part keeps the useful signal
and drops the PII. Full-redact is a one-line change (`replace: REDACTED`)
if policy later tightens.

**Sandbox verification status:**

Sandbox `npx tsc --noEmit` currently reports six stale-mount errors (TS1005/
TS1127/TS1160 at the tail of libraryZip/shapeLoader/pptxGenerator/cache/
categoryManager/shapeMapper). The files are correct on Windows disk (Read
tool confirms). The staleness is the same OneDrive bindfs behaviour Phases
7/9/11 documented — the Windows-side `tsc` in step 3 below will be
authoritative.

From `C:\Users\m.vieira\OneDrive - Accenture\Desenvolvimentos\Shapes-libreary-v3\shapes-library`:

```powershell
# 0. Clear any stale git/index lock.
Remove-Item .git/index.lock -ErrorAction SilentlyContinue

# 1. Refresh node_modules. This is the deferred install queued since Phase 10.
npm install

# 2. Format the new logger tree + the 8 call-site files.
npx prettier --write src/infra/logger/ `
                     src/features/shape-picker/libraryZip.ts `
                     src/features/shape-picker/shapeLoader.ts `
                     src/generator/pptxGenerator.ts `
                     src/infra/powerpoint/WindowsComPowerPointClient.ts `
                     src/utils/cache.ts `
                     src/utils/categoryManager.ts `
                     src/utils/shapeMapper.ts `
                     src/utils/shapeSaver.ts `
                     tests/infra/logger/ `
                     vitest.config.ts

# 3. Typecheck — expected: 0 errors under strict.
npx tsc --noEmit 2>&1 | Out-File .audit/phase14-tsc.txt -Encoding utf8

# 4. Run tests with coverage. Expected: Phase 12 suite PLUS the new redact
#    suite, all thresholds still satisfied.
npm test 2>&1 | Out-File .audit/phase14-test.txt -Encoding utf8

# 5. Lint. Expected: no regression from the 40-error baseline.
npx eslint src tests --ext .ts,.tsx 2>&1 | Out-File .audit/phase14-lint.txt -Encoding utf8

# 6. Stage + commit.
git add src/infra/logger/ `
       src/features/shape-picker/libraryZip.ts `
       src/features/shape-picker/shapeLoader.ts `
       src/generator/pptxGenerator.ts `
       src/infra/powerpoint/WindowsComPowerPointClient.ts `
       src/utils/cache.ts `
       src/utils/categoryManager.ts `
       src/utils/shapeMapper.ts `
       src/utils/shapeSaver.ts `
       tests/infra/logger/ `
       vitest.config.ts `
       .audit/phase14-tsc.txt .audit/phase14-lint.txt .audit/phase14-test.txt `
       .audit/progress.md
git commit -m "feat(phase14): PII-safe scoped logger + redaction contract tests"
```

After commit, resume Cowork with:

> Retome o plano shapes-library a partir da Fase 15.
