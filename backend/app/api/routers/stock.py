from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.app.api.deps import ServiceContainer, get_container
from backend.app.schemas.common import StockSnapshot

router = APIRouter(prefix="/api/stock-atual", tags=["stock"])


@router.get("", response_model=list[StockSnapshot])
def list_stock(container: ServiceContainer = Depends(get_container)) -> list[StockSnapshot]:
    return container.materials.list_stock_snapshots()


@router.get("/{id_item}", response_model=StockSnapshot)
def get_stock(id_item: str, container: ServiceContainer = Depends(get_container)) -> StockSnapshot:
    return container.materials.get_stock_snapshot(id_item)
