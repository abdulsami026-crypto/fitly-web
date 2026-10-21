/* Fitly shared helpers. Everything runs in the browser; nothing is uploaded. */
(function () {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = b => b >= 1048576 ? (b / 1048576).toFixed(2) + ' MB' : b >= 1024 ? (b / 1024).toFixed(b < 10240 ? 1 : 0) + ' KB' : b + ' B';
  const toBlob = (canvas, type, q) => new Promise(res => canvas.toBlob(res, type, q));

  function dropzone(zone, input, onFiles, accept) {
    const ok = f => !accept || accept(f);
    zone.addEventListener('click', e => { if (e.target !== input) input.click(); });
    zone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    input.addEventListener('change', () => { onFiles([...input.files].filter(ok)); input.value = ''; });
    ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove('over'); }));
    zone.addEventListener('drop', e => onFiles([...e.dataTransfer.files].filter(ok)));
  }

  function download(blobOrUrl, name) {
    const url = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    if (typeof blobOrUrl !== 'string') setTimeout(() => URL.revokeObjectURL(url), 8000);
  }

  // ---- minimal ZIP writer (store method; images are already compressed) ----
  const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u8 => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = crcTable[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

  function makeZip(files) { // [{name, data:Uint8Array}]
    const enc = new TextEncoder(), parts = [], central = [];
    let offset = 0;
    const d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    for (const f of files) {
      const nameB = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, nameB.length, true); lh.setUint16(28, 0, true);
      parts.push(lh.buffer, nameB, f.data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, size, true); ch.setUint32(24, size, true); ch.setUint16(28, nameB.length, true);
      ch.setUint32(42, offset, true);
      central.push(ch.buffer, nameB);
      offset += 30 + nameB.length + size;
    }
    let cen = 0; central.forEach(p => cen += p.byteLength);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cen, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
  }

  async function zipDownload(entries, zipName) { // [{name, blob}]
    const used = new Set(), files = [];
    for (const e of entries) {
      const dot = e.name.lastIndexOf('.');
      const base = dot > 0 ? e.name.slice(0, dot) : e.name, ext = dot > 0 ? e.name.slice(dot) : '';
      let name = e.name, n = 1;
      while (used.has(name.toLowerCase())) name = `${base}-${++n}${ext}`;
      used.add(name.toLowerCase());
      files.push({ name, data: new Uint8Array(await e.blob.arrayBuffer()) });
    }
    download(makeZip(files), zipName);
  }

  // size gauge: grey = original, blue = result, tick = limit
  function gauge(orig, result, limit) {
    const max = Math.max(orig, result, limit || 0) * 1.05;
    const p = v => (v / max * 100).toFixed(2) + '%';
    return `<div class="gauge" aria-hidden="true"><i class="g-old" style="width:${p(orig)}"></i><i class="g-new" style="width:${p(result)}"></i>` +
      (limit ? `<span class="g-lim" style="left:${p(limit)}" data-l="limit ${esc(fmt(limit))}"></span>` : '') + '</div>';
  }

  const baseName = n => n.replace(/\.[^.]+$/, '');

  window.Fitly = { esc, fmt, toBlob, dropzone, download, zipDownload, makeZip, gauge, baseName };

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    const SW_URL = new URL('../sw.js', document.currentScript.src).href;
    window.addEventListener('load', () => navigator.serviceWorker.register(SW_URL).catch(() => {}));
  }
})();
