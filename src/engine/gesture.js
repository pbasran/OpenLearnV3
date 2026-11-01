// Hand-gesture control (prototype). The device camera watches ONE hand; a pinch-and-drag sets the target of the selected machine axis.
// Runs fully on-device (MediaPipe Hands, WebAssembly, files bundled in /mediapipe/hands). No video is stored or sent anywhere.
// Gestures only write axis TARGETS (axes[k].tgt) so every existing speed limit and collision interlock still applies.

const MP = import.meta.env.BASE_URL + 'mediapipe/hands/';
const T = {pinchOn: 0.28, pinchOff: 0.42, fistFrames: 4, lostMs: 350, dead: 0.012, smooth: 0.4};

// Per-mode control chips: [axis key, label, span in axis units covered by sweeping the full width of the preview, unit, invert]
const CONTROLS = {
  linac: [['gantry', 'Gantry', 360, '°'], ['coll', 'Collimator', 350, '°'], ['couchVrt', 'Couch height', 0.8, ' m'], ['couchLng', 'Couch in/out (IEC +Y = in)', 1.75, ' m'], ['couchLat', 'Couch lateral', 0.5, ' m'], ['couchRot', 'Couch rotation', 190, '°']],
  ct: [['tableIn', 'Table in/out', 1.5, ' m'], ['tableH', 'Table height', 0.68, ' m'], ['tilt', 'Gantry tilt', 60, '°']],
};

const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Pure logic (no DOM): feed MediaPipe landmarks (normalised, selfie-mirrored x), get gesture events. Exported for testing.
export function createGestureLogic(getAxes, onEvent = () => {}) {
  const s = {sel: null, pinched: false, anchor: null, start: 0, fistN: 0, lastSeen: 0, px: 0, py: 0, hasP: false, held: false};
  const classify = (L) => {
    const scale = d2(L[0], L[9]) || 1e-6;                       // wrist → middle-finger knuckle = hand size
    const pinchD = d2(L[4], L[8]) / scale;
    const curled = [[8, 6], [12, 10], [16, 14], [20, 18]].every(([tip, pip]) => d2(L[tip], L[0]) < d2(L[pip], L[0]) * 1.05);
    return {pinchD, fist: curled && pinchD > T.pinchOff};
  };
  function stopAll() { const A = getAxes(); for (const a of Object.values(A)) a.tgt = a.val; }
  return {
    state: s,
    select(key, spanInfo) { s.sel = key ? {key, span: spanInfo} : null; if (s.pinched) { s.pinched = false; s.held = false; } },
    // L = 21 landmarks {x,y,z} with x already mirrored (1 - x). now = ms.
    feed(L, now = performance.now()) {
      if (!L) { if (s.lastSeen && now - s.lastSeen > T.lostMs) { if (s.pinched) { stopAll(); onEvent('lost'); } s.pinched = false; s.held = false; s.hasP = false; s.fistN = 0; } return null; }
      s.lastSeen = now;
      const c = classify(L);
      // pinch point = midpoint thumb/index, smoothed
      const rx = (L[4].x + L[8].x) / 2, ry = (L[4].y + L[8].y) / 2;
      if (!s.hasP) { s.px = rx; s.py = ry; s.hasP = true; } else { s.px += (rx - s.px) * T.smooth; s.py += (ry - s.py) * T.smooth; }
      // fist = stop (needs a few consecutive frames so a flicker can't trigger it)
      s.fistN = c.fist ? s.fistN + 1 : 0;
      if (s.fistN === T.fistFrames) { stopAll(); s.pinched = false; onEvent('stop'); }
      if (c.fist) return {...c, px: s.px, py: s.py, pinched: false};
      // hysteresis on pinch
      if (!s.pinched && c.pinchD < T.pinchOn && s.sel) {
        const a = getAxes()[s.sel.key]; if (a) { s.px = rx; s.py = ry; s.pinched = true; s.anchor = s.px; s.start = a.tgt; onEvent('grab', s.sel.key); }   // snap the smoothing to the true pinch point so the grab doesn't jump
      } else if (s.pinched && c.pinchD > T.pinchOff) { s.pinched = false; onEvent('release'); }
      if (s.pinched && s.sel) {
        const a = getAxes()[s.sel.key]; let dx = s.px - s.anchor; if (Math.abs(dx) < T.dead) dx = 0;
        const v = Math.min(a.max, Math.max(a.min, s.start + dx * s.sel.span[2] * (s.sel.span[4] ? -1 : 1)));
        a.tgt = v; onEvent('move', s.sel.key, v);
      }
      return {...c, px: s.px, py: s.py, pinched: s.pinched};
    },
  };
}

