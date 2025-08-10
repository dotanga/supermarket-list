const CACHE_NAME = 'sababagrocery-v3';
const ASSETS = ['./','./index.html','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => k !== CACHE_NAME && caches.delete(k)))));
});
self.addEventListener('fetch', (e) => {
  const { request } = e;
  e.respondWith(
    caches.match(request).then(cached =>
      cached || fetch(request).then(resp => {
        if (request.method === 'GET' && resp.status === 200 && (resp.type === 'basic' || resp.type === 'opaque')) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return resp;
      }).catch(() => cached)
    )
  );
});
