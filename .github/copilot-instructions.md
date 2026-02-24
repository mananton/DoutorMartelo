# Copilot Instructions: Doutor Martelo Dashboard

## Project Overview
**Doutor Martelo** is a Google Apps Script web app for construction project cost management. It aggregates data from multiple Google Sheets (written by **AppSheet**) and presents an interactive dashboard with cost tracking, worker assiduity, travel logistics, and cross-obra comparative analysis.

- **Type**: Google Apps Script (GAS) web app — single-file HTML frontend (`index.html` ~4100 lines, inline CSS + JS)
- **Runtime**: V8 (ES6+) — no npm, no build step, no bundler
- **CDNs**: Google Fonts (Inter 300-700), Font Awesome 6.5.1, Chart.js v4
- **Timezone**: `Europe/Lisbon` — hardcoded in `TZ` constant and `appsscript.json`
- **Data entry**: AppSheet writes to Google Sheets; this codebase is read-only against the sheets

## Architecture

### Backend (`main.gs`)
1. `doGet()` → serves `index` template (GAS strips `.html` extension)
2. `getDashboardData()` → JSON endpoint; wraps errors as `{error: message}`
3. `buildData_(ss)` → reads 5 sheets, aggregates hierarchically, serializes Sets (`.size` / `Array.from()`) before `JSON.stringify`

### Frontend (`index.html`)
1. `initTheme()` + `initKeyboardNav()` + `initResizeObservers()` run at script load
2. `window.onload` → `loadData()` → `google.script.run.getDashboardData()`
3. `onDataLoaded(jsonStr)` → `JSON.parse` → `buildAll()` → `stopRefreshSpinner()` → `checkAlerts()`
4. `buildAll()` chains 6 section builders + sidebar population

### Navigation — Section-Based (not views/tabs)
Six sections toggled via `showSection(id)` — updates sidebar active state, breadcrumb, mobile nav:

| Section ID | Title | Builder(s) | Chart Registry |
|---|---|---|---|
| `overview` | Visão Geral | `buildOverview()` | (none — KPI cards only) |
| `obra-detail` | Detalhe da Obra | `buildObraKpis/Charts/WorkersTable()` | `obraCharts{}` (daily, weekly, workers, fases) |
| `deslocacoes` | Deslocações | `buildDeslocacoes()` | `deslCharts{}` (obra, time) |
| `equipa` | Equipa | `buildEquipa()` | `equipaCharts{}` (funcao, top) + `equipaDetailChart` |
| `assiduidade` | Assiduidade | `buildAssiduidade()` via `assidSelectObra/Worker` | (none — heatmap calendar) |
| `comparativa` | Análise Comparativa | `buildCompCustos/Radar/Fases/Evo()` | `compCharts{}` (custos, radar, fasecusto, fasehoras, evo) |

HTML pattern: `<div class="section" id="section-{id}">`. Sidebar nav items use `data-section="{id}"`.

## Sheet Structure & Readers

| Constant | Sheet Name | Reader | Key Fields |
|---|---|---|---|
| `SHEET_REGISTOS` | `REGISTOS_POR_DIA` | `readRegistos_()` | `data, nome, funcao, obra, fase, horas, atraso_min, falta, motivo, eur_h, custo` |
| `SHEET_OBRAS` | `OBRAS` | `readObras_()` | `Obra_ID, Local_ID, Ativa` |
| `SHEET_COLAB` | `COLABORADORES` | `readColabs_()` | `Nome, Funcao, Eur_h` |
| `SHEET_VIAGENS` | `VIAGENS_DIARIAS` | `readViagens_()` | `Data_str, DiaSem, V_Padrao, V_Real, V_Efetivas, Viatura, Obra, Custo_Via, custo_dia` |
| `SHEET_DESLOCACOES` | `REGISTO_DESLOCACOES` | `readDeslocacoes_()` | `data, obra, origem, qtd, custo` |

**Viagens vs Deslocações**: `VIAGENS_DIARIAS` = vehicle-level daily trips (generic). `REGISTO_DESLOCACOES` = obra-attributed trip costs (what the frontend section uses as `DATA.deslocacoes`).

## Frontend Data Structure
```javascript
DATA.global       // {custo_total, custo_mao_obra, custo_deslocacoes, horas_total, total_atrasos, obras_ativas, colaboradores, faltas, custo_viagens, total_viagens, last_update}
DATA.obras[nome]  // {custo_total, custo_mao_obra, custo_deslocacoes, horas_total, atraso_total, trabalhadores, faltas, dias, all_dates[], daily[], weekly[], monthly[], workers[], assiduidade[], fases[]}
DATA.obras_info   // [{Obra_ID, Local_ID, Ativa}] — indexed by Local_ID (display name), NOT Obra_ID
DATA.deslocacoes  // [{data, obra, origem, qtd, custo}]
DATA.viagens      // [{Data_str, DiaSem, V_Padrao, V_Real, V_Efetivas, Viatura, Obra, Custo_Via, custo_dia}]
DATA.colaboradores // [{Nome, Funcao, Eur_h}]
```

