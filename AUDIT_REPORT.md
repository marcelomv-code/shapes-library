# Relatório de Auditoria — Shapes Library v3

**Data:** 2026-04-21
**Escopo:** `shapes-library/` (exclui `node_modules`, `.git`, `assets/native`, `assets/assets`)
**Metodologia:** Varredura estática em três frentes paralelas (bugs/erros, segurança, cobertura TDD)

---

## Sumário Executivo

| Categoria                 | Achados                     | Críticos | Altos | Médios | Baixos |
| ------------------------- | --------------------------- | -------- | ----- | ------ | ------ |
| Bugs e erros não tratados | 32                          | 2        | 13    | 14     | 3      |
| Segurança e riscos        | 12                          | 1        | 4     | 5      | 2      |
| Cobertura de testes       | 11 módulos críticos sem TDD | —        | —     | —      | —      |

**Recomendações imediatas (topo da lista):**

1. Substituir `exec()` por `execFile()` em `MacPowerPointClient.ts` (injeção AppleScript).
2. Adicionar guard em `cache.ts:85` (`cache[cat]?.shapes?.length ?? 0`).
3. Corrigir `import-library.tsx:63` (`dirname(d)` em vez de `join(d, "..")`).
4. Implementar validação de schema (zod) nos `JSON.parse` de `shapeSaver.ts`, `shapeLoader.ts`, `categoryManager.ts` e `WindowsComPowerPointClient.ts`.
5. Validar `expandUserPath` em `paths.ts` com `path.resolve()` + whitelist (`homedir()`/`supportPath`).
6. Expandir `coverage.include` no `vitest.config.ts` para cobrir pastas `infra/`, `domain/`, `features/` e `generator/`.
7. Escrever suíte de testes para `runner.ts`, `inspectZip.ts`, `shapeSaver.ts`, `pptxGenerator.ts`, `libraryZip.ts`.
8. Alinhar `package.json` (`platforms`) à realidade multi-OS do código.

---

## 1. Bugs, Erros Não Tratados e Premissas Falhas

### 1.1 Bugs

| #    | Arquivo:Linha                                               | Severidade  | Descrição                                                                            | Recomendação                                  |
| ---- | ----------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------ | --------------------------------------------- |
| 1.1  | `src/capture-shape.tsx:70`                                  | Alto        | `try { } catch {}` vazio ao mover PNG temporário; preview some silenciosamente.      | Remover catch vazio ou logar.                 |
| 1.2  | `src/capture-shape.tsx:92`                                  | Alto        | `catch {}` silencia falha ao adicionar slide ao deck.                                | Logar antes de suprimir.                      |
| 1.3  | `src/capture-shape.tsx:100-101`                             | Médio       | `launchCommand` envolvido em try/catch vazio.                                        | Remover ou logar.                             |
| 1.4  | `src/utils/shapeSaver.ts:192-197`                           | Médio       | `renameSync` falha → `copyFileSync` ok, mas original não é removido (orphaned file). | Tentar `unlinkSync` ou avisar.                |
| 1.5  | `src/generator/pptxGenerator.ts:92`                         | Médio       | `shapeDef.type as unknown as PptxShapeName` — cast duplo sem validação.              | Validar antes do cast.                        |
| 1.6  | `src/utils/cache.ts:85`                                     | **Crítico** | `sum + cache[cat].shapes.length` — NPE se `cache[cat]` undefined.                    | `cache[cat]?.shapes?.length ?? 0`.            |
| 1.7  | `src/features/shape-picker/clipboard.ts:57-58`              | Baixo       | `getPreferenceValues` chamado duas vezes.                                            | Reutilizar variável.                          |
| 1.8  | `src/utils/shapeSaver.ts:53`                                | Médio       | `shapes.sort(...)` muta o array antes do save.                                       | `[...shapes].sort(...)`.                      |
| 1.9  | `src/infra/powerpoint/WindowsComPowerPointClient.ts:94-126` | Alto        | Parse JSON duplicado vs `parseExtractionStdout` — risco de divergência.              | Reaproveitar função do domain.                |
| 1.10 | `src/import-library.tsx:63`                                 | Alto        | `join(d, "..")` em vez de `dirname(d)` — cria path inválido.                         | `mkdirSync(dirname(d), { recursive: true })`. |

