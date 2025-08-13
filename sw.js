const CACHE_NAME = 'finapp-pwa-v9';
const ASSETS = [
  './','./index.html','./app.js?v=4.1.1','./manifest.webmanifest',
  './icon-192.png','./icon-512.png','./favicon.ico'
];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))) .then(()=>self.clients.claim())
  );
});
self.addEventListener('fetch', e=>{
  const url = new URL(e.request.url);
  if (e.request.method!=='GET') return;
  e.respondWith(
    caches.match(e.request).then(cached=> cached || fetch(e.request).then(res=>{
      const copy = res.clone();
      caches.open(CACHE_NAME).then(c=>c.put(e.request, copy));
      return res;
    }).catch(()=> cached ))
  );
});
self.addEventListener('message', (event)=>{
  if(event.data && event.data.type==='SKIP_WAITING'){ self.skipWaiting(); }
});