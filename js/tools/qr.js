(() => {
  const { download } = window.Fitly;
  const $ = id => document.getElementById(id);
  qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
  const canvas = $('qr'), ctx = canvas.getContext('2d');
  let model = null;

  const wifiEsc = s => s.replace(/([\\;,:"])/g, '\\$1');
  function payload() {
    if ($('kind').value === 'wifi') {
      const ssid = $('ssid').value.trim();
      if (!ssid) return '';
      const t = $('sec').value;
      return `WIFI:T:${t};S:${wifiEsc(ssid)};` + (t === 'nopass' ? '' : `P:${wifiEsc($('pass').value)};`) + ';';
    }
    return $('text').value;
  }

  function build() {
    $('textrow').hidden = $('kind').value === 'wifi';
    $('wifirow').hidden = $('kind').value !== 'wifi';
    const data = payload();
    const out = $('out');
    if (!data) { model = null; ctx.clearRect(0, 0, canvas.width, canvas.height); out.hidden = true; $('empty').hidden = false; return; }
    out.hidden = false; $('empty').hidden = true;
    try {
      const q = qrcode(0, $('ecc').value); q.addData(data); q.make(); model = q;
    } catch (e) { model = null; out.hidden = true; $('empty').hidden = false; $('empty').textContent = 'That is too much text for a QR code. Shorten it or lower the error correction.'; return; }
    draw();
  }

  function draw() {
    const n = model.getModuleCount(), quiet = 4, px = +$('size').value;
    const cell = Math.max(1, Math.floor(px / (n + quiet * 2)));
    const side = cell * (n + quiet * 2);
    canvas.width = canvas.height = side;
    ctx.fillStyle = $('bg').value; ctx.fillRect(0, 0, side, side);
    ctx.fillStyle = $('fg').value;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (model.isDark(r, c)) ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
    $('dim').textContent = `${side}×${side}px`;
  }

  function svg() {
    const n = model.getModuleCount(), quiet = 4, s = n + quiet * 2;
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (model.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" shape-rendering="crispEdges"><rect width="${s}" height="${s}" fill="${$('bg').value}"/><path d="${d}" fill="${$('fg').value}"/></svg>`;
  }

  ['kind', 'text', 'ssid', 'pass', 'sec', 'ecc', 'size', 'fg', 'bg'].forEach(id => { $(id).addEventListener('input', build); $(id).addEventListener('change', build); });
  $('png').onclick = () => model && canvas.toBlob(b => download(b, 'fitly-qr.png'));
  $('svg').onclick = () => model && download(new Blob([svg()], { type: 'image/svg+xml' }), 'fitly-qr.svg');
  build();
})();
