from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.app.api.deps import ServiceContainer, get_container
from backend.app.schemas.common import WorkOptionsResponse

router = APIRouter(prefix="/api/options", tags=["options"])


@router.get("/obras-fases", response_model=WorkOptionsResponse)
def get_work_options(container: ServiceContainer = Depends(get_container)) -> WorkOptionsResponse:
    return WorkOptionsResponse.model_validate(container.work_options())
