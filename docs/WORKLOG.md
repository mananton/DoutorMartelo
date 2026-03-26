# Worklog

Purpose: chronological, commit-based project history for fast handoff.

## Logging Rules
- Each entry must include date, summary, and commit hash.
- Keep technical facts explicit and short.
- Do not store clasp deploy/version actions here (managed separately).

---

## 2026-03-26

### `pending`
- **Type**: feat / ops / sync / docs
- **Scope**: `backend/scripts/sync_sheets_to_supabase.py`, `backend/ops/Sync-SheetsToSupabase.ps1`, `backend/sql/008_create_operational_sync_tables.sql`, `backend/sql/009_align_manual_sync_schema.sql`, `src/Sync.gs`, `src/main.gs`, `backend/app/*`, docs
- **Summary**:
  - Added a local manual Google Sheets -> Supabase mirror path that runs directly from this workstation, without Railway.
  - Added the SQL support required for the operational mirror tables and for aligning the remote schema with the current workbook payloads.
  - Extended the manual sync to behave like a true mirror:
    - dedupe repeated IDs from the workbook snapshot
    - skip orphan catalog references without blocking the whole run
    - delete stale rows that no longer exist in the Google Sheet
  - Disabled the old GAS-driven Supabase sync path and removed the custom Sheet menus used for those shortcuts.
  - Disabled automatic Supabase mirror writes from the materials backoffice by default so Supabase refresh is now explicit and manual.
- **Impact**:
  - The supported Supabase sync flow is now the local script only.
  - Normal Sheet edits and normal backoffice saves no longer push to Supabase in the background.
  - Operators can dry-run and apply the mirror on demand from a single trusted workstation.

## 2026-03-25

### `pending`
- **Type**: fix / gas / ops / docs
- **Scope**: `src/main.gs`, `docs/DECISIONS.md`, `docs/REGRAS_DE_NEGOCIO.md`
- **Summary**:
  - Added a dedicated operational change trigger path (`onOperationalSheetChange`) to restore labour housekeeping on `INSERT_ROW` / `REMOVE_ROW` without re-enabling legacy materials automation.
  - Scoped that handler to empty-row cleanup, labour cost correction, and `dispensado` processing only, with a lightweight execution guard to avoid overlap on bursty events.
  - Kept legacy `onSheetChange` materials behavior untouched and documented the new separation explicitly.
- **Impact**:
  - `REGISTOS_POR_DIA` housekeeping can be reactivated safely for the labour/AppSheet flow.
  - The materials backoffice remains isolated from old GAS trigger-driven rewrites.

### `pending`
- **Type**: feat / dashboard
- **Scope**: `src/index.html`, `src/js.html`, `docs/REGRAS_DE_NEGOCIO.md`
- **Summary**:
  - Added a fourth `Comparativa` chart focused on phase-level cost aggregation across all obras together.
  - Matched the existing comparative-card pattern with top metric buttons, a central bar chart, and bottom chips for phase visibility.
  - Supported combinable `Mao de Obra` / `Materiais/Servicos` selections plus exclusive `Total`, using the same date-filtered aggregation model already used by the other comparative charts.
- **Impact**:
  - The dashboard can now compare labour and materials/services cost concentration by phase without splitting the view by obra.
  - Users can quickly isolate or hide phases while keeping the same interaction model already learned in the other comparative charts.

### `0adc969`
- **Type**: fix / dashboard / docs
- **Scope**: `src/index.html`, `src/css.html`, `src/js.html`, `docs/MAPA_MENSAL_SPEC.md`, `docs/MAPA_MENSAL_TECH_PLAN.md`
- **Summary**:
  - Aligned `Mapa Mensal` monthly totals with payroll-effective hours by subtracting daily delay minutes from valid minutes, capped at zero per day.
  - Updated dashboard and print/PDF summaries to show liquid `Total Horas` and compact `Dias` labels, removed the `Dsp` summary column, and corrected `F` vs `FJ` absence mapping including `JS`.
  - Refined the print/PDF table styling after validation feedback, moving the outer border to the printed table and tuning the internal grid lines for clearer reading on white background.
