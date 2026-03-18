from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class BulkRowsRequest(ApiModel):
    rows: list[dict[str, Any]]


class BulkSyncResponse(ApiModel):
    entity: str
    upserted: int
    pending_retry: bool = False
    last_error: str | None = None


class OperationImpact(ApiModel):
    type: str
    entity: str
    source: str
    summary: str


class SyncJobStatus(ApiModel):
    entity: str
    pending_retry: bool
    last_error: str | None = None
    last_attempt_at: datetime | None = None
    last_success_at: datetime | None = None
    last_upserted: int = 0


class StockSnapshot(ApiModel):
    id_item: str
    item_oficial: str | None = None
    unidade: str | None = None
    stock_atual: float = 0
    custo_medio_atual: float = 0

