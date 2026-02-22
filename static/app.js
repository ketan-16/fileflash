const API_BASE = "/api/files";
const CACHE_KEY = "file_share_cached_list";
const DB_NAME = "file_share_db";
const DB_VERSION = 1;
const QUEUE_STORE = "file_share_queue";
const SYNC_POLL_MS = 15000;
const OFFLINE_PREVIEW_MESSAGE = "Preview unavailable offline yet. Reconnect once to load viewer assets.";

const PHOTO_SWIPE_CSS = "https://cdn.jsdelivr.net/npm/photoswipe@5.4.4/dist/photoswipe.css";
const PHOTO_SWIPE_ESM = "https://cdn.jsdelivr.net/npm/photoswipe@5.4.4/dist/photoswipe.esm.js";
const PLYR_CSS = "https://cdn.jsdelivr.net/npm/plyr@3.7.8/dist/plyr.css";
const PLYR_JS = "https://cdn.jsdelivr.net/npm/plyr@3.7.8/dist/plyr.polyfilled.min.js";
const PDF_JS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDF_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "avif", "svg"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "ogv"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "ogg", "m4a", "flac"]);
const PDF_EXTENSIONS = new Set(["pdf"]);

const state = {
  files: [],
  stale: false,
  syncing: false,
  upload: {
    active: false,
    percent: 0,
    filename: "",
    status: "",
    indeterminate: false,
  },
  preview: {
    player: null,
    pdfDoc: null,
    pdfPage: 1,
    pdfTotalPages: 1,
  },
};

const elements = {
  connectionBadge: document.getElementById("connectionBadge"),
  queueBadge: document.getElementById("queueBadge"),
  offlineBanner: document.getElementById("offlineBanner"),
  staleBadge: document.getElementById("staleBadge"),
  uploadForm: document.getElementById("uploadForm"),
  fileInput: document.getElementById("fileInput"),
  uploadButton: document.getElementById("uploadButton"),
  uploadProgress: document.getElementById("uploadProgress"),
  uploadProgressBar: document.getElementById("uploadProgressBar"),
  uploadProgressPercent: document.getElementById("uploadProgressPercent"),
  uploadProgressLabel: document.getElementById("uploadProgressLabel"),
  refreshButton: document.getElementById("refreshButton"),
  fileTableBody: document.getElementById("fileTableBody"),
  fileCardList: document.getElementById("fileCardList"),
  emptyState: document.getElementById("emptyState"),
  renameModal: document.getElementById("renameModal"),
  renameForm: document.getElementById("renameForm"),
  renameCurrent: document.getElementById("renameCurrent"),
  renameInput: document.getElementById("renameInput"),
  renameCancel: document.getElementById("renameCancel"),
  previewModal: document.getElementById("previewModal"),
  previewFilename: document.getElementById("previewFilename"),
  previewBody: document.getElementById("previewBody"),
  previewClose: document.getElementById("previewClose"),
  previewPdfControls: document.getElementById("previewPdfControls"),
  previewPdfPrev: document.getElementById("previewPdfPrev"),
  previewPdfPage: document.getElementById("previewPdfPage"),
  previewPdfNext: document.getElementById("previewPdfNext"),
  toast: document.getElementById("toast"),
};

const loadedCss = new Set();
const loadedScripts = new Map();
const loadedModules = new Map();

let syncTimer = null;

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.remove("hidden");
  setTimeout(() => elements.toast.classList.add("hidden"), 2200);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function setConnectivityUI() {
  const online = navigator.onLine;
  elements.connectionBadge.textContent = online ? "Online" : "Offline";
  elements.connectionBadge.className = online
    ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700"
    : "rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700";
  elements.offlineBanner.classList.toggle("hidden", online);
}

function setStaleUI(isStale) {
  elements.staleBadge.classList.toggle("hidden", !isStale);
}

