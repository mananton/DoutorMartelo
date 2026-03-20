# Handoff Prompt (Copy/Paste for New Chat)

Last updated: 2026-03-20

## Purpose
Use this file to start a new agent session without mixing the two active tracks in this repo:

1. `legacy GAS dashboard`
2. `materials backoffice (FastAPI + React)`

Do not use a single generic prompt for all tasks.
Choose the prompt that matches the area of the repo you are working in.

## First Read Rule
Before acting on any task, read these files first:

1. `docs/DOCS_CATALOG.md`
2. `docs/PROJECT_STATE.md`
3. `docs/DECISIONS.md`
4. `docs/OPEN_ITEMS.md`
5. `docs/WORKLOG.md`

If there is any conflict:
- prefer `PROJECT_STATE`
- then `DECISIONS`
- then `OPEN_ITEMS`
- then `WORKLOG`
- treat older docs as context, not as the default implementation brief

## Quick Routing Rule

### Use the `legacy GAS dashboard` prompt when:
- the task touches `src/`
- the task is about:
  - GAS
  - `google.script.run`
  - AppSheet flow
  - dashboard rendering
  - dashboard filters/charts/sections
  - sheet readers
  - `raw_v2`
  - existing dashboard behavior

### Use the `materials backoffice` prompt when:
- the task touches `backend/`
- the task touches `frontend/`
- the task is about:
  - `FATURAS`
  - `FATURAS_ITENS`
  - `MATERIAIS_CAD`
  - `AFETACOES_OBRA`
  - `MATERIAIS_MOV`
  - `STOCK_ATUAL`
  - sync diagnostics
  - runtime hydration
  - FastAPI
  - React/Vite

### Use the `hybrid` prompt when:
- the task spans both `src/` and `backend/` / `frontend/`
- the task needs explicit boundary work between:
  - legacy GAS behavior
  - new materials-backoffice behavior

## Shared Hard Constraints
- Do NOT rename global sheet constants such as `SHEET_REGISTOS` unless explicitly asked.
- Do NOT change Supabase sync structure unless explicitly asked.
- Keep legacy data-handling rules active unless the business owner explicitly changes them.
- Work in safe, incremental phases.
- Prefer current operational docs over older reference docs.
- If the task changes architecture or operational behavior, update the relevant active docs in `docs/`.

## Prompt A - Legacy GAS Dashboard

Copy/paste this when the task is in `src/` or clearly about the current GAS dashboard.

```text
Project: Dashboard Doutor Martelo - Legacy GAS Dashboard

This repository is hybrid. For this session, focus only on the legacy GAS dashboard track unless the task explicitly requires cross-track work.

Read these files first, in order:
1) docs/DOCS_CATALOG.md
2) docs/PROJECT_STATE.md
3) docs/DECISIONS.md
4) docs/OPEN_ITEMS.md
5) docs/WORKLOG.md
6) docs/REGRAS_DE_NEGOCIO.md
7) inspect `src/` for the active legacy implementation

Scope for this session:
- legacy GAS dashboard only
- `src/` only unless the task explicitly requires another area

Hard constraints:
- Do NOT rename global sheet constants.
- Do NOT change Supabase sync structure unless explicitly asked.
- Keep legacy data handling rules active.
- Preserve compatibility with Google Apps Script, HtmlService, AppSheet, and current Google Sheets structure.
- For frontend/backend communication in the GAS dashboard, use `google.script.run`, not `fetch`.
- Do not impose React/Vite/npm architecture onto `src/`.

Working style:
- Start by locating the relevant code path in `src/`.
- Preserve the split file structure:
  - `src/index.html`
  - `src/css.html`
  - `src/js.html`
  - `src/main.gs`
  - `src/Readers.gs`
  - `src/Composer.gs`
  - `src/Aggregators.gs`
  - `src/Sync.gs`
- Make surgical edits.
- Keep trigger-sensitive logic idempotent where possible.

Current focus for this session:
[Describe the exact task here]

Expected output format:
- Findings first (if debugging/review).
- Then implementation plan in safe phases.
- Then applied changes + affected files + commit hash.
```

## Prompt B - Materials Backoffice

Copy/paste this when the task is in `backend/` / `frontend/` or about the new materials app.

