# REGRESSION_BASELINE.md

**Data:** 2026-04-21
**Objetivo:** Snapshot do comportamento esperado dos fluxos principais da extensão antes do início da Fase 1 do `FIX_PLAN.md`.
**Escopo de plataforma:** Windows apenas. macOS (`MacPowerPointClient`, scripts AppleScript, paths Unix) está **fora de escopo** nesta rodada do plano e fica registrado como pendência.

---

## 1. Escopo e premissas

| Item            | Valor                                                               |
| --------------- | ------------------------------------------------------------------- |
| Plataforma alvo | Windows 10/11 x64                                                   |
| PowerPoint      | 2019 ou 365 Desktop (COM habilitado)                                |
| Node            | >= 22.14.0                                                          |
| npm             | >= 7                                                                |
| Raycast         | >= 1.102.7                                                          |
| Extensão        | `shapes-library` 2.0.1                                              |
| macOS           | **PENDENTE** — todo cenário macOS ignorado nesta fase (ver seção 6) |

Os cenários abaixo precisam ser executados manualmente pelo usuário no ambiente Windows real após cada fase (F1 → F2 → F3 → ...) antes de promover o merge.

---

## 2. Preparo do ambiente (antes de cada rodada de smoke)

1. `npm install`
2. `npm run build` → deve finalizar sem erro.
3. `npm run test:strict` → todos os testes verdes, coverage >= threshold da fase (F0: 30%).
4. Abrir o PowerPoint Desktop e deixar ao menos uma apresentação aberta com um shape selecionável.
5. Library path: usar o padrão (Raycast supportPath). Para cenário de path customizado, definir em Preferences antes de iniciar.

---

## 3. Cenários de smoke (Windows)

Cada cenário tem um resultado esperado. Se qualquer passo falhar ou divergir do esperado, **a fase em andamento é bloqueada**.

### 3.1 Capture shape (fluxo feliz)

1. PowerPoint aberto com 1 shape simples selecionado (retângulo).
2. Executar comando Raycast **Capture Shape from PowerPoint**.
3. Esperado:
   - Preview SVG renderiza no form.
   - Campos `Name`, `Category`, `Tags` preenchíveis.
   - Ao salvar, shape aparece em **Search Shapes** na categoria escolhida.
   - `categories.json` e o JSON do shape existem em `libraryPath`.
   - Arquivo `.pptx` nativo existe (`native/<id>.pptx`) se `skipNativeSave=false`.

### 3.2 Capture com `autoSaveAfterCapture=true`

1. Marcar preferência.
2. Selecionar shape e rodar comando.
3. Esperado: shape salvo automaticamente sem exibir o form.

### 3.3 Capture com PowerPoint fechado

1. Fechar completamente o PowerPoint.
2. Executar **Capture Shape from PowerPoint**.
3. Esperado: toast/erro amigável ("PowerPoint must be running" ou equivalente). Nenhum crash, nenhum stack trace na UI.
   - **Gap conhecido F3.9** — hoje a mensagem pode ser obscura.

### 3.4 Search Shapes (navegação e insert)

1. Executar **Search Shapes**.
2. Esperado:
   - Grid lista categorias cadastradas com contagem correta.
   - Filtro por texto funciona (nome e tags).
   - Ação **Insert into Slide** insere a shape no slide ativo preservando fidelidade (quando `forceExactShapes` habilitado e PPTX nativo presente).
   - Ação **Copy to Clipboard** copia a shape no formato PPTX.

### 3.5 Editar shape existente

1. Em **Search Shapes**, abrir item → **Edit**.
2. Alterar nome, categoria, tags.
3. Esperado:
   - Arquivo JSON renomeado/movido corretamente.
   - Preview e `.pptx` nativo movidos junto.
   - Nenhum resquício da categoria antiga.
   - **Gap conhecido F3.11** — rollback em falha intermediária ainda não é transacional.

### 3.6 Deletar shape

1. Em **Search Shapes**, excluir um item.
2. Esperado: remoção de `.json`, preview e `.pptx` nativo; grid atualiza.

### 3.7 Manage Categories

1. Executar **Manage Categories**.
2. Criar categoria (ID válido `[a-z0-9-]`).
3. Renomear categoria.
4. Excluir categoria vazia.
5. Tentar excluir categoria com shapes → bloqueado com mensagem clara.
6. Esperado: todas as mudanças persistidas em `categories.json`.

