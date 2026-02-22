from __future__ import annotations

from datetime import datetime, timezone
import mimetypes

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile, status
from fastapi.responses import FileResponse

from app.config import AppSettings
from app.schemas import FileItem, FileListResponse, RenameRequest
from app.storage import (
    FileConflictError,
    FileMissingError,
    InvalidFilenameError,
    StorageBackend,
    StorageError,
    UploadTooLargeError,
)

router = APIRouter(prefix="/api/files", tags=["files"])


def get_storage(request: Request) -> StorageBackend:
    return request.app.state.storage


def get_settings(request: Request) -> AppSettings:
    return request.app.state.settings


def _raise_http_for_storage_error(exc: StorageError) -> None:
    if isinstance(exc, InvalidFilenameError):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc

    if isinstance(exc, FileMissingError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    if isinstance(exc, FileConflictError):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    if isinstance(exc, UploadTooLargeError):
        raise HTTPException(status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail=str(exc)) from exc

    raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Storage operation failed") from exc


@router.get("", response_model=FileListResponse)
def list_files(storage: StorageBackend = Depends(get_storage)) -> FileListResponse:
    try:
        items = storage.list_files()
    except StorageError as exc:
        _raise_http_for_storage_error(exc)

    return FileListResponse(items=items, cached_at=datetime.now(timezone.utc))


@router.post("", response_model=FileItem, status_code=status.HTTP_201_CREATED)
def upload_file(
    file: UploadFile = File(...),
    storage: StorageBackend = Depends(get_storage),
    settings: AppSettings = Depends(get_settings),
) -> FileItem:
    try:
        return storage.save_upload(file, max_bytes=settings.max_upload_bytes)
    except StorageError as exc:
        _raise_http_for_storage_error(exc)
    finally:
        file.file.close()


@router.get("/{name}/content")
def view_file_content(name: str, storage: StorageBackend = Depends(get_storage)) -> FileResponse:
    try:
        path = storage.open_for_download(name)
    except StorageError as exc:
        _raise_http_for_storage_error(exc)

    media_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return FileResponse(
        path=path,
        filename=path.name,
        media_type=media_type,
        content_disposition_type="inline",
    )


@router.get("/{name}")
def download_file(name: str, storage: StorageBackend = Depends(get_storage)) -> FileResponse:
    try:
        path = storage.open_for_download(name)
    except StorageError as exc:
        _raise_http_for_storage_error(exc)

    return FileResponse(path=path, filename=path.name, media_type="application/octet-stream")


@router.patch("/{name}", response_model=FileItem)
def rename_file(
    name: str,
    payload: RenameRequest,
    storage: StorageBackend = Depends(get_storage),
) -> FileItem:
    try:
        return storage.rename(name, payload.new_name)
    except StorageError as exc:
        _raise_http_for_storage_error(exc)


@router.delete("/{name}", status_code=status.HTTP_204_NO_CONTENT)
def delete_file(name: str, storage: StorageBackend = Depends(get_storage)) -> Response:
    try:
        storage.delete(name)
    except StorageError as exc:
        _raise_http_for_storage_error(exc)

    return Response(status_code=status.HTTP_204_NO_CONTENT)
