# Materials Backoffice MVP Spec

Status: proposed  
Last updated: 2026-03-18

Related:
- `docs/MATERIALS_BACKOFFICE_PLAN.md`
- `docs/PROJECT_STATE.md`
- `docs/DECISIONS.md`

## 1. Purpose
Turn the materials/purchasing migration plan into an executable MVP specification for:
- first screens
- first backend endpoints
- write order to Google Sheets and Supabase
- generated-vs-manual rules

This document does not replace the current spreadsheet model.

It defines the first dedicated app that should reduce trigger-driven instability while keeping Google Sheets always populated.

## 2. Scope

### In scope for MVP
- `FATURAS`
- `FATURAS_ITENS`
- `MATERIAIS_CAD`
- `AFETACOES_OBRA`
- generated `MATERIAIS_MOV` from controlled backend logic

### Explicitly out of scope for MVP
- labour input
- displacement input
- vacations
- dashboard migration
- multi-warehouse stock
- supplier portal / OCR ingestion

## 3. Operating Model

### Input-channel split
- `AppSheet` remains the input channel for:
  - labour
  - displacements
- `Materials Backoffice App` becomes the input channel for:
  - invoices
  - invoice lines
  - catalog maintenance
  - obra/fase attributions

### Storage split
- Google Sheets remains the always-populated operational record.
- Supabase receives mirrored structured data.

### Logic split
- The new app must not depend on cell-by-cell GAS triggers for business rules.
- The backend owns:
  - validation
  - item matching
  - generation of `AFETACOES_OBRA`
  - generation of `MATERIAIS_MOV`
  - write ordering
  - sync state to Supabase

## 4. Product Principles

### P-001: Save actions, not reactive cell edits
The app should process business rules on explicit user actions:
- `Guardar`
- `Adicionar linha`
- `Processar`
- `Confirmar`

It should not mimic spreadsheet timing behavior.

### P-002: Generated records must be visible but not ambiguous
The operator must be able to see generated downstream records, but must not be allowed to edit technical ledgers as if they were source records.

### P-003: One source of truth per business step
- purchase header -> `FATURAS`
- purchase line -> `FATURAS_ITENS`
- obra/fase attribution -> `AFETACOES_OBRA`
- technical stock/cost ledger -> `MATERIAIS_MOV`

### P-004: Google Sheets must stay complete
Every accepted action in the new app must be written back to Google Sheets.

### P-005: Supabase sync must not block daily operation
If Supabase write fails, the business action should still complete in Sheets and remain marked for retry.

## 5. UX Direction for MVP

This is an operational backoffice, not a marketing site.

Recommended visual direction for the first build:
- light mode by default
- high-contrast data-first layout
- compact dense tables with strong row states
- monospace accents only for IDs, statuses, and document numbers
- explicit save/process controls
- no hidden auto-processing on half-complete forms

Reference design-system direction used for this spec:
- palette: blue + amber on light neutral surfaces
- typography mood: technical, precise, dashboard-oriented
- avoid decorative gradients and landing-page patterns

## 6. Shared App Shell

### Main navigation
- `Faturas`
- `Itens de Fatura`
- `Catalogo`
- `Afetacoes`
- `Sincronizacao`

### Global shell behavior
- top bar with:
  - current environment
  - sync status
  - current user
- left navigation on desktop
- bottom/tab navigation on mobile if needed later

### Shared interaction rules
- unsaved changes warning on leave
- optimistic UI only after server validation is lightweight and deterministic
- primary actions fixed in the visible action bar
- generated technical data shown in read-only side panels or drawers

### Label-to-sheet rule
UI labels may be cleaner than raw spreadsheet headers, but backend write adapters must preserve the real Google Sheets column names.

Example:
- UI label: `Numero Doc/Fatura`
- Sheet column preserved by backend: `Nº Doc/Fatura`

## 7. Screen 1 - FATURAS

### Goal
Register and manage invoice headers before invoice lines.

### Primary users
- office/admin operator

### Main views
- `Lista de Faturas`
- `Detalhe da Fatura`
- `Nova Fatura`

### List view
Columns:
- `ID_Fatura`
- `Data Fatura`
- `Fornecedor`
- `NIF`
- `Nº Doc/Fatura`
- `Valor Total Sem IVA`
- `IVA`
- `Valor Total Com IVA`
- `Estado`
- `Linhas`

Primary actions:
- `Nova Fatura`
- `Abrir`
- `Duplicar`
- `Arquivar` later, not in MVP if risky

