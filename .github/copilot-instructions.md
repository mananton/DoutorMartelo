# Copilot Instructions: Doutor Martelo Dashboard

## Project Overview
**Doutor Martelo** is a Google Apps Script web app for construction project cost management. It aggregates data from multiple Google Sheets and presents an interactive dashboard with cost tracking, worker assiduity, and travel logistics.

- **Type**: Google Apps Script (GAS) web app + HTML5 frontend
- **Runtime**: V8 (modern JavaScript)
- **Timezone**: Europe/Lisbon (hardcoded throughout)
- **Data Source**: Google Sheets with 4 primary sheets

## Architecture

### Backend Flow (main.gs)
1. **doGet()** → Serves HTML template
2. **getDashboardData()** → JSON endpoint called by frontend
3. **buildData_(ss)** → Aggregates all sheet data into hierarchical structure
4. **Reader functions** → Extract and normalize data from each sheet

### Frontend Flow (index.html)
1. **loadData()** → Calls `google.script.run.getDashboardData()`
2. **onDataLoaded()** → Parses JSON, triggers buildAll()
3. **buildAll()** → Chains builders for KPIs, obra cards, charts
4. **View/Tab System** → DOM manipulation with `showView()`, `showTab()`

## Sheet Structure & Readers

All sheets skip header rows (start reading from row 3 for static data, row 2 for records).

| Sheet Name | Columns Used | Reader Function | Key Output |
|---|---|---|---|
| REGISTOS_POR_DIA | 12 cols (A-K) | readRegistos_() | `{data, nome, funcao, obra, fase, horas, falta, eur_h, custo}` |
| OBRAS | 3 cols | readObras_() | `{Obra_ID, Local_ID, Ativa}` |
| COLABORADORES | 3 cols | readColabs_() | `{Nome, Funcao, Eur_h}` |
| VIAGENS_DIARIAS | 9 cols | readViagens_() | `{Data_str, V_Padrao, V_Real, V_Efetivas, Viatura, Obra, custo_dia}` |

**Column Mapping Example (REGISTOS_POR_DIA):**
- A=ID, B=DATA_REGISTO, C=NAME, D=FUNCAO, E=OBRA, F=FASE, G=HORAS, H=FALTA, I=EUR/H_BASE, J=EUR/H_ACTUAL, K=CUSTO

## Aggregation Patterns

### Data Nesting (buildData_)
Registos are aggregated with multiple grouping levels:
- **Per-obra**: `obraMap[nome] = {custo_total, horas_total, trabalhadores, faltas, ...}`
- **Per-day**: `daily[data] = {Custo, Horas, Trabalhadores, Faltas}`
- **Per-week**: `weekly[isoWeek] = {Custo, Horas}` (ISO week format: "YYYY-SWW")
- **Per-worker**: `workerMap[nome] = {funcao, fase, Custo, Horas, Dias, Faltas}`
- **Assiduity**: `assidMap[nome].dias[data] = {horas, falta, custo}`

### Critical Helper
- **isoWeek_(dateStr)** → Returns "YYYY-SWW" format for weekly grouping
- Date handling: Accept Date objects or YYYY-MM-DD strings, always normalize to YYYY-MM-DD

## Frontend Conventions

### Data Access Pattern
```javascript
DATA.global         // {custo_total, horas_total, obras_ativas, colaboradores, faltas, ...}
DATA.obras[obraNome] // Per-obra detail including daily, weekly, monthly, workers
DATA.viagens        // Array of daily travel records
DATA.colaboradores  // Master list of workers with base hourly rates
```

### Formatting Functions (Global)
- `fmt(value)` → Euro format with 2 decimals (e.g., "1.234,56 €")
- `fmtN(value)` → Number format with 1-2 decimals (e.g., "42,5 h")
- `initials(name)` → First letters of first 2 words for avatars

### View System
- Views: `view-home`, `view-obra`, `view-viagens`, `view-equipa`
- Tabs: Within obra view, content rendered into `tab-{tabId}` divs
- Tab targets: `custos-diarios`, `custos-semanais`, `custos-mensais`, `trabalhadores`, `assiduidade`

### HTML Builders (All render into specific IDs)
- `buildGlobalKpis()` → `#global-kpis`
- `buildObrasGrid()` → `#obras-grid`
- `buildDailyCosts(o)` → `#tab-custos-diarios`
- `buildWorkers(o)` → `#tab-trabalhadores`
- `buildAssiduidade(o)` → `#tab-assiduidade` (Exception-oriented: faltas only, dates as MM-DD)

## Project-Specific Patterns

### Don't Do This
- ❌ Hardcoding URLs in HTML; use template injection
- ❌ Modifying sheet structure without updating reader functions
- ❌ Treating dates as strings without normalization
- ❌ Forgetting `.trim()` on sheet string values
- ❌ Using `[false]` or `[0]` for boolean/integer checks—use explicit comparisons

### Do This
- ✅ Normalize dates in readers to YYYY-MM-DD format consistently
- ✅ Use Set for unique values during aggregation (convert to `.size` when serializing)
- ✅ Filter out empty/header rows in readers before mapping
- ✅ Serialize Sets to primitives before JSON.stringify (already done in buildData_)
- ✅ Always include fallback values: `parseFloat(x) || 0`, `String(x).trim() || ""`

### Language & Localization
- Portuguese labels throughout (sheets, UI, error messages)
- Time formatting always uses `Utilities.formatDate(date, "Europe/Lisbon", "yyyy-MM-dd")`
- Number formatting uses `toLocaleString('pt-PT', {...})` for frontend display

## Deployment & Workflow

Run from terminal in workspace directory:
```powershell
clasp push        # Deploy to Google Apps Script
clasp open web    # Open dashboard in browser
```

Configuration in `.clasp.json` and `appsscript.json` (V8 runtime, user-deployed execution).

## When Adding Features

1. **New sheet data** → Add reader function, integrate into buildData_()
2. **New aggregation** → Follow nesting pattern (keep data hierarchical)
3. **New UI view** → Create builder function, add tab if obra-detail, integrate into buildAll()
4. **Formatter helpers** → Add to global scope in `<script>` section (pt-PT locale)
5. **Data endpoint** → Add function, call via `google.script.run.newFunction()`

## Key Files Reference
- [main.gs](../main.gs) – Backend logic, readers, data aggregation
- [index.html](../index.html) – Frontend UI, builders, formatters (embedded CSS + JS)
- [appsscript.json](../appsscript.json) – V8 runtime, web app config