- **Impact**:
  - The monthly map now reflects the same effective-hour logic used by cost calculation while keeping delay totals visible for audit.
  - Payroll printouts are easier to validate thanks to clearer totals, corrected absence buckets, and a more legible printed grid.

## 2026-03-24

### `pending`
- **Type**: feat / dashboard
- **Scope**: `src/index.html`, `src/css.html`, `src/js.html`
- **Summary**:
  - Added new "Contabilidade" section for global cost visualization.
  - Implemented 5 universal KPIs (Total, Mão de Obra, Deslocações, Materiais / Serv., IVA Dedutível) sensitive to the global date filter.
  - Added "Despesas por Categoria" doughnut chart and "Evolução Diária / Mensal" stacked bar chart.
  - Added daily delay indicator in `Mapa Mensal` print/PDF view for days with recorded hours.
  - Unified legacy and current labor data into the "Mão de Obra" metric in the new Contabilidade section.
  - Improved date range filtering (`dateInRange`) to safely parse datetime strings without failing strict ISO match. 
- **Impact**:
  - The dashboard now provides a comprehensive financial overview of the entire operation, dynamically filterable by time.
  - Printing the `Mapa Mensal` now shows delays per day alongside recorded hours, useful for payroll accounting.

## 2026-03-23

### `pending`
- **Type**: feat / ui / sync
- **Scope**: `backend/app/*`, `backend/sql/*`, `backend/tests/*`, `frontend/src/*`
- **Summary**:
  - Promoted `COMPROMISSOS_OBRA` to a first-class materials-backoffice entity with:
    - runtime hydration
    - Google Sheets parser/serializer support
    - Supabase table mapping
    - sync diagnostics and retry visibility
    - CRUD API routes
  - Kept the existing `FATURAS.ID_Compromisso` groundwork and made it operational by:
    - exposing it in the `Faturas` UI
    - validating it against existing compromissos
    - blocking compromisso deletion while referenced by invoices
  - Reworked the `Faturas` workspace into a mixed document queue:
    - `Fatura` keeps the current invoice-detail flow
    - `Compromisso` uses a header-only workflow in the same page
    - `Nota de Crédito` is shown but intentionally blocked for a later phase
- **Impact**:
  - The backoffice now separates:
    - assumed obra cost in `COMPROMISSOS_OBRA`
    - later liquidation/payment documents in `FATURAS`
  - Operators can manage compromisso headers without losing the current invoice-line workflow.

### `28d9dbc`
- **Type**: fix
- **Scope**: `backend/app/*`, `backend/tests/*`
- **Summary**:
  - Fixed the `STOCK_ATUAL` sheet serializer so it writes the workbook-aligned header `Stock_Atual` instead of relying only on `Stock Atual`.
  - Added backend-calculated `Valor_Stock` to the stock snapshot model, sheet serializer/parser, and API responses.
  - Added focused tests to cover:
    - workbook header compatibility for `STOCK_ATUAL`
    - `Valor_Stock` population in snapshot rebuild and auto-sync flows
- **Impact**:
  - `STOCK_ATUAL` rows written by the backend now populate:
    - `Stock_Atual`
    - `Custo_Medio_Atual`
    - `Valor_Stock`
  - The operational sheet now aligns better with the workbook layout after removing formula-based population.

### `6abbe61`
- **Type**: feat / dashboard
- **Scope**: `src/Readers.gs`, `src/Composer.gs`, `src/Aggregators.gs`, `src/js.html`
- **Summary**:
  - Updated the legacy dashboard materials read path to accept current backoffice `MATERIAIS_MOV` rows.
  - Added support for:
    - `Item_Oficial` when older `Material` naming is absent
    - current generated movement cost fields
    - exclusion of non-obra direct destinations such as `VIATURA`, `ESCRITORIO`, and `EMPRESA`
- **Impact**:
  - Dashboard material cost can now reflect modern materials-backoffice movements instead of depending only on `LEGACY_MATERIAIS`.