function updateUploadProgress(partial) {
  state.upload = {
    ...state.upload,
    ...partial,
  };

  const { active, percent, filename, status, indeterminate } = state.upload;
  elements.uploadProgress.classList.toggle("hidden", !active);
  elements.uploadButton.disabled = active;
  elements.fileInput.disabled = active;

  if (!active) {
    elements.uploadProgressBar.classList.remove("animate-pulse");
    elements.uploadProgressBar.style.width = "0%";
    elements.uploadProgressPercent.textContent = "0%";
    elements.uploadProgressLabel.textContent = "Uploading...";
    return;
  }

  elements.uploadProgressLabel.textContent = status ? `${status}: ${filename}` : filename;

  if (indeterminate) {
    elements.uploadProgressBar.classList.add("animate-pulse");
    elements.uploadProgressBar.style.width = "100%";
    elements.uploadProgressPercent.textContent = "...";
    return;
  }

  elements.uploadProgressBar.classList.remove("animate-pulse");
  elements.uploadProgressBar.style.width = `${Math.max(0, Math.min(percent, 100))}%`;
  elements.uploadProgressPercent.textContent = `${Math.round(percent)}%`;
}

function resetUploadProgress() {
  updateUploadProgress({
    active: false,
    percent: 0,
    filename: "",
    status: "",
    indeterminate: false,
  });
}

function saveCachedList(items) {
  const payload = {
    cachedAt: new Date().toISOString(),
    items,
  };
  localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
}

function loadCachedList() {
  const raw = localStorage.getItem(CACHE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.items)) return null;
    return parsed.items;
  } catch {
    return null;
  }
}

function extensionFor(name) {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() : "";
}

function mediaTypeFor(name) {
  const ext = extensionFor(name);

  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (AUDIO_EXTENSIONS.has(ext)) return "audio";
  if (PDF_EXTENSIONS.has(ext)) return "pdf";
  return null;
}

function previewUrlFor(name) {
  return `${API_BASE}/${encodeURIComponent(name)}/content`;
}

function actionButton({ action, name, label, danger = false, disabled = false }) {
  const border = danger ? "border-rose-200" : "border-slate-300";
  const color = danger ? "text-rose-700" : "text-slate-700";
  const hover = danger ? "hover:bg-rose-50" : "hover:bg-slate-50";
  const encodedName = encodeURIComponent(name);

  return `<button data-action="${action}" data-name="${encodedName}" class="rounded-md border ${border} px-3 py-1.5 text-xs font-medium ${color} ${disabled ? "pointer-events-none opacity-50" : hover}">${label}</button>`;
}

function renderFiles() {
  const rows = state.files
    .map((file) => {
      const encoded = encodeURIComponent(file.name);
      const pendingBadge = file.pending
        ? '<span class="ml-2 rounded bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700">Queued</span>'
        : "";
      const mediaType = mediaTypeFor(file.name);
      const downloadDisabled = !navigator.onLine || file.pending;
      const viewDisabled = !navigator.onLine || file.pending;

      const actions = [
        mediaType
          ? actionButton({ action: "view", name: file.name, label: "View", disabled: viewDisabled })
          : "",
        `<a href="${downloadDisabled ? "#" : `${API_BASE}/${encoded}` }" data-action="download" data-name="${encoded}" class="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 ${downloadDisabled ? "pointer-events-none opacity-50" : "hover:bg-slate-50"}">Download</a>`,
        actionButton({ action: "rename", name: file.name, label: "Rename" }),
        actionButton({ action: "delete", name: file.name, label: "Delete", danger: true }),
      ].filter(Boolean).join("");

      return `<tr>
          <td class="px-4 py-3 font-medium text-slate-800">${escapeHtml(file.name)}${pendingBadge}</td>
          <td class="px-4 py-3 text-slate-600">${formatBytes(file.size)}</td>
          <td class="px-4 py-3 text-slate-600">${formatDate(file.modified_at)}</td>
          <td class="px-4 py-3">
            <div class="flex items-center justify-end gap-2">
              ${actions}
            </div>
          </td>
        </tr>`;
    })
    .join("");

  const cards = state.files
    .map((file) => {
      const encoded = encodeURIComponent(file.name);
      const pendingBadge = file.pending
        ? '<span class="rounded bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700">Queued</span>'
        : "";
      const mediaType = mediaTypeFor(file.name);
      const downloadDisabled = !navigator.onLine || file.pending;
      const viewDisabled = !navigator.onLine || file.pending;

      const actions = [
        mediaType
          ? actionButton({ action: "view", name: file.name, label: "View", disabled: viewDisabled })
          : "",
        `<a href="${downloadDisabled ? "#" : `${API_BASE}/${encoded}` }" data-action="download" data-name="${encoded}" class="rounded-md border border-slate-300 px-2 py-1 text-center text-xs font-medium text-slate-700 ${downloadDisabled ? "pointer-events-none opacity-50" : "hover:bg-slate-50"}">Download</a>`,
        actionButton({ action: "rename", name: file.name, label: "Rename" }),
        actionButton({ action: "delete", name: file.name, label: "Delete", danger: true }),
      ].filter(Boolean).join("");

      return `<article class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div class="flex items-start justify-between gap-2">
            <h3 class="break-all text-sm font-medium text-slate-800">${escapeHtml(file.name)}</h3>
            ${pendingBadge}
          </div>
          <p class="mt-2 text-xs text-slate-600">${formatBytes(file.size)} • ${formatDate(file.modified_at)}</p>
          <div class="mt-3 grid ${mediaType ? "grid-cols-4" : "grid-cols-3"} gap-2">
            ${actions}
          </div>
        </article>`;
    })
    .join("");

  elements.fileTableBody.innerHTML = rows;
  elements.fileCardList.innerHTML = cards;
  elements.emptyState.classList.toggle("hidden", state.files.length > 0);
  setStaleUI(state.stale);
}

