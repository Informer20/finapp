// Network-first con fallback y control de versiones
const CACHE='finapp-pwa-v4';
const ASSETS=['./','./index.html','./app.js?v=3.0','./manifest.webmanifest','./icon-192.png','./icon-512.png','./favicon.ico'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>{if(k!==CACHE)return caches.delete(k)}))).then(()=>self.clients.claim()))});
self.addEventListener('message',ev=>{if(ev.data&&ev.data.type==='SKIP_WAITING'){self.skipWaiting()}});
self.addEventListener('fetch',e=>{const req=e.request;if(req.method!=='GET')return;e.respondWith(fetch(req).then(res=>{const clone=res.clone();caches.open(CACHE).then(c=>c.put(req,clone));return res}).catch(()=>caches.match(req).then(cached=>{if(cached)return cached;const accept=req.headers.get('accept')||'';if(accept.includes('text/html'))return caches.match('./index.html');return new Response('',{status:504,statusText:'Offline'})})))});
