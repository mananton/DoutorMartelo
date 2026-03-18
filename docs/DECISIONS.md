# Technical Decisions

Format: short ADR-style records with rationale and impact.

## D-001: Split frontend into HTML/CSS/JS includes
- **Status**: accepted
- **Date**: 2026-03-09
- **Commit**: `9882086` (structure wave)
- **Decision**:
  - Keep markup in `index.html`.
  - Move styles to `css.html` and scripts to `js.html`.
  - Include both via GAS `include(filename)`.
- **Rationale**:
  - Improve load/maintenance behavior and separation of concerns.
- **Impact**:
  - Easier UI maintenance and lower merge conflict pressure.

## D-002: Split backend by responsibility
- **Status**: accepted
- **Date**: 2026-03-09
- **Commit**: `9882086`
- **Decision**:
  - Keep `main.gs` as entrypoint/orchestrator.
  - Move readers/composer/sync/aggregators into dedicated files.
- **Rationale**:
  - Reduce density of `main.gs` and isolate I/O from aggregation/sync concerns.
- **Impact**:
  - Safer incremental changes and clearer ownership per module.

## D-003: Raw-first payload with frontend normalization
- **Status**: accepted
- **Date**: 2026-03-10
- **Commit**: `b266329`
- **Decision**:
  - Prefer `raw_v2` payload and normalize client-side.
  - Keep legacy fallback path (`mode: 'legacy'`) for resilience.
- **Rationale**:
  - Better performance and flexibility for UI-side filtering/aggregation.
- **Impact**:
  - Reduced server coupling for presentation-layer transformations.

## D-004: Legacy-tolerant record handling
- **Status**: accepted
- **Date**: 2026-03-10
- **Commit**: `b266329`
- **Decision**:
  - Preserve historical costs even when old rows are incomplete.
  - Apply explicit defaults/fallbacks for missing fields.
- **Rationale**:
  - Historical backfill cannot be manually rewritten at scale.
- **Impact**:
  - Better historical visibility, with acknowledged precision tradeoffs.

## D-005: Obra phase chart as configurable view
- **Status**: accepted
- **Date**: 2026-03-10
- **Commit**: `b725a8d`
- **Decision**:
  - Add metric switch (labor/materials/total) and chart type switch (bar/doughnut).
- **Rationale**:
  - Improve readability and stakeholder-oriented analysis views.
- **Impact**:
  - Better exploratory analysis in Obra detail.

## D-006: Cost-only legacy days count as worked in filters
- **Status**: accepted
- **Date**: 2026-03-10
- **Commit**: `76e5253`
- **Decision**:
  - In date-filtered worker views/counters, treat day as worked when `hours > 0` OR `cost > 0`.
- **Rationale**:
  - Old records often miss hours while carrying valid cost.
- **Impact**:
  - Worker visibility aligns with cost totals in filtered windows.

## D-007: Obra heavy sections are collapsible by default
- **Status**: accepted
- **Date**: 2026-03-10
- **Commit**: `299536d`
- **Decision**:
  - Keep Workers and Materials cards collapsible to reduce initial page density.
- **Rationale**:
  - Mobile-first behavior benefits from progressive disclosure of dense lists.
- **Impact**:
  - Faster scanning in Obra detail and lower accidental scroll burden.

## D-008: Obra phase chart uses explicit visibility filters (no click drill side-effects)
- **Status**: accepted
- **Date**: 2026-03-10
- **Commit**: `7ab59ac`
- **Decision**:
  - Use dedicated phase chips to strike/hide phases and recompute chart totals.
  - Remove chart-click action that expanded other sections.
- **Rationale**:
  - Chart interactions must be predictable and scoped to chart behavior only.
- **Impact**:
  - Cleaner UX and fewer accidental state changes while analyzing phases.

## D-009: Data diagnostics stay internal and non-blocking
- **Status**: accepted
- **Date**: 2026-03-13
- **Commit**: `pending`
- **Decision**:
  - Keep malformed-row diagnostics as internal support tooling only.
  - Surface diagnostics in a dedicated `Dev` area instead of the main overview.
  - Do not block dashboard rendering when issues are found.
- **Rationale**:
  - Business users should not see data-maintenance warnings in the main dashboard.
  - The team still needs a quick way to spot and fix malformed rows in Google Sheets.