async function apiJson(url, options = {}) {
  const response = await fetch(url, options);
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    const message = payload?.detail || `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return payload;
}

async function loadFiles() {
  try {
    const payload = await apiJson(API_BASE, { cache: "no-store" });
    state.files = payload.items;
    state.stale = false;
    saveCachedList(payload.items);
  } catch (error) {
    const cached = loadCachedList();
    if (cached) {
      state.files = cached;
      state.stale = true;
      showToast("Loaded cached file list.");
    } else {
      state.files = [];
      state.stale = true;
      showToast(error.message);
    }
  }

  renderFiles();
}

function upsertPendingFile(file) {
  const existingIndex = state.files.findIndex((item) => item.name === file.name);
  const optimistic = {
    name: file.name,
    size: file.size,
    modified_at: new Date().toISOString(),
    pending: true,
  };

  if (existingIndex >= 0) {
    state.files[existingIndex] = optimistic;
  } else {
    state.files.unshift(optimistic);
  }
}

function applyOptimisticRename(currentName, newName) {
  const item = state.files.find((entry) => entry.name === currentName);
  if (!item) return;
  item.name = newName;
  item.modified_at = new Date().toISOString();
  item.pending = true;
}

function applyOptimisticDelete(name) {
  state.files = state.files.filter((entry) => entry.name !== name);
}

function normalizeQueueItem(item) {
  return {
    id: item.id,
    op: item.op,
    payload: item.payload,
    attempts: item.attempts ?? 0,
    next_retry_at: item.next_retry_at ?? 0,
    created_at: item.created_at ?? Date.now(),
    status: item.status ?? "pending",
    error: item.error ?? "",
  };
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: "id", autoIncrement: true });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, mode);
    const store = tx.objectStore(QUEUE_STORE);

    let settled = false;

    tx.oncomplete = () => {
      if (!settled) {
        settled = true;
        resolve(undefined);
      }
      db.close();
    };

    tx.onerror = () => {
      if (!settled) {
        settled = true;
        reject(tx.error);
      }
      db.close();
    };

    tx.onabort = () => {
      if (!settled) {
        settled = true;
        reject(tx.error || new Error("IndexedDB transaction aborted"));
      }
      db.close();
    };

    Promise.resolve(fn(store))
      .then((result) => {
        if (!settled && result !== undefined) {
          settled = true;
          resolve(result);
        }
      })
      .catch((error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      });
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function enqueue(item) {
  const prepared = normalizeQueueItem(item);
  await withStore("readwrite", (store) => requestToPromise(store.add(prepared)));
  await updateQueueBadge();
}

async function listQueueItems() {
  const rows = await withStore("readonly", (store) => requestToPromise(store.getAll()));
  return (rows || []).map(normalizeQueueItem).sort((a, b) => a.id - b.id);
}

async function updateQueueItem(item) {
  await withStore("readwrite", (store) => requestToPromise(store.put(normalizeQueueItem(item))));
}

async function removeQueueItem(id) {
  await withStore("readwrite", (store) => requestToPromise(store.delete(id)));
}

async function updateQueueBadge() {
  const items = await listQueueItems();
  const failed = items.filter((item) => item.status === "failed").length;
  const pending = items.length - failed;

  let label = `${pending} pending`;
  if (failed > 0) {
    label += `, ${failed} failed`;
  }

  elements.queueBadge.textContent = label;
  elements.queueBadge.className =
    failed > 0
      ? "rounded-full bg-rose-100 px-3 py-1 text-xs font-medium text-rose-700"
      : "rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700";
}

async function queueUpload(file) {
  await enqueue({
    op: "upload",
    payload: { name: file.name, file },
    attempts: 0,
    next_retry_at: Date.now(),
    created_at: Date.now(),
    status: "pending",
    error: "",
  });

  upsertPendingFile(file);
  renderFiles();
  showToast("Upload queued for sync.");
}

async function queueRename(name, newName) {
  await enqueue({
    op: "rename",
    payload: { name, new_name: newName },
    attempts: 0,
    next_retry_at: Date.now(),
    created_at: Date.now(),
    status: "pending",
    error: "",
  });

  applyOptimisticRename(name, newName);
  renderFiles();
  showToast("Rename queued for sync.");
}

async function queueDelete(name) {
  await enqueue({
    op: "delete",
    payload: { name },
    attempts: 0,
    next_retry_at: Date.now(),
    created_at: Date.now(),
    status: "pending",
    error: "",
  });

  applyOptimisticDelete(name);
  renderFiles();
  showToast("Delete queued for sync.");
}

function isNetworkError(error) {
  return error instanceof TypeError || error.message.includes("NetworkError") || error.message.includes("Failed to fetch");
}

function backoffMs(attempts) {
  const base = 2000;
  const cappedAttempts = Math.min(attempts, 6);
  return base * 2 ** cappedAttempts;
}

async function executeQueueItem(item) {
  if (item.op === "upload") {
    const form = new FormData();
    form.append("file", item.payload.file, item.payload.name);
    await apiJson(API_BASE, { method: "POST", body: form });
    return;
  }

  if (item.op === "rename") {
    await apiJson(`${API_BASE}/${encodeURIComponent(item.payload.name)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ new_name: item.payload.new_name }),
    });
    return;
  }

  if (item.op === "delete") {
    const response = await fetch(`${API_BASE}/${encodeURIComponent(item.payload.name)}`, {
      method: "DELETE",
    });

    if (response.status === 404) {
      return;
    }

    if (!response.ok) {
      const payload = response.headers.get("content-type")?.includes("application/json")
        ? await response.json()
        : null;
      const error = new Error(payload?.detail || `Delete failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
  }
}

async function processQueue() {
  if (state.syncing || !navigator.onLine) return;

  state.syncing = true;
  try {
    const items = await listQueueItems();
    const now = Date.now();

    for (const item of items) {
      if (item.status === "failed") {
        continue;
      }

      if (item.next_retry_at > now) {
        continue;
      }

      try {
        await executeQueueItem(item);
        await removeQueueItem(item.id);
      } catch (error) {
        if (error.status === 409) {
          item.status = "failed";
          item.error = error.message;
          await updateQueueItem(item);
          showToast(`Conflict while syncing ${item.op}: ${error.message}`);
          continue;
        }

        if (error.status && error.status >= 400 && error.status < 500) {
          item.status = "failed";
          item.error = error.message;
          await updateQueueItem(item);
          showToast(`Cannot sync ${item.op}: ${error.message}`);
          continue;
        }

        if (isNetworkError(error) || !error.status || error.status >= 500) {
          item.attempts += 1;
          item.next_retry_at = Date.now() + backoffMs(item.attempts);
          item.status = "pending";
          await updateQueueItem(item);
        }
      }
    }
  } finally {
    state.syncing = false;
    await updateQueueBadge();
  }
}

function scheduleSyncLoop() {
  if (syncTimer !== null) {
    clearInterval(syncTimer);
  }

  syncTimer = setInterval(async () => {
    const items = await listQueueItems();
    if (items.length === 0) return;
    await processQueue();
    await loadFiles();
  }, SYNC_POLL_MS);
}

function openRenameModal(name) {
  elements.renameCurrent.value = name;
  elements.renameInput.value = name;
  elements.renameModal.classList.remove("hidden");
  elements.renameModal.classList.add("flex");
  elements.renameInput.focus();
  elements.renameInput.select();
}

function closeRenameModal() {
  elements.renameModal.classList.add("hidden");
  elements.renameModal.classList.remove("flex");
  elements.renameForm.reset();
}

function clearPreviewContent() {
  if (state.preview.player) {
    state.preview.player.destroy();
    state.preview.player = null;
  }

  state.preview.pdfDoc = null;
  state.preview.pdfPage = 1;
  state.preview.pdfTotalPages = 1;
  elements.previewBody.innerHTML = "";
  elements.previewPdfControls.classList.add("hidden");
  elements.previewPdfControls.classList.remove("flex");
}

function openPreviewModal(filename) {
  clearPreviewContent();
  elements.previewFilename.textContent = filename;
  elements.previewModal.classList.remove("hidden");
  elements.previewModal.classList.add("flex");
}

function closePreviewModal() {
  elements.previewModal.classList.add("hidden");
  elements.previewModal.classList.remove("flex");
  clearPreviewContent();
}

function showPreviewMessage(message) {
  elements.previewBody.innerHTML = `<div class="flex min-h-64 items-center justify-center text-center text-sm text-slate-300">${escapeHtml(message)}</div>`;
}

function previewErrorMessage(error) {
  if (!navigator.onLine) {
    return OFFLINE_PREVIEW_MESSAGE;
  }

  return error.message || "Unable to open preview.";
}

function loadCss(href) {
  if (loadedCss.has(href)) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`link[data-lib-css=\"${href}\"]`);
    if (existing) {
      loadedCss.add(href);
      resolve();
      return;
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.libCss = href;
    link.onload = () => {
      loadedCss.add(href);
      resolve();
    };
    link.onerror = () => reject(new Error(`Failed to load stylesheet: ${href}`));
    document.head.appendChild(link);
  });
}

function loadScript(src) {
  if (loadedScripts.has(src)) {
    return loadedScripts.get(src);
  }

  const promise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-lib-src=\"${src}\"]`);
    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.libSrc = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });

  loadedScripts.set(src, promise);
  return promise;
}

