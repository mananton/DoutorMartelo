# Open Items

Last reviewed: 2026-03-18

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

## P1 - Reduce GAS Trigger Sensitivity in Materials Flow
- Current sheet automations are improving, but the materials flow still has timing/performance sensitivity under real edits.
- Next technical goal:
  - move more materials business logic out of cell-by-cell trigger timing
  - keep Google Sheets populated, but reduce dependence on reactive GAS for incomplete row edits
- This item is one of the drivers for the dedicated materials app plan.

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