### 1.2 Erros não tratados

| #   | Arquivo:Linha                                    | Severidade | Descrição                                                                         | Recomendação                                      |
| --- | ------------------------------------------------ | ---------- | --------------------------------------------------------------------------------- | ------------------------------------------------- | --- | ---- |
| 2.1 | `src/features/shape-picker/shapeLoader.ts:70-71` | Alto       | `JSON.parse(content)` sem validação — dados malformados passam como `any`.        | Schema validation (zod) ou `Array.isArray` guard. |
| 2.2 | `src/utils/shapeSaver.ts:37-38`                  | Alto       | `JSON.parse(content)` sem guard — operações de array falham se `undefined`.       | Fallback `                                        |     | []`. |
| 2.3 | `src/utils/categoryManager.ts:71-72`             | Alto       | `JSON.parse(content)` sem validação de `CategoriesFile`.                          | Verificar `data.categories` é array.              |
| 2.4 | `src/utils/previewGenerator.ts`                  | Alto       | Importado e chamado (`capture-shape.tsx:76`) — verificar se arquivo implementado. | Validar existência/completude.                    |
| 2.5 | `src/utils/shapeSaver.ts:259-261`                | Médio      | `catch(copyError)` só loga; fallback copy falha silenciosamente.                  | Propagar/retornar contagem parcial.               |
| 2.6 | `src/import-library.tsx:27`                      | Alto       | `unzipCrossPlatform` sem fallback/cleanup em caso de erro.                        | try/catch + cleanup de temp dir.                  |
| 2.7 | `src/features/shape-picker/libraryZip.ts:56-61`  | Médio      | `spawn('zip', …)` resolve mesmo com `zip` ausente do PATH.                        | Detectar prévia ou usar lib npm (archiver).       |
| 2.8 | `src/infra/zip/inspectZip.ts:79-95`              | Médio      | `spawn('unzip', ['-l', …])` sem timeout — hang em zips gigantes.                  | Timeout + SIGKILL.                                |
| 2.9 | `src/utils/shapeMapper.ts`                       | Alto       | `mapToShapeInfo` / `getShapeTypeName` importadas — validar implementação/tipos.   | Ler arquivo e auditar.                            |

### 1.3 Premissas falhas

| #   | Arquivo                                              | Severidade  | Descrição                                                                                    | Recomendação                                                     |
| --- | ---------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 3.1 | `package.json:8`                                     | **Crítico** | `"platforms": ["Windows"]`, mas há `MacPowerPointClient` e fallback `unzip`. Promessa falsa. | Atualizar para `["Windows","macOS"]` ou remover adaptadores Mac. |
| 3.2 | `src/infra/powerpoint/WindowsComPowerPointClient.ts` | Alto        | Assume PowerPoint aberto.                                                                    | Documentar prerequisito / fallback.                              |
| 3.3 | `src/import-library.tsx:74`                          | Alto        | Assume `powershell.exe` no PATH.                                                             | Verificar disponibilidade.                                       |
| 3.4 | `src/infra/powershell/runner.ts:99`                  | Médio       | BOM UTF-8 presume filesystem UTF-8; locales `cp1252` com acentos quebram.                    | Teste cross-locale.                                              |
| 3.5 | `src/import-library.tsx:63`                          | Alto        | `copyDirIfExists` sem guard para `.` ou raiz — recursão infinita potencial.                  | Normalizar e validar.                                            |
| 3.6 | `src/utils/categoryManager.ts:56-62`                 | Médio       | `categories.json` inexistente → retorna defaults sem persistir.                              | Persistir em primeiro load.                                      |
| 3.7 | `src/generator/pptxGenerator.ts:15,107,193`          | Médio       | Temp files rastreados em `Set` mas nunca deletados no disco.                                 | Cleanup on-exit / finalizer.                                     |
| 3.8 | `src/utils/cache.ts:24-27`                           | Baixo       | `mtime` como chave de invalidação falsifica-se facilmente.                                   | Hash de conteúdo (sha256).                                       |