function loadModule(src) {
  if (loadedModules.has(src)) {
    return loadedModules.get(src);
  }

  const promise = import(src);
  loadedModules.set(src, promise);
  return promise;
}

async function ensurePhotoSwipe() {
  await loadCss(PHOTO_SWIPE_CSS);
  const module = await loadModule(PHOTO_SWIPE_ESM);
  return module.default;
}

async function ensurePlyr() {
  await loadCss(PLYR_CSS);
  await loadScript(PLYR_JS);

  if (!window.Plyr) {
    throw new Error("Plyr did not load.");
  }

  return window.Plyr;
}

async function ensurePdfJs() {
  await loadScript(PDF_JS);

  if (!window.pdfjsLib) {
    throw new Error("PDF.js did not load.");
  }

  window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER;
  return window.pdfjsLib;
}

function imageSizeFromUrl(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.naturalWidth || 1600, height: image.naturalHeight || 900 });
    };
    image.onerror = () => reject(new Error("Unable to load image."));
    image.src = url;
  });
}

async function openImagePreview(name) {
  const source = previewUrlFor(name);
  const PhotoSwipe = await ensurePhotoSwipe();

  let size = { width: 1600, height: 900 };
  try {
    size = await imageSizeFromUrl(source);
  } catch {
    // Keep fallback dimensions so PhotoSwipe can still open.
  }

  const gallery = new PhotoSwipe({
    dataSource: [
      {
        src: source,
        width: size.width,
        height: size.height,
        alt: name,
      },
    ],
    bgOpacity: 0.9,
  });

  gallery.init();
}

