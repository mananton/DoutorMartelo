from __future__ import annotations

from typing import Any

from backend.app.adapters.google_sheets.base import WriteBatch
from backend.app.adapters.supabase.base import SupabaseAdapter, SupabaseAdapterError
from backend.app.schemas.common import BulkSyncResponse
from backend.app.schemas.sync import SyncStatusResponse
from backend.app.services.state import RuntimeState

CORE_SYNC_ENTITIES = [
    "faturas",
    "compromissos_obra",
    "faturas_itens",
    "notas_credito_itens",
    "materiais_cad",
    "materiais_referencias",
    "afetacoes_obra",
    "materiais_mov",
    "pessoal_efetivo",
]


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
                payload={"operation": "upsert", "rows": rows},
            )
            return BulkSyncResponse(
                entity=entity,
                upserted=0,
                pending_retry=True,
                last_error=str(exc),
            )

    def delete_rows(self, entity: str, ids: list[str]) -> None:
        if not ids:
            return
        try:
            self.supabase.delete_records(entity, ids)
            self.state.touch_sync_job(entity, pending_retry=False, upserted=len(ids))
        except SupabaseAdapterError as exc:
            self.state.touch_sync_job(
                entity,
                pending_retry=True,
                upserted=0,
                error=str(exc),
                payload={"operation": "delete", "ids": ids},
            )

    def retry_pending(self) -> SyncStatusResponse:
        for entity, payload in list(self.state.pending_sync_payloads.items()):
            if payload.get("operation") == "delete":
                self.delete_rows(entity, [str(item) for item in payload.get("ids", [])])
                continue
            self.ingest_rows(entity, payload.get("rows", []))
        return self.status()

    def status(self) -> SyncStatusResponse:
        jobs_by_entity = dict(self.state.sync_jobs)
        jobs = []
        for entity in CORE_SYNC_ENTITIES:
            jobs.append(
                jobs_by_entity.get(
                    entity,
                    {
                        "entity": entity,
                        "pending_retry": False,
                        "last_error": None,
                        "last_attempt_at": None,
                        "last_success_at": None,
                        "last_upserted": 0,
                    },
                )
            )

        for entity, job in sorted(jobs_by_entity.items()):
            if entity not in CORE_SYNC_ENTITIES:
                jobs.append(job)
        return SyncStatusResponse(
            jobs=jobs,
            last_reload_at=self.state.last_reload_at,
            last_reload_source=self.state.last_reload_source,
        )
