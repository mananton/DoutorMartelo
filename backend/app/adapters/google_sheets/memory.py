from __future__ import annotations

from backend.app.adapters.google_sheets.base import GoogleSheetsAdapter, WriteBatch
from backend.app.services.state import RuntimeState


class MemoryGoogleSheetsAdapter(GoogleSheetsAdapter):
    def __init__(self, state: RuntimeState) -> None:
        self.state = state

    def write_batches(self, batches: list[WriteBatch]) -> None:
        self.state.google_write_log.extend(batches)

    def load_snapshot(self) -> dict[str, list[dict[str, object]]]:
        return {}

    def load_work_options(self) -> list[dict[str, object]]:
        fases_by_obra: dict[str, set[str]] = {}
        for collection in (self.state.fatura_items.values(), self.state.afetacoes.values(), self.state.movimentos.values()):
            for record in collection:
                obra = str(record.get("obra") or "").strip()
                fase = str(record.get("fase") or "").strip()
                if not obra:
                    continue
                fases_by_obra.setdefault(obra, set())
                if fase:
                    fases_by_obra[obra].add(fase)
        return [
            {"obra": obra, "ativa": True, "fases": sorted(fases)}
            for obra, fases in sorted(fases_by_obra.items())
        ]
