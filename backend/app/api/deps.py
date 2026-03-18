from __future__ import annotations

from datetime import UTC, datetime
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


class ServiceContainer:
    DIAGNOSTIC_CONFIG = {
        "faturas": ("id_fatura", "faturas"),
        "faturas_itens": ("id_item_fatura", "fatura_items"),
        "materiais_cad": ("id_item", "catalog"),
        "afetacoes_obra": ("id_afetacao", "afetacoes"),
        "materiais_mov": ("id_mov", "movimentos"),
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
            return
        if snapshot:
            self.state.hydrate_from_snapshot(snapshot)

    def reload_from_sheets(self) -> dict[str, object]:
        snapshot = self.google_sheets.load_snapshot()
        self.state.hydrate_from_snapshot(snapshot, preserve_sync_state=True)
        return {
            "source": "google_sheets",
            "faturas": len(self.state.faturas),
            "faturas_itens": len(self.state.fatura_items),
            "materiais_cad": len(self.state.catalog),
            "afetacoes_obra": len(self.state.afetacoes),
            "materiais_mov": len(self.state.movimentos),
            "reloaded_at": datetime.now(UTC),
        }

    def sync_diagnostics(self) -> dict[str, Any]:
        snapshot = self.google_sheets.load_snapshot()
        entities = []
        for entity, (id_field, state_attr) in self.DIAGNOSTIC_CONFIG.items():
            runtime_records = getattr(self.state, state_attr)
            runtime_ids = {str(record_id) for record_id in runtime_records.keys() if str(record_id).strip()}
            sheet_ids = {
                str(record.get(id_field))
                for record in snapshot.get(entity, [])
                if str(record.get(id_field) or "").strip()
            }
            entities.append(
                {
                    "entity": entity,
                    "runtime_count": len(runtime_ids),
                    "sheet_count": len(sheet_ids),
                    "matches": runtime_ids == sheet_ids,
                    "missing_in_runtime": sorted(sheet_ids - runtime_ids)[:10],
                    "missing_in_sheet": sorted(runtime_ids - sheet_ids)[:10],
                }
            )
        return {
            "source": "google_sheets",
            "checked_at": datetime.now(UTC),
            "entities": entities,
        }


def get_container(request: Request) -> ServiceContainer:
    return request.app.state.container
