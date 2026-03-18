from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.app.api.deps import ServiceContainer, get_container
from backend.app.schemas.common import BulkRowsRequest, BulkSyncResponse
from backend.app.schemas.sync import SyncStatusResponse

router = APIRouter(prefix="/api", tags=["sync"])


def _ingest(entity: str, payload: BulkRowsRequest, container: ServiceContainer) -> BulkSyncResponse:
    return container.sync.ingest_rows(entity, payload.rows)


@router.get("/sync/status", response_model=SyncStatusResponse)
def get_status(container: ServiceContainer = Depends(get_container)) -> SyncStatusResponse:
    return container.sync.status()


@router.post("/sync/retry", response_model=SyncStatusResponse)
def retry_pending(container: ServiceContainer = Depends(get_container)) -> SyncStatusResponse:
    return container.sync.retry_pending()


@router.post("/sync/colaboradores", response_model=BulkSyncResponse)
def sync_colaboradores(payload: BulkRowsRequest, container: ServiceContainer = Depends(get_container)) -> BulkSyncResponse:
    return _ingest("colaboradores", payload, container)


@router.post("/sync/registos", response_model=BulkSyncResponse)
def sync_registos(payload: BulkRowsRequest, container: ServiceContainer = Depends(get_container)) -> BulkSyncResponse:
    return _ingest("registos", payload, container)


@router.post("/sync/deslocacoes", response_model=BulkSyncResponse)
def sync_deslocacoes(payload: BulkRowsRequest, container: ServiceContainer = Depends(get_container)) -> BulkSyncResponse:
    return _ingest("deslocacoes", payload, container)


@router.post("/sync/legacy-mao-obra", response_model=BulkSyncResponse)
def sync_legacy(payload: BulkRowsRequest, container: ServiceContainer = Depends(get_container)) -> BulkSyncResponse:
    return _ingest("legacy_mao_obra", payload, container)


@router.post("/sync/faturas", response_model=BulkSyncResponse)
def sync_faturas(payload: BulkRowsRequest, container: ServiceContainer = Depends(get_container)) -> BulkSyncResponse:
    return _ingest("faturas", payload, container)


@router.post("/sync/faturas-itens", response_model=BulkSyncResponse)
def sync_faturas_itens(payload: BulkRowsRequest, container: ServiceContainer = Depends(get_container)) -> BulkSyncResponse:
    return _ingest("faturas_itens", payload, container)


@router.post("/sync/materiais-cad", response_model=BulkSyncResponse)
def sync_materiais_cad(payload: BulkRowsRequest, container: ServiceContainer = Depends(get_container)) -> BulkSyncResponse:
    return _ingest("materiais_cad", payload, container)


@router.post("/sync/afetacoes-obra", response_model=BulkSyncResponse)
def sync_afetacoes(payload: BulkRowsRequest, container: ServiceContainer = Depends(get_container)) -> BulkSyncResponse:
    return _ingest("afetacoes_obra", payload, container)


@router.post("/sync/materiais-mov", response_model=BulkSyncResponse)
def sync_materiais_mov(payload: BulkRowsRequest, container: ServiceContainer = Depends(get_container)) -> BulkSyncResponse:
    return _ingest("materiais_mov", payload, container)


@router.post("/sync/stock-atual", response_model=BulkSyncResponse)
def sync_stock(payload: BulkRowsRequest, container: ServiceContainer = Depends(get_container)) -> BulkSyncResponse:
    return _ingest("stock_atual", payload, container)

