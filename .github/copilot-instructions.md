# Copilot Instructions - Dashboard Doutor Martelo

## Purpose
This repository is now hybrid and must be treated as two active product surfaces:

1. `legacy GAS dashboard`
2. `materials backoffice (FastAPI + React)`

These instructions exist to stop tools and collaborators from applying the wrong stack rules to the wrong part of the repo.

## First Read Rule
Before making architecture or implementation decisions, read these files first:

1. `docs/DOCS_CATALOG.md`
2. `docs/PROJECT_STATE.md`
3. `docs/DECISIONS.md`
4. `docs/OPEN_ITEMS.md`
5. `docs/WORKLOG.md`

If there is any conflict:
- prefer `PROJECT_STATE`
- then `DECISIONS`
- then `OPEN_ITEMS`
- then `WORKLOG`
- treat older docs as background unless they are still explicitly confirmed by the newer docs

## Repo Reality

### Track A - Legacy GAS Dashboard
Main area:
- `src/`

Current stack:
- Google Apps Script
- Google Sheets
- AppSheet for operational input
- HtmlService frontend split into:
  - `src/index.html`
  - `src/css.html`
  - `src/js.html`
- GAS backend split into:
  - `src/main.gs`
  - `src/Readers.gs`
  - `src/Composer.gs`
  - `src/Aggregators.gs`
  - `src/Sync.gs`

### Track B - Materials Backoffice
Main areas:
- `backend/`
- `frontend/`

Current stack:
- FastAPI
- Python service/adapters/schemas structure
- React + Vite
- Google Sheets live adapters
- Supabase mirror

## Scope Routing

### Use the legacy GAS rules when:
- the task touches `src/`
- the task is about the current dashboard web app
- the task is about `google.script.run`
- the task is about AppSheet input behavior
- the task is about GAS triggers, sheet readers, dashboard payloads, or `raw_v2`

### Use the materials backoffice rules when:
- the task touches `backend/`
- the task touches `frontend/`
- the task is about:
  - `FATURAS`
  - `FATURAS_ITENS`
  - `MATERIAIS_CAD`
  - `AFETACOES_OBRA`
  - `MATERIAIS_MOV`
  - `STOCK_ATUAL`
  - sync diagnostics
  - runtime hydration
  - FastAPI endpoints
  - React routes/pages

### If a task spans both tracks:
- keep boundaries explicit
- do not force GAS-only constraints onto FastAPI/React work
- do not force React/backend patterns into the legacy GAS dashboard

## Global Constraints Across Both Tracks
- Keep UI and business wording in Portuguese PT unless the file already uses English for technical reasons.
- Do not rename global sheet constants such as `SHEET_REGISTOS` unless explicitly requested.
- Do not change Supabase sync structure unless explicitly requested.
- Keep legacy data-handling rules active unless the business owner asks to change them.
- Prefer incremental, low-risk edits over broad rewrites.
- When architecture or operational flow changes, update the active docs in `docs/`.

## A. Legacy GAS Dashboard Instructions

### Core Mindset
Treat the legacy dashboard as an active production surface, not as dead code.
Changes here must preserve compatibility with:
- Google Apps Script runtime
- HtmlService
- AppSheet operational flow
- current Google Sheets structure

### Allowed Stack and Patterns
- HTML5 + CSS3 + vanilla JavaScript
- global functions compatible with Apps Script HtmlService
- Chart.js via CDN if already part of the page flow
- `google.script.run` for frontend -> backend calls

### Do Not Introduce Into `src/`
- React
- Vue
- Angular
- npm-driven frontend architecture inside the GAS app
- `fetch` for GAS frontend/backend communication
- `import` / `export` browser-module structure inside HtmlService files
- assumptions that the dashboard frontend is a Vite app

### Legacy File Map
- `src/main.gs`
  - entrypoints and orchestration
  - `doGet`
  - operational helpers
  - trigger-related behavior
- `src/Readers.gs`
  - sheet readers
  - header normalization
  - dynamic column mapping
  - legacy-safe parsing
- `src/Composer.gs`
  - raw payload assembly
- `src/Aggregators.gs`
  - server-side aggregation
- `src/Sync.gs`
  - Supabase sync boundary
- `src/index.html`
  - markup
- `src/css.html`
  - styles
- `src/js.html`
  - client logic, rendering, filtering, charts

### Legacy Runtime Flow
1. `doGet()` serves `index`
2. frontend calls `getDashboardData({ mode: 'raw_v2' })`
3. frontend normalizes raw payload client-side
4. if needed, frontend falls back to legacy mode

### Legacy Data/Behavior Rules To Preserve
- `COLABORADORES` remains the source of active workers
- keep cost-only legacy day handling active
- keep old labour history separated from operational worker detail
- keep diagnostics non-blocking
- preserve current behavior around:
  - faltas
  - dispensado
  - legacy hours/cost fallbacks
  - date filtering rules

### Legacy Frontend Communication Rule
For GAS UI work:

```js
google.script.run
  .withSuccessHandler(...)
  .withFailureHandler(...)
  .someServerFunction(...)
```

Do not replace this with `fetch`.

