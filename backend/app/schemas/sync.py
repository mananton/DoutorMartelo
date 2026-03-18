from __future__ import annotations

from backend.app.schemas.common import ApiModel, SyncJobStatus


class SyncStatusResponse(ApiModel):
    jobs: list[SyncJobStatus]
