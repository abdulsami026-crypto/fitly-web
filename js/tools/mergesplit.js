/* PDF merge & split. Everything runs in the browser; nothing is uploaded.
   Uses the bundled pdf-lib (js/vendor/pdf-lib.min.js). */
(function () {
  'use strict';
  var F = (typeof window !== 'undefined' && window.Fitly) || {};
  var esc = F.esc || function (s) { return String(s); };
  var fmt = F.fmt || function (b) { return b + ' B'; };
  var download = F.download;
  var zipDownload = F.zipDownload;
  var baseName = F.baseName || function (n) { return n.replace(/\.[^.]+$/, ''); };
  function PL() {
    var lib = (typeof window !== 'undefined' ? window.PDFLib : null) || globalThis.PDFLib;
    if (!lib) throw new Error('PDF engine did not load. Reload the page.');
    return lib;
  }

  // ---- pure helpers (also exercised by the node test harness) ----

  // "1-3, 5" -> [1,2,3,5]. Throws an Error with a plain-language message.
  function parseRanges(input, maxPage) {
    if (!input || !input.trim()) throw new Error('Type some pages first — for example 1-3, 5.');
    var pages = {}, order = [];
    var parts = input.split(',');
    for (var k = 0; k < parts.length; k++) {
      var p = parts[k].trim();
      if (!p) continue;
      var m = p.match(/^(\d+)\s*-\s*(\d+)$/);
      if (m) {
        var a = +m[1], b = +m[2];
        if (a > b) { var t = a; a = b; b = t; }
        if (a < 1 || b > maxPage) throw new Error('Pages must be between 1 and ' + maxPage + '.');
        for (var i = a; i <= b; i++) { if (!pages[i]) { pages[i] = 1; order.push(i); } }
      } else if (/^\d+$/.test(p)) {
        var n = +p;
        if (n < 1 || n > maxPage) throw new Error('Pages must be between 1 and ' + maxPage + '.');
        if (!pages[n]) { pages[n] = 1; order.push(n); }
      } else {
        throw new Error('Can\u2019t read "' + p + '". Use numbers like 1-3, 5.');
      }
    }
    if (!order.length) throw new Error('Type some pages first — for example 1-3, 5.');
    return order.sort(function (x, y) { return x - y; });
  }

  function loadDoc(bytes) {
    return PL().PDFDocument.load(bytes, { ignoreEncryption: true });
  }

  // buffers: array of Uint8Array/ArrayBuffer -> { bytes, pages }
  async function mergePdfs(buffers) {
    var PDFDocument = PL().PDFDocument;
    var out = await PDFDocument.create();
    var total = 0;
    for (var i = 0; i < buffers.length; i++) {
      var src = await PDFDocument.load(buffers[i], { ignoreEncryption: true });
      var idx = src.getPageIndices();
      var copied = await out.copyPages(src, idx);
      copied.forEach(function (p) { out.addPage(p); });
      total += idx.length;
    }
    return { bytes: await out.save(), pages: total };
  }

  // pages: 1-based sorted array -> single PDF with those pages in that order
  async function extractPages(bytes, pages) {
    var PDFDocument = PL().PDFDocument;
    var src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    var out = await PDFDocument.create();
    var copied = await out.copyPages(src, pages.map(function (p) { return p - 1; }));
    copied.forEach(function (p) { out.addPage(p); });
    return { bytes: await out.save(), pages: pages.length };
  }

  // one single-page PDF per page -> [{ name, data }]
  async function splitAll(bytes, name) {
    var PDFDocument = PL().PDFDocument;
    var src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    var n = src.getPageCount();
    var base = baseName(name || 'page');
    var files = [];
    for (var i = 0; i < n; i++) {
      var out = await PDFDocument.create();
      var copied = await out.copyPages(src, [i]);
      out.addPage(copied[0]);
      files.push({ name: base + '-p' + (i + 1) + '.pdf', data: await out.save() });
    }
    return files;
  }

  function isPdf(f) {
    return f && (f.type === 'application/pdf' || /\.pdf$/i.test(f.name || ''));
  }

  function lockedErr(e) {
    var msg = String((e && e.message) || e);
    if (/encrypt|password|decrypt/i.test(msg)) return 'This PDF is locked with a password. Unlock it first, then try again.';
    if (/invalid|parse|header/i.test(msg)) return 'This file doesn\u2019t look like a valid PDF.';
    return 'Couldn\u2019t read this PDF (' + msg.slice(0, 120) + ').';
  }

  // ---- browser UI ----
  if (typeof document !== 'undefined') {
    var $ = function (id) { return document.getElementById(id); };

    /* tabs */
    var tabMerge = $('ms-tab-merge'), tabSplit = $('ms-tab-split');
    var paneMerge = $('ms-merge'), paneSplit = $('ms-split');
    function show(which) {
      var m = which === 'merge';
      paneMerge.hidden = !m; paneSplit.hidden = m;
      tabMerge.classList.toggle('ghost', !m); tabSplit.classList.toggle('ghost', m);
      tabMerge.setAttribute('aria-selected', String(m));
      tabSplit.setAttribute('aria-selected', String(!m));
    }
    tabMerge.addEventListener('click', function () { show('merge'); });
    tabSplit.addEventListener('click', function () { show('split'); });

    /* ---- merge pane ---- */
    var items = []; // { file, pages }
    var mList = $('ms-list'), mGo = $('ms-go'), mClear = $('ms-clear'), mStatus = $('ms-status');

    F.dropzone($('ms-drop'), $('ms-file'), async function (files) {
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        mStatus.textContent = 'Reading ' + f.name + '\u2026';
        try {
          var doc = await loadDoc(await f.arrayBuffer());
          items.push({ file: f, pages: doc.getPageCount() });
          mStatus.textContent = '';
        } catch (e) {
          mStatus.textContent = f.name + ': ' + lockedErr(e);
        }
      }
      renderMerge();
    }, isPdf);

    function renderMerge() {
      mList.hidden = !items.length;
      mGo.disabled = mClear.disabled = items.length < 2;
      mList.className = 'files'; mList.innerHTML = '';
      items.forEach(function (it, idx) {
        var row = document.createElement('div'); row.className = 'file';
        var badge = document.createElement('div'); badge.className = 'pdfbadge';
        badge.textContent = 'PDF';
        var mid = document.createElement('div');
        mid.innerHTML = '<div class="nm">' + esc(it.file.name) + '</div><div class="mt">' +
          esc(it.pages + (it.pages === 1 ? ' page' : ' pages') + ' \u00b7 ' + fmt(it.file.size)) + '</div>';
        var acts = document.createElement('div'); acts.className = 'acts';
        var mk = function (t, fn, dis) {
          var b = document.createElement('button'); b.className = 'btn ghost'; b.type = 'button';
          b.textContent = t; b.disabled = !!dis; b.onclick = fn; return b;
        };
        var mv = function (d) { return function () { var j = idx + d; var t = items[idx]; items[idx] = items[j]; items[j] = t; renderMerge(); }; };
        acts.append(
          mk('Up', mv(-1), idx === 0), mk('Down', mv(1), idx === items.length - 1),
          mk('Remove', function () { items.splice(idx, 1); renderMerge(); })
        );
        row.append(badge, mid, acts); mList.append(row);
      });
      if (!items.length) mStatus.textContent = 'Add at least two PDFs to merge them into one.';
    }

    mGo.addEventListener('click', async function () {
      mGo.disabled = true; mStatus.textContent = 'Merging\u2026';
      try {
        var bufs = [];
        for (var i = 0; i < items.length; i++) bufs.push(await items[i].file.arrayBuffer());
        var r = await mergePdfs(bufs);
        download(new Blob([r.bytes], { type: 'application/pdf' }), 'merged.pdf');
        mStatus.textContent = 'Done — ' + r.pages + ' pages in merged.pdf (' + fmt(r.bytes.length) + ').';
      } catch (e) {
        mStatus.textContent = lockedErr(e);
      }
      mGo.disabled = items.length < 2;
    });
    mClear.addEventListener('click', function () { items = []; renderMerge(); });

    /* ---- split pane ---- */
    var sp = { file: null, pages: 0 };
    var spInfo = $('sp-info'), spRange = $('sp-range');
    var spExtract = $('sp-extract'), spAll = $('sp-all'), spClear = $('sp-clear'), spStatus = $('sp-status');

    F.dropzone($('sp-drop'), $('sp-file'), async function (files) {
      var f = files[0];
      if (!f) return;
      spStatus.textContent = 'Reading ' + f.name + '\u2026';
      try {
        var doc = await loadDoc(await f.arrayBuffer());
        sp = { file: f, pages: doc.getPageCount() };
        spStatus.textContent = '';
      } catch (e) {
        sp = { file: null, pages: 0 };
        spStatus.textContent = f.name + ': ' + lockedErr(e);
      }
      renderSplit();
    }, isPdf);

    function renderSplit() {
      var has = !!sp.file;
      spInfo.hidden = !has;
      if (has) spInfo.innerHTML = '<div class="nm">' + esc(sp.file.name) + '</div><div class="mt">' +
        esc(sp.pages + (sp.pages === 1 ? ' page' : ' pages') + ' \u00b7 ' + fmt(sp.file.size)) + '</div>';
      spExtract.disabled = spAll.disabled = spClear.disabled = !has;
      if (has) spRange.placeholder = 'e.g. 1-' + Math.min(sp.pages, 3) + (sp.pages > 3 ? ', ' + sp.pages : '');
    }

    spExtract.addEventListener('click', async function () {
      spExtract.disabled = true;
      try {
        var pages = parseRanges(spRange.value, sp.pages);
        spStatus.textContent = 'Extracting ' + pages.length + (pages.length === 1 ? ' page' : ' pages') + '\u2026';
        var r = await extractPages(await sp.file.arrayBuffer(), pages);
        var nm = baseName(sp.file.name) + '-pages-' + pages.join('-') + '.pdf';
        download(new Blob([r.bytes], { type: 'application/pdf' }), nm);
        spStatus.textContent = 'Done — ' + nm + ' (' + fmt(r.bytes.length) + ').';
      } catch (e) {
        spStatus.textContent = e.message || lockedErr(e);
      }
      spExtract.disabled = false;
    });

    spAll.addEventListener('click', async function () {
      spAll.disabled = true;
      try {
        spStatus.textContent = 'Splitting ' + sp.pages + ' pages\u2026';
        var files = await splitAll(await sp.file.arrayBuffer(), sp.file.name);
        await zipDownload(files.map(function (f) {
          return { name: f.name, blob: new Blob([f.data], { type: 'application/pdf' }) };
        }), baseName(sp.file.name) + '-pages.zip');
        spStatus.textContent = 'Done — ' + files.length + ' one-page PDFs in the ZIP.';
      } catch (e) {
        spStatus.textContent = lockedErr(e);
      }
      spAll.disabled = false;
    });
    spClear.addEventListener('click', function () { sp = { file: null, pages: 0 }; spRange.value = ''; spStatus.textContent = ''; renderSplit(); });

    show('merge');
    renderMerge();
    renderSplit();
  }

  // node test harness
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseRanges: parseRanges, mergePdfs: mergePdfs, extractPages: extractPages, splitAll: splitAll };
  }
})();
