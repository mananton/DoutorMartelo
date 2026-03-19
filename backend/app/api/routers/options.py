from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.app.api.deps import ServiceContainer, get_container
from backend.app.schemas.common import SupplierOptionsResponse, WorkOptionsResponse

router = APIRouter(prefix="/api/options", tags=["options"])


@router.get("/obras-fases", response_model=WorkOptionsResponse)
def get_work_options(container: ServiceContainer = Depends(get_container)) -> WorkOptionsResponse:
    return WorkOptionsResponse.model_validate(container.work_options())


@router.get("/fornecedores", response_model=SupplierOptionsResponse)
def get_supplier_options(container: ServiceContainer = Depends(get_container)) -> SupplierOptionsResponse:
    return SupplierOptionsResponse.model_validate(container.supplier_options())