Filters:
- period
- fornecedor
- NIF
- estado
- text search by document number

### Detail / create form
Editable fields:
- `Fornecedor`
- `NIF`
- `Nº Doc/Fatura`
- `Data Fatura`
- `Valor Total Sem IVA`
- `IVA`
- `Valor Total Com IVA`
- `Observacoes`

System fields:
- `ID_Fatura`
- `Created_At`
- `Updated_At`
- `Created_By`
- `Estado`

### States
- `RASCUNHO`
- `ATIVA`
- `COM_ITENS`
- `FECHADA` later if needed

### Validation rules
- `Fornecedor` required
- `NIF` required
- `Nº Doc/Fatura` required
- `Data Fatura` required
- duplicate check on `NIF + Nº Doc/Fatura`

### Save behavior
- `Guardar` writes one row to Google Sheets `FATURAS`
- backend mirrors to Supabase `faturas`
- response returns canonical `ID_Fatura`

## 8. Screen 2 - FATURAS_ITENS

### Goal
Register invoice lines with catalog-assisted item mapping and destination control.

### Main views
- `Workspace de Itens` scoped to one selected invoice
- optional quick list of recent unmatched/review-needed items

### Layout
Recommended split layout:
- left/top: invoice header summary
- center: editable lines grid
- right/side panel: item match + warnings + generated consequences

### Grid columns for MVP
- `ID_Item_Fatura`
- `ID_Fatura`
- `Descricao_Original`
- `Quantidade`
- `Unidade`
- `Custo_Unit`
- `Desconto 1`
- `Desconto 2`
- `Custo_Total Sem IVA`
- `IVA`
- `Custo_Total Com IVA`
- `Destino`
- `Obra`
- `Fase`
- `ID_Item`
- `Item_Oficial`
- `Natureza`
- `Estado`

### Operator-editable fields
- `Descricao_Original`
- `Quantidade`
- `Custo_Unit`
- `Desconto 1`
- `Desconto 2`
- `IVA`
- `Destino`
- `Obra`
- `Fase`

### Backend-filled or backend-confirmed fields
- `ID_Item_Fatura`
- `ID_Item`
- `Item_Oficial`
- `Natureza`
- `Unidade`
- totals
- `Estado`

### Destination rules
- `MATERIAL`
  - `STOCK`
  - direct obra/fase consumption
- `SERVICO`
  - direct obra/fase only
- `ALUGUER`
  - direct obra/fase only
- `TRANSPORTE`
  - direct obra/fase only

### Line states
- `RASCUNHO`
- `ITEM_ENCONTRADO`
- `SEMELHANTE_REVER`
- `CADASTRO_EM_FALTA`
- `OBRA_EM_FALTA`
- `FASE_EM_FALTA`
- `PRONTO_GUARDAR`
- `GUARDADO`

### Primary actions
- `Adicionar linha`
- `Guardar linhas`
- `Criar item no catalogo`
- `Ver impacto`

### Special behavior
- When the line is a direct consumption to obra/fase:
  - backend creates the `FATURAS_ITENS` row
  - backend auto-creates one generated `AFETACOES_OBRA` row
  - backend auto-creates the corresponding `MATERIAIS_MOV` row
- When the line is `Destino = STOCK`:
  - backend creates the `FATURAS_ITENS` row
  - backend creates one `ENTRADA` in `MATERIAIS_MOV`
  - no `AFETACOES_OBRA` row is created at this stage

### UX warning rule
The screen must show generated consequences before save in a small read-only summary:
- `Vai gerar entrada de stock`
- `Vai gerar afetacao direta`
- `Vai criar item novo no catalogo`

## 9. Screen 3 - MATERIAIS_CAD

### Goal
Maintain the official item catalog and resolve supplier wording into stable internal items.

### Main views
- `Catalogo`
- `Pendentes de Revisao`
- `Novo Item`

### List columns
- `ID_Item`
- `Fornecedor`
- `Descricao_Original`
- `Item_Oficial`
- `Natureza`
- `Unidade`
- `Estado_Cadastro`
- `Observacoes`

### Primary actions
- `Novo Item`
- `Aceitar sugestao`
- `Associar a item existente`
- `Editar item oficial`

### Key business behaviors
- repeated supplier/original rows may map to the same `ID_Item`
- one `ID_Item` may appear on several rows
- the screen should explicitly distinguish:
  - `texto do fornecedor`
  - `item oficial interno`

