(() => {
  const $ = id => document.getElementById(id);
  const ta = $('text');
  const STOP = new Set('the a an and or but of to in on at for with is are was were be been it this that as by from not you your i we they he she his her our their its so if then than there have has had do does did will would can could'.split(' '));

  function update() {
    const t = ta.value;
    const words = (t.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []);
    const sentences = (t.match(/[^.!?۔]+[.!?۔]+|[^.!?۔]+$/g) || []).filter(s => s.trim()).length;
    const paras = t.split(/\n\s*\n/).filter(p => p.trim()).length;
    const set = (id, v) => $(id).textContent = v;
    set('w', words.length.toLocaleString());
    set('c', t.length.toLocaleString());
    set('cn', t.replace(/\s/g, '').length.toLocaleString());
    set('s', sentences.toLocaleString());
    set('p', paras.toLocaleString());
    const mins = words.length / 200;
    set('rt', mins < 1 ? (words.length ? '<1 min' : '0 min') : Math.round(mins) + ' min');

    const freq = new Map();
    words.forEach(w => { const k = w.toLowerCase(); if (k.length > 2 && !STOP.has(k)) freq.set(k, (freq.get(k) || 0) + 1); });
    const top = [...freq].sort((a, b) => b[1] - a[1]).slice(0, 8).filter(x => x[1] > 1);
    $('kw').innerHTML = top.map(([k, n]) => `<li>${k.replace(/[<>&]/g, '')} <b>${n}</b></li>`).join('');
    $('kwh').hidden = !top.length;
  }
  ta.addEventListener('input', update);
  $('clear').onclick = () => { ta.value = ''; update(); ta.focus(); };
  $('copy').onclick = async () => {
    try { await navigator.clipboard.writeText(ta.value); $('copy').textContent = 'Copied'; setTimeout(() => $('copy').textContent = 'Copy text', 1500); } catch (e) { ta.select(); }
  };
  update();
})();
