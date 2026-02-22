# FileFlash

<div align="center">

**Fast LAN file sharing with offline-capable PWA and real-time sync**

[![Python 3.13+](https://img.shields.io/badge/Python-3.13%2B-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.129%2B-009688.svg)](https://fastapi.tiangolo.com/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

## 🚀 Overview

FileFlash is a lightweight, high-performance file-sharing application optimized for local area networks (LANs). It provides a modern, responsive web interface for managing shared files with a focus on simplicity, speed, and offline capability.

Perfect for home networks, office LANs, workgroups, and edge computing scenarios where you need quick, authenticated-free file sharing on the same network.

---

## ✨ Features

### Core File Operations
- **Upload Files** with real-time progress tracking and drag-and-drop support
- **Download Files** with automatic content-type detection
- **Rename Files** with inline editing
- **Delete Files** with safety confirmation
- **List Files** sorted by modification date (newest first)
- **File Metadata** including size and last modified timestamp

### User Interface
- **Responsive Design** - Works seamlessly on desktop, tablet, and mobile
- **Dual View Modes** - Table view on desktop, card view on mobile
- **Real-time Upload Progress** - Visual feedback with percentage and file name
- **Empty State** - Clean, intuitive UI when no files exist
- **Toast Notifications** - Non-intrusive status messages
- **Dark/Light Mode Support** - Via system preferences
- **Icons & Branding** - Professional FileFlash logo and styling

### Progressive Web App (PWA)
- **Offline Support** - App shell caches core assets for offline browsing
- **Web App Manifest** - Installable as standalone app on phones/tablets
- **Service Worker** - Smart caching strategy with network-first data fetching
- **Background Sync Queue** - Queue operations (upload, rename, delete) when offline
- **Automatic Sync** - Polls every 15 seconds to sync queued operations when reconnected
- **Offline Indicators** - Clear visual badges showing online/offline status and pending sync items

### Media Viewing
- **Image Gallery** - View JPG, PNG, GIF, WebP, AVIF, SVG with PhotoSwipe lightbox
- **Video Player** - Stream MP4, WebM, MOV, OGV with Plyr player
- **Audio Player** - Play MP3, WAV, OGG, M4A, FLAC with Plyr player
- **PDF Viewer** - View PDF files with page navigation (previous/next)
- **Inline Previews** - View media without downloading (uses content-disposition: inline)

### Performance & Storage
- **Minimal Dependencies** - Only FastAPI, uvicorn, and python-multipart
- **Chunked Uploads** - Configurable chunk size (default: 1MB) for reliable large file handling
- **Atomic File Operations** - Temporary files prevent partial uploads on errors
- **Efficient List Operations** - Direct filesystem scanning with minimal overhead
- **Lightweight Frontend** - Vanilla JavaScript, no frameworks (bundles Tailwind CSS and CDN resources)

### Security & Validation
- **Filename Validation** - Prevents directory traversal and null bytes
- **Upload Size Limits** - Configurable max file size (default: 512MB)
- **Conflict Detection** - Prevents overwriting files during upload or rename
- **Temporary File Cleanup** - Removes incomplete uploads on error
- **Content-Type Detection** - Automatic MIME type detection for downloads

### Configuration & Deployment
- **Environment Configuration** - All settings via environment variables
- **Docker Support** - Multi-stage Dockerfile with uv for fast builds
- **Docker Compose** - Ready-to-use production setup with persistent volumes
- **Health Check** - `/healthz` endpoint for monitoring
- **Optional API Docs** - Swagger docs (disabled by default for security)
- **Configurable Paths** - Point to any filesystem location for shared files

---

## 📋 Requirements

- **Python 3.13+** (for local mode)
- **[uv](https://github.com/astral-sh/uv)** - Fast, modern Python package manager

### Minimal Footprint
- No database required
- No external authentication service
- Works standalone or behind reverse proxy

---

## 🚀 Quick Start

Choose one of three ways to run FileFlash:

### Mode 1: Locally with Python + uv

Perfect for development and testing.

```bash
# Clone the repository
git clone https://github.com/ketan-16/fileflash.git
cd fileflash

# Install dependencies with uv
uv sync

# Run the development server
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Open [http://localhost:8000](http://localhost:8000) in your browser.

### Mode 2: Build & Run Your Own Docker Image

For custom deployments and self-hosted setups.

```bash
# Clone the repository
git clone https://github.com/ketan-16/fileflash.git
cd fileflash

# Build the image
docker build -t fileflash .

# Run with volume mount for persistent storage
docker run -d \
  -p 8000:8000 \
  -v /path/to/files:/app/data/files \
  --name fileflash \
  fileflash
```

Optionally use `docker-compose.yml` for a simpler setup:
```bash
docker-compose up -d
```

### Mode 3: Use Pre-Built Docker Image

Fastest way to get started — no building required.

```bash
# Pull the latest image from Docker Hub
docker pull ketan16/fileflash

# Run the container
docker run -d \
  -p 8000:8000 \
  -v /path/to/files:/app/data/files \
  --name fileflash \
  ketan16/fileflash
```

All modes will serve the app at `http://localhost:8000` with persistent file storage.

---

## ⚙️ Configuration

All settings are controlled via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `FILES_ROOT` | `/Users/ketanyadav/Desktop/Projects/fileflash/data/files` | Directory to store uploaded files |
| `MAX_UPLOAD_MB` | `512` | Maximum file size in megabytes |
| `CHUNK_SIZE_BYTES` | `1048576` (1MB) | Upload chunk size in bytes for streaming |
| `ENABLE_DOCS` | `false` | Enable Swagger API documentation at `/docs` |

### Example Configuration

```bash
# Larger upload limit, custom storage
export FILES_ROOT=/mnt/shared-files
export MAX_UPLOAD_MB=2048
export CHUNK_SIZE_BYTES=5242880  # 5MB chunks
export ENABLE_DOCS=true

uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

---

## 📡 API Reference

### Health Check
```http
GET /healthz
```
Returns `{"status": "ok"}` for monitoring and load balancer health checks.

### List Files
```http
GET /api/files
```
Returns all files in storage with metadata:
```json
{
  "items": [
    {
      "name": "document.pdf",
      "size": 1048576,
      "modified_at": "2026-02-22T10:30:00+00:00"
    }
  ],
  "cached_at": "2026-02-22T10:35:00+00:00"
}
```

### Upload File
```http
POST /api/files
Content-Type: multipart/form-data

file=<binary data>
```
Returns `201 Created` with file metadata:
```json
{
  "name": "newfile.txt",
  "size": 12345,
  "modified_at": "2026-02-22T10:35:00+00:00"
}
```

**Error Responses:**
- `409 Conflict` - File already exists
- `413 Payload Too Large` - Exceeds MAX_UPLOAD_MB limit
- `422 Unprocessable Entity` - Invalid filename

### Download File
```http
GET /api/files/{name}
```
Downloads file as attachment (forces download dialog).

### View File Content (Inline)
```http
GET /api/files/{name}/content
```
Returns file with inline content-disposition. Useful for viewing images, PDFs, and videos directly in the browser.

### Rename File
```http
PATCH /api/files/{name}
Content-Type: application/json

{"new_name": "newname.txt"}
```
Returns `200 OK` with updated file metadata.

**Error Responses:**
- `404 Not Found` - Source file not found
- `409 Conflict` - Destination file already exists
- `422 Unprocessable Entity` - Invalid filename

### Delete File
```http
DELETE /api/files/{name}
```
Returns `204 No Content` on success.

**Error Responses:**
- `404 Not Found` - File not found

---

## 🧪 Testing

Run the test suite:

```bash
# Install dev dependencies and run tests
uv run --group dev pytest

# With verbose output
uv run --group dev pytest -v

# Run specific test file
uv run --group dev pytest tests/test_api.py
```

### Test Coverage
- Upload success and duplicate detection
- File size limit enforcement
- Listing with proper sorting
- Download exact bytes retrieval
- Rename and delete operations
- Filename validation
- Content-type detection

---

## 🏗️ Architecture

### Backend (Python/FastAPI)
- **Lightweight Framework** - Minimal overhead, excellent for LAN scenarios
- **Dependency Injection** - Clean, testable API endpoint handlers
- **Type Hints** - Full PEP 585 type annotations for IDE support
- **Local File Storage** - Direct filesystem operations with atomic moves

### Frontend (Vanilla JavaScript + Tailwind CSS)
- **Zero Build Step Required** - Load Tailwind via CDN, ship JavaScript as-is
- **Service Worker** - Offline caching and resource management
- **IndexedDB** - Persistent offline queue for operations
- **Responsive CSS** - Mobile-first design with Tailwind utilities
- **External Libraries** - PhotoSwipe (images), Plyr (video/audio), PDF.js (PDFs)

### File Organization
```
fileflash/
├── app/
│   ├── __init__.py
│   ├── main.py          # FastAPI app creation, routes setup
│   ├── api.py           # RESTful endpoints
│   ├── config.py        # Environment configuration
│   ├── schemas.py       # Pydantic models
│   └── storage.py       # File storage backend
├── static/
│   ├── index.html       # Main PWA shell
│   ├── app.js           # Frontend logic, API client
│   ├── sw.js            # Service worker
│   ├── manifest.webmanifest  # PWA manifest
│   └── icons/           # App icons
├── tests/
│   ├── test_api.py      # API endpoint tests
│   └── test_web.py      # Web integration tests
├── data/files/          # Default file storage
├── Dockerfile           # Container image
├── docker-compose.yml   # Production deployment
├── pyproject.toml       # Python dependencies
└── README.md            # This file
```

---

## 🔒 Security Notes

### Design Philosophy
FileFlash is **intentionally unauthenticated** and designed for **trusted local networks only**. There is no built-in authentication, authorization, or encryption.

### ⚠️ DO NOT
- Expose directly to the public internet without a reverse proxy and authentication layer
- Use in untrusted networks without additional security measures
- Store sensitive or confidential files without network-level security

### ✅ DO
- Use on private LANs (home networks, office networks)
- Deploy behind a VPN or private network boundary
- Use with organizations that trust internal networks
- Add authentication via reverse proxy (nginx, Caddy, Traefik) if needed

### Implemented Safeguards
- **Filename Validation** - Blocks directory traversal attempts
- **Size Limits** - Prevents disk exhaustion
- **Atomic Operations** - No partial file writes on failure
- **Temp File Cleanup** - Removes incomplete uploads

---

## 🎯 Use Cases

**Home Networks**
- Share files between family computers
- Media server for photos, videos, documents
- Backup and recovery playground

**Office LAN**
- Team file sharing without external cloud
- Quick file exchange in workgroups
- Temporary file hosting for presentations

**Lab & Development**
- Edge computing file distribution
- Docker image/artifact sharing
- Build artifact repository

**IoT & Embedded**
- File management on Raspberry Pi or similar
- Remote device configuration uploads
- Local data collection and retrieval

---

## 🛠️ Development

### Project Setup

```bash
# Clone and enter directory
git clone <repo>
cd fileflash

# Create virtual environment with uv
uv sync

# Activate environment
source .venv/bin/activate
```

### Running Examples

```bash
# Development with auto-reload
uv run uvicorn app.main:app --reload

# With Swagger docs enabled
ENABLE_DOCS=true uv run uvicorn app.main:app --reload

# Custom file root
FILES_ROOT=/tmp/files uv run uvicorn app.main:app --reload

# Production (no reload, optimized)
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

### Code Quality

The project uses:
- **Type Hints** - Comprehensive type annotations (tested with Pylance)
- **Validation** - Pydantic models for request/response validation
- **Unit Tests** - pytest for API and storage logic
- **Error Handling** - Custom exception hierarchy for clear error messages

---

## 📦 Dependencies

### Core
- **fastapi** ~0.129.2 - Web framework
- **uvicorn** ~0.41.0 - ASGI server
- **python-multipart** ~0.0.20 - Multipart form handling

### Development (Optional)
- **pytest** ~8.4.2 - Testing framework
- **httpx** ~0.28.1 - Async HTTP client for tests

The entire stack is minimal by design—only 3 production dependencies!

---

## 📈 Performance

- **Startup Time** - <1 second on modern hardware
- **List Speed** - O(n) filesystem scan, typically <50ms for 10k files
- **Upload Speed** - Limited by network and disk I/O, handles gigabit LANs efficiently
- **Memory Usage** - <50MB baseline, scales with concurrent operations

---

## 🐛 Troubleshooting

### "Permission denied" on data/files
```bash
# Ensure directory is writable
chmod 755 data/files
```

### Service worker not updating
```javascript
// Force service worker refresh in browser console
navigator.serviceWorker.getRegistrations().then(regs => 
  regs.forEach(reg => reg.unregister())
);
```

### Upload fails over LAN
- Check firewall rules allow port 8000 (or configured port)
- Ensure MAX_UPLOAD_MB is set appropriately
- Verify disk space on FILES_ROOT

### Docker permission issues
```bash
# Run with user ID matching your user
docker run --user $(id -u):$(id -g) -v /path/to/files:/app/data/files fileflash
```

---

## 📄 License

This project is licensed under the MIT License. See LICENSE file for details.

---

## 🤝 Contributing

Contributions are welcome! Areas for enhancement:
- Additional media viewer integrations
- Search/filter functionality
- File organization (folders/tags)
- Advanced offline sync strategies
- i18n support
- Rate limiting and request throttling

Please open an issue or submit a pull request.

---

## 📞 Support

For bugs, feature requests, or questions:
1. Check existing [GitHub Issues](https://github.com/ketan-16/fileflash/issues)
2. Create a new issue with detailed description
3. Include your OS, Python version, and reproduction steps

---

## ⚡ Quick Tips

**Mobile Installation**
1. Open FileFlash in mobile browser
2. Tap "Share" → "Add to Home Screen" (iOS) or tap menu → "Install app" (Android)
3. App works offline with queued sync on reconnect

**Network Discovery**
- Use your computer's IP (e.g., `192.168.1.100:8000`) to access from mobile devices
- Find your IP: `hostname -I` (Linux/Mac) or `ipconfig` (Windows)

**Reverse Proxy** (for authentication/SSL)
```nginx
location /files {
    proxy_pass http://localhost:8000;
    auth_basic "Restricted";
    auth_basic_user_file /etc/nginx/.htpasswd;
}
```

---

**Built with ❤️ for fast, simple file sharing on local networks.**
