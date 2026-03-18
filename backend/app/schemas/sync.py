from __future__ import annotations

from datetime import datetime

from backend.app.schemas.common import ApiModel, SyncJobStatus


class SyncStatusResponse(ApiModel):
    jobs: list[SyncJobStatus]


class ReloadStateResponse(ApiModel):
    source: str
    faturas: int
    faturas_itens: int
    materiais_cad: int
    afetacoes_obra: int
    materiais_mov: int
    reloaded_at: datetime
