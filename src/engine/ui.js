// Minimal DOM UI kit: tabs, sliders, toggles, readouts, toasts, info card. No framework.
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

export function createUI(root) {
  const bar = h('header', 'bar');
  const brand = h('div', 'brand', '<b>OpenLearn</b><span>v3 · gesture prototype</span>');
  const modes = h('nav', 'modes'); bar.append(brand, modes);
  const sheet = h('aside', 'sheet');
  const grip = h('button', 'grip', '<i></i>'); grip.setAttribute('aria-label', 'Toggle panel');
  grip.onclick = () => sheet.classList.toggle('min');
  const tabbar = h('div', 'tabbar'); const body = h('div', 'sheet-body');
  sheet.append(grip, tabbar, body);
  const toastEl = h('div', 'toast'); const card = h('div', 'card'); card.style.display = 'none';
  const hud = h('div', 'hud');
  root.append(bar, sheet, toastEl, card, hud);

  let toastT;
  const api = {
    root, hud,
    toast(msg, kind = '') { toastEl.textContent = msg; toastEl.className = 'toast show ' + kind; clearTimeout(toastT); toastT = setTimeout(() => (toastEl.className = 'toast'), 2800); },
    modes(items, current, onPick) {
      modes.innerHTML = '';
      for (const [id, label] of items) { const b = h('button', id === current ? 'on' : '', label); b.onclick = () => onPick(id); modes.append(b); }
    },
    tabs(defs) {
      tabbar.innerHTML = ''; body.innerHTML = '';
      const panes = defs.map((d, i) => {
        const b = h('button', i === 0 ? 'on' : '', d.name); const p = h('div', 'pane'); p.hidden = i !== 0;
        b.onclick = () => { [...tabbar.children].forEach((x) => x.classList.remove('on')); b.classList.add('on'); panes.forEach((q) => (q.hidden = q !== p)); sheet.classList.remove('min'); d.onShow && d.onShow(); };
        tabbar.append(b); body.append(p); d.build(p, api); return p;
      });
      return panes;
    },
    group(parent, title, open = true) {
      const d = h('details', 'grp'); d.open = open; d.append(h('summary', '', title)); const c = h('div', 'grp-body'); d.append(c); parent.append(d); return c;
    },
    slider(parent, {label, min, max, step = 1, value = 0, unit = '', fmt, onInput, hint, go = false}) {
      const wrap = h('label', 'row'); const top = h('div', 'rowtop');
      const name = h('span', 'name', label); const val = h('output', 'val'); top.append(name, val);
      const inp = h('input'); inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = value;
      const show = (v) => { val.textContent = (fmt ? fmt(+v) : (+v).toFixed(step < 1 ? 1 : 0)) + unit; };
      show(value);
      inp.oninput = () => { show(inp.value); onInput && onInput(+inp.value); };
      wrap.append(top, inp); if (hint) wrap.append(h('small', '', hint));
      // optional exact entry: type a number and press Go (or Enter); the value is clamped to the slider range
      let num = null, gob = null;
      if (go) {
        const row = h('div', 'gorow'); num = h('input'); num.type = 'number'; num.min = min; num.max = max; num.step = 'any'; num.placeholder = 'type value' + (unit ? ' (' + unit.trim() + ')' : '');
        gob = h('button', 'btn go', 'Go'); gob.type = 'button';
        const doGo = (e) => { if (e) { e.preventDefault(); e.stopPropagation(); } if (num.value === '') return; const v = Math.min(+inp.max, Math.max(+inp.min, +num.value)); inp.value = v; show(v); num.value = (+v).toFixed(step < 1 ? 1 : 0); onInput && onInput(v); };
        gob.onclick = doGo; num.onkeydown = (e) => { if (e.key === 'Enter') doGo(e); }; row.append(num, gob); wrap.append(row);
      }
      parent.append(wrap);
      return {el: wrap, set(v) { inp.value = v; show(v); }, get: () => +inp.value, setRange(a, b) { inp.min = a; inp.max = b; if (num) { num.min = a; num.max = b; } }, disabled(d) { inp.disabled = d; if (num) { num.disabled = d; gob.disabled = d; } }};
    },
    toggle(parent, {label, value = false, onChange}) {
      const wrap = h('label', 'row tog'); const inp = h('input'); inp.type = 'checkbox'; inp.checked = value;
      wrap.append(h('span', 'name', label), inp, h('i', 'sw')); inp.onchange = () => onChange(inp.checked); parent.append(wrap);
      return {set(v) { inp.checked = v; }, get: () => inp.checked};
    },
    segmented(parent, {label, options, value, onChange}) {
      const wrap = h('div', 'row'); wrap.append(h('div', 'name', label)); const seg = h('div', 'seg');
      const btns = options.map(([v, t]) => { const b = h('button', v === value ? 'on' : '', t); b.onclick = () => { btns.forEach((x) => x.classList.remove('on')); b.classList.add('on'); onChange(v); }; seg.append(b); return b; });
      wrap.append(seg); parent.append(wrap); return {set(v) { btns.forEach((b, i) => b.classList.toggle('on', options[i][0] === v)); }};
    },
    button(parent, label, onClick, cls = '') { const b = h('button', 'btn ' + cls, label); b.onclick = onClick; parent.append(b); return b; },
    readout(parent, label) {
      const r = h('div', 'ro'); const v = h('b', '', '—'); r.append(h('span', '', label), v); parent.append(r);
      return {set(t, state = '') { v.textContent = t; r.className = 'ro ' + state; }};
    },
    note(parent, html, cls = 'note') { const n = h('p', cls, html); parent.append(n); return n; },
    el: h,
    showCard({title, subtitle, html, onClose, nav}) {
      card.innerHTML = '';
      const x = h('button', 'x', '✕'); x.onclick = () => { card.style.display = 'none'; onClose && onClose(); };
      card.append(x, h('h3', '', title)); if (subtitle) card.append(h('div', 'sub', subtitle));
      card.append(h('div', 'txt', html));
      if (nav) { const n = h('div', 'cardnav'); nav.forEach(([t, f]) => { const b = h('button', 'btn', t); b.onclick = f; n.append(b); }); card.append(n); }
      card.style.display = 'block';
    },
    hideCard() { card.style.display = 'none'; },
  };
  return api;
}