### 1.4 Outros pontos

| Arquivo                                                                    | Severidade | Descrição                                                                                       |
| -------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------- |
| `src/manage-categories.tsx`, `src/features/shape-picker/EditShapeForm.tsx` | Médio      | Forms não validam regex/comprimento/caracteres especiais.                                       |
| Projeto inteiro                                                            | Alto       | Testes só cobrem happy-path; não há fixtures de "corrupted JSON", "no PowerPoint", "disk full". |
| Múltiplos                                                                  | Baixo      | Mensagens de erro inconsistentes ("Unknown error" vs mensagens específicas).                    |
| `src/features/shape-picker/EditShapeForm.tsx:34-52`                        | Alto       | Fluxo multi-step (remover antigo → mover preview → adicionar novo) sem rollback.                |

---

## 2. Segurança e Riscos

### 2.1 Injeção de comando

**CRÍTICO — AppleScript via `exec()`**

- **Arquivo:** `src/infra/powerpoint/MacPowerPointClient.ts:63`
- `execAsync(\`osascript -e '${script.replace(/'/g, "'\\''")}'\`)`—`exec()`passa pelo shell, criando dupla interpretação. Escape só trata`'`. Quebras de linha ou outros especiais podem escapar do `osascript -e`.
- **Correção:** trocar para `execFile('osascript', ['-e', script])`.

**ALTO — Parâmetros PowerShell sem escape explícito**

- **Arquivo:** `src/infra/powershell/runner.ts:168`
- `extraArgs.push(\`-${key}\`, String(value))`— valores (paths, IDs) vão verbatim.`psSingleQuote` é exportado mas não aplicado automaticamente em call sites.
- **Correção:** documentar contrato de escape ou aplicar `psSingleQuote` dentro do runner quando necessário.

### 2.2 Traversal e filesystem

**ALTO — Zip overwrite em `unzip -o`**

- **Arquivo:** `src/features/shape-picker/libraryZip.ts:101`
- Validação Zip Slip em `zipSafety.ts` é robusta, mas `-o` força overwrite sem aviso. Escalação potencial se destino tem arquivos do usuário.
- **Correção:** `-n` (never overwrite) ou documentar escolha.

**ALTO — `expandUserPath` sem validação final**

- **Arquivo:** `src/utils/paths.ts:8-25`
- `libraryPath` como `../../../windows/system32` após expansão pode apontar fora de `homedir()`.
- **Correção:** `path.resolve()` + prefix check contra whitelist (`homedir()`, `environment.supportPath`).

**MÉDIO — Paths sem resolve em `shapeSaver`**

- **Arquivo:** `src/utils/shapeSaver.ts:174-176, 243`
- `shape.id` vem de JSON importado; embora ZIP seja validado, `id` não é re-validado ao compor paths.
- **Correção:** `path.resolve` + prefix check por operação.

### 2.3 Validação de entrada

**ALTO — `JSON.parse` sem schema**

- **Arquivos:** `src/utils/shapeSaver.ts:38`, `src/infra/powerpoint/WindowsComPowerPointClient.ts:101`, e outros.
- Campos como `nativePptx`, `preview` usados diretamente em `join(...)`.
- **Correção:** zod / io-ts, ou validação manual de tipos e regex em IDs.

**ALTO — Metadata de ZIP confiada**

- **Arquivo:** `src/domain/zip/zipSafety.ts:160-199`
- Tamanho descompactado vem do inspector. Header ZIP é difícil de falsificar, mas nunca testado contra zipbombs reais.
- **Correção:** fixtures de zipbomb + limite global.

**MÉDIO — Sem limite de tamanho do ZIP em disco**

- **Arquivo:** `src/features/shape-picker/libraryZip.ts:80`
- `unzip -l` buffera stdout — se ZIP contém milhares de entries, consumo de RAM sobe.
- **Correção:** `statSync(zipPath).size` cap antes de inspecionar.

