(() => {
  const { fmt, toBlob, dropzone, download } = window.Fitly;
  const $ = id => document.getElementById(id);

  const PRESETS = {
    '35x45': { w: 413, h: 531, wmm: 35, hmm: 45, label: '35 × 45 mm' },
    '51x51': { w: 600, h: 600, wmm: 51, hmm: 51, label: '51 × 51 mm (2 × 2 in)' },
    '33x48': { w: 390, h: 567, wmm: 33, hmm: 48, label: '33 × 48 mm' },
    '40x60': { w: 472, h: 709, wmm: 40, hmm: 60, label: '40 × 60 mm' }
  };

  const stage = $('pp-stage'), ctx = stage.getContext('2d');
  const zoomEl = $('pp-zoom'), editor = $('pp-editor'), emptyNote = $('pp-empty');
  let img = null, imgName = 'photo';
  let zoom = 1, ox = 0, oy = 0; // pan offsets in CSS px, relative to cover-centred
  let view = { w: 0, h: 0, dpr: 1 };

  const preset = () => PRESETS[$('pp-preset').value];

  dropzone($('drop'), $('file'), files => { if (files[0]) load(files[0]); }, f => f.type.startsWith('image/'));

  async function load(file) {
    imgName = file.name.replace(/\.[^.]+$/, '') || 'photo';
    try {
      img = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (e) {
      img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = URL.createObjectURL(file);
      });
    }
    zoom = 1; ox = 0; oy = 0; zoomEl.value = 1;
    editor.hidden = false; emptyNote.hidden = true;
    ['pp-dl-photo', 'pp-dl-4x6', 'pp-dl-a4', 'pp-clear'].forEach(id => $(id).disabled = false);
    resize(); updateMeta();
  }

  function frameRect() {
    const p = preset(), a = p.w / p.h;
    let fh = view.h * 0.86, fw = fh * a;
    if (fw > view.w * 0.82) { fw = view.w * 0.82; fh = fw / a; }
    return { x: (view.w - fw) / 2, y: (view.h - fh) / 2, w: fw, h: fh };
  }

  function drawGeom() {
    const f = frameRect();
    const scale = Math.max(f.w / img.width, f.h / img.height) * zoom;
    const dw = img.width * scale, dh = img.height * scale;
    const dx = f.x + (f.w - dw) / 2 + ox, dy = f.y + (f.h - dh) / 2 + oy;
    return { f, scale, dx, dy, dw, dh };
  }

  function clampPan() {
    if (!img) return;
    const g = drawGeom();
    const mx = Math.max(0, (g.dw - g.f.w) / 2), my = Math.max(0, (g.dh - g.f.h) / 2);
    ox = Math.min(mx, Math.max(-mx, ox)); oy = Math.min(my, Math.max(-my, oy));
  }

  function draw() {
    if (!img) return;
    clampPan();
    const { f } = drawGeom();
    const g = drawGeom();
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = '#131e30';
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.drawImage(img, g.dx, g.dy, g.dw, g.dh);
    // dim outside the frame
    ctx.beginPath();
    ctx.rect(0, 0, view.w, view.h);
    ctx.rect(f.x, f.y, f.w, f.h);
    ctx.fillStyle = 'rgba(9,14,24,.66)';
    ctx.fill('evenodd');
    // face guide: head oval + chin line
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.8)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.ellipse(f.x + f.w / 2, f.y + f.h * 0.44, f.w * 0.315, f.h * 0.335, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(f.x + f.w * 0.14, f.y + f.h * 0.115);
    ctx.lineTo(f.x + f.w * 0.86, f.y + f.h * 0.115);
    ctx.stroke();
    ctx.restore();
    // frame border
    ctx.strokeStyle = '#b9e356';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(f.x, f.y, f.w, f.h);
  }

  function resize() {
    const r = stage.getBoundingClientRect();
    view = { w: r.width, h: r.height, dpr: Math.min(2, window.devicePixelRatio || 1) };
    stage.width = Math.round(r.width * view.dpr);
    stage.height = Math.round(r.height * view.dpr);
    draw();
  }
  window.addEventListener('resize', () => { if (img) resize(); });

  // ---- pan / zoom interactions
  const pointers = new Map();
  let lastPinch = 0;
  stage.addEventListener('pointerdown', e => {
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lastPinch = 0;
  });
  stage.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) { ox += e.clientX - prev.x; oy += e.clientY - prev.y; draw(); }
    else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (lastPinch) setZoom(zoom * (d / lastPinch), false);
      lastPinch = d;
    }
  });
  ['pointerup', 'pointercancel'].forEach(ev => stage.addEventListener(ev, e => { pointers.delete(e.pointerId); lastPinch = 0; }));
  stage.addEventListener('wheel', e => { e.preventDefault(); setZoom(zoom * (e.deltaY < 0 ? 1.08 : 0.93), true); }, { passive: false });

  function setZoom(z, syncSlider) {
    zoom = Math.min(4, Math.max(1, z));
    if (syncSlider) zoomEl.value = zoom;
    draw();
  }
  zoomEl.addEventListener('input', () => setZoom(+zoomEl.value, false));
  $('pp-reset').addEventListener('click', () => { zoom = 1; ox = 0; oy = 0; zoomEl.value = 1; draw(); });
  $('pp-preset').addEventListener('change', () => { zoom = 1; ox = 0; oy = 0; zoomEl.value = 1; draw(); updateMeta(); });
  $('pp-limit').addEventListener('change', updateMeta);

  function updateMeta() {
    if (!img) return;
    const p = preset();
    $('pp-meta').textContent = `Your photo will be ${p.w} × ${p.h} px at 300 DPI (${p.label}), JPG. Print sheets are made from the same photo.`;
  }

  // ---- export the cropped photo
  function cropCanvas() {
    const p = preset();
    const c = document.createElement('canvas');
    c.width = p.w; c.height = p.h;
    const g = drawGeom();
    const sx = (g.f.x - g.dx) / g.scale, sy = (g.f.y - g.dy) / g.scale;
    const sw = g.f.w / g.scale, sh = g.f.h / g.scale;
    c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, p.w, p.h);
    return c;
  }

  async function photoBlob() {
    const c = cropCanvas();
    const kb = +$('pp-limit').value;
    if (!kb) return toBlob(c, 'image/jpeg', 0.92);
    const limit = kb * 1024;
    let q = 0.92, blob = await toBlob(c, 'image/jpeg', q);
    while (blob.size > limit && q > 0.45) { q -= 0.08; blob = await toBlob(c, 'image/jpeg', q); }
    return blob;
  }

  $('pp-dl-photo').addEventListener('click', async () => {
    if (!img) return;
    const blob = await photoBlob();
    download(blob, `${imgName}-passport.jpg`);
    $('pp-meta').textContent = `Downloaded: ${preset().w} × ${preset().h} px, ${fmt(blob.size)}. Nothing was uploaded — the photo was made on your device.`;
  });

  // ---- print sheets
  function bestLayout(W, H, pw, ph, margin, gap) {
    const fit = (w, h) => ({
      cols: Math.max(1, Math.floor((w - margin * 2 + gap) / (pw + gap))),
      rows: Math.max(1, Math.floor((h - margin * 2 + gap) / (ph + gap)))
    });
    const a = fit(W, H), b = fit(H, W);
    return a.cols * a.rows >= b.cols * b.rows ? { ...a, W, H } : { ...b, W: H, H: W };
  }

  async function sheet(paperWpx, paperHpx, name) {
    if (!img) return;
    const p = preset();
    const mm = v => Math.round(v / 25.4 * 300);
    const pw = mm(p.wmm), ph = mm(p.hmm), gap = mm(5), margin = mm(9);
    const L = bestLayout(paperWpx, paperHpx, pw, ph, margin, gap);
    const c = document.createElement('canvas');
    c.width = L.W; c.height = L.H;
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    const photo = cropCanvas();
    const totalW = L.cols * pw + (L.cols - 1) * gap, totalH = L.rows * ph + (L.rows - 1) * gap;
    const startX = (c.width - totalW) / 2, startY = (c.height - totalH) / 2;
    x.strokeStyle = '#9aa5b5'; x.lineWidth = 2; x.setLineDash([10, 8]);
    for (let r = 0; r < L.rows; r++) for (let col = 0; col < L.cols; col++) {
      const dx = startX + col * (pw + gap), dy = startY + r * (ph + gap);
      x.drawImage(photo, dx, dy, pw, ph);
      x.strokeRect(dx, dy, pw, ph);
    }
    const blob = await toBlob(c, 'image/png');
    download(blob, `${imgName}-${name}.png`);
    $('pp-meta').textContent = `Print sheet downloaded: ${L.cols * L.rows} copies on one sheet. Print it at 100% size (do not choose "fit to page") and cut along the dashed lines.`;
  }

  $('pp-dl-4x6').addEventListener('click', () => sheet(1200, 1800, 'print-4x6'));
  $('pp-dl-a4').addEventListener('click', () => sheet(2480, 3508, 'print-a4'));
  $('pp-clear').addEventListener('click', () => {
    img = null; editor.hidden = true; emptyNote.hidden = false;
    ['pp-dl-photo', 'pp-dl-4x6', 'pp-dl-a4', 'pp-clear'].forEach(id => $(id).disabled = true);
    $('pp-meta').textContent = '';
  });
})();
