// Network-first con fallback y control de versiones
const CACHE = 'finapp-pwa-v2';
const ASSETS = [
  './',
  './index.html',
  './app.js?v=2',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => { if (k !== CACHE) return caches.delete(k); }))).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    fetch(req).then(res => {
      const resClone = res.clone();
      caches.open(CACHE).then(c => c.put(req, resClone)).catch(()=>{});
      return res;
    }).catch(() => caches.match(req).then(cached => {
      if (cached) return cached;
      if (req.headers.get('accept') && req.headers.get('accept').includes('text/html')) {
        return caches.match('./index.html');
      }
      return new Response('', {status: 504, statusText: 'Offline'});
    }))
  );
});