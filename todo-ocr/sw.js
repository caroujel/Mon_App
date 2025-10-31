const CACHE='todo-ocr-v1';const ASSETS=['/','/index.html','/manifest.webmanifest'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(self.clients.claim())});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;
e.respondWith(caches.match(r).then(resp=>resp||fetch(r).then(net=>{const copy=net.clone();caches.open(CACHE).then(c=>c.put(r,copy));return net;}).catch(()=>resp)))});
