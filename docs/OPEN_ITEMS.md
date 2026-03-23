# Open Items

Last reviewed: 2026-03-23

## P1 - Define Materials Backoffice MVP
- A dedicated materials/purchasing app is now the recommended next step.
- Scope to cover first:
  - `FATURAS`
  - `FATURAS_ITENS`
  - `MATERIAIS_CAD`
  - `AFETACOES_OBRA`
- Keep `AppSheet` for:
  - labour input
  - displacement input
- Reference plan:
  - `docs/MATERIALS_BACKOFFICE_PLAN.md`
  - `docs/MATERIALS_BACKOFFICE_SPEC.md`
- Current implementation follow-up:
  - keep validating real writes, edits, deletes, and sync retries against production-like sheets
  - latest delivered UX improvements:
    - `FATURAS_ITENS` now supports guided catalog selection, quick catalog creation, and readable impact preview
    - `AFETACOES_OBRA` now supports guided item selection with stock/cost context before save
    - `Adicionar Linha` and `AFETACOES_OBRA` now support sheet-driven `Obra` / `Fase` selectors sourced from:
      - `OBRAS.Local_ID`
      - `FASES_DE_OBRA`
    - `Sincronizacao` now shows operational status cards instead of raw JSON
    - `Sincronizacao` now shows last reload context and selected field mismatches against Google Sheets
    - the app now supports correction CRUD for:
      - `FATURAS`
      - `FATURAS_ITENS`
      - `MATERIAIS_CAD`
      - manual `AFETACOES_OBRA`
    - read-only technical view now exists for `STOCK_ATUAL` and `MATERIAIS_MOV`
    - the app can now be served operationally by FastAPI itself once `frontend/dist` is built

## P1 - Harden Materials Backoffice Runtime Hydration
- The backend now hydrates startup state from Google Sheets.
- Next step:
  - validate more edge cases from existing real rows
  - decide whether any entities should later hydrate from Supabase instead of Sheets
  - add safer diagnostics when a row loads but cannot be parsed into the runtime model
  - decide whether to expose a more explicit per-screen refresh indicator after `Recarregar do Sheets`
  - decide later whether `Fase` should remain a global list or become explicitly constrained per obra in the new app
  - keep validating cached option sources (`FORNECEDORES`, `VEICULOS`, `OBRAS/FASES`) after backend restart and manual reload

## P1 - Operationalize Materials Backoffice Access
- The app now runs in a single-URL operational mode for internal office use:
  - build `frontend/dist`
  - serve it from FastAPI
  - host FastAPI behind the `MaterialsBackoffice` Windows service
- Windows helper scripts now exist for:
  - operational run
  - build/test/update
  - service installation through `NSSM`
- Next step:
  - add minimal access control before broader office rollout
  - keep the service host/recovery steps documented for the office
  - formalize a short recovery checklist for:
    - service restart
    - frontend rebuild
    - firewall rule verification

## P1 - Validate Current Materials Costs In The Dashboard
- The legacy dashboard reader was updated to accept current materials-backoffice rows from:
  - `MATERIAIS_MOV`
- Current expectation:
  - obra-facing material cost should now include modern generated movements
  - non-obra direct destinations should stay excluded:
    - `VIATURA`
    - `ESCRITORIO`
    - `EMPRESA`
- Next step:
  - validate a few real obras where cost is now coming from the current backoffice flow
  - confirm how historical `LEGACY_MATERIAIS` and current `MATERIAIS_MOV` should coexist in the same dashboard totals
  - verify no duplicated counting appears when an obra has both old legacy rows and new movement-ledger rows

## P1 - Extend `ESCRITORIO` Beyond Invoice-Line Direct Consumption
- `ESCRITORIO` now exists in invoice-line direct consumption (`FATURAS_ITENS` -> `MATERIAIS_MOV`).
- Follow-up:
  - decide whether manual stock consumption should later support `ESCRITORIO` in `AFETACOES_OBRA` or a separate office-consumption path
  - confirm how dashboard/reporting should group office costs separately from obra/fase costs
  - validate real office-expense rows after a few business days of use

## P1 - Validate Fuel And Vehicle Operating Flow In Real Rows
- Fuel support now exists in the new backoffice with:
  - `GASOLEO`
  - `GASOLINA`
  - `Uso_Combustivel`
  - `Destino = VIATURA`
  - `Matricula` from `VEICULOS`
- Next step:
  - validate real invoice lines for:
    - `VIATURA`
    - `MAQUINA`
    - `GERADOR`
  - confirm generated `MATERIAIS_MOV` rows preserve:
    - `Uso_Combustivel`
    - `Matricula`
    - cost/tax totals
  - confirm the UI/operator model is clear when fuel is for stock vs direct use

