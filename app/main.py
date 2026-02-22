from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api import router as api_router
from app.config import AppSettings, load_settings
from app.storage import LocalFileStorage

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"
INDEX_FILE = STATIC_DIR / "index.html"
MANIFEST_FILE = STATIC_DIR / "manifest.webmanifest"
SW_FILE = STATIC_DIR / "sw.js"


def create_app(settings: AppSettings | None = None) -> FastAPI:
    app_settings = settings or load_settings()

    app = FastAPI(
        title="File Share",
        docs_url="/docs" if app_settings.enable_docs else None,
        redoc_url=None,
    )

    app.state.settings = app_settings
    app.state.storage = LocalFileStorage(
        app_settings.files_root,
        chunk_size_bytes=app_settings.chunk_size_bytes,
    )

    app.include_router(api_router)
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

    @app.get("/", include_in_schema=False)
    def index() -> FileResponse:
        return FileResponse(INDEX_FILE)

    @app.get("/sw.js", include_in_schema=False)
    def service_worker() -> FileResponse:
        return FileResponse(SW_FILE, media_type="application/javascript")

    @app.get("/manifest.webmanifest", include_in_schema=False)
    def manifest() -> FileResponse:
        return FileResponse(MANIFEST_FILE, media_type="application/manifest+json")

    @app.get("/healthz", tags=["system"])
    def healthz() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
