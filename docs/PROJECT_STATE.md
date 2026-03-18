# Project State

Last updated: 2026-03-18

## 1. Product Scope
- Google Apps Script web app for construction management dashboard.
- Data source: Google Sheets (central workbook).
- Frontend renders KPIs, obra detail, workers, materials, travel/displacements, attendance, vacations, and comparative analytics.

## 2. Current Architecture
- Backend split by responsibility:
  - `src/main.gs`: web app entrypoints and orchestration (`include`, `doGet`, `getDashboardData`), triggers, operational helpers.
  - `src/Readers.gs`: sheet readers, header normalization, dynamic column mapping, legacy-safe parsing.
  - `src/Composer.gs`: raw payload assembly (`buildRawData_`).
  - `src/Aggregators.gs`: legacy server-side aggregation (`buildData_`).
  - `src/Sync.gs`: Supabase sync boundary.
- Frontend split by concern:
  - `src/index.html`: structure/markup.
  - `src/css.html`: styles.
  - `src/js.html`: client logic, rendering, charting, filtering.
- New migration scaffolding now exists in parallel:
  - `backend/`: FastAPI materials backoffice + sync target skeleton
  - `frontend/`: React + Vite materials backoffice skeleton
- HTML includes:
  - `<?!= include('css'); ?>` in `<head>`
  - `<?!= include('js'); ?>` before `</body>`

## 3. Runtime Data Flow
1. `doGet()` serves `index`.
2. Frontend calls `getDashboardData({ mode: 'raw_v2' })`.
3. Backend returns raw payload (`buildRawData_`) with non-blocking data-quality diagnostics metadata.
4. Frontend normalizes via `buildDashboardFromRaw_`.
5. If parsing/loading fails, frontend retries with `mode: 'legacy'`.

## 4. Legacy Data Rules (Implemented)
- Keep costs even when old rows are incomplete.
- Cost source priority:
  - Prefer `Custo Dia` when present.
  - If `Horas * EUR/h` differs from `Custo Dia`, keep `Custo Dia`.
- Multi-name cells are treated as one worker row (no split).
- Empty `Funcao` defaults to `-`.
- Empty `Fase` defaults to `Sem Fase`.
- Date fallback: invalid/empty `DATA_REGISTO` uses `DATA_ARQUIVO`.
- Missing/invalid `Falta` treated as `false`.
- Missing `Obra` rows are ignored.
- Missing `Horas` does not infer hours from cost (`horas_total` remains numeric sum of valid hour values).

## 5. UI State (Recent)
- Obra "Cost by phase" chart now supports:
  - Metric selector: Labor / Materials / Total.
  - Chart type selector: Bar / Doughnut.
- Obra chart mobile-first improvements:
  - Period label aligned with active date filter.
  - Optional phase visibility toggles ("strike/hide") with instant chart recompute.
  - Auto-avoid doughnut mode on mobile when phase count is high.
- Chart click no longer auto-expands Workers/Materials sections (removed accidental drill side-effect).
- Materiais section now supports name search (`Pesquisar material...`) while preserving phase grouping.
- Workers table filtering updated to include legacy "cost-only" days in time-window filtering.
- Obra list buttons now:
  - use period-button visual style (slightly larger touch targets),
  - show only obras that have data in the currently active date filter.
- Obra detail now supports explicit "no data" state when no obra matches the active period filter.
- Deslocacoes section was restructured to match Obra interaction flow:
  - top time filter controls,
  - KPI cards,
  - vertical obra selector,
  - full register table driven only by the selected obra + active period.

## 6. Operational Notes
- `ENABLE_EMPTY_ROW_CLEANUP` is currently `true` in `src/main.gs`.
- `.clasp.json` uses `rootDir: "src"` and manifest must exist at `src/appsscript.json`.
- `raw_v2` now emits diagnostics metadata for malformed `REGISTOS_POR_DIA` rows (invalid date shape, missing obra, invalid numeric fields) without changing existing behavior.
- `LEGACY_MAO_OBRA` is now treated as old labour-history input for costs/hours only:
  - included in overview, obra detail, and comparative cost/phase charts,
  - excluded from worker/team/attendance/monthly worker views.