```text
Project: Dashboard Doutor Martelo - Materials Backoffice

This repository is hybrid. For this session, focus on the materials backoffice track unless the task explicitly requires cross-track work.

Read these files first, in order:
1) docs/DOCS_CATALOG.md
2) docs/PROJECT_STATE.md
3) docs/DECISIONS.md
4) docs/OPEN_ITEMS.md
5) docs/WORKLOG.md
6) docs/MATERIALS_BACKOFFICE_SPEC.md
7) docs/MATERIALS_BACKOFFICE_PLAN.md
8) backend/README.md
9) inspect `backend/` and `frontend/`

Scope for this session:
- materials backoffice only
- `backend/` and/or `frontend/`

Hard constraints:
- Do NOT rename global sheet constants unless explicitly asked.
- Do NOT change Supabase sync structure unless explicitly asked.
- Keep legacy data-handling rules active where the backoffice depends on shared sheet data.
- Preserve the current operating model:
  - Google Sheets stays always populated
  - backend writes to Google Sheets first
  - backend mirrors to Supabase second
  - mirror failure must not block the main Sheets write
- Keep retry visibility and runtime diagnostics explicit.
- Do not reapply old GAS-only frontend constraints to React/Vite work.

Working style:
- Start by identifying whether the task is backend, frontend, or cross-cutting.
- Preserve the current separation of concerns:
  - `api`
  - `services`
  - `adapters/google_sheets`
  - `adapters/supabase`
  - `schemas`
- Treat `MATERIAIS_MOV` as technical/generated, not as the main manual input surface.
- Treat `FATURAS_ITENS` as purchase-line source and `AFETACOES_OBRA` as the operational attribution layer.
- Preserve hydration-from-Sheets assumptions unless the task explicitly changes them.

Current focus for this session:
[Describe the exact task here]

Expected output format:
- Findings first (if debugging/review).
- Then implementation plan in safe phases.
- Then applied changes + affected files + commit hash.
```

## Prompt C - Hybrid / Boundary Work

Copy/paste this when the task spans both tracks and the boundary itself matters.

```text
Project: Dashboard Doutor Martelo - Hybrid Boundary Session

This repository has two active tracks:
1) legacy GAS dashboard in `src/`
2) materials backoffice in `backend/` + `frontend/`

For this session, work on the boundary between them without collapsing the two architectures into one.

Read these files first, in order:
1) docs/DOCS_CATALOG.md
2) docs/PROJECT_STATE.md
3) docs/DECISIONS.md
4) docs/OPEN_ITEMS.md
5) docs/WORKLOG.md
6) docs/MATERIALS_BACKOFFICE_SPEC.md
7) docs/MATERIALS_BACKOFFICE_PLAN.md
8) docs/REGRAS_DE_NEGOCIO.md
9) inspect `src/`, `backend/`, and `frontend/` only as needed

Hard constraints:
- Do NOT rename global sheet constants unless explicitly asked.
- Do NOT change Supabase sync structure unless explicitly asked.
- Keep legacy data-handling rules active.
- Do not force GAS-only restrictions onto FastAPI/React work.
- Do not force React/backend patterns into the legacy GAS dashboard.
- Keep boundaries explicit and document any cross-track behavior change.

Working style:
- First identify which side owns each behavior:
  - legacy dashboard
  - new backoffice
  - shared sheet/sync contract
- Then make the smallest safe change that preserves that ownership.

Current focus for this session:
[Describe the exact task here]

Expected output format:
- Findings first (if debugging/review).
- Then implementation plan in safe phases.
- Then applied changes + affected files + commit hash.
```

## Optional Session Starter Checklist
- Confirm current branch and latest commit.
- Confirm `git status` and note if the worktree is already dirty.
- Confirm whether the task is:
  - `legacy GAS dashboard`
  - `materials backoffice`
  - `hybrid`
- Confirm whether the user wants commit(s) or only working-tree changes.

## Current Repo Snapshot

### Legacy GAS Dashboard Snapshot
- Main code lives in `src/`.
- The current dashboard remains active in production terms.
- Runtime flow is still:
  1. `doGet()` serves the page
  2. frontend calls `getDashboardData({ mode: 'raw_v2' })`
  3. frontend normalizes the raw payload
  4. legacy fallback remains available if needed
- Recent legacy focus areas include:
  - mobile UX improvements
  - obra charts and filters
  - deslocacoes UX alignment
  - monthly payment map
  - non-blocking diagnostics
  - legacy labour-history support

### Materials Backoffice Snapshot
- Main code lives in `backend/` and `frontend/`.
- This is the main forward path for the unstable materials workflow.
- Core materials entities in scope:
  - `FATURAS`
  - `FATURAS_ITENS`
  - `MATERIAIS_CAD`
  - `AFETACOES_OBRA`
