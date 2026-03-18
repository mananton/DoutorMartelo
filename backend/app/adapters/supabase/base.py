from __future__ import annotations

from typing import Protocol

from backend.app.adapters.google_sheets.base import WriteBatch


class SupabaseAdapterError(RuntimeError):
    pass


class SupabaseAdapter(Protocol):
    def write_batches(self, batches: list[WriteBatch]) -> None:
        ...

