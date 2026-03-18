from __future__ import annotations

from backend.app.adapters.google_sheets.base import GoogleSheetsAdapter, WriteBatch
from backend.app.services.state import RuntimeState


class MemoryGoogleSheetsAdapter(GoogleSheetsAdapter):
    def __init__(self, state: RuntimeState) -> None:
        self.state = state

    def write_batches(self, batches: list[WriteBatch]) -> None:
        self.state.google_write_log.extend(batches)

