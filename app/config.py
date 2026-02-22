from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import os

DEFAULT_FILES_ROOT = Path("/Users/ketanyadav/Desktop/Projects/file-share/data/files")


@dataclass(frozen=True, slots=True)
class AppSettings:
    files_root: Path = DEFAULT_FILES_ROOT
    max_upload_mb: int = 512
    chunk_size_bytes: int = 1024 * 1024
    enable_docs: bool = False

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


def _parse_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default

    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return default


def _parse_int(value: str | None, default: int, *, minimum: int = 1) -> int:
    if value is None:
        return default

    try:
        parsed = int(value)
    except ValueError:
        return default

    return parsed if parsed >= minimum else default


def load_settings() -> AppSettings:
    files_root = Path(os.getenv("FILES_ROOT", str(DEFAULT_FILES_ROOT))).expanduser().resolve()
    max_upload_mb = _parse_int(os.getenv("MAX_UPLOAD_MB"), 512, minimum=1)
    chunk_size_bytes = _parse_int(os.getenv("CHUNK_SIZE_BYTES"), 1024 * 1024, minimum=1024)
    enable_docs = _parse_bool(os.getenv("ENABLE_DOCS"), False)

    return AppSettings(
        files_root=files_root,
        max_upload_mb=max_upload_mb,
        chunk_size_bytes=chunk_size_bytes,
        enable_docs=enable_docs,
    )
