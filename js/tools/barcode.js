(() => {
  const $ = id => document.getElementById(id);
  const status = $('status');
  let svgText = '';

  const syncLabels = () => {
    $('wv').textContent = $('w').value;
    $('hv').textContent = $('h').value;
  };
  ['w', 'h'].forEach(id => $(id).addEventListener('input', syncLabels));
  syncLabels();

  function draw() {
    const val = $('val').value.trim();
    if (!val) { status.textContent = 'Type something for the barcode first.'; return; }
    try {
      window.JsBarcode('#bc', val, {
        format: $('fmt').value,
        width: +$('w').value,
        height: +$('h').value,
        displayValue: true,
        margin: 12,
        background: '#ffffff'
      });
      svgText = document.getElementById('bc').outerHTML;
      $('dl-svg').disabled = false; $('dl-png').disabled = false;
      status.textContent = 'Barcode ready. Download it as SVG (sharp at any size) or PNG.';
    } catch (e) {
      $('dl-svg').disabled = true; $('dl-png').disabled = true;
      const fmt = $('fmt').value;
      status.textContent = fmt === 'EAN13'
        ? 'EAN13 needs 12 or 13 digits only.'
        : fmt === 'UPC'
          ? 'UPC needs 11 or 12 digits only.'
          : 'That value does not fit this barcode type. Try CODE128, which takes letters and numbers.';
    }
  }
  $('go').onclick = draw;
  $('val').addEventListener('keydown', e => { if (e.key === 'Enter') draw(); });
  $('fmt').onchange = () => { if ($('val').value.trim()) draw(); };

  $('dl-svg').onclick = () => {
    const blob = new Blob([svgText], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'barcode.svg'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  $('dl-png').onclick = () => {
    const svg = document.getElementById('bc');
    const w = svg.getBoundingClientRect().width, h = svg.getBoundingClientRect().height;
    const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = Math.round(w * 2); c.height = Math.round(h * 2);
      const x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
      x.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b); a.download = 'barcode.png'; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }, 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); status.textContent = 'PNG export failed — the SVG download still works.'; };
    img.src = url;
  };
})();
