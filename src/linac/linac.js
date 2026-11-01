// Linac assembly: GLB internals + procedural covers/couch/head, motorised axes with speeds, limits and collision interlocks.
import {createElectronBeam} from './ebeam.js';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {M, skin} from '../engine/materials.js';
import {Aperture} from './aperture.js';
import {Head} from './head.js';
import {createGantryDisplay} from './display.js';
import {f360} from './iec.js';
import {Couch, PH} from './couch.js';
import {DoseEngine, ENERGIES} from './dose.js';
import {buildRoom} from './room.js';

export const ISO = new THREE.Vector3(-0.075, 0.733, 0);
export const FLOOR_Y = ISO.y - 1.30;       // isocentre height above floor ~1.30 m (as on commercial machines)
export const CEIL_Y = FLOOR_Y + 3.35;

const A = (min, max, speed, unit = '°') => ({min, max, speed, unit, val: 0, tgt: 0, blocked: false});
const BASE = import.meta.env.BASE_URL + 'assets/linac/';
// [file, group, material factory, tap id (data.js Modelname)]
const PARTS = [
  ['01_Oil_Tank', 'stand', () => M.paintGrey(), '02_Klystron_Inside'],
  ['02_Klystron_Outside', 'stand', () => M.paintTeal(), '02_Klystron_Inside'],
  ['02_Klystron_Inside', 'stand', () => M.copper(), '02_Klystron_Inside'],
  ['03_Cooling_system', 'stand', () => M.steelBrushed(), '03_Cooling_system'],
  ['04_Circulator', 'stand', () => M.brass(), '04_Circulator'],
  ['05_Electro_Gun', 'gantry', () => M.steel(), '05_Electro_Gun_Split'],
  ['05_Electro_Gun_Split', 'gantry', () => M.steel(), '05_Electro_Gun_Split', true],
  ['06_Waveguide', 'gantry', () => M.brass(), '06_Waveguide_Split'],
  ['06_Waveguide_Split', 'gantry', () => M.brass(), '06_Waveguide_Split', true],
  ['07_Bending_Magnet', 'gantry', () => M.copper(), '07_Bending_Magnet'],
  ['08_Target', 'head', () => M.brass(), '08_Target'],
  ['09_Primary_Collimator', 'head', () => M.tungsten(), '09_Primary_Collimator'],
  ['10_Secondary_Collimator', 'head', () => M.lead(), '10_Secondary_Collimator'],
  ['11_Flatening_Filter', 'head', () => M.steelBrushed(), '11_Flatening_Filter'],
  ['15_KV_Imagine_System', 'kv', () => M.paintWhite(), '15_KV_Imagine_System'],
];

