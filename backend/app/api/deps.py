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
        "faturas": ["fornecedor", "nif", "nr_documento", "data_fatura", "valor_sem_iva", "iva", "valor_com_iva", "estado"],
        "faturas_itens": [
            "id_fatura",
            "descricao_original",
            "id_item",
            "item_oficial",
            "natureza",
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

    def __init__(self) -> None:
        self.settings = Settings.from_env()
        self.state = RuntimeState()
        self.google_sheets = self._build_google_adapter()
        self.supabase = self._build_supabase_adapter()
        self._hydrate_runtime_state()
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
        try:
            obras = self.google_sheets.load_work_options()
        except Exception:
            obras = MemoryGoogleSheetsAdapter(self.state).load_work_options()
        return {
            "obras": obras,
        }

    def supplier_options(self) -> dict[str, Any]:
        try:
            fornecedores = self.google_sheets.load_supplier_options()
        except Exception:
            fornecedores = MemoryGoogleSheetsAdapter(self.state).load_supplier_options()
        return {
            "fornecedores": fornecedores,
        }

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
