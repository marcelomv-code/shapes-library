# Context Pack — Shapes Library Refactor

**Date:** 2026-04-21
**Repo:** `C:\Users\m.vieira\OneDrive - Accenture\Desenvolvimentos\Shapes-libreary-v3\shapes-library`
**Plan source of truth:** `.audit/progress.md`

---

## Where we are

Phases 0 through 13 committed on host. Phase 14 (PII-safe scoped logger) landed in sandbox but **not yet committed**. Phases 11, 12, 14 have intact new files but pending host-side commits.

Last committed phase per `git log --oneline`: Phase 13 (CI + husky + CODEOWNERS).

---

## What broke and why

Write tool on large existing files silently truncated them on disk during Phase 14 rewiring. `Read` saw canonical content; disk had truncated content. Husky pre-commit caught it via prettier/tsc.

**Do not blame OneDrive.** OneDrive was not running. Cause is Cowork/Write tool behavior on big file rewrites. Use `Edit` tool for all future edits on existing files. Never `Write` a full existing file.

---

## Recovery state

User ran `git reset HEAD` then `git checkout HEAD -- <5 files>`:

- src/features/shape-picker/libraryZip.ts — restored
- src/generator/pptxGenerator.ts — restored
- src/utils/cache.ts — restored
- src/utils/categoryManager.ts — restored
- src/utils/shapeMapper.ts — restored

**One more file still truncated (just discovered via tsc):**

- src/features/shape-picker/shapeLoader.ts — truncated at line 107 inside `log.error(\`Failed to load` (template literal not closed)

---

## Immediate next step

```powershell
cd 'C:\Users\m.vieira\OneDrive - Accenture\Desenvolvimentos\Shapes-libreary-v3\shapes-library'
git checkout HEAD -- src/features/shape-picker/shapeLoader.ts
npx tsc --noEmit
```

If tsc reports another unterminated template literal or syntax error in a tracked-modified file, restore it the same way. Candidate suspects still unchecked:

- src/utils/shapeSaver.ts
- src/infra/powerpoint/WindowsComPowerPointClient.ts
- src/import-library.tsx
- src/infra/powershell/scripts.ts
- tests/utils/categoryManager.test.ts

Repeat `git checkout HEAD -- <path>` + `npx tsc --noEmit` until clean.

---

## After tsc clean — reapply edits via Edit tool only

Small surgical diffs. No full-file writes. Target sites:

**Phase 12 (zip safety guard):**

- `src/features/shape-picker/libraryZip.ts` — add `assertZipIsSafe` import and call-site before extraction.

**Phase 14 (scoped logger rewiring):**

- `src/features/shape-picker/libraryZip.ts` — 14 console.\* sites split Export / Import scoped loggers
- `src/features/shape-picker/shapeLoader.ts` — 3 sites (`ShapeLoader` scope)
- `src/generator/pptxGenerator.ts` — 1 site in `cleanupTempFile` (`PptxGen` scope)
- `src/utils/cache.ts` — 1 site in `setCachedShapes` catch (`Cache` scope)
- `src/utils/categoryManager.ts` — 2 sites (`CategoryManager` scope)
- `src/utils/shapeMapper.ts` — 1 site (`Mapper` scope)

Import shape: `import { createLogger } from "../../infra/logger";` then `const log = createLogger("Scope");` — preserve legacy prefixes inside log strings so grep keeps working.

---

## Intact artifacts already on disk (do not touch)

- `src/infra/logger/redact.ts`, `logger.ts`, `index.ts` — Phase 14 module
- `tests/infra/logger/redact.test.ts` — 11 test groups
- `vitest.config.ts` — has `src/infra/logger/redact.ts` in coverage include
- `src/domain/powerpoint/parseExtraction.ts` — Phase 11
- `src/domain/zip/`, `src/infra/zip/`, `assets/ps/inspect-zip.ps1` — Phase 12
- `.github/`, `.husky/` — Phase 13
- `.audit/progress.md` — Phase 14 section filled out, commit marked pending

---

## Host commit plan (after sandbox edits verified)

Per `.audit/progress.md` Phase 14 host block, user runs in `shapes-library/`:

```powershell
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

npx tsc --noEmit 2>&1 | Out-File .audit/phase14-tsc.txt -Encoding utf8
npm test 2>&1 | Out-File .audit/phase14-test.txt -Encoding utf8
npx eslint src tests --ext .ts,.tsx 2>&1 | Out-File .audit/phase14-lint.txt -Encoding utf8

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

Phases 11 and 12 still need their own commits before 14. See `.audit/progress.md` for those blocks (same pattern).

**Do not reuse `.audit/run-phase-backlog.ps1`** — delete it. It assumes intact files; it will not recover from truncation.

---

## Rules for the next session

1. Never `Write` a full existing file. Always `Edit` with small old_string/new_string.
2. After any batch of edits, ask user to run `npx tsc --noEmit` before committing.
3. Do not blame OneDrive. OneDrive is not running.
4. Follow user preferences: 3-6 word sentences, no filler, run tools first.
5. Portuguese is the user's language — short direct answers.
6. Plan authoritative state lives in `.audit/progress.md`. Update it when a phase closes.

---

## Phase backlog after 14

- Phase 15: Temp file manager + compactDeck
- Phases 16-20: see `.audit/progress.md`
