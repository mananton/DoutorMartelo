# Materials Backoffice UI Refactor Plan

Last updated: 2026-03-19
Status: proposal for implementation planning

## 1. Purpose
- Define a concrete visual and structural refactor plan for the materials backoffice UI.
- Reduce visual noise without losing operational visibility.
- Keep the app aligned with the current product direction:
  - operational backoffice
  - Google Sheets remains the always-populated record
  - app + backend own validation and guided flow

This plan is intentionally focused on:
- layout hierarchy
- interaction model
- information density
- page-by-page refactor direction
- desktop-first operator ergonomics

It is not a “rebrand”.
It is a usability and clarity refactor.

## 2. Current Diagnosis

Based on the current React app in `frontend/src/`:

- the visual base is already mostly appropriate:
  - light mode
  - blue + amber accents
  - technical typography (`Fira Sans` + `Fira Code`)
  - compact cards
- the main problem is not color or brand style
- the main problem is information competition

### Current UX pain points
- pages often give the same visual weight to:
  - context
  - form
  - preview
  - validation feedback
  - technical output
  - historical list
- too many card-like blocks compete for attention at once
- list pages are readable, but they feel more like stacked cards than focused workspaces
- technical detail is useful, but it is often surfaced too early instead of progressively
- sync and diagnostics are strong features, but they currently read as “everything visible now”

## 3. Recommended Visual Direction

### Reference direction
Use a `data-dense operational dashboard` style, not a marketing UI and not a spreadsheet clone.

### Explicit target posture
- `materials backoffice` is desktop-first
- `legacy dashboard` remains mobile-first
- responsive fallback still matters, but desktop ergonomics should drive the default hierarchy for the materials app

### Keep
- current light theme direction
- blue as structural/action color
- amber for attention/warnings
- green only for positive confirmation
- `Fira Sans` for UI text
- `Fira Code` only for IDs, document numbers, entity codes, and technical labels

### Avoid
- adding more decorative cards just to separate information
- using long helper text everywhere
- showing diagnostics and technical consequences at the same visual level as the main form
- making every page a two-column “form + list” by default when the task is more workflow-based

## 4. Core Layout Principle

The app should move toward a three-zone model:

1. primary workspace
2. secondary assistant rail
3. collapsible technical or historical support area

### Primary workspace
- where the main user action happens
- form, editable grid, or main table

### Assistant rail
- right-side support area on desktop
- below content on smaller screens
- shows:
  - mapping result
  - impact preview
  - warnings
  - stock snapshot
  - quick actions

### Support area
- historical list, generated records, diagnostics, or technical confirmation
- should be shown as:
  - drawer
  - tabs
  - accordion
  - collapsible panel
- not as a full competing first-class block unless it is the actual main task of the page

## 5. Shared UI Rules

### R-001: Promote one main action per page
- each page should make it obvious what the operator is meant to do first

### R-002: Reduce repeated explanatory text
- keep short helper text near the action
- move long explanations to:
  - tooltip
  - info block
  - expandable guidance

### R-003: Prefer tabs, drawers, and accordions over more top-level cards
- use sub-sections only where they reduce scanning cost

### R-004: Keep summaries numeric and compact
- summary cards should answer:
  - what is selected
  - what is the cost/impact
  - what is the current state
- no large prose inside summary cards

### R-005: Errors and warnings should appear close to the field or action
- global form message can remain
- but field-level feedback should become more local over time

### R-006: Technical data should be visible, but not dominant
- generated ledgers and diagnostics should be easy to inspect
- they should not visually overpower the main data-entry flow

## 6. App Shell Refactor

Current shell reference:
- `frontend/src/App.tsx`

### Current issue
- topbar mixes app identity, mixed-mode warning, and reload state in a way that is useful but still visually heavy

### Refactor target
- keep left navigation
- keep the global mixed-mode status
- compress topbar into:
  - page title / short subtitle
  - small environment/status strip
  - one concise mixed-mode note

### Proposed shell structure
- left nav
- top utility strip:
  - environment
  - last reload
  - source
- main page header:
  - title
  - short one-line operational hint

### Optional future improvement
- mobile bottom nav only after page-level hierarchy is improved