### `d19bc74`
- **Type**: feat / fix / ops
- **Scope**: `backend/app/*`, `backend/scripts/*`, `backend/tests/*`, `frontend/src/*`
- **Summary**:
  - Added direct `EMPRESA` destination support in invoice-line entry as non-stock company consumption.
  - Added `Ton` as an accepted unit in invoice-detail entry.
  - Added safe backfill tooling for old `CONSUMO` rows missing:
    - `Custo_Total Sem IVA`
    - `IVA`
    - `Custo_Total Com IVA`
  - Added `STOCK_ATUAL` maintenance tooling and backend-owned parser/serializer support.
  - Added automatic `STOCK_ATUAL` sync for stock-affecting writes so the sheet no longer depends on formulas or manual rebuilds in normal operation.
- **Impact**:
  - `STOCK_ATUAL` is now expected to be maintained by the backend, not by spreadsheet formulas.
  - Old incomplete `CONSUMO` movements can be repaired safely without inventing unrelated values.
  - Direct company consumption can now be registered in the same operational flow as other invoice lines.

### `f10c3fa`
- **Type**: feat / performance / ui
- **Scope**: `backend/app/*`, `backend/tests/*`, `frontend/src/*`
- **Summary**:
  - Added direct `ESCRITORIO` destination support in the materials backoffice invoice-line workflow.
  - Kept `ESCRITORIO` as direct non-stock consumption:
    - generates `MATERIAIS_MOV`
    - does not generate `AFETACOES_OBRA`
    - does not affect `STOCK_ATUAL`
  - Added timing instrumentation for invoice-line saves across:
    - Google Sheets writes
    - Supabase mirror
    - total request duration
  - Optimized Google Sheets live upserts by:
    - caching headers
    - reusing `sheet_row_num`
    - avoiding full-sheet reads on known-row updates
  - Improved invoice-detail UX:
    - launched-line totals are visible in the history card header
    - `Custo Total com IVA` can now be edited without losing decimal input mid-typing
- **Impact**:
  - Office-expense rows can now be registered directly in the materials backoffice without polluting stock logic.
  - Operators have better visibility into launched-line totals inside invoice details.
  - Save latency diagnosis is now evidence-based, and known-row writes should be faster under the current `Sheets-first` model.

### `552d7e7`
- **Type**: feat / operations
- **Scope**: `backend/app/*`, `frontend/src/*`, `backend/ops/*`, `backend/tests/*`
- **Summary**:
  - Finalized same-origin operational serving so a colleague can open the materials backoffice through the host machine URL instead of `vite dev`.
  - Added Windows operation scripts for:
    - service installation
    - safe update/build/test
    - operational backend launch
  - Fixed stock interpretation so direct `SERVICO`, `ALUGUER`, `TRANSPORTE`, and fuel for `VIATURA` do not pollute `STOCK_ATUAL`.
  - Changed `FATURAS` listing to show the most recently created invoices first.
  - Hardened the service installer to reject Microsoft Store / `WindowsApps` Python for Windows service use.
- **Impact**:
  - The materials backoffice is now usable on the internal LAN through a Windows service on a stable machine.
  - Day-to-day operation no longer depends on a manually kept backend terminal plus Vite dev server.
  - Technical stock views now align better with the business meaning of direct-service and vehicle-fuel expenses.

## 2026-03-10

## 2026-03-13

### `6db46a3`
- **Type**: feat
- **Scope**: `src/Sync.gs`
- **Summary**:
  - Added Supabase sync support for the `LEGACY_MAO_OBRA` sheet.
  - Introduced a stable `source_key` so old labour-history rows can be resent without creating duplicate identities.
- **Impact**:
  - Old labour-history data can now be stored in Supabase separately from operational worker records.

### `375217b`
- **Type**: feat
- **Scope**: `src/main.gs`, `src/Composer.gs`, `src/Readers.gs`, `src/Aggregators.gs`, `src/js.html`
- **Summary**:
  - Added support for `LEGACY_MAO_OBRA` as a separate source of old labour history.
  - Included legacy labour cost/hours in overview, obra detail, and comparative charts.
  - Kept legacy labour rows out of team and attendance logic.
- **Impact**:
  - Old manually imported labour history now contributes to business cost totals without corrupting worker-level views.