async function openAudioVideoPreview(name, type) {
  openPreviewModal(name);
  showPreviewMessage("Loading preview...");

  const Plyr = await ensurePlyr();
  const media = document.createElement(type === "video" ? "video" : "audio");
  media.src = previewUrlFor(name);
  media.controls = true;
  media.className = type === "video"
    ? "mx-auto max-h-[68vh] w-full rounded-lg bg-black"
    : "mx-auto w-full max-w-2xl";

  if (type === "video") {
    media.setAttribute("playsinline", "playsinline");
  }

  elements.previewBody.innerHTML = "";
  elements.previewBody.appendChild(media);
  state.preview.player = new Plyr(media);
}

function updatePdfControls() {
  elements.previewPdfPage.textContent = `Page ${state.preview.pdfPage} / ${state.preview.pdfTotalPages}`;
  elements.previewPdfPrev.disabled = state.preview.pdfPage <= 1;
  elements.previewPdfNext.disabled = state.preview.pdfPage >= state.preview.pdfTotalPages;
  elements.previewPdfPrev.classList.toggle("opacity-50", elements.previewPdfPrev.disabled);
  elements.previewPdfNext.classList.toggle("opacity-50", elements.previewPdfNext.disabled);
}

async function renderPdfPage(pageNumber) {
  if (!state.preview.pdfDoc) return;

  const page = await state.preview.pdfDoc.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const bodyWidth = Math.max(elements.previewBody.clientWidth - 24, 480);
  const scale = Math.max(1, Math.min(2.0, bodyWidth / baseViewport.width));
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.className = "mx-auto max-w-full rounded-md border border-slate-700 bg-white";

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create PDF canvas context.");
  }

  elements.previewBody.innerHTML = "";
  elements.previewBody.appendChild(canvas);

  const task = page.render({ canvasContext: context, viewport });
  await task.promise;
  updatePdfControls();
}

