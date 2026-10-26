(() => {
  const { esc, dropzone, download } = window.Fitly;
  const $ = id => document.getElementById(id);
  const VENDOR = new URL('../vendor/pdfjs/', document.currentScript.src).href;
  const grid = $('pages'), goBtn = $('go'), clearBtn = $('clear'), status = $('status');
  let file = null, bytes = null, pages = []; // pages: {n, rot, del, thumb}
  let pdfjsPromise = null;

  dropzone($('drop'), $('file'), files => {
    if (!files.length) return;
    file = files[0];
    goBtn.disabled = true; clearBtn.disabled = false;
    status.textContent = 'Reading pages…';
    load();
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

  async function load() {
    try {
      const pdfjs = await loadPdfjs();
      bytes = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
      pages = [];
      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n);
        const vp = page.getViewport({ scale: 0.5 });
        const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
        await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        pages.push({ n, rot: 0, del: false, thumb: c.toDataURL('image/jpeg', 0.7) });
      }
      status.textContent = `${pdf.numPages} pages. Rotate, delete or reorder, then download the edited PDF.`;
      goBtn.disabled = false;
    } catch (e) {
      status.textContent = 'Could not read this PDF. Locked PDFs cannot be opened — unlock a copy first.';
    }
    render();
  }

  function render() {
    grid.hidden = !pages.length;
    grid.innerHTML = '';
    pages.forEach((p, idx) => {
      const card = document.createElement('div'); card.className = 'pgcard';
      if (p.del) card.style.opacity = '0.45';
      const img = document.createElement('img'); img.alt = `Page ${p.n}`; img.src = p.thumb;
      img.style.transform = `rotate(${p.rot}deg)`;
      const nm = document.createElement('div'); nm.className = 'nm';
      nm.textContent = p.del ? `Page ${p.n} · deleted` : `Page ${p.n}` + (p.rot ? ` · ${p.rot}°` : '');
      const acts = document.createElement('div'); acts.className = 'acts';
      const mk = (label, fn, dis) => {
        const b = document.createElement('button'); b.className = 'btn ghost'; b.textContent = label;
        b.disabled = !!dis; b.onclick = fn; return b;
      };
      acts.append(
        mk('↺', () => { p.rot = (p.rot + 270) % 360; render(); }),
        mk('↻', () => { p.rot = (p.rot + 90) % 360; render(); }),
        mk('↑', () => { if (idx > 0) { pages.splice(idx - 1, 0, pages.splice(idx, 1)[0]); render(); } }, idx === 0),
        mk('↓', () => { if (idx < pages.length - 1) { pages.splice(idx + 1, 0, pages.splice(idx, 1)[0]); render(); } }, idx === pages.length - 1),
        mk(p.del ? 'Restore' : 'Delete', () => { p.del = !p.del; render(); })
      );
      card.append(img, nm, acts); grid.append(card);
    });
  }

  goBtn.onclick = async () => {
    const keep = pages.filter(p => !p.del);
    if (!keep.length) { status.textContent = 'Nothing left to save — restore at least one page.'; return; }
    goBtn.disabled = true;
    status.textContent = 'Building your edited PDF…';
    try {
      const src = await window.PDFLib.PDFDocument.load(bytes);
      const out = await window.PDFLib.PDFDocument.create();
      const order = keep.map(p => p.n - 1);
      const copied = await out.copyPages(src, order);
      copied.forEach((cp, i) => {
        const orig = src.getPage(keep[i].n - 1).getRotation().angle;
        const total = (orig + keep[i].rot) % 360;
        if (total) cp.setRotation(window.PDFLib.degrees(total));
        out.addPage(cp);
      });
      const outBytes = await out.save();
      download(new Blob([outBytes], { type: 'application/pdf' }), `${file.name.replace(/\.pdf$/i, '')}-edited.pdf`);
      status.textContent = `Saved with ${keep.length} page${keep.length === 1 ? '' : 's'}.`;
    } catch (e) {
      status.textContent = 'Could not build the edited PDF. Try again.';
    }
    goBtn.disabled = false;
  };

  clearBtn.onclick = () => {
    file = null; bytes = null; pages = [];
    grid.hidden = true; grid.innerHTML = '';
    goBtn.disabled = true; clearBtn.disabled = true;
    status.textContent = 'Deleted pages are crossed out and left out of the saved PDF. Rotations and order apply when you download.';
  };
})();
