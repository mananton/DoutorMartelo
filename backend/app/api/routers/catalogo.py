from __future__ import annotations

from fastapi import APIRouter, Depends, status

from backend.app.api.deps import ServiceContainer, get_container
from backend.app.schemas.materials import CatalogEntryCreate, CatalogEntryRecord, CatalogEntryUpdate

router = APIRouter(prefix="/api/materiais-cad", tags=["catalogo"])


@router.get("", response_model=list[CatalogEntryRecord])
def list_catalog(container: ServiceContainer = Depends(get_container)) -> list[CatalogEntryRecord]:
    return container.materials.list_catalog()


@router.post("", response_model=CatalogEntryRecord, status_code=status.HTTP_201_CREATED)
def create_catalog(payload: CatalogEntryCreate, container: ServiceContainer = Depends(get_container)) -> CatalogEntryRecord:
    return container.materials.create_catalog_entry(payload)


@router.patch("/{id_item}", response_model=CatalogEntryRecord)
def patch_catalog(id_item: str, payload: CatalogEntryUpdate, container: ServiceContainer = Depends(get_container)) -> CatalogEntryRecord:
    return container.materials.patch_catalog_entry(id_item, payload)