async function openPdfPreview(name) {
  openPreviewModal(name);
  showPreviewMessage("Loading PDF preview...");

  const pdfjsLib = await ensurePdfJs();
  const task = pdfjsLib.getDocument(previewUrlFor(name));
  state.preview.pdfDoc = await task.promise;
  state.preview.pdfPage = 1;
  state.preview.pdfTotalPages = state.preview.pdfDoc.numPages;

  elements.previewPdfControls.classList.remove("hidden");
  elements.previewPdfControls.classList.add("flex");
  await renderPdfPage(1);
}

async function handleView(name) {
  const type = mediaTypeFor(name);
  if (!type) {
    showToast("Preview is not available for this file type.");
    return;
  }

  try {
    if (type === "image") {
      await openImagePreview(name);
      return;
    }

    if (type === "pdf") {
      await openPdfPreview(name);
      return;
    }

    await openAudioVideoPreview(name, type);
  } catch (error) {
    openPreviewModal(name);
    showPreviewMessage(previewErrorMessage(error));
  }
}

function uploadWithProgress(file) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", API_BASE, true);
    xhr.responseType = "json";

    xhr.upload.onprogress = (event) => {
      if (!state.upload.active) return;

      if (event.lengthComputable && event.total > 0) {
        const percent = (event.loaded / event.total) * 100;
        updateUploadProgress({
          percent,
          indeterminate: false,
          status: "Uploading",
        });
      } else {
        updateUploadProgress({ indeterminate: true, status: "Uploading" });
      }
    };

    xhr.onload = () => {
      const payload = typeof xhr.response === "object" && xhr.response !== null
        ? xhr.response
        : (() => {
            try {
              return JSON.parse(xhr.responseText || "null");
            } catch {
              return null;
            }
          })();

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(payload);
        return;
      }

      const error = new Error(payload?.detail || `Request failed (${xhr.status})`);
      error.status = xhr.status;
      reject(error);
    };

    xhr.onerror = () => reject(new TypeError("NetworkError during upload"));
    xhr.onabort = () => reject(new Error("Upload aborted"));

    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

async function handleUpload(event) {
  event.preventDefault();
  const file = elements.fileInput.files?.[0];
  if (!file || state.upload.active) return;

  if (!navigator.onLine) {
    await queueUpload(file);
    elements.uploadForm.reset();
    return;
  }

  updateUploadProgress({
    active: true,
    filename: file.name,
    status: "Starting",
    percent: 0,
    indeterminate: false,
  });

  try {
    await uploadWithProgress(file);
    updateUploadProgress({ percent: 100, status: "Complete", indeterminate: false });
    showToast("File uploaded.");
    await loadFiles();
  } catch (error) {
    if (isNetworkError(error)) {
      await queueUpload(file);
    } else {
      showToast(error.message);
    }
  } finally {
    elements.uploadForm.reset();
    setTimeout(() => resetUploadProgress(), 240);
    await updateQueueBadge();
  }
}