- **Impact**:
  - Cleaner client-facing dashboard.
  - Faster internal diagnosis of sheet problems without changing business behavior.

## D-010: Future Supabase sync should be near-real-time with retry safety
- **Status**: accepted
- **Date**: 2026-03-13
- **Commit**: `pending`
- **Decision**:
  - Keep AppSheet and manual Google Sheet editing as the input path in the first migration stage.
  - When Supabase is introduced, prefer automatic near-real-time sync after each change.
  - If sync fails, the operational flow must continue and the system should allow a later retry.
- **Rationale**:
  - The team needs the dashboard to stay fresh without changing how people register data.
  - Immediate sync is useful, but it must not become a fragile point that blocks the day-to-day operation.
- **Impact**:
  - Future migration stays safer for operations.
  - Dashboard freshness improves without forcing an early change in the input workflow.

## D-011: Keep old labour history separate from operational worker records
- **Status**: accepted
- **Date**: 2026-03-13
- **Commit**: `375217b`
- **Decision**:
  - Store old manually imported labour history in a dedicated sheet: `LEGACY_MAO_OBRA`.
  - Include that sheet only in labour cost and hours calculations.
  - Do not use that sheet for team, attendance, or monthly worker views.
- **Rationale**:
  - Old imported rows preserve useful cost history, but many do not have reliable worker-level detail.
  - Mixing those rows into worker views would distort attendance and team analysis.
- **Impact**:
  - Historical labour cost and hours remain visible in overview, obra detail, and comparative charts.
  - Team-facing views stay based only on operational records from `REGISTOS_POR_DIA`.

## D-012: Separate material catalog, invoice lines, stock movements, and old material cost history
- **Status**: accepted
- **Date**: 2026-03-16
- **Commit**: `pending`
- **Decision**:
  - Keep `MATERIAIS_CAD` as the official catalog of internal material items.
  - Keep `FATURAS_ITENS` as the real purchase-line sheet, including discounts and invoice detail.
  - Keep `MATERIAIS_MOV` as the movement ledger for stock/consumption behavior, not as the original purchase register.
  - Treat `LEGACY_MATERIAIS` as old material cost history only, separate from current stock logic.
  - Do not introduce category/subcategory yet; keep the first cleanup focused on item identity and cost behavior.
- **Rationale**:
  - Old invoice imports contain many different supplier names for the same item and also mix materials, services, rentals, and transport.
  - Current stock control and obra cost control need a cleaner split between catalog, purchase lines, and real stock movements.
  - Historical imported material rows are useful for obra/fase cost totals, but not reliable enough for current stock balances.
- **Impact**:
- Future material cleanup can map supplier wording to a stable internal item without losing original invoice text.
- Old material history can remain visible in cost views without polluting stock calculations.
- The next implementation step should prioritize `MATERIAIS_ALIAS`, simplified `MATERIAIS_CAD`, and a lean `LEGACY_MATERIAIS` flow.

## D-013: Collapse material catalog and alias mapping into a single `MATERIAIS_CAD` sheet
- **Status**: accepted
- **Date**: 2026-03-17
- **Commit**: `pending`
- **Decision**:
  - Use a single spreadsheet sheet for material identity and supplier wording: `MATERIAIS_CAD`.
  - Sheet structure is now:
    - `ID_Item`
    - `Fornecedor`
    - `Descricao_Original`
    - `Item_Oficial`
    - `Natureza`
    - `Unidade`
    - `Observacoes`
    - `Estado_Cadastro`
  - Remove dependency on a separate `MATERIAIS_ALIAS` sheet.
  - Allow repeated `ID_Item` across rows when multiple supplier/original descriptions map to the same internal item.
  - `Natureza` now drives ID prefixing:
    - `MATERIAL` -> `MAT-xxxxxx`
    - `SERVICO` -> `SER-xxxxxx`
    - `ALUGUER` -> `ALQ-xxxxxx`
    - `TRANSPORTE` -> `TRN-xxxxxx`
- **Rationale**:
  - The two-sheet approach was adding maintenance friction for a small team working directly in Google Sheets.
  - The business need is practical mapping of supplier wording to internal items, not strict master-data normalization at this stage.
- **Impact**:
  - Material registration is now simpler for manual operation.
  - GAS must handle exact-match reuse, similarity review, and automatic item suggestion inside one sheet.