### `pending`
- **Type**: fix
- **Scope**: `src/main.gs`, `src/Composer.gs`, `src/Readers.gs`, `src/index.html`, `src/css.html`, `src/js.html`, `docs/*`
- **Summary**:
  - Aligned monthly-map docs with the feature already implemented in the dashboard.
  - Added non-blocking data diagnostics for malformed `REGISTOS_POR_DIA` rows in `raw_v2`.
  - Moved diagnostics out of the main overview into a dedicated `Dev` area for internal use.
  - Re-enabled automatic empty-row cleanup via config flag.
- **Impact**:
  - Internal data issues can be inspected without exposing warnings to client-facing users.
  - Operational sheet hygiene is back on for `REGISTOS_POR_DIA`.

## 2026-03-12

### `pending`
- **Type**: feat(ui)
- **Scope**: `src/index.html`, `src/css.html`, `src/js.html`, `docs/MAPA_MENSAL_SPEC.md`, `docs/MAPA_MENSAL_TECH_PLAN.md`, `docs/OPEN_ITEMS.md`
- **Summary**:
  - Added first implementation of `Mapa Mensal` with dashboard summary table and printable monthly PDF-style view.
  - Implemented monthly client-side aggregation from `DATA.registos` with agreed business rules for `F`, `FJ`, `Bxa`, `Fér` and `Dsp`.
  - Added worker ordering/inclusion rules for zero-hour absence cases and visual highlighting for absence cells/columns.
  - Added functional and technical specification docs for the monthly payment map.
- **Impact**:
  - Dashboard now supports monthly payment map review and print/export preparation without new backend endpoints.
  - Business rules for monthly closure are documented and traceable for future iterations.

### `f09ac96`
- **Type**: feat(ui)
- **Scope**: `src/index.html`, `src/css.html`
- **Summary**:
  - Reworked the global date subbar for mobile into a compact two-row layout.
  - Kept quick filters on the first row and `De`/`Até` on the second row with tighter sizing.
- **Impact**:
  - Date filtering uses less vertical space on mobile while staying readable.

### `7ab59ac`
- **Type**: feat(ui)
- **Scope**: `src/index.html`, `src/css.html`, `src/js.html`
- **Summary**:
  - Added mobile-first updates to Obra phase chart interactions and layout behavior.
  - Added phase visibility controls (strike/hide) with automatic chart recalculation.
  - Removed chart-click side effect that auto-expanded Workers/Materials sections.
- **Impact**:
  - Better mobile usability and cleaner interaction model in Obra detail.
  - Safer chart exploration without triggering unrelated UI changes.

### `76e5253`
- **Type**: fix
- **Scope**: `src/js.html`
- **Summary**:
  - Fixed workers time filtering to include legacy rows where `custo > 0` but `horas` is empty/zero.
  - Updated worker counting consistency in filtered KPI/global computations with same rule.
- **Impact**:
  - Workers panel now aligns better with visible cost totals for older data.
  - Reduced false "missing worker" effect under date filtering.

### `b725a8d`
- **Type**: feat(ui)
- **Scope**: `src/index.html`, `src/css.html`, `src/js.html`
- **Summary**:
  - Added controls in Obra chart card for:
    - Metric: Labor / Materials / Total
    - Chart type: Bar / Doughnut
  - Extended phase aggregation logic to support selected metric.
- **Impact**:
  - Users can compare phase costs by source and presentation style.

### `b266329`
- **Type**: fix
- **Scope**: `src/Readers.gs`, `src/js.html`, `src/main.gs`
- **Summary**:
  - Introduced legacy-safe ingest behavior for incomplete old records.
  - Improved date normalization/filter reliability in frontend.
  - Kept empty-row cleanup temporarily disabled via config flag.
- **Impact**:
  - Old datasets now contribute to totals without strict schema compliance.

### `522dfab`
- **Type**: feat(ui)
- **Scope**: `src/index.html`, `src/js.html`
- **Summary**:
  - Added "Custo Mão de Obra" KPI card in Obra details.
  - Reordered Obra KPI cards to the approved sequence.
- **Impact**:
  - KPI panel now matches business reading order and separates labor/materials visibility.