**Date filtering caveat**: `DATA.obras[nome].workers` is pre-aggregated (no per-date granularity) — cannot be date-filtered. Only `daily[]`, `assiduidade[].dias{}`, and `DATA.deslocacoes[]` support `dateInRange()` filtering. `weekly[]` uses `YYYY-SWW` format and is not date-filtered.

## Chart.js Patterns
- **14 chart instances** across 4 dictionaries + 1 standalone — always destroy before rebuild: `destroyObraCharts()`, etc.
- **Theme-aware**: `updateAllChartsTheme()` iterates all registries, updates grid/tick colors, calls `chart.update('none')`
- **Global defaults** set in `applyTheme()`: `Chart.defaults.color`, `Chart.defaults.borderColor`
- **Palette**: `CHART_PALETTE` array with 10 colors; `generateDistinctColors(n)` for N>10

## Polishing Systems (recent additions)

| Feature | Key Functions | Storage |
|---|---|---|
| **Theme toggle** (dark/light) | `initTheme()`, `toggleTheme()`, `applyTheme()`, `updateAllChartsTheme()` | `localStorage('dm-theme')` with try/catch for GAS sandbox |
| **Global date filter** | `dateInRange()`, `applyGlobalFilter()`, `setQuickFilter(preset)`, `computeFilteredGlobal()` | `globalDateFrom/To` globals |
| **Toast notifications** | `showToast(msg, type, duration)`, `checkAlerts()` | `#toast-container` DOM |
| **Skeleton loading** | `showSkeletons()`, `startRefreshSpinner()`, `stopRefreshSpinner()` | CSS `.skeleton` class |
| **KPI tooltips** | `KPI_TOOLTIPS{}` map → injected as `?` icon in `buildOverview()` | CSS hover visibility |
| **Keyboard nav** | `initKeyboardNav()` — Alt+1-6 sections, Escape close panels | keydown listener |
| **Breadcrumb** | `updateBreadcrumb()` — reflects section + obra + worker context | `#breadcrumb` DOM |
| **Mobile bottom nav** | `updateMobileNav()` — replaces sidebar at <600px | `#mobile-bottom-nav` |
| **Print** | `printReport()` → `window.print()` | `@media print` CSS |
| **ResizeObserver** | `initResizeObservers()` — resizes all visible charts on container resize | Observes `#main-content` |

## Critical Patterns

- **Equipa re-aggregates from `DATA.obras`**: iterates `DATA.obras[*].workers[]` across all obras. `DATA.colaboradores` is only for base-rate roster.
- **`obras_info` keyed on `Local_ID`**: lookup is `infoMap[nome]` where `nome` is the obra key in `DATA.obras`.
- **Set serialization**: aggregation uses `new Set()` for unique counts — must convert via `.size`/`Array.from()` before `JSON.stringify`.
- **ISO week format**: `"YYYY-SWW"` via `isoWeek_()` — custom algorithm counting from Jan 1 (non-standard).

## Conventions
- **Portuguese throughout**: sheet names, UI labels, error messages, commit messages
- **Date format**: `Utilities.formatDate(date, TZ, "yyyy-MM-dd")` in backend; `"YYYY-MM-DD"` strings in frontend
- **Fallback values**: `parseFloat(x) || 0`, `String(x).trim() || ""`
- **Formatters**: `fmt(v)` → `"1.234,56 €"` (pt-PT), `fmtN(v)` → `"42,5"`, `initials(name)` → `"DM"`
- **CSS variables**: `:root` for dark theme defaults, `[data-theme="light"]` override block
- **Font**: Inter (Google Fonts) — weights 300-700

## Deployment
```powershell
clasp push        # Push main.gs + index.html to Google Apps Script
clasp open web    # Open deployed web app in browser
```
No build step. `.clasp.json` maps to GAS project via `scriptId`. Config in `appsscript.json` (V8, `Europe/Lisbon`, Stackdriver).

## When Adding Features
1. **New sheet** → add `SHEET_X` constant + `readX_()` reader (normalize dates, trim strings, parse floats), call from `buildData_()`, add to return
2. **New section** → add `<div class="section" id="section-X">`, builder function, wire into `buildAll()`, add sidebar `.nav-item[data-section="X"]`, add to `sectionTitles`, add mobile nav button, update keyboard nav map
3. **New chart** → add canvas in section HTML, builder function with `destroy` guard, register in appropriate `xxxCharts{}` dictionary so theme/resize updates work
4. **New KPI** → add to `buildOverview()` cards array + `KPI_TOOLTIPS` map
5. **New alert** → add condition check in `checkAlerts()`, call `showToast()` with appropriate type

## Key Files
- [`main.gs`](../main.gs) — backend: 5 readers, aggregation, web app entry point
- [`index.html`](../index.html) — frontend: inline CSS (~1120 lines) + JS (~3000 lines), all section builders
- [`appsscript.json`](../appsscript.json) — runtime config (V8, timezone, web app access)
- [`.clasp.json`](../.clasp.json) — deployment target (`scriptId`)
