const CACHE='fitly-pages-v5-9';
const BASE=self.registration.scope;
const FILES=["","image-resizer/","resize-image-to-20kb/","resize-image-to-50kb/","resize-image-to-100kb/","resize-image-to-200kb/","resize-image-to-500kb/","passport-photo-maker/","image-converter/","pdf-merge-split/","image-to-pdf/","qr-code-generator/","word-counter/","about/","privacy/","contact/","css/style.css","js/app.js","js/vendor/qrcode.js","js/vendor/pdf-lib.min.js","fonts/bricolage.woff2","fonts/public-sans.woff2","icon.svg","manifest.webmanifest","js/tools/converter.js","js/tools/counter.js","js/tools/pdf.js","js/tools/qr.js","js/tools/resizer.js","js/tools/passport.js","js/tools/mergesplit.js","heic-to-jpg/","crop-rotate/","image-to-text/","resize-image-to-30kb/","resize-image-to-70kb/","resize-image-to-150kb/","resize-image-to-1mb/","js/tools/heic.js","js/tools/croprotate.js","js/tools/ocr.js","background-remover/","pdf-to-jpg/","pdf-pages/","barcode-generator/","signature-maker/","js/tools/bgremove.js","js/tools/pdftojpg.js","js/tools/pdfpages.js","js/tools/barcode.js","js/tools/signature.js","js/vendor/jsbarcode.min.js"];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES.map(f=>new URL(f,BASE).href))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  // MediaPipe background engine: lazy-loaded, cached on first use (not in the
  // install list, so visitors who never change a background never download it).
  if(['/js/vendor/mediapipe/','/js/vendor/tesseract/','/js/vendor/heic2any.min.js','/js/vendor/pdfjs/'].some(x=>new URL(e.request.url).pathname.includes(x))){
    e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open('fitly-mediapipe').then(cc=>cc.put(e.request,c));return r;}).catch(()=>caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).catch(()=>caches.match(BASE))));
});
