const CACHE='fitly-pages-v5-1';
const BASE=self.registration.scope;
const FILES=["","image-resizer/","resize-image-to-20kb/","resize-image-to-50kb/","resize-image-to-100kb/","resize-image-to-200kb/","resize-image-to-500kb/","image-converter/","image-to-pdf/","qr-code-generator/","word-counter/","about/","privacy/","contact/","css/style.css","js/app.js","js/vendor/qrcode.js","fonts/bricolage.woff2","fonts/public-sans.woff2","icon.svg","manifest.webmanifest","js/tools/converter.js","js/tools/counter.js","js/tools/pdf.js","js/tools/qr.js","js/tools/resizer.js"];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES.map(f=>new URL(f,BASE).href))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).catch(()=>caches.match(BASE))));
});
