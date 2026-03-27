# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Doutor Martelo construction management system with two active product tracks in a hybrid monorepo:

- **Track A - GAS Dashboard** (`src/`): Google Apps Script web app for KPIs, obra detail, workers, materials, travel. Mobile-first. Data from Google Sheets with Supabase mirror for reads.
- **Track B - Materials Backoffice** (`backend/` + `frontend/`): FastAPI + React desktop-first app for invoices, catalog, stock, and materials workflows. Runs on LAN.

## Common Commands

### Track A (GAS Dashboard)
```bash
npx clasp push          # Deploy to Google Apps Script
npx clasp open          # Open in GAS editor
```

### Track B (Materials Backoffice)

**Backend:**
```bash
python -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

**Frontend dev:**
```bash
cd frontend && VITE_API_BASE_URL='http://127.0.0.1:8000' npm run dev -- --host 127.0.0.1
```

**Frontend build (for operational single-port mode):**
```bash
cd frontend && npm run build   # outputs to dist/, served by FastAPI at /
```

**Tests:**
```bash
pytest backend/tests/                        # all backend tests
pytest backend/tests/test_api.py             # single test file
pytest backend/tests/test_api.py -k test_name  # single test
```

**Integration check:**
```bash
python backend/scripts/check_integrations.py   # validate Google Sheets + Supabase connections
```

**Windows service ops:**
```powershell
.\backend\ops\Update-MaterialsBackoffice.ps1       # rebuild frontend, run tests, restart service
.\backend\ops\Sync-SheetsToSupabase.ps1 -Apply      # manual Sheets-to-Supabase mirror
```

## Architecture

### Track A - GAS Dashboard (`src/`)

Runtime: Google Apps Script + HtmlService. No npm, no modules, no fetch for GAS communication.

| File | Role |
|------|------|
| `main.gs` | Entry (`doGet`, `getDashboardData`), config, orchestration |
| `Readers.gs` | Sheet readers, header mapping, legacy-safe parsing |
| `Composer.gs` | Raw payload assembly (`buildRawData_`) |
| `Aggregators.gs` | Server-side aggregation (`buildData_`) |
| `SupabaseRead.gs` | Supabase runtime reader, reproduces `raw_v2` contract |
| `DashboardParity.gs` | Sheets vs Supabase validation |
| `Sync.gs` | Supabase sync boundary (currently disabled) |
| `js.html` | All client logic, rendering, charting (~6k lines) |

Data flow: `doGet()` serves page -> frontend calls `getDashboardData({ mode: 'raw_v2' })` -> resolves from Supabase or Sheets based on `DASHBOARD_DATA_SOURCE` config -> frontend normalizes and renders.

The `raw_v2` payload includes: registos, obras_info, colaboradores, viagens, deslocacoes, ferias, pessoal_efetivo, materiais_mov, legacy_mao_obra, legacy_materiais, faturas, faturas_itens, notas_credito_itens, stock_atual, afetacoes_obra, materiais_cad.

### Track B - Materials Backoffice

**Backend** (`backend/app/`): FastAPI with layered architecture:
- `api/routers/` - HTTP endpoints (faturas, catalogo, afetacoes, stock, movimentos, sync, compromissos, options)
- `services/materials.py` - business logic and validation
- `services/state.py` - `RuntimeState` in-memory cache, hydrated from Sheets on startup
- `adapters/google_sheets/` - live/memory adapters (Sheets is source of truth)
- `adapters/supabase/` - live/memory adapters (mirror, failure doesn't block writes)
- `schemas/` - Pydantic models
- `api/deps.py` - `ServiceContainer` dependency injection

**Frontend** (`frontend/src/`): React 19 + React Router 7 + Vite + TypeScript strict + TanStack React Query + Zod.

Write path: App -> Google Sheets (must succeed) -> Supabase mirror (best-effort).

### Supabase

- SQL migrations in `backend/sql/001-012` (run in Supabase SQL editor)
- Manual local mirror via `backend/scripts/sync_sheets_to_supabase.py`
- Dashboard reads can source from Supabase with Sheets fallback

### Google Sheets (Source of Truth)

Global constants defined in `main.gs` - do NOT rename:
`SHEET_REGISTOS`, `SHEET_OBRAS`, `SHEET_COLAB`, `SHEET_VIAGENS`, `SHEET_DESLOCACOES`, `SHEET_FERIAS`, `SHEET_MATERIAIS_MOV`, `SHEET_MATERIAIS_CAD`, `SHEET_STOCK_ATUAL`, `SHEET_AFETACOES_OBRA`, `SHEET_FATURAS`, `SHEET_FATURAS_ITENS`, `SHEET_COMPROMISSOS_OBRA`, `SHEET_PESSOAL`

## Scope Routing Rules

**If the task touches `src/`** - use GAS rules:
- Vanilla JS only, `google.script.run` for RPC, no React/npm/fetch/import-export
- Preserve HtmlService split: `index.html`, `css.html`, `js.html`
- Surgical edits, respect real Google Sheet column order

**If the task touches `backend/` or `frontend/`** - use backoffice rules:
- Full modern stack (FastAPI, React, npm, TypeScript, HTTP APIs)
- Do NOT apply GAS constraints here
- Keep `api/services/adapters/schemas` separation
- Desktop-first UX (dense layouts, compact tables, sticky action bars)

**If a task spans both tracks** - keep boundaries explicit, don't cross-contaminate patterns.

## Key Constraints

- UI/business wording in **Portuguese PT** (technical English is fine in code)
- Do not change Supabase sync structure unless explicitly requested
- Prefer incremental edits over broad rewrites
- When architecture changes, update docs in `docs/`
- Materials business rules: `FATURAS_ITENS` is purchase-line source, `AFETACOES_OBRA` is attribution layer, `MATERIAIS_MOV` is generated ledger (not manual input), `Natureza` drives valid destination behavior

## Documentation Priority

When conflicts exist, prefer in this order:
1. `docs/PROJECT_STATE.md` - current architecture snapshot
2. `docs/DECISIONS.md` - ADR-style technical choices
3. `docs/OPEN_ITEMS.md` - next steps and validation gaps
4. `docs/WORKLOG.md` - chronological changes
5. Older docs (`REGRAS_DE_NEGOCIO`, `SUPABASE_*`) are background/context only

## Configuration

Backend config via `backend/.env` (see `backend/.env.example`):
- `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_FILE` - Sheets access
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` - Supabase access
- GAS config via `.clasp.json` (rootDir=`src`, script ID in file)