### `299536d`
- **Type**: feat(ui)
- **Scope**: `src/index.html`, `src/css.html`, `src/js.html`
- **Summary**:
  - Added collapsible sections for Obra Workers and Materials blocks.
  - Introduced explicit expand/retract controls per section.
- **Impact**:
  - Reduced mobile scroll pressure and improved information scanning.

### `085d42e`
- **Type**: docs
- **Scope**: `docs/*`
- **Summary**:
  - Added project state, decisions, worklog, open-items, and handoff docs.
- **Impact**:
  - Established repeatable session handoff and historical traceability.

## 2026-03-09

### `6e73b25`
- **Type**: chore
- **Scope**: repository state checkpoint
- **Summary**:
  - Consolidated pending project changes into a clean checkpoint commit.
- **Impact**:
  - Stable baseline for subsequent targeted fixes.

### `9882086`
- **Type**: refactor
- **Scope**: GAS backend structure
- **Summary**:
  - Split backend into:
    - `main.gs`
    - `Readers.gs`
    - `Composer.gs`
    - `Sync.gs`
    - `Aggregators.gs`
- **Impact**:
  - Better separation of concerns and maintainability.
  - Clearer boundaries between read/orchestration/aggregation/sync.

---

## Entry Template
```md
## YYYY-MM-DD
### `<commit-hash>`
- **Type**: feat|fix|refactor|chore|docs
- **Scope**: files/modules
- **Summary**:
  - change 1
  - change 2
- **Impact**:
  - expected effect
```

## 2026-03-17

### `d73fc8f`
- **Type**: refactor / automation
- **Scope**: `src/main.gs`, spreadsheet operating model for materials
- **Summary**:
  - Reworked the materials registration flow around a single `MATERIAIS_CAD` sheet and removed code dependency on `MATERIAIS_ALIAS`.
  - Added custom `MATERIAIS_CAD` processing:
    - exact supplier + original-description reuse,
    - similarity-based reuse/review,
    - `Natureza`-based ID generation,
    - automatic `Item_Oficial` suggestion,
    - `Estado_Cadastro` coloring.
  - Added `FATURAS_ITENS` hydration from:
    - `FATURAS` via `ID_Fatura`,
    - `MATERIAIS_CAD` via `Fornecedor + Descricao_Original`.
  - Changed `FATURAS_ITENS` automation to edit only owned columns so invoice total formulas do not get wiped.
  - Extended material movement synchronization:
    - create movement when invoice line becomes valid,
    - update generated movement when the invoice line changes,
    - remove generated movement when the invoice line is deleted or becomes invalid.
  - Changed movement generation to use net unit cost (discount-aware).
- **Impact**:
  - Materials workflow is closer to a usable day-to-day Google Sheets process.
  - `STOCK_ATUAL` can now depend on generated ledger rows instead of manual duplicate entry.
  - The current main risk is not architecture but spreadsheet behavior validation on real rows.

## 2026-03-18

### `d73fc8f`
- **Type**: feat
- **Scope**: `backend/app/*`, `frontend/src/*`
- **Summary**:
  - Added edit/delete flows for:
    - `FATURAS`
    - `FATURAS_ITENS`
    - `MATERIAIS_CAD`
    - manual `AFETACOES_OBRA`
  - Added Sheets-first delete support and Supabase delete mirroring in the new materials backend.
  - Reconciled generated downstream rows when source invoice items / manual stock afetacoes are edited or removed.
  - Surfaced mixed-mode runtime guidance in the app shell and sync page:
    - last reload time/source
    - warning that external Google Sheet edits require explicit reload
  - Expanded diagnostics to compare selected business fields and show sheet row provenance for mismatches.
- **Impact**:
  - The materials backoffice now supports correction and maintenance work, not only first-time entry.
  - Operators have a clearer runtime model when app state and manual Sheet edits coexist.

