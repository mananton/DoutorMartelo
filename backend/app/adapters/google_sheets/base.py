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

