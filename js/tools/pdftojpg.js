(() => {
  const { esc, fmt, toBlob, dropzone, download, zipDownload, baseName } = window.Fitly;
  const $ = id => document.getElementById(id);
  const VENDOR = new URL('../vendor/pdfjs/', document.currentScript.src).href;
  const list = $('list'), goBtn = $('go'), dlBtn = $('dlall'), clearBtn = $('clear'), status = $('status');
  let file = null, pdf = null, pages = [];
  let pdfjsPromise = null;

  dropzone($('drop'), $('file'), files => {
    if (!files.length) return;
    file = files[0]; pdf = null; pages = [];
    goBtn.disabled = false; clearBtn.disabled = false; dlBtn.disabled = true;
    list.hidden = true; list.innerHTML = '';
    status.textContent = `${esc(file.name)} ready. Tap “Convert pages”.`;
  }, f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));

  async function loadPdfjs() {
    if (pdfjsPromise) return pdfjsPromise;
    pdfjsPromise = (async () => {
      const mod = await import(VENDOR + 'pdf.min.mjs');
      mod.GlobalWorkerOptions.workerSrc = VENDOR + 'pdf.worker.min.mjs';
      return mod;
    })();
    return pdfjsPromise;
  }

  const syncQ = () => { $('qrow').hidden = $('fmt').value === 'image/png'; $('qv').textContent = $('q').value + '%'; };
  $('fmt').onchange = syncQ; $('q').oninput = syncQ; syncQ();

  function render() {
    list.hidden = !pages.length;
    dlBtn.disabled = !pages.some(p => p.out);
    list.className = 'files'; list.innerHTML = '';
    pages.forEach((p, idx) => {
      const row = document.createElement('div'); row.className = 'file';
      const img = document.createElement('img'); img.alt = ''; img.src = p.thumb || '';
      const mid = document.createElement('div');
      mid.innerHTML = `<div class="nm">Page ${p.n}</div><div class="mt">` +
        (p.out ? `<b>${esc(fmt(p.out.blob.size))}</b> ${p.out.ext.toUpperCase()} · ${p.out.w}×${p.out.h}px` : esc(p.status)) + '</div>';
      const acts = document.createElement('div'); acts.className = 'acts';
      const b = document.createElement('button'); b.className = 'btn ghost'; b.textContent = 'Download'; b.disabled = !p.out;
      b.onclick = () => download(p.out.blob, p.out.name);
      acts.append(b); row.append(img, mid, acts); list.append(row);
    });
  }

  goBtn.onclick = async () => {
    if (!file) return;
    goBtn.disabled = true;
    status.textContent = 'Loading the PDF reader — a one-time download, then it works offline.';
    try {
      const pdfjs = await loadPdfjs();
      const buf = await file.arrayBuffer();
      pdf = await pdfjs.getDocument({ data: buf }).promise;
      const type = $('fmt').value, q = +$('q').value / 100;
      const ext = type === 'image/png' ? 'png' : 'jpg';
      pages = [];
      for (let n = 1; n <= pdf.numPages; n++) {
        const p = { n, status: 'Working…', thumb: '', out: null };
        pages.push(p); render();
        try {
          const page = await pdf.getPage(n);
          const vp = page.getViewport({ scale: 2 });
          const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
          const x = c.getContext('2d');
          if (type === 'image/jpeg') { x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); }
          await page.render({ canvasContext: x, viewport: vp }).promise;
          const blob = await toBlob(c, type, type === 'image/png' ? undefined : q);
          p.thumb = c.toDataURL('image/jpeg', 0.7);
          p.out = { blob, name: `${baseName(file.name)}-p${n}.${ext}`, ext, w: c.width, h: c.height };
          p.status = 'Done';
        } catch (e) { p.status = 'Could not render this page'; }
        render();
      }
      status.textContent = `Done — ${pdf.numPages} page${pdf.numPages === 1 ? '' : 's'}. Download pages one by one, or all as a ZIP.`;
    } catch (e) {
      status.textContent = 'The PDF reader needs a connection the first time (one download, then it works offline).';
    }
    goBtn.disabled = false;
  };

  dlBtn.onclick = async () => {
    const done = pages.filter(p => p.out);
    if (done.length === 1) return download(done[0].out.blob, done[0].out.name);
    dlBtn.disabled = true;
    try { await zipDownload(done.map(p => ({ name: p.out.name, blob: p.out.blob })), `${baseName(file.name)}-pages.zip`); }
    finally { dlBtn.disabled = false; }
  };
  clearBtn.onclick = () => { file = null; pdf = null; pages = []; list.hidden = true; list.innerHTML = ''; goBtn.disabled = true; dlBtn.disabled = true; clearBtn.disabled = true; status.textContent = 'The PDF reader downloads once the first time you use it, then it works offline.'; };
})();
