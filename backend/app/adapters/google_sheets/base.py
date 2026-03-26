from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(slots=True)
class WriteBatch:
    entity: str
    records: list[dict[str, Any]]


class GoogleSheetsAdapter(Protocol):
    def write_batches(self, batches: list[WriteBatch]) -> None:
        ...

    def delete_records(self, entity: str, ids: list[str]) -> None:
        ...

    def load_snapshot(self, *, value_render_option: str | None = None) -> dict[str, list[dict[str, Any]]]:
        ...

    def load_work_options(self) -> list[dict[str, Any]]:
        ...

    def load_supplier_options(self) -> list[dict[str, Any]]:
        ...

    def load_vehicle_options(self) -> list[dict[str, Any]]:
        ...
