# Refactor/Hardening Progress

Sequenced rollout of the shapes-library hardening plan. One phase per Cowork session.

## State

- **Branch:** `refactor/hardening` (from `main`)
- **Current phase:** Phase 10 (TDD base) verified in-sandbox. `vitest.config.ts` with v8 coverage + 80% global thresholds, `tests/` tree with 69 tests across 5 files, `@raycast/api` aliased to a pure in-memory mock. Sandbox run: 5/5 files, 69/69 tests green, coverage 97.04% stmts / 90.75% branches / 100% funcs / 97.04% lines over the included set (escape, cache, categoryManager, paths, svgPreview). Three staged commits from prior sessions still pending on host: Phase 7 (strict TS), Phase 9 (memoization), audit artifacts — plus the Phase 10 bundle below. Phase 8 folded into the Phase 7 commit as a no-op.
- **Next phase:** Phase 11 — Contract tests (extractor parsing fixtures)
- **Last updated:** 2026-04-21

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
5. **Sandbox cleanup needed after Phase 4:** `src/_test_narrow.ts` (a 10-byte `export {};` placeholder left from TS narrowing diagnosis). Cannot delete from sandbox — OneDrive denies `rm` Operation not permitted. Delete from host before commit: `Remove-Item shapes-library/src/_test_narrow.ts`.
6. **Git index corruption observed during Phase 4:** `fatal: unable to read 960e1615...`. Cannot repair from sandbox (same OneDrive perm block). Fix from host PowerShell before committing: `Remove-Item shapes-library/.git/index; git -C shapes-library reset`.

## Phase log