### 3.8 Exportar library (ZIP)

1. Em **Search Shapes**, ação **Export Library as ZIP**.
2. Escolher destino (Downloads por padrão).
3. Esperado: ZIP criado com `shapes/`, `previews/`, `native/`, `categories.json`.
4. Abrir o ZIP externamente e verificar que não há paths absolutos do usuário logado (ver F5.14 / redact).

### 3.9 Importar library (ZIP)

1. ZIP do cenário 3.8 + ZIP "legado" (shapes antigos) caso disponível.
2. Ação **Import Library from ZIP**.
3. Esperado:
   - Conteúdo restaurado em `libraryPath`.
   - Sem overwrite silencioso (hoje usa `-o`; Fase F2.3 troca para `-n` com alerta).
   - ZIPs maliciosos (zip-slip) bloqueados por `zipSafety.ts` — manter fixture em `tests/fixtures/zip-inspect/zip-slip.txt`.

### 3.10 Path seguro

1. Definir `libraryPath` como `C:\Users\<user>\Documents\ShapesLibrary` (via picker do Raycast).
2. Executar `Search Shapes`.
3. Esperado: funciona normalmente.
4. Tentar definir `libraryPath` como `..\..\..\Windows\System32` ou `C:\Windows\System32`.
5. **Vetor UI bloqueado na origem**: a preference é `"type": "directory"` (`package.json`),
   logo o Raycast abre o picker nativo de pasta, que não aceita string digitada nem
   permite navegar para `C:\Windows\System32`. Não há como injetar um caminho fora do
   sandbox pela UI hoje.
6. **Defense-in-depth (F2.1)**: caso uma versão futura da preference passe a aceitar
   texto livre, ou um caminho malicioso seja injetado por outra rota (export/import,
   API), `getLibraryRoot()` aborta com `Library path out of sandbox: <path>` antes de
   qualquer escrita. Coberto por `tests/utils/paths.test.ts > sandbox` (5 casos:
   absoluto fora rejeita, `..` traversal rejeita, absoluto dentro aceita, supportPath
   aceita, homedir aceita).

---

## 4. Asserções de integridade por fase

Antes de fechar cada fase, rodar em sequência:

| Comando                                | Critério                           |
| -------------------------------------- | ---------------------------------- |
| `npm run lint`                         | zero warnings/errors               |
| `npm run typecheck` (= `tsc --noEmit`) | zero errors                        |
| `npm run test:strict`                  | 100% verde + coverage >= threshold |
| `npm run build`                        | build `dist/` gerado sem erro      |
| Smoke 3.1 a 3.10                       | todos no estado esperado           |

Qualquer divergência não planejada vira item no PR da fase corrente.

---

## 5. Artefatos a capturar a cada rodada

- Log textual do `npm run test:strict` → colar no PR.
- Output do `npm run build` → confirmar ausência de warnings novos.
- Screenshot (ou nota descritiva) dos cenários 3.1, 3.4, 3.8 e 3.9.
- Tamanho do `dist/` (regressão de bundle) — salvar em `docs/regression/bundle-<fase>.txt`.

---

## 6. Pendências de macOS (registradas, não executadas)

Itens do plano que envolvem macOS não serão testados nem alterados nesta rodada:

- **F1.3** — AppleScript via `execFile` (`MacPowerPointClient.ts`).
- **F5.13** — decisão sobre remover `MacPowerPointClient.ts` ou atualizar `package.json` para `"platforms": ["Windows", "macOS"]`.
- Qualquer smoke em macOS (cenários 3.1–3.10 rodando com PowerPoint for Mac).

Esses itens ficam rastreados como **macOS-deferred** e devem ser retomados em rodada dedicada quando houver máquina de teste.

---

## 7. Processo de atualização deste arquivo

- A cada fase concluída, acrescentar uma linha em `## 8. Log de execuções` abaixo.
- Nunca remover entradas; o documento serve como histórico auditável.

---

## 8. Log de execuções

| Data       | Fase | Resultado | Observações                                                                 |
| ---------- | ---- | --------- | --------------------------------------------------------------------------- |
| 2026-04-21 | F0   | PENDING   | Baseline criado; aguarda execução de smoke inicial em Windows pelo usuário. |
