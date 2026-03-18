from __future__ import annotations

from typing import Any

from backend.app.adapters.google_sheets.base import WriteBatch
from backend.app.adapters.supabase.base import SupabaseAdapter, SupabaseAdapterError
from backend.app.schemas.common import BulkSyncResponse
from backend.app.schemas.sync import SyncStatusResponse
from backend.app.services.state import RuntimeState


class SyncService:
    def __init__(self, state: RuntimeState, supabase: SupabaseAdapter) -> None:
        self.state = state
        self.supabase = supabase

    def ingest_rows(self, entity: str, rows: list[dict[str, Any]]) -> BulkSyncResponse:
        batch = WriteBatch(entity=entity, records=rows)
        try:
            self.supabase.write_batches([batch])
            self.state.synced_rows[entity] = rows
            self.state.touch_sync_job(entity, pending_retry=False, upserted=len(rows))
            return BulkSyncResponse(entity=entity, upserted=len(rows), pending_retry=False)
        except SupabaseAdapterError as exc:
            self.state.touch_sync_job(
                entity,
                pending_retry=True,
                upserted=0,
                error=str(exc),
                payload=rows,
            )
            return BulkSyncResponse(
                entity=entity,
                upserted=0,
                pending_retry=True,
                last_error=str(exc),
            )

    def retry_pending(self) -> SyncStatusResponse:
        for entity, payload in list(self.state.pending_sync_payloads.items()):
            self.ingest_rows(entity, payload)
        return self.status()

    def status(self) -> SyncStatusResponse:
        jobs = [job for _, job in sorted(self.state.sync_jobs.items())]
        return SyncStatusResponse(jobs=jobs)
