# Documentation Catalog

Last updated: 2026-03-19

## Purpose
- Separate the Markdown documents that reflect the current operational state of the project from older baseline/reference documents that still matter but should not drive day-to-day decisions first.
- Reduce the risk of agents or collaborators reading older migration notes before the newer materials-backoffice direction.

## Recommended Reading Order
1. `docs/PROJECT_STATE.md`
2. `docs/DECISIONS.md`
3. `docs/OPEN_ITEMS.md`
4. `docs/WORKLOG.md`
5. `docs/HANDOFF_PROMPT.md`
6. `docs/MATERIALS_BACKOFFICE_SPEC.md`
7. `docs/MATERIALS_BACKOFFICE_PLAN.md`
8. inspect `backend/` and `frontend/` if the session relates to the new materials backoffice

## Precedence Rule
- If two documents conflict, prefer the newest operational docs in this order:
  1. `PROJECT_STATE`
  2. `DECISIONS`
  3. `OPEN_ITEMS`
  4. `WORKLOG`
  5. current feature specs/plans
  6. older baseline/reference docs
- Older docs should be treated as context and business history, not as the default implementation brief.

## A. Active Operational Source of Truth

These are the documents most aligned with the current repo direction and should guide ongoing development first.

| File | Last repo update | Status | Use |
|---|---|---|---|
| `docs/PROJECT_STATE.md` | 2026-03-18 | Active | Best current snapshot of architecture, runtime flow, risks, and current materials-backoffice state. |
| `docs/DECISIONS.md` | 2026-03-18 | Active | Canonical short ADR-style record of accepted technical/product decisions. |
| `docs/OPEN_ITEMS.md` | 2026-03-18 | Active | Best list of immediate next steps and validation gaps. |
| `docs/WORKLOG.md` | 2026-03-18 | Active | Chronological change narrative; useful to understand recent delivery sequence. |
| `docs/HANDOFF_PROMPT.md` | 2026-03-18 | Active | Best “new session bootstrap” prompt for agents and collaborators. |
| `docs/MATERIALS_BACKOFFICE_SPEC.md` | 2026-03-18 | Active | Current MVP execution spec for the new materials backoffice. |
| `docs/MATERIALS_BACKOFFICE_PLAN.md` | 2026-03-18 | Active | Transition plan explaining why the project is moving materials logic into backend/app flow. |
| `backend/README.md` | 2026-03-18 | Active | Live backend setup and integration guidance for the new materials backoffice. |
| `frontend/README.md` | 2026-03-18 | Active | Minimal frontend runtime/setup note for the new materials backoffice. |

## B. Active but Feature-Specific Reference

These are still current, but they are narrower in scope and should not be mistaken for the whole-project brief.

| File | Last repo update | Status | Use |
|---|---|---|---|
| `docs/MAPA_MENSAL_SPEC.md` | 2026-03-13 | Current feature spec | Reference for monthly payment map behavior and validation. |
| `docs/MAPA_MENSAL_TECH_PLAN.md` | 2026-03-13 | Current feature plan | Technical reference for the implemented monthly-map slice and future refinement. |

## C. Historical / Baseline Architecture Reference

These documents still matter, especially for migration context and broad business rules, but they are older than the current materials-backoffice execution wave and should not be read first when deciding what to build next.

| File | Last repo update | Status | Use with caution |
|---|---|---|---|
| `docs/REGRAS_DE_NEGOCIO.md` | 2026-03-09 | Baseline reference | Broad system rules and migration intent; partially reflects the earlier GAS-centric architecture. |
| `docs/SUPABASE_PREP_PLAN.md` | 2026-03-13 | Historical planning | Early prep plan before the current backoffice implementation matured. |
| `docs/SUPABASE_SCOPE_MAP.md` | 2026-03-13 | Historical planning | Useful for scope framing, but predates the more concrete materials-backoffice rollout. |
| `docs/SUPABASE_TABLE_MAP.md` | 2026-03-13 | Historical planning | Useful for table ideas and migration thinking, but not the best first document for current implementation decisions. |

## D. Meta / Tooling Instructions

These Markdown files are useful, but they describe tooling behavior or collaborator guidance rather than the current product roadmap.

| File | Last repo update | Status | Notes |
|---|---|---|---|
| `.github/copilot-instructions.md` | 2026-03-04 | Legacy tooling guidance | Still useful for `src/` GAS dashboard work, but outdated for `backend/` and `frontend/` materials-backoffice work. |
| `.codex/skills/ui-ux-pro-max/SKILL.md` | 2026-03-09 | Tooling/meta | Codex skill documentation; not project state. |
| `.codex/skills/ui-ux-pro-max/gas-bridge-expert.md` | 2026-03-09 | Tooling/meta | Legacy GAS integration advice; helpful only for GAS-specific UI work. |

## Practical Guidance

### If the task is about current materials backoffice work
- Start with:
  - `docs/PROJECT_STATE.md`
  - `docs/DECISIONS.md`
  - `docs/OPEN_ITEMS.md`
  - `docs/MATERIALS_BACKOFFICE_SPEC.md`
  - `backend/README.md`
- Then inspect:
  - `backend/`
  - `frontend/`

### If the task is about the legacy GAS dashboard in `src/`
- Start with:
  - `docs/PROJECT_STATE.md`
  - `docs/DECISIONS.md`
  - `docs/WORKLOG.md`
  - `docs/REGRAS_DE_NEGOCIO.md`
- Use `.github/copilot-instructions.md` only in this narrower legacy context.

### If the task is architectural or migration-oriented
- Read:
  - `docs/PROJECT_STATE.md`
  - `docs/DECISIONS.md`
  - `docs/MATERIALS_BACKOFFICE_PLAN.md`
  - `docs/MATERIALS_BACKOFFICE_SPEC.md`
  - then the older Supabase prep docs only as background

## Current Catalog Summary
- The live center of gravity of the repo is now the hybrid phase:
  - legacy GAS dashboard remains active
  - new materials backoffice in `backend/` + `frontend/` is the main forward path
- The biggest documentation risk is reading older GAS-only or early-migration notes before the 2026-03-18 operational docs.
- The safest default is:
  - read the active operational docs first
  - read older migration and rule docs second
  - treat tooling instructions as scope-specific, not universal
