const CACHE_PREFIX = "right-way-";
const STATIC_CACHE = `${CACHE_PREFIX}static-v3`;
const RUNTIME_CACHE = `${CACHE_PREFIX}runtime-v3`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/app-icon-192.png", "/app-icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== STATIC_CACHE && key !== RUNTIME_CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const requestUrl = new URL(request.url);
  if (request.method !== "GET" || requestUrl.origin !== self.location.origin || requestUrl.pathname.startsWith("/api/") || request.headers.has("range")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)).then((response) => response || new Response("Você está offline.", { status: 503 })));
    return;
  }

  if (["script", "style", "font", "image"].includes(request.destination)) {
    event.respondWith(caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response.ok) caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, response.clone()));
        return response;
      }).catch(() => cached);
      return cached || network;
    }));
  }
});
