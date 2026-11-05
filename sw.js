const CACHE = 'sky-tracker-v6-mobile-offline';
const ASSETS = ['./','./index.html','./style.css','./app.js','./celestial-catalog.js','./astronomy.browser.min.js','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    // Prefer the latest deployed page, rather than locking mobile clients onto stale HTML.
    event.respondWith(fetch(request).then(response => {
      if (response.ok) caches.open(CACHE).then(cache => cache.put(request, response.clone())).catch(() => {});
      return response;
    }).catch(() => caches.match(request).then(hit => hit || caches.match('./index.html'))));
  } else {
    event.respondWith(caches.match(request).then(hit => hit || fetch(request).then(response => {
      if (response.ok) caches.open(CACHE).then(cache => cache.put(request, response.clone())).catch(() => {});
      return response;
    })));
  }
});
