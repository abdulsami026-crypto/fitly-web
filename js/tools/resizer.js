(() => {
  const { esc, fmt, toBlob, dropzone, download, zipDownload, gauge, baseName } = window.Fitly;
  const $ = id => document.getElementById(id);
  const list = $('list'), goBtn = $('go'), dlBtn = $('dlall'), clearBtn = $('clear');
  let items = [];

  dropzone($('drop'), $('file'), addFiles, f => f.type.startsWith('image/'));

  function addFiles(files) {
    files.forEach(f => items.push({ file: f, url: URL.createObjectURL(f), out: null, status: 'Ready' }));
    render();
    if (files.length && $('auto').checked) run();
  }

  const limitBytes = () => Math.max(2, +$('maxkb').value || 1000) * 1024;

  function render() {
    list.hidden = !items.length;
    goBtn.disabled = clearBtn.disabled = !items.length;
    dlBtn.disabled = !items.some(i => i.out);
    list.className = 'files has-gauge';
    list.innerHTML = '';
    items.forEach((it, idx) => {
      const row = document.createElement('div'); row.className = 'file';
      const o = it.out;
      const img = document.createElement('img'); img.alt = ''; img.src = o ? o.url : it.url;
      const mid = document.createElement('div');
      let meta = `<div class="mt">Original ${esc(fmt(it.file.size))} · ${esc(it.status)}</div>`;
      if (o) {
        const fits = o.blob.size <= o.limit;
        meta = gauge(it.file.size, o.blob.size, o.limit) +
          `<div class="mt"><b>${esc(fmt(o.blob.size))}</b> <span class="${fits ? 'good' : 'bad'}">${fits ? 'fits' : 'over the limit'}</span> · ${o.w}×${o.h}px (was ${o.ow}×${o.oh}) · quality ${Math.round(o.q * 100)}%` +
          (o.note ? `<br>${esc(o.note)}` : '') + '</div>';
      }
      mid.innerHTML = `<div class="nm">${esc(it.file.name)}</div>${meta}`;
      const acts = document.createElement('div'); acts.className = 'acts';
      const b = document.createElement('button'); b.className = 'btn ghost'; b.textContent = 'Download'; b.disabled = !o;
      b.onclick = () => download(o.blob, outName(it));
      const r = document.createElement('button'); r.className = 'btn ghost'; r.textContent = 'Remove'; r.setAttribute('aria-label', 'Remove ' + it.file.name);
      r.onclick = () => { URL.revokeObjectURL(it.url); o && URL.revokeObjectURL(o.url); items.splice(idx, 1); render(); };
      acts.append(b, r);
      row.append(img, mid, acts);
      list.append(row);
    });
  }

  function outName(it) {
    const ext = it.out.ext || (it.file.name.split('.').pop() || 'jpg');
    return `${baseName(it.file.name)}-resized.${ext}`;
  }

  async function process(it) {
    const limit = limitBytes();
    const maxBytes = limit - Math.min(1024, Math.round(limit * 0.01)); // small safety margin
    const type = $('fmt').value;
    const minQ = +$('minq').value;
    const maxDim = +$('maxdim').value || 0;

    const bmp = await createImageBitmap(it.file, { imageOrientation: 'from-image' });
    const ow = bmp.width, oh = bmp.height;
    let scale = 1;
    if (maxDim && Math.max(ow, oh) > maxDim) scale = maxDim / Math.max(ow, oh);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    function draw(sc) {
      const w = Math.max(1, Math.round(ow * sc)), h = Math.max(1, Math.round(oh * sc));
      canvas.width = w; canvas.height = h;
      if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); } else ctx.clearRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bmp, 0, 0, w, h);
      return { w, h };
    }

    // highest quality in [lo,hi] that fits (binary search); also reports the size at lo
    async function fit(lo, hi) {
      const top = await toBlob(canvas, type, hi);
      if (top.size <= maxBytes) return { best: { blob: top, q: hi } };
      const floor = await toBlob(canvas, type, lo);
      if (floor.size > maxBytes) return { best: null, floorSize: floor.size };
      let best = { blob: floor, q: lo };
      for (let i = 0; i < 7; i++) {
        const mid = (lo + hi) / 2;
        const b = await toBlob(canvas, type, mid);
        if (b.size <= maxBytes) { best = { blob: b, q: mid }; lo = mid; } else hi = mid;
      }
      return { best };
    }

    const keepDims = $('keep').value === '1';
    let result = null, dims = null, note = '';
    if (keepDims) {
      // never change width/height: let quality drop as far as needed
      dims = draw(scale);
      const r = await fit(0.05, 0.95);
      if (r.best) {
        result = r.best;
        if (result.q < 0.5) note = 'Quality had to be lowered a lot to keep every pixel. Allow shrinking for a cleaner result.';
      }
    } else {
      for (let step = 0; step < 25 && !result; step++) {
        dims = draw(scale);
        const r = await fit(minQ, 0.95);
        if (r.best) result = r.best;
        else scale *= Math.min(0.95, Math.max(0.3, Math.sqrt(maxBytes / r.floorSize) * 0.97)); // shrink, same aspect ratio, no crop
      }
    }
    if (!result) {
      dims = draw(scale);
      const lastQ = keepDims ? 0.05 : 0.4;
      result = { blob: await toBlob(canvas, type, lastQ), q: lastQ };
      note = 'Could not reach the limit. This is the smallest result possible.';
    }
    bmp.close && bmp.close();

    if (it.file.size <= maxBytes && result.blob.size >= it.file.size && dims.w === ow && dims.h === oh) {
      return { blob: it.file, url: URL.createObjectURL(it.file), w: ow, h: oh, ow, oh, q: 1, ext: null, limit, note: 'Already under the limit, so the original is kept.' };
    }
    if (dims.w !== ow || dims.h !== oh) note = note || 'Dimensions were reduced to reach the limit. The full image is kept, nothing is cropped.';
    return { blob: result.blob, url: URL.createObjectURL(result.blob), w: dims.w, h: dims.h, ow, oh, q: result.q, ext: type === 'image/webp' ? 'webp' : 'jpg', limit, note };
  }

  let running = false;
  async function run() {
    if (running) return;
    running = true; goBtn.disabled = true;
    for (const it of items) {
      if (it.out && it.out.stamp === settingsKey()) continue;
      it.status = 'Working…'; render();
      try {
        if (it.out) URL.revokeObjectURL(it.out.url);
        it.out = await process(it); it.out.stamp = settingsKey(); it.status = 'Done';
      } catch (e) { it.out = null; it.status = 'Could not read this file (' + (e.message || 'error') + ')'; }
      render();
    }
    running = false; render();
  }
  const settingsKey = () => [$('maxkb').value, $('fmt').value, $('maxdim').value, $('minq').value, $('keep').value].join('|');

  goBtn.onclick = () => { items.forEach(i => { i.out && (i.out.stamp = ''); }); run(); };

  dlBtn.onclick = async () => {
    const done = items.filter(i => i.out);
    if (!done.length) return;
    if (done.length === 1) return download(done[0].out.blob, outName(done[0]));
    dlBtn.disabled = true; const t = dlBtn.textContent; dlBtn.textContent = 'Zipping…';
    try { await zipDownload(done.map(i => ({ name: outName(i), blob: i.out.blob })), 'fitly-resized.zip'); }
    finally { dlBtn.textContent = t; dlBtn.disabled = false; }
  };

  clearBtn.onclick = () => { items.forEach(i => { URL.revokeObjectURL(i.url); i.out && URL.revokeObjectURL(i.out.url); }); items = []; render(); };
})();
