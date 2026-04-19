// Cache-first service worker for the Korea Food app.
// Bump CACHE_VERSION to force clients to pick up new shell/data after deploy.

const CACHE_VERSION = "kfood-vetted-v1";
const SHELL = [
  "./",
  "index.html",
  "style.css",
  "style-vetted.css",
  "app.js",
  "manifest.json",
  "data/restaurants.json",
  "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css",
  "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js",
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  // Map tiles: network-first, fall back to cache. Avoids indefinite growth
  // while still working on a plane.
  if (url.hostname.endsWith("tile.openstreetmap.org")) {
    e.respondWith(
      fetch(e.request)
        .then(r => {
          const copy = r.clone();
          caches.open(CACHE_VERSION + "-tiles").then(c => c.put(e.request, copy));
          return r;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  // Everything else: cache-first with network refresh.
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fresh = fetch(e.request).then(r => {
        if (r && r.ok && (r.type === "basic" || r.type === "cors")) {
          const copy = r.clone();
          caches.open(CACHE_VERSION).then(c => c.put(e.request, copy));
        }
        return r;
      }).catch(() => cached);
      return cached || fresh;
    })
  );
});
