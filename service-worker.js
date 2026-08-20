// 4B PAVEMENT TILES — service worker
// Caches the static app shell only. All Firebase traffic goes straight to
// the network (never cached) so sales/stock/etc. are always live data.
const CACHE_NAME = "4b-tiles-shell-v47";
const SHELL_FILES = [
  "./index.html", "./login.html", "./owner.html", "./manager.html",
  "./css/style.css",
  "./js/firebase-config.js", "./js/auth.js", "./js/data.js", "./js/utils.js",
  "./js/icons.js", "./js/memo.js", "./js/owner.js", "./js/manager.js", "./js/shop.js",
  "./manifest.json", "./version.json",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png", "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never intercept Firebase / Google / third-party CDN calls — always live.
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        // Version-check pings carry a unique ?t= query — never cache those,
        // or the cache would grow forever with one entry per check.
        if (!url.search) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
