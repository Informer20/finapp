
// Simple PWA SW
const CACHE_NAME = 'finapp-pwa-v10';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './favicon.ico'
];

self.addEventListener('install', (e)=>{
  e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate', (e)=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))) .then(()=> self.clients.claim())
  );
});

self.addEventListener('fetch', (e)=>{
  const req = e.request;
  if(req.method!=='GET'){ return; }
  e.respondWith(
    caches.match(req).then(cached=> cached || fetch(req).then(res=>{
      const resClone = res.clone();
      caches.open(CACHE_NAME).then(c=> c.put(req, resClone));
      return res;
    }).catch(()=> cached))
  );
});

self.addEventListener('message', (e)=>{
  if(e.data && e.data.type==='SKIP_WAITING'){ self.skipWaiting(); }
});