async function handleRenameSubmit(event) {
  event.preventDefault();
  const currentName = elements.renameCurrent.value;
  const nextName = elements.renameInput.value.trim();

  if (!nextName) {
    showToast("Filename is required.");
    return;
  }

  if (!navigator.onLine) {
    await queueRename(currentName, nextName);
    closeRenameModal();
    return;
  }

  try {
    await apiJson(`${API_BASE}/${encodeURIComponent(currentName)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ new_name: nextName }),
    });
    closeRenameModal();
    showToast("File renamed.");
    await loadFiles();
  } catch (error) {
    if (isNetworkError(error)) {
      await queueRename(currentName, nextName);
      closeRenameModal();
      return;
    }

    showToast(error.message);
  }

  await updateQueueBadge();
}

async function handleDelete(name) {
  if (!window.confirm(`Delete ${name}? This cannot be undone.`)) {
    return;
  }

  if (!navigator.onLine) {
    await queueDelete(name);
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/${encodeURIComponent(name)}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = response.headers.get("content-type")?.includes("application/json")
        ? await response.json()
        : null;
      throw new Error(payload?.detail || `Delete failed (${response.status})`);
    }
    showToast("File deleted.");
    await loadFiles();
  } catch (error) {
    if (isNetworkError(error)) {
      await queueDelete(name);
    } else {
      showToast(error.message);
    }
  }

  await updateQueueBadge();
}

async function handleActionClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const actionElement = target.closest("[data-action]");
  if (!(actionElement instanceof HTMLElement)) return;

  const action = actionElement.dataset.action;
  const encodedName = actionElement.dataset.name;
  if (!action || !encodedName) return;

  const name = decodeURIComponent(encodedName);

  if (action === "download" && (!navigator.onLine || state.files.some((entry) => entry.name === name && entry.pending))) {
    event.preventDefault();
    showToast("Downloads need an online file.");
    return;
  }

  if (action === "view") {
    await handleView(name);
    return;
  }

  if (action === "rename") {
    openRenameModal(name);
    return;
  }

  if (action === "delete") {
    await handleDelete(name);
  }
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("Service worker registration failed", error);
    });
  });
}

async function initialize() {
  setConnectivityUI();
  registerServiceWorker();
  resetUploadProgress();

  elements.uploadForm.addEventListener("submit", handleUpload);
  elements.refreshButton.addEventListener("click", loadFiles);
  elements.renameForm.addEventListener("submit", handleRenameSubmit);
  elements.renameCancel.addEventListener("click", closeRenameModal);
  elements.renameModal.addEventListener("click", (event) => {
    if (event.target === elements.renameModal) {
      closeRenameModal();
    }
  });

  elements.previewClose.addEventListener("click", closePreviewModal);
  elements.previewModal.addEventListener("click", (event) => {
    if (event.target === elements.previewModal) {
      closePreviewModal();
    }
  });

  elements.previewPdfPrev.addEventListener("click", async () => {
    if (state.preview.pdfPage <= 1) return;
    state.preview.pdfPage -= 1;
    await renderPdfPage(state.preview.pdfPage);
  });

  elements.previewPdfNext.addEventListener("click", async () => {
    if (state.preview.pdfPage >= state.preview.pdfTotalPages) return;
    state.preview.pdfPage += 1;
    await renderPdfPage(state.preview.pdfPage);
  });

  elements.fileTableBody.addEventListener("click", handleActionClick);
  elements.fileCardList.addEventListener("click", handleActionClick);

  window.addEventListener("online", async () => {
    setConnectivityUI();
    await processQueue();
    await loadFiles();
  });

  window.addEventListener("offline", () => {
    setConnectivityUI();
    closePreviewModal();
  });

  await updateQueueBadge();
  await processQueue();
  await loadFiles();
  scheduleSyncLoop();
}

initialize().catch((error) => {
  console.error(error);
  showToast("Initialization failed.");
});