### Validation rules
- `Natureza` required
- `Unidade` required for `MATERIAL`
- `Item_Oficial` required
- `Fornecedor + Descricao_Original` duplicate warning

### States
- `ATIVO`
- `REVER_SEMELHANCA`
- `NOVO`
- `INATIVO` later if needed

### Interaction note
This screen should work as both:
- standalone maintenance
- quick-launch modal from `FATURAS_ITENS` when a line needs a new catalog item

## 10. Screen 4 - AFETACOES_OBRA

### Goal
Register and review obra/fase attribution separately from the technical movement ledger.

### Main views
- `Lista de Afetacoes`
- `Nova Afetacao`
- `Detalhe / impacto`

### MVP split inside the screen
Two tabs or clear filters:
- `Diretas de Fatura`
- `Saidas de Stock`

This avoids mixing generated direct-consumption rows with manual stock outputs.

### Columns
- `ID_Afetacao`
- `Origem`
- `Source_ID`
- `Data`
- `ID_Item`
- `Item_Oficial`
- `Natureza`
- `Quantidade`
- `Unidade`
- `Custo_Unit`
- `Custo_Total`
- `Custo_Total Sem IVA`
- `IVA`
- `Custo_Total Com IVA`
- `Obra`
- `Fase`
- `Fornecedor`
- `NIF`
- `Nº Doc/Fatura`
- `Processar`
- `Estado`
- `Observacoes`

### Operator-editable fields for manual stock output
- `Data`
- `ID_Item`
- `Quantidade`
- `IVA`
- `Obra`
- `Fase`
- `Observacoes`
- `Processar`

### Read-only or generated fields
- `ID_Afetacao`
- `Origem`
- `Source_ID`
- `Item_Oficial`
- `Natureza`
- `Unidade`
- `Custo_Unit`
- `Custo_Total`
- `Custo_Total Sem IVA`
- `Custo_Total Com IVA`
- `Fornecedor`
- `NIF`
- `Nº Doc/Fatura`
- `Estado`

### Rules
- manual rows for stock consumption use `Origem = STOCK`
- `Source_ID` stays blank for manual stock outputs
- generated rows from direct invoice consumption use `Origem = FATURA_DIRETA`
- generated rows from direct invoice consumption must not be manually editable

### Processing rule
For manual stock output rows:
- `Processar = FALSE` means draft / not yet generating movement
- `Processar = TRUE` means validate and generate/update `MATERIAIS_MOV`

### Cost rule
When `Processar = TRUE` for a manual stock output:
- backend snapshots `STOCK_ATUAL.Custo_Medio_Atual` into `Custo_Unit`
- snapshot uses current cost at processing time
- it does not reconstruct historical cost for past dates

### IVA rule
- manual stock output may accept operator-entered `IVA`
- `Custo_Total Com IVA` must recalculate from:
  - `Quantidade`
  - snapshot `Custo_Unit`
  - `IVA`

### States
- `RASCUNHO`
- `OBRA_EM_FALTA`
- `FASE_EM_FALTA`
- `ID_ITEM_EM_FALTA`
- `CUSTO_STOCK_EM_FALTA`
- `AGUARDA_PROCESSAR`
- `PRONTO_MOVIMENTO`
- `MOVIMENTO_GERADO`
- `MOVIMENTO_ATUALIZADO`

### Critical UX rule
The operator must never edit `MATERIAIS_MOV` directly from this screen.

Instead, the screen may show a read-only technical impact panel:
- generated movement type
- generated quantity
- generated cost
- linkage marker

## 11. Screen 5 - SINCRONIZACAO

### Goal
Give operational visibility without exposing technical clutter in the main forms.

### Minimum contents
- last successful write to Sheets
- last successful write to Supabase
- pending retries
- failed sync operations
- action log by entity type

### MVP actions
- `Reenviar pendentes`
- `Ver detalhe do erro`

This screen is important because Sheets-first + Supabase retry must be observable.

## 12. Backend Minimum Necessary

### Recommended stack
- `FastAPI`
- service layer
- adapters for:
  - Google Sheets
  - Supabase

### Minimum backend modules
- `api/`
- `services/`
- `adapters/google_sheets/`
- `adapters/supabase/`
- `schemas/`
- `jobs/` or `tasks/` only if retry processing is externalized

### Minimum responsibilities
- validate requests
- normalize payloads
- enforce business rules
- calculate totals
- match/create catalog items
- generate `AFETACOES_OBRA`
- generate `MATERIAIS_MOV`
- write accepted changes to Sheets
- mirror to Supabase
- mark retry state when mirror fails

