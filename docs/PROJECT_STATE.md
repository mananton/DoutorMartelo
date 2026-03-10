# Project State

Last updated: 2026-03-10

## 1. Product Scope
- Google Apps Script web app for construction management dashboard.
- Data source: Google Sheets (central workbook).
- Frontend renders KPIs, obra detail, workers, materials, travel/displacements, attendance, vacations, and comparative analytics.

## 2. Current Architecture
- Backend split by responsibility:
  - `src/main.gs`: web app entrypoints and orchestration (`include`, `doGet`, `getDashboardData`), triggers, operational helpers.
  - `src/Readers.gs`: sheet readers, header normalization, dynamic column mapping, legacy-safe parsing.
  - `src/Composer.gs`: raw payload assembly (`buildRawData_`).
  - `src/Aggregators.gs`: legacy server-side aggregation (`buildData_`).
  - `src/Sync.gs`: Supabase sync boundary.
- Frontend split by concern:
  - `src/index.html`: structure/markup.
  - `src/css.html`: styles.
  - `src/js.html`: client logic, rendering, charting, filtering.
- HTML includes:
  - `<?!= include('css'); ?>` in `<head>`
  - `<?!= include('js'); ?>` before `</body>`

## 3. Runtime Data Flow
1. `doGet()` serves `index`.
2. Frontend calls `getDashboardData({ mode: 'raw_v2' })`.
3. Backend returns raw payload (`buildRawData_`).
4. Frontend normalizes via `buildDashboardFromRaw_`.
5. If parsing/loading fails, frontend retries with `mode: 'legacy'`.

## 4. Legacy Data Rules (Implemented)
- Keep costs even when old rows are incomplete.
- Cost source priority:
  - Prefer `Custo Dia` when present.
  - If `Horas * EUR/h` differs from `Custo Dia`, keep `Custo Dia`.
- Multi-name cells are treated as one worker row (no split).
- Empty `Funcao` defaults to `-`.
- Empty `Fase` defaults to `Sem Fase`.
- Date fallback: invalid/empty `DATA_REGISTO` uses `DATA_ARQUIVO`.
- Missing/invalid `Falta` treated as `false`.
- Missing `Obra` rows are ignored.
- Missing `Horas` does not infer hours from cost (`horas_total` remains numeric sum of valid hour values).

## 5. UI State (Recent)
- Obra "Cost by phase" chart now supports:
  - Metric selector: Labor / Materials / Total.
  - Chart type selector: Bar / Doughnut.
- Workers table filtering updated to include legacy "cost-only" days in time-window filtering.

## 6. Operational Notes
- `ENABLE_EMPTY_ROW_CLEANUP` is currently `false` in `src/main.gs` (temporary deactivation).
- `.clasp.json` uses `rootDir: "src"` and manifest must exist at `src/appsscript.json`.
- Keep global sheet constant names unchanged (`SHEET_REGISTOS`, etc.).
- Do not alter Supabase sync structure unless explicitly requested.

## 7. Current Risks / Watchpoints
- Some source comments/UI labels still show encoding artifacts in parts of the codebase (non-blocking but noisy).
- Legacy rows with inconsistent naming can still reduce per-worker detail accuracy.
- Doughnut readability can degrade when many phases exist.

