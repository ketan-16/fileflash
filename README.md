# FileFlash

Compact, high-performance shared-drive web app built with FastAPI.

## Features

- Flat shared file storage (LAN-focused)
- Upload, list, download, rename, and delete APIs
- Real-time upload progress for direct online uploads
- FastAPI-served responsive frontend with Tailwind CSS
- Progressive Web App support (manifest + service worker)
- Offline queue-and-replay for upload, rename, and delete
- In-app multimedia viewing (image, video, audio, PDF)
- Minimal dependency footprint

## Security

This app is intentionally **unauthenticated** for trusted local networks only.
Do not expose it directly to the public internet.

## Requirements

- Python 3.13+
- [uv](https://github.com/astral-sh/uv) (recommended)

## Run

```bash
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Open [http://localhost:8000](http://localhost:8000).

## Configuration

Environment variables:

- `FILES_ROOT` (default: `/Users/ketanyadav/Desktop/Projects/file-share/data/files`)
- `MAX_UPLOAD_MB` (default: `512`)
- `CHUNK_SIZE_BYTES` (default: `1048576`)
- `ENABLE_DOCS` (default: `false`)

## API Summary

- `GET /healthz`
- `GET /api/files`
- `POST /api/files` (`multipart/form-data`, field: `file`)
- `GET /api/files/{name}`
- `GET /api/files/{name}/content` (inline content for previews)
- `PATCH /api/files/{name}` (`{"new_name": "..."}`)
- `DELETE /api/files/{name}`

## Test

```bash
uv run --group dev pytest
```
