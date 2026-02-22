from __future__ import annotations

import os

from fastapi.testclient import TestClient
import pytest

from app.config import AppSettings
from app.main import create_app


@pytest.fixture
def client_and_settings(tmp_path: pytest.TempPathFactory):
    files_root = tmp_path / "files"
    settings = AppSettings(files_root=files_root, max_upload_mb=1, chunk_size_bytes=1024)
    app = create_app(settings)

    with TestClient(app) as client:
        yield client, settings


def test_upload_success(client_and_settings: tuple[TestClient, AppSettings]) -> None:
    client, _ = client_and_settings

    response = client.post("/api/files", files={"file": ("hello.txt", b"hello world", "text/plain")})

    assert response.status_code == 201
    payload = response.json()
    assert payload["name"] == "hello.txt"
    assert payload["size"] == 11


def test_upload_duplicate_conflict(client_and_settings: tuple[TestClient, AppSettings]) -> None:
    client, _ = client_and_settings

    first = client.post("/api/files", files={"file": ("dup.txt", b"first", "text/plain")})
    second = client.post("/api/files", files={"file": ("dup.txt", b"second", "text/plain")})

    assert first.status_code == 201
    assert second.status_code == 409


def test_upload_over_limit_returns_413_and_no_partial(client_and_settings: tuple[TestClient, AppSettings]) -> None:
    client, settings = client_and_settings
    oversized = b"a" * (settings.max_upload_bytes + 1)

    response = client.post("/api/files", files={"file": ("large.bin", oversized, "application/octet-stream")})

    assert response.status_code == 413
    assert not any(path.suffix == ".part" for path in settings.files_root.iterdir())
    assert not (settings.files_root / "large.bin").exists()


def test_list_sorted_by_modified_desc(client_and_settings: tuple[TestClient, AppSettings]) -> None:
    client, settings = client_and_settings

    older = settings.files_root / "older.txt"
    newer = settings.files_root / "newer.txt"
    older.write_text("old", encoding="utf-8")
    newer.write_text("new", encoding="utf-8")

    os.utime(older, (1_600_000_000, 1_600_000_000))
    os.utime(newer, (1_700_000_000, 1_700_000_000))

    response = client.get("/api/files")

    assert response.status_code == 200
    names = [item["name"] for item in response.json()["items"]]
    assert names == ["newer.txt", "older.txt"]


def test_gitkeep_hidden_from_list(client_and_settings: tuple[TestClient, AppSettings]) -> None:
    client, settings = client_and_settings

    (settings.files_root / ".gitkeep").write_text("", encoding="utf-8")
    (settings.files_root / "visible.txt").write_text("content", encoding="utf-8")

    response = client.get("/api/files")

    assert response.status_code == 200
    names = [item["name"] for item in response.json()["items"]]
    assert ".gitkeep" not in names
    assert "visible.txt" in names


def test_download_returns_exact_bytes(client_and_settings: tuple[TestClient, AppSettings]) -> None:
    client, _ = client_and_settings

    upload = client.post("/api/files", files={"file": ("data.bin", b"abc123", "application/octet-stream")})
    download = client.get("/api/files/data.bin")

    assert upload.status_code == 201
    assert download.status_code == 200
    assert download.content == b"abc123"


def test_content_endpoint_returns_inline_bytes_and_media_type(client_and_settings: tuple[TestClient, AppSettings]) -> None:
    client, _ = client_and_settings

    upload = client.post("/api/files", files={"file": ("guide.pdf", b"%PDF-1.5", "application/pdf")})
    preview = client.get("/api/files/guide.pdf/content")

    assert upload.status_code == 201
    assert preview.status_code == 200
    assert preview.content == b"%PDF-1.5"
    assert preview.headers["content-type"].startswith("application/pdf")
    assert preview.headers["content-disposition"].startswith("inline")


def test_rename_success(client_and_settings: tuple[TestClient, AppSettings]) -> None:
    client, settings = client_and_settings

    upload = client.post("/api/files", files={"file": ("a.txt", b"payload", "text/plain")})
    rename = client.patch("/api/files/a.txt", json={"new_name": "b.txt"})

    assert upload.status_code == 201
    assert rename.status_code == 200
    assert rename.json()["name"] == "b.txt"
    assert not (settings.files_root / "a.txt").exists()
    assert (settings.files_root / "b.txt").exists()


def test_rename_conflict_returns_409(client_and_settings: tuple[TestClient, AppSettings]) -> None:
    client, _ = client_and_settings

    client.post("/api/files", files={"file": ("a.txt", b"1", "text/plain")})
    client.post("/api/files", files={"file": ("b.txt", b"2", "text/plain")})

    response = client.patch("/api/files/a.txt", json={"new_name": "b.txt"})

    assert response.status_code == 409


def test_delete_success(client_and_settings: tuple[TestClient, AppSettings]) -> None:
    client, settings = client_and_settings

    client.post("/api/files", files={"file": ("gone.txt", b"remove", "text/plain")})
    response = client.delete("/api/files/gone.txt")

    assert response.status_code == 204
    assert not (settings.files_root / "gone.txt").exists()


def test_invalid_filename_patterns_return_422(client_and_settings: tuple[TestClient, AppSettings]) -> None:
    client, _ = client_and_settings

    upload = client.post("/api/files", files={"file": ("../bad.txt", b"bad", "text/plain")})
    rename = client.patch("/api/files/good.txt", json={"new_name": "../oops.txt"})

    assert upload.status_code == 422
    assert rename.status_code == 422
