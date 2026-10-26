(() => {
  const { esc, fmt, dropzone, download, zipDownload, baseName } = window.Fitly;
  const $ = id => document.getElementById(id);
  const VENDOR = new URL('../vendor/mediapipe/', document.currentScript.src).href;
  const list = $('list'), goBtn = $('go'), dlBtn = $('dlall'), clearBtn = $('clear'), status = $('status');
  let items = [];
  let seg = null, segPromise = null;

  dropzone($('drop'), $('file'), files => {
    files.forEach(f => items.push({ file: f, out: null, status: 'Ready' }));
    render();
  }, f => f.type.startsWith('image/'));

  function render() {
    list.hidden = !items.length;
    goBtn.disabled = clearBtn.disabled = !items.length;
    dlBtn.disabled = !items.some(i => i.out);
    list.className = 'files'; list.innerHTML = '';
    items.forEach((it, idx) => {
      const o = it.out;
      const row = document.createElement('div'); row.className = 'file';
      const img = document.createElement('img'); img.alt = '';
      img.src = o ? o.url : 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="8" fill="#eef1f7"/><text x="32" y="38" font-size="13" text-anchor="middle" fill="#5b6577">Photo</text></svg>');
      const mid = document.createElement('div');
      mid.innerHTML = `<div class="nm">${esc(it.file.name)}</div><div class="mt">${esc(fmt(it.file.size))}` +
        (o ? ` → <b>${esc(fmt(o.blob.size))}</b> PNG · transparent · ${o.w}×${o.h}px` : ` · ${esc(it.status)}`) + '</div>';
      const acts = document.createElement('div'); acts.className = 'acts';
      const b = document.createElement('button'); b.className = 'btn ghost'; b.textContent = 'Download'; b.disabled = !o;
      b.onclick = () => download(o.blob, `${baseName(it.file.name)}-no-bg.png`);
      const r = document.createElement('button'); r.className = 'btn ghost'; r.textContent = 'Remove';
      r.onclick = () => { o && URL.revokeObjectURL(o.url); items.splice(idx, 1); render(); };
      acts.append(b, r); row.append(img, mid, acts); list.append(row);
    });
  }

  async function ensureSegmenter() {
    if (segPromise) return segPromise;
    segPromise = (async () => {
      const mod = await import(VENDOR + 'vision_bundle.mjs');
      const vision = await mod.FilesetResolver.forVisionTasks(VENDOR + 'wasm');
      seg = await mod.ImageSegmenter.createFromOptions(vision, {
        baseOptions: { modelAssetPath: VENDOR + 'selfie_segmenter.tflite' },
        runningMode: 'IMAGE',
        outputCategoryMask: true
      });
    })();
    return segPromise;
  }

  async function cutout(file) {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    try {
      const scale = Math.min(1, 640 / bmp.width);
      const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(bmp, 0, 0, w, h);
      const res = seg.segment(c);
      const mw = res.categoryMask.width, mh = res.categoryMask.height;
      const raw = res.categoryMask.getAsFloat32Array();
      res.close();
      let person = 0;
      for (let i = 0; i < mw * mh; i++) if (raw[i] < 0.5) person++;
      if (person / (mw * mh) < 0.03) throw new Error('No person was found in this photo');
      const mc = document.createElement('canvas'); mc.width = mw; mc.height = mh;
      const mctx = mc.getContext('2d');
      const imd = mctx.createImageData(mw, mh);
      for (let i = 0; i < mw * mh; i++) imd.data[i * 4 + 3] = Math.max(0, Math.min(1, 1 - raw[i])) * 255;
      mctx.putImageData(imd, 0, 0);
      // person layer at full resolution, masked with a soft edge
      const layer = document.createElement('canvas'); layer.width = bmp.width; layer.height = bmp.height;
      const lx = layer.getContext('2d');
      lx.drawImage(bmp, 0, 0);
      const m = document.createElement('canvas'); m.width = bmp.width; m.height = bmp.height;
      const mx = m.getContext('2d');
      try { mx.filter = 'blur(2px)'; } catch (e) { /* no blur support: edges stay hard */ }
      mx.drawImage(mc, 0, 0, bmp.width, bmp.height);
      lx.globalCompositeOperation = 'destination-in';
      lx.drawImage(m, 0, 0);
      lx.globalCompositeOperation = 'source-over';
      const blob = await new Promise(r => layer.toBlob(r, 'image/png'));
      return { blob, url: URL.createObjectURL(blob), w: bmp.width, h: bmp.height };
    } finally {
      bmp.close && bmp.close();
    }
  }

  goBtn.onclick = async () => {
    goBtn.disabled = true;
    status.textContent = 'Loading the cutting engine — a one-time download, then it works offline.';
    try { await ensureSegmenter(); } catch (e) {
      status.textContent = 'The cutting engine needs a connection the first time (one download, then it works offline).';
      goBtn.disabled = false; return;
    }
    status.textContent = 'Cutting out…';
    for (const it of items) {
      it.status = 'Working…'; render();
      try { it.out && URL.revokeObjectURL(it.out.url); it.out = await cutout(it.file); }
      catch (e) { it.out = null; it.status = e.message || 'Failed'; }
      render();
    }
    status.textContent = 'Done. Download each PNG, or all of them as a ZIP.';
    goBtn.disabled = false;
  };

  dlBtn.onclick = async () => {
    const done = items.filter(i => i.out);
    if (done.length === 1) return download(done[0].out.blob, `${baseName(done[0].file.name)}-no-bg.png`);
    dlBtn.disabled = true;
    try { await zipDownload(done.map(i => ({ name: `${baseName(i.file.name)}-no-bg.png`, blob: i.out.blob })), 'fitly-no-bg.zip'); }
    finally { dlBtn.disabled = false; }
  };
  clearBtn.onclick = () => { items.forEach(i => { i.out && URL.revokeObjectURL(i.out.url); }); items = []; render(); };
})();
