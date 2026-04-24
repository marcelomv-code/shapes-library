# Architecture Overview

> Post-hardening (Phase 15) architecture of the shapes-library Raycast
> extension. Living document — update as ports/adapters change.

## Layer map

```
┌───────────────────────────────────────────────────────────────┐
│ Raycast UI — entry commands (.tsx)                            │
│   capture-shape.tsx     manage-categories.tsx                 │
│   import-library.tsx    shape-picker.tsx                      │
└────────────────────┬──────────────────────────────────────────┘
                     │
┌────────────────────▼──────────────────────────────────────────┐
│ Features — user-facing flows (shape-picker + helpers)         │
│   src/features/shape-picker/                                  │
│     shapeLoader · libraryZip · clipboard                      │
│     ShapeGridItem · EditShapeForm · ImportLibraryForm         │
└────────────────────┬──────────────────────────────────────────┘
                     │
┌────────────────────▼──────────────────────────────────────────┐
│ Domain — pure, I/O-free business rules                        │
│   src/domain/powerpoint/   PowerPointClient (port), types,    │
│                            parseExtraction, parseCompactDeck  │
│   src/domain/zip/          zipSafety, parseZipInspection      │
└────────────────────┬──────────────────────────────────────────┘
                     │
┌────────────────────▼──────────────────────────────────────────┐
│ Infra — adapters, side-effect wrappers                        │
│   src/infra/powerpoint/    WindowsComPowerPointClient         │
│                            MacPowerPointClient, Mock          │
│   src/infra/powershell/    runner · escape · scripts          │
│   src/infra/zip/           inspectZip                         │
│   src/infra/logger/        redact · logger · index            │
│   src/infra/temp/          tempManager · index                │
└────────────────────┬──────────────────────────────────────────┘
                     │
┌────────────────────▼──────────────────────────────────────────┐
│ Utils — cross-cutting primitives                              │
│   paths · cache · categoryManager · shapeMapper               │
│   shapeSaver · svgPreview · previewGenerator                  │
└───────────────────────────────────────────────────────────────┘
```

**Dependency rule**: arrows point down. Domain never imports from
infra/utils; features never import from UI. Infra adapters depend on
domain (to implement ports) and on PowerShell runner primitives.
Utils are leaf modules — importable anywhere.

## Port–adapter pattern

PowerPoint automation is abstracted behind
`src/domain/powerpoint/PowerPointClient.ts` (the port). Three
adapters implement it:

| Adapter                      | Platform | Runtime                                                                              |
| ---------------------------- | -------- | ------------------------------------------------------------------------------------ |
| `WindowsComPowerPointClient` | Windows  | PowerPoint COM via hardened PS runner                                                |
| `MacPowerPointClient`        | macOS    | AppleScript (`captureSelectedShape` only; deck/clipboard throw platform-unsupported) |
| `MockPowerPointClient`       | Tests    | In-memory, records calls, overridable responses                                      |

`src/infra/powerpoint/index.ts` picks the adapter at runtime via
`getPowerPointClient()` — lazy singleton, platform-selected, swappable
with `setPowerPointClient(c)` / `resetPowerPointClient()` in tests.

**Why ports matter:** consumers (capture-shape.tsx, shape-picker.tsx)
have zero knowledge of COM, AppleScript, or the PS runner. Mocking is
a one-liner; platform parity gaps surface as clean
platform-unsupported errors instead of undefined behaviour.

## Data flow: capture a shape

```
 User hits ⌘ capture-shape
   │
   ▼
 capture-shape.tsx
   │  getPowerPointClient().captureSelectedShape()
   ▼
 WindowsComPowerPointClient.captureSelectedShape()
   │  runPowerShellFile(resolvePsScript("extract-selected-shape"), …, 60s)
   ▼
 powershell runner  →  assets/ps/extract-selected-shape.ps1  →  PowerPoint COM
   │                                                             └─ writes native/shape_*.pptx
   │  stdout (JSON line + STEP breadcrumbs)
   ▼
 parseExtractionStdout (pure)  →  ExtractedShape
   │
   ▼
 shapeMapper.mapToShapeInfo (pure)  →  ShapeInfo (category, tags, pptxDefinition)
   │
   ▼
 shapeSaver.saveShape  →  {LibraryRoot}/shapes/<category>.json + preview.png
```

Every box above Windows is pure (testable without COM). The adapter
line is the only place that needs integration testing on real
PowerPoint.

## Data flow: insert from library

