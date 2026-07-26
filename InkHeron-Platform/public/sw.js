const CACHE_NAME = 'inkheron-static-v1';
const SAFE_ASSETS = [
  '/offline',
  '/assets/styles.css',
  '/assets/pwa.js',
  '/assets/InkHeron%20Logo.png',
  '/assets/icons/apple-touch-icon.png',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/icon-maskable-512.png',
  '/assets/fonts/inter-latin-400-normal.woff2',
  '/assets/fonts/inter-latin-700-normal.woff2',
  '/assets/fonts/source-serif-4-latin-600-normal.woff2'
];
const SAFE_PATHS = new Set(SAFE_ASSETS.map(asset => new URL(asset, self.location.origin).pathname));

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SAFE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names
          .filter(name => name.startsWith('inkheron-static-') && name !== CACHE_NAME)
          .map(name => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Authenticated HTML and every API response remain network-only. If a page
  // cannot load, show a generic shell that contains no student information.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/offline'))
    );
    return;
  }

  // Only the explicit public asset allowlist is cached. In particular, this
  // excludes essays, review payloads, exports, uploads and all /api/ traffic.
  if (!SAFE_PATHS.has(url.pathname)) return;

  event.respondWith(
    caches.match(request).then(cached => {
      const refreshed = fetch(request)
        .then(response => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || refreshed;
    })
  );
});
