const VERSION = "2";
const CACHE_NAME = "loyalty-pwa-v" + VERSION;
const ASSETS = [
  "./",
  "index.html",
  "app.js",
  "styles.css",
  "manifest.json",
  "icon.svg",
];

// ---- Install: pre-cache all static assets ----
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return Promise.all(
        ASSETS.map(function (url) {
          return cache.add(url).catch(function (err) {
            console.warn("Failed to pre-cache:", url, err);
          });
        }),
      );
    }),
  );
  // Take over immediately on version change (skip waiting for old SW)
  self.skipWaiting();
});

// ---- Activate: clean old caches ----
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (k) {
            return k !== CACHE_NAME;
          })
          .map(function (k) {
            return caches.delete(k);
          }),
      );
    }),
  );
});

// ---- Fetch: network-first with 3s timeout, cache fallback ----
self.addEventListener("fetch", function (event) {
  // Only handle GET requests for our origin
  if (event.request.method !== "GET") return;
  var reqUrl = new URL(event.request.url);
  if (reqUrl.origin !== self.location.origin) return;

  event.respondWith(
    Promise.race([
      fetch(event.request),
      new Promise(function (_, reject) {
        setTimeout(function () {
          reject(new Error("timeout"));
        }, 3000);
      }),
    ])
      .then(function (response) {
        // Update cache with fresh response (clone because body can only be read once)
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(event.request, clone).catch(function (err) {
            console.warn("Failed to update cache for:", event.request.url, err);
          });
        });
        return response;
      })
      .catch(function () {
        // Network failed or timed out — serve from cache, fall back to index.html
        return caches.match(event.request).then(function (cached) {
          return cached || caches.match("index.html");
        });
      }),
  );
});
