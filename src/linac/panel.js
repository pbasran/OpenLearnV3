// Linac UI: motion controls, field shaping, beam & dose physics, guided treatment workflow, component explorer.
import {modelDescriptions} from './data.js';
import {ENERGIES, pddCAX, outputFactor, oar} from './dose.js';
import {plot} from '../engine/plot.js';
import * as THREE from 'three';
import {ISO} from './linac.js';
import {PH} from './couch.js';

const deg = (v) => v.toFixed(1) + '°', cm = (m) => (m * 100).toFixed(1);

const PLANS = {
  qa: {name: 'Output check (QA)', blurb: 'Water-phantom calibration geometry: one AP beam, 10 × 10 cm, iso at 10 cm depth.', energy: 6, mu: 100,
    beams: [{g: 0, c: 0, t: 0, shape: 'rect', fw: 10, fl: 10, label: 'AP'}]},
  parallel: {name: 'Opposed lateral pair', blurb: 'Two parallel-opposed beams from patient left and right — the classic 2-field technique.', energy: 6, mu: 100,
    beams: [{g: 90, c: 0, t: 0, shape: 'rect', fw: 12, fl: 10, label: 'Left lateral'}, {g: -90, c: 0, t: 0, shape: 'rect', fw: 12, fl: 10, label: 'Right lateral'}]},
  conformal: {name: 'Conformal 3-field', blurb: 'MLC-shaped target with a couch rotation and collimator rotation (non-coplanar element).', energy: 10, mu: 150,
    beams: [{g: 0, c: 15, t: 0, shape: 'blob', label: 'AP blob'}, {g: 50, c: 0, t: 0, shape: 'ellipse', label: 'Oblique left'}, {g: -40, c: 345 - 360, t: 20, shape: 'lshape', label: 'Right oblique, couch 20°'}]},
};

