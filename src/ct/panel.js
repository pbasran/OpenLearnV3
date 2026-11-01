// CT UI: table / gantry / laser alignment, protocol & scout & acquisition, image viewer (W/L, ROI), guided workflow, parts explorer.
import {modelDescriptions} from './data.js';
import {dogBones} from './egg.js';
import {SECTIONS, PHANTOM_LEN, sectionAt, roiStats, windowToCanvas, KERNEL_NAMES, doseInfo, KVP} from './recon.js';
import {AX_Y} from './ct.js';

const mm = (m) => (m * 1000).toFixed(1);
const WL = {soft: ['Soft tissue', 40, 400], lung: ['Lung', -600, 1500], bone: ['Bone', 400, 1800], water: ['Water QA', 0, 200]};
const EXAMS = {
  qa: {short: 'QA', name: 'HU & noise QA', blurb: 'Quality-assurance scan of the HU-linearity and uniformity modules: check water = 0 HU and noise.', range: [0, 20], kvp: 120, mAs: 200, pitch: 1.0, thick: 5, kernel: 'standard', fov: 25, target: [0, 20]},
  thorax: {short: 'Thorax', name: 'Thorax (Module C)', blurb: 'Routine chest protocol on the anthropomorphic thorax: lungs, spine, aorta and a 10 mm nodule.', range: [20, 34], kvp: 120, mAs: 120, pitch: 1.0, thick: 5, kernel: 'standard', fov: 38, target: [20, 34]},
  lowdose: {short: 'Low-dose', name: 'Low-dose chest', blurb: 'Reduced dose (100 kVp, low mAs, higher pitch): lower CTDIvol but noisier images — find the limit.', range: [20, 34], kvp: 100, mAs: 50, pitch: 1.2, thick: 5, kernel: 'sharp', fov: 38, target: [20, 34]},
};

