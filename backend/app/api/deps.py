from __future__ import annotations

from fastapi import Request

from backend.app.adapters.google_sheets.memory import MemoryGoogleSheetsAdapter
from backend.app.adapters.supabase.memory import MemorySupabaseAdapter
from backend.app.services.materials import MaterialsService
from backend.app.services.state import RuntimeState
from backend.app.services.sync import SyncService


class ServiceContainer:
    def __init__(self) -> None:
        self.state = RuntimeState()
        self.google_sheets = MemoryGoogleSheetsAdapter(self.state)
        self.supabase = MemorySupabaseAdapter(self.state)
        self.materials = MaterialsService(self.state, self.google_sheets, self.supabase)
        self.sync = SyncService(self.state, self.supabase)


def get_container(request: Request) -> ServiceContainer:
    return request.app.state.container
