from __future__ import annotations

from fastapi import APIRouter, Depends, status

from backend.app.api.deps import ServiceContainer, get_container
from backend.app.schemas.materials import AfetacaoCreate, AfetacaoRecord, AfetacaoUpdate

router = APIRouter(prefix="/api/afetacoes", tags=["afetacoes"])


@router.get("", response_model=list[AfetacaoRecord])
def list_afetacoes(container: ServiceContainer = Depends(get_container)) -> list[AfetacaoRecord]:
    return container.materials.list_afetacoes()


@router.post("", response_model=AfetacaoRecord, status_code=status.HTTP_201_CREATED)
def create_afetacao(payload: AfetacaoCreate, container: ServiceContainer = Depends(get_container)) -> AfetacaoRecord:
    return container.materials.create_afetacao(payload)


@router.patch("/{id_afetacao}", response_model=AfetacaoRecord)
def patch_afetacao(id_afetacao: str, payload: AfetacaoUpdate, container: ServiceContainer = Depends(get_container)) -> AfetacaoRecord:
    return container.materials.patch_afetacao(id_afetacao, payload)


@router.delete("/{id_afetacao}", status_code=status.HTTP_204_NO_CONTENT)
def delete_afetacao(id_afetacao: str, container: ServiceContainer = Depends(get_container)) -> None:
    container.materials.delete_afetacao(id_afetacao)


@router.post("/{id_afetacao}/processar", response_model=AfetacaoRecord)
def process_afetacao(id_afetacao: str, container: ServiceContainer = Depends(get_container)) -> AfetacaoRecord:
    return container.materials.process_afetacao(id_afetacao)
