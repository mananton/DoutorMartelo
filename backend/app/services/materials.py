from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime
import logging
from time import perf_counter
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel

from backend.app.adapters.google_sheets.base import GoogleSheetsAdapter, WriteBatch
from backend.app.adapters.supabase.base import SupabaseAdapter, SupabaseAdapterError
from backend.app.schemas.common import OperationImpact, StockSnapshot
from backend.app.schemas.materials import (
    AfetacaoCreate,
    AfetacaoRecord,
    AfetacaoUpdate,
    CatalogEntryCreate,
    CatalogEntryRecord,
    CatalogEntryUpdate,
    CompromissoCreate,
    CompromissoRecord,
    CompromissoUpdate,
    FaturaCreate,
    FaturaDetail,
    FaturaItemCreate,
    FaturaItemRecord,
    FaturaItemsResponse,
    FaturaRecord,
    FaturaUpdate,
    MovimentoRecord,
    NotaCreditoItemCreate,
    NotaCreditoItemRecord,
    NotaCreditoItemsResponse,
    NotaCreditoItemUpdate,
)
from backend.app.services.state import RuntimeState


logger = logging.getLogger("uvicorn.error")


class MaterialsService:
    def __init__(self, state: RuntimeState, google_sheets: GoogleSheetsAdapter, supabase: SupabaseAdapter) -> None:
        self.state = state
        self.google_sheets = google_sheets
        self.supabase = supabase

    def list_compromissos(self) -> list[CompromissoRecord]:
        ordered = sorted(
            self.state.compromissos.values(),
            key=lambda item: (
                item.get("created_at") or datetime.min.replace(tzinfo=UTC),
                str(item.get("id_compromisso") or ""),
            ),
            reverse=True,
        )
        return [self._to_model(CompromissoRecord, item) for item in ordered]

    def create_compromisso(self, payload: CompromissoCreate) -> CompromissoRecord:
        now = self._now()
        entity = {
            "id_compromisso": self.state.next_id("COMP"),
            "data": payload.data,
            "fornecedor": payload.fornecedor,
            "nif": payload.nif,
            "tipo_doc": payload.tipo_doc,
            "doc_origem": payload.doc_origem,
            "obra": payload.obra,
            "fase": payload.fase,
            "descricao": payload.descricao,
            "valor_sem_iva": payload.valor_sem_iva,
            "iva": payload.iva,
            "valor_com_iva": payload.valor_com_iva,
            "estado": payload.estado,
            "observacoes": payload.observacoes,
            "created_at": now,
            "updated_at": now,
        }
        self._persist({"compromissos_obra": [entity]})
        self.state.compromissos[entity["id_compromisso"]] = entity
        return self._to_model(CompromissoRecord, entity)

    def patch_compromisso(self, id_compromisso: str, payload: CompromissoUpdate) -> CompromissoRecord:
        current = deepcopy(self._require_compromisso(id_compromisso))
        for field, value in payload.model_dump(exclude_unset=True).items():
            current[field] = value
        current["updated_at"] = self._now()
        self._persist({"compromissos_obra": [current]})
        self.state.compromissos[id_compromisso] = current
        return self._to_model(CompromissoRecord, current)

    def delete_compromisso(self, id_compromisso: str) -> None:
        compromisso = self._require_compromisso(id_compromisso)
        normalized_id = str(compromisso.get("id_compromisso") or "").strip()
        if any(str(fatura.get("id_compromisso") or "").strip() == normalized_id for fatura in self.state.faturas.values()):
            raise HTTPException(status_code=422, detail="COMPROMISSO_REFERENCIADO")
        delete_groups = {"compromissos_obra": [id_compromisso]}
        self._delete_records(delete_groups)
        self._delete_runtime_records(delete_groups)

    def list_faturas(self) -> list[FaturaRecord]:
        ordered = sorted(
            self.state.faturas.values(),
            key=lambda item: (
                item.get("created_at") or datetime.min.replace(tzinfo=UTC),
                str(item.get("id_fatura") or ""),
            ),
            reverse=True,
        )
        return [self._to_model(FaturaRecord, item) for item in ordered]

    def get_fatura(self, id_fatura: str) -> FaturaDetail:
        fatura = self._require_fatura(id_fatura)
        if self._is_note_credit_fatura(fatura):
            items = [self._to_model(NotaCreditoItemRecord, item) for item in self.state.nota_credito_items.values() if item["id_fatura"] == id_fatura]
        else:
            items = [self._to_model(FaturaItemRecord, item) for item in self.state.fatura_items.values() if item["id_fatura"] == id_fatura]
        return FaturaDetail(fatura=self._to_model(FaturaRecord, fatura), items=items)

    def create_fatura(self, payload: FaturaCreate) -> FaturaRecord:
        now = self._now()
        tipo_doc = self._normalize_fatura_tipo_doc(payload.tipo_doc)
        entity = {
            "id_fatura": self._generate_fatura_id(tipo_doc),
            "tipo_doc": tipo_doc,
            "doc_origem": payload.doc_origem,
            "id_compromisso": payload.id_compromisso,
            "fornecedor": payload.fornecedor,
            "nif": payload.nif,
            "nr_documento": payload.nr_documento,
            "data_fatura": payload.data_fatura,
            "valor_sem_iva": payload.valor_sem_iva,
            "iva": payload.iva,
            "valor_com_iva": payload.valor_com_iva,
            "paga": payload.paga,
            "data_pagamento": payload.data_pagamento,
            "observacoes": payload.observacoes,
            "estado": "ATIVA",
            "created_at": now,
            "updated_at": now,
        }
        self._validate_fatura_document_fields(entity)
        self._validate_fatura_compromisso_link(entity)
        self._normalize_fatura_payment_fields(entity)
        self._persist({"faturas": [entity]})
        self.state.faturas[entity["id_fatura"]] = entity
        return self._to_model(FaturaRecord, entity)

    def patch_fatura(self, id_fatura: str, payload: FaturaUpdate) -> FaturaRecord:
        previous = self._require_fatura(id_fatura)
        current = deepcopy(previous)
        for field, value in payload.model_dump(exclude_unset=True, by_alias=True).items():
            current[field] = value
        self._validate_fatura_document_fields(current)
        self._validate_fatura_document_transition(previous, current)
        self._validate_fatura_compromisso_link(current)
        self._normalize_fatura_payment_fields(current)
        current["updated_at"] = self._now()
        dependent_items: list[dict[str, Any]] = []
        dependent_note_items: list[dict[str, Any]] = []
        dependent_afetacoes: list[dict[str, Any]] = []
        dependent_movimentos: list[dict[str, Any]] = []
        if self._is_note_credit_fatura(current):
            for item in self.state.nota_credito_items.values():
                if item["id_fatura"] != id_fatura:
                    continue
                updated_item = deepcopy(item)
                updated_item["fornecedor"] = current["fornecedor"]
                updated_item["nif"] = current["nif"]
                updated_item["nr_documento"] = current["nr_documento"]
                updated_item["doc_origem"] = current.get("doc_origem")
                updated_item["data_fatura"] = current["data_fatura"]
                updated_item["updated_at"] = current["updated_at"]
                dependent_note_items.append(updated_item)

                note_movement = self._find_movement_by_source("NCI", updated_item["id_item_nota_credito"])
                if self._note_credit_item_affects_stock(updated_item) and note_movement:
                    dependent_movimentos.append(
                        self._reuse_record_identity(
                            self._build_nci_stock_movement(updated_item, current),
                            note_movement,
                            "id_mov",
                            keep_sequence=True,
                        )
                    )

                direct_afetacao = self._find_direct_afetacao_by_source(updated_item["id_item_nota_credito"])
                if updated_item["categoria_nota_credito"] == "NC_COM_OBRA" and direct_afetacao:
                    updated_afetacao = self._reuse_record_identity(
                        self._build_nci_credit_afetacao(updated_item, current),
                        direct_afetacao,
                        "id_afetacao",
                    )
                    dependent_afetacoes.append(updated_afetacao)
                    current_afo_movement = self._find_movement_by_source("AFO", updated_afetacao["id_afetacao"])
                    if current_afo_movement:
                        dependent_movimentos.append(
                            self._reuse_record_identity(
                                self._build_afo_movement(updated_afetacao),
                                current_afo_movement,
                                "id_mov",
                                keep_sequence=True,
                            )
                        )
        else:
            for item in self.state.fatura_items.values():
                if item["id_fatura"] != id_fatura:
                    continue
                updated_item = deepcopy(item)
                updated_item["fornecedor"] = current["fornecedor"]
                updated_item["nif"] = current["nif"]
                updated_item["nr_documento"] = current["nr_documento"]
                updated_item["data_fatura"] = current["data_fatura"]
                updated_item["updated_at"] = current["updated_at"]
                dependent_items.append(updated_item)

                fit_movement = self._find_movement_by_source("FIT", updated_item["id_item_fatura"])
                if updated_item["destino"] in {"STOCK", "VIATURA", "ESCRITORIO", "EMPRESA"} and fit_movement:
                    dependent_movimentos.append(
                        self._reuse_record_identity(
                            self._build_fit_movement(
                                updated_item,
                                current,
                                "ENTRADA" if updated_item["destino"] == "STOCK" else "CONSUMO",
                            ),
                            fit_movement,
                            "id_mov",
                            keep_sequence=True,
                        )
                    )

                direct_afetacao = self._find_direct_afetacao_by_source(updated_item["id_item_fatura"])
                if updated_item["destino"] == "CONSUMO" and direct_afetacao:
                    updated_afetacao = self._reuse_record_identity(
                        self._build_direct_afetacao(updated_item, current),
                        direct_afetacao,
                        "id_afetacao",
                    )
                    dependent_afetacoes.append(updated_afetacao)
                    current_afo_movement = self._find_movement_by_source("AFO", updated_afetacao["id_afetacao"])
                    if current_afo_movement:
                        dependent_movimentos.append(
                            self._reuse_record_identity(
                                self._build_afo_movement(updated_afetacao),
                                current_afo_movement,
                                "id_mov",
                                keep_sequence=True,
                            )
                        )

        self._persist(
            {
                "faturas": [current],
                "faturas_itens": dependent_items,
                "notas_credito_itens": dependent_note_items,
                "afetacoes_obra": dependent_afetacoes,
                "materiais_mov": dependent_movimentos,
            }
        )
        self.state.faturas[id_fatura] = current
        for item in dependent_items:
            self.state.fatura_items[item["id_item_fatura"]] = item
        for item in dependent_note_items:
            self.state.nota_credito_items[item["id_item_nota_credito"]] = item
        for afetacao in dependent_afetacoes:
            self.state.afetacoes[afetacao["id_afetacao"]] = afetacao
        for movimento in dependent_movimentos:
            self.state.movimentos[movimento["id_mov"]] = movimento
        return self._to_model(FaturaRecord, current)

    def delete_fatura(self, id_fatura: str) -> None:
        fatura = self._require_fatura(id_fatura)
        delete_groups: dict[str, list[str]] = {"faturas": [id_fatura]}
        if self._is_note_credit_fatura(fatura):
            for item in list(self.state.nota_credito_items.values()):
                if item["id_fatura"] != id_fatura:
                    continue
                self._merge_delete_groups(delete_groups, self._collect_nci_delete_groups(item["id_item_nota_credito"]))
        else:
            for item in list(self.state.fatura_items.values()):
                if item["id_fatura"] != id_fatura:
                    continue
                self._merge_delete_groups(delete_groups, self._collect_fit_delete_groups(item["id_item_fatura"]))
        stock_item_ids_to_sync = self._collect_stock_item_ids_from_groups(delete_groups)
        self._delete_records(delete_groups)
        self._delete_runtime_records(delete_groups)
        self._sync_stock_atual_for_item_ids(stock_item_ids_to_sync)

    def preview_fatura_items(self, id_fatura: str, items: list[FaturaItemCreate]) -> FaturaItemsResponse:
        self._require_fatura(id_fatura)
        impacts = [impact for item in items for impact in self._preview_item_impacts(item)]
        return FaturaItemsResponse(items=[], impacts=impacts)

    def create_fatura_items(self, id_fatura: str, items: list[FaturaItemCreate]) -> FaturaItemsResponse:
        started_at = perf_counter()
        fatura = self._require_fatura(id_fatura)
        created_items: list[dict[str, Any]] = []
        generated_afetacoes: list[dict[str, Any]] = []
        generated_movimentos: list[dict[str, Any]] = []
        impacts: list[OperationImpact] = []

        for item in items:
            catalog = self._resolve_item_mapping(fatura, item)
            now = self._now()
            fit = {
                "id_item_fatura": self.state.next_id("FIT"),
                "id_fatura": id_fatura,
                "fornecedor": fatura["fornecedor"],
                "nif": fatura["nif"],
                "nr_documento": fatura["nr_documento"],
                "data_fatura": fatura["data_fatura"],
                "descricao_original": item.descricao_original,
                "id_item": catalog["id_item"],
                "item_oficial": catalog["item_oficial"],
                "unidade": catalog["unidade"],
                "natureza": catalog["natureza"],
                "uso_combustivel": self._normalize_uso_combustivel(item.uso_combustivel, catalog["natureza"]),
                "matricula": item.matricula,
                "quantidade": item.quantidade,
                "custo_unit": item.custo_unit,
                "desconto_1": item.desconto_1,
                "desconto_2": item.desconto_2,
                "custo_total_sem_iva": self._calc_total_sem_iva(item),
                "iva": item.iva,
                "custo_total_com_iva": self._calc_total_com_iva(item),
                "destino": self._normalize_destino(item.destino),
                "obra": item.obra,
                "fase": item.fase,
                "observacoes": item.observacoes,
                "estado_mapeamento": "GUARDADO",
                "created_at": now,
                "updated_at": now,
            }
            self._validate_item_business_rules(fit)
            created_items.append(fit)
            impacts.extend(self._preview_item_impacts(item))

            if fit["destino"] == "STOCK":
                generated_movimentos.append(self._build_fit_movement(fit, fatura, "ENTRADA"))
            elif fit["destino"] in {"VIATURA", "ESCRITORIO", "EMPRESA"}:
                generated_movimentos.append(self._build_fit_movement(fit, fatura, "CONSUMO"))
            else:
                afetacao = self._build_direct_afetacao(fit, fatura)
                generated_afetacoes.append(afetacao)
                generated_movimentos.append(self._build_afo_movement(afetacao))

        self._persist({"faturas_itens": created_items, "afetacoes_obra": generated_afetacoes, "materiais_mov": generated_movimentos})
        for fit in created_items:
            self.state.fatura_items[fit["id_item_fatura"]] = fit
        for afetacao in generated_afetacoes:
            self.state.afetacoes[afetacao["id_afetacao"]] = afetacao
        for movimento in generated_movimentos:
            self.state.movimentos[movimento["id_mov"]] = movimento
        self._sync_stock_atual_for_item_ids(
            {
                str(fit.get("id_item") or "").strip()
                for fit in created_items
                if str(fit.get("destino") or "").strip().upper() == "STOCK"
            }
        )
        logger.info(
            "timing.create_fatura_items id_fatura=%s items=%s generated_afetacoes=%s generated_movimentos=%s duration_ms=%.2f",
            id_fatura,
            len(created_items),
            len(generated_afetacoes),
            len(generated_movimentos),
            (perf_counter() - started_at) * 1000,
        )
        return FaturaItemsResponse(items=[self._to_model(FaturaItemRecord, item) for item in created_items], impacts=impacts)

    def update_fatura_item(self, id_fatura: str, item_id: str, payload: dict[str, Any]) -> FaturaItemRecord:
        started_at = perf_counter()
        current = self.state.fatura_items.get(item_id)
        if not current or current["id_fatura"] != id_fatura:
            raise HTTPException(status_code=404, detail="Invoice item not found")
        fatura = self._require_fatura(id_fatura)
        merged_payload = {
            "descricao_original": current["descricao_original"],
            "id_item": current.get("id_item"),
            "item_oficial": current.get("item_oficial"),
            "natureza": current.get("natureza"),
            "unidade": current.get("unidade"),
            "uso_combustivel": current.get("uso_combustivel"),
            "matricula": current.get("matricula"),
            "quantidade": current["quantidade"],
            "custo_unit": current["custo_unit"],
            "iva": current["iva"],
            "destino": current["destino"],
            "obra": current.get("obra"),
            "fase": current.get("fase"),
            "desconto_1": current.get("desconto_1", 0),
            "desconto_2": current.get("desconto_2", 0),
            "observacoes": current.get("observacoes"),
        }
        for key, value in payload.items():
            merged_payload[key] = value
        item_input = FaturaItemCreate.model_validate(merged_payload)
        catalog = self._resolve_item_mapping(fatura, item_input)
        updated = {
            "id_item_fatura": current["id_item_fatura"],
            "id_fatura": id_fatura,
            "fornecedor": fatura["fornecedor"],
            "nif": fatura["nif"],
            "nr_documento": fatura["nr_documento"],
            "data_fatura": fatura["data_fatura"],
            "descricao_original": item_input.descricao_original,
            "id_item": catalog["id_item"],
            "item_oficial": catalog["item_oficial"],
            "unidade": catalog["unidade"],
            "natureza": catalog["natureza"],
            "uso_combustivel": self._normalize_uso_combustivel(item_input.uso_combustivel, catalog["natureza"]),
            "matricula": item_input.matricula,
            "quantidade": item_input.quantidade,
            "custo_unit": item_input.custo_unit,
            "desconto_1": item_input.desconto_1,
            "desconto_2": item_input.desconto_2,
            "custo_total_sem_iva": self._calc_total_sem_iva(item_input),
            "iva": item_input.iva,
            "custo_total_com_iva": self._calc_total_com_iva(item_input),
            "destino": self._normalize_destino(item_input.destino),
            "obra": item_input.obra,
            "fase": item_input.fase,
            "observacoes": item_input.observacoes,
            "estado_mapeamento": "GUARDADO",
            "created_at": current["created_at"],
            "updated_at": self._now(),
        }
        if current.get("sheet_row_num") is not None:
            updated["sheet_row_num"] = current["sheet_row_num"]
        self._validate_item_business_rules(updated)

        current_fit_movement = self._find_movement_by_source("FIT", item_id)
        current_direct_afetacao = self._find_direct_afetacao_by_source(item_id)
        current_afo_movement = (
            self._find_movement_by_source("AFO", current_direct_afetacao["id_afetacao"])
            if current_direct_afetacao
            else None
        )
        stock_item_ids_to_sync = set()
        if str(current.get("destino") or "").strip().upper() == "STOCK":
            stock_item_ids_to_sync.add(str(current.get("id_item") or "").strip())
        if str(updated.get("destino") or "").strip().upper() == "STOCK":
            stock_item_ids_to_sync.add(str(updated.get("id_item") or "").strip())

        upserts: dict[str, list[dict[str, Any]]] = {"faturas_itens": [updated]}
        deletions: dict[str, list[str]] = {}
        if updated["destino"] in {"STOCK", "VIATURA", "ESCRITORIO", "EMPRESA"}:
            movement = self._build_fit_movement(
                updated,
                fatura,
                "ENTRADA" if updated["destino"] == "STOCK" else "CONSUMO",
            )
            if current_fit_movement:
                movement = self._reuse_record_identity(movement, current_fit_movement, "id_mov", keep_sequence=True)
            upserts["materiais_mov"] = [movement]
            if current_direct_afetacao:
                self._merge_delete_groups(
                    deletions,
                    self._collect_afetacao_delete_groups(current_direct_afetacao["id_afetacao"]),
                )
        else:
            direct_afetacao = self._build_direct_afetacao(updated, fatura)
            if current_direct_afetacao:
                direct_afetacao = self._reuse_record_identity(direct_afetacao, current_direct_afetacao, "id_afetacao")
            direct_movement = self._build_afo_movement(direct_afetacao)
            if current_afo_movement:
                direct_movement = self._reuse_record_identity(direct_movement, current_afo_movement, "id_mov", keep_sequence=True)
            upserts["afetacoes_obra"] = [direct_afetacao]
            upserts["materiais_mov"] = [direct_movement]
            if current_fit_movement:
                self._merge_delete_groups(deletions, {"materiais_mov": [current_fit_movement["id_mov"]]})

        self._persist(upserts)
        self.state.fatura_items[item_id] = updated
        if updated["destino"] in {"STOCK", "VIATURA", "ESCRITORIO", "EMPRESA"}:
            for movimento in upserts.get("materiais_mov", []):
                self.state.movimentos[movimento["id_mov"]] = movimento
            if current_direct_afetacao:
                self._delete_runtime_records(deletions)
        else:
            for afetacao in upserts.get("afetacoes_obra", []):
                self.state.afetacoes[afetacao["id_afetacao"]] = afetacao
            for movimento in upserts.get("materiais_mov", []):
                self.state.movimentos[movimento["id_mov"]] = movimento
            if current_fit_movement:
                self._delete_runtime_records(deletions)
        if deletions:
            self._delete_records(deletions)
            self._delete_runtime_records(deletions)
        self._sync_stock_atual_for_item_ids(stock_item_ids_to_sync)
        logger.info(
            "timing.update_fatura_item id_fatura=%s item_id=%s destino=%s deleted_groups=%s duration_ms=%.2f",
            id_fatura,
            item_id,
            updated["destino"],
            ",".join(sorted(deletions.keys())) if deletions else "-",
            (perf_counter() - started_at) * 1000,
        )
        return self._to_model(FaturaItemRecord, updated)

    def delete_fatura_item(self, id_fatura: str, item_id: str) -> None:
        current = self.state.fatura_items.get(item_id)
        if not current or current["id_fatura"] != id_fatura:
            raise HTTPException(status_code=404, detail="Invoice item not found")
        delete_groups = self._collect_fit_delete_groups(item_id)
        stock_item_ids_to_sync = self._collect_stock_item_ids_from_groups(delete_groups)
        self._delete_records(delete_groups)
        self._delete_runtime_records(delete_groups)
        self._sync_stock_atual_for_item_ids(stock_item_ids_to_sync)

    def preview_nota_credito_items(self, id_fatura: str, items: list[NotaCreditoItemCreate]) -> NotaCreditoItemsResponse:
        self._require_note_credit_fatura(id_fatura)
        impacts = [impact for item in items for impact in self._preview_nota_credito_impacts(item)]
        return NotaCreditoItemsResponse(items=[], impacts=impacts)

    def create_nota_credito_items(self, id_fatura: str, items: list[NotaCreditoItemCreate]) -> NotaCreditoItemsResponse:
        started_at = perf_counter()
        fatura = self._require_note_credit_fatura(id_fatura)
        created_items: list[dict[str, Any]] = []
        generated_afetacoes: list[dict[str, Any]] = []
        generated_movimentos: list[dict[str, Any]] = []
        impacts: list[OperationImpact] = []
        stock_item_ids_to_sync: set[str] = set()

        for item in items:
            catalog = self._resolve_item_mapping(fatura, item)
            now = self._now()
            note_item = {
                "id_item_nota_credito": self.state.next_id("NCI"),
                "id_fatura": id_fatura,
                "fornecedor": fatura["fornecedor"],
                "nif": fatura["nif"],
                "nr_documento": fatura["nr_documento"],
                "doc_origem": fatura.get("doc_origem"),
                "data_fatura": fatura["data_fatura"],
                "descricao_original": item.descricao_original,
                "id_item": catalog["id_item"],
                "item_oficial": catalog["item_oficial"],
                "unidade": catalog["unidade"],
                "natureza": catalog["natureza"],
                "quantidade": item.quantidade,
                "custo_unit": item.custo_unit,
                "custo_total_sem_iva": self._calc_nota_credito_total_sem_iva(item),
                "iva": item.iva,
                "custo_total_com_iva": self._calc_nota_credito_total_com_iva(item),
                "categoria_nota_credito": self._normalize_nota_credito_categoria(item.categoria_nota_credito),
                "obra": item.obra,
                "fase": item.fase,
                "estado": "GUARDADO",
                "observacoes": item.observacoes,
                "created_at": now,
                "updated_at": now,
            }
            self._validate_nota_credito_item_business_rules(note_item)
            created_items.append(note_item)
            impacts.extend(self._preview_nota_credito_impacts(item))

            if self._note_credit_item_affects_stock(note_item):
                generated_movimentos.append(self._build_nci_stock_movement(note_item, fatura))
                normalized_id = str(note_item.get("id_item") or "").strip()
                if normalized_id:
                    stock_item_ids_to_sync.add(normalized_id)

            if note_item["categoria_nota_credito"] == "NC_COM_OBRA":
                afetacao = self._build_nci_credit_afetacao(note_item, fatura)
                generated_afetacoes.append(afetacao)
                generated_movimentos.append(self._build_afo_movement(afetacao))

        self._persist(
            {
                "notas_credito_itens": created_items,
                "afetacoes_obra": generated_afetacoes,
                "materiais_mov": generated_movimentos,
            }
        )
        for item in created_items:
            self.state.nota_credito_items[item["id_item_nota_credito"]] = item
        for afetacao in generated_afetacoes:
            self.state.afetacoes[afetacao["id_afetacao"]] = afetacao
        for movimento in generated_movimentos:
            self.state.movimentos[movimento["id_mov"]] = movimento
        self._sync_stock_atual_for_item_ids(stock_item_ids_to_sync)
        logger.info(
            "timing.create_nota_credito_items id_fatura=%s items=%s generated_afetacoes=%s generated_movimentos=%s duration_ms=%.2f",
            id_fatura,
            len(created_items),
            len(generated_afetacoes),
            len(generated_movimentos),
            (perf_counter() - started_at) * 1000,
        )
        return NotaCreditoItemsResponse(items=[self._to_model(NotaCreditoItemRecord, item) for item in created_items], impacts=impacts)

    def update_nota_credito_item(self, id_fatura: str, item_id: str, payload: dict[str, Any]) -> NotaCreditoItemRecord:
        started_at = perf_counter()
        current = self.state.nota_credito_items.get(item_id)
        if not current or current["id_fatura"] != id_fatura:
            raise HTTPException(status_code=404, detail="Nota de credito item not found")
        fatura = self._require_note_credit_fatura(id_fatura)
        merged_payload = {
            "descricao_original": current["descricao_original"],
            "id_item": current.get("id_item"),
            "item_oficial": current.get("item_oficial"),
            "natureza": current.get("natureza"),
            "unidade": current.get("unidade"),
            "quantidade": current["quantidade"],
            "custo_unit": current["custo_unit"],
            "iva": current["iva"],
            "categoria_nota_credito": current["categoria_nota_credito"],
            "obra": current.get("obra"),
            "fase": current.get("fase"),
            "observacoes": current.get("observacoes"),
        }
        for key, value in payload.items():
            merged_payload[key] = value
        item_input = NotaCreditoItemCreate.model_validate(merged_payload)
        catalog = self._resolve_item_mapping(fatura, item_input)
        updated = {
            "id_item_nota_credito": current["id_item_nota_credito"],
            "id_fatura": id_fatura,
            "fornecedor": fatura["fornecedor"],
            "nif": fatura["nif"],
            "nr_documento": fatura["nr_documento"],
            "doc_origem": fatura.get("doc_origem"),
            "data_fatura": fatura["data_fatura"],
            "descricao_original": item_input.descricao_original,
            "id_item": catalog["id_item"],
            "item_oficial": catalog["item_oficial"],
            "unidade": catalog["unidade"],
            "natureza": catalog["natureza"],
            "quantidade": item_input.quantidade,
            "custo_unit": item_input.custo_unit,
            "custo_total_sem_iva": self._calc_nota_credito_total_sem_iva(item_input),
            "iva": item_input.iva,
            "custo_total_com_iva": self._calc_nota_credito_total_com_iva(item_input),
            "categoria_nota_credito": self._normalize_nota_credito_categoria(item_input.categoria_nota_credito),
            "obra": item_input.obra,
            "fase": item_input.fase,
            "estado": "GUARDADO",
            "observacoes": item_input.observacoes,
            "created_at": current["created_at"],
            "updated_at": self._now(),
        }
        if current.get("sheet_row_num") is not None:
            updated["sheet_row_num"] = current["sheet_row_num"]
        self._validate_nota_credito_item_business_rules(updated)

        current_note_movement = self._find_movement_by_source("NCI", item_id)
        current_direct_afetacao = self._find_direct_afetacao_by_source(item_id)
        current_afo_movement = (
            self._find_movement_by_source("AFO", current_direct_afetacao["id_afetacao"])
            if current_direct_afetacao
            else None
        )
        stock_item_ids_to_sync = set()
        if self._note_credit_item_affects_stock(current):
            normalized_id = str(current.get("id_item") or "").strip()
            if normalized_id:
                stock_item_ids_to_sync.add(normalized_id)
        if self._note_credit_item_affects_stock(updated):
            normalized_id = str(updated.get("id_item") or "").strip()
            if normalized_id:
                stock_item_ids_to_sync.add(normalized_id)

        upserts: dict[str, list[dict[str, Any]]] = {"notas_credito_itens": [updated]}
        deletions: dict[str, list[str]] = {}

        if self._note_credit_item_affects_stock(updated):
            movement = self._build_nci_stock_movement(updated, fatura)
            if current_note_movement:
                movement = self._reuse_record_identity(movement, current_note_movement, "id_mov", keep_sequence=True)
            upserts.setdefault("materiais_mov", []).append(movement)
        elif current_note_movement:
            self._merge_delete_groups(deletions, {"materiais_mov": [current_note_movement["id_mov"]]})

        if updated["categoria_nota_credito"] == "NC_COM_OBRA":
            credit_afetacao = self._build_nci_credit_afetacao(updated, fatura)
            if current_direct_afetacao:
                credit_afetacao = self._reuse_record_identity(credit_afetacao, current_direct_afetacao, "id_afetacao")
            upserts["afetacoes_obra"] = [credit_afetacao]
            direct_movement = self._build_afo_movement(credit_afetacao)
            if current_afo_movement:
                direct_movement = self._reuse_record_identity(direct_movement, current_afo_movement, "id_mov", keep_sequence=True)
            upserts.setdefault("materiais_mov", []).append(direct_movement)
        elif current_direct_afetacao:
            self._merge_delete_groups(deletions, self._collect_afetacao_delete_groups(current_direct_afetacao["id_afetacao"]))

        self._persist(upserts)
        self.state.nota_credito_items[item_id] = updated
        for afetacao in upserts.get("afetacoes_obra", []):
            self.state.afetacoes[afetacao["id_afetacao"]] = afetacao
        for movimento in upserts.get("materiais_mov", []):
            self.state.movimentos[movimento["id_mov"]] = movimento
        if deletions:
            self._delete_records(deletions)
            self._delete_runtime_records(deletions)
        self._sync_stock_atual_for_item_ids(stock_item_ids_to_sync)
        logger.info(
            "timing.update_nota_credito_item id_fatura=%s item_id=%s categoria=%s deleted_groups=%s duration_ms=%.2f",
            id_fatura,
            item_id,
            updated["categoria_nota_credito"],
            ",".join(sorted(deletions.keys())) if deletions else "-",
            (perf_counter() - started_at) * 1000,
        )
        return self._to_model(NotaCreditoItemRecord, updated)

    def delete_nota_credito_item(self, id_fatura: str, item_id: str) -> None:
        current = self.state.nota_credito_items.get(item_id)
        if not current or current["id_fatura"] != id_fatura:
            raise HTTPException(status_code=404, detail="Nota de credito item not found")
        delete_groups = self._collect_nci_delete_groups(item_id)
        stock_item_ids_to_sync = self._collect_stock_item_ids_from_groups(delete_groups)
        self._delete_records(delete_groups)
        self._delete_runtime_records(delete_groups)
        self._sync_stock_atual_for_item_ids(stock_item_ids_to_sync)

    def list_catalog(self) -> list[CatalogEntryRecord]:
        return [self._to_catalog_model(item) for item in self.state.catalog.values()]

    def create_catalog_entry(self, payload: CatalogEntryCreate) -> CatalogEntryRecord:
        self._ensure_catalog_item_unique(payload.item_oficial)
        now = self._now()
        record = {
            "id_item": self._generate_catalog_id(payload.natureza),
            "item_oficial": payload.item_oficial,
            "natureza": payload.natureza,
            "unidade": payload.unidade,
            "observacoes": payload.observacoes,
            "estado_cadastro": "ATIVO",
            "created_at": now,
            "updated_at": now,
        }
        reference = self._prepare_catalog_reference_record(record["id_item"], payload.descricao_original, now=now)
        upserts: dict[str, list[dict[str, Any]]] = {"materiais_cad": [record]}
        if reference:
            upserts["materiais_referencias"] = [reference]
        self._persist(upserts)
        self.state.catalog[record["id_item"]] = record
        if reference:
            self.state.catalog_references[reference["id_referencia"]] = reference
        return self._to_catalog_model(record)

    def patch_catalog_entry(self, id_item: str, payload: CatalogEntryUpdate) -> CatalogEntryRecord:
        current = deepcopy(self._require_catalog(id_item))
        for field, value in payload.model_dump(exclude_none=True).items():
            current[field] = value
        self._ensure_catalog_item_unique(current["item_oficial"], exclude_id=id_item)
        current["updated_at"] = self._now()
        dependent_fit_updates: list[dict[str, Any]] = []
        dependent_nci_updates: list[dict[str, Any]] = []
        dependent_afetacao_updates: list[dict[str, Any]] = []
        dependent_mov_updates: list[dict[str, Any]] = []
        for fit in self.state.fatura_items.values():
            if fit["id_item"] != id_item:
                continue
            updated_fit = deepcopy(fit)
            updated_fit["item_oficial"] = current["item_oficial"]
            updated_fit["natureza"] = current["natureza"]
            updated_fit["unidade"] = current["unidade"]
            updated_fit["updated_at"] = current["updated_at"]
            dependent_fit_updates.append(updated_fit)
        for note_item in self.state.nota_credito_items.values():
            if note_item["id_item"] != id_item:
                continue
            updated_note_item = deepcopy(note_item)
            updated_note_item["item_oficial"] = current["item_oficial"]
            updated_note_item["natureza"] = current["natureza"]
            updated_note_item["unidade"] = current["unidade"]
            updated_note_item["updated_at"] = current["updated_at"]
            dependent_nci_updates.append(updated_note_item)
        for afetacao in self.state.afetacoes.values():
            if afetacao["id_item"] != id_item:
                continue
            updated_afetacao = deepcopy(afetacao)
            updated_afetacao["item_oficial"] = current["item_oficial"]
            updated_afetacao["natureza"] = current["natureza"]
            updated_afetacao["unidade"] = current["unidade"]
            updated_afetacao["updated_at"] = current["updated_at"]
            dependent_afetacao_updates.append(updated_afetacao)
        for movimento in self.state.movimentos.values():
            if movimento["id_item"] != id_item:
                continue
            updated_movimento = deepcopy(movimento)
            updated_movimento["item_oficial"] = current["item_oficial"]
            updated_movimento["unidade"] = current["unidade"]
            updated_movimento["updated_at"] = current["updated_at"]
            dependent_mov_updates.append(updated_movimento)

        self._persist(
            {
                "materiais_cad": [current],
                "faturas_itens": dependent_fit_updates,
                "notas_credito_itens": dependent_nci_updates,
                "afetacoes_obra": dependent_afetacao_updates,
                "materiais_mov": dependent_mov_updates,
            }
        )
        self.state.catalog[id_item] = current
        for fit in dependent_fit_updates:
            self.state.fatura_items[fit["id_item_fatura"]] = fit
        for note_item in dependent_nci_updates:
            self.state.nota_credito_items[note_item["id_item_nota_credito"]] = note_item
        for afetacao in dependent_afetacao_updates:
            self.state.afetacoes[afetacao["id_afetacao"]] = afetacao
        for movimento in dependent_mov_updates:
            self.state.movimentos[movimento["id_mov"]] = movimento
        self._sync_stock_atual_for_item_ids({id_item})
        return self._to_catalog_model(current)

    def delete_catalog_entry(self, id_item: str) -> None:
        self._require_catalog(id_item)
        if any(item["id_item"] == id_item for item in self.state.fatura_items.values()):
            raise HTTPException(status_code=422, detail="CATALOGO_REFERENCIADO")
        if any(item["id_item"] == id_item for item in self.state.nota_credito_items.values()):
            raise HTTPException(status_code=422, detail="CATALOGO_REFERENCIADO")
        if any(item["id_item"] == id_item for item in self.state.afetacoes.values()):
            raise HTTPException(status_code=422, detail="CATALOGO_REFERENCIADO")
        if any(item["id_item"] == id_item for item in self.state.movimentos.values()):
            raise HTTPException(status_code=422, detail="CATALOGO_REFERENCIADO")
        reference_ids = [
            str(reference["id_referencia"])
            for reference in self.state.catalog_references.values()
            if str(reference.get("id_item") or "") == id_item
        ]
        delete_groups = {"materiais_cad": [id_item]}
        if reference_ids:
            delete_groups["materiais_referencias"] = reference_ids
        self._delete_records(delete_groups)
        self._delete_runtime_records(delete_groups)

    def seed_catalog_references_from_invoice_items(
        self,
        *,
        apply: bool = False,
        limit: int | None = None,
    ) -> dict[str, Any]:
        def _row_sort_key(item: dict[str, Any]) -> tuple[int, str]:
            try:
                row_num = int(item.get("sheet_row_num") or 0)
            except (TypeError, ValueError):
                row_num = 0
            return row_num, str(item.get("id_item_fatura") or "")

        items = sorted(
            self.state.fatura_items.values(),
            key=_row_sort_key,
        )
        existing_references_by_description = {
            self._normalize(str(reference.get("descricao_original") or "")): reference
            for reference in self.state.catalog_references.values()
            if self._normalize(str(reference.get("descricao_original") or ""))
        }

        grouped_candidates: dict[str, dict[str, Any]] = {}
        skipped_missing_description = 0
        skipped_missing_mapping = 0
        skipped_missing_catalog = 0
        existing_matches: list[dict[str, Any]] = []
        existing_conflicts: list[dict[str, Any]] = []

        for item in items:
            descricao_original = str(item.get("descricao_original") or "").strip()
            if not descricao_original:
                skipped_missing_description += 1
                continue

            id_item = str(item.get("id_item") or "").strip()
            if not id_item:
                skipped_missing_mapping += 1
                continue

            if id_item not in self.state.catalog:
                skipped_missing_catalog += 1
                continue

            normalized_description = self._normalize(descricao_original)
            if not normalized_description:
                skipped_missing_description += 1
                continue

            existing_reference = existing_references_by_description.get(normalized_description)
            if existing_reference:
                payload = {
                    "descricao_original": descricao_original,
                    "id_item": id_item,
                    "existing_id_item": str(existing_reference.get("id_item") or ""),
                }
                if payload["existing_id_item"] == id_item:
                    existing_matches.append(payload)
                else:
                    payload["conflict"] = "EXISTING_REFERENCE_WITH_DIFFERENT_ID_ITEM"
                    existing_conflicts.append(payload)
                continue

            entry = grouped_candidates.setdefault(
                normalized_description,
                {
                    "descricao_original": descricao_original,
                    "id_items": set(),
                    "source_item_ids": [],
                },
            )
            entry["id_items"].add(id_item)
            if len(entry["source_item_ids"]) < 10:
                entry["source_item_ids"].append(str(item.get("id_item_fatura") or ""))

        candidate_rows: list[dict[str, Any]] = []
        grouped_conflicts: list[dict[str, Any]] = existing_conflicts[:]
        for entry in grouped_candidates.values():
            id_items = sorted(entry["id_items"])
            if len(id_items) != 1:
                grouped_conflicts.append(
                    {
                        "descricao_original": entry["descricao_original"],
                        "id_items": id_items,
                        "source_item_ids": entry["source_item_ids"],
                        "conflict": "MULTIPLE_ID_ITEM_IN_FATURAS_ITENS",
                    }
                )
                continue
            candidate_rows.append(
                {
                    "descricao_original": entry["descricao_original"],
                    "id_item": id_items[0],
                    "source_item_ids": entry["source_item_ids"],
                }
            )

        candidate_rows.sort(key=lambda item: (str(item["id_item"]), self._normalize(str(item["descricao_original"]))))
        selected_candidates = candidate_rows[:limit] if limit and limit > 0 else candidate_rows

        created_records: list[dict[str, Any]] = []
        if apply and selected_candidates:
            timestamp = self._now()
            for candidate in selected_candidates:
                record = {
                    "id_referencia": self.state.next_id("REF"),
                    "descricao_original": candidate["descricao_original"],
                    "id_item": candidate["id_item"],
                    "observacoes": "Seeded from FATURAS_ITENS",
                    "estado_referencia": "ATIVA",
                    "created_at": timestamp,
                    "updated_at": timestamp,
                }
                created_records.append(record)
            self._persist({"materiais_referencias": created_records})
            for record in created_records:
                self.state.catalog_references[record["id_referencia"]] = record

        return {
            "applied": apply,
            "scanned_rows": len(items),
            "skipped_missing_description": skipped_missing_description,
            "skipped_missing_mapping": skipped_missing_mapping,
            "skipped_missing_catalog": skipped_missing_catalog,
            "existing_reference_matches": len(existing_matches),
            "conflicts": len(grouped_conflicts),
            "candidate_count_total": len(candidate_rows),
            "candidate_count_selected": len(selected_candidates),
            "created_count": len(created_records),
            "candidates_preview": selected_candidates[:10],
            "conflicts_preview": grouped_conflicts[:10],
            "created_preview": created_records[:10],
        }

    def diagnose_stock_movement_duplicates(self, *, apply: bool = False) -> dict[str, Any]:
        stock_afetacoes = sorted(
            (af for af in self.state.afetacoes.values() if af.get("origem") == "STOCK"),
            key=lambda item: str(item.get("id_afetacao") or ""),
        )
        exact_duplicate_groups: list[dict[str, Any]] = []
        context_overlap_groups: list[dict[str, Any]] = []
        unreconciled_afetacoes: list[dict[str, Any]] = []
        cleanup_ids: list[str] = []

        for afetacao in stock_afetacoes:
            linked = self._find_movement_by_source("AFO", afetacao["id_afetacao"])
            exact_matches = sorted(
                (
                    movement
                    for movement in self.state.movimentos.values()
                    if self._movement_matches_stock_afetacao(movement, afetacao)
                ),
                key=lambda movement: (
                    int(movement.get("sequence") or 0),
                    str(movement.get("id_mov") or ""),
                ),
            )
            context_matches = sorted(
                (
                    movement
                    for movement in self.state.movimentos.values()
                    if self._movement_overlaps_stock_context(movement, afetacao)
                ),
                key=lambda movement: (
                    int(movement.get("sequence") or 0),
                    str(movement.get("id_mov") or ""),
                ),
            )

            if len(exact_matches) > 1:
                canonical = linked or exact_matches[0]
                duplicate_ids = [
                    str(movement["id_mov"])
                    for movement in exact_matches
                    if str(movement["id_mov"]) != str(canonical["id_mov"])
                ]
                exact_duplicate_groups.append(
                    {
                        "id_afetacao": afetacao["id_afetacao"],
                        "estado": afetacao.get("estado"),
                        "linked_id_mov": linked["id_mov"] if linked else None,
                        "canonical_id_mov": canonical["id_mov"],
                        "duplicate_id_movs": duplicate_ids,
                        "match_count": len(exact_matches),
                        "id_item": afetacao.get("id_item"),
                        "quantidade": afetacao.get("quantidade"),
                        "data": afetacao.get("data"),
                        "obra": afetacao.get("obra"),
                        "fase": afetacao.get("fase"),
                    }
                )
                if linked and duplicate_ids:
                    cleanup_ids.extend(duplicate_ids)

            if len(context_matches) > 1:
                exact_ids = {str(movement["id_mov"]) for movement in exact_matches}
                overlap_only = [
                    str(movement["id_mov"])
                    for movement in context_matches
                    if str(movement["id_mov"]) not in exact_ids
                ]
                if overlap_only:
                    context_overlap_groups.append(
                        {
                            "id_afetacao": afetacao["id_afetacao"],
                            "linked_id_mov": linked["id_mov"] if linked else None,
                            "overlap_id_movs": overlap_only,
                            "all_context_id_movs": [str(movement["id_mov"]) for movement in context_matches],
                            "id_item": afetacao.get("id_item"),
                            "quantidade": afetacao.get("quantidade"),
                            "data": afetacao.get("data"),
                            "obra": afetacao.get("obra"),
                            "fase": afetacao.get("fase"),
                        }
                    )

            if self._stock_afetacao_expects_existing_movement(afetacao) and not linked and not exact_matches:
                unreconciled_afetacoes.append(
                    {
                        "id_afetacao": afetacao["id_afetacao"],
                        "estado": afetacao.get("estado"),
                        "id_item": afetacao.get("id_item"),
                        "quantidade": afetacao.get("quantidade"),
                        "data": afetacao.get("data"),
                        "obra": afetacao.get("obra"),
                        "fase": afetacao.get("fase"),
                    }
                )

        cleanup_ids = sorted(set(cleanup_ids))
        deleted_ids: list[str] = []
        if apply and cleanup_ids:
            self._delete_records({"materiais_mov": cleanup_ids})
            self._delete_runtime_records({"materiais_mov": cleanup_ids})
            deleted_ids = cleanup_ids

        return {
            "applied": apply,
            "stock_afetacoes_scanned": len(stock_afetacoes),
            "exact_duplicate_groups": len(exact_duplicate_groups),
            "exact_duplicate_candidates": len(cleanup_ids),
            "context_overlap_groups": len(context_overlap_groups),
            "unreconciled_generated_afetacoes": len(unreconciled_afetacoes),
            "cleanup_id_movs": cleanup_ids,
            "deleted_count": len(deleted_ids),
            "deleted_id_movs": deleted_ids,
            "exact_duplicate_preview": exact_duplicate_groups[:10],
            "context_overlap_preview": context_overlap_groups[:10],
            "unreconciled_preview": unreconciled_afetacoes[:10],
        }

    def backfill_incomplete_consumo_movement_totals(
        self,
        *,
        apply: bool = False,
        limit: int | None = None,
    ) -> dict[str, Any]:
        movements = sorted(
            self.state.movimentos.values(),
            key=lambda item: (int(item.get("sequence") or 0), str(item.get("id_mov") or "")),
        )
        candidates: list[dict[str, Any]] = []
        unresolved: list[dict[str, Any]] = []

        for movement in movements:
            prepared = self._prepare_consumo_movement_total_backfill(movement)
            if not prepared:
                continue
            if prepared.get("updated_record") is None:
                unresolved.append(prepared)
                continue
            candidates.append(prepared)

        selected = candidates[:limit] if limit and limit > 0 else candidates
        updated_records = [candidate["updated_record"] for candidate in selected]
        applied_ids: list[str] = []

        if apply and updated_records:
            self._persist({"materiais_mov": updated_records})
            for record in updated_records:
                self.state.movimentos[str(record["id_mov"])] = record
                applied_ids.append(str(record["id_mov"]))

        return {
            "applied": apply,
            "scanned_rows": len(movements),
            "candidate_count_total": len(candidates),
            "candidate_count_selected": len(selected),
            "updated_count": len(applied_ids),
            "updated_id_movs": applied_ids,
            "unresolved_count": len(unresolved),
            "candidates_preview": [
                {
                    "id_mov": candidate["id_mov"],
                    "source_type": candidate["source_type"],
                    "source_id": candidate["source_id"],
                    "id_item": candidate["id_item"],
                    "missing_fields": candidate["missing_fields"],
                    "current": candidate["current"],
                    "updated": candidate["updated"],
                }
                for candidate in selected[:10]
            ],
            "unresolved_preview": [
                {
                    "id_mov": candidate["id_mov"],
                    "source_type": candidate["source_type"],
                    "source_id": candidate["source_id"],
                    "id_item": candidate["id_item"],
                    "missing_fields": candidate["missing_fields"],
                }
                for candidate in unresolved[:10]
            ],
        }

    def list_afetacoes(self) -> list[AfetacaoRecord]:
        return [self._to_model(AfetacaoRecord, item) for item in self.state.afetacoes.values()]

    def create_afetacao(self, payload: AfetacaoCreate) -> AfetacaoRecord:
        catalog = self._require_catalog(payload.id_item)
        now = self._now()
        should_process = payload.origem == "STOCK" or payload.processar
        record = {
            "id_afetacao": self.state.next_id("AFO"),
            "origem": payload.origem,
            "source_id": payload.source_id,
            "data": payload.data,
            "id_item": payload.id_item,
            "item_oficial": catalog["item_oficial"],
            "natureza": catalog["natureza"],
            "uso_combustivel": self._normalize_uso_combustivel(payload.uso_combustivel, catalog["natureza"]),
            "quantidade": payload.quantidade,
            "unidade": catalog["unidade"],
            "custo_unit": 0.0,
            "custo_total": 0.0,
            "custo_total_sem_iva": 0.0,
            "iva": payload.iva,
            "custo_total_com_iva": 0.0,
            "obra": payload.obra,
            "fase": payload.fase,
            "fornecedor": None,
            "nif": None,
            "nr_documento": None,
            "processar": should_process,
            "estado": "AGUARDA_PROCESSAR" if not should_process else "PRONTO_MOVIMENTO",
            "observacoes": payload.observacoes,
            "created_at": now,
            "updated_at": now,
        }
        self._validate_stock_afetacao_business_rules(record)
        batches: dict[str, list[dict[str, Any]]] = {"afetacoes_obra": [record]}
        processed = None
        if should_process:
            processed = self._process_stock_afetacao(record)
            record = processed["afetacao"]
            batches["afetacoes_obra"] = [record]
            batches["materiais_mov"] = [processed["movimento"]]
        self._persist(batches)
        self.state.afetacoes[record["id_afetacao"]] = record
        if processed:
            self.state.movimentos[processed["movimento"]["id_mov"]] = processed["movimento"]
            self._sync_stock_atual_for_item_ids({str(record.get("id_item") or "").strip()})
        return self._to_model(AfetacaoRecord, record)

    def patch_afetacao(self, id_afetacao: str, payload: AfetacaoUpdate) -> AfetacaoRecord:
        current = deepcopy(self._require_afetacao(id_afetacao))
        if current["origem"] != "STOCK":
            raise HTTPException(status_code=422, detail="AFETACAO_GERADA_SOMENTE_PELA_FATURA")
        for field, value in payload.model_dump(exclude_none=True).items():
            current[field] = value
        catalog = self._require_catalog(current["id_item"])
        current["item_oficial"] = catalog["item_oficial"]
        current["natureza"] = catalog["natureza"]
        current["unidade"] = catalog["unidade"]
        current["uso_combustivel"] = self._normalize_uso_combustivel(current.get("uso_combustivel"), catalog["natureza"])
        current["updated_at"] = self._now()
        self._validate_stock_afetacao_business_rules(current)
        stock_item_ids_to_sync = {
            str(self._require_afetacao(id_afetacao).get("id_item") or "").strip(),
            str(current.get("id_item") or "").strip(),
        }
        processed = self._process_stock_afetacao(current)
        self._persist({"afetacoes_obra": [processed["afetacao"]], "materiais_mov": [processed["movimento"]]})
        self.state.afetacoes[id_afetacao] = processed["afetacao"]
        self.state.movimentos[processed["movimento"]["id_mov"]] = processed["movimento"]
        self._sync_stock_atual_for_item_ids(stock_item_ids_to_sync)
        return self._to_model(AfetacaoRecord, processed["afetacao"])

    def delete_afetacao(self, id_afetacao: str) -> None:
        current = self._require_afetacao(id_afetacao)
        if current["origem"] != "STOCK":
            raise HTTPException(status_code=422, detail="AFETACAO_GERADA_SOMENTE_PELA_FATURA")
        delete_groups = self._collect_afetacao_delete_groups(id_afetacao)
        stock_item_ids_to_sync = self._collect_stock_item_ids_from_groups(delete_groups)
        self._delete_records(delete_groups)
        self._delete_runtime_records(delete_groups)
        self._sync_stock_atual_for_item_ids(stock_item_ids_to_sync)

    def process_afetacao(self, id_afetacao: str) -> AfetacaoRecord:
        current = deepcopy(self._require_afetacao(id_afetacao))
        processed = self._process_stock_afetacao(current)
        self._persist({"afetacoes_obra": [processed["afetacao"]], "materiais_mov": [processed["movimento"]]})
        self.state.afetacoes[id_afetacao] = processed["afetacao"]
        self.state.movimentos[processed["movimento"]["id_mov"]] = processed["movimento"]
        self._sync_stock_atual_for_item_ids({str(processed["afetacao"].get("id_item") or "").strip()})
        return self._to_model(AfetacaoRecord, processed["afetacao"])

    def get_stock_snapshot(self, id_item: str) -> StockSnapshot:
        catalog = self._require_catalog(id_item)
        qty = 0.0
        value = 0.0
        movimentos = sorted(self.state.movimentos.values(), key=lambda item: item["sequence"])
        for mov in movimentos:
            if mov["id_item"] != id_item:
                continue
            if not self._movement_affects_stock(mov):
                continue
            amount = mov["quantidade"] * mov["custo_unit"]
            if mov["tipo"] == "ENTRADA":
                qty += mov["quantidade"]
                value += amount
            else:
                qty -= mov["quantidade"]
                value -= amount
        avg = value / qty if qty > 0 else 0.0
        qty_rounded = round(qty, 6)
        avg_rounded = round(avg, 6)
        return StockSnapshot(
            id_item=id_item,
            item_oficial=catalog["item_oficial"],
            unidade=catalog["unidade"],
            stock_atual=qty_rounded,
            custo_medio_atual=avg_rounded,
            valor_stock=round(qty_rounded * avg_rounded, 6),
        )

    def list_stock_snapshots(self) -> list[StockSnapshot]:
        ids = {
            movement["id_item"]
            for movement in self.state.movimentos.values()
            if movement.get("id_item") and self._movement_affects_stock(movement)
        }
        snapshots = [self.get_stock_snapshot(id_item) for id_item in sorted(ids)]
        return sorted(snapshots, key=lambda item: item.id_item)

    def rebuild_stock_atual_snapshot(self, *, apply: bool = False) -> dict[str, Any]:
        snapshots = [snapshot.model_dump() for snapshot in self.list_stock_snapshots()]
        current_ids = {str(snapshot.get("id_item") or "").strip() for snapshot in snapshots if str(snapshot.get("id_item") or "").strip()}

        existing_rows: list[dict[str, Any]] = []
        try:
            existing_rows = self.google_sheets.load_snapshot().get("stock_atual", [])
        except Exception:
            logger.exception("Failed to read STOCK_ATUAL before rebuild")

        existing_ids = {
            str(row.get("id_item") or "").strip()
            for row in existing_rows
            if str(row.get("id_item") or "").strip()
        }
        stale_ids = sorted(existing_ids - current_ids)

        if apply and snapshots:
            self._persist({"stock_atual": snapshots})
        if apply and stale_ids:
            self._delete_records({"stock_atual": stale_ids})

        return {
            "applied": apply,
            "rows_selected": len(snapshots),
            "existing_rows": len(existing_ids),
            "deleted_count": len(stale_ids) if apply else 0,
            "stale_count": len(stale_ids),
            "stale_id_items": stale_ids,
            "preview": [
                {
                    "id_item": snapshot["id_item"],
                    "item_oficial": snapshot.get("item_oficial"),
                    "unidade": snapshot.get("unidade"),
                    "stock_atual": snapshot.get("stock_atual"),
                    "custo_medio_atual": snapshot.get("custo_medio_atual"),
                    "valor_stock": snapshot.get("valor_stock"),
                }
                for snapshot in snapshots[:20]
            ],
        }

    def _sync_stock_atual_for_item_ids(self, item_ids: set[str] | list[str] | tuple[str, ...]) -> None:
        normalized_ids = sorted({str(item_id or "").strip() for item_id in item_ids if str(item_id or "").strip()})
        if not normalized_ids:
            return

        started_at = perf_counter()
        has_history = {id_item: self._item_has_stock_history(id_item) for id_item in normalized_ids}
        upserts = [
            self.get_stock_snapshot(id_item).model_dump()
            for id_item in normalized_ids
            if has_history[id_item]
        ]
        stale_ids = [id_item for id_item in normalized_ids if not has_history[id_item]]

        if upserts:
            self._persist({"stock_atual": upserts})
        if stale_ids:
            self._delete_records({"stock_atual": stale_ids})

        logger.info(
            "timing.stock_atual_sync items=%s upserts=%s deletes=%s duration_ms=%.2f",
            ",".join(normalized_ids),
            len(upserts),
            len(stale_ids),
            (perf_counter() - started_at) * 1000,
        )

    def _item_has_stock_history(self, id_item: str) -> bool:
        normalized_id = str(id_item or "").strip()
        if not normalized_id:
            return False
        return any(
            str(movement.get("id_item") or "").strip() == normalized_id and self._movement_affects_stock(movement)
            for movement in self.state.movimentos.values()
        )

    def list_movimentos(self) -> list[MovimentoRecord]:
        movements = sorted(self.state.movimentos.values(), key=lambda item: item["sequence"], reverse=True)
        return [self._to_model(MovimentoRecord, movement) for movement in movements]

    def _persist(self, groups: dict[str, list[dict[str, Any]]]) -> None:
        for movement in groups.get("materiais_mov", []):
            self._normalize_movimento_financials(movement)
        batches = [WriteBatch(entity=entity, records=records) for entity, records in groups.items() if records]
        if not batches:
            return
        summary = ",".join(f"{batch.entity}:{len(batch.records)}" for batch in batches)
        total_started_at = perf_counter()
        google_started_at = perf_counter()
        self.google_sheets.write_batches(batches)
        google_duration_ms = (perf_counter() - google_started_at) * 1000
        logger.info(
            "timing.persist.google batches=%s duration_ms=%.2f",
            summary,
            google_duration_ms,
        )
        try:
            supabase_started_at = perf_counter()
            self.supabase.write_batches(batches)
            supabase_duration_ms = (perf_counter() - supabase_started_at) * 1000
            for batch in batches:
                self.state.touch_sync_job(batch.entity, pending_retry=False, upserted=len(batch.records))
            logger.info(
                "timing.persist.supabase batches=%s duration_ms=%.2f",
                summary,
                supabase_duration_ms,
            )
        except SupabaseAdapterError as exc:
            for batch in batches:
                self.state.touch_sync_job(
                    batch.entity,
                    pending_retry=True,
                    error=str(exc),
                    payload={"operation": "upsert", "rows": batch.records},
                )
            logger.warning(
                "timing.persist.supabase_failed batches=%s error=%s",
                summary,
                exc,
            )
        logger.info(
            "timing.persist.total batches=%s duration_ms=%.2f",
            summary,
            (perf_counter() - total_started_at) * 1000,
        )

    def _delete_records(self, groups: dict[str, list[str]]) -> None:
        delete_groups = {entity: sorted({record_id for record_id in ids if record_id}) for entity, ids in groups.items() if ids}
        if not delete_groups:
            return
        for entity, ids in delete_groups.items():
            self.google_sheets.delete_records(entity, ids)
        try:
            for entity, ids in delete_groups.items():
                self.supabase.delete_records(entity, ids)
                self.state.touch_sync_job(entity, pending_retry=False, upserted=len(ids))
        except SupabaseAdapterError as exc:
            for entity, ids in delete_groups.items():
                self.state.touch_sync_job(
                    entity,
                    pending_retry=True,
                    error=str(exc),
                    payload={"operation": "delete", "ids": ids},
                )

    def _resolve_item_mapping(self, fatura: dict[str, Any], item: FaturaItemCreate | NotaCreditoItemCreate) -> dict[str, Any]:
        if item.id_item:
            catalog = self._require_catalog(item.id_item)
            self._ensure_catalog_reference(item.id_item, item.descricao_original)
            return catalog
        reference = self._find_catalog_reference_by_description(item.descricao_original)
        if reference:
            return self._require_catalog(str(reference["id_item"]))
        if item.item_oficial and item.natureza and item.unidade:
            return self.create_catalog_entry(
                CatalogEntryCreate(
                    descricao_original=item.descricao_original,
                    item_oficial=item.item_oficial,
                    natureza=item.natureza,
                    unidade=item.unidade,
                )
            ).model_dump()
        raise HTTPException(status_code=422, detail="Catalog match missing for invoice item")

    def _validate_item_business_rules(self, item: dict[str, Any]) -> None:
        natureza = str(item.get("natureza") or "").strip().upper()
        destino = str(item.get("destino") or "").strip().upper()
        uso_combustivel = self._normalize_uso_combustivel(item.get("uso_combustivel"), natureza)
        item["uso_combustivel"] = uso_combustivel

        if self._is_fuel_nature(natureza):
            if uso_combustivel == "N/A":
                raise HTTPException(status_code=422, detail="Fuel items require uso_combustivel")
            if uso_combustivel == "VIATURA":
                if destino != "VIATURA":
                    raise HTTPException(status_code=422, detail="Fuel assigned to viatura requires destino VIATURA")
                if not str(item.get("matricula") or "").strip():
                    raise HTTPException(status_code=422, detail="Fuel assigned to viatura requires matricula")
                item["obra"] = None
                item["fase"] = None
                return
            item["matricula"] = None
            if destino == "VIATURA":
                raise HTTPException(status_code=422, detail="Fuel for maquina or gerador cannot use destino VIATURA")
            if destino == "ESCRITORIO":
                raise HTTPException(status_code=422, detail="Fuel for maquina or gerador cannot use destino ESCRITORIO")
            if destino == "EMPRESA":
                raise HTTPException(status_code=422, detail="Fuel for maquina or gerador cannot use destino EMPRESA")
            if destino == "STOCK":
                return
            if destino == "CONSUMO" and item.get("obra") and item.get("fase"):
                return
            raise HTTPException(status_code=422, detail="Fuel direct consumption requires obra and fase")

        item["matricula"] = None
        item["uso_combustivel"] = "N/A"
        if destino == "VIATURA":
            raise HTTPException(status_code=422, detail="Only fuel items can use destino VIATURA")
        if destino == "STOCK" and natureza != "MATERIAL":
            raise HTTPException(status_code=422, detail="Only MATERIAL items can enter stock")
        if destino == "ESCRITORIO":
            item["obra"] = None
            item["fase"] = None
            return
        if destino == "EMPRESA":
            item["obra"] = None
            item["fase"] = None
            return
        if destino == "CONSUMO" and (not item["obra"] or not item["fase"]):
            raise HTTPException(status_code=422, detail="Direct consumption requires obra and fase")

    def _validate_nota_credito_item_business_rules(self, item: dict[str, Any]) -> None:
        categoria = self._normalize_nota_credito_categoria(item.get("categoria_nota_credito"))
        item["categoria_nota_credito"] = categoria
        if categoria == "NC_COM_OBRA":
            if not item.get("obra") or not item.get("fase"):
                raise HTTPException(status_code=422, detail="NC_COM_OBRA_REQUIRES_OBRA_AND_FASE")
            return
        item["obra"] = None
        item["fase"] = None

    def _validate_stock_afetacao_business_rules(self, afetacao: dict[str, Any]) -> None:
        natureza = str(afetacao.get("natureza") or "").strip().upper()
        uso_combustivel = self._normalize_uso_combustivel(afetacao.get("uso_combustivel"), natureza)
        if self._is_fuel_nature(natureza):
            if uso_combustivel not in {"MAQUINA", "GERADOR"}:
                raise HTTPException(status_code=422, detail="Fuel stock consumption requires MAQUINA or GERADOR")
        else:
            uso_combustivel = "N/A"
        afetacao["uso_combustivel"] = uso_combustivel

    def _build_direct_afetacao(self, fit: dict[str, Any], fatura: dict[str, Any]) -> dict[str, Any]:
        now = self._now()
        return {
            "id_afetacao": self.state.next_id("AFO"),
            "origem": "FATURA_DIRETA",
            "source_id": fit["id_item_fatura"],
            "data": fit["data_fatura"],
            "id_item": fit["id_item"],
            "item_oficial": fit["item_oficial"],
            "natureza": fit["natureza"],
            "uso_combustivel": fit.get("uso_combustivel", "N/A"),
            "quantidade": fit["quantidade"],
            "unidade": fit["unidade"],
            "custo_unit": fit["custo_total_sem_iva"] / fit["quantidade"] if fit["quantidade"] else fit["custo_unit"],
            "custo_total": fit["custo_total_com_iva"],
            "custo_total_sem_iva": fit["custo_total_sem_iva"],
            "iva": fit["iva"],
            "custo_total_com_iva": fit["custo_total_com_iva"],
            "obra": fit["obra"],
            "fase": fit["fase"],
            "fornecedor": fatura["fornecedor"],
            "nif": fatura["nif"],
            "nr_documento": fatura["nr_documento"],
            "processar": True,
            "estado": "MOVIMENTO_GERADO",
            "observacoes": "Gerado automaticamente a partir de FATURAS_ITENS",
            "created_at": now,
            "updated_at": now,
        }

    def _build_nci_credit_afetacao(self, note_item: dict[str, Any], fatura: dict[str, Any]) -> dict[str, Any]:
        now = self._now()
        quantidade = abs(float(note_item.get("quantidade") or 0.0))
        unit_cost = note_item["custo_total_sem_iva"] / quantidade if quantidade else note_item["custo_unit"]
        return {
            "id_afetacao": self.state.next_id("AFO"),
            "origem": "FATURA_DIRETA",
            "source_id": note_item["id_item_nota_credito"],
            "data": note_item["data_fatura"],
            "id_item": note_item["id_item"],
            "item_oficial": note_item["item_oficial"],
            "natureza": note_item["natureza"],
            "uso_combustivel": "N/A",
            "quantidade": -quantidade,
            "unidade": note_item["unidade"],
            "custo_unit": unit_cost,
            "custo_total": -note_item["custo_total_com_iva"],
            "custo_total_sem_iva": -note_item["custo_total_sem_iva"],
            "iva": note_item["iva"],
            "custo_total_com_iva": -note_item["custo_total_com_iva"],
            "obra": note_item["obra"],
            "fase": note_item["fase"],
            "fornecedor": fatura["fornecedor"],
            "nif": fatura["nif"],
            "nr_documento": fatura["nr_documento"],
            "processar": True,
            "estado": "MOVIMENTO_GERADO",
            "observacoes": "Gerado automaticamente a partir de NOTAS_CREDITO_ITENS",
            "created_at": now,
            "updated_at": now,
        }

    def _build_fit_movement(self, fit: dict[str, Any], fatura: dict[str, Any], tipo: str) -> dict[str, Any]:
        now = self._now()
        destination = str(fit.get("destino") or "").strip().upper()
        movement_obra = None
        movement_fase = None
        if tipo == "CONSUMO" and destination == "CONSUMO":
            movement_obra = fit["obra"]
            movement_fase = fit["fase"]
        elif tipo == "CONSUMO" and destination == "ESCRITORIO":
            movement_obra = "ESCRITORIO"
        elif tipo == "CONSUMO" and destination == "EMPRESA":
            movement_obra = "EMPRESA"
        return {
            "id_mov": self.state.next_id("MOV"),
            "tipo": tipo,
            "data": fit["data_fatura"],
            "id_item": fit["id_item"],
            "item_oficial": fit["item_oficial"],
            "unidade": fit["unidade"],
            "uso_combustivel": fit.get("uso_combustivel", "N/A"),
            "matricula": fit.get("matricula"),
            "quantidade": fit["quantidade"],
            "custo_unit": fit["custo_total_sem_iva"] / fit["quantidade"] if fit["quantidade"] else fit["custo_unit"],
            "custo_total_sem_iva": fit["custo_total_sem_iva"],
            "iva": fit["iva"],
            "custo_total_com_iva": fit["custo_total_com_iva"],
            "obra": movement_obra,
            "fase": movement_fase,
            "fornecedor": fatura["fornecedor"],
            "nif": fatura["nif"],
            "nr_documento": fatura["nr_documento"],
            "observacoes": f"[SRC_FIT:{fit['id_item_fatura']}]",
            "source_type": "FIT",
            "source_id": fit["id_item_fatura"],
            "created_at": now,
            "updated_at": now,
            "sequence": self.state.next_sequence(),
        }

    def _build_nci_stock_movement(self, note_item: dict[str, Any], fatura: dict[str, Any]) -> dict[str, Any]:
        now = self._now()
        quantidade = abs(float(note_item.get("quantidade") or 0.0))
        unit_cost = note_item["custo_total_sem_iva"] / quantidade if quantidade else note_item["custo_unit"]
        observacoes = f"[SRC_NCI:{note_item['id_item_nota_credito']}]"
        if note_item.get("categoria_nota_credito") == "NC_COM_OBRA" and note_item.get("obra"):
            observacoes += f" [OBRA:{note_item['obra']}]"
            if note_item.get("fase"):
                observacoes += f" [FASE:{note_item['fase']}]"
        return {
            "id_mov": self.state.next_id("MOV"),
            "tipo": "CONSUMO",
            "data": note_item["data_fatura"],
            "id_item": note_item["id_item"],
            "item_oficial": note_item["item_oficial"],
            "unidade": note_item["unidade"],
            "uso_combustivel": "N/A",
            "matricula": None,
            "quantidade": quantidade,
            "custo_unit": unit_cost,
            "custo_total_sem_iva": note_item["custo_total_sem_iva"],
            "iva": note_item["iva"],
            "custo_total_com_iva": note_item["custo_total_com_iva"],
            "obra": None,
            "fase": None,
            "fornecedor": fatura["fornecedor"],
            "nif": fatura["nif"],
            "nr_documento": fatura["nr_documento"],
            "observacoes": observacoes,
            "source_type": "NCI",
            "source_id": note_item["id_item_nota_credito"],
            "created_at": now,
            "updated_at": now,
            "sequence": self.state.next_sequence(),
        }

    def _build_afo_movement(self, afetacao: dict[str, Any]) -> dict[str, Any]:
        now = self._now()
        observations = f"[SRC_AFO:{afetacao['id_afetacao']}]"
        if afetacao.get("source_id"):
            source_marker = "SRC_NCI" if str(afetacao.get("source_id") or "").startswith("NCI-") else "SRC_FIT"
            observations += f" [{source_marker}:{afetacao['source_id']}]"
        return {
            "id_mov": self.state.next_id("MOV"),
            "tipo": "CONSUMO",
            "data": afetacao["data"],
            "id_item": afetacao["id_item"],
            "item_oficial": afetacao["item_oficial"],
            "unidade": afetacao["unidade"],
            "uso_combustivel": afetacao.get("uso_combustivel", "N/A"),
            "matricula": afetacao.get("matricula"),
            "quantidade": afetacao["quantidade"],
            "custo_unit": afetacao["custo_unit"],
            "custo_total_sem_iva": afetacao["custo_total_sem_iva"],
            "iva": afetacao["iva"],
            "custo_total_com_iva": afetacao["custo_total_com_iva"],
            "obra": afetacao["obra"],
            "fase": afetacao["fase"],
            "fornecedor": afetacao["fornecedor"],
            "nif": afetacao["nif"],
            "nr_documento": afetacao["nr_documento"],
            "observacoes": observations,
            "source_type": "AFO",
            "source_id": afetacao["id_afetacao"],
            "created_at": now,
            "updated_at": now,
            "sequence": self.state.next_sequence(),
        }

    def _process_stock_afetacao(self, afetacao: dict[str, Any]) -> dict[str, dict[str, Any]]:
        if afetacao["origem"] != "STOCK":
            raise HTTPException(status_code=422, detail="Only STOCK afetacoes can be manually processed")
        snapshot = self.get_stock_snapshot(afetacao["id_item"])
        if snapshot.custo_medio_atual <= 0:
            raise HTTPException(status_code=422, detail="CUSTO_STOCK_EM_FALTA")
        afetacao["custo_unit"] = snapshot.custo_medio_atual
        afetacao["custo_total_sem_iva"] = round(snapshot.custo_medio_atual * afetacao["quantidade"], 6)
        afetacao["custo_total_com_iva"] = round(afetacao["custo_total_sem_iva"] * (1 + (afetacao["iva"] / 100)), 6)
        afetacao["custo_total"] = afetacao["custo_total_com_iva"]
        afetacao["processar"] = True
        afetacao["estado"] = "MOVIMENTO_GERADO"
        afetacao["updated_at"] = self._now()
        current = self._find_movement_by_source("AFO", afetacao["id_afetacao"])
        if not current:
            current = self._find_reconcilable_stock_movement(afetacao)
        if not current and self._stock_afetacao_expects_existing_movement(afetacao):
            raise HTTPException(status_code=409, detail="MOVIMENTO_STOCK_EXISTENTE_NAO_RECONCILIADO")
        if current:
            movement = self._build_afo_movement(afetacao)
            movement["id_mov"] = current["id_mov"]
            movement["sequence"] = current["sequence"]
            afetacao["estado"] = "MOVIMENTO_ATUALIZADO"
            return {"afetacao": afetacao, "movimento": movement}
        return {"afetacao": afetacao, "movimento": self._build_afo_movement(afetacao)}

    def _preview_item_impacts(self, item: FaturaItemCreate) -> list[OperationImpact]:
        destino = self._normalize_destino(item.destino)
        if destino == "STOCK":
            return [OperationImpact(type="generated", entity="MATERIAIS_MOV", source="FATURAS_ITENS", summary="Vai gerar entrada de stock")]
        if destino == "VIATURA":
            return [OperationImpact(type="generated", entity="MATERIAIS_MOV", source="FATURAS_ITENS", summary="Vai gerar movimento tecnico associado a viatura")]
        if destino == "ESCRITORIO":
            return [OperationImpact(type="generated", entity="MATERIAIS_MOV", source="FATURAS_ITENS", summary="Vai gerar movimento tecnico de consumo para ESCRITORIO")]
        if destino == "EMPRESA":
            return [OperationImpact(type="generated", entity="MATERIAIS_MOV", source="FATURAS_ITENS", summary="Vai gerar movimento tecnico de consumo para EMPRESA")]
        return [
            OperationImpact(type="generated", entity="AFETACOES_OBRA", source="FATURAS_ITENS", summary="Vai gerar afetacao direta"),
            OperationImpact(type="generated", entity="MATERIAIS_MOV", source="AFETACOES_OBRA", summary="Vai gerar movimento tecnico de consumo"),
        ]

    def _preview_nota_credito_impacts(self, item: NotaCreditoItemCreate) -> list[OperationImpact]:
        impacts: list[OperationImpact] = []
        if str(item.natureza or "").strip().upper() == "MATERIAL":
            impacts.append(
                OperationImpact(
                    type="generated",
                    entity="MATERIAIS_MOV",
                    source="NOTAS_CREDITO_ITENS",
                    summary="Vai gerar saida tecnica de stock por devolucao/credito de material",
                )
            )
        if self._normalize_nota_credito_categoria(item.categoria_nota_credito) == "NC_COM_OBRA":
            impacts.append(
                OperationImpact(
                    type="generated",
                    entity="AFETACOES_OBRA",
                    source="NOTAS_CREDITO_ITENS",
                    summary="Vai gerar reducao de custo na obra/fase",
                )
            )
            impacts.append(
                OperationImpact(
                    type="generated",
                    entity="MATERIAIS_MOV",
                    source="AFETACOES_OBRA",
                    summary="Vai gerar movimento tecnico de regularizacao da obra",
                )
            )
        return impacts

    def _calc_total_sem_iva(self, item: FaturaItemCreate) -> float:
        unit = item.custo_unit * (1 - (item.desconto_1 / 100)) * (1 - (item.desconto_2 / 100))
        return round(unit * item.quantidade, 6)

    def _calc_total_com_iva(self, item: FaturaItemCreate) -> float:
        return round(self._calc_total_sem_iva(item) * (1 + (item.iva / 100)), 6)

    def _calc_nota_credito_total_sem_iva(self, item: NotaCreditoItemCreate) -> float:
        return round(item.custo_unit * item.quantidade, 6)

    def _calc_nota_credito_total_com_iva(self, item: NotaCreditoItemCreate) -> float:
        return round(self._calc_nota_credito_total_sem_iva(item) * (1 + (item.iva / 100)), 6)

    def _generate_catalog_id(self, natureza: str) -> str:
        prefix = {
            "MATERIAL": "MAT",
            "GASOLEO": "GAS",
            "GASOLINA": "GAS",
            "SERVICO": "SER",
            "ALUGUER": "ALQ",
            "TRANSPORTE": "TRN",
        }[natureza]
        return self.state.next_id(prefix)

    def _normalize_destino(self, value: str) -> str:
        normalized = self._normalize(value).replace(" ", "_")
        if normalized in {"stock", "estoque"}:
            return "STOCK"
        if normalized == "viatura":
            return "VIATURA"
        if normalized in {"escritorio", "escritorio_", "office"}:
            return "ESCRITORIO"
        if normalized in {"empresa", "company"}:
            return "EMPRESA"
        return "CONSUMO"

    def _normalize_uso_combustivel(self, value: Any, natureza: str | None = None) -> str:
        normalized = self._normalize(str(value or "")).replace(" ", "_")
        if normalized in {"viatura", "maquina", "gerador", "n/a", "na"}:
            mapping = {
                "viatura": "VIATURA",
                "maquina": "MAQUINA",
                "gerador": "GERADOR",
                "n/a": "N/A",
                "na": "N/A",
            }
            return mapping[normalized]
        if natureza and not self._is_fuel_nature(natureza):
            return "N/A"
        return "N/A"

    def _is_fuel_nature(self, natureza: str | None) -> bool:
        return str(natureza or "").strip().upper() in {"GASOLEO", "GASOLINA"}

    def _normalize_nota_credito_categoria(self, value: Any) -> str:
        normalized = self._normalize(str(value or "")).replace(" ", "_")
        if normalized in {"nc_com_obra", "com_obra"}:
            return "NC_COM_OBRA"
        return "NC_SEM_OBRA"

    def _note_credit_item_affects_stock(self, item: dict[str, Any]) -> bool:
        return str(item.get("natureza") or "").strip().upper() == "MATERIAL"

    def _natureza_tracks_stock(self, natureza: Any) -> bool:
        return str(natureza or "").strip().upper() in {"MATERIAL", "GASOLEO", "GASOLINA"}

    def _movement_affects_stock(self, movement: dict[str, Any]) -> bool:
        source_type = str(movement.get("source_type") or "").strip().upper()
        source_id = str(movement.get("source_id") or "").strip()
        movement_type = str(movement.get("tipo") or "").strip().upper()

        if source_type == "FIT":
            fit = self.state.fatura_items.get(source_id)
            if fit:
                return str(fit.get("destino") or "").strip().upper() == "STOCK"
            return movement_type == "ENTRADA" and self._natureza_tracks_stock(self._movement_natureza(movement))

        if source_type == "NCI":
            note_item = self.state.nota_credito_items.get(source_id)
            if note_item:
                return self._note_credit_item_affects_stock(note_item)
            return movement_type == "CONSUMO" and str(self._movement_natureza(movement) or "").strip().upper() == "MATERIAL"

        if source_type == "AFO":
            afetacao = self.state.afetacoes.get(source_id)
            if afetacao:
                return str(afetacao.get("origem") or "").strip().upper() == "STOCK"
            observacoes = str(movement.get("observacoes") or "")
            if "[SRC_FIT:" in observacoes or "[SRC_NCI:" in observacoes:
                return False
            return movement_type == "CONSUMO" and self._natureza_tracks_stock(self._movement_natureza(movement))

        return movement_type == "ENTRADA" and self._natureza_tracks_stock(self._movement_natureza(movement))

    def _movement_natureza(self, movement: dict[str, Any]) -> str | None:
        source_type = str(movement.get("source_type") or "").strip().upper()
        source_id = str(movement.get("source_id") or "").strip()
        if source_type == "FIT" and source_id:
            fit = self.state.fatura_items.get(source_id)
            if fit:
                return str(fit.get("natureza") or "").strip().upper() or None
        if source_type == "NCI" and source_id:
            note_item = self.state.nota_credito_items.get(source_id)
            if note_item:
                return str(note_item.get("natureza") or "").strip().upper() or None
        if source_type == "AFO" and source_id:
            afetacao = self.state.afetacoes.get(source_id)
            if afetacao:
                return str(afetacao.get("natureza") or "").strip().upper() or None
        catalog = self.state.catalog.get(str(movement.get("id_item") or "").strip())
        if catalog:
            return str(catalog.get("natureza") or "").strip().upper() or None
        return None

    def _normalize(self, value: str | None) -> str:
        return " ".join((value or "").strip().lower().split())

    def _normalize_optional_identifier(self, value: Any) -> str | None:
        normalized = str(value or "").strip()
        return normalized or None

    def _normalize_fatura_tipo_doc(self, value: Any) -> str:
        normalized = self._normalize(str(value or "")).replace(" ", "_")
        if normalized in {"nota_credito", "nota_de_credito"}:
            return "NOTA_CREDITO"
        return "FATURA"

    def _generate_fatura_id(self, tipo_doc: Any) -> str:
        prefix = "NC" if self._normalize_fatura_tipo_doc(tipo_doc) == "NOTA_CREDITO" else "FAT"
        return self.state.next_id(prefix)

    def _validate_fatura_document_fields(self, fatura: dict[str, Any]) -> None:
        tipo_doc = self._normalize_fatura_tipo_doc(fatura.get("tipo_doc"))
        fatura["tipo_doc"] = tipo_doc
        fatura["doc_origem"] = self._normalize_optional_identifier(fatura.get("doc_origem"))
        if tipo_doc == "NOTA_CREDITO":
            if not fatura.get("doc_origem"):
                raise HTTPException(status_code=422, detail="NOTA_CREDITO_REQUIRES_DOC_ORIGEM")
            fatura["paga"] = False
            fatura["data_pagamento"] = None
            return
        fatura["doc_origem"] = None

    def _validate_fatura_document_transition(self, previous: dict[str, Any], current: dict[str, Any]) -> None:
        previous_tipo = self._normalize_fatura_tipo_doc(previous.get("tipo_doc"))
        current_tipo = self._normalize_fatura_tipo_doc(current.get("tipo_doc"))
        if previous_tipo == current_tipo:
            return
        has_invoice_items = any(item["id_fatura"] == previous["id_fatura"] for item in self.state.fatura_items.values())
        has_note_items = any(item["id_fatura"] == previous["id_fatura"] for item in self.state.nota_credito_items.values())
        if has_invoice_items or has_note_items:
            raise HTTPException(status_code=422, detail="FATURA_TIPO_DOC_COM_LINHAS")

    def _validate_fatura_compromisso_link(self, fatura: dict[str, Any]) -> None:
        normalized_id = self._normalize_optional_identifier(fatura.get("id_compromisso"))
        fatura["id_compromisso"] = normalized_id
        if not normalized_id:
            return
        if normalized_id not in self.state.compromissos:
            raise HTTPException(status_code=422, detail="COMPROMISSO_INEXISTENTE")

    def _require_fatura(self, id_fatura: str) -> dict[str, Any]:
        fatura = self.state.faturas.get(id_fatura)
        if not fatura:
            raise HTTPException(status_code=404, detail="Fatura not found")
        return fatura

    def _require_note_credit_fatura(self, id_fatura: str) -> dict[str, Any]:
        fatura = self._require_fatura(id_fatura)
        if not self._is_note_credit_fatura(fatura):
            raise HTTPException(status_code=422, detail="NOTA_CREDITO_ITEM_ON_FATURA")
        return fatura

    def _is_note_credit_fatura(self, fatura: dict[str, Any]) -> bool:
        return self._normalize_fatura_tipo_doc(fatura.get("tipo_doc")) == "NOTA_CREDITO"

    def _require_compromisso(self, id_compromisso: str) -> dict[str, Any]:
        compromisso = self.state.compromissos.get(id_compromisso)
        if not compromisso:
            raise HTTPException(status_code=404, detail="Compromisso not found")
        return compromisso

    def _require_catalog(self, id_item: str) -> dict[str, Any]:
        catalog = self.state.catalog.get(id_item)
        if not catalog:
            raise HTTPException(status_code=404, detail="Catalog item not found")
        return catalog

    def _require_afetacao(self, id_afetacao: str) -> dict[str, Any]:
        afetacao = self.state.afetacoes.get(id_afetacao)
        if not afetacao:
            raise HTTPException(status_code=404, detail="Afetacao not found")
        return afetacao

    def _ensure_catalog_item_unique(self, item_oficial: str, *, exclude_id: str | None = None) -> None:
        normalized_item = self._normalize(item_oficial)
        if not normalized_item:
            return
        for record_id, catalog in self.state.catalog.items():
            if exclude_id and record_id == exclude_id:
                continue
            if self._normalize(str(catalog.get("item_oficial") or "")) == normalized_item:
                raise HTTPException(status_code=422, detail="CATALOGO_DUPLICADO_ITEM_OFICIAL")

    def _find_catalog_reference_by_description(self, descricao_original: str | None) -> dict[str, Any] | None:
        normalized_description = self._normalize(descricao_original)
        if not normalized_description:
            return None
        for reference in self.state.catalog_references.values():
            if self._normalize(str(reference.get("descricao_original") or "")) == normalized_description:
                return reference
        return None

    def _prepare_catalog_reference_record(
        self,
        id_item: str,
        descricao_original: str | None,
        *,
        now: datetime | None = None,
    ) -> dict[str, Any] | None:
        descricao = str(descricao_original or "").strip()
        if not descricao:
            return None
        existing = self._find_catalog_reference_by_description(descricao)
        if existing:
            if str(existing.get("id_item") or "") != id_item:
                raise HTTPException(status_code=422, detail="CATALOGO_REFERENCIA_DESCRICAO_DUPLICADA")
            return None
        timestamp = now or self._now()
        return {
            "id_referencia": self.state.next_id("REF"),
            "descricao_original": descricao,
            "id_item": id_item,
            "observacoes": None,
            "estado_referencia": "ATIVA",
            "created_at": timestamp,
            "updated_at": timestamp,
        }

    def _ensure_catalog_reference(self, id_item: str, descricao_original: str | None) -> None:
        reference = self._prepare_catalog_reference_record(id_item, descricao_original)
        if not reference:
            return
        self._persist({"materiais_referencias": [reference]})
        self.state.catalog_references[reference["id_referencia"]] = reference

    def _catalog_reference_texts(self, id_item: str) -> list[str]:
        seen: set[str] = set()
        values: list[str] = []
        references = sorted(
            (
                reference
                for reference in self.state.catalog_references.values()
                if str(reference.get("id_item") or "") == id_item
            ),
            key=lambda reference: self._normalize(str(reference.get("descricao_original") or "")),
        )
        for reference in references:
            descricao = str(reference.get("descricao_original") or "").strip()
            normalized = self._normalize(descricao)
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            values.append(descricao)
        return values

    def _to_catalog_model(self, payload: dict[str, Any]) -> CatalogEntryRecord:
        referencias = self._catalog_reference_texts(str(payload["id_item"]))
        catalog_payload = {
            **payload,
            "referencias": referencias,
            "reference_count": len(referencias),
        }
        return CatalogEntryRecord.model_validate(
            {
                key: value
                for key, value in catalog_payload.items()
                if key in CatalogEntryRecord.model_fields
            }
        )

    def _find_direct_afetacao_by_source(self, source_id: str) -> dict[str, Any] | None:
        for afetacao in self.state.afetacoes.values():
            if afetacao["origem"] == "FATURA_DIRETA" and afetacao.get("source_id") == source_id:
                return afetacao
        return None

    def _find_movement_by_source(self, source_type: str, source_id: str) -> dict[str, Any] | None:
        for movement in self.state.movimentos.values():
            if movement["source_type"] == source_type and movement["source_id"] == source_id:
                return movement
        return None

    def _find_reconcilable_stock_movement(self, afetacao: dict[str, Any]) -> dict[str, Any] | None:
        if not self._stock_afetacao_expects_existing_movement(afetacao):
            return None
        candidates = [
            movement
            for movement in self.state.movimentos.values()
            if self._movement_matches_stock_afetacao(movement, afetacao)
        ]
        if len(candidates) == 1:
            return candidates[0]
        if len(candidates) > 1:
            raise HTTPException(status_code=409, detail="MOVIMENTO_STOCK_LEGADO_AMBIGUO")
        return None

    def _stock_afetacao_expects_existing_movement(self, afetacao: dict[str, Any]) -> bool:
        if afetacao.get("origem") != "STOCK":
            return False
        if afetacao.get("sheet_row_num") is None:
            return False
        return str(afetacao.get("estado") or "").strip().upper() in {"MOVIMENTO_GERADO", "MOVIMENTO_ATUALIZADO"}

    def _movement_matches_stock_afetacao(self, movement: dict[str, Any], afetacao: dict[str, Any]) -> bool:
        if str(movement.get("tipo") or "").strip().upper() != "CONSUMO":
            return False
        if str(movement.get("id_item") or "").strip() != str(afetacao.get("id_item") or "").strip():
            return False
        if not self._same_number(movement.get("quantidade"), afetacao.get("quantidade")):
            return False
        if self._normalize(str(movement.get("obra") or "")) != self._normalize(str(afetacao.get("obra") or "")):
            return False
        if self._normalize(str(movement.get("fase") or "")) != self._normalize(str(afetacao.get("fase") or "")):
            return False
        if self._normalize_uso_combustivel(movement.get("uso_combustivel")) != self._normalize_uso_combustivel(afetacao.get("uso_combustivel")):
            return False
        if movement.get("data") != afetacao.get("data"):
            return False
        observacoes = str(movement.get("observacoes") or "")
        if "[SRC_AFO:" in observacoes and f"[SRC_AFO:{afetacao['id_afetacao']}]" not in observacoes:
            return False
        if "[SRC_FIT:" in observacoes:
            expected_fit_marker = str(afetacao.get("source_id") or "").strip()
            if not expected_fit_marker or f"[SRC_FIT:{expected_fit_marker}]" not in observacoes:
                return False
        source_type = str(movement.get("source_type") or "").strip().upper()
        source_id = str(movement.get("source_id") or "").strip()
        if source_type == "AFO" and source_id and source_id != afetacao["id_afetacao"]:
            return False
        return True

    def _movement_overlaps_stock_context(self, movement: dict[str, Any], afetacao: dict[str, Any]) -> bool:
        if str(movement.get("tipo") or "").strip().upper() != "CONSUMO":
            return False
        if str(movement.get("id_item") or "").strip() != str(afetacao.get("id_item") or "").strip():
            return False
        if movement.get("data") != afetacao.get("data"):
            return False
        if self._normalize(str(movement.get("obra") or "")) != self._normalize(str(afetacao.get("obra") or "")):
            return False
        if self._normalize(str(movement.get("fase") or "")) != self._normalize(str(afetacao.get("fase") or "")):
            return False
        if self._normalize_uso_combustivel(movement.get("uso_combustivel")) != self._normalize_uso_combustivel(afetacao.get("uso_combustivel")):
            return False
        return True

    def _same_number(self, left: Any, right: Any, *, precision: int = 6) -> bool:
        try:
            return round(float(left), precision) == round(float(right), precision)
        except (TypeError, ValueError):
            return False

    def _collect_fit_delete_groups(self, item_id: str) -> dict[str, list[str]]:
        groups: dict[str, list[str]] = {"faturas_itens": [item_id]}
        fit_movement = self._find_movement_by_source("FIT", item_id)
        if fit_movement:
            groups.setdefault("materiais_mov", []).append(fit_movement["id_mov"])
        direct_afetacao = self._find_direct_afetacao_by_source(item_id)
        if direct_afetacao:
            self._merge_delete_groups(groups, self._collect_afetacao_delete_groups(direct_afetacao["id_afetacao"]))
        return groups

    def _collect_nci_delete_groups(self, item_id: str) -> dict[str, list[str]]:
        groups: dict[str, list[str]] = {"notas_credito_itens": [item_id]}
        nci_movement = self._find_movement_by_source("NCI", item_id)
        if nci_movement:
            groups.setdefault("materiais_mov", []).append(nci_movement["id_mov"])
        direct_afetacao = self._find_direct_afetacao_by_source(item_id)
        if direct_afetacao:
            self._merge_delete_groups(groups, self._collect_afetacao_delete_groups(direct_afetacao["id_afetacao"]))
        return groups

    def _collect_afetacao_delete_groups(self, id_afetacao: str) -> dict[str, list[str]]:
        groups: dict[str, list[str]] = {"afetacoes_obra": [id_afetacao]}
        movement = self._find_movement_by_source("AFO", id_afetacao)
        if movement:
            groups.setdefault("materiais_mov", []).append(movement["id_mov"])
        return groups

    def _merge_delete_groups(self, target: dict[str, list[str]], additions: dict[str, list[str]]) -> None:
        for entity, ids in additions.items():
            target.setdefault(entity, [])
            target[entity].extend(ids)

    def _collect_stock_item_ids_from_groups(self, groups: dict[str, list[str]]) -> set[str]:
        item_ids: set[str] = set()
        for item_id in groups.get("faturas_itens", []):
            fit = self.state.fatura_items.get(item_id)
            if fit and str(fit.get("destino") or "").strip().upper() == "STOCK":
                normalized_id = str(fit.get("id_item") or "").strip()
                if normalized_id:
                    item_ids.add(normalized_id)
        for item_id in groups.get("notas_credito_itens", []):
            note_item = self.state.nota_credito_items.get(item_id)
            if note_item and self._note_credit_item_affects_stock(note_item):
                normalized_id = str(note_item.get("id_item") or "").strip()
                if normalized_id:
                    item_ids.add(normalized_id)
        for afetacao_id in groups.get("afetacoes_obra", []):
            afetacao = self.state.afetacoes.get(afetacao_id)
            if afetacao and str(afetacao.get("origem") or "").strip().upper() == "STOCK":
                normalized_id = str(afetacao.get("id_item") or "").strip()
                if normalized_id:
                    item_ids.add(normalized_id)
        for movimento_id in groups.get("materiais_mov", []):
            movement = self.state.movimentos.get(movimento_id)
            if movement and self._movement_affects_stock(movement):
                normalized_id = str(movement.get("id_item") or "").strip()
                if normalized_id:
                    item_ids.add(normalized_id)
        return item_ids

    def _delete_runtime_records(self, groups: dict[str, list[str]]) -> None:
        mapping = {
            "compromissos_obra": self.state.compromissos,
            "faturas": self.state.faturas,
            "faturas_itens": self.state.fatura_items,
            "notas_credito_itens": self.state.nota_credito_items,
            "materiais_cad": self.state.catalog,
            "materiais_referencias": self.state.catalog_references,
            "afetacoes_obra": self.state.afetacoes,
            "materiais_mov": self.state.movimentos,
        }
        for entity, ids in groups.items():
            runtime_collection = mapping.get(entity)
            if runtime_collection is None:
                continue
            for record_id in ids:
                runtime_collection.pop(record_id, None)

    def _reuse_record_identity(
        self,
        payload: dict[str, Any],
        current: dict[str, Any],
        id_field: str,
        *,
        keep_sequence: bool = False,
    ) -> dict[str, Any]:
        payload[id_field] = current[id_field]
        payload["created_at"] = current.get("created_at", payload.get("created_at", self._now()))
        if current.get("sheet_row_num") is not None:
            payload["sheet_row_num"] = current["sheet_row_num"]
        if keep_sequence and current.get("sequence") is not None:
            payload["sequence"] = current["sequence"]
        return payload

    def _now(self) -> datetime:
        return datetime.now(UTC)

    def _normalize_fatura_payment_fields(self, entity: dict[str, Any]) -> None:
        if self._normalize_fatura_tipo_doc(entity.get("tipo_doc")) == "NOTA_CREDITO":
            entity["paga"] = False
            entity["data_pagamento"] = None
            return
        entity["paga"] = bool(entity.get("paga", False))
        if not entity["paga"]:
            entity["data_pagamento"] = None

    def _normalize_movimento_financials(self, movement: dict[str, Any]) -> None:
        quantity = float(movement.get("quantidade") or 0.0)
        unit_cost = float(movement.get("custo_unit") or 0.0)
        sem_iva = movement.get("custo_total_sem_iva")
        iva = movement.get("iva")
        com_iva = movement.get("custo_total_com_iva")

        if sem_iva in (None, ""):
            sem_iva = round(quantity * unit_cost, 6)
        else:
            sem_iva = float(sem_iva or 0.0)

        if iva in (None, ""):
            iva = 0.0
        else:
            iva = float(iva or 0.0)

        if com_iva in (None, ""):
            com_iva = round(sem_iva * (1 + (iva / 100)), 6)
        else:
            com_iva = float(com_iva or 0.0)

        movement["custo_unit"] = unit_cost
        movement["custo_total_sem_iva"] = sem_iva
        movement["iva"] = iva
        movement["custo_total_com_iva"] = com_iva

    def _prepare_consumo_movement_total_backfill(self, movement: dict[str, Any]) -> dict[str, Any] | None:
        if str(movement.get("tipo") or "").strip().upper() != "CONSUMO":
            return None

        source_type = str(movement.get("source_type") or "").strip().upper()
        source_id = str(movement.get("source_id") or "").strip()
        source_record: dict[str, Any] | None = None
        if source_type == "FIT" and source_id:
            source_record = self.state.fatura_items.get(source_id)
        elif source_type == "NCI" and source_id:
            source_record = self.state.nota_credito_items.get(source_id)
        elif source_type == "AFO" and source_id:
            source_record = self.state.afetacoes.get(source_id)

        current_sem_iva = movement.get("custo_total_sem_iva")
        current_iva = movement.get("iva")
        current_com_iva = movement.get("custo_total_com_iva")
        quantity = float(movement.get("quantidade") or 0.0)
        unit_cost = float(movement.get("custo_unit") or 0.0)

        source_sem_iva = source_record.get("custo_total_sem_iva") if source_record else None
        source_iva = source_record.get("iva") if source_record else None
        source_com_iva = source_record.get("custo_total_com_iva") if source_record else None

        inferred_sem_iva = self._coerce_optional_float(source_sem_iva)
        if inferred_sem_iva is None and quantity > 0 and unit_cost > 0:
            inferred_sem_iva = round(quantity * unit_cost, 6)

        source_sem_iva_value = self._coerce_optional_float(source_sem_iva)
        source_com_iva_value = self._coerce_optional_float(source_com_iva)

        inferred_iva = self._normalize_legacy_iva_value(
            self._coerce_optional_float(source_iva),
            sem_iva=source_sem_iva_value,
            com_iva=source_com_iva_value,
        )
        if inferred_iva is None:
            inferred_iva = self._coerce_optional_float(current_iva)
        if inferred_iva is None:
            inferred_iva = 0.0

        inferred_com_iva = source_com_iva_value
        if inferred_com_iva is None and inferred_sem_iva is not None:
            inferred_com_iva = round(inferred_sem_iva * (1 + (inferred_iva / 100)), 6)

        current_sem_iva_value = self._coerce_optional_float(current_sem_iva)
        current_iva_value = self._coerce_optional_float(current_iva)
        current_com_iva_value = self._coerce_optional_float(current_com_iva)
        source_iva_value = inferred_iva

        missing_fields: list[str] = []
        sem_iva_missing = current_sem_iva in (None, "") or (
            (current_sem_iva_value or 0.0) <= 0 and (inferred_sem_iva or 0.0) > 0
        )
        iva_missing = current_iva in (None, "") or (
            (current_iva_value or 0.0) <= 0 and (source_iva_value or 0.0) > 0
        )
        com_iva_missing = current_com_iva in (None, "") or (
            (current_com_iva_value or 0.0) <= 0 and (inferred_com_iva or 0.0) > 0
        )

        if sem_iva_missing:
            missing_fields.append("custo_total_sem_iva")
        if iva_missing:
            missing_fields.append("iva")
        if com_iva_missing:
            missing_fields.append("custo_total_com_iva")

        if not missing_fields:
            return None

        if (sem_iva_missing and inferred_sem_iva is None) or (com_iva_missing and inferred_com_iva is None):
            return {
                "id_mov": str(movement.get("id_mov") or ""),
                "source_type": source_type or None,
                "source_id": source_id or None,
                "id_item": str(movement.get("id_item") or ""),
                "missing_fields": missing_fields,
                "updated_record": None,
            }

        updated = deepcopy(movement)
        if sem_iva_missing:
            updated["custo_total_sem_iva"] = inferred_sem_iva
        if iva_missing:
            updated["iva"] = inferred_iva
        if com_iva_missing:
            updated["custo_total_com_iva"] = inferred_com_iva
        updated["updated_at"] = self._now()

        return {
            "id_mov": str(movement.get("id_mov") or ""),
            "source_type": source_type or None,
            "source_id": source_id or None,
            "id_item": str(movement.get("id_item") or ""),
            "missing_fields": missing_fields,
            "current": {
                "custo_total_sem_iva": current_sem_iva_value,
                "iva": current_iva_value,
                "custo_total_com_iva": current_com_iva_value,
            },
            "updated": {
                "custo_total_sem_iva": updated.get("custo_total_sem_iva"),
                "iva": updated.get("iva"),
                "custo_total_com_iva": updated.get("custo_total_com_iva"),
            },
            "updated_record": updated,
        }

    def _coerce_optional_float(self, value: Any) -> float | None:
        if value in (None, ""):
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    def _normalize_legacy_iva_value(
        self,
        value: float | None,
        *,
        sem_iva: float | None = None,
        com_iva: float | None = None,
    ) -> float | None:
        if value is None:
            return None
        if value < 0 or value > 1:
            return value
        if sem_iva is None or sem_iva <= 0 or com_iva is None or com_iva <= 0:
            return value

        expected_from_percent = sem_iva * (1 + (value / 100))
        expected_from_decimal = sem_iva * (1 + value)
        percent_distance = abs(expected_from_percent - com_iva)
        decimal_distance = abs(expected_from_decimal - com_iva)
        if decimal_distance <= 0.02 and decimal_distance < percent_distance:
            return round(value * 100, 6)
        return value

    def _to_model(self, model_cls: type[BaseModel], payload: dict[str, Any]) -> BaseModel:
        allowed = model_cls.model_fields.keys()
        return model_cls.model_validate({key: value for key, value in payload.items() if key in allowed})