| Phase | Status | Commit | Notes |
|---|---|---|---|
| 0 — Baseline | DONE | (no code change) | Branch `refactor/hardening` created. `.audit/` populated. |
| 1 — Dead code | DONE | (see commit below) | Deleted V2/V3 extractors (501 LOC). Removed 20 unused imports + dead `getAssetsDir`/`handleRepairPreviews`. Lint 110→89 errors (-21). tsc 351→350 lines (unchanged JSX-typing baseline). "Log string" fix: no malformed logs found in live code; item was resolved by V2/V3 deletion (30 redundant console calls removed with them). |
| 2 — Categories | DONE | (see commit below) | Aligned display names to IDs in `src/utils/categoryManager.ts` (arrows→"Arrows", flowchart→"Flowchart", callouts→"Callouts"; basic→"Basic Shapes" kept). Synced seed `assets/categories.json`. tsc 70 errors (=phase1), lint 89 errors (=phase1). No regressions. |
| 3 — PS hardening | DONE | (see commits below) | Scaffolded `src/infra/powershell/`: `types.ts` (PSResult union with `droppedBytes`, PSRunOptions, PSFailureReason), `escape.ts` (psSingleQuote NUL-safe, psPath, encodePSCommand for -EncodedCommand), `runner.ts` (runPowerShellScript: UTF-8 BOM on temp .ps1 so PS 5.1 reads non-ASCII correctly; byte-accurate output caps via Buffer[] to avoid mid-codepoint truncation; 60s timeout; AbortSignal; `-InputFormat None`; validates non-empty script; collision-proof temp name), `index.ts` barrel. Zero call-site migration — Phase 4 flips 8 spawn("powershell", …) invocations across 7 files: extractor/windowsExtractor.ts, generator/pptxGenerator.ts, import-library.tsx, shape-picker.tsx (x3), utils/deck.ts, utils/previewGenerator.ts. Bundled hotfix: removed stray `}` left in `src/utils/categoryManager.ts` by the Phase 2 commit. tsc 70 errors (=phase2), lint 89 errors (=phase2). No regressions. |
| 4 — PS scripts | DONE | (see commit below) | Extracted 8 inline PS invocations (across 7 files) into 11 parameterized `.ps1` files bundled under `assets/ps/` (deviation from plan: `scripts/ps/` would not be bundled by `ray build` — Raycast only packages `assets/`). New `runPowerShellFile(scriptPath, params, options)` added to runner — appends `-Key value` pairs after `-File`, treats booleans as switch flags. New `resolvePsScript(name)` helper in `src/infra/powershell/scripts.ts` resolves `environment.assetsPath/ps/<name>.ps1`. All 11 `.ps1` files carry UTF-8 BOM. Migrated call sites: generator/pptxGenerator.ts (insert-active), import-library.tsx (unzip), shape-picker.tsx (export-library, import-library, copy-via-powerpoint), extractor/windowsExtractor.ts (extract-selected-shape — flat 60s timeout replaces streaming 30s→45s→60s ramp), utils/deck.ts (ensure-deck, add-shape-to-deck, copy-from-deck, insert-from-deck — new `throwIfFailed` helper with `asserts result is Extract<PSResult, {ok:true}>`), utils/previewGenerator.ts (export-pptx-to-png). **Narrowing fix:** Since `tsconfig.strict: false`, `if (!result.ok)` fails to narrow the discriminated union (TS widens the literal types). All 8 call sites use `if (result.ok === false)` instead. tsc 70 errors (=phase3), lint 66 errors (< phase3's 89 — dead PS-string noise removed along with the inline spawn bodies). No regressions. |
| 5 — Ports/Adapters | DONE | c14b202 + 3d8b35a | Introduced `PowerPointClient` port in `src/domain/powerpoint/` (`PowerPointClient.ts` + `types.ts`). Adapters in `src/infra/powerpoint/`: `WindowsComPowerPointClient.ts` (folded from `src/extractor/windowsExtractor.ts` + `src/utils/deck.ts`), `MacPowerPointClient.ts` (folded from `src/extractor/macExtractor.ts`; deck/clipboard methods throw platform-unsupported), `MockPowerPointClient.ts` (records calls, default happy-path returns, consumer-overridable `responses`). Factory + barrel at `src/infra/powerpoint/index.ts` exposes `getPowerPointClient()` (lazy-cached singleton, platform-picked), `setPowerPointClient(c)` / `resetPowerPointClient()` for tests, and `getDeckPath()` helper. **Deviation from plan's 5-method interface:** added `copyDeckSlideToClipboard(deckPath, slideIndex)` as 6th method to preserve the `useLibraryDeck` fidelity path in shape-picker (else deck-slide copies would round-trip through an intermediate pptx file). Call sites updated: `src/capture-shape.tsx` (3 replacements: `captureShapeFromPowerPoint()` → `getPowerPointClient().captureSelectedShape()`; 2× `addShapeToDeckFromPptx(src)` → `getPowerPointClient().addSlideFromPptx(getDeckPath(), src)`); `src/shape-picker.tsx` (3 replacements: `copyFromDeckToClipboard` → `copyDeckSlideToClipboard`, `insertFromDeckIntoActive` → `insertSlide`, `runCopyViaPowerPoint` body → client `copyShapeToClipboard`). **Pending host action (bash blocked on stale OneDrive mount):** git rm the now-orphaned `src/extractor/{index,windowsExtractor,macExtractor,types}.ts` + `src/utils/deck.ts`, then tsc+commit. Host commands are listed below the Phase log. |
| 6 — Split picker | DONE | (pending commit) | `shape-picker.tsx` 685 → 153 LOC. New folder `src/features/shape-picker/` (6 files, 591 LOC): `shapeLoader.ts` (108, seed + load-by-category + load-all), `libraryZip.ts` (104, export/import PS + zip/unzip), `EditShapeForm.tsx` (100, form + category move), `ImportLibraryForm.tsx` (39, zip prompt), `clipboard.ts` (100, copy paths — deck / native / generated fallback), `ShapeGridItem.tsx` (140, Grid.Item + ActionPanel). Root component now owns only category state, `loadShapes`, `handleRefresh`, `handleDeleteShape`, and the outer `<Grid>`. **tsc: 0 errors** (Phase 5.1 React-19 realignment is now in effect — `node_modules/@types/react@19.0.10` — down from 70 TS2786). **Lint: 62 → 56 errors** (-6, from commented noop catches in extracted modules; all remaining errors pre-existing — `no-empty`, `no-explicit-any`, `no-case-declarations`, `no-useless-escape` — none inside the new feature folder). Zero behavior change; all public command entry points unchanged. |
| 7 — TS strict | DONE (commit pending — run `.audit/commit-backlog.ps1`) | (pending commit) | `tsconfig.strict: true`, `noImplicitAny: true`. Removed all 13 `any` usages: capture-shape.tsx (5: `__tempPng` hack replaced by `tempPng` prop/state; `ExtractionResult` typed; `as unknown as number` for `getShapeTypeName`), generator/pptxGenerator.ts (3: `pptx.SHAPE_NAME`/`pptx.ShapeProps` via `typeof pptxgen` namespace types; added guard for `!shapeDef`), utils/cache.ts (1: `ShapeCategory = string` already, cast was noop), utils/previewGenerator.ts (1: same), utils/shapeMapper.ts (3: `extracted.isGroup` already on `ExtractedShape`, `pptxType ?? "rectangle"` discriminated against `"roundRectangle"` literal). New TS18048 errors surfaced by strict fixed with: (a) `pptxGenerator.ts` throw-guard when `shape.pptxDefinition` missing; (b) `svgPreview.ts` default-to-rectangle fallback. **tsc: 0 errors** (under strict). **Lint: 56 → 40 errors** (−16, `@typescript-eslint/no-explicit-any` class eliminated). Bundled hotfix: truncated 171 trailing NULs in `src/features/shape-picker/ShapeGridItem.tsx` (Phase 6 leftover; caused 171 TS1127 "Invalid character" errors — unrelated to Phase 7 scope but blocked a clean baseline). |
| 8 — ESM imports | DONE (no-op) | (no code change) | Verification-only. `grep -rE "\brequire\s*\(\|createRequire\|module\.exports\|exports\."` across `src/` returns 0 matches; only a literal `// ALWAYS require native PPTX` comment in `utils/previewGenerator.ts:30`. All 16 baseline `no-var-requires` sites were collaterally resolved by Phases 1 (V2/V3 extractor delete), 3/4 (PS runner extraction), 6 (shape-picker split), 7 (strict-mode). `phase7-lint.txt` already shows 0 `no-var-requires` errors. No files modified in Phase 8. |
| 9 — Memoization | DONE (commit pending — run `.audit/commit-backlog.ps1`) | (pending commit) | Module-level cache in `getLibraryRoot()` (paths.ts) + mtime-keyed cache in `loadCategories()` (categoryManager.ts). Cache self-refresh on `saveCategories`. Explicit `invalidateCategoriesCache()` wired into `importLibraryZip()` both branches. Shallow-clone returns protect the cache from caller mutations. Exports `resetLibraryRootCache()` and `invalidateCategoriesCache()` for Phase 10 tests. Three files edited: `src/utils/paths.ts`, `src/utils/categoryManager.ts`, `src/features/shape-picker/libraryZip.ts`. **Verified in-sandbox:** `tsc --noEmit` → 0 errors under strict; `eslint` → 40 (baseline); `prettier --check` → clean. Sandbox mount staleness resolved via virtiofs→bindfs `cp` refresh pattern. |
| 10 — TDD base | DONE (commit pending on host) | (pending commit) | `vitest.config.ts` (v8 coverage, 80% thresholds on lines/stmts/funcs/branches, `@raycast/api` aliased to `tests/mocks/raycast-api.ts`). `tests/` tree: `setup.ts`, `mocks/raycast-api.ts`, `infra/powershell/escape.test.ts` (12), `utils/cache.test.ts` (8), `utils/categoryManager.test.ts` (25), `utils/paths.test.ts` (12), `utils/svgPreview.test.ts` (12) = 69 tests. `coverage/` added to `.gitignore`. **Sandbox run:** 5/5 files, 69/69 tests green in 5.26s. Coverage over the included set: 97.04% stmts, 90.75% branches, 100% funcs, 97.04% lines — all four thresholds satisfied. Known uncovered regions (paths.ts 43-50 double-fallback, categoryManager.ts 105-108 post-write statSync race, svgPreview.ts 16-17 missing-dim coalesce) are documented in `.audit/phase10-coverage.txt` and left for Phase 11 contract tests. **Sandbox linux binaries:** `@rollup/rollup-linux-x64-gnu@4.60.2` and `@esbuild/linux-x64@0.27.7` hand-placed into `node_modules/` because the host-generated lockfile only ships win32 binaries. These are unpacked tarballs — a host `npm ci` will replace them cleanly. `tsc --noEmit` still 0 errors (tests excluded from `src/**/*` include; vitest uses esbuild). |
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

| Pattern | Matches |
|---|---|
| `require\(` | 0 |
| `createRequire` | 0 |
| `module\.exports` | 0 |
| `exports\.` | 0 |
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

**Why `tests/` as a top-level folder (not `src/**/*.test.ts`):**

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
