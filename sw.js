
const CACHE = 'finapp-v4.1.5';
const ASSETS = [
  './','./index.html','./app.js','./manifest.webmanifest',
  './icon-192.png','./icon-512.png','./favicon.ico'
];
self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e=>{
  e.respondWith(caches.match(e.request).then(r=> r || fetch(e.request)));
});
self.addEventListener('message', e=>{
  if(e.data && e.data.type==='SKIP_WAITING'){ self.skipWaiting(); }
});
