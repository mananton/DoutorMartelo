from __future__ import annotations

from datetime import UTC, datetime

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


def get_container(request: Request) -> ServiceContainer:
    return request.app.state.container
