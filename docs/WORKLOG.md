# Worklog

Purpose: chronological, commit-based project history for fast handoff.

## Logging Rules
- Each entry must include date, summary, and commit hash.
- Keep technical facts explicit and short.
- Do not store clasp deploy/version actions here (managed separately).

---

## 2026-03-10

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