### Legacy Editing Rules
- Make surgical edits.
- Preserve the split include structure:
  - `index.html`
  - `css.html`
  - `js.html`
- Respect the real Google Sheet column order when touching sheet-driven logic.
- Trigger-driven logic should remain idempotent whenever possible.

### Legacy Testing Focus
- desktop and mobile behavior
- dashboard boot path
- date filters
- assiduidade / dispensado behavior
- chart interactions
- AppSheet-sensitive sheet flows when relevant

## B. Materials Backoffice Instructions

### Core Mindset
Treat the materials backoffice as the main forward development path for the unstable materials/purchasing workflow.
This is not a UI-only wrapper around Sheets.
It is an app + backend business-logic boundary that still preserves Google Sheets as the operational record.
It is also a desktop-first office tool, not a mobile-first field dashboard.

### Read Before Working In This Area
Read these first:

1. `docs/PROJECT_STATE.md`
2. `docs/DECISIONS.md`
3. `docs/OPEN_ITEMS.md`
4. `docs/MATERIALS_BACKOFFICE_SPEC.md`
5. `docs/MATERIALS_BACKOFFICE_PLAN.md`
6. `backend/README.md`

### Allowed Stack and Patterns
In `backend/` and `frontend/`, the following are expected and valid:
- FastAPI
- Python modules and schemas
- React
- Vite
- npm
- HTTP API calls from the React app to the backend
- typed schemas and service/adapters organization

Do not apply the old GAS-only prohibitions to this area.

### Current Product Scope For This Area
The dedicated materials app is currently centered on:
- `FATURAS`
- `FATURAS_ITENS`
- `MATERIAIS_CAD`
- `AFETACOES_OBRA`
- read-only technical visibility for:
  - `MATERIAIS_MOV`
  - `STOCK_ATUAL`
- sync status and diagnostics

### UX Posture For This Area
- optimize for office laptop/desktop use first
- prefer denser desktop layouts over mobile-first stacking
- use side rails, compact tables/lists, and sticky action areas when they improve scan speed
- keep responsive behavior as fallback, not as the main design driver

### Current Operating Model
- Google Sheets stays always populated
- backend writes to Google Sheets first
- backend mirrors to Supabase second
- Supabase failure must not block the main Sheets write
- retry visibility is part of the product
- backend runtime currently hydrates from Google Sheets on startup
- direct Sheet edits may exist outside the app, so reload/diagnostic visibility matters

### Architectural Direction To Preserve
- keep AppSheet for labour and displacements in the short term
- keep the new app focused on materials and purchasing flows
- avoid pushing rich materials logic back into cell-by-cell GAS triggers
- prefer backend-owned validation, enrichment, and generated-record handling

### Backoffice UX Direction
- guided operational forms over spreadsheet clones
- assisted selectors where business rules require them
- visible downstream impact before save when useful
- technical ledgers visible read-only, not casually editable
- sync/reload state should be explicit to operators

### Materials Business Rules To Preserve
- `FATURAS_ITENS` is the purchase-line source
- `AFETACOES_OBRA` is the operational attribution layer
- `MATERIAIS_MOV` is a technical/generated ledger, not the main manual input sheet
- `MATERIAIS_CAD` is the current catalog sheet and `MATERIAIS_ALIAS` no longer exists
- `Natureza` drives valid destination behavior
- stock outputs snapshot current average cost at processing time
- generated downstream rows must be reconciled on edit/delete of source rows

### Backend Guidance
Prefer changes that keep clear separation between:
- `api`
- `services`
- `adapters/google_sheets`
- `adapters/supabase`
- `schemas`

When changing behavior:
- keep Sheets-first consistency rules
- keep retry-safe sync behavior
- keep hydration behavior in mind
- preserve diagnostic visibility instead of hiding operational uncertainty

### Frontend Guidance
Treat `frontend/` as a real React app, not as HtmlService.
Allowed patterns include:
- component composition
- route-based pages
- typed API client utilities
- stateful forms

Do not constrain React work with legacy rules like:
- "single index.html only"
- "no npm"
- "no framework"
- "no fetch"

### Validation Focus For This Area
Prioritize validation for:
- create/edit/delete on core materials entities
- guided selectors and catalog mapping flow
- generated rows reconciliation
- reload-from-sheets flow
- runtime-vs-sheets divergence diagnostics
- sync retry visibility
- hydration after backend restart

## C. Older Docs and Historical Material

### Read With Caution
These still matter, but they are not the best first source for current implementation choices:
- `docs/REGRAS_DE_NEGOCIO.md`
- `docs/SUPABASE_PREP_PLAN.md`
- `docs/SUPABASE_SCOPE_MAP.md`
- `docs/SUPABASE_TABLE_MAP.md`

Use them as:
- business background
- migration context
- schema thinking support

Do not treat them as the latest implementation brief when newer docs say otherwise.

## D. Practical Decision Rule

### If the task is in `src/`
Follow the `legacy GAS dashboard` instructions first.

### If the task is in `backend/` or `frontend/`
Follow the `materials backoffice` instructions first.

### If unsure
Use `docs/DOCS_CATALOG.md` to decide which documentation set has precedence before coding.