### `d73fc8f`
- **Type**: docs / architecture plan
- **Scope**: `docs/MATERIALS_BACKOFFICE_PLAN.md`, `docs/PROJECT_STATE.md`, `docs/OPEN_ITEMS.md`
- **Summary**:
  - Defined the recommended next migration step for materials and purchasing input.
  - Recorded the operating split:
    - keep `AppSheet` for labour and displacements
    - introduce a dedicated app for `FATURAS`, `FATURAS_ITENS`, `MATERIAIS_CAD`, and `AFETACOES_OBRA`
  - Recorded the preferred future architecture:
    - app -> backend -> Google Sheets + Supabase
    - instead of relying on Google Sheets + GAS triggers alone for the richer materials flow
- **Impact**:
  - The project now has a documented direction for reducing trigger-driven instability in the materials workflow without abandoning Google Sheets as an always-populated business record.

### `d73fc8f`
- **Type**: docs / product-backend specification
- **Scope**: `docs/MATERIALS_BACKOFFICE_SPEC.md`, `docs/MATERIALS_BACKOFFICE_PLAN.md`, `docs/PROJECT_STATE.md`, `docs/DECISIONS.md`, `docs/OPEN_ITEMS.md`
- **Summary**:
  - Expanded the materials backoffice plan into an operational MVP specification.
  - Defined the first app screens:
    - `FATURAS`
    - `FATURAS_ITENS`
    - `MATERIAIS_CAD`
    - `AFETACOES_OBRA`
    - `Sincronizacao`
  - Defined generated-vs-editable rules, minimum backend responsibilities, endpoint set, and recommended write order:
    - backend validates
    - backend writes Google Sheets
    - backend mirrors to Supabase with retry visibility
- **Impact**:
  - The migration path is now concrete enough to start backend and screen implementation without improvising entity boundaries or input behavior.

### `d73fc8f`
- **Type**: feat / scaffold
- **Scope**: `src/Sync.gs`, `backend/`, `frontend/`, `.gitignore`, docs
- **Summary**:
  - Added Fase 0 sync coverage for `FATURAS_ITENS` and `AFETACOES_OBRA` in `src/Sync.gs`.
  - Aligned `MATERIAIS_CAD` and `STOCK_ATUAL` sync mappers to the current spreadsheet model.
  - Created a new `backend/` FastAPI skeleton with:
    - sync endpoints
    - invoice endpoints
    - catalog endpoints
    - afetacao endpoints
    - stock endpoint
    - in-memory adapters for Sheets and Supabase
  - Created a new `frontend/` React + Vite skeleton with first routes:
    - `/faturas`
    - `/faturas/:id`
    - `/catalogo`
    - `/afetacoes`
    - `/sync`
  - Added backend tests covering:
    - direct invoice consumption generation
    - stock entry + manual afetacao processing
    - sync retry behavior
- **Impact**:
  - The project now has a working local base for the future materials backoffice without touching the current GAS dashboard runtime.
  - The remaining gap is real adapter wiring and production-like validation against actual Google Sheets and Supabase environments.

### `e4d4d74`
- **Type**: fix
- **Scope**: `backend/`, `frontend/`, sync/schema validation
- **Summary**:
  - Wired and validated real Google Sheets and Supabase adapters for the materials backoffice.
  - Added `backend/.env.example` and `backend/scripts/check_integrations.py` for credential setup and live integration checks.
  - Added CORS support to the backend and surfaced visible success/error feedback in main frontend forms.
  - Simplified `AFETACOES_OBRA` in the frontend:
    - removed the temporary manual `Processar` checkbox/button from the UI
    - process stock outputs on `Guardar`
  - Added `backend/sql/002_align_materials_backoffice_schema.sql` to align Supabase with the backend payload shape.
### 2026-03-24 / 2026-03-25: Dashboard Enhancements & HR Module
- **Contabilidade Section**: Unified costs onto a new high-contrast Bar Chart.
- **Bug Fix**: Fixed MAT vs GAS prefix mapping for materials both on the frontend payload check and on `backend/app/services/materials.py`.
- **Recursos Humanos Module**: Added full integration of the `PESSOAL_EFETIVO` sheet, complete with a Supabase SQL migration, a new python sync endpoint, `Sync.gs` support, and a dedicated expandable data list view (`#section-rh`) on the Dashboard.
- **Hotfixes**:
  - Restored missing `</div>` tag that broke Contabilidade's DOM hierarchy.
  - Implemented dynamic table header detection `findHeaderRowLocation_` in Apps Script to safely parse heavily-formatted Google Sheets inset tables instead of blindly relying on row 1.
  - Added HR shortcut to Android/iOS Navigation Navbar.
  - Stabilized Supabase mirror behavior so Google Sheets writes remain primary and retry-safe when the mirror fails.