## 7. Page-by-Page Plan

## 7.1 Faturas

Current reference:
- `frontend/src/pages/FaturasPage.tsx`

### Current pattern
- left: create/edit form
- right: list of invoices

### What works
- simple entry point
- list and form are both easy to find

### What feels noisy
- both columns compete equally all the time
- list rows already contain several actions and metadata
- the page reads like CRUD before workflow

### Refactor target
- turn this into a “queue + editor” page

### Proposed layout
- left 35%:
  - invoice list
  - search/filter row later
- right 65%:
  - create/edit workspace
  - key metadata grouped in a compact form grid
  - action bar pinned at bottom of panel

### Design notes
- selecting a row should feel like opening a working document
- `Nova Fatura` should be a clear action, not only the default form state
- show `estado` and `line count` more visibly in list rows

### Phase suggestion
- Phase 1:
  - invert the current emphasis so the list becomes navigation and the form becomes the real workspace

## 7.2 Detalhe da Fatura / Itens

Current reference:
- `frontend/src/pages/FaturaDetailPage.tsx`

### Current pattern
- left:
  - invoice detail
  - existing items list
- right:
  - line form
  - mapping summary
  - impact preview
  - suggestions

### This page is the highest-value refactor target
It already has the right product features.
The opportunity is mostly hierarchy and progressive disclosure.

### Current issue
- too many important things are visible at once:
  - invoice context
  - launched items
  - editable form
  - mapping status
  - totals
  - impact preview
  - suggestions
  - quick-create catalog flow

### Refactor target
- make this page feel like a dedicated “line entry workspace”

### Proposed layout
- top:
  - compact invoice header strip
  - supplier / document / date / totals
- main center:
  - line form
- right assistant rail:
  - selected item mapping
  - consequence preview
  - catalog suggestions
  - quick-create catalog action
- lower section:
  - existing lines table/list
  - collapsible by default after first load if needed

### Key interaction changes
- `Ver impacto` should live in the assistant rail, not compete with save
- existing lines should move lower in the page or into a tab:
  - `Adicionar Linha`
  - `Linhas Existentes`
- mapping state should use one compact state card instead of several equally weighted summary blocks

### Proposed sub-structure
- Tab 1: `Adicionar / Editar Linha`
- Tab 2: `Linhas da Fatura`

This is one place where “sub-quadro” makes sense.
It reduces clutter while keeping both tasks on the same screen.

## 7.3 Catalogo

Current reference:
- `frontend/src/pages/CatalogoPage.tsx`

### Current pattern
- left form
- right list

### Current issue
- page feels like raw CRUD
- missing a stronger distinction between:
  - maintenance
  - review
  - lookup

### Refactor target
- split the catalog into:
  - maintenance workspace
  - searchable review list

### Proposed layout
- top row:
  - search
  - filters:
    - natureza
    - estado
    - fornecedor
- body:
  - left: list/table of catalog entries
  - right: item editor

### Better model for this page
- the list should become the main object
- the form should become the editor for the selected row

### Optional future tabs
- `Catalogo`
- `Pendentes`
- `Novo Item`

This is another place where tabs would help more than more cards.

## 7.4 Afetacoes

Current reference:
- `frontend/src/pages/AfetacoesPage.tsx`

### Current pattern
- form at top-left with summary cards
- suggestions and stock context mixed into the same general flow
- recent list elsewhere in the same page

### Current issue
- this page mixes:
  - item selection
  - stock validation
  - cost estimate
  - obra/fase assignment
  - historical list
  - edit path
- the operational task is sensitive and deserves a more guided sequence

### Refactor target
- make this page read like a step-based stock output workflow

### Proposed layout
- main workspace:
  1. select item
  2. review stock snapshot
  3. define obra/fase and quantity
  4. review impact
  5. save
- assistant rail:
  - selected item
  - stock atual
  - custo medio atual
  - risk state:
    - stock insuficiente
    - sem contexto
    - item valido
- lower section:
  - recent manual afetacoes

### Best structural change
- replace equal-weight summary cards with a sequential “operator path”

### Suggested page sections
- `Passo 1: Item`
- `Passo 2: Consumo`
- `Passo 3: Impacto`

