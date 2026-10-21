(() => {
  const { esc, fmt, toBlob, dropzone, download } = window.Fitly;
  const $ = id => document.getElementById(id);
  const list = $('list'), goBtn = $('go'), clearBtn = $('clear');
  let items = [];

  dropzone($('drop'), $('file'), files => {
    files.forEach(f => items.push({ file: f, url: URL.createObjectURL(f) }));
    render();
  }, f => f.type.startsWith('image/'));

  function render() {
    list.hidden = !items.length;
    goBtn.disabled = clearBtn.disabled = !items.length;
    list.className = 'files'; list.innerHTML = '';
    items.forEach((it, idx) => {
      const row = document.createElement('div'); row.className = 'file';
      const img = document.createElement('img'); img.alt = ''; img.src = it.url;
      const mid = document.createElement('div');
      mid.innerHTML = `<div class="nm">Page ${idx + 1}: ${esc(it.file.name)}</div><div class="mt">${esc(fmt(it.file.size))}</div>`;
      const acts = document.createElement('div'); acts.className = 'acts';
      const mk = (t, fn, dis) => { const b = document.createElement('button'); b.className = 'btn ghost'; b.textContent = t; b.disabled = !!dis; b.onclick = fn; return b; };
      const mv = d => () => { const j = idx + d; [items[idx], items[j]] = [items[j], items[idx]]; render(); };
      acts.append(
        mk('Up', mv(-1), idx === 0), mk('Down', mv(1), idx === items.length - 1),
        mk('Remove', () => { URL.revokeObjectURL(it.url); items.splice(idx, 1); render(); })
      );
      row.append(img, mid, acts); list.append(row);
    });
  }

  const SIZES = { a4: [595.28, 841.89], letter: [612, 792] };
  const QUALITY = { high: [0.92, 4000], balanced: [0.8, 2400], small: [0.6, 1600] };

  async function toJpeg(file, q, maxSide) {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    let w = bmp.width, h = bmp.height;
    const s = Math.min(1, maxSide / Math.max(w, h));
    w = Math.max(1, Math.round(w * s)); h = Math.max(1, Math.round(h * s));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high'; ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close && bmp.close();
    const blob = await toBlob(c, 'image/jpeg', q);
    return { data: new Uint8Array(await blob.arrayBuffer()), w, h };
  }

  // Build a PDF with one JPEG per page
  function buildPdf(pages) {
    const enc = new TextEncoder(), chunks = [], offsets = [];
    let len = 0;
    const push = d => { const u = typeof d === 'string' ? enc.encode(d) : d; chunks.push(u); len += u.length; };
    const num = n => +n.toFixed(2);
    push(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
    const begin = n => { offsets[n] = len; push(`${n} 0 obj\n`); };
    const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
    begin(1); push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    begin(2); push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>\nendobj\n`);
    pages.forEach((p, i) => {
      const pg = 3 + i * 3, ct = pg + 1, im = pg + 2;
      begin(pg); push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(p.pw)} ${num(p.ph)}] /Resources << /XObject << /Im0 ${im} 0 R >> >> /Contents ${ct} 0 R >>\nendobj\n`);
      const content = `q ${num(p.dw)} 0 0 ${num(p.dh)} ${num(p.x)} ${num(p.y)} cm /Im0 Do Q`;
      begin(ct); push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
      begin(im); push(`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.data.length} >>\nstream\n`);
      push(p.data); push('\nendstream\nendobj\n');
    });
    const total = 3 + pages.length * 3, xref = len;
    let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
    for (let n = 1; n < total; n++) x += String(offsets[n]).padStart(10, '0') + ' 00000 n \n';
    push(x + `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(chunks, { type: 'application/pdf' });
  }

  goBtn.onclick = async () => {
    goBtn.disabled = true; const label = goBtn.textContent; goBtn.textContent = 'Making PDF…';
    try {
      const [q, maxSide] = QUALITY[$('quality').value];
      const size = $('page').value, margin = +$('margin').value;
      const pages = [];
      for (const it of items) {
        const j = await toJpeg(it.file, q, maxSide);
        let pw, ph, dw, dh, x, y;
        if (size === 'fit') {
          dw = j.w * 0.75; dh = j.h * 0.75; pw = dw + margin * 2; ph = dh + margin * 2; x = margin; y = margin;
        } else {
          [pw, ph] = SIZES[size];
          if (j.w > j.h) [pw, ph] = [ph, pw];
          const aw = pw - margin * 2, ah = ph - margin * 2, s = Math.min(aw / j.w, ah / j.h);
          dw = j.w * s; dh = j.h * s; x = (pw - dw) / 2; y = (ph - dh) / 2;
        }
        pages.push({ ...j, pw, ph, dw, dh, x, y });
      }
      const blob = buildPdf(pages);
      $('result').hidden = false;
      $('result').textContent = `PDF ready: ${pages.length} page${pages.length > 1 ? 's' : ''}, ${fmt(blob.size)}.`;
      download(blob, 'fitly-images.pdf');
    } catch (e) {
      $('result').hidden = false; $('result').textContent = 'Could not make the PDF: ' + (e.message || 'unknown error');
    } finally { goBtn.textContent = label; goBtn.disabled = !items.length; }
  };
  clearBtn.onclick = () => { items.forEach(i => URL.revokeObjectURL(i.url)); items = []; $('result').hidden = true; render(); };
})();