- **Impact**:
  - The materials backoffice MVP can now operate against the live Google Sheet + Supabase environment.
  - Core sync visibility is now usable in the `Sincronizacao` screen instead of failing silently.

### `d73fc8f`
- **Type**: feat
- **Scope**: `backend/app/adapters/google_sheets/*`, `backend/app/api/deps.py`, `backend/app/services/*`
- **Summary**:
  - Added startup hydration of the materials backoffice runtime state from Google Sheets.
  - Seeded runtime counters from hydrated IDs so new records continue existing numbering instead of restarting from zero.
  - Filtered internal sheet metadata such as `sheet_row_num` out of API response-model validation.
- **Impact**:
  - After backend restart, `FATURAS`, `MATERIAIS_CAD`, `AFETACOES_OBRA`, and related lists now reopen with real existing data.
  - The new app no longer appears empty after restarting the FastAPI server.

### `c9a078e`
- **Type**: feat(ui) / ops
- **Scope**: `frontend/`, `backend/app/adapters/google_sheets/live.py`, `backend/tests/test_api.py`, docs
- **Summary**:
  - Improved `FATURAS_ITENS` with guided catalog selection, quick catalog creation, and readable impact preview.
  - Improved `AFETACOES_OBRA` with guided item lookup, stock snapshot context, and clearer stock-cost error feedback.
  - Changed `Sincronizacao` from raw JSON output to card-based operational status with explicit reload/retry actions.
  - Fixed Google Sheets serialization for `FATURAS_ITENS.Natureza` to better align stored sheet rows with app/runtime data.
- **Impact**:
  - Day-to-day registration now needs less manual lookup and gives earlier warning/context before save.
  - Sync status is easier to read operationally without inspecting raw payloads.
  - `FATURAS_ITENS` roundtrip fidelity between app and Google Sheets is improved.

### `fd114e8`
- **Type**: feat(ui) / diagnostics
- **Scope**: `backend/app/api/*`, `backend/app/services/materials.py`, `frontend/`, docs
- **Summary**:
  - Added read-only technical endpoints and UI for:
    - `STOCK_ATUAL`
    - `MATERIAIS_MOV`
  - Added manual sync diagnostics comparing runtime IDs against fresh Google Sheets IDs for the core material entities.
  - Extended frontend API support for stock snapshots, movement list, and sync diagnostics.
- **Impact**:
  - Operators now have a non-destructive place to inspect current stock and movement consequences.
  - Divergence suspicion can now be checked explicitly instead of relying on visual guessing.

### `b57c4b9`
- **Type**: feat(ui) / integration
- **Scope**: `backend/app/adapters/google_sheets/*`, `backend/app/api/*`, `frontend/`, `backend/tests/test_api.py`
- **Summary**:
  - Added `/api/options/obras-fases` to expose sheet-driven work selectors to the new materials app.
  - Loaded `Obra` options from `OBRAS.Local_ID` and `Fase` options from the global `FASES_DE_OBRA` list.
  - Updated `Adicionar Linha` and `Afetacoes` to use visible selectors fed by those options instead of raw free-text-only entry.
  - Kept `Adicionar Linha` aligned with business rules by only enabling `Obra` / `Fase` when `Destino = CONSUMO`.
- **Impact**:
  - Operators now get consistent obra/fase suggestions straight from the workbook instead of guessing names manually.
  - The new materials UI now reflects the existing Sheets operating model more closely.

## 2026-03-19