## 13. Minimum Entity Contracts

### `faturas`
Required fields:
- `fornecedor`
- `nif`
- `numero_documento`
- `data_fatura`

Optional for MVP:
- header totals
- notes

### `faturas_itens`
Required fields:
- `id_fatura`
- `descricao_original`
- `quantidade`
- `custo_unit`
- `iva`
- `destino`

Conditional:
- `obra`
- `fase`

### `materiais_cad`
Required fields:
- `fornecedor`
- `descricao_original`
- `item_oficial`
- `natureza`
- `unidade`

### `afetacoes_obra`
Required fields for manual stock output:
- `origem = STOCK`
- `data`
- `id_item`
- `quantidade`
- `obra`
- `fase`
- `processar`

## 14. Minimum API Endpoints

### Invoice header
- `POST /api/faturas`
- `GET /api/faturas`
- `GET /api/faturas/{id}`
- `PATCH /api/faturas/{id}`

### Invoice lines
- `POST /api/faturas/{id}/itens`
- `PATCH /api/faturas/{id}/itens/{item_id}`
- `DELETE /api/faturas/{id}/itens/{item_id}`
- `POST /api/faturas/{id}/itens/preview`

### Catalog
- `GET /api/materiais-cad`
- `POST /api/materiais-cad`
- `PATCH /api/materiais-cad/{id_item}`
- `POST /api/materiais-cad/match`

### Work attribution
- `GET /api/afetacoes`
- `POST /api/afetacoes`
- `PATCH /api/afetacoes/{id}`
- `POST /api/afetacoes/{id}/processar`
- `POST /api/afetacoes/{id}/desprocessar`

### Technical read-only support
- `GET /api/stock-atual/{id_item}`
- `GET /api/movimentos/source/{source_marker}`

### Sync operations
- `GET /api/sync/status`
- `POST /api/sync/retry`

## 15. Write Order and Consistency Rules

### Recommended MVP write order
1. Validate request in backend.
2. Compute generated consequences.
3. Write source record(s) to Google Sheets.
4. Write generated record(s) to Google Sheets.
5. Mirror accepted records to Supabase.
6. If Supabase mirror fails:
   - keep Sheets writes
   - log retry state
   - expose pending sync in `Sincronizacao`

### Reason
This is the safest order for the current business constraint:
- Google Sheets must always stay complete

### Idempotency rules
- every create/update action should carry a stable operation key
- backend must upsert generated records by source linkage:
  - `FIT -> AFO`
  - `FIT -> MOV`
  - `AFO -> MOV`

## 16. Generated Record Rules

### From `FATURAS_ITENS`
- direct consumption:
  - create/update one generated `AFETACOES_OBRA`
  - create/update one generated `MATERIAIS_MOV`
- stock entry:
  - create/update one generated `MATERIAIS_MOV`
  - do not create `AFETACOES_OBRA`

### From `AFETACOES_OBRA`
- manual stock output with `Processar = TRUE`:
  - create/update one generated `MATERIAIS_MOV`
- manual stock output with `Processar = FALSE`:
  - no active generated movement

### Deletion / invalidation
- if source record becomes invalid, generated record must be removed or marked inactive consistently in both stores

## 17. MVP Technical Risks
- duplicate writes if idempotency is weak
- Google Sheets API quotas if write granularity is too chatty
- confusion if generated rows are shown as editable in UI
- drift if Supabase mirror retries are not observable

## 18. Suggested Build Order

### Phase A
- backend skeleton
- Google Sheets adapter
- `FATURAS` CRUD

### Phase B
- `FATURAS_ITENS` workspace
- catalog matching endpoint
- preview endpoint for generated consequences

### Phase C
- `MATERIAIS_CAD` maintenance screen
- quick-create from `FATURAS_ITENS`

### Phase D
- `AFETACOES_OBRA` screen
- process/unprocess manual stock outputs
- read-only impact preview

### Phase E
- sync status screen
- retry handling visibility

## 19. MVP Success Criteria
- operator can register an invoice without using the sheet directly
- operator can register invoice lines without relying on cell-trigger timing
- operator can create or map official items from the same workflow
- operator can register stock outputs by obra/fase with explicit processing
- Google Sheets remains fully populated
- Supabase receives mirrored structured data
- `MATERIAIS_MOV` is no longer an operational input surface
