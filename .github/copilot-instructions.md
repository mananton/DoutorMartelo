# Copilot Instructions: Doutor Martelo Dashboard

## Project Overview
**Doutor Martelo** is a Google Apps Script web app for construction project cost management. It aggregates data from multiple Google Sheets (written by **AppSheet**) and presents an interactive dashboard with cost tracking, worker assiduity, and travel logistics.

- **Type**: Google Apps Script (GAS) web app + HTML5 frontend (zero npm/build steps)
- **Runtime**: V8 (modern JavaScript, ES6+)
- **Timezone**: `Europe/Lisbon` — hardcoded in `TZ` constant and `appsscript.json`
- **Data entry**: AppSheet writes to Google Sheets; this codebase is read-only against the sheets

## Architecture

### Backend Flow (`main.gs`)
1. `doGet()` → serves HTML template named `"index"` (GAS strips `.html` extension from `index.html` on push)
2. `getDashboardData()` → JSON endpoint; wraps errors as `{error: message}`
3. `buildData_(ss)` → reads all 4 sheets, aggregates hierarchically, serializes Sets before returning
4. Reader functions → normalize and validate raw sheet data

### Frontend Flow (`index.html`)
1. `window.onload` → `loadData()` → `google.script.run.withSuccessHandler(onDataLoaded).getDashboardData()`
2. `onDataLoaded(jsonStr)` → `JSON.parse` → `buildAll()`
3. `buildAll()` → chains: `buildGlobalKpis`, `buildObrasGrid`, `buildGlobalBarChart`, `buildViagensView`, `buildEquipaView`
4. Obra detail: `openObra(nome)` builds all 5 tab contents, then calls `showView('obra')`

## Sheet Structure & Readers

| Sheet | Header Rows Skipped | Reader | Key Fields |
|---|---|---|---|
| `REGISTOS_POR_DIA` | 1 (row 2 = data start) | `readRegistos_()` | `{data, nome, funcao, obra, fase, horas, falta, eur_h, custo}` |
| `OBRAS` | 2 (row 3 = data start) | `readObras_()` | `{Obra_ID, Local_ID, Ativa}` |
| `COLABORADORES` | 2 (row 3 = data start) | `readColabs_()` | `{Nome, Funcao, Eur_h}` |
| `VIAGENS_DIARIAS` | 2 (row 3 = data start) | `readViagens_()` | `{Data_str, DiaSem, V_Padrao, V_Real, V_Efetivas, Viatura, Obra, Custo_Via, custo_dia}` |

**Column map for `REGISTOS_POR_DIA`:** A=ID (skipped), B=DATA_REGISTO, C=NAME, D=FUNCAO, E=OBRA, F=FASE, G=HORAS, H=FALTA, I=EUR/H_BASE (skipped), J=EUR/H_ACTUAL, K=CUSTO

## Critical Patterns

### Aggregation in `buildData_`
- During aggregation, unique counts use `new Set()` (e.g., `trabalhadores`, `Dias`).
- **Sets must be serialized before `JSON.stringify`**: convert via `.size` for counts and `Array.from()` for arrays. Already handled in the serialization block.
- ISO week format: `"YYYY-SWW"` via `isoWeek_()` — uses a **custom** (non-standard) ISO algorithm counting from Jan 1.
- Monthly key: `r.data.slice(0,7)` → `"YYYY-MM"`.

### `infoMap` Keyed on `Local_ID`, Not `Obra_ID`
In `buildObrasGrid()` and `openObra()`, `DATA.obras_info` is indexed by `Local_ID` (the display name), not `Obra_ID`. The lookup is `infoMap[nome]` where `nome` is the obra key from `DATA.obras`.

### `buildEquipaView` Re-aggregates from `DATA.obras`
The Equipa view does **not** use `DATA.colaboradores` for cost/hour stats. It iterates `DATA.obras[*].workers[]` and accumulates across obras. `DATA.colaboradores` is only used for the "all workers" base-rate roster table.

### Frontend Data Structure
```javascript
DATA.global         // {custo_total, horas_total, obras_ativas, colaboradores, faltas, custo_viagens, total_viagens, last_update}
DATA.obras[nome]    // {custo_total, horas_total, trabalhadores, faltas, dias, all_dates, daily[], weekly[], monthly[], workers[], assiduidade[]}
DATA.obras_info     // [{Obra_ID, Local_ID, Ativa}] — raw list, not a map
DATA.viagens        // [{Data_str, DiaSem, V_Padrao, V_Real, V_Efetivas, Viatura, Obra, Custo_Via, custo_dia}]
DATA.colaboradores  // [{Nome, Funcao, Eur_h}]
```

### Formatting (Global Scope in `<script>`)
- `fmt(v)` → Euro with exactly 2 decimals, pt-PT locale (e.g., `"1.234,56 €"`)
- `fmtN(v)` → Exactly **1 decimal** fixed, pt-PT locale (e.g., `"42,5"`)
- `initials(name)` → First letter of first 2 words, uppercased
- `barHtml(pct, val, alt)` → Reusable inline bar HTML; alt=true uses blue gradient

### View & Tab System
- Views: `view-home`, `view-obra`, `view-viagens`, `view-equipa` — toggled via `showView(id)`
- Tab contents: `tab-custos-diarios`, `tab-custos-semanais`, `tab-custos-mensais`, `tab-trabalhadores`, `tab-assiduidade`, `tab-fases` — toggled via `showTab(tabId)`
- Assiduidade tab is **exception-oriented**: shows absence dates as `MM-DD`, counts presences vs faltas

## Project-Specific Conventions

- **Portuguese throughout**: sheet names, UI labels, error messages, variable names
- **Date normalization**: always `Utilities.formatDate(date, TZ, "yyyy-MM-dd")` in backend; dates arrive at frontend as `"YYYY-MM-DD"` strings
- **Fallback values**: `parseFloat(x) || 0`, `String(x).trim() || ""`
- **`falta` field**: stored as boolean `true`/`false`; reader normalizes `=== true || toLowerCase() === "true"`
- **CSS theme**: dark-only, GitHub-inspired palette via CSS variables (`--bg`, `--surface`, `--accent` = amber `#f0a500`, etc.)
- **Fonts**: DM Sans (UI) + DM Mono (numbers/mono values) from Google Fonts

## Deployment Workflow

```powershell
clasp push        # Push main.gs + index.html to Google Apps Script
clasp open web    # Open deployed web app in browser
```

No build step. `clasp` maps local files using `.clasp.json` (`scriptId` identifies the target GAS project). Runtime config in `appsscript.json` (V8, `Europe/Lisbon`, Stackdriver logging).

## When Adding Features

1. **New sheet** → add reader function (normalize dates, trim strings, parse floats), call from `buildData_()`, add to return structure
2. **New aggregation level** → follow Map pattern in `buildData_`, serialize Sets before returning
3. **New backend endpoint** → add function, call via `google.script.run.withSuccessHandler(cb).myFunction()`
4. **New UI view** → add `<div class="view" id="view-X">`, builder function, wire into `buildAll()`, add nav button
5. **New tab in obra detail** → add `<div class="tab-content" id="tab-X">`, builder called from `openObra()`, add `.tab-btn`
6. **Formatters** → add to global `<script>` scope, use `pt-PT` locale

## Key Files
- [`main.gs`](../main.gs) — backend: readers, aggregation, web app entry point
- [`index.html`](../index.html) — frontend: embedded CSS + JS, all builders and view logic
- [`appsscript.json`](../appsscript.json) — runtime config (V8, timezone, web app access)
- [`.clasp.json`](../.clasp.json) — deployment target (`scriptId`)
