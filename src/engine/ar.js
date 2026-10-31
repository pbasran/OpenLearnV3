// WebXR augmented reality: hit-test placement of the current module on a real surface, tabletop ↔ life-size scale,
// shadow-catcher floor, optional hiding of the room. Works in Chrome / Edge on Android (and Quest browser); iOS Safari has no WebXR.
import * as THREE from 'three';

export function setupAR(stage, ui, getModule) {
  const {renderer, scene, key} = stage;
  const btnHost = document.querySelector('.bar');
  const wrap = document.createElement('div'); wrap.className = 'modes'; wrap.style.marginLeft = 'auto'; wrap.style.marginRight = '8px';
  const btn = document.createElement('button'); btn.textContent = 'AR'; btn.title = 'View in augmented reality'; wrap.append(btn);
  btnHost.insertBefore(wrap, btnHost.lastChild);

  const reticle = new THREE.Mesh(new THREE.RingGeometry(0.07, 0.09, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({color: 0x22d3ee, toneMapped: false, transparent: true, opacity: 0.9}));
  reticle.matrixAutoUpdate = false; reticle.visible = false; scene.add(reticle);
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(8, 8).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({opacity: 0.28})); catcher.position.y = 0.002; catcher.receiveShadow = true; catcher.visible = false;

  const A = {active: false, placed: false, scale: 0.12, session: null, hitSource: null, viewerSpace: null, saved: null, mod: null, hidden: []};
  const scales = [[0.06, '1:16'], [0.12, '1:8'], [0.25, '1:4'], [1, 'Life-size']];
  let bar;

  async function supported() { try { return !!(navigator.xr && (await navigator.xr.isSessionSupported('immersive-ar'))); } catch (e) { return false; } }
  btn.onclick = async () => {
    if (A.active) return end();
    if (!(await supported())) {
      ui.showCard({title: 'AR is not available on this browser', subtitle: 'WebXR needs Chrome or Edge on an ARCore-capable Android phone',
        html: 'This v2 viewer uses the open WebXR standard instead of 8th Wall (which has been discontinued).\n\n• <b>Android</b>: open this page in Chrome and tap AR.\n• <b>iPhone / iPad</b>: Safari has no WebXR, but Apple’s built-in AR viewer can place <b>life-size, static</b> models: <a href="./ar/" style="color:#4fc3d1">open the iPad AR page</a> (linac and CT, no install).\n• <b>Headsets</b>: the Quest browser supports immersive AR (passthrough).'});
      return;
    }
    start();
  };

  async function start() {
    const mod = getModule(); if (!mod) return; A.mod = mod;
    try {
      const session = await navigator.xr.requestSession('immersive-ar', {requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay', 'local-floor'], domOverlay: {root: document.getElementById('ui')}});
      A.session = session; renderer.xr.setReferenceSpaceType('local'); await renderer.xr.setSession(session);
      A.viewerSpace = await session.requestReferenceSpace('viewer'); A.hitSource = await session.requestHitTestSource({space: A.viewerSpace});
      session.addEventListener('end', cleanup); session.addEventListener('select', onSelect);
      A.active = true; A.placed = false; document.body.classList.add('in-ar');
      A.saved = {bg: scene.background, key: {pos: key.position.clone(), tgt: key.target.position.clone(), l: key.shadow.camera.left, r: key.shadow.camera.right, t: key.shadow.camera.top, b: key.shadow.camera.bottom, far: key.shadow.camera.far}, rootPos: mod.root.position.clone(), rootQ: mod.root.quaternion.clone(), rootS: mod.root.scale.clone()};
      if (mod.obj.S) mod.obj.S.ar = true;
      scene.background = null; mod.root.visible = false; mod.root.add(catcher); catcher.visible = true;
      A.hidden = (mod.arHide ? mod.arHide() : []).filter(Boolean); A.hidden.forEach((o) => { o._arVis = o.visible; o.visible = false; });
      buildBar(); ui.toast('Point at the floor or a table, then tap to place the scanner.', 'ok');
    } catch (e) { ui.toast('Could not start AR: ' + (e.message || e), 'bad'); }
  }
  function end() { if (A.session) A.session.end(); }
  function cleanup() {
    const mod = A.mod; if (!mod) return; if (mod.obj.S) mod.obj.S.ar = false; A.active = false; document.body.classList.remove('in-ar');
    scene.background = A.saved.bg; mod.root.position.copy(A.saved.rootPos); mod.root.quaternion.copy(A.saved.rootQ); mod.root.scale.copy(A.saved.rootS); mod.root.visible = true; mod.root.remove(catcher); catcher.visible = false;
    A.hidden.forEach((o) => { o.visible = o._arVis; }); A.hidden = []; reticle.visible = false;
    key.position.copy(A.saved.key.pos); key.target.position.copy(A.saved.key.tgt); const sc = key.shadow.camera; sc.left = A.saved.key.l; sc.right = A.saved.key.r; sc.top = A.saved.key.t; sc.bottom = A.saved.key.b; sc.far = A.saved.key.far; sc.updateProjectionMatrix();
    if (bar) bar.remove(); bar = null; A.hitSource = null; A.session = null; stage.resize && stage.resize();
  }
  function buildBar() {
    bar = document.createElement('div'); bar.className = 'arbar';
    const mk = (t, f, cls = '') => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = t; b.onclick = f; bar.append(b); return b; };
    mk('✕ Exit AR', end, 'warn'); mk('Re-place', () => { A.placed = false; A.mod.root.visible = false; ui.toast('Tap a surface to place again.'); }, 'ghost');
    const seg = document.createElement('div'); seg.className = 'seg'; seg.style.flex = '1';
    scales.forEach(([v, t]) => { const b = document.createElement('button'); b.textContent = t; if (v === A.scale) b.className = 'on'; b.onclick = () => { A.scale = v; [...seg.children].forEach((x) => x.classList.remove('on')); b.classList.add('on'); applyScale(); }; seg.append(b); }); bar.append(seg);
    document.getElementById('ui').append(bar);
  }
  const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s1 = new THREE.Vector3();
  function onSelect() {
    if (!reticle.visible || !A.mod) return;
    if (A.placed) return;
    reticle.matrix.decompose(p, q, s1); A.mod.root.position.copy(p);
    const cam = renderer.xr.getCamera(); const cp = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    A.mod.root.rotation.set(0, Math.atan2(cp.x - p.x, cp.z - p.z), 0);   // turn the model so its +z side faces the viewer
    A.placed = true; A.mod.root.visible = true; applyScale(); ui.toast('Placed. Use the panel to operate the equipment; pinch/move to look around.', 'ok');
  }
  function applyScale() {
    if (!A.mod) return; const s = A.scale; A.mod.root.scale.setScalar(s);
    const R = (A.mod.arRadius || 3) * s, c = A.mod.root.position.clone().add(new THREE.Vector3(0, 1.1 * s, 0));
    key.target.position.copy(c); key.position.copy(c).add(new THREE.Vector3(R * 0.8, R * 1.6, R * 0.7));
    const sc = key.shadow.camera; sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 0.01; sc.far = R * 6; sc.updateProjectionMatrix(); key.shadow.needsUpdate = true;
  }
  // hit-test each frame
  stage.onFrame((dt, frame) => {
    if (!A.active || !frame || !A.hitSource) return;
    if (A.placed) { reticle.visible = false; return; }
    const hits = frame.getHitTestResults(A.hitSource);
    if (hits.length) { const pose = hits[0].getPose(renderer.xr.getReferenceSpace()); reticle.visible = true; reticle.matrix.fromArray(pose.transform.matrix); } else reticle.visible = false;
  });
  // show/hide the AR button depending on support (keeps the button visible on unsupported devices so the explanation card can be shown)
  supported().then((ok) => { btn.title = ok ? 'View in augmented reality' : 'AR needs Chrome on Android (WebXR)'; if (!ok) btn.style.opacity = 0.6; });
  A._test = {reticle, catcher, onSelect, applyScale, scene};
  return A;
}
