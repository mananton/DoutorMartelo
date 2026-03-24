from __future__ import annotations

from fastapi import APIRouter, Depends, status

from backend.app.api.deps import ServiceContainer, get_container
from backend.app.schemas.materials import CompromissoCreate, CompromissoRecord, CompromissoUpdate

router = APIRouter(prefix="/api/compromissos", tags=["compromissos"])


@router.get("", response_model=list[CompromissoRecord])
def list_compromissos(container: ServiceContainer = Depends(get_container)) -> list[CompromissoRecord]:
    return container.materials.list_compromissos()


@router.post("", response_model=CompromissoRecord, status_code=status.HTTP_201_CREATED)
def create_compromisso(payload: CompromissoCreate, container: ServiceContainer = Depends(get_container)) -> CompromissoRecord:
    return container.materials.create_compromisso(payload)


@router.patch("/{id_compromisso}", response_model=CompromissoRecord)
def patch_compromisso(
    id_compromisso: str,
    payload: CompromissoUpdate,
    container: ServiceContainer = Depends(get_container),
) -> CompromissoRecord:
    return container.materials.patch_compromisso(id_compromisso, payload)


@router.delete("/{id_compromisso}", status_code=status.HTTP_204_NO_CONTENT)
def delete_compromisso(id_compromisso: str, container: ServiceContainer = Depends(get_container)) -> None:
    container.materials.delete_compromisso(id_compromisso)
