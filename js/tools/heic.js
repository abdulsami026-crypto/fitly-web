(() => {
  const { esc, fmt, dropzone, download, zipDownload, baseName } = window.Fitly;
  const $ = id => document.getElementById(id);
  const list = $('list'), goBtn = $('go'), dlBtn = $('dlall'), clearBtn = $('clear'), status = $('status');
  let items = [];
  let enginePromise = null;

  dropzone($('drop'), $('file'), files => {
    files.forEach(f => items.push({ file: f, out: null, status: 'Ready' }));
    render();
  }, f => /\.hei[cf]$/i.test(f.name) || f.type.startsWith('image/'));

  const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png' };
  const outName = it => `${baseName(it.file.name)}.${EXT[it.out.type]}`;

  function render() {
    list.hidden = !items.length;
    goBtn.disabled = clearBtn.disabled = !items.length;
    dlBtn.disabled = !items.some(i => i.out);
    list.className = 'files'; list.innerHTML = '';
    items.forEach((it, idx) => {
      const o = it.out;
      const row = document.createElement('div'); row.className = 'file';
      const img = document.createElement('img'); img.alt = '';
      img.src = o ? o.url : 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="8" fill="#eef1f7"/><text x="32" y="38" font-size="13" text-anchor="middle" fill="#5b6577">HEIC</text></svg>');
      const mid = document.createElement('div');
      mid.innerHTML = `<div class="nm">${esc(it.file.name)}</div><div class="mt">${esc(fmt(it.file.size))}` +
        (o ? ` → <b>${esc(fmt(o.blob.size))}</b> ${EXT[o.type].toUpperCase()} · ${o.w}×${o.h}px` : ` · ${esc(it.status)}`) + '</div>';
      const acts = document.createElement('div'); acts.className = 'acts';
      const b = document.createElement('button'); b.className = 'btn ghost'; b.textContent = 'Download'; b.disabled = !o;
      b.onclick = () => download(o.blob, outName(it));
      const r = document.createElement('button'); r.className = 'btn ghost'; r.textContent = 'Remove';
      r.onclick = () => { o && URL.revokeObjectURL(o.url); items.splice(idx, 1); render(); };
      acts.append(b, r); row.append(img, mid, acts); list.append(row);
    });
  }

  function loadEngine() {
    if (enginePromise) return enginePromise;
    enginePromise = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = new URL('../js/vendor/heic2any.min.js', location.href).href;
      s.onload = () => { window.heic2any ? res() : rej(new Error('HEIC engine failed to start')); };
      s.onerror = () => rej(new Error('HEIC engine failed to download'));
      document.head.appendChild(s);
    });
    return enginePromise;
  }

  async function convert(it) {
    await loadEngine();
    const type = $('fmt').value, q = +$('q').value / 100;
    let out = await window.heic2any({ blob: it.file, toType: type, quality: q });
    if (Array.isArray(out)) out = out[0]; // multi-image HEIF: take the main photo
    const bmp = await createImageBitmap(out);
    const r = { blob: out, url: URL.createObjectURL(out), w: bmp.width, h: bmp.height, type };
    bmp.close && bmp.close();
    return r;
  }

  const syncQ = () => { $('qrow').hidden = $('fmt').value === 'image/png'; $('qv').textContent = $('q').value + '%'; };
  $('fmt').onchange = syncQ; $('q').oninput = syncQ; syncQ();

  goBtn.onclick = async () => {
    goBtn.disabled = true;
    status.textContent = 'Loading the HEIC engine — a one-time download, then it works offline.';
    try { await loadEngine(); } catch (e) {
      status.textContent = 'The HEIC engine needs a connection the first time (one download, then it works offline).';
      goBtn.disabled = false; return;
    }
    status.textContent = 'Converting…';
    for (const it of items) {
      it.status = 'Working…'; render();
      try { it.out && URL.revokeObjectURL(it.out.url); it.out = await convert(it); }
      catch (e) { it.out = null; it.status = 'Could not convert this file'; }
      render();
    }
    status.textContent = 'Done. Download each file, or all of them as a ZIP.';
    goBtn.disabled = false;
  };

  dlBtn.onclick = async () => {
    const done = items.filter(i => i.out);
    if (done.length === 1) return download(done[0].out.blob, outName(done[0]));
    dlBtn.disabled = true;
    try { await zipDownload(done.map(i => ({ name: outName(i), blob: i.out.blob })), 'fitly-heic-converted.zip'); }
    finally { dlBtn.disabled = false; }
  };
  clearBtn.onclick = () => { items.forEach(i => { i.out && URL.revokeObjectURL(i.out.url); }); items = []; render(); };
})();
