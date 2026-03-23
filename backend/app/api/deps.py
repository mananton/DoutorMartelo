from __future__ import annotations

from datetime import UTC, datetime
import logging
from typing import Any

from fastapi import Request

from backend.app.adapters.google_sheets.live import LiveGoogleSheetsAdapter
from backend.app.adapters.google_sheets.memory import MemoryGoogleSheetsAdapter
from backend.app.adapters.supabase.live import LiveSupabaseAdapter
from backend.app.adapters.supabase.memory import MemorySupabaseAdapter
from backend.app.config import Settings
from backend.app.services.materials import MaterialsService
from backend.app.services.state import RuntimeState
from backend.app.services.sync import SyncService


logger = logging.getLogger(__name__)


class ServiceContainer:
    DIAGNOSTIC_CONFIG = {
        "faturas": ("id_fatura", "faturas"),
        "faturas_itens": ("id_item_fatura", "fatura_items"),
        "materiais_cad": ("id_item", "catalog"),
        "materiais_referencias": ("id_referencia", "catalog_references"),
        "afetacoes_obra": ("id_afetacao", "afetacoes"),
        "materiais_mov": ("id_mov", "movimentos"),
    }
    DIAGNOSTIC_FIELDS = {
        "faturas": [
            "id_compromisso",
            "fornecedor",
            "nif",
            "nr_documento",
            "data_fatura",
            "valor_sem_iva",
            "iva",
            "valor_com_iva",
            "paga",
            "data_pagamento",
            "estado",
        ],
        "faturas_itens": [
            "id_fatura",
            "descricao_original",
            "id_item",
            "item_oficial",
            "natureza",
            "uso_combustivel",
            "matricula",
            "unidade",
            "quantidade",
            "custo_unit",
            "custo_total_sem_iva",
            "iva",
            "custo_total_com_iva",
            "destino",
            "obra",
            "fase",
            "estado_mapeamento",
        ],
        "materiais_cad": ["item_oficial", "natureza", "unidade", "estado_cadastro"],
        "materiais_referencias": ["descricao_original", "id_item", "estado_referencia"],
        "afetacoes_obra": [
            "origem",
            "source_id",
            "data",
            "id_item",
            "item_oficial",
            "natureza",
            "uso_combustivel",
            "quantidade",
            "unidade",
            "custo_unit",
            "custo_total_sem_iva",
            "iva",
            "custo_total_com_iva",
            "obra",
            "fase",
            "estado",
        ],
        "materiais_mov": [
            "tipo",
            "data",
            "id_item",
            "item_oficial",
            "uso_combustivel",
            "matricula",
            "quantidade",
            "custo_unit",
            "custo_total_sem_iva",
            "iva",
            "custo_total_com_iva",
            "obra",
            "fase",
            "source_type",
            "source_id",
        ],
    }

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or Settings.from_env()
        self.state = RuntimeState()
        self.google_sheets = self._build_google_adapter()
        self.supabase = self._build_supabase_adapter()
        self._work_options_cache: list[dict[str, Any]] | None = None
        self._supplier_options_cache: list[dict[str, Any]] | None = None
        self._vehicle_options_cache: list[dict[str, Any]] | None = None
        self._hydrate_runtime_state()
        self._prime_option_caches()
        self.materials = MaterialsService(self.state, self.google_sheets, self.supabase)
        self.sync = SyncService(self.state, self.supabase)

    def _build_google_adapter(self):
        if self.settings.has_google_sheets:
            return LiveGoogleSheetsAdapter(self.settings)
        return MemoryGoogleSheetsAdapter(self.state)

    def _build_supabase_adapter(self):
        if self.settings.has_supabase:
            return LiveSupabaseAdapter(self.settings)
        return MemorySupabaseAdapter(self.state)

    def _hydrate_runtime_state(self) -> None:
        try:
            snapshot = self.google_sheets.load_snapshot()
        except Exception:
            logger.exception("Failed to hydrate runtime state from Google Sheets at startup")
            return
        if snapshot:
            self.state.hydrate_from_snapshot(snapshot, source="google_sheets_startup")

    def reload_from_sheets(self) -> dict[str, object]:
        snapshot = self.google_sheets.load_snapshot()
        self.state.hydrate_from_snapshot(snapshot, preserve_sync_state=True, source="google_sheets_manual_reload")
        self._prime_option_caches()
        return {
            "source": "google_sheets",
            "faturas": len(self.state.faturas),
            "faturas_itens": len(self.state.fatura_items),
            "materiais_cad": len(self.state.catalog),
            "materiais_referencias": len(self.state.catalog_references),
            "afetacoes_obra": len(self.state.afetacoes),
            "materiais_mov": len(self.state.movimentos),
            "reloaded_at": datetime.now(UTC),
        }

    def sync_diagnostics(self) -> dict[str, Any]:
        snapshot = self.google_sheets.load_snapshot()
        entities = []
        for entity, (id_field, state_attr) in self.DIAGNOSTIC_CONFIG.items():
            runtime_records = getattr(self.state, state_attr)
            runtime_by_id = {
                str(record_id): record
                for record_id, record in runtime_records.items()
                if str(record_id).strip()
            }
            sheet_by_id = {
                str(record.get(id_field)): record
                for record in snapshot.get(entity, [])
                if str(record.get(id_field) or "").strip()
            }
            runtime_ids = set(runtime_by_id.keys())
            sheet_ids = set(sheet_by_id.keys())
            mismatch_samples = []
            for record_id in sorted(runtime_ids & sheet_ids):
                runtime_record = runtime_by_id[record_id]
                sheet_record = sheet_by_id[record_id]
                mismatched_fields = [
                    field
                    for field in self.DIAGNOSTIC_FIELDS[entity]
                    if self._diagnostic_value(runtime_record.get(field)) != self._diagnostic_value(sheet_record.get(field))
                ]
                if mismatched_fields:
                    mismatch_samples.append(
                        {
                            "id": record_id,
                            "fields": mismatched_fields,
                            "sheet_row_num": sheet_record.get("sheet_row_num"),
                        }
                    )
            entities.append(
                {
                    "entity": entity,
                    "runtime_count": len(runtime_ids),
                    "sheet_count": len(sheet_ids),
                    "matches": runtime_ids == sheet_ids and not mismatch_samples,
                    "missing_in_runtime": sorted(sheet_ids - runtime_ids)[:10],
                    "missing_in_sheet": sorted(runtime_ids - sheet_ids)[:10],
                    "field_mismatch_count": len(mismatch_samples),
                    "field_mismatches": mismatch_samples[:10],
                }
            )
        return {
            "source": "google_sheets",
            "checked_at": datetime.now(UTC),
            "entities": entities,
        }

    def work_options(self) -> dict[str, Any]:
        if self._work_options_cache is None:
            self._work_options_cache = self._load_work_options()
        return {
            "obras": self._merge_work_options(
                self._work_options_cache,
                MemoryGoogleSheetsAdapter(self.state).load_work_options(),
            ),
        }

    def supplier_options(self) -> dict[str, Any]:
        if self._supplier_options_cache is None:
            self._supplier_options_cache = self._load_supplier_options()
        return {
            "fornecedores": self._merge_supplier_options(
                self._supplier_options_cache,
                MemoryGoogleSheetsAdapter(self.state).load_supplier_options(),
            ),
        }

    def vehicle_options(self) -> dict[str, Any]:
        if self._vehicle_options_cache is None:
            self._vehicle_options_cache = self._load_vehicle_options()
        return {
            "veiculos": self._merge_vehicle_options(
                self._vehicle_options_cache,
                MemoryGoogleSheetsAdapter(self.state).load_vehicle_options(),
            ),
        }

    def _prime_option_caches(self) -> None:
        self._work_options_cache = self._load_work_options()
        self._supplier_options_cache = self._load_supplier_options()
        self._vehicle_options_cache = self._load_vehicle_options()

    def _load_work_options(self) -> list[dict[str, Any]]:
        try:
            return self.google_sheets.load_work_options()
        except Exception:
            logger.exception("Failed to load work options from Google Sheets")
            return MemoryGoogleSheetsAdapter(self.state).load_work_options()

    def _load_supplier_options(self) -> list[dict[str, Any]]:
        try:
            return self.google_sheets.load_supplier_options()
        except Exception:
            logger.exception("Failed to load supplier options from Google Sheets")
            return MemoryGoogleSheetsAdapter(self.state).load_supplier_options()

    def _load_vehicle_options(self) -> list[dict[str, Any]]:
        try:
            return self.google_sheets.load_vehicle_options()
        except Exception:
            logger.exception("Failed to load vehicle options from Google Sheets")
            return MemoryGoogleSheetsAdapter(self.state).load_vehicle_options()

    def _merge_work_options(self, base: list[dict[str, Any]], runtime: list[dict[str, Any]]) -> list[dict[str, Any]]:
        merged: dict[str, dict[str, Any]] = {}
        for item in [*base, *runtime]:
            obra = str(item.get("obra") or "").strip()
            if not obra:
                continue
            current = merged.setdefault(
                obra.lower(),
                {
                    "obra": obra,
                    "ativa": bool(item.get("ativa", True)),
                    "fases": set(),
                },
            )
            current["obra"] = current.get("obra") or obra
            current["ativa"] = bool(current.get("ativa", False) or item.get("ativa", False))
            current["fases"].update(str(fase).strip() for fase in item.get("fases", []) if str(fase).strip())
        return [
            {
                "obra": str(payload["obra"]),
                "ativa": bool(payload["ativa"]),
                "fases": sorted(payload["fases"]),
            }
            for _, payload in sorted(
                merged.items(),
                key=lambda entry: (not bool(entry[1]["ativa"]), str(entry[1]["obra"]).lower()),
            )
        ]

    def _merge_supplier_options(self, base: list[dict[str, Any]], runtime: list[dict[str, Any]]) -> list[dict[str, Any]]:
        merged: dict[str, dict[str, Any]] = {}
        for item in [*base, *runtime]:
            fornecedor = str(item.get("fornecedor") or "").strip()
            if not fornecedor:
                continue
            key = fornecedor.lower()
            current = merged.setdefault(
                key,
                {
                    "id_fornecedor": item.get("id_fornecedor"),
                    "fornecedor": fornecedor,
                    "nif": item.get("nif"),
                },
            )
            if not current.get("id_fornecedor") and item.get("id_fornecedor"):
                current["id_fornecedor"] = item.get("id_fornecedor")
            if not current.get("nif") and item.get("nif"):
                current["nif"] = item.get("nif")
        return [
            merged[key]
            for key in sorted(
                merged.keys(),
                key=lambda item: str(merged[item].get("fornecedor") or "").lower(),
            )
        ]

    def _merge_vehicle_options(self, base: list[dict[str, Any]], runtime: list[dict[str, Any]]) -> list[dict[str, Any]]:
        merged: dict[str, dict[str, Any]] = {}
        for item in [*base, *runtime]:
            matricula = str(item.get("matricula") or "").strip()
            if not matricula:
                continue
            key = matricula.lower()
            current = merged.setdefault(
                key,
                {
                    "veiculo": str(item.get("veiculo") or matricula),
                    "matricula": matricula,
                },
            )
            if (
                (not current.get("veiculo") or str(current.get("veiculo")).strip() == matricula)
                and item.get("veiculo")
                and str(item.get("veiculo")).strip() != matricula
            ):
                current["veiculo"] = str(item.get("veiculo"))
        return [
            merged[key]
            for key in sorted(
                merged.keys(),
                key=lambda item: (
                    str(merged[item].get("veiculo") or "").lower(),
                    str(merged[item].get("matricula") or "").lower(),
                ),
            )
        ]

    def _diagnostic_value(self, value: Any) -> str:
        if isinstance(value, datetime):
            return value.isoformat()
        if hasattr(value, "isoformat"):
            try:
                return value.isoformat()
            except TypeError:
                pass
        if isinstance(value, float):
            return f"{value:.6f}"
        if value is None:
            return ""
        return str(value).strip()


def get_container(request: Request) -> ServiceContainer:
    return request.app.state.container