## P1 - Keep Improving Materials Save Performance
- Save timings now show the main bottleneck is still Google Sheets write latency, especially when multiple sheets are touched in one invoice-line save.
- The latest optimization already:
  - caches headers
  - skips full-sheet reads for known `sheet_row_num`
  - auto-syncs only affected `ID_Item` rows into `STOCK_ATUAL` instead of forcing full manual rebuilds
- Next step:
  - validate before/after timings with more real office saves
  - reduce unnecessary frontend refetches after successful item save
  - decide later whether the materials flow should eventually become `Supabase-first` with manual/background sheet sync

## P1 - Validate Backend-Owned `STOCK_ATUAL`
- `STOCK_ATUAL` is now expected to stay without spreadsheet formulas and be maintained by the materials backend.
- Current tooling:
  - automatic sync on stock-affecting writes
  - `backend/scripts/rebuild_stock_atual.py` for maintenance/recovery
  - `backend/scripts/backfill_consumo_movement_totals.py` for old incomplete `CONSUMO` totals
- Next step:
  - validate real create/edit/delete flows of stock entries over a few business days
  - confirm operators do not reintroduce formulas or manual edits into `STOCK_ATUAL`
  - confirm workbook columns stay populated on real writes:
    - `Stock_Atual`
    - `Custo_Medio_Atual`
    - `Valor_Stock`
  - confirm the sheet and `Tecnico > Stock Atual` stay aligned after normal office usage

## P1 - Validate Stock Movement Lineage In Real Sheets
- The app now has safe diagnostics for:
  - seeding `MATERIAIS_REFERENCIAS` from historical `FATURAS_ITENS`
  - detecting exact duplicate or overlapping `STOCK` technical movements in `MATERIAIS_MOV`
- Next step:
  - validate recent real business rows where operators perceive duplicated `CONSUMO`
  - distinguish clearly between:
    - true duplicate technical rows
    - separate `STOCK` afetacoes in the same item/date/obra/fase context
  - decide later whether `Tecnico` should surface these as explicit overlap groups instead of a flat movement list

## P1 - Reduce GAS Trigger Sensitivity in Materials Flow
- Legacy GAS materials automation is now disabled by default so the backoffice owns the flow.
- Next technical goal:
  - keep that ownership boundary explicit and avoid silent reactivation of the old trigger path
  - validate that remaining legacy dashboard code touching materials is read-only/supportive, not operationally mutating

## P1 - Implement Monthly Payment Map
- Functional spec agreed in `docs/MAPA_MENSAL_SPEC.md`.
- Build in phases:
  - monthly backend aggregation
  - dashboard summary table
  - printable/exportable monthly PDF map
- Validate business rules carefully:
  - only workers with >= 1 valid worked hour in month
  - F/FJ/Bxa/Fer nullify same-day hours
  - Dps may coexist with hours when no falta exists
  - provisional vs closed month behavior

## P1 - Validate Worker Filtering Against Real Legacy Samples
- Run focused checks on at least 3 obras with mixed old/new rows.
- Confirm that workers with cost-only days appear correctly in:
  - Obra workers list
  - Worker counters under date filters
  - KPI consistency

## P1 - Validate Data Quality Diagnostics Against Real Sheets
- Non-blocking diagnostics are now emitted for malformed `REGISTOS_POR_DIA` rows:
  - invalid date shape
  - missing obra
  - non-numeric `Horas` / `Custo Dia`
- Next step:
  - inspect real diagnostics output on production-like sheets
  - decide whether any warning should later graduate into explicit correction or UI visibility

## P2 - Encoding Cleanup Pass
- Clean visible mojibake in UI strings/comments where present.
- Keep this as a dedicated low-risk pass to avoid mixing functional changes.

## P2 - Validate New Obra Materials Search
- Confirm search behavior with:
  - repeated material names across different phases
  - partial text matching and case variations
  - no-result state under active date filters
- Ensure performance remains smooth on large consumption histories.

## P2 - Validate New Deslocacoes UX Flow
- Validate full path on desktop/mobile:
  - top time filter controls sync with global filter state,
  - obra selector scroll + active state,
  - table rows and popup details matching selected obra.
- Confirm empty states:
  - no deslocacoes in period,
  - no rows for selected obra.

## P2 - Chart UX Guardrail Follow-up
- Current implementation already avoids doughnut on mobile for high phase counts.
- Optional next step: add explicit user hint/toast explaining why doughnut is disabled in that case.

## P3 - Documentation Process
- At end of each work session:
  - append new commit entries to `docs/WORKLOG.md`
  - update `docs/PROJECT_STATE.md` if architecture/flow changed
  - update `docs/DECISIONS.md` when a new technical decision is made