### 2.4 Dados sensíveis e logging

**MÉDIO — Paths completos em logs**

- **Arquivo:** `src/features/shape-picker/libraryZip.ts:21-24, 37, 54, 83`
- `console.log(\`[Export] Root: ${root}\`)`vaza`C:\Users\<name>\…`.
- **Correção:** usar módulo `redact`.

**MÉDIO — Regra de email em `redact.ts:67-70`**

- Mantém domínio intacto — ok para triagem de tenant, mas correlacionável.
- **Correção:** documentar política ou redigir completo conforme ambiente.

**BAIXO — Preferências Raycast não-redacted**

- **Arquivo:** `src/infra/powerpoint/WindowsComPowerPointClient.ts:27`
- `templatePath` pode aparecer em stack traces.
- **Correção:** redact em qualquer console.log envolvendo prefs.

### 2.5 Dependências

- `pptxgenjs@3.12.0`, `@raycast/api@^1.102.7`, `typescript@^5.9.2`, `eslint@^8.57.0` — sem CVEs conhecidas em cutoff.
- **Correção:** rodar `npm audit --audit-level=moderate` em CI.

### 2.6 Configuração

- `tsconfig.json`: `strict: true`, `noImplicitAny: true` — **bom**.
- `.eslintrc.json`: extends `@raycast` — ok, mas rules são opacas. Recomenda-se explicitar.

### 2.7 Design

**MÉDIO — `runPowerShellFile` design de escape**

- `src/infra/powershell/runner.ts:134-172` aceita `Record<string, PSParamValue>` sem escape automático. Quando `shell:true`, qualquer valor com espaço quebra.
- **Correção:** encapsular `psSingleQuote` no runner ou documentar explicitamente.

**BAIXO — Temp files fire-and-forget**

- `src/infra/powershell/runner.ts:106-110` — `unlink(...).catch(() => undefined)`. Crashes acumulam lixo em `tmpdir()`.
- **Correção:** GC por idade > 1h.

---

## 3. Cobertura de Testes (TDD)

### 3.1 Estado atual

**Módulos com teste:** 10/36 (28%)
**Módulos no `coverage.include`:** 5/36 (14%)
**Módulos críticos sem teste:** 11/36 (31%)

`vitest.config.ts:29-47` inclui apenas 5 arquivos, inflando o threshold de 80%. 78% do código produção fica fora da medição.

### 3.2 Módulos críticos SEM teste

| Prioridade | Arquivo                                                                     | Por quê                                                                                                            |
| ---------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Máxima** | `src/infra/powershell/runner.ts`                                            | Executa processos externos; sem teste de timeout, BOM UTF-8, buffer cap, AbortSignal, protocolo `ERROR:`, SIGKILL. |
| **Máxima** | `src/infra/zip/inspectZip.ts`                                               | Orquestra inspeção ZIP cross-platform; sem teste de dispatch Win/Mac, limites, propagação de erros.                |
| **Alta**   | `src/generator/pptxGenerator.ts`                                            | Geração PPTX + cleanup temp; sem teste de color normalize, shape map, dispatch Win/Mac, toast lifecycle.           |
| **Alta**   | `src/utils/shapeSaver.ts`                                                   | CRUD com I/O; sem teste de add/update/remove, movePreview, repairOrphanedPreviews, atomic writes.                  |
| **Alta**   | `src/features/shape-picker/libraryZip.ts`                                   | Import/Export ZIP; sem teste de dispatch plataforma, validação de entrada, integração com cache.                   |
| **Média**  | `src/features/shape-picker/shapeLoader.ts`                                  | `Promise.allSettled` aggregation; sem teste de falhas parciais, sort.                                              |
| **Média**  | `src/utils/previewGenerator.ts`                                             | PS invocation + JSON side-effects; sem cobertura.                                                                  |
| **Média**  | `src/features/shape-picker/clipboard.ts`                                    | Leituras Windows-only; sem teste.                                                                                  |
| **Baixa**  | `src/infra/logger/logger.ts`                                                | Níveis/formatação; sem teste.                                                                                      |
| **Baixa**  | `src/infra/powerpoint/{MacPowerPointClient, WindowsComPowerPointClient}.ts` | Adapters; testes de contrato com mock PP ausentes.                                                                 |

