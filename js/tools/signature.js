(() => {
  const $ = id => document.getElementById(id);
  const pad = $('pad'), ctx = pad.getContext('2d');
  let strokes = []; // {color, width, pts:[[x,y]]}
  let cur = null;

  const pos = e => {
    const r = pad.getBoundingClientRect();
    return [(e.clientX - r.left) * pad.width / r.width, (e.clientY - r.top) * pad.height / r.height];
  };

  function drawStroke(s) {
    if (s.pts.length < 2) return;
    ctx.strokeStyle = s.color; ctx.lineWidth = s.width;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(s.pts[0][0], s.pts[0][1]);
    for (let i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i][0], s.pts[i][1]);
    ctx.stroke();
  }

  function redraw() {
    ctx.clearRect(0, 0, pad.width, pad.height);
    if ($('mode').value === 'type') {
      const name = $('name').value.trim();
      if (name) {
        ctx.fillStyle = $('ink').value;
        ctx.font = 'italic 92px "Segoe Script", "Brush Script MT", "Comic Sans MS", cursive';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(name, pad.width / 2, pad.height / 2 + 8);
      }
    } else {
      strokes.forEach(drawStroke);
    }
  }

  pad.addEventListener('pointerdown', e => {
    if ($('mode').value !== 'draw') return;
    pad.setPointerCapture(e.pointerId);
    cur = { color: $('ink').value, width: +$('thick').value, pts: [pos(e)] };
    strokes.push(cur);
  });
  pad.addEventListener('pointermove', e => {
    if (!cur) return;
    cur.pts.push(pos(e));
    drawStroke({ color: cur.color, width: cur.width, pts: cur.pts.slice(-2) });
  });
  const end = () => { cur = null; };
  pad.addEventListener('pointerup', end);
  pad.addEventListener('pointercancel', end);

  $('mode').onchange = () => {
    $('typerow').hidden = $('mode').value !== 'type';
    redraw();
  };
  $('name').addEventListener('input', redraw);
  $('ink').addEventListener('input', () => { if ($('mode').value === 'type') redraw(); });
  $('thick').addEventListener('input', () => { $('tv').textContent = $('thick').value; });

  $('dl').onclick = () => {
    pad.toBlob(b => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b); a.download = 'signature.png'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }, 'image/png');
  };
  $('clear').onclick = () => { strokes = []; $('name').value = ''; redraw(); };
})();