This is a strong candidate for progressive disclosure.

## 7.5 Sincronizacao

Current reference:
- `frontend/src/pages/SyncPage.tsx`

### Current issue
- the page is useful but visually overloaded
- KPI cards, warning note, action buttons, diagnostics, and job cards all compete at once

### Refactor target
- make sync feel like an operator console, not a debug dump

### Proposed layout
- top strip:
  - pending retries
  - last success
  - last reload
- action bar:
  - `Recarregar do Sheets`
  - `Diagnosticar divergencias`
  - `Reenviar pendentes`
- main body:
  - Tab 1: `Estado`
  - Tab 2: `Diagnostico`

### State tab
- entity status cards or compact table

### Diagnostic tab
- accordion by entity:
  - counts
  - missing IDs
  - field mismatches
- hide mismatch row details until expanded

### Why
- diagnostics are valuable
- but they should not dominate the default operational view

## 7.6 Tecnico

Current reference:
- `frontend/src/pages/TecnicoPage.tsx`

### Current issue
- useful data is presented as a wall of cards
- this lowers scan speed for technical validation

### Refactor target
- make `Tecnico` feel like a compact read-only console

### Proposed layout
- top:
  - global search
  - quick filters
- tabs:
  - `Stock Atual`
  - `Movimentos`
- inside each tab:
  - compact table
  - row click opens drawer/detail panel

### Suggested columns
#### Stock Atual
- `ID_Item`
- `Item_Oficial`
- `Unidade`
- `Stock`
- `Custo Medio`

#### Movimentos
- `ID_Mov`
- `Tipo`
- `ID_Item`
- `Item_Oficial`
- `Quantidade`
- `Obra`
- `Fase`
- `Source`

### Why
- technical users want comparison and scan speed
- tables beat stacked cards here

## 8. Suggested New Shared Components

To reduce inconsistency, create a small UI vocabulary instead of page-specific layout hacks.

### Candidate shared components
- `PageHeader`
- `ActionBar`
- `SummaryStrip`
- `AssistantRail`
- `RecordList`
- `CompactTable`
- `EmptyState`
- `InfoCallout`
- `DiagnosticAccordion`
- `EntityStatusBadge`
- `DetailDrawer`

## 9. CSS / Design System Direction

### Keep current tokens as base
Current color direction in `frontend/src/styles.css` is already close to the desired system.

### Add structural tokens
- `--panel-muted`
- `--panel-rail`
- `--warning-bg`
- `--success-bg`
- `--danger-bg`
- `--shadow-soft`
- `--shadow-focus`

### Add size tiers
- `compact`
- `regular`
- `dense`

This makes it possible to support:
- operator-heavy screens
- technical views
- mobile fallback

## 10. Recommended Delivery Phases

## Phase 1 - Layout hierarchy
- refactor shell header
- refactor `FaturaDetailPage`
- refactor `SyncPage`

Why first:
- these pages currently contain the highest information competition

## Phase 2 - Guided operations
- refactor `AfetacoesPage`
- refactor `CatalogoPage`

Why second:
- they benefit most from clearer workflow structure after the shared layout vocabulary exists

## Phase 3 - Technical consolidation
- refactor `TecnicoPage` into tabular read-only console
- add detail drawer pattern

## Phase 4 - Density polish
- denser desktop spacing for operator-heavy pages
- stronger desktop scan patterns for lists and status consoles
- optional compact mode
- lower repeated helper text
- keyboard and action-bar ergonomics

## 11. Immediate Recommendation

If only one refactor starts now, start with:
- `frontend/src/pages/FaturaDetailPage.tsx`

Reason:
- it is the most central workflow page
- it already contains the value of the new app
- improving its hierarchy will establish the visual language for the rest of the backoffice

After that:
- `frontend/src/pages/SyncPage.tsx`

Reason:
- it can quickly become much calmer and more operator-friendly with tabs/accordion/progressive disclosure

## 12. Success Criteria

The refactor is successful if:
- the user can tell the main action of each page within 3 seconds
- technical detail is still accessible but no longer visually dominant
- forms, previews, and historical lists stop competing equally on the same screen
- the app feels more like an operational workstation and less like stacked CRUD panels
