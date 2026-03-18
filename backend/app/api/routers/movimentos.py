from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.app.api.deps import ServiceContainer, get_container
from backend.app.schemas.materials import MovimentoRecord

router = APIRouter(prefix="/api/materiais-mov", tags=["movimentos"])


@router.get("", response_model=list[MovimentoRecord])
def list_movimentos(container: ServiceContainer = Depends(get_container)) -> list[MovimentoRecord]:
    return container.materials.list_movimentos()
