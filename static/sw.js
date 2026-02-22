const SHELL_CACHE = "file-share-shell-v2";
const API_CACHE = "file-share-api-v1";

const APP_SHELL_URLS = [
  "/",
  "/static/index.html",
  "/static/app.js",
  "/manifest.webmanifest",
  "/static/manifest.webmanifest",
  "/static/icons/fileflash-logo.svg",
  "/sw.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_URLS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![SHELL_CACHE, API_CACHE].includes(key))
          .map((key) => caches.delete(key)),
      ),
    ).then(() => self.clients.claim()),
  );
});

async function networkFirstList(request) {
  const cache = await caches.open(API_CACHE);

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }

    return new Response(JSON.stringify({ items: [], cached_at: new Date().toISOString() }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  }
}

async function staleWhileRevalidateAsset(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then((response) => {
      cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);

  return cached || networkFetch;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin === self.location.origin && url.pathname === "/api/files") {
    event.respondWith(networkFirstList(request));
    return;
  }

  if (url.origin === self.location.origin && url.pathname.startsWith("/api/files/")) {
    return;
  }

  if (["cdn.tailwindcss.com", "cdn.jsdelivr.net", "cdnjs.cloudflare.com"].includes(url.hostname)) {
    event.respondWith(staleWhileRevalidateAsset(request));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;

        return fetch(request)
          .then((response) => {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
            return response;
          })
          .catch(() => caches.match("/"));
      }),
    );
  }
});
