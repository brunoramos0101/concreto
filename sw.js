/* QMS Pro — Service Worker v4 */
const SHELL_CACHE = 'qms-shell-v4';
const RUNTIME_CACHE = 'qms-runtime-v4';
const OFFLINE_URL = './index.html';

// Keep install deterministic: only same-origin files in precache.
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './logo_sucena.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_FILES))
      .catch(() => {
        // Non-blocking: app still works online even if precache fails.
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function isNavigationRequest(request) {
  return request.mode === 'navigate' || request.destination === 'document';
}

function isRuntimeAsset(request, url) {
  if (request.destination === 'style' || request.destination === 'script' || request.destination === 'font' || request.destination === 'image') {
    return true;
  }
  // Cache trusted CDNs in runtime cache
  return url.hostname === 'cdnjs.cloudflare.com' || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
}

async function networkFirst(request, fallbackRequest) {
  const runtime = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) runtime.put(request, response.clone());
    return response;
  } catch {
    const cached = await runtime.match(request);
    if (cached) return cached;
    if (fallbackRequest) {
      const shell = await caches.open(SHELL_CACHE);
      const fallback = await shell.match(fallbackRequest);
      if (fallback) return fallback;
    }
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

async function staleWhileRevalidate(request) {
  const runtime = await caches.open(RUNTIME_CACHE);
  const cached = await runtime.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      // Opaque responses from CDN/fonts can still be cached for offline reuse.
      if (response && (response.ok || response.type === 'opaque')) {
        runtime.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);
  return cached || networkPromise;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never intercept Apps Script endpoint writes/reads.
  if (url.hostname === 'script.google.com') return;

  if (isNavigationRequest(request)) {
    event.respondWith(networkFirst(request, OFFLINE_URL));
    return;
  }

  if (isRuntimeAsset(request, url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Default fallback: network first, cache fallback if available.
  event.respondWith(networkFirst(request));
});
