# Open Items

Last reviewed: 2026-03-10

## P1 - Validate Worker Filtering Against Real Legacy Samples
- Run focused checks on at least 3 obras with mixed old/new rows.
- Confirm that workers with cost-only days appear correctly in:
  - Obra workers list
  - Worker counters under date filters
  - KPI consistency

## P1 - Data Quality Guardrails (Non-breaking)
- Add optional diagnostics (not blocking) for malformed rows:
  - invalid date shape
  - missing obra
  - non-numeric cost/hours
- Output should be log/telemetry style only; no behavior changes unless requested.

## P2 - Encoding Cleanup Pass
- Clean visible mojibake in UI strings/comments where present.
- Keep this as a dedicated low-risk pass to avoid mixing functional changes.

## P2 - Chart UX Guardrail for Many Phases
- If phase count is high, consider auto-fallback from doughnut to bar or show a warning tooltip.
- Keep current behavior unless explicitly approved.

## P3 - Documentation Process
- At end of each work session:
  - append new commit entries to `docs/WORKLOG.md`
  - update `docs/PROJECT_STATE.md` if architecture/flow changed
  - update `docs/DECISIONS.md` when a new technical decision is made