export function setupGestures(stage, ui, getModule, getMode) {
  const btnHost = document.querySelector('.bar');
  const wrap = document.createElement('div'); wrap.className = 'modes'; wrap.style.marginRight = '8px';
  const btn = document.createElement('button'); btn.textContent = '✋ Gesture'; btn.title = 'Control the machine with a hand gesture (camera)'; wrap.append(btn);
  btnHost.insertBefore(wrap, btnHost.lastChild);

  const panel = document.createElement('div'); panel.className = 'gpanel'; panel.style.display = 'none';
  panel.innerHTML = `<div class="gv"><video playsinline muted></video><canvas></canvas></div><div class="gst">Starting camera…</div><div class="gchips"></div><div class="gnote">Pinch thumb + index and drag left/right to move the selected axis. Close your fist to stop. Video stays on this device.</div><button class="gx">✕ Close</button>`;
  document.getElementById('ui').append(panel);
  const video = panel.querySelector('video'), cv = panel.querySelector('canvas'), ctx = cv.getContext('2d'), st = panel.querySelector('.gst'), chips = panel.querySelector('.gchips');
  const css = document.createElement('style');
  css.textContent = `.gpanel{position:fixed;left:10px;bottom:10px;width:min(260px,70vw);background:rgba(20,32,36,.92);color:#e7f0f2;border:1px solid #2a3d42;border-radius:12px;padding:8px;z-index:30;font:13px/1.35 system-ui,sans-serif}
  .gv{position:relative;aspect-ratio:4/3;border-radius:8px;overflow:hidden;background:#000}.gv video,.gv canvas{position:absolute;inset:0;width:100%;height:100%;transform:scaleX(-1)}.gv canvas{pointer-events:none}
  .gst{margin:6px 0 4px;font-weight:600}.gchips{display:flex;flex-wrap:wrap;gap:4px}.gchips button{border:1px solid #3a5a60;background:transparent;color:inherit;border-radius:999px;padding:3px 9px;font-size:12px}.gchips button.on{background:#1a6e78;border-color:#4fc3d1}
  .gnote{opacity:.75;margin:6px 0;font-size:11.5px}.gx{width:100%;border:1px solid #6b3a3a;background:transparent;color:#ffb4a8;border-radius:8px;padding:5px}
  @media (max-width:640px){.gpanel{bottom:auto;top:56px;left:auto;right:8px;width:min(190px,48vw)}.gnote{display:none}}`;
  document.head.append(css);

  const G = {on: false, hands: null, stream: null, logic: null, raf: 0, busy: false, logic0: null};
  const getAxes = () => { const m = getModule(); return (m && m.obj && m.obj.axes) || {}; };
  const sync = () => { try { (window.panels || {}).syncSliders?.(); (window.ctp || {}).syncScan?.(); } catch (e) {} };

  function buildChips() {
    chips.innerHTML = ''; const mode = getMode(); const list = CONTROLS[mode] || [];
    list.forEach(([key, label, span, unit, inv], i) => {
      const b = document.createElement('button'); b.textContent = label;
      b.onclick = () => { [...chips.children].forEach((x) => x.classList.remove('on')); b.classList.add('on'); G.logic.select(key, [key, label, span, unit, inv]); };
      chips.append(b); if (i === 0) b.click();
    });
  }
  function loadScript(src) { return new Promise((res, rej) => { if (window.Hands) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('hand-tracking files failed to load')); document.head.append(s); }); }

  async function start() {
    if (G.on) return; G.on = true; panel.style.display = 'block'; st.textContent = 'Starting camera…';
    G.logic = createGestureLogic(getAxes, (ev, key, v) => {
      if (ev === 'grab') st.textContent = '✊ Holding ' + key; else if (ev === 'release') st.textContent = '🖐 Ready'; else if (ev === 'stop') { st.textContent = '⛔ Stopped'; ui.toast('Stopped (fist).'); sync(); }
      else if (ev === 'lost') { st.textContent = 'Hand lost — stopped'; sync(); } else if (ev === 'move') { sync(); const m = getModule(); if (m && m.obj.S) m.obj.S.status = 'MOVING'; }
    });
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('This browser has no camera access (needs HTTPS).');
      G.stream = await navigator.mediaDevices.getUserMedia({video: {facingMode: 'user', width: {ideal: 640}, height: {ideal: 480}}, audio: false});
      video.srcObject = G.stream; await video.play();
      await loadScript(MP + 'hands.js');
      G.hands = new window.Hands({locateFile: (f) => MP + f});
      G.hands.setOptions({maxNumHands: 1, modelComplexity: 0, minDetectionConfidence: 0.6, minTrackingConfidence: 0.5, selfieMode: false});
      G.hands.onResults((r) => {
        cv.width = video.videoWidth || 640; cv.height = video.videoHeight || 480; ctx.clearRect(0, 0, cv.width, cv.height);
        const lm = r.multiHandLandmarks && r.multiHandLandmarks[0];
        if (lm) {
          const L = lm.map((p) => ({x: 1 - p.x, y: p.y, z: p.z}));          // mirror so moving your hand right moves the value right
          const out = G.logic.feed(L); ctx.fillStyle = out && out.pinched ? '#4fc3d1' : '#f5c542';
          for (const p of lm) { ctx.beginPath(); ctx.arc(p.x * cv.width, p.y * cv.height, 3, 0, 6.3); ctx.fill(); }
          if (!G.logic.state.pinched && !/Stopped/.test(st.textContent)) st.textContent = '🖐 Ready — pinch to grab';
        } else { G.logic.feed(null); if (!G.logic.state.pinched) st.textContent = 'No hand in view'; }
      });
      st.textContent = 'Loading hand tracker…'; await G.hands.initialize(); buildChips(); st.textContent = '🖐 Ready — pinch to grab';
      const loop = async () => { if (!G.on) return; if (!G.busy && video.readyState >= 2) { G.busy = true; try { await G.hands.send({image: video}); } catch (e) {} G.busy = false; } G.raf = requestAnimationFrame(loop); };
      loop();
    } catch (e) { st.textContent = 'Gesture mode unavailable: ' + (e.message || e); ui.toast('Gesture mode unavailable (camera blocked or not supported). Sliders still work.', 'bad'); stop(true); }
  }
  function stop(keepMsg) {
    G.on = false; cancelAnimationFrame(G.raf);
    if (G.stream) G.stream.getTracks().forEach((t) => t.stop()); G.stream = null; video.srcObject = null;
    if (G.hands) { try { G.hands.close(); } catch (e) {} G.hands = null; }
    if (!keepMsg) panel.style.display = 'none'; else setTimeout(() => { if (!G.on) panel.style.display = 'none'; }, 3500);
  }
  btn.onclick = () => (G.on ? stop() : start());
  panel.querySelector('.gx').onclick = () => stop();
  window.addEventListener('mode-changed', () => { if (G.on && G.logic) buildChips(); });
  return {start, stop, G};
}