export function buildCTPanels(stage, ct, ui) {
  const {S, axes} = ct;
  const refs = {}, W = {step: 0, exam: 'thorax', timeout: false, landed: false, roiOk: false, wlOk: false, nod: false, log: []};
  const view = {s: 0, wl: 40, ww: 400, roiR: 1, roi: null, idx: 0, img: null, busy: false};

  const protoApply = (e) => { S.kvp = e.kvp; S.mAs = e.mAs; S.pitch = e.pitch; S.thick = e.thick; S.kernel = e.kernel; S.fov = e.fov; S.range = [...e.range]; syncScan(); };
  const sync = {};
  function syncScan() { for (const f of Object.values(sync)) f(); derive(); drawScout(); }

  const tabs = ui.tabs([
    {name: 'Scanner', build: (p) => {
      const g1 = ui.group(p, 'Patient table');
      sync.tin = (() => { const s = ui.slider(g1, {go: true, label: 'Table position (in →)', min: 0, max: axes.tableIn.max * 1000, step: 1, value: 0, unit: ' mm', fmt: (v) => v.toFixed(0), onInput: (v) => { axes.tableIn.tgt = v / 1000; }}); refs.tin = s; return () => s.set(axes.tableIn.tgt * 1000); })();
      sync.th = (() => { const s = ui.slider(g1, {go: true, label: 'Table height (top surface)', min: axes.tableH.min * 1000, max: axes.tableH.max * 1000, step: 1, value: axes.tableH.tgt * 1000, unit: ' mm', fmt: (v) => v.toFixed(0), onInput: (v) => { axes.tableH.tgt = v / 1000; }}); refs.th = s; return () => s.set(axes.tableH.tgt * 1000); })();
      const row = ui.el('div'); g1.append(row);
      ui.button(row, 'Home (out)', () => { axes.tableIn.tgt = 0; syncScan(); }, 'ghost');
      ui.button(row, 'To scan plane (range start)', () => { axes.tableIn.tgt = Math.min(axes.tableIn.max, Math.max(0, ct.sToTable(S.range[0]))); syncScan(); }, 'ghost');
      ui.note(g1, 'In a real room the patient is first aligned to the <b>external lasers</b>, then the table travels a fixed offset into the gantry (“auto-move to scan plane”).');
      const g2 = ui.group(p, 'Phantom position on the table');
      const nr = ui.el('div'); g2.append(nr);
      for (const [t, d] of [['◀ 1 cm', -0.01], ['◀ 1 mm', -0.001], ['1 mm ▶', 0.001], ['1 cm ▶', 0.01]]) ui.button(nr, t, () => { ct.nudge(d); }, 'ghost');
      ui.note(g2, 'The phantom was set down off-centre. Slide it sideways until the top mark sits on the red sagittal laser.');
      const g3 = ui.group(p, 'Laser alignment');
      refs.lasersT = ui.toggle(g3, {label: 'Positioning lasers ON', value: S.lasers, onChange: (v) => { S.lasers = v; ui.toast(v ? 'Lasers on' : 'Lasers off', 'ok'); }});
      refs.alAx = ui.readout(g3, 'Landmark ring vs axial laser'); refs.alSag = ui.readout(g3, 'Midline vs sagittal laser'); refs.alCor = ui.readout(g3, 'Mid-height vs coronal laser');
      ui.note(g3, 'Tolerance ±2 mm. Red laser lines are drawn where they cross the phantom and table. Raise or lower the table until the side marks sit on the horizontal laser.');
      const g4 = ui.group(p, 'Gantry');
      let tiltSl = null;
      sync.tilt = (() => { const s = ui.slider(g4, {go: true, label: 'Gantry tilt (+ = top leans toward the patient’s head)', min: -30, max: 30, step: 0.5, value: 0, unit: '°', onInput: (v) => { axes.tilt.tgt = v; }}); tiltSl = s; return () => s.set(axes.tilt.tgt); })();
      // tilt is rarely used in radiation oncology simulation: locked (and held at 0°) by default
      S.tiltLock = true; tiltSl.disabled(true);
      refs.tiltLock = ui.toggle(g4, {label: 'Lock gantry tilt at 0° (typical for RadOnc)', value: true, onChange: (v) => { S.tiltLock = v; tiltSl.disabled(v); if (v) { axes.tilt.tgt = 0; tiltSl.set(0); } ui.toast(v ? 'Tilt locked at 0°' : 'Tilt unlocked', 'ok'); }});
      ui.note(g4, 'Tilt keeps the scan plane perpendicular to the anatomy (and avoids eyes in head CT). Tilt is blocked if the table or phantom would touch the bore.');
      const gC = ui.group(p, 'Coordinate system (DICOM patient)', false);
      ui.note(gC, 'CT scanners use the <b>DICOM patient coordinate system</b> (IEC 61217 is the radiotherapy-machine standard and is used on the Linac tab). The phantom lies <b>head-first, supine</b> (HFS). <b>x</b> increases toward the patient’s <b>left</b>, <b>y</b> toward the <b>posterior</b>, <b>z</b> toward the <b>head</b> (right-handed). Table <b>in</b> = toward the gantry; height is +up.<br>Images follow the radiological display: viewed from the patient’s feet, <b>patient right on the left of the picture</b>, anterior up (R/L/A/P letters are drawn on every image). Scouts are shown head-left: an AP scout has the patient’s left at the top; a lateral scout has anterior at the top and the table at the bottom. Slice positions are measured in cm from the head end (DICOM z decreases along that direction).<br>Gantry tilt is a nominal angle; here + leans the top of the gantry toward the patient’s head.');
      ui.toggle(g4, {label: 'Animate electrons & photons in the x-ray tube', value: true, onChange: (v) => { S.tubeAnim = v; }});
      refs.cover = ui.slider(g4, {label: 'Gantry cover (solid ↔ x-ray)', min: 0, max: 1, step: 0.05, value: 1, fmt: (v) => Math.round(v * 100) + '%', onInput: (v) => { S.coverOpacity = v; }});
      ui.button(g4, 'See the rotating tube', () => { S.coverOpacity = 0.12; refs.cover.set(0.12); ct.flyTo(ct.presets.front.target, ct.presets.front.cam); }, 'ghost');
      const g5 = ui.group(p, 'Room & display');
      refs.door = ui.toggle(g5, {label: 'Scan-room door closed (interlock)', value: !S.doorOpen, onChange: (v) => { S.doorOpen = !v; }});
      ui.toggle(g5, {label: 'Show x-ray fan (teaching aid)', value: true, onChange: (v) => { S.fan = v; }});
      ui.toggle(g5, {label: 'Collision interlocks', value: true, onChange: (v) => { S.interlock = v; }});
      ui.segmented(g5, {label: 'Time scale', options: [[1, '1×'], [2, '2×'], [5, '5×']], value: S.timeScale, onChange: (v) => { S.timeScale = +v; }});
      const cv = ui.el('div'); g5.append(cv);
      for (const [t, k] of [['Overview', 'overview'], ['Gantry', 'gantry'], ['Side', 'side'], ['Operator', 'operator']]) ui.button(cv, t, () => { const pr = k === 'overview' ? ct.recenter() : ct.presets[k]; ct.flyTo(pr.target, pr.cam); }, 'ghost');
    }},
    {name: 'Scan', onShow: () => { derive(); drawScout(); }, build: (p) => {
      const g0 = ui.group(p, 'Exam / protocol');
      ui.segmented(g0, {label: 'Protocol preset', options: Object.entries(EXAMS).map(([k, v]) => [k, v.short]), value: W.exam, onChange: (k) => { W.exam = k; protoApply(EXAMS[k]); renderWF(); }});
      const g1 = ui.group(p, 'Acquisition parameters');
      const sg = (label, key, options) => { const s = ui.segmented(g1, {label, options, value: S[key], onChange: (v) => { S[key] = typeof options[0][0] === 'number' ? +v : v; derive(); }}); sync[key] = () => s.set(S[key]); };
      sg('Tube voltage (kVp)', 'kvp', [[80, '80'], [100, '100'], [120, '120'], [140, '140']]);
      sync.mAs = (() => { const s = ui.slider(g1, {label: 'Tube current-time product (mAs per rotation)', min: 10, max: 600, step: 5, value: S.mAs, unit: ' mAs', fmt: (v) => v.toFixed(0), onInput: (v) => { S.mAs = v; derive(); }}); return () => s.set(S.mAs); })();
      sync.pitch = (() => { const s = ui.slider(g1, {label: 'Pitch', min: 0.5, max: 1.5, step: 0.05, value: S.pitch, fmt: (v) => v.toFixed(2), onInput: (v) => { S.pitch = v; derive(); }}); return () => s.set(S.pitch); })();
      sg('Rotation time (s)', 'trot', [[0.35, '0.35'], [0.5, '0.5'], [0.75, '0.75'], [1.0, '1.0']]);
      sg('Beam collimation (mm)', 'collim', [[20, '20'], [40, '40']]);
      sg('Slice thickness (mm)', 'thick', [[1.25, '1.25'], [2.5, '2.5'], [5, '5'], [10, '10']]);
      const kn = ui.segmented(g1, {label: 'Reconstruction kernel', options: Object.entries(KERNEL_NAMES).map(([k, v]) => [k, v.name.split(' ')[0]]), value: S.kernel, onChange: (v) => { S.kernel = v; }}); sync.kernel = () => kn.set(S.kernel);
      sync.fov = (() => { const s = ui.slider(g1, {label: 'Display field of view', min: 15, max: 50, step: 1, value: S.fov, unit: ' cm', fmt: (v) => v.toFixed(0), onInput: (v) => { S.fov = v; }}); return () => s.set(S.fov); })();
      const md = ui.segmented(g1, {label: 'Scan mode', options: [['helical', 'Helical'], ['axial', 'Axial (step & shoot)']], value: S.mode, onChange: (v) => { S.mode = v; derive(); }}); sync.mode = () => md.set(S.mode);
      const g2 = ui.group(p, 'Derived values');
      refs.dMA = ui.readout(g2, 'Tube current'); refs.dSp = ui.readout(g2, 'Table speed'); refs.dT = ui.readout(g2, 'Scan time (est.)'); refs.dC = ui.readout(g2, 'CTDIvol'); refs.dD = ui.readout(g2, 'DLP · effective dose (≈)'); refs.dH = ui.readout(g2, 'Tube heat after scan');
      ui.note(g2, 'CTDIvol ∝ mAs ÷ pitch and rises steeply with kVp (≈ kVp<sup>2–3</sup>). Effective dose uses a chest conversion factor (0.014 mSv/mGy·cm) and is illustrative only.');
      const g3 = ui.group(p, 'Scout & scan range');
      const sr = ui.el('div'); g3.append(sr);
      refs.scoutAP = ui.button(sr, 'Scout AP', () => doScout('ap'), ''); refs.scoutLat = ui.button(sr, 'Scout lateral', () => doScout('lat'), 'ghost');
      refs.scoutCv = ui.el('canvas', 'plot'); refs.scoutCv.style.height = '150px'; g3.append(refs.scoutCv);
      refs.scoutCv.addEventListener('pointerdown', (e) => { if (!S.scoutDone) return; const r = refs.scoutCv.getBoundingClientRect(), s = ((e.clientX - r.left) / r.width) * PHANTOM_LEN, [a, b] = S.range; if (Math.abs(s - a) < Math.abs(s - b)) S.range = [Math.min(s, b - 1), b]; else S.range = [a, Math.max(s, a + 1)]; syncRange(); });
      sync.r0 = (() => { const s = ui.slider(g3, {label: 'Range start (from head end)', min: 0, max: PHANTOM_LEN, step: 0.5, value: S.range[0], unit: ' cm', onInput: (v) => { S.range[0] = Math.min(v, S.range[1] - 1); syncRange(true); }}); refs.r0 = s; return () => s.set(S.range[0]); })();
      sync.r1 = (() => { const s = ui.slider(g3, {label: 'Range end', min: 0, max: PHANTOM_LEN, step: 0.5, value: S.range[1], unit: ' cm', onInput: (v) => { S.range[1] = Math.max(v, S.range[0] + 1); syncRange(true); }}); refs.r1 = s; return () => s.set(S.range[1]); })();
      ui.note(g3, 'Modules (head → feet): <b>A</b> 0–10 cm HU inserts · <b>B</b> 10–20 cm uniformity · <b>C</b> 20–34 cm thorax. Tap the scout to move the nearest range end.');
      const g4 = ui.group(p, 'Acquire');
      const ar = ui.el('div'); g4.append(ar);
      ui.button(ar, '☢ Stationary beam demo', () => doDemo(), 'ghost');
      refs.go = ui.button(ar, '☢ ACQUIRE SCAN', () => doScan(), 'warn'); ui.button(ar, 'Stop', () => { ct.abortScan('Operator stop'); ui.toast('Exposure stopped by operator.', 'bad'); }, 'ghost');
      refs.prog = ui.readout(g4, 'Progress'); refs.heat = ui.readout(g4, 'Tube heat load');
    }},
    {name: 'Images', onShow: () => { refreshView(true); }, build: (p) => {
      refs.vwrap = ui.el('div'); p.append(refs.vwrap);
      refs.cv = ui.el('canvas'); refs.cv.style.cssText = 'width:100%;aspect-ratio:1;background:#000;border-radius:12px;display:block;touch-action:none;image-rendering:auto'; refs.vwrap.append(refs.cv);
      refs.vinfo = ui.note(p, 'Acquire a scan to see images.');
      refs.sl = ui.slider(p, {label: 'Slice', min: 0, max: 1, step: 1, value: 0, fmt: (v) => 'slice ' + (v + 1), onInput: (v) => { view.idx = v; scheduleView(); }});
      const wlRow = ui.el('div'); p.append(wlRow); for (const [k, [n, l, w]] of Object.entries(WL)) ui.button(wlRow, n, () => { setWL(l, w, k); }, 'ghost');
      refs.ww = ui.slider(p, {label: 'Window width', min: 50, max: 2500, step: 10, value: 400, fmt: (v) => v.toFixed(0), onInput: (v) => { view.ww = v; draw(); }});
      refs.wl = ui.slider(p, {label: 'Window level', min: -1000, max: 1000, step: 5, value: 40, fmt: (v) => v.toFixed(0), onInput: (v) => { view.wl = v; draw(); }});
      ui.segmented(p, {label: 'ROI radius', options: [[0.3, '3 mm'], [0.5, '5 mm'], [1, '1 cm'], [2, '2 cm']], value: 1, onChange: (v) => { view.roiR = +v; if (view.roi) { view.roi.r = view.roiR; draw(); } }});
      refs.roi = ui.readout(p, 'ROI mean ± SD'); refs.cursor = ui.readout(p, 'Pixel under cursor');
      ui.note(p, 'Tap the image to place a circular ROI (choose its radius above; a small ROI is needed for small objects). Patient-right is on the left of the picture (viewed from the feet). Noise = SD of water; try again with higher mAs or a softer kernel.');
      ui.button(p, 'Show scan report', () => report(), 'ghost');
      const pv = (e) => { const r = refs.cv.getBoundingClientRect(); return {x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height}; };
      const toCm = (q) => ({cx: (q.x - 0.5) * view.img.fov, cy: (0.5 - q.y) * view.img.fov});
      refs.cv.addEventListener('pointerdown', (e) => { if (!view.img) return; const c = toCm(pv(e)); view.roi = {cx: c.cx, cy: c.cy, r: view.roiR}; draw(); });
      refs.cv.addEventListener('pointermove', (e) => { if (!view.img) return; const c = toCm(pv(e)), im = view.img, px = im.fov / im.n, i = Math.floor(c.cx / px + im.n / 2), j = Math.floor(im.n / 2 - c.cy / px); if (i >= 0 && j >= 0 && i < im.n && j < im.n) refs.cursor.set(`${im.hu[j * im.n + i].toFixed(0)} HU`); });
    }},
    {name: 'Workflow', build: (p) => { refs.wf = p; }},
    {name: 'Parts', build: (p) => {
      ui.note(p, 'Tap a component below — or tap it in the 3D view — to isolate it and read how it works.');
      const grid = ui.el('div', 'parts'); p.append(grid); refs.partBtns = [];
      modelDescriptions.forEach((d, i) => { const b = ui.el('button', '', `<small style="color:var(--mute)">${String(i + 1).padStart(2, '0')}</small><br>${d.Title}`); b.onclick = () => selectIndex(i); grid.append(b); refs.partBtns.push(b); });
      ui.button(p, 'Clear selection', () => selectIndex(-1), 'ghost');
    }},
  ]);
  const tabBtn = (i) => stage.renderer.domElement.ownerDocument.querySelectorAll('.tabbar button')[i];
  const goTab = (i) => tabBtn(i) && tabBtn(i).click();

  /* ---------- helpers ---------- */
  function derive() {
    if (!refs.dMA) return;
    const mA = S.mAs / S.trot, v = (S.pitch * S.collim) / S.trot, len = Math.abs(S.range[1] - S.range[0]), t = S.mode === 'helical' ? (len * 10) / v : Math.ceil((len * 10) / S.collim) * (S.trot + 0.4) ;
    const di = doseInfo({kvp: S.kvp, mAs: S.mAs, pitch: S.pitch, lengthCm: len}), heat = S.heat + (S.kvp * mA * t) / 1e6;
    refs.dMA.set(mA.toFixed(0) + ' mA'); refs.dSp.set(S.mode === 'helical' ? v.toFixed(0) + ' mm/s' : 'step ' + S.collim + ' mm'); refs.dT.set(t.toFixed(1) + ' s'); refs.dC.set(di.ctdi.toFixed(1) + ' mGy');
    refs.dD.set(`${di.dlp.toFixed(0)} mGy·cm · ${di.eff.toFixed(1)} mSv`); refs.dH.set(`${(heat / S.heatCap * 100).toFixed(0)} %`, heat / S.heatCap > 0.9 ? 'bad' : heat / S.heatCap > 0.7 ? 'warn' : '');
  }
  function syncRange(skipSliders) { if (!skipSliders) { refs.r0 && refs.r0.set(S.range[0]); refs.r1 && refs.r1.set(S.range[1]); } else { refs.r0 && refs.r0.set(S.range[0]); refs.r1 && refs.r1.set(S.range[1]); } derive(); drawScout(); }
  function drawScout() {
    const cv = refs.scoutCv; if (!cv) return; const dpr = 2, w = (cv.width = (cv.clientWidth || 320) * dpr), h = (cv.height = 150 * dpr), g = cv.getContext('2d'); g.fillStyle = '#05090c'; g.fillRect(0, 0, w, h);
    if (!S.scoutDone) { g.fillStyle = '#6fa3ad'; g.font = `${13 * dpr}px system-ui`; g.textAlign = 'center'; g.fillText('no scout yet — take a scout', w / 2, h / 2); return; }
    g.imageSmoothingEnabled = true; g.drawImage(ct.scoutCanvas(S.scoutDone.img), 0, 0, w, h);
    const x0 = (S.range[0] / PHANTOM_LEN) * w, x1 = (S.range[1] / PHANTOM_LEN) * w; g.fillStyle = 'rgba(255,211,77,.12)'; g.fillRect(x0, 0, x1 - x0, h); g.strokeStyle = '#ffd34d'; g.lineWidth = 2; g.strokeRect(x0, 1, x1 - x0, h - 2);
    g.fillStyle = '#9fd3dc'; g.font = `${11 * dpr}px system-ui`; g.textAlign = 'left'; g.fillText(S.scoutDone.view === 'ap' ? 'AP scout' : 'Lateral scout', 6, 14 * dpr * 0.8);
    g.fillStyle = '#ffd34d'; g.textAlign = 'right'; g.fillText('FEET →', w - 6, h * 0.5); g.textAlign = 'left'; g.fillText('← HEAD', 6, h * 0.5 + 12 * dpr); g.textAlign = 'center'; g.fillText(S.scoutDone.view === 'ap' ? 'L (patient left)' : 'A (anterior)', w * 0.5, 14 * dpr * 0.8); g.fillText(S.scoutDone.view === 'ap' ? 'R (patient right)' : 'P (posterior / table)', w * 0.5, h - 6);
    SECTIONS.forEach((s) => { const x = (s.s0 / PHANTOM_LEN) * w; g.strokeStyle = 'rgba(255,255,255,.25)'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); g.setLineDash([]); g.fillStyle = 'rgba(255,255,255,.65)'; g.fillText(s.name.slice(7, 8), x + 6, h - 8); });
  }

  /* ---------- actions ---------- */
  function doScout(view_) { const bad = ct.startScan('scout', {view: view_}); if (bad) { ui.toast(bad, 'bad'); return; } ui.toast('Scout: tube parked, table travelling through the gantry…'); }
  // teaching mode: tube parked at the top, gantry not rotating, table not moving; the electron-to-photon animation plays inside the tube
  function doDemo() {
    S.doorOpen = false; refs.door && refs.door.set(true);
    const bad = ct.startScan('demo'); if (bad) { ui.toast(bad, 'bad'); return; }
    S.coverOpacity = 0.12; refs.cover && refs.cover.set(0.12); ct.selectPart('xray_tube');
    ui.toast('Stationary beam demo (~12 s): electrons strike the anode focal spot and the photon fan leaves the tube. No scan data are acquired.', 'ok');
  }
  function doScan() { const bad = ct.startScan('scan'); if (bad) { ui.toast(bad, 'bad'); return; } ui.toast('Acquiring — keep clear of the gantry.'); }
  ct.on('scanEvent', (ev) => {
    if (ev.type === 'abort') ui.toast('Scan aborted: ' + ev.why, 'bad');
    if (ev.type === 'done' && ev.kind === 'scout') { ui.toast('Scout complete — set the scan range on the scout.', 'ok'); drawScout(); syncScan(); }
    if (ev.type === 'done' && ev.kind === 'scan') { ui.toast(`Scan complete · CTDIvol ${ev.res.dose.ctdi.toFixed(1)} mGy · DLP ${ev.res.dose.dlp.toFixed(0)} mGy·cm`, 'ok'); view.idx = Math.floor(ev.res.n / 2); view.roi = null; view.wl = W.exam === 'qa' ? 0 : 40; view.ww = W.exam === 'qa' ? 200 : 400; refs.wl.set(view.wl); refs.ww.set(view.ww); refs.sl.setRange(0, ev.res.n - 1); refs.sl.set(view.idx); goTab(2); refreshView(true); }
  });
  function setWL(l, w, key) { view.wl = l; view.ww = w; refs.wl && refs.wl.set(l); refs.ww && refs.ww.set(w); if (key === 'lung') W.wlOk = true; draw(); tickWF(); }
  const sOf = (i) => { const r = S.scanRes; return r ? Math.min(PHANTOM_LEN - 0.01, r.s0 + (i + 0.5) * (r.thick / 10)) : 0; };
  let schedT = 0; function scheduleView() { clearTimeout(schedT); schedT = setTimeout(() => refreshView(true), 60); refs.vinfo.textContent = 'reconstructing…'; }
  function refreshView(force) {
    const r = S.scanRes; if (!r || !refs.cv) return; refs.sl.setRange(0, r.n - 1);
    const s = sOf(view.idx); if (!force && view.img && view.img.s === Math.round(s * 10) / 10) return;
    view.img = ct.recon(s); view.img.canvas = view.img.canvas || document.createElement('canvas'); draw();
  }
  function draw() {
    const im = view.img; if (!im || !refs.cv) return; const rois = view.roi ? [{...view.roi}] : [];
    windowToCanvas(im, refs.cv, view.wl, view.ww, rois);
    const egg = view.ww >= 2400 && view.wl >= 800; if (egg) { dogBones(refs.cv.getContext('2d'), im.n); if (!W.egg) { W.egg = true; ui.toast('🐕 Found it: a very good dog hides in the bone window.', 'ok'); } }
    // annotate orientation + info
    const g = refs.cv.getContext('2d'), n = im.n; g.fillStyle = '#ffd34d'; g.font = `${Math.round(n / 18)}px system-ui`; g.textAlign = 'center'; g.fillText('R', n * 0.04, n / 2); g.fillText('L', n * 0.96, n / 2); g.fillText('A', n / 2, n * 0.07); g.fillText('P', n / 2, n * 0.93);
    g.textAlign = 'left'; g.font = `${Math.round(n / 22)}px monospace`; g.fillStyle = '#b6e0e6'; g.fillText(`${im.params.kvp} kVp  ${im.params.mAs} mAs  ${im.params.thick} mm`, 6, n - 6 - n / 18 * 0); g.textAlign = 'right'; g.fillText(`W${Math.round(view.ww)} L${Math.round(view.wl)}`, n - 6, n - 6);
    windowToCanvas(im, im.canvas, view.wl, view.ww, rois);
    if (view.ww >= 2400 && view.wl >= 800) dogBones(im.canvas.getContext('2d'), im.n);
    ct.showMonitorImage(im, view.wl, view.ww);
    refs.vinfo.innerHTML = `<b>${im.section.name}</b> · slice at <b>${im.s.toFixed(1)} cm</b> · FOV ${im.fov} cm<br>${im.section.note}`;
    if (view.roi) { const st = roiStats(im, view.roi.cx, view.roi.cy, view.roi.r); refs.roi.set(`${st.mean.toFixed(1)} ± ${st.sd.toFixed(1)} HU`); view.roiStat = st; checkROI(st, im); } else refs.roi.set('—');
    tickWF();
  }
  function checkROI(st, im) {
    const ox = im.params.dx, oy = im.params.dy, inWater = Math.hypot(view.roi.cx - ox, view.roi.cy - oy) < 3.5 && (im.section.name.includes('Module A') || im.section.name.includes('Module B'));
    if (inWater && Math.abs(st.mean) < 10 && st.sd < 14) W.roiOk = true;
    if (im.section.name.includes('Thorax') && view.roi.r <= 0.5 && Math.hypot(view.roi.cx + 9.4 - ox, view.roi.cy - 2.2 - oy) < 0.8 && st.mean > -150) W.nod = true;
  }
  function report() { const r = S.scanRes; if (!r) return ui.toast('No scan yet.', 'bad'); ui.showCard({title: 'Scan dose report', subtitle: 'illustrative, not for clinical use', html: `${r.kvp} kVp · ${r.mAs} mAs/rotation (eff. ${(r.mAs / r.pitch).toFixed(0)}) · pitch ${r.pitch}\nrange ${r.s0.toFixed(1)}–${r.s1.toFixed(1)} cm · ${r.n} slices × ${r.thick} mm\n\n<b>CTDIvol</b> ${r.dose.ctdi.toFixed(1)} mGy\n<b>DLP</b> ${r.dose.dlp.toFixed(0)} mGy·cm\n<b>Effective dose</b> ≈ ${r.dose.eff.toFixed(1)} mSv (k = 0.014)`}); }

  /* ---------- parts explorer ---------- */
  let selCT = -1;
  function selectIndex(i) {
    if (i >= 0 && i === selCT) { i = -1; const rc = ct.recenter(); ct.flyTo(rc.target, rc.cam); }
    selCT = i;
    refs.partBtns.forEach((b, k) => b.classList.toggle('on', k === i));
    if (i < 0) { ct.selectPart(null); ui.hideCard(); return; }
    const d = modelDescriptions[i]; ct.selectPart(d.Modelname);
    ui.showCard({title: d.Title, subtitle: 'Part ' + (i + 1) + ' of ' + modelDescriptions.length, html: d.Description, nav: [['‹ Back', () => selectIndex((i + modelDescriptions.length - 1) % modelDescriptions.length)], ['Next ›', () => selectIndex((i + 1) % modelDescriptions.length)]], onClose: () => selectIndex(-1)});
  }
  stage.renderer.domElement.addEventListener('pointerdown', (e) => { stage._pd = {x: e.clientX, y: e.clientY}; });
  stage.renderer.domElement.addEventListener('pointerup', (e) => {
    if (!ct.world.visible || !stage._pd || Math.hypot(e.clientX - stage._pd.x, e.clientY - stage._pd.y) > 6) return;
    const hit = stage.pick(e, [ct.world]); let o = hit && hit.object, id = null; while (o && !id) { id = o.userData.part; o = o.parent; }
    if (!id) return selectIndex(-1); const i = modelDescriptions.findIndex((d) => d.Modelname === id); if (i >= 0) selectIndex(i);
  });

  /* ---------- guided workflow ---------- */
  const STEPS = [
    {id: 'plan', title: '1 · Identify & choose the exam', body: () => { const d = ui.el('div'); ui.note(d, 'Confirm identity, indication, allergies and pregnancy status before anything moves (time-out). Pick the exam:');
      ui.segmented(d, {label: 'Exam', options: Object.entries(EXAMS).map(([k, v]) => [k, v.short]), value: W.exam, onChange: (k) => { W.exam = k; protoApply(EXAMS[k]); renderWF(); }});
      ui.note(d, `<b>${EXAMS[W.exam].name}</b> — ${EXAMS[W.exam].blurb}`);
      ui.button(d, W.timeout ? '✔ Time-out done' : 'Perform time-out', () => { W.timeout = true; protoApply(EXAMS[W.exam]); renderWF(); }, W.timeout ? 'go' : ''); return d; },
      checks: () => [['Time-out completed', W.timeout]]},
    {id: 'pos', title: '2 · Position to the lasers', body: () => { const d = ui.el('div'); ui.note(d, 'Slide the phantom so its <b>top mark</b> is on the sagittal laser, raise the table until the <b>side marks</b> sit on the coronal laser, then move the table in so the <b>landmark ring</b> sits on the axial laser. Use the Scanner tab.');
      refs.posRO = [ui.readout(d, 'Sagittal (lateral)'), ui.readout(d, 'Coronal (height)'), ui.readout(d, 'Axial (landmark)')]; ui.button(d, 'Go to Scanner tab', () => goTab(0), 'ghost'); return d; },
      live: () => { const m = ct.marks(); if (refs.posRO) { [[0, m.sagittal], [1, m.coronal], [2, m.axial]].forEach(([i, v]) => refs.posRO[i].set(mm(v) + ' mm', Math.abs(v) < 0.002 ? 'ok' : 'bad')); } },
      checks: () => { const m = ct.marks(), t = 0.002; return [[`Sagittal ${mm(m.sagittal)} mm`, Math.abs(m.sagittal) < t], [`Coronal ${mm(m.coronal)} mm`, Math.abs(m.coronal) < t], [`Axial ${mm(m.axial)} mm`, Math.abs(m.axial) < t]]; }},
    {id: 'scout', title: '3 · Scout (topogram)', body: () => { const d = ui.el('div'); ui.note(d, 'Close the door, then take an AP scout: the tube parks at the top while the table moves through the gantry to build a projection image. The scout is used to plan the range.');
      ui.button(d, 'Close door', () => { S.doorOpen = false; refs.door.set(true); }, 'ghost'); ui.button(d, 'Scout AP', () => doScout('ap'), ''); return d; },
      checks: () => [['Door closed', !S.doorOpen], ['Scout acquired', !!S.scoutDone]]},
    {id: 'plan2', title: '4 · Plan the scan', body: () => { const d = ui.el('div'); const e = EXAMS[W.exam]; ui.note(d, `Cover the target <b>${e.target[0]}–${e.target[1]} cm</b> with no more than ~4 cm extra, keep the gantry untilted, and choose a field of view that includes the whole body (≥ ${e.name.includes('Thorax') || e.name.includes('Low') ? 32 : 22} cm). Check the dose readouts on the Scan tab.`);
      ui.button(d, 'Go to Scan tab', () => goTab(1), 'ghost'); ui.button(d, 'Fit range to target', () => { S.range = [...e.target]; syncRange(); }, 'ghost'); return d; },
      checks: () => { const e = EXAMS[W.exam], [a, b] = S.range, cov = a <= e.target[0] + 0.5 && b >= e.target[1] - 0.5, extra = (e.target[0] - a) + (b - e.target[1]) <= 4.5, fov = S.fov >= (e.name.includes('Thorax') || e.name.includes('Low') ? 32 : 22);
        return [['Range covers target', cov], ['Little extra irradiation', extra], ['FOV includes body', fov], ['Gantry untilted', Math.abs(axes.tilt.val) < 0.1], ['Tube heat OK', S.heat / S.heatCap < 0.8]]; }},
    {id: 'scan', title: '5 · Acquire', body: () => { const d = ui.el('div'); ui.note(d, 'Press acquire. The tube spins up, the warning lamp over the door turns on, and the table travels at pitch × collimation ÷ rotation time.'); ui.button(d, '☢ ACQUIRE', () => doScan(), 'warn'); ui.button(d, 'Open Images', () => goTab(2), 'ghost'); return d; },
      checks: () => [['Door closed', !S.doorOpen], ['Scan acquired', !!S.scanRes && !S.scanState]]},
    {id: 'review', title: '6 · Review & measure', body: () => { const d = ui.el('div'); const q = W.exam === 'qa';
      ui.note(d, q ? 'On the Images tab, scroll to a uniform water region, tap to place the ROI in the centre of the phantom: water must read <b>0 ± 10 HU</b> with noise SD < 14 HU. Then examine the inserts (Teflon ≈ +990 HU, air ≈ −1000 HU).' : 'On the Images tab switch to the <b>Lung</b> window and pick a small (3–5 mm) ROI and place it on the 1 cm soft-tissue nodule in the right lung (patient-right = left of the picture). The nodule is soft tissue (≈ 0–60 HU) surrounded by air-filled lung (≈ −820 HU).');
      ui.button(d, 'Go to Images', () => goTab(2), 'ghost'); return d; },
      checks: () => (W.exam === 'qa' ? [['Water ROI ≈ 0 HU, low noise', W.roiOk]] : [['Lung window used', W.wlOk], ['Nodule measured', W.nod]])},
    {id: 'end', title: '7 · Finish', body: () => { const d = ui.el('div'); ui.note(d, 'Move the table out and down, open the door and review the dose report. The dose report is part of the study record.'); ui.button(d, 'Table out & down', () => { axes.tableIn.tgt = 0; axes.tableH.tgt = 0.95; syncScan(); }, 'ghost'); ui.button(d, 'Open door', () => { S.doorOpen = true; refs.door.set(false); }, 'ghost'); ui.button(d, 'Dose report', () => report(), 'ghost'); return d; },
      checks: () => [['Door open', S.doorOpen], ['Table withdrawn', axes.tableIn.val < 0.05]]},
  ];
  function buildWF() { refs.wf.innerHTML = ''; ui.note(refs.wf, 'A guided simulated examination on a CT phantom. Each step has pass/fail checks. <b>No data are recorded or sent anywhere.</b>'); refs.wfBody = ui.el('div'); refs.wf.append(refs.wfBody); renderWF(); }
  function renderWF() {
    const body = refs.wfBody; if (!body) return; body.innerHTML = '';
    STEPS.forEach((st, i) => {
      const c = ui.el('div', 'step' + (i === W.step ? ' on' : i < W.step ? ' done' : '')); c.append(ui.el('h4', '', st.title));
      if (i === W.step) { c.append(st.body()); refs.chk = ui.el('div', 'chk'); c.append(refs.chk); refs.next = ui.button(c, i === STEPS.length - 1 ? 'Finish' : 'Next step ›', () => { if (W.step < STEPS.length - 1) { W.step++; renderWF(); } else ui.toast('Examination complete — well done!', 'ok'); }, 'go'); refs.next.disabled = true; ui.button(c, '⏭ Skip: do this step for me', () => skipStep(), 'ghost'); if (i > 0) ui.button(c, '‹ Back', () => { W.step--; renderWF(); }, 'ghost'); }
      body.append(c);
    });
    tickWF();
  }

  /* Skip: perform the motions/actions the current step needs, wait for its checks to pass, then advance. */
  let skipping = false;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(cond, ms = 30000) { const t0 = performance.now(); while (!cond() && performance.now() - t0 < ms) await sleep(100); return cond(); }
  async function skipStep() {
    if (skipping) return; skipping = true; const ts = S.timeScale; S.timeScale = 5; const id = STEPS[W.step].id, e = EXAMS[W.exam];
    try {
      if (id === 'plan') { W.timeout = true; protoApply(e); }
      else if (id === 'pos') { for (let k = 0; k < 3; k++) { const m = ct.marks(); ct.nudge(-m.sagittal); axes.tableH.tgt = Math.min(axes.tableH.max, Math.max(axes.tableH.min, axes.tableH.val - m.coronal)); axes.tableIn.tgt = Math.min(axes.tableIn.max, Math.max(0, axes.tableIn.val + m.axial)); syncScan();
          await until(() => Math.abs(axes.tableH.val - axes.tableH.tgt) < 1e-4 && Math.abs(axes.tableIn.val - axes.tableIn.tgt) < 1e-4, 15000); const m2 = ct.marks(); if (Math.max(Math.abs(m2.sagittal), Math.abs(m2.coronal), Math.abs(m2.axial)) < 0.0015) break; } }
      else if (id === 'scout') { S.doorOpen = false; refs.door && refs.door.set(true); axes.tilt.tgt = 0; await until(() => Math.abs(axes.tilt.val) < 0.05, 8000); doScout('ap'); await sleep(300); await until(() => S.scoutDone && !S.scanState, 60000); }
      else if (id === 'plan2') { axes.tilt.tgt = 0; S.range = [...e.target]; S.fov = Math.max(S.fov, e.name.includes('Thorax') || e.name.includes('Low') ? 34 : 24); syncRange && syncRange(); syncScan(); await until(() => Math.abs(axes.tilt.val) < 0.1, 8000); }
      else if (id === 'scan') { S.doorOpen = false; refs.door && refs.door.set(true); doScan(); await sleep(300); await until(() => S.scanRes && !S.scanState, 120000); }
      else if (id === 'review') { if (W.exam === 'qa') W.roiOk = true; else { setWL(-600, 1500, 'lung'); W.nod = true; } ui.toast('Review step completed for you — on your own, place the ROI on the Images tab.', 'ok'); }
      else if (id === 'end') { axes.tableIn.tgt = 0; axes.tableH.tgt = 0.95; S.doorOpen = true; refs.door && refs.door.set(false); syncScan(); }
      const st = STEPS[W.step]; const ok = await until(() => st.checks().every(([, k]) => k), 30000);
      if (ok) { if (W.step < STEPS.length - 1) { W.step++; renderWF(); } else ui.toast('Examination complete — well done!', 'ok'); } else { renderWF(); ui.toast('Skip could not finish this step automatically (check interlocks).', 'bad'); }
    } finally { S.timeScale = ts; skipping = false; }
  }
  function tickWF() { const st = STEPS[W.step]; if (!st || !refs.chk) return; if (st.live) st.live(); const cs = st.checks(); refs.chk.innerHTML = cs.map(([t, ok]) => `<span class="${ok ? 'y' : 'n'}">${ok ? '✔' : '✖'} ${t}</span>`).join(''); if (refs.next) refs.next.disabled = !cs.every(([, ok]) => ok); }
  protoApply(EXAMS[W.exam]); buildWF(); derive();

  /* ---------- HUD ---------- */
  const pill = (cls, txt) => { const d = ui.el('div', 'pill', `<span class="dot ${cls}"></span><span>${txt}</span>`); ui.hud.append(d); return {d, set(c, t) { d.firstChild.className = 'dot ' + c; d.lastChild.textContent = t; }}; };
  const hX = pill('green', 'READY'), hDoor = pill('', ''), hPos = pill('', '');
  let acc = 0;
  ct.on('change', () => {
    const n = performance.now(); if (n - acc < 120) return; acc = n;
    hX.set(S.xray ? 'red' : S.status === 'INTERLOCK' || S.status === 'ABORTED' ? 'amber' : 'green', S.xray ? `X-RAY ON  ${S.scanState ? Math.round(S.scanState.progress * 100) + ' %' : ''}` : S.scanState ? S.status : S.status);
    hDoor.set(S.doorOpen ? 'amber' : 'green', S.doorOpen ? 'Door open' : 'Door closed'); hPos.set('', `Table ${(axes.tableIn.val * 1000).toFixed(0)} mm · H ${(axes.tableH.val * 1000).toFixed(0)} · Tilt ${axes.tilt.val.toFixed(1)}°`);
    const m = ct.marks(), ok = (v, t) => (Math.abs(v) < t ? 'ok' : 'bad');
    if (refs.alAx) { refs.alAx.set(mm(m.axial) + ' mm', ok(m.axial, 0.002)); refs.alSag.set(mm(m.sagittal) + ' mm', ok(m.sagittal, 0.002)); refs.alCor.set(mm(m.coronal) + ' mm', ok(m.coronal, 0.002)); }
    if (refs.prog) { const st = S.scanState; refs.prog.set(st ? `${st.kind} · ${st.phase} · ${Math.round(st.progress * 100)} %` : 'idle'); refs.heat.set(`${(S.heat / S.heatCap * 100).toFixed(0)} % of ${S.heatCap.toFixed(1)} MHU`, S.heat / S.heatCap > 0.8 ? 'bad' : S.heat / S.heatCap > 0.5 ? 'warn' : ''); }
    if (!S.scanState && !S.xray && S.status !== 'INTERLOCK' && S.status !== 'ABORTED') S.status = 'READY';
    if (refs.tin && !S.scanState) { refs.tin.set(axes.tableIn.val * 1000); } else if (refs.tin) refs.tin.set(axes.tableIn.val * 1000);
    refs.th && refs.th.set(axes.tableH.val * 1000); derive(); tickWF();
  });
  ct.on('collision', ({axis, what}) => { ui.toast(`COLLISION INTERLOCK: ${axis} stopped — would hit ${what}`, 'bad'); for (const f of Object.values(sync)) f(); });
  return {tabs, selectIndex, workflow: W, view, goTab, refreshView, doScout, doScan, syncScan};
}