- Technical read-only visibility exists for:
  - `STOCK_ATUAL`
  - `MATERIAIS_MOV`
- The app now supports:
  - guided item selection
  - quick catalog creation
  - impact preview before save
  - obra/fase selectors from sheets
  - correction CRUD for core materials entities
  - reload-from-sheets
  - sync diagnostics and divergence checks

## Current Materials Workflow Snapshot
- `MATERIAIS_CAD` is now the canonical catalog only:
  - `ID_Item`
  - `Item_Oficial`
  - `Natureza`
  - `Unidade`
  - `Observacoes`
  - `Estado_Cadastro`
- `MATERIAIS_REFERENCIAS` stores recognized original wording separately:
  - `ID_Referencia`
  - `Descricao_Original`
  - `ID_Item`
  - `Observacoes`
  - `Estado_Referencia`
- `FATURAS_ITENS` is the source sheet for purchase lines.
- `AFETACOES_OBRA` is the operational bridge for obra/fase attribution.
- `FATURAS` now also carries:
  - `Paga?`
  - `Data Pagamento`
- `Adicionar Linha` only enables `Obra` / `Fase` when `Destino = CONSUMO`.
- `Obra` selectors in the new app come from `OBRAS.Local_ID`.
- `Fase` selectors in the new app come from the global `FASES_DE_OBRA` list.
- `Matricula` selectors now come from `VEICULOS`.
- Fuel now has explicit handling:
  - `Natureza` includes `GASOLEO` and `GASOLINA`
  - `Unidade` includes `Lt`
  - `Uso_Combustivel` can be `N/A`, `VIATURA`, `MAQUINA`, or `GERADOR`
  - `Destino = VIATURA` requires `Matricula`
- `MATERIAIS_MOV` is expected to be auto-maintained:
  - from `FATURAS_ITENS` for stock-entry rows
  - from `AFETACOES_OBRA` for obra/fase consumption rows
- `STOCK_ATUAL` should read identity from `MATERIAIS_CAD` and stock/cost behavior from `MATERIAIS_MOV`.
- The new backoffice backend hydrates runtime state from Google Sheets on startup.
- The current sync model is Sheets-first:
  - write to Google Sheets first
  - mirror to Supabase second
  - keep pending retry visible if the mirror fails

## Current Material Automation Hotspots
- Read `src/main.gs` carefully before changing materials logic that still lives in the legacy automation layer.
- Legacy GAS material-flow automation is now disabled by default and should stay disabled unless there is an explicit decision to reactivate it.
- Functions to inspect first:
  - `processMateriaisCadRow_`
  - `hydrateFaturasItensFromFaturas_`
  - `hydrateFaturasItensFromCatalog_`
  - `hydrateMateriaisMovFromCatalog_`
  - `gerarMovimentosMateriais_`
  - `reconcileGeneratedMateriaisMovRows_`
- Generated movement rows are linked by `[SRC_FIT:FIT-xxxxxx]` in `MATERIAIS_MOV.Observacoes`.
- Consumption rows generated from `AFETACOES_OBRA` are linked by `[SRC_AFO:AFO-xxxxxx]`.
- Recent changes were made specifically to:
  - stop wiping formulas in `FATURAS_ITENS`
  - use net unit cost in movement generation
  - update generated movements when invoice lines change
  - remove generated movements when invoice lines become invalid

## Current Material Validation Tasks
- Confirm `FATURAS_ITENS` formula columns survive normal edit/paste flows.
- Confirm generated movement rows are:
  - created
  - updated
  - removed
  in sync with `FATURAS_ITENS`.
- Confirm `STOCK_ATUAL.Custo_Medio_Atual` uses movement rows that already reflect discounts.
- Confirm list pages still load existing data after backend restart via hydration from Google Sheets.
- Validate correction CRUD with real-sheet-like samples:
  - `FATURAS`
  - `FATURAS_ITENS`
  - `MATERIAIS_CAD`
  - manual `AFETACOES_OBRA`
- Validate sync diagnostics and selected field mismatches against current Google Sheets rows.

## Current Legacy Validation Reminders
- Validate desktop and mobile behavior.
- Recheck dashboard boot when touching shared payload logic.
- Recheck date filters and worker counting when touching legacy data normalization.
- Recheck assiduidade / dispensado behavior if any shared sheet parsing changes.