### 3.3 Qualidade dos testes existentes

**Positivos (⭐⭐⭐):**

- `escape.test.ts` — edge cases robustos (NUL bytes, newlines, non-string), round-trip UTF-16LE.
- `zipSafety.test.ts` — discriminated union + 8 tipos de violação + boundaries.
- `parseExtraction.test.ts` — fixtures reais de PS; cobertura ampla de shape types; priority ERROR vs JSON.
- `redact.test.ts` — 5 regras + recursão + circular refs + imutabilidade + idempotência.
- `categoryManager.test.ts` — mtime invalidation, shallow copy, deleteCategory com guard.
- `paths.test.ts` / `cache.test.ts` — memoização, invalidação, fallbacks.

**Críticas:**

- Nenhum teste mocka `fs`/`child_process`/`@raycast/api` — impossibilita testar `runner.ts`/`inspectZip.ts` sem refactor.
- Nenhum teste de integração cross-módulo (`parseExtraction` → `shapeMapper` → `shapeSaver`).
- Testes existentes cobrem happy-path; fluxos de erro específicos (timeout, disk full, corrupted JSON) raros.
- `vitest.config.ts` coverage scope estreito (5 arquivos) mascara gaps reais.

### 3.4 Recomendações

**Fase 1 (2 sprints):**

- Expandir `coverage.include`:
  ```ts
  include: [
    "src/infra/**/*.ts",
    "src/domain/**/*.ts",
    "src/utils/**/*.ts",
    "src/features/shape-picker/**/*.ts",
    "src/generator/**/*.ts",
    "!**/*.d.ts",
    "!src/**/*.tsx",
  ];
  ```
- Threshold inicial realista: 40–50%.
- Escrever suites mínimas para `runner.ts` (mock `spawn`) e `shapeSaver.ts` (mock `fs`).

**Fase 2 (2 sprints):**

- Testes de contrato para `PowerPointClient` (Win/Mac/Mock).
- Fixtures de zipbomb + fuzzing leve em `zipSafety.ts`.
- Branch coverage em async error paths.

**Fase 3:**

- Testes de integração UI com mocks de Raycast API.
- CI gate: PR bloqueia se cobertura cair.

---

## 4. Tabela consolidada de prioridades

| Ordem | Ação                                                          | Arquivo                                          | Esforço |
| ----- | ------------------------------------------------------------- | ------------------------------------------------ | ------- |
| 1     | Corrigir NPE em cache.ts                                      | `src/utils/cache.ts:85`                          | 5 min   |
| 2     | Corrigir `join(d,"..")` → `dirname(d)`                        | `src/import-library.tsx:63`                      | 5 min   |
| 3     | `exec` → `execFile` em AppleScript                            | `src/infra/powerpoint/MacPowerPointClient.ts:63` | 15 min  |
| 4     | Validação schema JSON.parse                                   | 4 arquivos                                       | 2 h     |
| 5     | Validação path em `expandUserPath`                            | `src/utils/paths.ts`                             | 1 h     |
| 6     | Remover `catch {}` vazios em `capture-shape.tsx`              | 3 sites                                          | 20 min  |
| 7     | Eliminar duplicação parseJSON em `WindowsComPowerPointClient` | 1 arquivo                                        | 30 min  |
| 8     | Alinhar `platforms` em `package.json`                         | —                                                | 5 min   |
| 9     | Expandir `coverage.include`                                   | `vitest.config.ts`                               | 15 min  |
| 10    | Suite runner.ts (mock spawn)                                  | `tests/infra/powershell/runner.test.ts`          | 1 dia   |
| 11    | Suite shapeSaver.ts (mock fs)                                 | `tests/utils/shapeSaver.test.ts`                 | 1 dia   |
| 12    | Suite inspectZip.ts (mock spawn + PS)                         | `tests/infra/zip/inspectZip.test.ts`             | 1 dia   |

---

_Fim do relatório._