- A parallel spreadsheet redesign is now defined for materials/cost control:
  - `MATERIAIS_CAD` stays as the official item catalog,
  - `FATURAS_ITENS` stays as invoice-line detail,
  - `MATERIAIS_MOV` stays as movement ledger,
  - `LEGACY_MATERIAIS` is reserved for old material cost history only.
- Supabase sync now keeps immediate send as the first attempt and stores failed sheets for automatic retry every 10 minutes (up to 6 retries).
- `LEGACY_MAO_OBRA` is now also included in the active Supabase sync flow via `src/Sync.gs`.
- Keep global sheet constant names unchanged (`SHEET_REGISTOS`, etc.).
- Do not alter Supabase sync structure unless explicitly requested.
- Materials flow has changed in the spreadsheet model:
  - `MATERIAIS_CAD` is now a single working sheet with both identity and supplier wording:
    - `ID_Item`
    - `Fornecedor`
    - `Descricao_Original`
    - `Item_Oficial`
    - `Natureza`
    - `Unidade`
    - `Observacoes`
    - `Estado_Cadastro`
  - `MATERIAIS_ALIAS` no longer exists in the workbook and code should not depend on it.
  - `Natureza` current dropdown values:
    - `MATERIAL`
    - `SERVICO`
    - `ALUGUER`
    - `TRANSPORTE`
  - `ID_Item` is now generated in GAS from `Natureza`, not by the generic ID helper path.
- `FATURAS_ITENS` current operating model:
  - Manual starting point:
    - `ID_Fatura`
    - `Descricao_Original`
    - quantity/cost/discount/IVA/destination/obra/fase as needed
  - Automatic fill:
    - from `FATURAS`: supplier, NIF, invoice doc, invoice date
    - from `MATERIAIS_CAD`: `ID_Item`, `Item_Oficial`, `Unidade`
    - `Sugestao_Alias` is now only used when the item is not found in catalog
  - Important implementation detail:
    - GAS was updated to avoid rewriting the full row because that wiped user formulas in total columns
- `MATERIAIS_MOV` current intended use:
  - technical ledger only; it should no longer be treated as the main operational input sheet
  - auto-generated for purchase-driven `STOCK` entries coming from `FATURAS_ITENS`
  - auto-generated for `CONSUMO` entries coming from `AFETACOES_OBRA`
  - generated rows are linked back to source sheets via `[SRC_FIT:FIT-xxxxxx]` and `[SRC_AFO:AFO-xxxxxx]` in `Observacoes`
  - generated rows should now be created, updated, and removed automatically from source-sheet edits
- `AFETACOES_OBRA` current intended use:
  - operational sheet for cost attribution to `Obra` + `Fase`
  - direct purchases registered in `FATURAS_ITENS` with direct consumption should auto-create generated rows here
  - manual rows here should be used for later stock consumption into works/phases
  - manual stock-consumption rows should snapshot `STOCK_ATUAL.Custo_Medio_Atual` into `Custo_Unit` at registration time
- Current material rules by `Natureza`:
  - `MATERIAL` can go to `STOCK` or direct `CONSUMO`
  - `SERVICO`, `ALUGUER`, and `TRANSPORTE` should be direct-to-work only and must not affect `STOCK_ATUAL`
- `STOCK_ATUAL` current expectation:
  - should depend on `MATERIAIS_MOV`, not `FATURAS_ITENS`, for stock quantities and average-cost logic
  - `Item_Oficial` and `Unidade` should be read from `MATERIAIS_CAD`
  - `Custo_Medio_Atual` should use net movement cost (discount-aware)
- Future input-channel direction now defined:
  - keep `AppSheet` for labour and displacement flows in the short term
  - plan a dedicated materials/purchasing app for:
    - `FATURAS`
    - `FATURAS_ITENS`
    - `MATERIAIS_CAD`
    - `AFETACOES_OBRA`
  - preferred architecture is app -> backend -> Google Sheets + Supabase, not app -> Sheets triggers only
  - detailed plan is tracked in `docs/MATERIALS_BACKOFFICE_PLAN.md`
  - first operational MVP spec is now tracked in `docs/MATERIALS_BACKOFFICE_SPEC.md`
