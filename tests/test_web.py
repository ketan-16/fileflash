from __future__ import annotations

from fastapi.testclient import TestClient

from app.config import AppSettings
from app.main import create_app


def build_client(tmp_path):
    app = create_app(AppSettings(files_root=tmp_path / "files"))
    return TestClient(app)


def test_health_endpoint(tmp_path) -> None:
    with build_client(tmp_path) as client:
        response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_static_routes_served(tmp_path) -> None:
    with build_client(tmp_path) as client:
        index = client.get("/")
        sw = client.get("/static/sw.js")
        manifest = client.get("/static/manifest.webmanifest")
        logo = client.get("/static/icons/fileflash-logo.svg")

    assert index.status_code == 200
    assert "FileFlash" in index.text
    assert sw.status_code == 200
    assert "self.addEventListener" in sw.text
    assert manifest.status_code == 200
    assert logo.status_code == 200


def test_root_manifest_route(tmp_path) -> None:
    with build_client(tmp_path) as client:
        response = client.get("/manifest.webmanifest")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/manifest+json")
