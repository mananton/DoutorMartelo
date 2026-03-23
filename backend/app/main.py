from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.staticfiles import StaticFiles

from backend.app.api.deps import ServiceContainer
from backend.app.api.routers.afetacoes import router as afetacoes_router
from backend.app.api.routers.catalogo import router as catalogo_router
from backend.app.config import Settings
from backend.app.api.routers.faturas import router as faturas_router
from backend.app.api.routers.movimentos import router as movimentos_router
from backend.app.api.routers.options import router as options_router
from backend.app.api.routers.stock import router as stock_router
from backend.app.api.routers.sync import router as sync_router


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    app = FastAPI(title="Materials Backoffice API", version="0.1.0")
    app.state.container = ServiceContainer(settings=settings)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(sync_router)
    app.include_router(options_router)
    app.include_router(faturas_router)
    app.include_router(catalogo_router)
    app.include_router(afetacoes_router)
    app.include_router(stock_router)
    app.include_router(movimentos_router)
    _configure_frontend_serving(app, settings)
    return app


def _configure_frontend_serving(app: FastAPI, settings: Settings) -> None:
    if settings.disable_frontend_serving:
        return

    dist_dir = _resolve_frontend_dist_dir(settings)
    if not dist_dir or not dist_dir.exists():
        return

    assets_dir = dist_dir / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="frontend-assets")

    index_file = dist_dir / "index.html"
    if not index_file.exists():
        return

    @app.get("/", include_in_schema=False)
    def frontend_index() -> FileResponse:
        return FileResponse(index_file)

    @app.get("/{full_path:path}", include_in_schema=False)
    def frontend_spa(full_path: str) -> FileResponse:
        normalized = full_path.strip("/")
        if normalized.startswith("api/") or normalized == "health":
            raise StarletteHTTPException(status_code=404)

        candidate = dist_dir / normalized if normalized else index_file
        if normalized and candidate.exists() and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(index_file)


def _resolve_frontend_dist_dir(settings: Settings) -> Path | None:
    if settings.frontend_dist_dir:
        return Path(settings.frontend_dist_dir).resolve()
    return (Path(__file__).resolve().parents[2] / "frontend" / "dist").resolve()


app = create_app()
