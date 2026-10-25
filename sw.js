// Offline-Speicher. Die Version ändert sich bei jedem Build automatisch.
const CACHE='semester-1e2264f94c';
const FILES=["./","index.html","manifest.webmanifest","fonts.css","apple-touch-icon.png","favicon.png","figtree-latin-400-normal.woff2","figtree-latin-500-normal.woff2","figtree-latin-600-normal.woff2","figtree-latin-700-normal.woff2","icon-192.png","icon-512.png","icon-maskable-512.png","nunito-latin-700-normal.woff2","nunito-latin-800-normal.woff2","nunito-latin-900-normal.woff2"];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const r=e.request; if(r.method!=='GET'||new URL(r.url).origin!==location.origin)return;
  if(r.url.endsWith('/sync-config.js')){e.respondWith(fetch(r).then(res=>{const cp=res.clone();caches.open(CACHE).then(c=>c.put(r,cp));return res;}).catch(()=>caches.match(r)));return;}
  if(r.mode==='navigate'){e.respondWith(fetch(r).then(res=>{const cp=res.clone();caches.open(CACHE).then(c=>c.put('index.html',cp));return res;}).catch(()=>caches.match('index.html')));return;}
  e.respondWith(caches.match(r).then(hit=>hit||fetch(r)));
});
// Benachrichtigungen
self.addEventListener('push',e=>{
  let d={};try{d=e.data?e.data.json():{};}catch(_){d={body:e.data?e.data.text():''};}
  e.waitUntil(self.registration.showNotification(d.title||'Mein Semester',{body:d.body||'',tag:d.tag||undefined,icon:'icon-192.png',badge:'icon-192.png',data:{url:'./'}}));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{for(const c of cs){if('focus' in c)return c.focus();}return self.clients.openWindow('./');}));
});