export async function createLinac(stage) {
  const T = THREE;
  const world = new T.Group(); world.position.y = -FLOOR_Y; world.name = 'linacWorld';
  const ap = new Aperture(), dose = new DoseEngine();
  const registry = new Map();           // tap id -> [meshes]
  const register = (id, obj) => { obj.traverse((o) => { if (o.isMesh) { o.userData.part = id; if (!registry.has(id)) registry.set(id, []); registry.get(id).push(o); } }); };

  const room = buildRoom({iso: ISO, floorY: FLOOR_Y, ceilY: CEIL_Y});
  world.add(room.group);

  const stand = new T.Group(), gantryPivot = new T.Group(), gantryInner = new T.Group(), collPivot = new T.Group(), collInner = new T.Group();
  gantryPivot.position.set(0, ISO.y, 0); gantryInner.position.set(0, -ISO.y, 0);
  collPivot.position.set(ISO.x, 0, 0); collInner.position.set(-ISO.x, 0, 0);
  world.add(stand, gantryPivot); gantryPivot.add(gantryInner); gantryInner.add(collPivot); collPivot.add(collInner);
  const headStatic = new T.Group(); gantryInner.add(headStatic);

  // ---------- GLB internals ----------
  const groups = {stand, gantry: gantryInner, head: headStatic, kv: gantryInner};
  const dropStand = new T.Vector3(0, FLOOR_Y - 0.1, 0);       // model floor was at y=0.1; lower stand internals onto the real floor
  const cutaway = [];                                           // *_Split meshes
  await Promise.all(PARTS.map(async ([file, grp, mat, id, hidden]) => {
    const o = await stage.loadGLB(BASE + file + '.glb');
    skin(o, mat()); register(id, o); o.name = file;
    if (grp === 'stand' && file !== '04_Circulator') o.position.add(dropStand);
    if (hidden) { o.visible = false; cutaway.push(o); }
    if (file === '15_KV_Imagine_System') { o.userData.kv = true; }
    groups[grp].add(o);
  }));
  const gunSolid = gantryInner.getObjectByName('05_Electro_Gun'), wgSolid = gantryInner.getObjectByName('06_Waveguide');
  const kv = gantryInner.getObjectByName('15_KV_Imagine_System');
  // flattening-filter slot assembly (4 positions: 6 MV, 10 MV, 15 MV filters and the thin FFF plate); the slot assembly slides so the filter for the selected beam sits in the beam line
  const ffOrig = world.getObjectByName('11_Flatening_Filter'); if (ffOrig) ffOrig.visible = false;
  const ffCar = new T.Group(); ffCar.position.set(ISO.x, 1.650, 0); gantryInner.add(ffCar);
  const FF_PITCH = 0.10, ffSlotZ = (k) => (k - 1.5) * FF_PITCH;
  { const sh = new T.Shape(); sh.moveTo(-0.045, -0.2); sh.lineTo(0.045, -0.2); sh.lineTo(0.045, 0.2); sh.lineTo(-0.045, 0.2); sh.closePath();
    for (let k = 0; k < 4; k++) { const h = new T.Path(); h.absarc(0, ffSlotZ(k), 0.026, 0, Math.PI * 2, true); sh.holes.push(h); }
    const bar = new T.Mesh(new T.ExtrudeGeometry(sh, {depth: 0.004, bevelEnabled: false}).rotateX(Math.PI / 2), M.steelBrushed()); bar.position.set(0, 0.004, 0); bar.castShadow = true; ffCar.add(bar);
    const mats = [M.brass(), M.copper(), M.steelBrushed(), M.steelDark()], hs = [0.011, 0.016, 0.021, 0];
    for (let k = 0; k < 4; k++) {
      const pts = hs[k] ? [new T.Vector2(0, hs[k]), new T.Vector2(0.006, hs[k] * 0.8), new T.Vector2(0.015, hs[k] * 0.35), new T.Vector2(0.024, 0.002), new T.Vector2(0.024, 0), new T.Vector2(0, 0)]
        : [new T.Vector2(0, 0.0025), new T.Vector2(0.024, 0.0025), new T.Vector2(0.024, 0), new T.Vector2(0, 0)];            // FFF: thin flat plate, no flattening cone
      const cone = new T.Mesh(new T.LatheGeometry(pts, 40), mats[k]); cone.position.set(0, 0.0035, ffSlotZ(k)); cone.castShadow = true; ffCar.add(cone);
    }
    register('11_Flatening_Filter', ffCar); }
  // hidden: with the beam on, the gantry straight overhead and the covers see-through, a blue Cherenkov-style glow spells out the lab name on the floor
  const eggCv = document.createElement('canvas'); eggCv.width = 1024; eggCv.height = 256;
  { const g = eggCv.getContext('2d'); g.clearRect(0, 0, 1024, 256); g.font = 'bold 150px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = '#3ad0ff'; g.shadowBlur = 36; g.fillStyle = '#bff0ff'; g.fillText('VAIDER LAB', 512, 134); g.shadowBlur = 0; g.fillText('VAIDER LAB', 512, 134); }
  const eggTx = new T.CanvasTexture(eggCv); eggTx.colorSpace = T.SRGBColorSpace;
  const eggMesh = new T.Mesh(new T.PlaneGeometry(1.1, 0.275).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({map: eggTx, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false}));
  eggMesh.rotation.y = Math.PI / 2; eggMesh.scale.setScalar(2.1); eggMesh.position.set(ISO.x, FLOOR_Y + 0.004, 0); eggMesh.renderOrder = 5; eggMesh.visible = false; world.add(eggMesh);
  const ffIndex = () => (S.fff ? 3 : ({6: 0, 10: 1, 15: 2}[S.energy] ?? 0));
  let ffPos = null;
  // the original kV model also carries a third (bottom) panel; the bottom imager in v2 is the MV portal imager only, so drop that component
  { let km; kv.traverse((o) => { if (o.isMesh) km = o; });
    if (km) {
      const g = km.geometry, pos = g.attributes.position, idx = g.index ? g.index.array : null, nT = (idx ? idx.length : pos.count) / 3, tri = (t, k) => (idx ? idx[t * 3 + k] : t * 3 + k);
      const key = (i) => pos.getX(i).toFixed(4) + ',' + pos.getY(i).toFixed(4) + ',' + pos.getZ(i).toFixed(4), par = new Map();
      const find = (a) => { while (par.get(a) !== a) { par.set(a, par.get(par.get(a))); a = par.get(a); } return a; };
      for (let t = 0; t < nT; t++) for (let k = 0; k < 3; k++) { const kk = key(tri(t, k)); if (!par.has(kk)) par.set(kk, kk); }
      for (let t = 0; t < nT; t++) { const a = find(key(tri(t, 0))); for (let k = 1; k < 3; k++) { const b = find(key(tri(t, k))); if (a !== b) par.set(b, a); } }
      const bb = new Map();
      for (let t = 0; t < nT; t++) { const r = find(key(tri(t, 0))); let c = bb.get(r); if (!c) bb.set(r, (c = {zmin: 1e9, zmax: -1e9, ymax: 0})); for (let k = 0; k < 3; k++) { const i = tri(t, k); c.zmin = Math.min(c.zmin, pos.getZ(i)); c.zmax = Math.max(c.zmax, pos.getZ(i)); c.ymax = Math.max(c.ymax, Math.abs(pos.getY(i))); } }
      const drop = new Set([...bb].filter(([, c]) => c.zmin > 0.24 && c.zmax > 0.45 && c.ymax < 0.1).map(([r]) => r));
      if (drop.size) { const keep = []; for (let t = 0; t < nT; t++) if (!drop.has(find(key(tri(t, 0))))) keep.push(tri(t, 0), tri(t, 1), tri(t, 2)); g.setIndex(keep); g.computeBoundingSphere(); }
    } }
  const eBeam = createElectronBeam(gantryInner, {targetX: ISO.x, targetY: ISO.y + 1.0});   // electron/photon teaching animation (shown when gun, waveguide, magnet or target is selected)
  const E_PARTS = ['05_Electro_Gun_Split', '06_Waveguide_Split', '07_Bending_Magnet', '08_Target'];

  // ---------- MV portal imager (EPID): retractable arm from the gantry drum, 43 x 43 cm panel 50 cm below the isocentre (SID 150 cm) ----------
  const mv = new T.Group(); mv.name = 'MV_Portal_Imager'; gantryInner.add(mv);
  const MV_DROP = 0.50, MV_LEN = 1.10;
  const mvWhite = M.paintWhite(), mvTeal = M.paintTeal();
  { const body = new T.Group(); mv.add(body);
    const arm = new T.Mesh(new RoundedBoxGeometry(MV_LEN, 0.07, 0.16, 3, 0.02), mvWhite); arm.position.set(ISO.x + MV_LEN / 2 - 0.15, ISO.y - MV_DROP - 0.075, 0); arm.castShadow = true; body.add(arm);
    const housing = new T.Mesh(new RoundedBoxGeometry(0.52, 0.045, 0.52, 3, 0.015), mvWhite); housing.position.set(ISO.x, ISO.y - MV_DROP - 0.035, 0); housing.castShadow = true; body.add(housing);
    const face = new T.Mesh(new T.PlaneGeometry(0.43, 0.43).rotateX(-Math.PI / 2), M.plasticDark()); face.position.set(ISO.x, ISO.y - MV_DROP - 0.011, 0); body.add(face);
    const strip = new T.Mesh(new RoundedBoxGeometry(0.30, 0.004, 0.012, 1, 0.002), mvTeal); strip.position.set(ISO.x, ISO.y - MV_DROP - 0.0115, 0.235); body.add(strip);
    mv.userData.body = body; register('MV_Portal_Imager', mv); }
  mv.position.x = MV_LEN + 0.1; mv.visible = false;

  // ---------- procedural covers ----------
  const coverMat = M.paintWhite(); coverMat.side = T.FrontSide;
  const accent = M.paintTeal();
  const covers = [];
  const cov = (geo, x, y, z, parent, mat = coverMat) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); covers.push(m); m.userData.part = '02_Klystron_Inside'; return m; };
  const standTop = 2.02;
  cov(new RoundedBoxGeometry(0.55, standTop - FLOOR_Y, 0.86, 6, 0.09), 1.525, (FLOOR_Y + standTop) / 2, 0, stand);
  cov(new RoundedBoxGeometry(0.57, 0.12, 0.9, 4, 0.03), 1.525, FLOOR_Y + 0.06, 0, stand, M.plasticDark());
  // rotating gantry body: smooth lathe-profile drum (rounded shoulders), flush teal ring - no dial, bolts or badge
  const drumProf = []; { const R = 0.86, hw = 0.13, f = 0.07; drumProf.push(new T.Vector2(0, -hw)); drumProf.push(new T.Vector2(R - f, -hw)); for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI / 2; drumProf.push(new T.Vector2(R - f + Math.cos(a) * f, -hw + f + Math.sin(a) * f)); } for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI / 2; drumProf.push(new T.Vector2(R - f + Math.cos(a) * f, hw - f + Math.sin(a) * f)); } drumProf.push(new T.Vector2(0.58, hw)); for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI / 2; drumProf.push(new T.Vector2(0.58 - Math.sin(a) * 0.05, hw - (1 - Math.cos(a)) * 0.05)); } drumProf.push(new T.Vector2(0.53, hw - 0.06)); drumProf.push(new T.Vector2(0, hw - 0.06)); }
  const drum = new T.Mesh(new T.LatheGeometry(drumProf, 128), coverMat); drum.rotation.z = Math.PI / 2; drum.position.set(1.12, ISO.y, 0); drum.castShadow = drum.receiveShadow = true; gantryInner.add(drum); covers.push(drum); drum.userData.part = '02_Klystron_Inside';
  const ring = new T.Mesh(new T.TorusGeometry(0.585, 0.007, 10, 160), accent); ring.rotation.y = Math.PI / 2; ring.position.set(0.992, ISO.y, 0); gantryInner.add(ring); covers.push(ring);
  // arm + head housing
  cov(new RoundedBoxGeometry(1.0, 0.56, 0.62, 8, 0.22), 0.76, 1.71, 0, gantryInner);
  cov(new RoundedBoxGeometry(0.74, 0.50, 0.74, 8, 0.21), -0.065, 1.75, 0, gantryInner);
  // no snout / box around the collimator: the jaws and MLC leaves are left visible under the head
  const stripe = new T.Mesh(new RoundedBoxGeometry(0.52, 0.022, 0.012, 2, 0.005), accent); stripe.position.set(-0.065, 1.74, 0.368); gantryInner.add(stripe); const stripe2 = stripe.clone(); stripe2.position.z = -0.368; gantryInner.add(stripe2);
  // static rf plumbing: circulator -> klystron, rotary joint, rotating feed to gun
  const pipeMat = M.brass();
  const pipe = (len, r, x, y, z, axis = 'y', parent = world) => { const m = new T.Mesh(new T.CylinderGeometry(r, r, len, 20), pipeMat); m.position.set(x, y, z); if (axis === 'x') m.rotation.z = Math.PI / 2; if (axis === 'z') m.rotation.x = Math.PI / 2; m.castShadow = true; parent.add(m); return m; };
  const kTop = 1.0145 + dropStand.y;
  pipe(1.62 - kTop, 0.03, 1.40, (1.62 + kTop) / 2, -0.0, 'y', stand);
  pipe(0.12, 0.05, 1.17, ISO.y, 0, 'x', gantryInner);
  const feedH = 1.77 - ISO.y; pipe(feedH, 0.028, 1.12, ISO.y + feedH / 2, 0, 'y', gantryInner);
  pipe(1.12 - 1.076, 0.028, 1.098, 1.77, 0, 'x', gantryInner);
  pipe(1.62 - ISO.y, 0.03, 1.40, ISO.y + (1.62 - ISO.y) / 2, -0.0, 'y', stand).visible = false;
  for (const m of [...stand.children]) if (m.geometry && m.geometry.type === 'CylinderGeometry') register('04_Circulator', m);
  gantryInner.traverse((m) => { if (m.isMesh && m.geometry.type === 'CylinderGeometry' && m.material === pipeMat) register('06_Waveguide_Split', m); });

  const gdisp = createGantryDisplay({x: 0.975, y: ISO.y}); world.add(gdisp.mesh);
  // ---------- collimation head (jaws + MLC + light field + beam) ----------
  const head = new Head(ap, {isoX: ISO.x, isoY: ISO.y});
  collInner.add(head.group);
  register('14_MLC', head.leaves); register('12_X_Jaws', head.jawX1.mesh); register('12_X_Jaws', head.jawX2.mesh); register('13_Y_Jaws', head.jawY1.mesh); register('13_Y_Jaws', head.jawY2.mesh);

  // ---------- couch ----------
  const couch = new Couch({isoX: ISO.x, isoY: ISO.y, floorY: FLOOR_Y}); couch.frame = world;
  world.add(couch.root, couch.lasers);
  register('01_Bed', couch.root);
  const phCenter = new T.Object3D(); phCenter.position.y = PH.size / 2; couch.phantom.add(phCenter);

  // ---------- dose slice plane ----------
  const SL = 160, doseCanvas = document.createElement('canvas'); doseCanvas.width = doseCanvas.height = SL;
  const doseTex = new T.CanvasTexture(doseCanvas); doseTex.colorSpace = T.SRGBColorSpace;
  const slice = new T.Mesh(new T.PlaneGeometry(0.62, 0.62), new T.MeshBasicMaterial({map: doseTex, transparent: true, side: T.DoubleSide, depthWrite: false, toneMapped: false}));
  slice.rotation.y = Math.PI / 2; slice.position.set(ISO.x, ISO.y - 0.05, 0); slice.renderOrder = 4; slice.visible = false; world.add(slice);

  // ---------- state ----------
  const axes = {
    gantry: A(-180, 180, 6), coll: A(-175, 175, 6), couchRot: A(-95, 95, 3),
    couchLat: A(-0.25, 0.25, 0.03, ' m'), couchLng: A(-0.95, 0.8, 0.04, ' m'), couchVrt: A(FLOOR_Y + 0.35, ISO.y + 0.12, 0.02, ' m'),
  };
  axes.couchVrt.val = axes.couchVrt.tgt = ISO.y - 0.20;
  const S = {
    timeScale: 4, energy: 6, fff: false, mu: 100, delivered: 0, beamOn: false, doorOpen: true, fieldLight: true, lasers: true,
    beamVis: true, doseView: false, slicePlane: 'axial', coverOpacity: 1, kvOut: 0, kvTarget: 0, mvOut: 0, mvTarget: 0, status: 'READY', alerts: [], dirty: true,
    interlock: true, envelope: true, gantryDisplay: true, hotUntil: 0, clearance: 0.04, selected: null, eAnim: true, cmdLog: [],
  };

  // --- collision geometry ---
  const headBox = new T.Box3(new T.Vector3(-0.44, 1.285, -0.40), new T.Vector3(0.31, 2.03, 0.40));
  const armBox = new T.Box3(new T.Vector3(0.25, 1.43, -0.31), new T.Vector3(1.25, 1.99, 0.31));
  const kvVerts = []; kv.updateMatrixWorld(true);
  { const inv = gantryInner.matrixWorld.clone().invert(); const v = new T.Vector3();
    kv.traverse((m) => { if (m.isMesh) { const p = m.geometry.attributes.position; for (let i = 0; i < p.count; i += 2) { v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).applyMatrix4(inv); kvVerts.push(v.clone()); } } }); }
  const mvPts = []; { const y0 = ISO.y - MV_DROP - 0.06, y1 = ISO.y - MV_DROP;
    for (let ix = -1; ix <= 1; ix += 0.5) for (let iz = -1; iz <= 1; iz += 0.5) for (const y of [y0, y1]) mvPts.push(new T.Vector3(ISO.x + ix * 0.26, y, iz * 0.26));
    for (let x = ISO.x; x <= ISO.x + MV_LEN - 0.15; x += 0.1) for (const z of [-0.08, 0.08]) mvPts.push(new T.Vector3(x, y0 - 0.03, z)); }
  const samplePts = (() => { // points on the rounded-box hulls of the head and arm covers (corner radius 0.1 m, as modelled)
    const pts = [], R = 0.1;
    const addRounded = (x0, x1, zh, y0, y1, nx = 7) => {
      const prof = [], cz = zh - R, cy0 = y0 + R, cy1 = y1 - R;
      const arc = (cz_, cy_, a0) => { for (let k = 0; k <= 4; k++) { const a = a0 + (k / 4) * (Math.PI / 2); prof.push([cz_ + R * Math.cos(a), cy_ + R * Math.sin(a)]); } };
      arc(cz, cy1, 0); arc(-cz, cy1, Math.PI / 2); arc(-cz, cy0, Math.PI); arc(cz, cy0, 1.5 * Math.PI);
      for (let i = 0; i <= nx; i++) { const x = x0 + ((x1 - x0) * i) / nx; for (const [z, y] of prof) pts.push(new T.Vector3(x, y, z)); }
      for (const x of [x0, x1]) for (let a = -zh; a <= zh; a += zh / 3) for (let b = y0; b <= y1; b += (y1 - y0) / 4) pts.push(new T.Vector3(x, b, a));   // end faces (inner points)
    };
    addRounded(headBox.min.x, headBox.max.x, 0.37, headBox.min.y, 2.0); addRounded(armBox.min.x, armBox.max.x, armBox.max.z, armBox.min.y, armBox.max.y, 5);
    return pts; })();
  const tmpM = new T.Matrix4(), tmpV = new T.Vector3();
  function collision() {
    world.updateMatrixWorld(true);
    tmpM.copy(couch.root.matrixWorld).invert().multiply(gantryInner.matrixWorld);   // gantryInner-local -> couch-root-local
    const b = couch.boxes(), c = S.clearance; const tb = b.top.clone().expandByScalar(c), pb = b.phantom.clone().expandByScalar(c);
    const worldMat = new T.Matrix4().multiplyMatrices(world.matrixWorld.clone().invert(), gantryInner.matrixWorld); // gantryInner-local -> world(model) coordinates
    for (const p of samplePts) {
      tmpV.copy(p).applyMatrix4(worldMat); if (tmpV.y < FLOOR_Y + 0.0) return 'floor';
      tmpV.copy(p).applyMatrix4(tmpM); if (tb.containsPoint(tmpV) || pb.containsPoint(tmpV)) return 'couch / phantom';
    }
    if (S.kvOut > 0.5) for (const p of kvVerts) {
      tmpV.copy(p); tmpV.z *= S.kvOut; tmpV.applyMatrix4(worldMat); if (tmpV.y < FLOOR_Y + 0.0) return 'floor (kV arm)';
      tmpV.copy(p); tmpV.z *= S.kvOut; tmpV.applyMatrix4(tmpM); if (tb.containsPoint(tmpV) || pb.containsPoint(tmpV)) return 'couch / phantom (kV arm)';
    }
    if (S.mvOut > 0.5) for (const p of mvPts) {
      tmpV.copy(p); tmpV.x += mv.position.x; tmpV.applyMatrix4(worldMat); if (tmpV.y < FLOOR_Y + 0.0) return 'floor (MV imager)';
      tmpV.copy(p); tmpV.x += mv.position.x; tmpV.applyMatrix4(tmpM); if (tb.containsPoint(tmpV) || pb.containsPoint(tmpV)) return 'couch / phantom (MV imager)';
    }
    return null;
  }

  function applyAxes() {
    gantryPivot.rotation.x = T.MathUtils.degToRad(axes.gantry.val);
    collPivot.rotation.y = T.MathUtils.degToRad(axes.coll.val);
    couch.state.rot = axes.couchRot.val; couch.state.lat = axes.couchLat.val; couch.state.lng = -axes.couchLng.val;   // IEC: +couchLng = toward the gantry (+Y); the model's couch-top x runs the other way couch.state.H = axes.couchVrt.val;
    couch.apply();
  }
  applyAxes();

  const cbs = {change: [], collision: []};
  let lastDoseUpdate = 0, lastSig = '';
  /* ---------- console command log: every instruction given to the machine (from the panel, workflow or Skip) is echoed on the treatment console ---------- */
  const cmdWatch = {t: 0, axes: {}, pend: {}, last: {}};
  const hhmmss = () => new Date().toTimeString().slice(0, 8);
  function logCmd(text, hot) { S.cmdLog.push({t: hhmmss(), text, hot: !!hot}); if (S.cmdLog.length > 60) S.cmdLog.shift(); }
  const AX_LABEL = {gantry: ['GANTRY', 1, ' deg', 1], coll: ['COLLIMATOR', 1, ' deg', 1], couchRot: ['COUCH ROT', 1, ' deg', 1], couchLat: ['COUCH LAT', 100, ' cm', 1], couchLng: ['COUCH LNG (IEC +Y = in)', 100, ' cm', 1], couchVrt: ['COUCH VRT', 100, ' cm', 1]};
  function watchCmds(dt) {
    cmdWatch.t += dt;
    const debounce = (key, val, fmt) => { const w = cmdWatch.pend[key]; if (cmdWatch.last[key] === undefined) { cmdWatch.last[key] = val; return; }
      if (val === cmdWatch.last[key]) { delete cmdWatch.pend[key]; return; }
      if (!w || w.val !== val) { cmdWatch.pend[key] = {val, t: cmdWatch.t}; return; }
      if (cmdWatch.t - w.t > 0.45) { cmdWatch.last[key] = val; delete cmdWatch.pend[key]; logCmd(fmt(val)); } };
    for (const [k, a] of Object.entries(axes)) { const [lab, sc, unit, dp] = AX_LABEL[k] || [k, 1, '', 2]; const v = k === 'couchVrt' ? (a.tgt - ISO.y) * 100 : a.tgt * sc; debounce(k, +v.toFixed(dp), (x) => `${lab} -> ${unit === ' deg' ? f360(x, dp) : x.toFixed(dp)}${unit}`); }
    debounce('energy', S.energy, (x) => `ENERGY ${x} MV`); debounce('fff', S.fff, (x) => (x ? 'FFF ON (filter out of beam)' : 'FFF OFF (flattening filter in)'));
    debounce('mu', S.mu, (x) => `PLAN ${x} MU`); debounce('door', S.doorOpen, (x) => (x ? 'DOOR OPEN' : 'DOOR CLOSED'));
    debounce('kv', S.kvTarget, (x) => (x > 0.5 ? 'kV ARMS EXTEND' : 'kV ARMS RETRACT')); debounce('mv', S.mvTarget, (x) => (x > 0.5 ? 'MV PANEL EXTEND' : 'MV PANEL RETRACT'));
    debounce('fl', S.fieldLight, (x) => (x ? 'FIELD LIGHT ON' : 'FIELD LIGHT OFF')); debounce('las', S.lasers, (x) => (x ? 'ROOM LASERS ON' : 'ROOM LASERS OFF'));
    { const st = ap.stats(), txt = `FIELD ${st.fx.toFixed(1)} x ${st.fy.toFixed(1)} cm`; debounce('apv', txt, (x) => x); }
    if (cmdWatch.last.beam === undefined) cmdWatch.last.beam = S.beamOn;
    if (S.beamOn !== cmdWatch.last.beam) { cmdWatch.last.beam = S.beamOn; logCmd(S.beamOn ? `BEAM ON  ${S.energy} MV${S.fff ? ' FFF' : ''}  ${S.mu} MU` : `BEAM OFF  delivered ${S.delivered.toFixed(0)} MU`, true); }
  }
  function update(dt) {
    watchCmds(dt);
    const ts = S.timeScale; let moving = false; let hit = null;
    for (const [name, a] of Object.entries(axes)) {
      const d = a.tgt - a.val; if (Math.abs(d) < 1e-6) { a.blocked = false; continue; }
      const wasHit = S.interlock ? collision() : null;
      const prev = a.val; a.val += Math.sign(d) * Math.min(Math.abs(d), a.speed * ts * dt); applyAxes();
      if (S.interlock) { const c = collision(); if (c && !wasHit) { a.val = prev; applyAxes(); a.blocked = true; hit = {axis: name, what: c}; logCmd(`INTERLOCK: ${name} stopped - ${c}`, true); a.tgt = prev; } else a.blocked = false; }
      moving = true;
    }
    if (hit) { S.status = 'INTERLOCK'; cbs.collision.forEach((f) => f(hit)); }
    // kV arm motion
    const dk = S.kvTarget - S.kvOut; if (Math.abs(dk) > 1e-3) { S.kvOut += Math.sign(dk) * Math.min(Math.abs(dk), 0.5 * ts * dt); moving = true; } else S.kvOut = S.kvTarget;
    kv.scale.z = Math.max(0.06, S.kvOut); kv.visible = S.kvOut > 0.07;
    const dm = S.mvTarget - S.mvOut; if (Math.abs(dm) > 1e-3) { S.mvOut += Math.sign(dm) * Math.min(Math.abs(dm), 0.5 * ts * dt); moving = true; } else S.mvOut = S.mvTarget;
    mv.position.x = (1 - S.mvOut) * (MV_LEN + 0.1); mv.visible = S.mvOut > 0.07;
    // beam on: deliver MU
    if (S.beamOn) {
      const e = ENERGIES[S.energy], rate = (S.fff ? e.fffRate : e.rate) / 60;  // MU/s
      S.delivered = Math.min(S.mu, S.delivered + rate * dt * Math.max(1, ts / 2));
      if (S.delivered >= S.mu) { S.beamOn = false; S.status = 'BEAM OFF'; room.setBeamOn(false); }
    }
    // visuals tied to state
    const tr = S.coverOpacity < 0.999;
    if (coverMat.transparent !== tr) { coverMat.transparent = accent.transparent = tr; coverMat.needsUpdate = accent.needsUpdate = true; }
    coverMat.opacity = accent.opacity = S.coverOpacity; coverMat.depthWrite = S.coverOpacity > 0.6;
    for (const m of covers) m.visible = S.coverOpacity > 0.01 || m.userData.keep;
    for (const c of covers) c.castShadow = S.coverOpacity > 0.5;
    world.updateMatrixWorld(true);
    const yAxis = new T.Vector3(1, 0, 0).transformDirection(collInner.matrixWorld); // IEC-Y (world +x at coll 0)
    if (hit) S.hotUntil = performance.now() + 1500;
    gdisp.setVisible(S.gantryDisplay && !stage.renderer.xr.isPresenting); gdisp.update(S, axes, ap, (S.fff ? ENERGIES[S.energy].label + ' FFF' : ENERGIES[S.energy].label));
    head.update(yAxis); head.setEnvelope(S.envelope && !stage.renderer.xr.isPresenting, performance.now() < S.hotUntil);
    head.setBeam({visible: S.beamVis && (S.beamOn || S.beamPreview), intensity: S.beamOn ? 1 : 0.55});
    head.setFieldLight(S.fieldLight && !S.beamOn);
    couch.updateLasers(S.lasers);
    { const goal = -ffSlotZ(ffIndex()); if (ffPos === null) ffPos = goal; ffPos += (goal - ffPos) * Math.min(1, dt * 4 * Math.max(1, S.timeScale / 4)); if (Math.abs(goal - ffPos) < 0.0005) ffPos = goal; ffCar.position.z = ffPos; }
    room.flashSign(S.beamOn, performance.now());
    { const on = S.beamOn && Math.abs(axes.gantry.val) < 1.5 && S.coverOpacity < 0.3; eggMesh.visible = on; if (on) eggMesh.material.opacity = 0.55 + 0.25 * Math.sin(performance.now() / 260); }
    eBeam.update(dt, S.eAnim && (E_PARTS.includes(S.selected) || (S.beamOn && S.coverOpacity < 0.3))); room.wallLasers.visible = S.lasers; room.console.update(S, axes, S.energy);
    // dose slice refresh (throttled)
    slice.visible = S.doseView;
    const sig = [axes.gantry.val.toFixed(1), axes.coll.val.toFixed(1), axes.couchRot.val.toFixed(1), axes.couchLat.val.toFixed(3), axes.couchLng.val.toFixed(3), axes.couchVrt.val.toFixed(3), ap.version, S.energy, S.fff, S.slicePlane, S.doseView].join('|');
    const now = performance.now();
    if (S.doseView && sig !== lastSig && now - lastDoseUpdate > (stage.mobile ? 260 : 120)) { renderDose(); lastSig = sig; lastDoseUpdate = now; }
    cbs.change.forEach((f) => f(moving));
  }

  const ctx = {headInv: new T.Matrix4(), phInv: new T.Matrix4(), half: new T.Vector3(PH.size / 2, PH.size / 2, PH.size / 2), srcHead: head.src.clone(), srcPh: new T.Vector3()};
  function prepareCtx() {
    world.updateMatrixWorld(true);
    ctx.headInv.copy(head.group.matrixWorld).invert(); ctx.phInv.copy(phCenter.matrixWorld).invert();
    ctx.srcPh.copy(head.src).applyMatrix4(head.group.matrixWorld).applyMatrix4(ctx.phInv);
    dose.update(ap); dose.E = S.energy; dose.fff = S.fff;
    return ctx;
  }
  function renderDose() {
    prepareCtx();
    if (S.slicePlane === 'sagittal') slice.rotation.set(0, 0, 0); else slice.rotation.set(0, Math.PI / 2, 0);
    slice.position.set(ISO.x, ISO.y - 0.05, 0); slice.updateMatrixWorld(true);
    const g = doseCanvas.getContext('2d'), img = g.createImageData(SL, SL), P = new T.Vector3(), out = {}, band = new Int16Array(SL * SL).fill(-1);
    for (let j = 0; j < SL; j++) for (let i = 0; i < SL; i++) {
      P.set((i / (SL - 1) - 0.5) * 0.62, (0.5 - j / (SL - 1)) * 0.62, 0).applyMatrix4(slice.matrixWorld);
      const v = dose.point(ctx, P, out), o = (j * SL + i) * 4;
      if (v < 0) continue;
      const [r, gg, b] = doseColorFast(v); img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = v < 0.02 ? 40 : 175;
      band[j * SL + i] = Math.floor(v * 10);
    }
    for (let j = 0; j < SL - 1; j++) for (let i = 0; i < SL - 1; i++) {   // 10 % isodose lines
      const b0 = band[j * SL + i]; if (b0 < 0) continue; const br = band[j * SL + i + 1], bd = band[(j + 1) * SL + i];
      if ((br >= 0 && br !== b0) || (bd >= 0 && bd !== b0)) { const o = (j * SL + i) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = 255; img.data[o + 3] = 235; }
    }
    g.putImageData(img, 0, 0); doseTex.needsUpdate = true;
  }
  const doseColorFast = (v) => { const t = Math.max(0, Math.min(1.1, v)); const stops = [[0, [20, 20, 90]], [0.1, [30, 60, 200]], [0.3, [20, 170, 210]], [0.5, [40, 190, 90]], [0.7, [190, 220, 40]], [0.9, [250, 160, 30]], [1.0, [235, 60, 40]], [1.1, [150, 20, 90]]]; for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) { const [a, ca] = stops[i - 1], [b, cb] = stops[i], u = (t - a) / (b - a); return ca.map((c, k) => c + (cb[k] - c) * u); } return stops[7][1]; };
  /** Central-axis geometry for the current set-up: SSD, depth of isocentre, entry point. */
  function caxInfo() {
    prepareCtx();
    const iso = new T.Vector3(ISO.x, ISO.y, 0).applyMatrix4(world.matrixWorld);
    const isoPh = iso.clone().applyMatrix4(ctx.phInv), S0 = ctx.srcPh, d = isoPh.clone().sub(S0), h = ctx.half;
    let t0 = 0, t1 = 1e9;
    for (const ax of ['x', 'y', 'z']) { const dv = d[ax]; if (Math.abs(dv) < 1e-9) { if (Math.abs(S0[ax]) > h[ax]) return {hit: false}; continue; } const a = (-h[ax] - S0[ax]) / dv, b = (h[ax] - S0[ax]) / dv; t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b)); }
    if (t0 > t1 || t1 < 0) return {hit: false};
    const len = d.length(); return {hit: true, ssd: t0 * len * 100, isoDepth: (1 - t0) * len * 100, exitDepth: (t1 - t0) * len * 100, tIso: 1 - t0};
  }

  function selectPart(id) {
    S.selected = id;
    const isCover = (m) => covers.includes(m);
    for (const [pid, meshes] of registry) for (const m of meshes) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mt of mats) {
        if (!mt || !('emissive' in mt)) continue;
        if (!mt.userData._orig) mt.userData._orig = {t: mt.transparent, o: mt.opacity, e: mt.emissive.clone(), ei: mt.emissiveIntensity, dw: mt.depthWrite};
        const o = mt.userData._orig, on = id && pid === id;
        mt.emissive.copy(on ? new T.Color(0x1a8f9c) : o.e); mt.emissiveIntensity = on ? 0.55 : o.ei;
        const tr = id ? (!on || o.t) : o.t; if (mt.transparent !== tr) { mt.transparent = tr; mt.needsUpdate = true; } mt.opacity = id && !on ? 0.22 : o.o; mt.depthWrite = id && !on ? false : o.dw;
      }
    }
    if (id) { S.coverOpacity = Math.min(S.coverOpacity, 0.0); cbs.change.forEach((f) => f(false)); }
  }
  function setCutaway(on) { cutaway.forEach((o) => (o.visible = on)); gunSolid.visible = !on; wgSolid.visible = !on; }

  return {
    world, axes, S, ap, dose, head, couch, room, registry, covers, ctx, phCenter, slice, kv, mv, stand, gantryInner, collInner,
    update, collision, caxInfo, prepareCtx, selectPart, setCutaway, renderDose,
    on: (ev, f) => cbs[ev].push(f),
    marks: () => couch.marks(),
    isoWorldModel: () => new T.Vector3(ISO.x, ISO.y, 0),
    recenter: () => ({target: new T.Vector3(ISO.x + 0.35, 0.8, 0), cam: new T.Vector3(-3.5, 2.1, 4.1)}),
  };
}
