# Materials Backoffice Plan

Status: planned  
Last updated: 2026-03-18

## Objective
Define the next migration step for materials, invoices, and stock operations without losing the current Google Sheets operating model.

The goal is not to replace everything at once.

The goal is to introduce a dedicated web/app workflow for:
- `FATURAS`
- `FATURAS_ITENS`
- `MATERIAIS_CAD`
- `AFETACOES_OBRA`

while keeping:
- Google Sheets as the always-available operational record
- AppSheet for labour and displacements in the short term
- Supabase as the parallel structured backend

## Recommended Operating Split

### Keep AppSheet for now
AppSheet should continue to handle the operational flows that are already stable enough in the current stack:
- labour / attendance input
- displacements / travel input

Reason:
- those flows already exist in a mobile-friendly operational path
- replacing them now would increase migration risk without solving the current pain point

### Introduce a dedicated app for materials and purchasing
A separate web/app should be introduced for:
- invoice registration
- invoice lines
- catalog-assisted item mapping
- obra/fase attributions
- future stock operations

Reason:
- the current pain point is not labour input
- the current pain point is the materials / invoices / stock flow becoming too complex and too sensitive to cell-by-cell GAS automations

## Core Principle
The new app should not exist only to write into Google Sheets with nicer forms.

That would improve UX a bit, but it would keep the fragile part of the system in GAS triggers.

The better model is:
1. User fills the dedicated app.
2. The app sends the action to a backend service.
3. The backend validates the action and applies business rules.
4. The backend writes the operational result to Google Sheets.
5. The backend also writes or syncs the structured result to Supabase.

This keeps Google Sheets alive as a business record while moving business logic out of cell-trigger timing.

## Why this is better than the current GAS-only pattern

### Current issues in the sheet-first reactive flow
- logic runs during incomplete row entry
- triggers react at the wrong moment from a business point of view
- performance degrades as automations become richer
- movement ledgers can feel unstable because rows are generated from cell-by-cell edits
- debugging is harder because state changes are spread across edit events

### Expected improvements with a dedicated app + backend
- validation before commit, not during half-filled rows
- explicit save/process actions
- clearer control over generated vs manual records
- less trigger churn in Google Sheets
- better auditability
- easier migration path to Supabase without abandoning Sheets

## Proposed Architecture

### Input channels
- `AppSheet`
  - continues for labour and displacements
- `Materials Backoffice App`
  - new UI for invoices, invoice items, catalog, and obra/fase attributions

### Storage / truth model
- Google Sheets
  - remains always populated
  - remains the operational spreadsheet record
- Supabase
  - receives structured mirrored data
  - becomes the long-term query/reporting/backend base

### Business logic layer
- recommended: dedicated backend service
- preferred direction already aligned with project docs: `FastAPI`

The backend should own:
- validation
- enrichment
- item matching rules
- generation of technical movements
- stock calculations / recalculation triggers
- controlled write order to Sheets and Supabase

## Practical Day-to-Day Flow

### Faturas
User opens the new app and creates a document equivalent to the current `FATURAS` row.

Backend writes:
- Google Sheets `FATURAS`
- Supabase `faturas`

### Faturas Itens
User adds one or more invoice lines.

Backend:
- resolves `ID_Item` / `Item_Oficial` against `MATERIAIS_CAD`
- validates `Natureza`
- validates destination rules
- writes:
  - Google Sheets `FATURAS_ITENS`
  - Supabase `faturas_itens`

### MATERIAIS_CAD
When a supplier description does not match an existing item, the user can:
- create a new catalog item
- accept or edit a suggested official item

Backend writes:
- Google Sheets `MATERIAIS_CAD`
- Supabase `materiais_cad`

### AFETACOES_OBRA
User registers obra/fase attribution explicitly in the app.

Cases:
- direct purchase to obra/fase
- later stock consumption to obra/fase

Backend writes:
- Google Sheets `AFETACOES_OBRA`
- Supabase `afetacoes_obra`
- generated technical movement in:
  - Google Sheets `MATERIAIS_MOV`
  - Supabase `materiais_mov`

## Sheets Preservation Rule
Google Sheets should remain populated at all times.

That means the new app is not a replacement for storing data.

It is a safer input layer plus a controlled business-logic layer.

In practical terms:
- users work in the new app
- backend writes the final accepted result into Sheets
- Sheets remain a complete operational record

## Supabase Write Strategy

### Recommended
The backend should write:
- first to Google Sheets
- then to Supabase
or
- to both in a controlled transaction-like application flow with retry logging

The exact order can be decided later, but the important rule is:
- the write must be backend-controlled
- not frontend-direct-to-Sheets plus GAS side effects

## Minimum Scope for the First Version
The first version of the new app should cover only the unstable part of the operation:
- `FATURAS`
- `FATURAS_ITENS`
- `MATERIAIS_CAD`
- `AFETACOES_OBRA`

Out of scope for the first version:
- labour input
- displacements input
- vacations
- comparative dashboard migration

## Suggested Phases

### Phase 1 - Functional design freeze
- confirm exact fields, states, and validations for:
  - `FATURAS`
  - `FATURAS_ITENS`
  - `MATERIAIS_CAD`
  - `AFETACOES_OBRA`
- confirm generated vs editable fields
- confirm direct-consumption vs stock-consumption rules

### Phase 2 - Backend contract
- define backend endpoints for the new app
- define write order to Google Sheets and Supabase
- define idempotency rules
- define how generated `MATERIAIS_MOV` is created from input entities

### Phase 3 - First screens
- invoice header screen
- invoice items screen
- item-catalog support screen
- obra attribution screen

### Phase 4 - Pilot with Sheets still active
- use the new app for a limited materials flow
- confirm that Sheets stay fully populated
- compare generated values with current dashboard expectations

### Phase 5 - Expand scope only if stable
- optional later replacement of more operational flows
- optional later reduction of AppSheet scope

## Decision Summary
Recommended future split:
- `AppSheet` stays for:
  - labour
  - displacements
- new dedicated app handles:
  - invoices
  - invoice items
  - materials catalog
  - obra/fase attributions

This is the safest path because it attacks the unstable materials flow first while preserving the rest of the operational system.

## Operational Follow-up
The plan above is now expanded into an MVP execution spec in:
- `docs/MATERIALS_BACKOFFICE_SPEC.md`

That spec defines:
- first screens
- generated-vs-editable rules
- minimum backend endpoints
- write order to Google Sheets and Supabase
