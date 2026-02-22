from __future__ import annotations

from datetime import datetime, timezone
import os
from pathlib import Path, PurePath
from typing import Protocol
from uuid import uuid4

from fastapi import UploadFile

from app.schemas import FileItem


class StorageError(Exception):
    pass


class InvalidFilenameError(StorageError):
    pass


class FileConflictError(StorageError):
    pass


class FileMissingError(StorageError):
    pass


class UploadTooLargeError(StorageError):
    def __init__(self, limit_bytes: int) -> None:
        self.limit_bytes = limit_bytes
        super().__init__(f"Upload exceeds {limit_bytes} bytes")


class StorageBackend(Protocol):
    def list_files(self) -> list[FileItem]: ...

    def save_upload(self, upload_file: UploadFile, max_bytes: int) -> FileItem: ...

    def open_for_download(self, name: str) -> Path: ...

    def rename(self, old_name: str, new_name: str) -> FileItem: ...

    def delete(self, name: str) -> None: ...


def validate_filename(name: str) -> str:
    if not name or not name.strip():
        raise InvalidFilenameError("Filename cannot be empty")

    if "\x00" in name:
        raise InvalidFilenameError("Filename contains invalid characters")

    if "/" in name or "\\" in name:
        raise InvalidFilenameError("Nested paths are not allowed")

    if name in {".", ".."} or PurePath(name).name != name:
        raise InvalidFilenameError("Invalid filename")

    return name


class LocalFileStorage:
    def __init__(self, root: Path, *, chunk_size_bytes: int = 1024 * 1024) -> None:
        self.root = root
        self.chunk_size_bytes = chunk_size_bytes
        self.root.mkdir(parents=True, exist_ok=True)

    def _path_for(self, name: str) -> Path:
        return self.root / validate_filename(name)

    @staticmethod
    def _to_file_item(path: Path) -> FileItem:
        stat = path.stat()
        return FileItem(
            name=path.name,
            size=stat.st_size,
            modified_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
        )

    def list_files(self) -> list[FileItem]:
        items: list[FileItem] = []
        with os.scandir(self.root) as entries:
            for entry in entries:
                if not entry.is_file():
                    continue
                if entry.name == ".gitkeep":
                    continue

                stat = entry.stat()
                modified_at = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
                items.append(FileItem(name=entry.name, size=stat.st_size, modified_at=modified_at))

        items.sort(key=lambda item: item.modified_at, reverse=True)
        return items

    def save_upload(self, upload_file: UploadFile, max_bytes: int) -> FileItem:
        filename = validate_filename(upload_file.filename or "")
        destination = self._path_for(filename)

        if destination.exists():
            raise FileConflictError(f"File '{filename}' already exists")

        temp_file = self.root / f".{filename}.{uuid4().hex}.part"
        written = 0

        try:
            with temp_file.open("wb") as stream:
                while True:
                    chunk = upload_file.file.read(self.chunk_size_bytes)
                    if not chunk:
                        break

                    written += len(chunk)
                    if written > max_bytes:
                        raise UploadTooLargeError(max_bytes)

                    stream.write(chunk)

            if destination.exists():
                raise FileConflictError(f"File '{filename}' already exists")

            # Move temp file into place only after size checks finish.
            os.replace(temp_file, destination)
        except StorageError:
            if temp_file.exists():
                temp_file.unlink(missing_ok=True)
            raise
        except Exception as exc:  # pragma: no cover - defensive mapping
            if temp_file.exists():
                temp_file.unlink(missing_ok=True)
            raise StorageError(str(exc)) from exc

        return self._to_file_item(destination)

    def open_for_download(self, name: str) -> Path:
        path = self._path_for(name)
        if not path.is_file():
            raise FileMissingError(f"File '{name}' not found")
        return path

    def rename(self, old_name: str, new_name: str) -> FileItem:
        old_path = self._path_for(old_name)
        new_path = self._path_for(new_name)

        if not old_path.exists():
            raise FileMissingError(f"File '{old_name}' not found")

        if old_path.name == new_path.name:
            return self._to_file_item(old_path)

        if new_path.exists():
            raise FileConflictError(f"File '{new_name}' already exists")

        old_path.rename(new_path)
        return self._to_file_item(new_path)

    def delete(self, name: str) -> None:
        path = self._path_for(name)
        if not path.exists():
            raise FileMissingError(f"File '{name}' not found")

        path.unlink()