```
 User picks a shape in shape-picker
   │
   ▼
 ShapeGridItem action
   │  useLibraryDeck?  yes → copyDeckSlideToClipboard(deckPath, slideIndex)
   │                   no  → openShapeInPowerPoint(shape)
   ▼
 openShapeInPowerPoint (pptxGenerator.ts)
   │
   ├─ shape.nativePptx  →  insertIntoActivePresentationWindows(nativePath)
   │
   └─ generateShapePptx(shape)  →  writeTempFile("shape_<id>", "pptx", buf)
        │
        ▼
      insertIntoActivePresentationWindows(tempPath)  →  assets/ps/insert-active.ps1
        │
        ▼
      scheduleTempCleanup(tempPath, 60s)  (if autoCleanup preference)
```

## Data flow: library import

```
 import-library.tsx (Raycast no-view command)
   │
   ├─ assertZipIsSafe(zipPath)   →  Phase 12 guard
   │     │
   │     ▼
   │   infra/zip/inspectZip  →  assets/ps/inspect-zip.ps1 OR `unzip -l`
   │     │
   │     ▼
   │   domain/zip/zipSafety.assertZipEntries
   │   (slip + bomb violations throw here — nothing extracted yet)
   │
   ├─ createTempDir("libimp")    →  tracked staging folder (Phase 15)
   │
   ├─ unzipCrossPlatform(zip, staging)
   │
   ├─ copy shapes/, assets/, native/, library_deck.pptx → LibraryRoot
   │
   └─ finally: cleanupTemp(staging)    →  no leak on failure
```

## Test strategy

| Concern                                                                   | Technique                                                                | Files                                                                                                                               |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Pure domain logic                                                         | Vitest + fixtures                                                        | `tests/domain/**/*.test.ts`                                                                                                         |
| Pure infra logic (escape, redact, tempManager)                            | Vitest + in-memory fakes                                                 | `tests/infra/**/*.test.ts`                                                                                                          |
| Utils (cache, paths, categoryManager, shapeMapper, svgPreview)            | Vitest with `@raycast/api` shim                                          | `tests/utils/**/*.test.ts`                                                                                                          |
| Raycast surface (`environment`, `getPreferenceValues`, toasts, Clipboard) | Mock shim at `tests/mocks/raycast-api.ts`, aliased in `vitest.config.ts` | single source of truth                                                                                                              |
| Port–adapter parity                                                       | `MockPowerPointClient` + integration tests where feasible                | not yet exhaustive — live COM not mocked                                                                                            |
| Contract tests for PS protocols                                           | Fixtures under `tests/fixtures/`                                         | `tests/domain/powerpoint/parseExtraction.test.ts`, `tests/domain/zip/*.test.ts`, `tests/domain/powerpoint/parseCompactDeck.test.ts` |

**Coverage gates** (`vitest.config.ts`): 30% baseline on
statements/branches/functions/lines over the included set
(`src/{infra,domain,utils,features/shape-picker,generator}/**/*.ts`
minus index barrels and `.tsx`). Individual pure modules sit at 100%;
the adapters pull the overall number down because they cannot run
without platform I/O.

## Where to change what

| Change                         | Start here                                                     |
| ------------------------------ | -------------------------------------------------------------- |
| New PowerPoint automation flow | Add method to `PowerPointClient`, implement in all 3 adapters  |
| New PowerShell-driven step     | `assets/ps/<name>.ps1` + `PsScriptName` union + adapter method |
| New library-level side effect  | Pure domain module first; expose via infra adapter             |
| New UI command                 | `package.json#commands` + new `src/*.tsx` entry                |
| Tighter redaction              | Add rule to `src/infra/logger/redact.ts` (respect ordering!)   |
| New temp file kind             | Use `writeTempFile` / `createTempDir` from `src/infra/temp`    |
| New zip-safety limit           | Extend `ZipLimits` in `src/domain/zip/zipSafety.ts`            |

## Conventions

- `.ps1` scripts ship with UTF-8 BOM so PS 5.1 parses them as UTF-8.
- Native PS paths in logs and errors preserve forward slashes when
  they came from user input; path normalisation happens only inside
  `src/utils/paths.ts::expandUserPath`.
- Every log line prefix (`[Mapper]`, `[Export]`, …) comes from the
  scoped logger — never hand-written into the format string.
- Temp files under `tmpdir()`; the library root is never used for
  transient state except for the `native/` capture archive.
- `if (result.ok === false)` — narrowing discriminated unions via
  strict equality (loose `!result.ok` does not narrow under
  `tsconfig.strict: false`; we keep the idiom even post-strict for
  consistency).