export function buildLinacPanels(stage, lin, ui) {
  const {S, axes, ap, couch, dose} = lin;
  const refs = {};
  const sliders = {};
  const axisSlider = (parent, key, label, opts) => {
    const a = axes[key], sc = (opts.scale || 1) * (opts.invert ? -1 : 1);
    const lo = Math.min(opts.min * sc, opts.max * sc), hi = Math.max(opts.min * sc, opts.max * sc);
    const s = ui.slider(parent, {label, min: lo, max: hi, step: opts.step, value: a.tgt * sc, unit: opts.unit, fmt: opts.fmt, go: true, onInput: (v) => { a.tgt = v / sc; S.status = 'MOVING'; }});
    sliders[key] = {s, sc, a}; return s;
  };
  const syncSliders = () => { for (const {s, sc, a} of Object.values(sliders)) s.set(a.tgt * sc); };

  const tabs = ui.tabs([
    {name: 'Controls', build: (p) => {
      const g1 = ui.group(p, 'Gantry & collimator');
      axisSlider(g1, 'gantry', 'Gantry angle (IEC)', {min: -180, max: 180, step: 0.5, unit: '°'});
      const bt = ui.el('div', ''); [0, 90, 180, -90].forEach((v) => ui.button(bt, v + '°', () => { axes.gantry.tgt = v; syncSliders(); }, 'ghost')); g1.append(bt);
      axisSlider(g1, 'coll', 'Collimator angle', {min: -175, max: 175, step: 0.5, unit: '°'});
      ui.note(g1, 'Gantry 0° = beam pointing down; 90° = source on the patient’s left. Collimator rotates the field about the beam axis. Motors run at real relative speeds (time-lapse below).');
      const g2 = ui.group(p, 'Couch');
      axisSlider(g2, 'couchRot', 'Couch rotation', {min: -95, max: 95, step: 0.5, unit: '°'});
      axisSlider(g2, 'couchLat', 'Lateral', {min: -0.25, max: 0.25, step: 0.001, scale: 100, unit: ' cm', fmt: (v) => v.toFixed(1)});
      axisSlider(g2, 'couchLng', 'Longitudinal (+ = couch IN toward gantry)', {min: -0.8, max: 0.95, invert: true, step: 0.001, scale: 100, unit: ' cm', fmt: (v) => v.toFixed(1)});
      axisSlider(g2, 'couchVrt', 'Vertical (couch top vs isocentre)', {min: axes.couchVrt.min, max: axes.couchVrt.max, step: 0.001, scale: 100, unit: ' cm', fmt: (v) => (v - ISO.y * 100).toFixed(1)});
      refs.lasers = ui.toggle(g2, {label: 'Room lasers ON', value: S.lasers, onChange: (v) => { S.lasers = v; ui.toast(v ? 'Lasers on' : 'Lasers off', 'ok'); }});
      ui.note(g2, 'The yellow/black ring on the floor marks the couch-swing safety zone.');
      const g3 = ui.group(p, 'Field shaping (at isocentre)');
      const apply = () => { ap.clamp(); ap.version++; };
      const fw = ui.slider(g3, {label: 'Field width X', min: 1, max: 40, step: 0.5, value: 10, unit: ' cm', onInput: (v) => { const c = (ap.jaw.x1 + ap.jaw.x2) / 2; ap.setRect(v, ap.jaw.y2 - ap.jaw.y1, c, (ap.jaw.y1 + ap.jaw.y2) / 2); refs.fw = v; }});
      const fl = ui.slider(g3, {label: 'Field length Y', min: 1, max: 40, step: 0.5, value: 10, unit: ' cm', onInput: (v) => { const c = (ap.jaw.y1 + ap.jaw.y2) / 2; ap.setRect(ap.jaw.x2 - ap.jaw.x1, v, (ap.jaw.x1 + ap.jaw.x2) / 2, c); refs.fl = v; }});
      refs.fwS = fw; refs.flS = fl;
      ui.segmented(g3, {label: 'MLC shape', options: [['rect', 'Open'], ['circle', 'Circle'], ['ellipse', 'Ellipse'], ['lshape', 'L'], ['blob', 'Blob']], value: 'rect', onChange: (v) => { ap.shape(v); const st = ap.stats(); fw.set(st.fx); fl.set(st.fy); }});
      ui.button(g3, 'Max field 40 × 40 cm', () => { ap.setRect(40, 40); fw.set(40); fl.set(40); }, 'ghost');
      ui.note(g3, '60 leaf pairs: 40 × 0.5 cm central, 20 × 1.0 cm outer (projected at isocentre); the MLC and jaws open to a full 40 × 40 cm field. Jaws sit above the MLC and trim the field.');
      const g4 = ui.group(p, 'Beam');
      // FFF is just another beam selection: each of the four choices uses one slot of the 4-position filter carousel
      const eSel = (v) => (S.fff ? 'F' : S.energy);
      refs.energySeg = ui.segmented(g4, {label: 'Photon beam', options: [[6, '6 MV'], [10, '10 MV'], [15, '15 MV'], ['F', '6 MV FFF']], value: eSel(), onChange: (v) => { if (v === 'F') { S.energy = 6; S.fff = true; } else { S.energy = +v; S.fff = false; } ap.version++; }});
      ui.note(g4, 'Each beam energy has its own target and flattening-filter position in a slot that moves into the beam path. The 6, 10 and 15 MV beams each use a flattening filter; the FFF beam uses a plain plate with no flattening.');
      ui.slider(g4, {label: 'Monitor units (MU)', min: 10, max: 600, step: 10, value: S.mu, unit: ' MU', onInput: (v) => { S.mu = v; }});
      const row = ui.el('div', ''); g4.append(row);
      refs.beamBtn = ui.button(row, '⚡ BEAM ON', () => beamOn(), 'warn'); ui.button(row, 'Hold / stop', () => { S.beamOn = false; lin.room.setBeamOn(false); S.status = 'HOLD'; }, 'ghost');
      ui.button(row, 'Reset MU', () => { S.delivered = 0; }, 'ghost');
      refs.mu = ui.readout(g4, 'Delivered / planned'); refs.rate = ui.readout(g4, 'Dose rate');
      const g5 = ui.group(p, 'Room');
      refs.door = ui.toggle(g5, {label: 'Shielding door closed (interlock)', value: !S.doorOpen, onChange: (v) => { S.doorOpen = !v; lin.room.setDoor(S.doorOpen); }});
      refs.kv = ui.toggle(g5, {label: 'kV imaging arms extended', value: false, onChange: (v) => { S.kvTarget = v ? 1 : 0; }});
      refs.mv = ui.toggle(g5, {label: 'MV portal imager (EPID) extended', value: false, onChange: (v) => { S.mvTarget = v ? 1 : 0; }});
      ui.toggle(g5, {label: 'Collision interlocks', value: true, onChange: (v) => { S.interlock = v; }});
      ui.segmented(g5, {label: 'Motion speed', options: [[1, '1×'], [4, '4×'], [10, '10×']], value: S.timeScale, onChange: (v) => { S.timeScale = +v; }});
      const g6 = ui.group(p, 'Display', false);
      refs.covers = ui.slider(g6, {label: 'Covers (solid ↔ x-ray)', min: 0, max: 1, step: 0.05, value: 1, fmt: (v) => Math.round(v * 100) + '%', onInput: (v) => { S.coverOpacity = v; if (v > 0.3 && S.selected) lin.selectPart(null); }});
      ui.toggle(g6, {label: 'Head envelope ring (collision zone)', value: true, onChange: (v) => { S.envelope = v; }});
      ui.toggle(g6, {label: 'Light field', value: true, onChange: (v) => { S.fieldLight = v; }});
      ui.toggle(g6, {label: 'Show radiation beam (teaching aid)', value: true, onChange: (v) => { S.beamVis = v; S.beamPreview = false; }});
      ui.toggle(g6, {label: 'Preview beam when off', value: false, onChange: (v) => { S.beamPreview = v; }});
    }},
    {name: 'Beam & dose', onShow: () => refreshPhysics(true), build: (p) => {
      const g = ui.group(p, 'Set-up geometry');
      refs.ssd = ui.readout(g, 'SSD (source → surface)'); refs.depth = ui.readout(g, 'Isocentre depth'); refs.field = ui.readout(g, 'Field at isocentre'); refs.eq = ui.readout(g, 'Equivalent square'); refs.of = ui.readout(g, 'Output factor');
      refs.dmu = ui.readout(g, 'Dose / MU at isocentre'); refs.dd = ui.readout(g, 'Dose at isocentre (delivered)');
      const g2 = ui.group(p, 'Dose in the water phantom');
      ui.toggle(g2, {label: 'Show isodose slice in phantom', value: false, onChange: (v) => { S.doseView = v; if (v) lin.renderDose(); }});
      ui.segmented(g2, {label: 'Slice plane', options: [['axial', 'Axial (⟂ gantry axis)'], ['sagittal', 'Sagittal']], value: 'axial', onChange: (v) => { S.slicePlane = v; if (S.doseView) lin.renderDose(); }});
      ui.note(g2, 'Colour wash = dose relative to dmax for 10×10 at SSD 100; white lines every 10 %. Rotate the gantry or couch and watch the isodoses follow the beam.');
      const g3 = ui.group(p, 'Central-axis depth dose (PDD)');
      refs.pdd = ui.el('canvas', 'plot'); g3.append(refs.pdd); ui.note(g3, 'Build-up to dmax, then exponential fall-off × inverse-square. Higher energy → deeper dmax and flatter fall-off.');
      const g4 = ui.group(p, 'Beam profiles');
      refs.prof = ui.el('canvas', 'plot'); g4.append(refs.prof);
      refs.profDepth = ui.slider(g4, {label: 'Profile depth', min: 1.5, max: 25, step: 0.5, value: 10, unit: ' cm', onInput: () => refreshPhysics(true)});
      ui.note(g4, '<b>Blue</b> cross-plane (X, leaf-travel); <b>orange</b> in-plane (Y). Turn on FFF to see the peaked, unflattened profile. This is an educational model, not a clinical dose calculation.');
    }},
    {name: 'Workflow', build: (p) => { refs.wf = p; }},
    {name: 'Parts', build: (p) => {
      ui.note(p, 'Tap a part below — or tap it in the 3D view — to isolate it and read how it works.');
      const grid = ui.el('div', 'parts'); p.append(grid); refs.partBtns = [];
      modelDescriptions.forEach((d, i) => {
        const b = ui.el('button', '', `<small style="color:var(--mute)">${String(i + 1).padStart(2, '0')}</small><br>${d.Subtitle || d.Title}`); b.onclick = () => selectIndex(i); grid.append(b); refs.partBtns.push(b);
      });
      ui.toggle(p, {label: 'Animate electrons & photons (gun → waveguide → magnet → target)', value: true, onChange: (v) => { S.eAnim = v; }});
      ui.toggle(p, {label: 'Cutaway view (gun & waveguide)', value: false, onChange: (v) => lin.setCutaway(v)});
      ui.button(p, 'Clear selection', () => selectIndex(-1), 'ghost');
    }},
  ]);

  /* ---------- beam on with interlocks ---------- */
  function beamOn() {
    if (S.doorOpen) return ui.toast('INTERLOCK: shielding door is open — close it to enable beam.', 'bad');
    if (S.delivered >= S.mu) S.delivered = 0;
    const c = lin.collision(); if (c && S.interlock) return ui.toast('INTERLOCK: collision risk with ' + c, 'bad');
    S.beamOn = true; S.status = 'BEAM ON'; lin.room.setBeamOn(true);
  }

  /* ---------- parts explorer ---------- */
  let sel = -1;
  let homeTw = null; stage.onFrame((dt) => { if (!homeTw) return; const k = 1 - Math.pow(0.001, dt); stage.camera.position.lerp(homeTw.cam, k); stage.controls.target.lerp(homeTw.target, k); if (stage.camera.position.distanceTo(homeTw.cam) < 0.01) homeTw = null; });
  function selectIndex(i) {
    if (i >= 0 && i === sel) { // clicking the selected part again un-selects it and returns to the default view
      const rc = lin.recenter(); homeTw = {target: rc.target.clone(), cam: rc.cam.clone()};
      S.coverOpacity = 1; refs.covers && refs.covers.set(1); i = -1;
    }
    sel = i; refs.partBtns.forEach((b, k) => b && b.classList.toggle('on', k === i));
    if (i < 0) { lin.selectPart(null); ui.hideCard(); return; }
    const d = modelDescriptions[i]; lin.selectPart(d.Modelname || null); if (d.Modelname === '15_KV_Imagine_System') { S.kvTarget = 1; refs.kv && refs.kv.set(true); } if (d.Modelname === 'MV_Portal_Imager') { S.mvTarget = 1; refs.mv && refs.mv.set(true); }
    ui.showCard({title: d.Subtitle || d.Title, subtitle: d.Title, html: (d.Description || '').replace(/\n/g, '<br>'), nav: [['‹ Back', () => selectIndex((i + modelDescriptions.length - 1) % modelDescriptions.length)], ['Next ›', () => selectIndex((i + 1) % modelDescriptions.length)]], onClose: () => selectIndex(-1)});
  }
  stage.renderer.domElement.addEventListener('pointerdown', (e) => { stage._pd = {x: e.clientX, y: e.clientY}; });
  stage.renderer.domElement.addEventListener('pointerup', (e) => {
    if (!lin.world.visible || !stage._pd || Math.hypot(e.clientX - stage._pd.x, e.clientY - stage._pd.y) > 6) return;
    const hit = stage.pick(e, [lin.world]);
    let o = hit && hit.object, id = null; while (o && !id) { id = o.userData.part; o = o.parent; }
    if (!id) return selectIndex(-1);
    const i = modelDescriptions.findIndex((d) => d.Modelname === id); if (i >= 0) selectIndex(i);
  });

  /* ---------- physics tab ---------- */
  let lastPhys = 0;
  function refreshPhysics(force) {
    const now = performance.now(); if (!force && now - lastPhys < 250) return; lastPhys = now;
    if (!refs.pdd || refs.pdd.offsetParent === null && !force) return;
    const info = lin.caxInfo(), st = ap.stats(), E = S.energy, e = ENERGIES[E];
    const ssd = info.hit ? info.ssd : 100, isoD = info.hit ? info.isoDepth : 0, of = outputFactor(Math.max(st.eq, 1));
    refs.ssd.set(info.hit ? ssd.toFixed(1) + ' cm' : 'beam misses phantom', info.hit ? '' : 'warn');
    refs.depth.set(info.hit ? isoD.toFixed(1) + ' cm' : '—');
    refs.field.set(`${st.fx.toFixed(1)} × ${st.fy.toFixed(1)} cm`); refs.eq.set(st.eq.toFixed(1) + ' cm'); refs.of.set(of.toFixed(3));
    const dmu = info.hit ? pddCAX(E, isoD, ssd, S.fff) * of : 0;
    refs.dmu.set(info.hit ? dmu.toFixed(3) + ' cGy/MU' : '—');
    refs.dd.set(info.hit ? (dmu * S.delivered).toFixed(1) + ' cGy' : '—');
    // PDD
    const pts = []; let mx = 0; for (let d = 0; d <= 30; d += 0.25) { const v = pddCAX(E, d, ssd, S.fff); pts.push([d, v]); mx = Math.max(mx, v); }
    plot(refs.pdd, {series: [{pts: pts.map(([d, v]) => [d, (v / mx) * 100]), color: '#1a6e78', label: `${e.label}${S.fff ? ' FFF' : ''}  dmax ${e.dmax} cm`}], xr: [0, 30], yr: [0, 110], xlabel: 'depth (cm)', ylabel: '% of dmax', marker: info.hit ? isoD : null});
    // profiles
    const dp = refs.profDepth.get(), sig = 0.22 + 0.026 * dp, A = [], B = []; dose.update(ap); dose.E = E; dose.fff = S.fff;
    for (let x = -20; x <= 20; x += 0.25) { A.push([x, dose.sample(x, 0, sig) * oar(Math.abs(x), dp, S.fff, E) * 100]); B.push([x, dose.sample(0, x, sig) * oar(Math.abs(x), dp, S.fff, E) * 100]); }
    const ref = Math.max(A.reduce((m, p) => Math.max(m, p[1]), 0), B.reduce((m, p) => Math.max(m, p[1]), 0), 1e-6);
    plot(refs.prof, {series: [{pts: A.map(([x, v]) => [x, (v / ref) * 100]), color: '#2f6fe0', label: 'X'}, {pts: B.map(([x, v]) => [x, (v / ref) * 100]), color: '#e0952b', label: 'Y', row: 1}], xr: [-20, 20], yr: [0, 115], xlabel: 'off-axis (cm at isocentre)', ylabel: '% of max'});
  }

  /* ---------- guided workflow ---------- */
  const W = {step: 0, plan: 'qa', beam: 0, timeout: false, done: [], log: [], kvImaged: false, mvImaged: false, kvApplied: false, shown: null};
  let imgCanvas;
  const mm = (m) => (m * 1000).toFixed(1);
  function setupError() { const mk = lin.marks(); const i = mk.iso; return {dx: i.x - ISO.x, dy: i.y - ISO.y, dz: i.z - ISO.z, top: mk.top, bb: mk.bb}; }
  function markerErr() { const mk = lin.marks(), b = mk.bb; const dx = b.x - ISO.x, dy = b.y - ISO.y, dz = b.z - ISO.z; return {dx, dy, dz, n: Math.hypot(dx, dy, dz)}; }
  function applyShift() { const e = markerErr(); axes.couchLng.tgt = Math.min(axes.couchLng.max, Math.max(axes.couchLng.min, axes.couchLng.val + e.dx)); axes.couchVrt.tgt = Math.min(axes.couchVrt.max, Math.max(axes.couchVrt.min, axes.couchVrt.val - e.dy)); axes.couchLat.tgt = Math.min(axes.couchLat.max, Math.max(axes.couchLat.min, axes.couchLat.val + LATSIGN * e.dz)); syncSliders(); }
  const LATSIGN = -1;
  function drawImg() {
    if (!imgCanvas) return; const c = imgCanvas.getContext('2d'), w = imgCanvas.width, h = imgCanvas.height; c.fillStyle = '#05080c'; c.fillRect(0, 0, w, h);
    if (!W.shown) { c.fillStyle = '#6b7c8c'; c.font = '14px sans-serif'; c.fillText('No image yet', 12, 24); return; }
    const e = markerErr(), cm = 14;                       // px per cm in each panel
    const panel = (x0, title, drawFn) => { c.save(); c.beginPath(); c.rect(x0 + 4, 4, w / 2 - 8, h - 8); c.clip(); c.translate(x0 + w / 4, h / 2 + 8); drawFn(); c.restore(); c.fillStyle = '#9fb0c0'; c.font = '12px sans-serif'; c.fillText(title, x0 + 10, 20); };
    const grat = () => { c.strokeStyle = '#22d3ee66'; c.lineWidth = 1; c.beginPath(); c.moveTo(-120, 0); c.lineTo(120, 0); c.moveTo(0, -120); c.lineTo(0, 120); c.stroke(); };
    const body = (lw, lh) => { const g = c.createLinearGradient(-lw, 0, lw, 0); g.addColorStop(0, '#3a4652'); g.addColorStop(0.5, '#7f8d99'); g.addColorStop(1, '#3a4652'); c.fillStyle = g; c.fillRect(-lw, -lh, 2 * lw, 2 * lh); };
    const marker = (px, py) => { c.fillStyle = '#f2f6fa'; c.beginPath(); c.arc(px, py, 5, 0, 7); c.fill(); c.strokeStyle = '#ff5d5d'; c.lineWidth = 1.5; c.beginPath(); c.arc(px, py, 8, 0, 7); c.stroke(); };
    if (W.shown === 'kv') {
      const S2 = 0.20 * cm * 100 / 2;
      panel(0, 'kV AP (x long, z lat)', () => { body(S2, S2); grat(); marker(e.dz * 100 * cm, e.dx * 100 * cm); });
      panel(w / 2, 'kV lateral (x long, y vert)', () => { body(S2, S2); grat(); marker(e.dx * 100 * cm, -e.dy * 100 * cm); });
    } else {
      const ol = ap.outline(), st = ap.stats(); const k = 6;
      panel(0, 'MV portal image (field, 6 px/cm)', () => { body(120, 120); c.fillStyle = 'rgba(255,255,255,0.45)'; if (ol.length) { c.beginPath(); ol.forEach(([x, y], i) => i ? c.lineTo(x * k, -y * k) : c.moveTo(x * k, -y * k)); c.closePath(); c.fill(); } grat(); });
      panel(w / 2, 'Field size / alignment', () => { c.fillStyle = '#cfe0ee'; c.font = '14px sans-serif'; c.fillText(`Field ${st.fx.toFixed(1)} × ${st.fy.toFixed(1)} cm`, -100, -20); c.fillText(`Equiv. square ${st.eq.toFixed(1)} cm`, -100, 4); c.fillText(`Gantry ${axes.gantry.val.toFixed(1)}°  Coll ${axes.coll.val.toFixed(1)}°`, -100, 28); });
    }
  }
  function beamTarget() { return PLANS[W.plan].beams[W.beam]; }
  function loadBeam(b) { axes.gantry.tgt = b.g; axes.coll.tgt = b.c; axes.couchRot.tgt = b.t; if (b.shape === 'rect') ap.setRect(b.fw, b.fl); else ap.shape(b.shape); syncSliders(); const st = ap.stats(); refs.fwS.set(st.fx); refs.flS.set(st.fy); }
  const STEPS = [
    {id: 'plan', title: '1 · Plan & time-out', body: () => {
      const d = ui.el('div'); ui.note(d, 'Verify the right patient, plan and set-up before anything moves. Choose a plan:');
      ui.segmented(d, {label: 'Plan', options: Object.entries(PLANS).map(([k, v]) => [k, v.name.split(' ')[0]]), value: W.plan, onChange: (k) => { W.plan = k; W.beam = 0; const P = PLANS[k]; S.energy = P.energy; S.mu = P.mu; ap.version++; renderWF(); }});
      ui.note(d, `<b>${PLANS[W.plan].name}</b> — ${PLANS[W.plan].blurb}<br>${ENERGIES[PLANS[W.plan].energy].label}, ${PLANS[W.plan].mu} MU per beam, ${PLANS[W.plan].beams.length} beam(s).`);
      ui.button(d, W.timeout ? '✔ Time-out done' : 'Perform time-out (ID, plan, site, allergies)', () => { W.timeout = true; S.energy = PLANS[W.plan].energy; S.fff = false; refs.energySeg && refs.energySeg.set(S.energy); S.mu = PLANS[W.plan].mu; ap.version++; renderWF(); }, W.timeout ? 'go' : '');
      return d; },
     checks: () => [['Time-out completed', W.timeout]]},
    {id: 'setup', title: '2 · Set up to room lasers', body: () => {
      const d = ui.el('div');
      ui.note(d, '<b>Goal:</b> the patient (here a water phantom) must sit exactly where the plan assumes. The <b>red room lasers</b> cross at the isocentre. The phantom has <b>black cross-marks</b> on its top and sides; each mark must sit exactly on its red laser line. The phantom was placed slightly off on purpose.');
      ui.note(d, '<b>How:</b> move the <b>couch</b> (Controls tab → Couch). For each line below, move that couch axis by the amount shown, or type the target value into the box under the slider and press <b>Go</b>. Each line turns green when it is within 2 mm.');
      refs.setupRO = [ui.readout(d, 'Couch IN / OUT (longitudinal)'), ui.readout(d, 'Couch sideways (lateral)'), ui.readout(d, 'Couch UP / DOWN (vertical)')];
      refs.setupTgt = ui.el('div', 'note'); refs.setupTgt.style.cssText = 'font-size:12px;color:var(--mute);margin:4px 0'; d.append(refs.setupTgt);
      const r = ui.el('div'); d.append(r);
      ui.button(r, 'Zoom to phantom', () => { const t = new THREE.Vector3(ISO.x, ISO.y - 0.1, 0); homeTw = {target: t, cam: t.clone().add(new THREE.Vector3(-0.9, 0.7, 1.1))}; }, 'ghost');
      ui.button(r, 'Lasers on/off', () => { S.lasers = !S.lasers; refs.lasers && refs.lasers.set(S.lasers); }, 'ghost');
      return d; },
     checks: () => { const e = setupError(), t = 0.002; return [[`Longitudinal ${mm(e.dx)} mm`, Math.abs(e.dx) < t], [`Lateral ${mm(e.dz)} mm`, Math.abs(e.dz) < t], [`Vertical ${mm(e.dy)} mm`, Math.abs(e.dy) < t]]; },
     live: () => { const e = setupError();
       const say = (v, neg, pos) => Math.abs(v) < 0.002 ? 'OK ✔' : `move ${(Math.abs(v) * 1000).toFixed(1)} mm ${v > 0 ? pos : neg}`;
       if (refs.setupRO) { const st = (v) => Math.abs(v) < 0.002 ? 'ok' : 'bad';
         refs.setupRO[0].set(say(e.dx, 'IN', 'OUT'), st(e.dx)); refs.setupRO[1].set(say(e.dz, 'toward + on the Lateral slider', 'toward − on the Lateral slider'), st(e.dz)); refs.setupRO[2].set(say(e.dy, 'UP', 'DOWN'), st(e.dy)); }
       if (refs.setupTgt) { const lng = -(axes.couchLng.val + e.dx) * 100, lat = (axes.couchLat.val + LATSIGN * e.dz) * 100, vrt = (axes.couchVrt.val - e.dy - ISO.y) * 100;
         refs.setupTgt.innerHTML = `Target slider values → Longitudinal <b>${lng.toFixed(1)}</b> cm · Lateral <b>${lat.toFixed(1)}</b> cm · Vertical <b>${vrt.toFixed(1)}</b> cm`; } }},
    {id: 'img', title: '3 · Image guidance (kV + MV)', body: () => {
      const d = ui.el('div'); ui.note(d, 'The machine has two imagers. <b>kV</b>: orthogonal source/detector arms (AP + lateral) find the internal marker; the couch is shifted to bring it to the isocentre. <b>MV portal imager</b> (EPID): sits opposite the treatment head and images the beam itself, so it checks the field shape and position. Extend, acquire, then apply the shift.');
      const r1 = ui.el('div'); d.append(r1);
      ui.button(r1, 'Extend kV arms', () => { S.kvTarget = 1; refs.kv.set(true); }, 'ghost'); ui.button(r1, 'Extend MV panel', () => { S.mvTarget = 1; refs.mv.set(true); }, 'ghost');
      ui.button(d, 'Acquire kV AP + lateral', () => { if (S.kvOut < 0.9) return ui.toast('Extend the kV arms first.', 'bad'); W.kvImaged = true; W.shown = 'kv'; drawImg(); ui.toast('kV AP + lateral acquired.', 'ok'); }, 'go');
      ui.button(d, 'Acquire MV portal image', () => { if (S.mvOut < 0.9) return ui.toast('Extend the MV panel first.', 'bad'); W.mvImaged = true; W.shown = 'mv'; drawImg(); ui.toast('MV portal image acquired.', 'ok'); }, 'go');
      imgCanvas = document.createElement('canvas'); imgCanvas.width = 560; imgCanvas.height = 280; imgCanvas.style.cssText = 'width:100%;border-radius:8px;background:#05080c;margin:6px 0'; d.append(imgCanvas); drawImg();
      refs.kvRO = ui.readout(d, 'Marker offset (long / lat / vert)');
      ui.button(d, 'Apply couch shift', () => { if (!W.kvImaged) return ui.toast('Acquire the kV images first.', 'bad'); applyShift(); W.kvApplied = true; ui.toast('Couch moving to the shift position.', 'ok'); }, 'go'); return d; },
     live: () => { if (refs.kvRO) { const e = markerErr(); refs.kvRO.set(W.kvImaged ? `${mm(e.dx)} / ${mm(e.dz)} / ${mm(e.dy)} mm` : 'not imaged', W.kvImaged && W.kvApplied && e.n < 0.0015 ? 'ok' : ''); } if (W.shown) drawImg(); },
     checks: () => { const e = markerErr(); return [['kV arms extended', S.kvOut > 0.9 || W.kvImaged], ['kV images acquired', W.kvImaged], ['MV portal image acquired', W.mvImaged], [`Marker error ${(e.n * 1000).toFixed(1)} mm → < 1.5 mm after shift`, W.kvImaged && W.kvApplied && e.n < 0.0015]]; }},
    {id: 'beam', title: '4 · Set beam parameters', body: () => {
      const d = ui.el('div'); const b = beamTarget();
      ui.note(d, `Beam ${W.beam + 1}/${PLANS[W.plan].beams.length}: <b>${b.label}</b> — gantry <b>${b.g}°</b>, collimator <b>${b.c}°</b>, couch <b>${b.t}°</b>, ${b.shape === 'rect' ? `field <b>${b.fw} × ${b.fl} cm</b>` : `MLC shape <b>${b.shape}</b>`}. Set them on the Controls tab, or auto-load as a record-and-verify system would.`);
      ui.button(d, 'Auto-load beam (R&V)', () => loadBeam(b), 'ghost'); return d; },
     checks: () => { const b = beamTarget(), st = ap.stats(); const ok = (a, t, tol) => Math.abs(((a - t + 540) % 360) - 180) < tol;
       const field = b.shape === 'rect' ? Math.abs(st.fx - b.fw) < 0.6 && Math.abs(st.fy - b.fl) < 0.6 : true;
       return [[`Gantry ${axes.gantry.val.toFixed(1)}° → ${b.g}°`, ok(axes.gantry.val, b.g, 1)], [`Collimator ${axes.coll.val.toFixed(1)}° → ${b.c}°`, ok(axes.coll.val, b.c, 1)], [`Couch ${axes.couchRot.val.toFixed(1)}° → ${b.t}°`, ok(axes.couchRot.val, b.t, 1)], ['Field matches plan', field], ['kV arms & MV panel retracted', S.kvOut < 0.1 && S.mvOut < 0.1], ['No collision', !lin.collision()]]; }},
    {id: 'deliver', title: '5 · Leave room & deliver', body: () => {
      const d = ui.el('div'); ui.note(d, 'Everyone leaves; close the shielding door (the beam-on lamp outside the door lights when radiation is on). Then press BEAM ON.');
      ui.button(d, 'Close door', () => { S.doorOpen = false; refs.door.set(true); lin.room.setDoor(false); }, 'ghost'); ui.button(d, '⚡ BEAM ON', () => beamOn(), 'warn'); return d; },
     checks: () => [['Door closed', !S.doorOpen], [`Delivered ${S.delivered.toFixed(0)} / ${S.mu} MU`, S.delivered >= S.mu - 0.01]]},
    {id: 'end', title: '6 · Wrap-up', body: () => { const d = ui.el('div'); ui.note(d, 'Retract imagers, lower and withdraw the couch, open the door, and review the log.'); ui.button(d, 'Open door', () => { S.doorOpen = true; refs.door.set(false); lin.room.setDoor(true); }, 'ghost'); ui.button(d, 'Couch out & down', () => { axes.couchLng.tgt = 0.8; axes.couchVrt.tgt = axes.couchVrt.min + 0.1; axes.couchRot.tgt = 0; axes.gantry.tgt = 0; syncSliders(); }, 'ghost'); return d; },
     checks: () => [['Beam off', !S.beamOn], ['Door open', S.doorOpen], ['Couch withdrawn', axes.couchLng.val > 0.5]]},
  ];
  const THREE_rad = (d) => (d * Math.PI) / 180;
  function buildWorkflow() {
    refs.wf.innerHTML = ''; ui.note(refs.wf, 'A guided simulated fraction. Each step has pass/fail checks; the next step unlocks when all pass. <b>No data are recorded or sent anywhere.</b>');
    refs.wfBody = ui.el('div'); refs.wf.append(refs.wfBody); renderWF();
  }
  function renderWF() {
    const body = refs.wfBody; if (!body) return; body.innerHTML = '';
    STEPS.forEach((st, i) => {
      const c = ui.el('div', 'step' + (i === W.step ? ' on' : i < W.step ? ' done' : '')); c.append(ui.el('h4', '', st.title));
      if (i === W.step) {
        c.append(st.body()); refs.chk = ui.el('div', 'chk'); c.append(refs.chk); refs.next = ui.button(c, i === STEPS.length - 1 ? 'Finish' : 'Next step ›', () => { if (W.step === 3 && W.beam < PLANS[W.plan].beams.length - 1 && false) return; advance(); }, 'go'); refs.next.disabled = true;
        ui.button(c, '⏭ Skip: do this step for me', () => skipStep(), 'ghost');
        if (i > 0) ui.button(c, '‹ Back', () => { W.step = Math.max(0, W.step - 1); renderWF(); }, 'ghost');
      }
      body.append(c);
    });
    tickWF(true);
  }
  function advance() {
    if (W.step === 4) { // finished delivery of this beam
      if (W.beam < PLANS[W.plan].beams.length - 1) { W.beam++; S.delivered = 0; W.step = 3; ui.toast(`Beam delivered. Next: ${beamTarget().label}`, 'ok'); renderWF(); return; }
    }
    if (W.step < STEPS.length - 1) { W.step++; renderWF(); } else { ui.toast('Fraction complete — well done!', 'ok'); }
  }

  /* Skip: perform the motions/actions the current step needs (at 10x speed), wait until its checks pass, then advance. */
  let skipping = false;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(cond, ms = 30000) { const t0 = performance.now(); while (!cond() && performance.now() - t0 < ms) await sleep(100); return cond(); }
  async function skipStep() {
    if (skipping) return; skipping = true; const ts = S.timeScale; S.timeScale = 10; const id = STEPS[W.step].id;
    try {
      if (id === 'plan') { W.timeout = true; S.energy = PLANS[W.plan].energy; S.fff = false; refs.energySeg && refs.energySeg.set(S.energy); S.mu = PLANS[W.plan].mu; ap.version++; }
      else if (id === 'setup') { for (let k = 0; k < 3; k++) { const e = setupError(); const cl = (a, v) => Math.min(a.max, Math.max(a.min, v));
          axes.couchLng.tgt = cl(axes.couchLng, axes.couchLng.val + e.dx); axes.couchVrt.tgt = cl(axes.couchVrt, axes.couchVrt.val - e.dy); axes.couchLat.tgt = cl(axes.couchLat, axes.couchLat.val + LATSIGN * e.dz); syncSliders(); S.status = 'MOVING';
          await until(() => ['couchLng', 'couchVrt', 'couchLat'].every((k2) => Math.abs(axes[k2].val - axes[k2].tgt) < 1e-4), 15000); const e2 = setupError(); if (Math.max(Math.abs(e2.dx), Math.abs(e2.dy), Math.abs(e2.dz)) < 0.0015) break; } }
      else if (id === 'img') { S.kvTarget = 1; S.mvTarget = 1; refs.kv && refs.kv.set(true); refs.mv && refs.mv.set(true); await until(() => S.kvOut > 0.95 && S.mvOut > 0.95, 15000);
          W.kvImaged = true; W.mvImaged = true; W.shown = 'kv'; applyShift(); W.kvApplied = true; await until(() => markerErr().n < 0.0012, 15000); drawImg(); }
      else if (id === 'beam') { S.kvTarget = 0; S.mvTarget = 0; refs.kv && refs.kv.set(false); refs.mv && refs.mv.set(false); loadBeam(beamTarget()); S.status = 'MOVING'; }
      else if (id === 'deliver') { if (S.doorOpen) { S.doorOpen = false; refs.door && refs.door.set(true); lin.room.setDoor(false); await sleep(600); } if (!S.beamOn && S.delivered < S.mu - 0.01) beamOn(); }
      else if (id === 'end') { S.beamOn = false; S.doorOpen = true; refs.door && refs.door.set(false); lin.room.setDoor(true); S.kvTarget = 0; S.mvTarget = 0; refs.kv && refs.kv.set(false); refs.mv && refs.mv.set(false);
          axes.couchRot.tgt = 0; axes.gantry.tgt = 0; axes.couchLng.tgt = 0.8; axes.couchVrt.tgt = axes.couchVrt.min + 0.1; syncSliders(); }
      const st = STEPS[W.step]; const ok = await until(() => st.checks().every(([, k]) => k), id === 'deliver' ? 120000 : 20000);
      if (ok) advance(); else { renderWF(); ui.toast('Skip could not finish this step automatically (check interlocks / collisions).', 'bad'); }
    } finally { S.timeScale = ts; skipping = false; }
  }
  function tickWF(force) {
    const st = STEPS[W.step]; if (!st || !refs.chk) return; if (st.live) st.live();
    const cs = st.checks(); refs.chk.innerHTML = cs.map(([t, ok]) => `<span class="${ok ? 'y' : 'n'}">${ok ? '✔' : '✖'} ${t}</span>`).join('');
    if (refs.next) refs.next.disabled = !cs.every(([, ok]) => ok);
  }

  buildWorkflow();

  /* ---------- HUD ---------- */
  const pill = (cls, txt) => { const d = ui.el('div', 'pill', `<span class="dot ${cls}"></span><span>${txt}</span>`); ui.hud.append(d); return {d, set(c, t) { d.firstChild.className = 'dot ' + c; d.lastChild.textContent = t; }}; };
  const hBeam = pill('green', 'READY'), hPos = pill('', ''), hInt = pill('', '');
  let acc = 0;
  lin.on('change', (moving) => {
    const n = performance.now(); if (n - acc < 120) return; acc = n;
    const bl = Object.entries(axes).filter(([, a]) => a.blocked).map(([k]) => k);
    hBeam.set(S.beamOn ? 'red' : S.status === 'INTERLOCK' ? 'amber' : 'green', S.beamOn ? `BEAM ON  ${S.delivered.toFixed(0)}/${S.mu} MU` : moving ? 'MOVING' : S.status === 'INTERLOCK' ? 'INTERLOCK' : 'READY');
    hPos.set('', `G ${axes.gantry.val.toFixed(1)}°  C ${axes.coll.val.toFixed(1)}°  T ${axes.couchRot.val.toFixed(1)}°`);
    hInt.set(S.doorOpen ? 'amber' : 'green', S.doorOpen ? 'Door open' : 'Door closed'); hInt.d.style.display = '';
    if (refs.mu) { refs.mu.set(`${S.delivered.toFixed(0)} / ${S.mu} MU`); refs.rate.set(`${((S.fff ? ENERGIES[S.energy].fffRate : ENERGIES[S.energy].rate)).toFixed(0)} MU/min`); }
    if (!moving && !S.beamOn && S.status !== 'INTERLOCK') S.status = 'READY';
    tickWF(); if (S.beamOn || moving) refreshPhysics(false);
    if (W.step === 4 && !S.beamOn && S.delivered >= S.mu - 0.01 && refs.next) refs.next.disabled = false;
  });
  lin.on('collision', ({axis, what}) => { ui.toast(`COLLISION INTERLOCK: ${axis} stopped — would hit ${what}`, 'bad'); syncSliders(); });
  return {tabs, selectIndex, refreshPhysics, syncSliders, beamOn, workflow: W};
}
