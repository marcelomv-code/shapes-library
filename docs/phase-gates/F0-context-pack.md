# F0 — Context Pack (para retomar 2026-04-22)

## Estado atual em uma frase

Testes 100% verdes (202/202), coverage acima do gate (30.37% ≥ 30%), mas `ray lint` falha com 40 erros ESLint + ~11 arquivos fora do padrão Prettier — **dívida pré-existente**, não regressão do F0.

---

## O que está DONE

| Item                            | Arquivo                                                               | Evidência                                           |
| ------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------- |
| F0.1 coverage.include expandido | `vitest.config.ts`                                                    | 26 módulos aparecem no relatório v8                 |
| F0.2 helpers de mock            | `tests/helpers/{mockFs,mockSpawn,mockRaycast}.ts` + `helpers.test.ts` | 16 sanity tests passando                            |
| F0.3 baseline regressão         | `REGRESSION_BASELINE.md`                                              | 10 cenários Windows + §6 macOS deferred             |
| F0.4 script test:strict         | `package.json`                                                        | `vitest run --coverage && ray lint && tsc --noEmit` |
| F0.5 gate doc                   | `docs/phase-gates/F0.md`                                              | inclui rodadas 2 e 3 de post-verification           |

Três rodadas de correção já aplicadas:

1. Rodada 1 (não verificada, só preparação).
2. Rodada 2: `normalize()` em `expandUserPath` (`src/utils/paths.ts`) e tentativa inicial de `vi.hoisted` em `mockRaycast.ts`.
3. Rodada 3: double-mock removido — spies embutidos no shim `tests/mocks/raycast-api.ts`; `mockRaycast.ts` virou re-export; `process.nextTick` → `setImmediate` em `mockSpawn.ts`; teste "supports queued per-call configs" reescrito com `Promise.all`.

Ver F0.md seções "Post-verification fixes (rodada 2/3)" para detalhes.

---

## O que ainda BLOQUEIA o gate

`ray lint` falha. Quebra em três classes:

### Classe A — `no-empty` (13 erros em ~8 arquivos)

`} catch {}` vazios. Arquivos: `capture-shape.tsx`, `import-library.tsx`, `utils/paths.ts` (linhas 50, 71, 79, 87), `utils/previewGenerator.ts`, `utils/shapeMapper.ts`, `utils/shapeSaver.ts`. Todos pré-existentes. Fix: trocar por `catch { /* ignore */ }` ou adicionar log.

### Classe B — `no-case-declarations` (21 erros, só `utils/svgPreview.ts`)

`case X: const y = ...` sem bloco. Fix: envolver cada `case` em `{ ... }`.

### Classe C — `no-useless-escape` (4 erros, só `capture-shape.tsx` linha 247)

Backslash desnecessário em string. Fix: remover `\`.

### Classe D — Prettier (11 arquivos)

`libraryZip.ts`, `shapeLoader.ts`, `pptxGenerator.ts`, `import-library.tsx`, `WindowsComPowerPointClient.ts`, `scripts.ts`, `inspectZip.ts`, `cache.ts`, `categoryManager.ts`, `shapeMapper.ts`, `shapeSaver.ts`. Fix automático: `ray lint --fix` ou `npx prettier --write .`.

### Observação

Nenhum desses arquivos foi tocado pela F0 (exceto `paths.ts`, onde as 3 linhas adicionadas são pré-formatadas e o empty-catch era pré-existente).

---

## Decisão pendente para amanhã

Três opções, da mais segura à mais agressiva:

**Opção 1 — Fix mínimo para liberar o gate (~15 min)**
Rodar `npx ray lint --fix` (resolve Prettier + alguns ESLint autocorrigíveis) e corrigir à mão as classes A/B/C. Total: ~40 erros mas maioria é `catch {}` trivial. Risco: baixo; mudanças mecânicas.

**Opção 2 — Aceitar temporariamente o lint como débito**
Mudar `test:strict` para `vitest run --coverage && tsc --noEmit` (sem `ray lint`) e registrar no `FIX_PLAN.md` um item "F0.6 limpeza de lint" antes de F1. Risco: adia o débito; o plano original exige lint verde no gate.

**Opção 3 — Só-fix do que está no `coverage.include`**
Corrigir lint apenas nos 26 módulos `.ts` cobertos; deixar `.tsx` UI para F4/F6. Alinha com a filosofia da fase (não-UI primeiro). Risco: `test:strict` continua falhando porque `ray lint` varre tudo.

Recomendação: **Opção 1**. A dívida é pequena, mecânica, e o gate F0 foi definido como lint-clean. Mantém a disciplina do plano.

---

## Números de coverage (v8)

```
All files     30.37 stmts | 89.77 branch | 75.75 funcs | 30.37 lines
domain/zip    96.31 / 94.93 / 100 / 96.31          (excelente)
domain/pp     30.04 / 96 / 66.66 / 30.04           (types.ts e PowerPointClient.ts sem testes — ok)
utils         64.02 / 90.5 / 94.59 / 64.02
infra/logger  42.26 / 92.85 / 75 / 42.26
features/sp   0 / 0 / 0 / 0                        (toda UI — testes ficam F4/F6)
generator     0 / 0 / 0 / 0                        (idem)
infra/pp      0 / 0 / 0 / 0                        (WindowsCom + Mac + Mock — testes F2.5)
infra/ps      2.83 / 62.5 / 50 / 2.83              (só escape.ts coberto — resto é F2.3)
infra/zip     0 / 0 / 0 / 0                        (F2.2)
```

Nenhum arquivo derruba o threshold de 30% agregado. `MacPowerPointClient.ts` contribui para puxar a média para baixo em `infra/powerpoint` — conforme F0.md §macOS, se em fase futura derrubar o gate, adicionar ao `coverage.exclude`.

---

## Arquivos tocados nesta sessão (para diff rápido amanhã)

**Código de produção (3 linhas):**

- `src/utils/paths.ts` — import `normalize`, chamada `normalize(out)` no final de `expandUserPath`.

**Config:**

- `vitest.config.ts` — `coverage.include` globs + thresholds 30.
- `package.json` — script `test:strict`.

**Testes novos:**

- `tests/helpers/mockFs.ts`
- `tests/helpers/mockSpawn.ts`
- `tests/helpers/mockRaycast.ts`
- `tests/helpers/helpers.test.ts`
- `tests/mocks/raycast-api.ts` (reescrito — spies embutidos)
- `tests/setup.ts` (se mudou — confirmar)

**Docs:**

- `REGRESSION_BASELINE.md` (novo)
- `docs/phase-gates/F0.md` (novo, com 3 rodadas de fix notes)
- `docs/phase-gates/F0-context-pack.md` (este arquivo)

---

## Primeiro comando amanhã

```powershell
cd "C:\Users\m.vieira\OneDrive - Accenture\Desenvolvimentos\Shapes-libreary-v3\shapes-library"
npx ray lint --fix
```

Depois rever o diff (`git diff`), corrigir à mão o que sobrou (empty-catch, case-declarations, escape), e re-rodar:

```powershell
npm run test:strict
```

Se verde: F0 fechado, avançar para F1.

---

## Não esquecer

- macOS segue deferred (F0.md §macOS).
- `MacPowerPointClient.ts` segue no `coverage.include` — se puxar threshold abaixo de 30% em alguma fase, **excluir**, não baixar threshold.
- Não há testes novos em src; todo o volume novo está em `tests/helpers/**` e `tests/mocks/**`.
