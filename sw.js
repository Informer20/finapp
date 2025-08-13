const CACHE = 'finapp-v4-1-2';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './favicon.ico',
];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.map(k=>{ if(k!==CACHE) return caches.delete(k); })))
  );
  self.clients.claim();
});

self.addEventListener('message', e=>{
  if(e.data && e.data.type==='SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e=>{
  const url = new URL(e.request.url);
  if(e.request.method!=='GET') return; 
  e.respondWith(
    caches.match(e.request).then(res=> res || fetch(e.request).then(r=>{
      const copy = r.clone();
      caches.open(CACHE).then(c=>c.put(e.request, copy));
      return r;
    }).catch(()=>res))
  );
});
