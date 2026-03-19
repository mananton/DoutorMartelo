from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime
import re
from typing import Any

from backend.app.adapters.google_sheets.base import WriteBatch


@dataclass
class RuntimeState:
    faturas: dict[str, dict[str, Any]] = field(default_factory=dict)
    fatura_items: dict[str, dict[str, Any]] = field(default_factory=dict)
    catalog: dict[str, dict[str, Any]] = field(default_factory=dict)
    catalog_references: dict[str, dict[str, Any]] = field(default_factory=dict)
    afetacoes: dict[str, dict[str, Any]] = field(default_factory=dict)
    movimentos: dict[str, dict[str, Any]] = field(default_factory=dict)
    sync_jobs: dict[str, dict[str, Any]] = field(default_factory=dict)
    pending_sync_payloads: dict[str, dict[str, Any]] = field(default_factory=dict)
    synced_rows: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    counters: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    google_write_log: list[WriteBatch] = field(default_factory=list)
    supabase_write_log: list[WriteBatch] = field(default_factory=list)
    sequence: int = 0
    last_reload_at: datetime | None = None
    last_reload_source: str | None = None

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
        payload: dict[str, Any] | None = None,
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

    def hydrate_from_snapshot(
        self,
        snapshot: dict[str, list[dict[str, Any]]],
        *,
        preserve_sync_state: bool = False,
        source: str = "google_sheets",
    ) -> None:
        previous_sync_jobs = dict(self.sync_jobs)
        previous_pending_sync_payloads = dict(self.pending_sync_payloads)
        previous_synced_rows = dict(self.synced_rows)
        self.faturas = {
            record["id_fatura"]: record
            for record in snapshot.get("faturas", [])
            if record.get("id_fatura")
        }
        self.fatura_items = {
            record["id_item_fatura"]: record
            for record in snapshot.get("faturas_itens", [])
            if record.get("id_item_fatura")
        }
        self.catalog = {
            record["id_item"]: record
            for record in snapshot.get("materiais_cad", [])
            if record.get("id_item")
        }
        self.catalog_references = {
            record["id_referencia"]: record
            for record in snapshot.get("materiais_referencias", [])
            if record.get("id_referencia")
        }
        self.afetacoes = {
            record["id_afetacao"]: record
            for record in snapshot.get("afetacoes_obra", [])
            if record.get("id_afetacao")
        }
        self.movimentos = {
            record["id_mov"]: record
            for record in snapshot.get("materiais_mov", [])
            if record.get("id_mov")
        }

        if preserve_sync_state:
            self.sync_jobs = previous_sync_jobs
            self.pending_sync_payloads = previous_pending_sync_payloads
            self.synced_rows = previous_synced_rows
        else:
            self.sync_jobs.clear()
            self.pending_sync_payloads.clear()
            self.synced_rows.clear()
        self.google_write_log.clear()
        self.supabase_write_log.clear()
        self.counters = defaultdict(int)
        self.sequence = 0

        for identifier in self.faturas:
            self._seed_counter(identifier)
        for identifier in self.fatura_items:
            self._seed_counter(identifier)
        for identifier in self.catalog:
            self._seed_counter(identifier)
        for identifier in self.catalog_references:
            self._seed_counter(identifier)
        for identifier in self.afetacoes:
            self._seed_counter(identifier)
        for identifier in self.movimentos:
            self._seed_counter(identifier)

        for movement in self.movimentos.values():
            try:
                self.sequence = max(self.sequence, int(movement.get("sequence") or 0))
            except (TypeError, ValueError):
                continue
        if self.sequence == 0 and self.movimentos:
            self.sequence = len(self.movimentos)
        self.last_reload_at = datetime.now(UTC)
        self.last_reload_source = source

    def _seed_counter(self, identifier: str) -> None:
        match = re.match(r"^([A-Z]+)-(\d+)$", str(identifier or "").strip())
        if not match:
            return
        prefix, number = match.groups()
        self.counters[prefix] = max(self.counters[prefix], int(number))
