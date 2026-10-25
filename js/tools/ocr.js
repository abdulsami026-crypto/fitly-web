(() => {
  const { esc, fmt, dropzone, download, baseName } = window.Fitly;
  const $ = id => document.getElementById(id);
  const goBtn = $('go'), clearBtn = $('clear'), status = $('status'), outwrap = $('outwrap');
  const out = $('out'), counts = $('counts');
  let file = null, fileUrl = null, worker = null, workerPromise = null;

  dropzone($('drop'), $('file'), files => {
    if (!files.length) return;
    file = files[0];
    fileUrl && URL.revokeObjectURL(fileUrl);
    fileUrl = URL.createObjectURL(file);
    $('pv').src = fileUrl;
    $('preview').hidden = false;
    goBtn.disabled = false; clearBtn.disabled = false;
    outwrap.hidden = true;
    status.textContent = 'Photo ready. Tap “Read the text”.';
  }, f => f.type.startsWith('image/'));

  function loadMain() {
    if (window.Tesseract) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = new URL('../js/vendor/tesseract/tesseract.min.js', location.href).href;
      s.onload = () => res();
      s.onerror = () => rej(new Error('engine download failed'));
      document.head.appendChild(s);
    });
  }

  async function getWorker() {
    if (workerPromise) return workerPromise;
    workerPromise = (async () => {
      await loadMain();
      const base = new URL('../js/vendor/tesseract/', location.href).href;
      worker = await window.Tesseract.createWorker('eng', undefined, {
        workerPath: base + 'worker.min.js',
        corePath: base + 'tesseract-core-simd-lstm.wasm.js',
        langPath: base,
        cacheMethod: 'none',
        logger: m => {
          if (m.status === 'recognizing text') status.textContent = `Reading… ${Math.round(m.progress * 100)}%`;
          else if (m.status) status.textContent = m.status.replace('loading', 'Loading') + '…';
        }
      });
      return worker;
    })();
    return workerPromise;
  }

  goBtn.onclick = async () => {
    if (!file) return;
    goBtn.disabled = true;
    status.textContent = 'Loading the reading engine — a one-time download, then it works offline.';
    try {
      const w = await getWorker();
      status.textContent = 'Reading…';
      const { data: { text } } = await w.recognize(fileUrl);
      out.value = (text || '').trim();
      outwrap.hidden = false;
      const words = out.value ? out.value.split(/\s+/).length : 0;
      counts.textContent = `${words} words · ${out.value.length} characters. Check the text before using it — printed text reads best.`;
      status.textContent = out.value ? 'Done. You can edit the text below before copying it.' : 'No text was found in this photo. Try a brighter, straighter photo.';
    } catch (e) {
      status.textContent = 'Reading needs a connection the first time (one download, then it works offline). Try again when you are online.';
      workerPromise = null;
    }
    goBtn.disabled = false;
  };

  $('copy').onclick = async () => {
    try { await navigator.clipboard.writeText(out.value); status.textContent = 'Copied.'; }
    catch (e) { out.select(); document.execCommand('copy'); status.textContent = 'Copied.'; }
  };
  $('dl').onclick = () => {
    download(new Blob([out.value], { type: 'text/plain' }), `${baseName(file.name)}.txt`);
  };
  clearBtn.onclick = () => {
    file = null;
    fileUrl && URL.revokeObjectURL(fileUrl); fileUrl = null;
    $('preview').hidden = true; outwrap.hidden = true;
    goBtn.disabled = true; clearBtn.disabled = true;
    status.textContent = 'The reading engine downloads once the first time you use it, then it works offline.';
  };
})();
