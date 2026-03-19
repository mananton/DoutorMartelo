from __future__ import annotations

from datetime import datetime

from pydantic import Field

from backend.app.schemas.common import ApiModel, SyncJobStatus


class SyncStatusResponse(ApiModel):
    jobs: list[SyncJobStatus]
    last_reload_at: datetime | None = None
    last_reload_source: str | None = None


class SyncFieldMismatch(ApiModel):
    id: str
    fields: list[str]
    sheet_row_num: int | None = None


class ReloadStateResponse(ApiModel):
    source: str
    faturas: int
    faturas_itens: int
    materiais_cad: int
    materiais_referencias: int
    afetacoes_obra: int
    materiais_mov: int
    reloaded_at: datetime


class SyncDiagnosticsEntity(ApiModel):
    entity: str
    runtime_count: int
    sheet_count: int
    matches: bool
    missing_in_runtime: list[str]
    missing_in_sheet: list[str]
    field_mismatch_count: int = 0
    field_mismatches: list[SyncFieldMismatch] = Field(default_factory=list)


class SyncDiagnosticsResponse(ApiModel):
    source: str
    checked_at: datetime
    entities: list[SyncDiagnosticsEntity]
