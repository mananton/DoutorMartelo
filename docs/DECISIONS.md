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

## D-007: Obra heavy sections are collapsible by default
- **Status**: accepted
- **Date**: 2026-03-10
- **Commit**: `299536d`
- **Decision**:
  - Keep Workers and Materials cards collapsible to reduce initial page density.
- **Rationale**:
  - Mobile-first behavior benefits from progressive disclosure of dense lists.
- **Impact**:
  - Faster scanning in Obra detail and lower accidental scroll burden.

## D-008: Obra phase chart uses explicit visibility filters (no click drill side-effects)
- **Status**: accepted
- **Date**: 2026-03-10
- **Commit**: `7ab59ac`
- **Decision**:
  - Use dedicated phase chips to strike/hide phases and recompute chart totals.
  - Remove chart-click action that expanded other sections.
- **Rationale**:
  - Chart interactions must be predictable and scoped to chart behavior only.
- **Impact**:
  - Cleaner UX and fewer accidental state changes while analyzing phases.

## D-009: Data diagnostics stay internal and non-blocking
- **Status**: accepted
- **Date**: 2026-03-13
- **Commit**: `pending`
- **Decision**:
  - Keep malformed-row diagnostics as internal support tooling only.
  - Surface diagnostics in a dedicated `Dev` area instead of the main overview.
  - Do not block dashboard rendering when issues are found.
- **Rationale**:
  - Business users should not see data-maintenance warnings in the main dashboard.
  - The team still needs a quick way to spot and fix malformed rows in Google Sheets.
- **Impact**:
  - Cleaner client-facing dashboard.
  - Faster internal diagnosis of sheet problems without changing business behavior.

## D-010: Future Supabase sync should be near-real-time with retry safety
- **Status**: accepted
- **Date**: 2026-03-13
- **Commit**: `pending`
- **Decision**:
  - Keep AppSheet and manual Google Sheet editing as the input path in the first migration stage.
  - When Supabase is introduced, prefer automatic near-real-time sync after each change.
  - If sync fails, the operational flow must continue and the system should allow a later retry.
- **Rationale**:
  - The team needs the dashboard to stay fresh without changing how people register data.
  - Immediate sync is useful, but it must not become a fragile point that blocks the day-to-day operation.
- **Impact**:
  - Future migration stays safer for operations.
  - Dashboard freshness improves without forcing an early change in the input workflow.

## Standing Constraints
- Do not rename global sheet constants.
- Do not change Supabase sync structure without explicit request.
- Keep legacy rules active unless business owner requests rollback.
