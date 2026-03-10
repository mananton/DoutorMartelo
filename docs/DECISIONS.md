# Technical Decisions

Format: short ADR-style records with rationale and impact.

## D-001: Split frontend into HTML/CSS/JS includes
- **Status**: accepted
- **Date**: 2026-03-09
- **Commit**: `9882086` (structure wave)
- **Decision**:
  - Keep markup in `index.html`.
  - Move styles to `css.html` and scripts to `js.html`.
  - Include both via GAS `include(filename)`.
- **Rationale**:
  - Improve load/maintenance behavior and separation of concerns.
- **Impact**:
  - Easier UI maintenance and lower merge conflict pressure.

## D-002: Split backend by responsibility
- **Status**: accepted
- **Date**: 2026-03-09
- **Commit**: `9882086`
- **Decision**:
  - Keep `main.gs` as entrypoint/orchestrator.
  - Move readers/composer/sync/aggregators into dedicated files.
- **Rationale**:
  - Reduce density of `main.gs` and isolate I/O from aggregation/sync concerns.
- **Impact**:
  - Safer incremental changes and clearer ownership per module.

## D-003: Raw-first payload with frontend normalization
- **Status**: accepted
- **Date**: 2026-03-10
- **Commit**: `b266329`
- **Decision**:
  - Prefer `raw_v2` payload and normalize client-side.
  - Keep legacy fallback path (`mode: 'legacy'`) for resilience.
- **Rationale**:
  - Better performance and flexibility for UI-side filtering/aggregation.
- **Impact**:
  - Reduced server coupling for presentation-layer transformations.

## D-004: Legacy-tolerant record handling
- **Status**: accepted
- **Date**: 2026-03-10
- **Commit**: `b266329`
- **Decision**:
  - Preserve historical costs even when old rows are incomplete.
  - Apply explicit defaults/fallbacks for missing fields.
- **Rationale**:
  - Historical backfill cannot be manually rewritten at scale.
- **Impact**:
  - Better historical visibility, with acknowledged precision tradeoffs.

## D-005: Obra phase chart as configurable view
- **Status**: accepted
- **Date**: 2026-03-10
- **Commit**: `b725a8d`
- **Decision**:
  - Add metric switch (labor/materials/total) and chart type switch (bar/doughnut).
- **Rationale**:
  - Improve readability and stakeholder-oriented analysis views.
- **Impact**:
  - Better exploratory analysis in Obra detail.

## D-006: Cost-only legacy days count as worked in filters
- **Status**: accepted
- **Date**: 2026-03-10
- **Commit**: `76e5253`
- **Decision**:
  - In date-filtered worker views/counters, treat day as worked when `hours > 0` OR `cost > 0`.
- **Rationale**:
  - Old records often miss hours while carrying valid cost.
- **Impact**:
  - Worker visibility aligns with cost totals in filtered windows.

## Standing Constraints
- Do not rename global sheet constants.
- Do not change Supabase sync structure without explicit request.
- Keep legacy rules active unless business owner requests rollback.

