(() => {
  const { esc, fmt, toBlob, dropzone, download, zipDownload, baseName } = window.Fitly;
  const $ = id => document.getElementById(id);
  const list = $('list'), goBtn = $('go'), dlBtn = $('dlall'), clearBtn = $('clear');
  let items = [];

  dropzone($('drop'), $('file'), files => {
    files.forEach(f => items.push({ file: f, url: URL.createObjectURL(f), out: null, status: 'Ready' }));
    render();
  }, f => f.type.startsWith('image/'));

  const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  const outName = it => `${baseName(it.file.name)}.${EXT[it.out.type]}`;

  function render() {
    list.hidden = !items.length;
    goBtn.disabled = clearBtn.disabled = !items.length;
    dlBtn.disabled = !items.some(i => i.out);
    list.className = 'files'; list.innerHTML = '';
    items.forEach((it, idx) => {
      const o = it.out;
      const row = document.createElement('div'); row.className = 'file';
      const img = document.createElement('img'); img.alt = ''; img.src = o ? o.url : it.url;
      const mid = document.createElement('div');
      mid.innerHTML = `<div class="nm">${esc(it.file.name)}</div><div class="mt">${esc(fmt(it.file.size))}` +
        (o ? ` → <b>${esc(fmt(o.blob.size))}</b> ${EXT[o.type].toUpperCase()} · ${o.w}×${o.h}px` : ` · ${esc(it.status)}`) + '</div>';
      const acts = document.createElement('div'); acts.className = 'acts';
      const b = document.createElement('button'); b.className = 'btn ghost'; b.textContent = 'Download'; b.disabled = !o;
      b.onclick = () => download(o.blob, outName(it));
      const r = document.createElement('button'); r.className = 'btn ghost'; r.textContent = 'Remove';
      r.onclick = () => { URL.revokeObjectURL(it.url); o && URL.revokeObjectURL(o.url); items.splice(idx, 1); render(); };
      acts.append(b, r); row.append(img, mid, acts); list.append(row);
    });
  }

  async function convert(it) {
    const type = $('fmt').value, q = +$('q').value / 100;
    const bmp = await createImageBitmap(it.file, { imageOrientation: 'from-image' });
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext('2d');
    if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
    ctx.drawImage(bmp, 0, 0);
    const blob = await toBlob(c, type, q);
    bmp.close && bmp.close();
    if (!blob || blob.type !== type) throw new Error('This browser cannot save ' + type.split('/')[1].toUpperCase());
    return { blob, url: URL.createObjectURL(blob), w: c.width, h: c.height, type };
  }

  const syncQ = () => { $('qrow').hidden = $('fmt').value === 'image/png'; $('qv').textContent = $('q').value + '%'; };
  $('fmt').onchange = syncQ; $('q').oninput = syncQ; syncQ();

  goBtn.onclick = async () => {
    goBtn.disabled = true;
    for (const it of items) {
      it.status = 'Working…'; render();
      try { it.out && URL.revokeObjectURL(it.out.url); it.out = await convert(it); }
      catch (e) { it.out = null; it.status = e.message || 'Failed'; }
      render();
    }
    goBtn.disabled = false;
  };

  dlBtn.onclick = async () => {
    const done = items.filter(i => i.out);
    if (done.length === 1) return download(done[0].out.blob, outName(done[0]));
    dlBtn.disabled = true;
    try { await zipDownload(done.map(i => ({ name: outName(i), blob: i.out.blob })), 'fitly-converted.zip'); }
    finally { dlBtn.disabled = false; }
  };
  clearBtn.onclick = () => { items.forEach(i => { URL.revokeObjectURL(i.url); i.out && URL.revokeObjectURL(i.out.url); }); items = []; render(); };
})();