## D-014: `FATURAS_ITENS` is the purchase-line source; `MATERIAIS_MOV` is generated/maintained from it
- **Status**: accepted
- **Date**: 2026-03-17
- **Commit**: `pending`
- **Decision**:
  - Treat `FATURAS_ITENS` as the source of truth for purchase lines.
  - Treat `MATERIAIS_MOV` as generated/maintained ledger rows for purchase-driven `ENTRADA` / direct `CONSUMO`.
  - Manual edits in `MATERIAIS_MOV` should be reserved for:
    - stock consumption after storage,
    - returns,
    - adjustments,
    - transfers.
  - When a `FATURAS_ITENS` row changes and already has a generated movement, the generated row must be updated, not duplicated.
  - When a `FATURAS_ITENS` row stops being valid for movement generation, the generated movement must be removed.
- **Rationale**:
  - Re-entering invoice data again in `MATERIAIS_MOV` creates duplication and drift.
  - Stock and cost calculations need generated rows to stay synchronized with invoice-line changes.
- **Impact**:
  - `STOCK_ATUAL` reliability depends directly on consistent synchronization from `FATURAS_ITENS` to `MATERIAIS_MOV`.
  - Future agents must preserve the `[SRC_FIT:FIT-xxxxxx]` linkage marker logic.

## D-015: Use net unit cost in movement generation
- **Status**: accepted
- **Date**: 2026-03-17
- **Commit**: `pending`
- **Decision**:
  - When generating `MATERIAIS_MOV` from `FATURAS_ITENS`, write `Custo_Unit` as the net unit cost.
  - Priority:
    - `Custo_Total Sem IVA / Quantidade`, when available.
    - Otherwise calculate from `Custo_Unit` applying `Desconto 1` and `Desconto 2`.
- **Rationale**:
  - Gross invoice unit price produces incorrect average stock cost.
- **Impact**:
- `STOCK_ATUAL.Custo_Medio_Atual` should be computed from `MATERIAIS_MOV.Custo_Unit` and now reflects discounts for newly generated movements.

## D-016: Separate work attribution from the technical movement ledger
- **Status**: accepted
- **Date**: 2026-03-17
- **Commit**: `pending`
- **Decision**:
  - Keep `FATURAS_ITENS` as the purchase-line source.
  - Introduce `AFETACOES_OBRA` as the operational sheet for attributing cost to `Obra` + `Fase`.
  - Keep `MATERIAIS_MOV` as a technical ledger generated from source sheets, not as the main manual input surface.
  - Direct-consumption lines in `FATURAS_ITENS` should auto-create generated rows in `AFETACOES_OBRA`.
  - Later stock consumption should be registered manually in `AFETACOES_OBRA`, one simple line per output.
- **Rationale**:
  - The previous flow was mixing operational input with a system ledger in the same sheet.
  - That makes auditability worse and complicates future stock evolution.
- **Impact**:
  - Operators register stock outputs in `AFETACOES_OBRA`, not in `MATERIAIS_MOV`.
  - `MATERIAIS_MOV` becomes clearer as a generated log that feeds cost and stock calculations.

## D-017: Stock outputs snapshot current average cost at registration time
- **Status**: accepted
- **Date**: 2026-03-17
- **Commit**: `pending`
- **Decision**:
  - Manual stock outputs entered in `AFETACOES_OBRA` should fill `Custo_Unit` from `STOCK_ATUAL.Custo_Medio_Atual`.
  - That value is treated as a snapshot at registration time, even if the user enters an older `Data`.
- **Rationale**:
  - The business prefers operational simplicity and stable day-to-day registration over historical-cost reconstruction.
- **Impact**:
- Late-entered stock consumptions use the current average cost when registered.
- Historical costing stays operationally consistent, with the known tradeoff that it is not a backdated average-cost engine.

## D-018: Keep AppSheet for labour/displacements and move materials input to a dedicated backend-controlled app
- **Status**: accepted
- **Date**: 2026-03-18
- **Commit**: `pending`
- **Decision**:
  - Keep `AppSheet` as the short-term operational channel for:
    - labour
    - displacements
  - Introduce a dedicated materials backoffice app for:
    - `FATURAS`
    - `FATURAS_ITENS`
    - `MATERIAIS_CAD`
    - `AFETACOES_OBRA`
  - The new app should talk to a backend that writes accepted business results to:
    - Google Sheets
    - Supabase
  - Do not rely on Google Sheets + GAS triggers alone for the richer materials flow.