- Fase 0 implementation progress:
  - `src/Sync.gs` now includes sync entries for `FATURAS_ITENS` and `AFETACOES_OBRA`
  - `MATERIAIS_CAD` and `STOCK_ATUAL` sync mappers were aligned to the current spreadsheet model
  - FastAPI sync endpoints now exist under `backend/app/api/routers/sync.py`
  - real Google Sheets and Supabase adapters are now wired and validated against the live environment
  - `backend/scripts/check_integrations.py` validates:
    - Google Sheets auth + target workbook access
    - required core sheets
    - Supabase auth + required core tables
  - Supabase schema alignment for the materials backoffice is currently represented by:
    - `backend/sql/001_materials_backoffice.sql`
    - `backend/sql/002_align_materials_backoffice_schema.sql`
  - the materials backoffice backend now hydrates runtime state from Google Sheets on startup for:
    - `FATURAS`
    - `FATURAS_ITENS`
    - `MATERIAIS_CAD`
    - `AFETACOES_OBRA`
    - `MATERIAIS_MOV`
  - list pages in the new app no longer start empty after backend restart
  - manual `AFETACOES_OBRA` stock rows are now processed on save in the new app; the temporary UI checkbox/process button was removed
  - the new app now exposes a manual `Recarregar do Sheets` action instead of forcing backend restart when operators need to rehydrate runtime state from Google Sheets
  - `Sincronizacao` now shows the core entity jobs even before any sync attempt happens in the current backend session
  - `FATURAS_ITENS` now has guided item selection from catalog, quick-create of catalog items, and a readable impact preview before save
  - `AFETACOES_OBRA` now has guided `ID_Item` lookup, live stock snapshot lookup, and clearer business-error messaging for stock-cost issues
  - the app now includes a read-only technical view for:
    - `STOCK_ATUAL`
    - `MATERIAIS_MOV`
  - `Sincronizacao` now includes a manual divergence diagnostic comparing runtime IDs vs current Google Sheets IDs for the core material entities
  - the materials backoffice now exposes sheet-driven work selectors through `/api/options/obras-fases`
  - `Obra` options now come from `OBRAS.Local_ID`
  - `Fase` options now come from the global `FASES_DE_OBRA` list
  - `Adicionar Linha` and `AFETACOES_OBRA` now show guided selectors for `Obra` / `Fase`
  - `Adicionar Linha` only enables `Obra` / `Fase` when `Destino = CONSUMO`, keeping `STOCK` rows free of unnecessary obra/fase attribution

## 7. Current Risks / Watchpoints
- Some source comments/UI labels still show encoding artifacts in parts of the codebase (non-blocking but noisy).
- Legacy rows with inconsistent naming can still reduce per-worker detail accuracy.
- Material naming variance can still fragment search results (e.g., synonyms/typos).
- `LEGACY_MATERIAIS` exists as a spreadsheet structure decision only; it is not yet wired into dashboard code or Supabase sync.
- Current material automation is mid-rollout and should be treated as active but still under validation on real spreadsheet edits.
- The new materials backoffice still uses Google Sheets as the operational source of truth; startup hydration currently comes from Sheets, not from Supabase.
- Manual changes made directly in Google Sheets after backend startup still require explicit reload to appear in the app runtime state.
- Watch for Apps Script trigger behavior differences between:
  - manual cell edit,
  - pasted ranges,
  - row deletions,
  - formula recalculation.
- If materials behavior looks inconsistent, inspect `src/main.gs` first:
  - `processMateriaisCadRow_`
  - `hydrateFaturasItensFromFaturas_`
  - `hydrateFaturasItensFromCatalog_`
  - `gerarMovimentosMateriais_`
  - `reconcileGeneratedMateriaisMovRows_`
