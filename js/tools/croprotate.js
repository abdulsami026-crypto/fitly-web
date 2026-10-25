(() => {
  const { esc, fmt, toBlob, dropzone, download, baseName } = window.Fitly;
  const $ = id => document.getElementById(id);
  const stage = $('cr-stage'), ctx = stage.getContext('2d');
  const editor = $('editor'), dlBtn = $('dl'), clearBtn = $('clear'), status = $('status');
  let bmp = null, fileName = 'photo';
  let zoom = 1, ox = 0, oy = 0;
  let drag = null;

  dropzone($('drop'), $('file'), files => {
    if (!files.length) return;
    load(files[0]);
  }, f => f.type.startsWith('image/'));

  async function load(file) {
    fileName = file.name;
    const b = await createImageBitmap(file, { imageOrientation: 'from-image' });
    bmp && bmp.close && bmp.close();
    bmp = b;
    zoom = 1; ox = 0; oy = 0; $('zoom').value = 100; $('zv').textContent = '100%';
    editor.hidden = false; dlBtn.disabled = false; clearBtn.disabled = false;
    draw();
  }

  function frameRect() {
    const pad = 24, W = stage.width, H = stage.height;
    const av = +$('aspect').value;
    const ar = av === 0 ? bmp.width / bmp.height : av;
    let w = W - pad * 2, h = w / ar;
    if (h > H - pad * 2) { h = H - pad * 2; w = h * ar; }
    return { x: (W - w) / 2, y: (H - h) / 2, w, h };
  }

  function drawGeom() {
    const f = frameRect();
    const scale = Math.max(f.w / bmp.width, f.h / bmp.height) * zoom;
    const dw = bmp.width * scale, dh = bmp.height * scale;
    const dx = f.x + (f.w - dw) / 2 + ox, dy = f.y + (f.h - dh) / 2 + oy;
    return { f, scale, dx, dy, dw, dh };
  }

  function draw() {
    if (!bmp) return;
    const g = drawGeom();
    ctx.fillStyle = '#131e30';
    ctx.fillRect(0, 0, stage.width, stage.height);
    ctx.drawImage(bmp, g.dx, g.dy, g.dw, g.dh);
    // dim everything outside the frame, then draw the frame
    ctx.fillStyle = 'rgba(10,16,28,0.62)';
    ctx.fillRect(0, 0, stage.width, g.f.y);
    ctx.fillRect(0, g.f.y + g.f.h, stage.width, stage.height - g.f.y - g.f.h);
    ctx.fillRect(0, g.f.y, g.f.x, g.f.h);
    ctx.fillRect(g.f.x + g.f.w, g.f.y, stage.width - g.f.x - g.f.w, g.f.h);
    ctx.strokeStyle = '#b9e356'; ctx.lineWidth = 3;
    ctx.strokeRect(g.f.x, g.f.y, g.f.w, g.f.h);
  }

  // drag to pan
  stage.addEventListener('pointerdown', e => {
    if (!bmp) return;
    stage.setPointerCapture(e.pointerId);
    drag = { x: e.clientX - ox, y: e.clientY - oy };
  });
  stage.addEventListener('pointermove', e => {
    if (!drag) return;
    ox = e.clientX - drag.x; oy = e.clientY - drag.y; draw();
  });
  const endDrag = () => { drag = null; };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  $('zoom').addEventListener('input', () => {
    zoom = +$('zoom').value / 100;
    $('zv').textContent = $('zoom').value + '%';
    draw();
  });
  $('aspect').addEventListener('change', draw);

  async function rebase(canvas) {
    const b = await createImageBitmap(canvas);
    bmp && bmp.close && bmp.close();
    bmp = b;
    zoom = 1; ox = 0; oy = 0; $('zoom').value = 100; $('zv').textContent = '100%';
    draw();
  }
  $('rotl').onclick = () => {
    const c = document.createElement('canvas'); c.width = bmp.height; c.height = bmp.width;
    const x = c.getContext('2d');
    x.translate(c.width / 2, c.height / 2); x.rotate(-Math.PI / 2);
    x.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
    rebase(c);
  };
  $('rotr').onclick = () => {
    const c = document.createElement('canvas'); c.width = bmp.height; c.height = bmp.width;
    const x = c.getContext('2d');
    x.translate(c.width / 2, c.height / 2); x.rotate(Math.PI / 2);
    x.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
    rebase(c);
  };
  $('flip').onclick = () => {
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    const x = c.getContext('2d');
    x.translate(c.width, 0); x.scale(-1, 1);
    x.drawImage(bmp, 0, 0);
    rebase(c);
  };
  $('reset').onclick = () => { zoom = 1; ox = 0; oy = 0; $('zoom').value = 100; $('zv').textContent = '100%'; draw(); };

  const syncQ = () => { $('qrow').hidden = $('fmt').value === 'image/png'; $('qv').textContent = $('q').value + '%'; };
  $('fmt').onchange = syncQ; $('q').oninput = syncQ; syncQ();

  dlBtn.onclick = async () => {
    if (!bmp) return;
    const g = drawGeom();
    const sx = (g.f.x - g.dx) / g.scale, sy = (g.f.y - g.dy) / g.scale;
    const sw = Math.round(g.f.w / g.scale), sh = Math.round(g.f.h / g.scale);
    const c = document.createElement('canvas'); c.width = sw; c.height = sh;
    const x = c.getContext('2d');
    const type = $('fmt').value;
    if (type === 'image/jpeg') { x.fillStyle = '#fff'; x.fillRect(0, 0, sw, sh); }
    x.drawImage(bmp, sx, sy, sw, sh, 0, 0, sw, sh);
    const blob = await toBlob(c, type, type === 'image/png' ? undefined : +$('q').value / 100);
    const ext = type === 'image/png' ? 'png' : 'jpg';
    download(blob, `${baseName(fileName)}-cropped.${ext}`);
    status.textContent = `Saved ${sw} × ${sh}px (${esc(fmt(blob.size))}).`;
  };

  clearBtn.onclick = () => {
    bmp && bmp.close && bmp.close(); bmp = null;
    editor.hidden = true; dlBtn.disabled = true; clearBtn.disabled = true;
    status.textContent = 'Drag the photo to move it under the frame. The frame shows exactly what will be saved.';
  };
})();
