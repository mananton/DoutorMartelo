from __future__ import annotations

from fastapi import APIRouter, Depends, status

from backend.app.api.deps import ServiceContainer, get_container
from backend.app.schemas.materials import (
    FaturaCreate,
    FaturaDetail,
    FaturaItemRecord,
    FaturaItemUpdate,
    FaturaItemsCreateRequest,
    FaturaItemsResponse,
    FaturaRecord,
    FaturaUpdate,
)

router = APIRouter(prefix="/api/faturas", tags=["faturas"])


@router.get("", response_model=list[FaturaRecord])
def list_faturas(container: ServiceContainer = Depends(get_container)) -> list[FaturaRecord]:
    return container.materials.list_faturas()


@router.post("", response_model=FaturaRecord, status_code=status.HTTP_201_CREATED)
def create_fatura(payload: FaturaCreate, container: ServiceContainer = Depends(get_container)) -> FaturaRecord:
    return container.materials.create_fatura(payload)


@router.get("/{id_fatura}", response_model=FaturaDetail)
def get_fatura(id_fatura: str, container: ServiceContainer = Depends(get_container)) -> FaturaDetail:
    return container.materials.get_fatura(id_fatura)


@router.patch("/{id_fatura}", response_model=FaturaRecord)
def patch_fatura(id_fatura: str, payload: FaturaUpdate, container: ServiceContainer = Depends(get_container)) -> FaturaRecord:
    return container.materials.patch_fatura(id_fatura, payload)


@router.delete("/{id_fatura}", status_code=status.HTTP_204_NO_CONTENT)
def delete_fatura(id_fatura: str, container: ServiceContainer = Depends(get_container)) -> None:
    container.materials.delete_fatura(id_fatura)


@router.post("/{id_fatura}/itens/preview", response_model=FaturaItemsResponse)
def preview_items(
    id_fatura: str,
    payload: FaturaItemsCreateRequest,
    container: ServiceContainer = Depends(get_container),
) -> FaturaItemsResponse:
    return container.materials.preview_fatura_items(id_fatura, payload.items)


@router.post("/{id_fatura}/itens", response_model=FaturaItemsResponse, status_code=status.HTTP_201_CREATED)
def create_items(
    id_fatura: str,
    payload: FaturaItemsCreateRequest,
    container: ServiceContainer = Depends(get_container),
) -> FaturaItemsResponse:
    return container.materials.create_fatura_items(id_fatura, payload.items)


@router.patch("/{id_fatura}/itens/{item_id}", response_model=FaturaItemRecord)
def patch_item(
    id_fatura: str,
    item_id: str,
    payload: FaturaItemUpdate,
    container: ServiceContainer = Depends(get_container),
) -> FaturaItemRecord:
    return container.materials.update_fatura_item(id_fatura, item_id, payload.model_dump(exclude_none=True))


@router.delete("/{id_fatura}/itens/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(id_fatura: str, item_id: str, container: ServiceContainer = Depends(get_container)) -> None:
    container.materials.delete_fatura_item(id_fatura, item_id)
