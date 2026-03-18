from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime
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
    FaturaCreate,
    FaturaDetail,
    FaturaItemCreate,
    FaturaItemRecord,
    FaturaItemsResponse,
    FaturaRecord,
    FaturaUpdate,
)
from backend.app.services.state import RuntimeState


class MaterialsService:
    def __init__(self, state: RuntimeState, google_sheets: GoogleSheetsAdapter, supabase: SupabaseAdapter) -> None:
        self.state = state
        self.google_sheets = google_sheets
        self.supabase = supabase

    def list_faturas(self) -> list[FaturaRecord]:
        return [self._to_model(FaturaRecord, item) for item in self.state.faturas.values()]

    def get_fatura(self, id_fatura: str) -> FaturaDetail:
        fatura = self._require_fatura(id_fatura)
        items = [self._to_model(FaturaItemRecord, item) for item in self.state.fatura_items.values() if item["id_fatura"] == id_fatura]
        return FaturaDetail(fatura=self._to_model(FaturaRecord, fatura), items=items)

    def create_fatura(self, payload: FaturaCreate) -> FaturaRecord:
        now = self._now()
        entity = {
            "id_fatura": self.state.next_id("FAT"),
            "fornecedor": payload.fornecedor,
            "nif": payload.nif,
            "nr_documento": payload.nr_documento,
            "data_fatura": payload.data_fatura,
            "valor_sem_iva": payload.valor_sem_iva,
            "iva": payload.iva,
            "valor_com_iva": payload.valor_com_iva,
            "observacoes": payload.observacoes,
            "estado": "ATIVA",
            "created_at": now,
            "updated_at": now,
        }
        self._persist({"faturas": [entity]})
        self.state.faturas[entity["id_fatura"]] = entity
        return self._to_model(FaturaRecord, entity)

    def patch_fatura(self, id_fatura: str, payload: FaturaUpdate) -> FaturaRecord:
        current = deepcopy(self._require_fatura(id_fatura))
        for field, value in payload.model_dump(exclude_none=True, by_alias=True).items():
            current[field] = value
        current["updated_at"] = self._now()
        self._persist({"faturas": [current]})
        self.state.faturas[id_fatura] = current
        return self._to_model(FaturaRecord, current)

    def preview_fatura_items(self, id_fatura: str, items: list[FaturaItemCreate]) -> FaturaItemsResponse:
        self._require_fatura(id_fatura)
        impacts = [impact for item in items for impact in self._preview_item_impacts(item)]
        return FaturaItemsResponse(items=[], impacts=impacts)

    def create_fatura_items(self, id_fatura: str, items: list[FaturaItemCreate]) -> FaturaItemsResponse:
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
        return FaturaItemsResponse(items=[self._to_model(FaturaItemRecord, item) for item in created_items], impacts=impacts)

    def update_fatura_item(self, id_fatura: str, item_id: str, payload: dict[str, Any]) -> FaturaItemRecord:
        current = self.state.fatura_items.get(item_id)
        if not current or current["id_fatura"] != id_fatura:
            raise HTTPException(status_code=404, detail="Invoice item not found")
        updated = deepcopy(current)
        for key, value in payload.items():
            if value is not None:
                updated[key] = value
        updated["updated_at"] = self._now()
        self._persist({"faturas_itens": [updated]})
        self.state.fatura_items[item_id] = updated
        return self._to_model(FaturaItemRecord, updated)

    def delete_fatura_item(self, id_fatura: str, item_id: str) -> None:
        current = self.state.fatura_items.get(item_id)
        if not current or current["id_fatura"] != id_fatura:
            raise HTTPException(status_code=404, detail="Invoice item not found")
        self.state.fatura_items.pop(item_id, None)
        for mov_id, mov in list(self.state.movimentos.items()):
            if mov["source_type"] == "FIT" and mov["source_id"] == item_id:
                self.state.movimentos.pop(mov_id, None)
        for afet_id, afet in list(self.state.afetacoes.items()):
            if afet["source_id"] == item_id and afet["origem"] == "FATURA_DIRETA":
                self.state.afetacoes.pop(afet_id, None)

    def list_catalog(self) -> list[CatalogEntryRecord]:
        return [self._to_model(CatalogEntryRecord, item) for item in self.state.catalog.values()]

    def create_catalog_entry(self, payload: CatalogEntryCreate) -> CatalogEntryRecord:
        now = self._now()
        record = {
            "id_item": self._generate_catalog_id(payload.natureza),
            "fornecedor": payload.fornecedor,
            "descricao_original": payload.descricao_original,
            "item_oficial": payload.item_oficial,
            "natureza": payload.natureza,
            "unidade": payload.unidade,
            "observacoes": payload.observacoes,
            "estado_cadastro": "ATIVO",
            "created_at": now,
            "updated_at": now,
        }
        self._persist({"materiais_cad": [record]})
        self.state.catalog[record["id_item"]] = record
        return self._to_model(CatalogEntryRecord, record)

    def patch_catalog_entry(self, id_item: str, payload: CatalogEntryUpdate) -> CatalogEntryRecord:
        current = deepcopy(self._require_catalog(id_item))
        for field, value in payload.model_dump(exclude_none=True).items():
            current[field] = value
        current["updated_at"] = self._now()
        self._persist({"materiais_cad": [current]})
        self.state.catalog[id_item] = current
        return self._to_model(CatalogEntryRecord, current)

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
        return self._to_model(AfetacaoRecord, record)

    def patch_afetacao(self, id_afetacao: str, payload: AfetacaoUpdate) -> AfetacaoRecord:
        current = deepcopy(self.state.afetacoes.get(id_afetacao) or {})
        if not current:
            raise HTTPException(status_code=404, detail="Afetacao not found")
        for field, value in payload.model_dump(exclude_none=True).items():
            current[field] = value
        current["updated_at"] = self._now()
        self._persist({"afetacoes_obra": [current]})
        self.state.afetacoes[id_afetacao] = current
        return self._to_model(AfetacaoRecord, current)

    def process_afetacao(self, id_afetacao: str) -> AfetacaoRecord:
        current = deepcopy(self.state.afetacoes.get(id_afetacao) or {})
        if not current:
            raise HTTPException(status_code=404, detail="Afetacao not found")
        processed = self._process_stock_afetacao(current)
        self._persist({"afetacoes_obra": [processed["afetacao"]], "materiais_mov": [processed["movimento"]]})
        self.state.afetacoes[id_afetacao] = processed["afetacao"]
        self.state.movimentos[processed["movimento"]["id_mov"]] = processed["movimento"]
        return self._to_model(AfetacaoRecord, processed["afetacao"])

    def get_stock_snapshot(self, id_item: str) -> StockSnapshot:
        catalog = self._require_catalog(id_item)
        qty = 0.0
        value = 0.0
        movimentos = sorted(self.state.movimentos.values(), key=lambda item: item["sequence"])
        for mov in movimentos:
            if mov["id_item"] != id_item:
                continue
            amount = mov["quantidade"] * mov["custo_unit"]
            if mov["tipo"] == "ENTRADA":
                qty += mov["quantidade"]
                value += amount
            else:
                qty -= mov["quantidade"]
                value -= amount
        avg = value / qty if qty > 0 else 0.0
        return StockSnapshot(id_item=id_item, item_oficial=catalog["item_oficial"], unidade=catalog["unidade"], stock_atual=round(qty, 6), custo_medio_atual=round(avg, 6))

    def _persist(self, groups: dict[str, list[dict[str, Any]]]) -> None:
        batches = [WriteBatch(entity=entity, records=records) for entity, records in groups.items() if records]
        if not batches:
            return
        self.google_sheets.write_batches(batches)
        try:
            self.supabase.write_batches(batches)
            for batch in batches:
                self.state.touch_sync_job(batch.entity, pending_retry=False, upserted=len(batch.records))
        except SupabaseAdapterError as exc:
            for batch in batches:
                self.state.touch_sync_job(batch.entity, pending_retry=True, error=str(exc), payload=batch.records)

    def _resolve_item_mapping(self, fatura: dict[str, Any], item: FaturaItemCreate) -> dict[str, Any]:
        if item.id_item:
            return self._require_catalog(item.id_item)
        for catalog in self.state.catalog.values():
            if self._normalize(catalog["fornecedor"]) == self._normalize(fatura["fornecedor"]) and self._normalize(catalog["descricao_original"]) == self._normalize(item.descricao_original):
                return catalog
        if item.item_oficial and item.natureza and item.unidade:
            return self.create_catalog_entry(CatalogEntryCreate(fornecedor=fatura["fornecedor"], descricao_original=item.descricao_original, item_oficial=item.item_oficial, natureza=item.natureza, unidade=item.unidade)).model_dump()
        raise HTTPException(status_code=422, detail="Catalog match missing for invoice item")

    def _validate_item_business_rules(self, item: dict[str, Any]) -> None:
        if item["destino"] == "STOCK" and item["natureza"] != "MATERIAL":
            raise HTTPException(status_code=422, detail="Only MATERIAL items can enter stock")
        if item["destino"] != "STOCK" and (not item["obra"] or not item["fase"]):
            raise HTTPException(status_code=422, detail="Direct consumption requires obra and fase")

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

    def _build_fit_movement(self, fit: dict[str, Any], fatura: dict[str, Any], tipo: str) -> dict[str, Any]:
        now = self._now()
        return {
            "id_mov": self.state.next_id("MOV"),
            "tipo": tipo,
            "data": fit["data_fatura"],
            "id_item": fit["id_item"],
            "item_oficial": fit["item_oficial"],
            "unidade": fit["unidade"],
            "quantidade": fit["quantidade"],
            "custo_unit": fit["custo_total_sem_iva"] / fit["quantidade"] if fit["quantidade"] else fit["custo_unit"],
            "custo_total_sem_iva": fit["custo_total_sem_iva"],
            "iva": fit["iva"],
            "custo_total_com_iva": fit["custo_total_com_iva"],
            "obra": fit["obra"] if tipo == "CONSUMO" else None,
            "fase": fit["fase"] if tipo == "CONSUMO" else None,
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

    def _build_afo_movement(self, afetacao: dict[str, Any]) -> dict[str, Any]:
        now = self._now()
        observations = f"[SRC_AFO:{afetacao['id_afetacao']}]"
        if afetacao.get("source_id"):
            observations += f" [SRC_FIT:{afetacao['source_id']}]"
        return {
            "id_mov": self.state.next_id("MOV"),
            "tipo": "CONSUMO",
            "data": afetacao["data"],
            "id_item": afetacao["id_item"],
            "item_oficial": afetacao["item_oficial"],
            "unidade": afetacao["unidade"],
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
        if current:
            movement = self._build_afo_movement(afetacao)
            movement["id_mov"] = current["id_mov"]
            movement["sequence"] = current["sequence"]
            return {"afetacao": afetacao, "movimento": movement}
        return {"afetacao": afetacao, "movimento": self._build_afo_movement(afetacao)}

    def _preview_item_impacts(self, item: FaturaItemCreate) -> list[OperationImpact]:
        if self._normalize_destino(item.destino) == "STOCK":
            return [OperationImpact(type="generated", entity="MATERIAIS_MOV", source="FATURAS_ITENS", summary="Vai gerar entrada de stock")]
        return [
            OperationImpact(type="generated", entity="AFETACOES_OBRA", source="FATURAS_ITENS", summary="Vai gerar afetacao direta"),
            OperationImpact(type="generated", entity="MATERIAIS_MOV", source="AFETACOES_OBRA", summary="Vai gerar movimento tecnico de consumo"),
        ]

    def _calc_total_sem_iva(self, item: FaturaItemCreate) -> float:
        unit = item.custo_unit * (1 - (item.desconto_1 / 100)) * (1 - (item.desconto_2 / 100))
        return round(unit * item.quantidade, 6)

    def _calc_total_com_iva(self, item: FaturaItemCreate) -> float:
        return round(self._calc_total_sem_iva(item) * (1 + (item.iva / 100)), 6)

    def _generate_catalog_id(self, natureza: str) -> str:
        prefix = {"MATERIAL": "MAT", "SERVICO": "SER", "ALUGUER": "ALQ", "TRANSPORTE": "TRN"}[natureza]
        return self.state.next_id(prefix)

    def _normalize_destino(self, value: str) -> str:
        normalized = self._normalize(value).replace(" ", "_")
        if normalized in {"stock", "estoque"}:
            return "STOCK"
        return "CONSUMO"

    def _normalize(self, value: str | None) -> str:
        return " ".join((value or "").strip().lower().split())

    def _require_fatura(self, id_fatura: str) -> dict[str, Any]:
        fatura = self.state.faturas.get(id_fatura)
        if not fatura:
            raise HTTPException(status_code=404, detail="Fatura not found")
        return fatura

    def _require_catalog(self, id_item: str) -> dict[str, Any]:
        catalog = self.state.catalog.get(id_item)
        if not catalog:
            raise HTTPException(status_code=404, detail="Catalog item not found")
        return catalog

    def _find_movement_by_source(self, source_type: str, source_id: str) -> dict[str, Any] | None:
        for movement in self.state.movimentos.values():
            if movement["source_type"] == source_type and movement["source_id"] == source_id:
                return movement
        return None

    def _now(self) -> datetime:
        return datetime.now(UTC)

    def _to_model(self, model_cls: type[BaseModel], payload: dict[str, Any]) -> BaseModel:
        allowed = model_cls.model_fields.keys()
        return model_cls.model_validate({key: value for key, value in payload.items() if key in allowed})