- **Rationale**:
  - The unstable part of the current operation is the materials/invoices/stock workflow, not labour or displacement input.
  - A UI-only layer on top of Sheets would improve form experience but would not remove the trigger-timing fragility already observed.
  - Google Sheets must stay fully populated, but business logic needs a more controlled execution boundary.
- **Impact**:
  - Future implementation should prioritize a small materials backoffice plus backend adapters over further trigger-heavy spreadsheet automation.
  - AppSheet scope stays narrower in the short term, reducing migration risk.

## D-019: Phase 0 materials sync is Sheets-first with live mirror validation
- **Status**: accepted
- **Date**: 2026-03-18
- **Commit**: `e4d4d74`
- **Decision**:
  - Treat Google Sheets as the operational source of truth for the materials backoffice Phase 0.
  - Write accepted business records to Google Sheets first.
  - Mirror to Supabase immediately after, but do not fail the main operation when the mirror fails.
  - Surface pending retry state in the app instead of failing silently.
- **Rationale**:
  - The business requirement is that Google Sheets remains always populated.
  - Supabase is important, but not at the cost of breaking day-to-day registration.
- **Impact**:
  - Backoffice writes now remain operational even when Supabase is temporarily unavailable or misaligned.
  - Sync diagnostics become a first-class operational concern.

## D-020: Materials backoffice runtime hydrates from Google Sheets at startup
- **Status**: accepted
- **Date**: 2026-03-18
- **Commit**: `pending`
- **Decision**:
  - On backend startup, hydrate runtime state from the live Google Sheet for the materials core entities.
  - Seed runtime counters from hydrated IDs.
  - Keep internal sheet metadata out of API response models.
- **Rationale**:
  - A backend that restarts empty is too fragile for operational use.
  - Google Sheets is currently the real business record and therefore the safest hydration source.
- **Impact**:
- The app reopens with existing data after backend restart.
- New IDs continue from the current sheet state instead of restarting numbering.

## D-021: Materials backoffice should prefer assisted operational forms over raw sheet-like editing
- **Status**: accepted
- **Date**: 2026-03-18
- **Commit**: `c9a078e`
- **Decision**:
  - Treat the new materials backoffice as a guided operational layer, not as a direct spreadsheet clone.
  - Prefer assisted selection for `ID_Item`, visible downstream impact previews, and explicit sync status cards.
  - Expose stock snapshot context before saving manual `AFETACOES_OBRA` stock outputs.
- **Rationale**:
  - The operational pain point is not data visibility alone; it is preventing mapping errors and hidden business-rule failures during registration.
  - Raw JSON or free-text-only forms create unnecessary ambiguity for office users.
- **Impact**:
  - `FATURAS_ITENS` and `AFETACOES_OBRA` now prioritize assisted selection and readable consequences before save.
  - `Sincronizacao` becomes an operational screen instead of a debugging-only screen.

## D-022: Work selectors in the materials backoffice should follow the workbook master lists
- **Status**: accepted
- **Date**: 2026-03-18
- **Commit**: `b57c4b9`
- **Decision**:
  - Source `Obra` options in the new materials app from `OBRAS.Local_ID`.
  - Source `Fase` options from the global `FASES_DE_OBRA` list.
  - Expose those options through a backend endpoint instead of deriving them only from transactional material rows.
  - Keep `Adicionar Linha` aligned with business rules by only enabling obra/fase selection for `Destino = CONSUMO`.
- **Rationale**:
  - The workbook already has master lists for obras and phases, so the UI should not wait for historical material rows to "discover" them.
  - Operators need stable suggestions that match the spreadsheet naming actually used in the business.
- **Impact**:
  - `Adicionar Linha` and `AFETACOES_OBRA` now show predictable selectors instead of empty or inconsistent free-text fields.
  - The work selector source is now explicit and easier to maintain when workbook structure changes.

## Standing Constraints
- Do not rename global sheet constants.
- Do not change Supabase sync structure without explicit request.
- Keep legacy rules active unless business owner requests rollback.
