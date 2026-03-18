from __future__ import annotations

from fastapi import FastAPI

from backend.app.api.deps import ServiceContainer
from backend.app.api.routers.afetacoes import router as afetacoes_router
from backend.app.api.routers.catalogo import router as catalogo_router
from backend.app.api.routers.faturas import router as faturas_router
from backend.app.api.routers.stock import router as stock_router
from backend.app.api.routers.sync import router as sync_router


def create_app() -> FastAPI:
    app = FastAPI(title="Materials Backoffice API", version="0.1.0")
    app.state.container = ServiceContainer()

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(sync_router)
    app.include_router(faturas_router)
    app.include_router(catalogo_router)
    app.include_router(afetacoes_router)
    app.include_router(stock_router)
    return app


app = create_app()
