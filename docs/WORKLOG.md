# Worklog

Purpose: chronological, commit-based project history for fast handoff.

## Logging Rules
- Each entry must include date, summary, and commit hash.
- Keep technical facts explicit and short.
- Do not store clasp deploy/version actions here (managed separately).

---

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

### `uncommitted`
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

### `uncommitted`
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

### `uncommitted`
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

### `uncommitted`
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
  - Stabilized Supabase mirror behavior so Google Sheets writes remain primary and retry-safe when the mirror fails.
- **Impact**:
  - The materials backoffice MVP can now operate against the live Google Sheet + Supabase environment.
  - Core sync visibility is now usable in the `Sincronizacao` screen instead of failing silently.

### `uncommitted`
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

### `uncommitted`
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
