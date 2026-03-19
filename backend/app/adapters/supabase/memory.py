from __future__ import annotations

from backend.app.adapters.google_sheets.base import WriteBatch
from backend.app.adapters.supabase.base import SupabaseAdapter, SupabaseAdapterError
from backend.app.services.state import RuntimeState


class MemorySupabaseAdapter(SupabaseAdapter):
    def __init__(self, state: RuntimeState) -> None:
        self.state = state
        self.fail_entities: set[str] = set()

    def write_batches(self, batches: list[WriteBatch]) -> None:
        for batch in batches:
            if batch.entity in self.fail_entities:
                raise SupabaseAdapterError(f"Supabase mirror failed for {batch.entity}")
        self.state.supabase_write_log.extend(batches)

    def delete_records(self, entity: str, ids: list[str]) -> None:
        if entity in self.fail_entities:
            raise SupabaseAdapterError(f"Supabase mirror failed for {entity}")