### `d73fc8f`
- **Type**: feat
- **Scope**: `backend/`, `frontend/`, `backend/sql/003_split_material_catalog_references.sql`
- **Summary**:
  - Split the materials catalog into a canonical `MATERIAIS_CAD` model plus `MATERIAIS_REFERENCIAS`.
  - Added supplier options from `FORNECEDORES`, invoice total parsing fixes, startup hydration hardening, and a safe seeding path for historical references.
  - Reworked the main materials screens toward a desktop-first operator workflow:
    - `Faturas`
    - `Fatura Detail`
    - `Catalogo`
    - `Afetacoes`
    - `Sincronizacao`
  - Added focused backend diagnostics and tests for:
    - sheet hydration contract regressions
    - stock afetacao movement reconciliation
    - duplicate/overlap inspection in `MATERIAIS_MOV`
- **Impact**:
  - The materials backoffice now better matches the real business model:
    - canonical items
    - historical recognized descriptions
    - office-first registration flows
  - Runtime behavior against live Sheets is more observable and less likely to drift silently under evolving spreadsheet structure.

## 2026-03-20

### Working tree
- **Type**: ops / docs / hardening
- **Scope**: `backend/ops/*`, `backend/README.md`, `docs/PROJECT_STATE.md`, `docs/OPEN_ITEMS.md`
- **Summary**:
  - Added Windows operational scripts for the materials backoffice:
    - foreground operational run
    - build/test/update flow
    - Windows service installation via `NSSM`
  - Documented the safe office-hours update pattern:
    - prepare build/tests without restart
    - restart only in a short maintenance pause
- **Impact**:
  - The project is now closer to a stable internal-office deployment model.
  - The manual terminal workflow can be replaced later by a more predictable Windows service setup.

### `720b35f`
- **Type**: feat / fix / stabilization
- **Scope**: `backend/`, `frontend/`, `src/main.gs`, `docs/*`
- **Summary**:
  - Extended the materials backoffice business model to support:
    - `GASOLEO`
    - `GASOLINA`
    - `Lt`
    - `Uso_Combustivel`
    - `Destino = VIATURA`
    - `Matricula` sourced from `VEICULOS`
  - Added invoice payment support in `FATURAS`:
    - `Paga?`
    - `Data Pagamento`
  - Stabilized Google Sheets parsing/serialization and hydration for:
    - totals
    - percentages
    - payment fields
    - canonical catalog references
    - fuel/vehicle fields
  - Added safer tests and diagnostics around:
    - sheet hydration contracts
    - supplier/vehicle option endpoints
    - stock movement reconciliation / duplicate diagnostics
  - Disabled legacy GAS material-flow automation by default so the new backoffice owns the material workflow.
  - Cached work/supplier/vehicle options in the backend to reduce live-sheet latency during operator entry.
- **Impact**:
  - The materials backoffice now matches the newer Google Sheet operating model more closely, especially for fuel attribution and payment tracking.
  - Runtime behavior is less likely to drift because old GAS materials automation no longer rewrites the same rows behind the new app.
  - Operator entry should be more stable for supplier, obra/fase, and vehicle-assisted dropdown flows.

### `pending`
- **Type**: feat
- **Scope**: `backend/`, `frontend/`, `docs/*`
- **Summary**:
  - Activated `Nota de Crédito` inside the materials backoffice while keeping the header in `FATURAS`.
  - Added backend support for:
    - `FATURAS.Tipo_Doc`
    - `FATURAS.Doc_Origem`
    - `NOTAS_CREDITO_ITENS`
    - generated stock reduction for material credit lines
    - generated obra-cost reduction for `NC_COM_OBRA`
  - Added Google Sheets hydration/serialization, Supabase mapping, sync diagnostics, and migration coverage for `NOTAS_CREDITO_ITENS`.
  - Unblocked the frontend flow so the `Faturas` workspace now supports:
    - `Fatura`
    - `Compromisso`
    - `Nota de Credito`
  - Added a dedicated note-credit detail workspace under the same `/faturas/:id` route family.
- **Impact**:
  - Operators can now register and process credit notes without inventing a parallel document flow outside the backoffice.
  - The implementation preserves the operating model:
    - Sheets first
    - Supabase second
    - retry visibility explicit
  - Credit behavior is now auditable per line instead of being hidden behind manual spreadsheet conventions.
