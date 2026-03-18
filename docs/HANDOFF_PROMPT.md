# Handoff Prompt (Copy/Paste for New Chat)

Use this prompt when starting a new agent session:

```text
Project: GAS Construction Dashboard

Please read these files first, in order:
1) docs/PROJECT_STATE.md
2) docs/DECISIONS.md
3) docs/WORKLOG.md
4) docs/OPEN_ITEMS.md
5) docs/REGRAS_DE_NEGOCIO.md
6) docs/MATERIALS_BACKOFFICE_SPEC.md
7) inspect `backend/` and `frontend/` if the session relates to the new materials backoffice

Hard constraints:
- Do NOT rename global constants (SHEET_REGISTOS, etc.).
- Do NOT change Supabase sync structure unless explicitly asked.
- Keep legacy data handling rules active.
- Work in safe, incremental phases and commit each phase.

Current focus for this session:
[Describe the exact task here]

Expected output format:
- Findings first (if debugging/review).
- Then implementation plan in safe phases.
- Then applied changes + affected files + commit hash.
```

## Optional Session Starter Checklist
- Confirm current branch and latest commit.
- Confirm `git status` is clean before starting.
- Confirm if user wants commit at each phase or single final commit.

## Recent High-Value Commits
- `7ab59ac`: mobile-first Obra chart updates + phase visibility filters + click side-effect removal.
- `76e5253`: worker filtering includes cost-only legacy days.
- `b725a8d`: Obra phase chart metric/type controls.
- `299536d`: collapsible Workers/Materials sections.

## Current UI Focus Snapshot
- Obra buttons are now filter-aware (only obras with data in active period are shown).
- Deslocacoes page is transitioning to Obra-like flow: period controls -> KPIs -> obra selector -> register table.
- Verify empty-state handling before deploy (`Sem obras...`, `Sem deslocacoes...`).

## Current Material Workflow Snapshot
- Spreadsheet model changed recently and is important:
  - `MATERIAIS_CAD` is now a single working sheet with:
    - `ID_Item`
    - `Fornecedor`
    - `Descricao_Original`
    - `Item_Oficial`
    - `Natureza`
    - `Unidade`
    - `Observacoes`
    - `Estado_Cadastro`
  - `MATERIAIS_ALIAS` was removed from the workbook.
- `FATURAS_ITENS` is now the source sheet for purchase lines.
- `AFETACOES_OBRA` is now the operational bridge for obra/fase attribution.
- `MATERIAIS_MOV` is expected to be auto-maintained:
  - from `FATURAS_ITENS` for stock-entry rows
  - from `AFETACOES_OBRA` for obra/fase consumption rows
- `STOCK_ATUAL` should read its identity fields from `MATERIAIS_CAD` and its stock/cost behavior from `MATERIAIS_MOV`.
- The new materials backoffice backend now hydrates its startup runtime state from Google Sheets for the materials core entities.
- The new materials backoffice sync is currently Sheets-first:
  - write to Google Sheets first
  - mirror to Supabase second
  - keep pending-retry visibility in the app if the mirror fails
- `FATURAS_ITENS` now includes:
  - guided catalog suggestions
  - quick catalog creation inside the invoice-line flow
  - readable impact preview before save
- `AFETACOES_OBRA` now includes:
  - guided `ID_Item` selection
  - stock snapshot and average-cost context before save
  - clearer stock-cost error feedback
- `Sincronizacao` now exposes card-based operational status instead of raw JSON

## Current Material Automation Hotspots
- Read `src/main.gs` carefully before changing materials logic.
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
  - stop wiping formulas in `FATURAS_ITENS`,
  - use net unit cost in movement generation,
  - update generated movements when invoice lines change,
  - remove generated movements when invoice lines become invalid.

## Current Material Validation Tasks
- Confirm `FATURAS_ITENS` formula columns survive normal edit/paste flows.
- Confirm generated movement rows are:
  - created,
  - updated,
  - removed
  in sync with `FATURAS_ITENS`.
- Confirm `STOCK_ATUAL.Custo_Medio_Atual` uses movement rows that already reflect discounts.
- If the new materials backoffice restarts, confirm list pages still load existing data from Google Sheets hydration.
