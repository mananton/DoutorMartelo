from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from backend.app.adapters.google_sheets.base import WriteBatch


@dataclass
class RuntimeState:
    faturas: dict[str, dict[str, Any]] = field(default_factory=dict)
    fatura_items: dict[str, dict[str, Any]] = field(default_factory=dict)
    catalog: dict[str, dict[str, Any]] = field(default_factory=dict)
    afetacoes: dict[str, dict[str, Any]] = field(default_factory=dict)
    movimentos: dict[str, dict[str, Any]] = field(default_factory=dict)
    sync_jobs: dict[str, dict[str, Any]] = field(default_factory=dict)
    pending_sync_payloads: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    synced_rows: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    counters: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    google_write_log: list[WriteBatch] = field(default_factory=list)
    supabase_write_log: list[WriteBatch] = field(default_factory=list)
    sequence: int = 0

    def next_id(self, prefix: str) -> str:
        self.counters[prefix] += 1
        return f"{prefix}-{self.counters[prefix]:06d}"

    def next_sequence(self) -> int:
        self.sequence += 1
        return self.sequence

    def touch_sync_job(
        self,
        entity: str,
        *,
        pending_retry: bool,
        upserted: int = 0,
        error: str | None = None,
        payload: list[dict[str, Any]] | None = None,
    ) -> None:
        now = datetime.now(UTC)
        job = self.sync_jobs.get(entity, {"entity": entity})
        job["entity"] = entity
        job["pending_retry"] = pending_retry
        job["last_attempt_at"] = now
        job["last_upserted"] = upserted
        if error:
            job["last_error"] = error
        elif not pending_retry:
            job["last_error"] = None
        if not pending_retry:
            job["last_success_at"] = now
            self.pending_sync_payloads.pop(entity, None)
        elif payload is not None:
            self.pending_sync_payloads[entity] = payload
        self.sync_jobs[entity] = job
