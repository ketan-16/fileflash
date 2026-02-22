from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class FileItem(BaseModel):
    name: str
    size: int
    modified_at: datetime


class FileListResponse(BaseModel):
    items: list[FileItem]
    cached_at: datetime


class RenameRequest(BaseModel):
    new_name: str = Field(min_length=1, max_length=255)
