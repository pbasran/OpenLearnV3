// CT scanner assembly: GLB gantry/rotor/table + procedural room, phantom, lasers, fan beam, motorised axes with limits & interlocks,
// scan sequencing (scout / helical / axial) and tube-heat model. Image physics lives in recon.js.
import {createTubeAnim} from './tubeanim.js';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {M, skin, tex} from '../engine/materials.js';
import {SECTIONS, PHANTOM_LEN, sectionAt, reconstruct, scout, doseInfo, KVP} from './recon.js';

export const AX_Y = 1.22;            // gantry axis / isocentre height (m)
export const XS = -0.14;             // scan plane x (m)
export const XL = 0.67;              // external axial-laser plane x (m)
export const TOP_Y0 = 1.10;          // couch-top surface at default height
export const HEAD_X0 = 0.85;         // x of the phantom's head end when the table is at home
export const BORE_R = 0.45;          // clear aperture radius (m)
const BASE = import.meta.env.BASE_URL + 'assets/ct/';
const A = (min, max, speed, unit) => ({min, max, speed, unit, val: 0, tgt: 0, blocked: false});

const PARTS = [
  ['gantry_housing', 'tilt', () => M.paintWhite(), 'gantry_housing'],
  ['gantry_ring', 'tilt', () => M.paintGrey(), 'gantry_ring'],
  ['slip_ring_assembly', 'tilt', () => M.copper(), 'slip_ring_assembly'],
  ['bore', 'tilt', () => M.paintWhite(), 'bore'],
  ['xray_tube', 'rotor', () => M.steelDark(), 'xray_tube'],
  ['detector_array', 'rotor', () => M.plasticMed(), 'detector_array'],
  ['collimators', 'rotor', () => M.tungsten(), 'collimators'],
  ['cooling_system', 'world', () => M.paintGrey(), 'cooling_system'],
  ['laser_positioning_lights', 'world', () => M.plasticDark(), 'laser_positioning_lights'],
  ['control_console', 'world', () => M.paintGrey(), 'control_console'],
  ['image_reconstruction_computer', 'world', () => M.plasticDark(), 'image_reconstruction_computer'],
  ['safety_and_intercom_systems', 'world', () => M.plasticDark(), 'safety_and_intercom_systems'],
];

export async function createCT(stage) {
  const T = THREE;
  const world = new T.Group(); world.name = 'ctWorld';
  const registry = new Map();
  const register = (id, obj) => { obj.traverse((o) => { if (o.isMesh) { o.userData.part = id; if (!registry.has(id)) registry.set(id, []); registry.get(id).push(o); } }); };

  /* ---------------- structure ---------------- */
  const tilt = new T.Group(), inner = new T.Group(), rotor = new T.Group(), rotorIn = new T.Group();
  tilt.position.set(XS, AX_Y, 0); inner.position.set(-XS, -AX_Y, 0); tilt.add(inner); world.add(tilt);
  rotor.position.set(0, AX_Y, 0); rotorIn.position.set(0, -AX_Y, 0); rotor.add(rotorIn); inner.add(rotor);
  const groups = {tilt: inner, rotor: rotorIn, world};
  let housingMat;
  await Promise.all(PARTS.map(async ([file, grp, mat, id]) => {
    const o = await stage.loadGLB(BASE + file + '.glb'); const m = mat();
    skin(o, m); register(id, o); o.name = file; if (file === 'gantry_housing') housingMat = m;
    groups[grp].add(o);
  }));
  housingMat.clearcoat = 0.9; housingMat.color.set(0xf3f4f2);

  /* ---------------- room ---------------- */
  const room = new T.Group(); room.name = 'room'; world.add(room);
  const RX0 = -2.5, RX1 = 3.9, RZ = 2.5, RH = 3.0, rcx = (RX0 + RX1) / 2, rW = RX1 - RX0;
  const floor = new T.Mesh(new T.PlaneGeometry(rW + 5, RZ * 2 + 0.2), M.floor()); floor.material.map.repeat.set(10, 6); floor.rotation.x = -Math.PI / 2; floor.position.set(rcx + 2.4, 0, 0); floor.receiveShadow = true; room.add(floor);
  const wallMat = M.wall(); wallMat.map.repeat.set(5, 2);
  // single-sided wall planes facing into the rooms, so the camera can look in from outside
  const wallP = (w, h, x, y, z, ry, mat = wallMat) => { const m = new T.Mesh(new T.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; room.add(m); return m; };
  const PI = Math.PI, doorW = 1.1, doorX = 1.5;
  wallP(rW, RH, rcx, RH / 2, -RZ, 0);                                   // -z wall (faces +z)
  wallP(RZ * 2, RH, RX0, RH / 2, 0, PI / 2);                             // -x wall (faces +x)
  wallP(doorX - doorW / 2 - RX0, RH, (RX0 + doorX - doorW / 2) / 2, RH / 2, RZ, PI);   // +z wall, left of door (faces -z)
  wallP(RX1 - doorX - doorW / 2, RH, (RX1 + doorX + doorW / 2) / 2, RH / 2, RZ, PI);
  wallP(doorW, RH - 2.1, doorX, 2.1 + (RH - 2.1) / 2, RZ, PI);
  // control-room wall (x = RX1) with a lead-glass window; faces -x into the scan room
  const winZ0 = -1.5, winZ1 = 1.1, winY0 = 0.95, winY1 = 2.1;
  wallP(RZ + winZ0, RH, RX1, RH / 2, (-RZ + winZ0) / 2, -PI / 2);
  wallP(RZ - winZ1, RH, RX1, RH / 2, (RZ + winZ1) / 2, -PI / 2);
  wallP(winZ1 - winZ0, winY0, RX1, winY0 / 2, (winZ0 + winZ1) / 2, -PI / 2);
  wallP(winZ1 - winZ0, RH - winY1, RX1, winY1 + (RH - winY1) / 2, (winZ0 + winZ1) / 2, -PI / 2);
  const frameM = M.plasticDark(); for (const [w, h, y, z] of [[0.05, 0.05, winY0, 0], [0.05, 0.05, winY1, 0]]) { const f = new T.Mesh(new T.BoxGeometry(0.06, h, winZ1 - winZ0 + 0.05), frameM); f.position.set(RX1 - 0.02, y, (winZ0 + winZ1) / 2); room.add(f); }
  const glass = new T.Mesh(new T.PlaneGeometry(winZ1 - winZ0, winY1 - winY0), new T.MeshPhysicalMaterial({color: 0xbfe2d4, transparent: true, opacity: 0.16, roughness: 0.04, metalness: 0, depthWrite: false, side: T.DoubleSide}));
  glass.rotation.y = -PI / 2; glass.position.set(RX1 - 0.005, (winY0 + winY1) / 2, (winZ0 + winZ1) / 2); room.add(glass);
  // control-room side walls (face into the control area) and rear wall
  wallP(2.0, RH, RX1 + 1.0, RH / 2, -RZ, 0); wallP(2.0, RH, RX1 + 1.0, RH / 2, RZ, PI); wallP(RZ * 2, RH, RX1 + 2.0, RH / 2, 0, -PI / 2);
  const ceilMat = M.ceiling(); ceilMat.emissive = new T.Color(0xcfd2cf); ceilMat.emissiveMap = ceilMat.map; ceilMat.emissiveIntensity = 0.5; const ceil = new T.Mesh(new T.PlaneGeometry(rW + 2.0, RZ * 2), ceilMat); ceil.material.map.repeat.set(9, 5); ceil.rotation.x = Math.PI / 2; ceil.position.set(rcx + 1.0, RH, 0); room.add(ceil);
  const panelMat = new T.MeshBasicMaterial({color: new T.Color(1, 1, 0.97).multiplyScalar(1.4)});
  for (const x of [-1.2, 1.1, 3.3]) for (const z of [-1.4, 1.4]) { const p = new T.Mesh(new T.PlaneGeometry(1.1, 0.55), panelMat); p.rotation.x = Math.PI / 2; p.position.set(x, RH - 0.005, z); room.add(p); }
  for (const z of [-0.9, 0.9]) { const p = new T.Mesh(new T.PlaneGeometry(1.0, 0.5), panelMat); p.rotation.x = Math.PI / 2; p.position.set(RX1 + 1.1, RH - 0.005, z); room.add(p); }
  // sliding door + warning lamp (+ yellow trefoil)
  const door = new T.Mesh(new RoundedBoxGeometry(doorW, 2.1, 0.12, 2, 0.015), M.paintGrey()); door.position.set(doorX, 1.05, RZ - 0.03); door.castShadow = door.receiveShadow = true; room.add(door);
  const handle = new T.Mesh(new T.CylinderGeometry(0.015, 0.015, 0.3, 12), M.steel()); handle.position.set(doorX - 0.35, 1.0, RZ - 0.11); door.attach(handle);
  const lamp = new T.Mesh(new RoundedBoxGeometry(0.5, 0.14, 0.05, 2, 0.01), M.led(0x1a6a40)); lamp.position.set(doorX, 2.32, RZ - 0.1); room.add(lamp);
  const lampLight = new T.PointLight(0xff3020, 0, 3, 2); lampLight.position.set(doorX, 2.32, RZ - 0.4); room.add(lampLight);
  const lampSign = new T.Mesh(new T.PlaneGeometry(0.46, 0.1), new T.MeshBasicMaterial({map: (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 56; const g = c.getContext('2d'); g.fillStyle = '#0a0a0a'; g.fillRect(0, 0, 256, 56); g.fillStyle = '#ffd34d'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.fillText('X-RAY ON', 128, 40); return new T.CanvasTexture(c); })(), transparent: true, opacity: 0})); lampSign.position.set(doorX, 2.32, RZ - 0.128); room.add(lampSign);
  room.traverse((o) => { if (o.isMesh) { o.userData.part = 'control_room'; if (!registry.has('control_room')) registry.set('control_room', []); registry.get('control_room').push(o); } });

  // operator monitors: canvas textures laid over the two screens of the console model
  const monCv = document.createElement('canvas'); monCv.width = 1024; monCv.height = 288; const monTex = new T.CanvasTexture(monCv); monTex.colorSpace = T.SRGBColorSpace; monTex.repeat.set(0.5, 1);
  const monTex2 = monTex.clone(); monTex2.offset.set(0.5, 0); monTex2.repeat.set(0.5, 1); monTex2.colorSpace = T.SRGBColorSpace;
  const monitor = new T.Group(); world.add(monitor);
  for (const [cx, cy, cz, nx, nz, tx] of [[4.862, 1.025, 0.389, 0.989, -0.148, monTex], [4.859, 1.04, -0.163, 0.952, 0.306, monTex2]]) {
    const m = new T.Mesh(new T.PlaneGeometry(0.43, 0.242), new T.MeshBasicMaterial({map: tx, toneMapped: false})); m.rotation.y = Math.atan2(nx, nz); m.position.set(cx + nx * (nz > 0 ? 0.052 : 0.026), cy, cz + nz * (nz > 0 ? 0.052 : 0.026)); monitor.add(m);
  }

  /* ---------------- table ---------------- */
  let oldTop = null;
  const tableTop = new T.Group(), tableCol = new T.Group(), tableBase = new T.Group(); tableCol.position.y = 0.14; world.add(tableTop, tableCol, tableBase);
  {
    const o = await stage.loadGLB(BASE + 'patient_table.glb'); o.updateMatrixWorld(true);
    const seen = new Set(), list = []; o.traverse((m) => { if (m.isMesh) list.push(m); });
    for (const m of list) {
      const b = new T.Box3().setFromObject(m), c = b.getCenter(new T.Vector3()), s = b.getSize(new T.Vector3());
      const key = [c.x, c.y, c.z, s.x, s.y, s.z, m.geometry.attributes.position.count].map((v) => v.toFixed(3)).join('|'); if (seen.has(key)) continue; seen.add(key);
      m.removeFromParent();
      let g = tableBase, mat = M.paintGrey();
      if (c.y > 0.78) { g = tableTop; if (s.x > 1.8 && s.y < 0.06 && c.y > 1.0) { oldTop = m; m.visible = false; m.userData.oldTop = true; mat = M.couchTop(); } else mat = M.paintWhite(); }
      else if (c.y > 0.14 && c.y < 0.88 && s.y < 0.2 && s.x < 1.3) { g = tableCol; mat = M.plasticDark(); }
      m.matrix.copy(m.matrixWorld); m.matrix.decompose(m.position, m.quaternion, m.scale); m.updateMatrix();
      if (g === tableCol) { m.position.y -= 0.14; }
      m.material = mat; m.castShadow = m.receiveShadow = true; g.add(m); register('patient_table', m);
    }
  }
  // ---- flat, indexed carbon-fibre couch top (radiotherapy / diagnostic flat-top style) ----
  const FT = {len: 2.48, wid: 0.46, th: 0.038, x0: -0.09, step: 0.05};
  {
    const topY = TOP_Y0;                                   // the phantom is built to rest on y = TOP_Y0 in this frame
    const slab = new T.Mesh(new RoundedBoxGeometry(FT.len, FT.th, FT.wid, 4, 0.012), M.couchTop()); slab.position.set(FT.x0 + FT.len / 2, topY - FT.th / 2, 0); slab.castShadow = slab.receiveShadow = true; tableTop.add(slab);
    // index scale: canvas drawn once, laid on the flat top (cm ticks, numbered index slots every 5 cm on both rails)
    const W = 4096, H = 512, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d'); g.clearRect(0, 0, W, H);
    const pxm = W / FT.len;                                  // px per metre along the length
    g.fillStyle = 'rgba(235,240,245,0.92)'; g.strokeStyle = 'rgba(235,240,245,0.92)'; g.font = 'bold 22px sans-serif'; g.textAlign = 'center';
    const nSlots = Math.floor(FT.len / FT.step);
    for (let k = 0; k <= nSlots; k++) {
      const x = k * FT.step * pxm + 10; if (x > W - 10) break;
      const major = k % 2 === 0;
      for (const side of [0, 1]) {
        const yEdge = side === 0 ? 20 : H - 20, dir = side === 0 ? 1 : -1;
        g.lineWidth = major ? 4 : 2.5; g.beginPath(); g.moveTo(x, yEdge); g.lineTo(x, yEdge + dir * (major ? 40 : 24)); g.stroke();
        if (major) { g.save(); g.translate(x, yEdge + dir * 66); g.fillText(String(k / 2 + 1).padStart(2, '0'), 0, 8); g.restore(); }
      }
    }
    g.lineWidth = 3; g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();                       // sagittal centre line
    for (let cm = 0; cm * 0.01 < FT.len; cm += 10) { const x = cm * 0.01 * pxm + 10; g.lineWidth = cm % 50 === 0 ? 4 : 2; g.beginPath(); g.moveTo(x, H / 2 - (cm % 50 === 0 ? 26 : 14)); g.lineTo(x, H / 2 + (cm % 50 === 0 ? 26 : 14)); g.stroke(); if (cm % 50 === 0) g.fillText(String(cm), x, H / 2 - 36); }
    const tx = new T.CanvasTexture(cv); tx.colorSpace = T.SRGBColorSpace; tx.anisotropy = 8;
    const scale = new T.Mesh(new T.PlaneGeometry(FT.len, FT.wid).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({map: tx, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2}));
    scale.position.set(FT.x0 + FT.len / 2, topY + 0.0008, 0); scale.renderOrder = 3; tableTop.add(scale);
    // index slots: small dark recesses in the edge rails at every numbered position
    const slotGeo = new T.BoxGeometry(0.014, 0.004, 0.02), slots = new T.InstancedMesh(slotGeo, M.plasticDark(), (nSlots + 1) * 2); let n = 0, mm4 = new T.Matrix4();
    for (let k = 0; k <= nSlots; k += 2) for (const sg of [-1, 1]) { mm4.makeTranslation(FT.x0 + 0.01 + k * FT.step, topY + 0.0006, sg * (FT.wid / 2 - 0.015)); slots.setMatrixAt(n++, mm4); }
    slots.count = n; tableTop.add(slots);
    const rail = new T.Mesh(new RoundedBoxGeometry(FT.len, 0.012, 0.014, 2, 0.005), M.steelBrushed());
    for (const sg of [-1, 1]) { const r = rail.clone(); r.position.set(FT.x0 + FT.len / 2, topY - FT.th + 0.004, sg * (FT.wid / 2 - 0.002)); tableTop.add(r); register('couch_top_flat', r); }
    register('couch_top_flat', slab); register('couch_top_flat', scale); register('couch_top_flat', slots);
  }
  const SEC_HALF_B = (sec) => sec.ell[0][3] / 100;                    // vertical semi-axis of the section body (m)
  /* ---------------- phantom ---------------- */
  const phantom = new T.Group(); phantom.position.set(HEAD_X0, 0, 0); tableTop.add(phantom);
  const phMeshes = [];
  const insertCols = {'-1000': 0x111111, '-200': 0x6c7a8a, '-100': 0x93a4b4, '-35': 0xb8c4cf, '120': 0xd8d0b8, '340': 0xe6dccd, '990': 0xf2f2f2};
  SECTIONS.forEach((sec) => {
    const [, , a, b] = sec.ell[0], len = (sec.s1 - sec.s0) / 100; const sh = new T.Shape(); sh.absellipse(0, 0, a / 100, b / 100, 0, Math.PI * 2, false);
    const geo = new T.ExtrudeGeometry(sh, {depth: len - 0.002, bevelEnabled: false, curveSegments: 48}); geo.rotateY(Math.PI / 2);   // extrude along +x, ellipse in z (a) / y (b)
    geo.translate(sec.s0 / 100 + 0.001, 0, 0); const isThorax = sec.name.includes('Thorax');
    const mat = isThorax ? M.tissue() : M.acrylic(); mat.side = T.DoubleSide;
    const m = new T.Mesh(geo, mat); m.position.y = TOP_Y0 + b / 100; m.castShadow = m.receiveShadow = true; m.userData.sec = sec; phantom.add(m); phMeshes.push(m);
    // end-cap pattern showing the inserts (canvas texture mapped onto an elliptical cap)
    const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d'); g.fillStyle = isThorax ? '#d9a58f' : '#cfe3ea'; g.fillRect(0, 0, 256, 256);
    const M2 = Math.max(a, b) * 1.02, sc = 256 / (2 * M2);
    for (const [cx, cy, ea, eb, hu] of sec.ell.slice(1)) { g.fillStyle = isThorax ? (hu < -500 ? '#7b8fa1' : hu > 250 ? '#f1ead8' : '#c68f78') : (insertCols[String(hu)] ? '#' + insertCols[String(hu)].toString(16).padStart(6, '0') : '#9fb6c2'); g.beginPath(); g.ellipse(128 + cx * sc, 128 - cy * sc, ea * sc, eb * sc, 0, 0, 7); g.fill(); }
    const capT = new T.CanvasTexture(cv); capT.colorSpace = T.SRGBColorSpace;
    const mk = () => { const cs = new T.Shape(); cs.absellipse(0, 0, a / 100, b / 100, 0, Math.PI * 2, false); const cg = new T.ShapeGeometry(cs, 48), p2 = cg.attributes.position, u2 = cg.attributes.uv; for (let i = 0; i < u2.count; i++) u2.setXY(i, 0.5 + (p2.getX(i) * 100) / (2 * M2), 0.5 + (p2.getY(i) * 100) / (2 * M2)); return cg; };
    for (const [x, ry] of [[sec.s0 / 100 + 0.0015, -Math.PI / 2], [sec.s1 / 100 - 0.0015, Math.PI / 2]]) {
      const cap = new T.Mesh(mk(), new T.MeshStandardMaterial({map: capT, roughness: 0.5})); cap.position.set(x, TOP_Y0 + b / 100, 0); cap.rotation.y = ry; cap.castShadow = false; phantom.add(cap); phMeshes.push(cap);
    }
  });
  // skin marks: landmark ring at s = 5 cm (mid Module A), top midline stripe, side marks (visual, black tape)
  const tape = new T.MeshStandardMaterial({color: 0x101010, roughness: 0.7});
  const topLine = new T.Mesh(new T.BoxGeometry(PHANTOM_LEN / 100, 0.0015, 0.004), tape); topLine.position.set(PHANTOM_LEN / 200, TOP_Y0 + 0.2 + 0.0008, 0); phantom.add(topLine);
  const lm = new T.Mesh(new T.TorusGeometry(0.1, 0.0022, 6, 64), tape); lm.rotation.y = Math.PI / 2; lm.position.set(0.05, TOP_Y0 + 0.1, 0); phantom.add(lm);
  for (const sgn of [-1, 1]) { const sm = new T.Mesh(new T.CylinderGeometry(0.008, 0.008, 0.002, 16), tape); sm.rotation.x = Math.PI / 2; sm.position.set(0.05, TOP_Y0 + 0.1, sgn * 0.1); phantom.add(sm); }
  const topLineTall = (x) => TOP_Y0 + 2 * SEC_HALF_B(sectionAt(x * 100));

  /* ---------------- state ---------------- */
  const axes = {tableIn: A(0, 1.50, 0.15, ' m'), tableH: A(0.62, 1.30, 0.035, ' m'), tilt: A(-30, 30, 3, '°')};
  axes.tableH.val = axes.tableH.tgt = 1.07;                // starts too low (needs raising to the isocentre)
  const S = {
    timeScale: 1, kvp: 120, mAs: 200, pitch: 1.0, thick: 5, kernel: 'standard', fov: 40, mode: 'helical', trot: 0.5, collim: 40, // mm
    doorOpen: false, tubeAnim: true, xray: false, rotorOmega: 0, rotorAngle: 0, lasers: true, coverOpacity: 1, fan: true, interlock: true, heat: 0, heatCap: 2.0,
    zOff: 0.025,                                            // phantom lateral placement error (m)
    status: 'READY', selected: null, scanState: null, scoutDone: null, scanRes: null, range: [20, 34], scoutView: 'ap',
  };
  // tube heat cooling is applied in update()

  /* ---------------- fan beam ---------------- */
  const RF = 0.6, RD = 1.06, HA = (24.6 * Math.PI) / 180, NA = 28;
  const fanGeo = new T.BufferGeometry(), fanPos = new Float32Array((2 + 2 * (NA + 1)) * 3), fanIdx = [];
  for (let i = 0; i < NA; i++) { const base = 2 + 2 * i, nb = base + 2; fanIdx.push(0, base, nb, 1, nb + 1, base + 1, base, base + 1, nb + 1, base, nb + 1, nb); }
  { const e0 = 2, e1 = 2 + 2 * NA; fanIdx.push(0, 1, e0 + 1, 0, e0 + 1, e0, 0, 1, e1 + 1, 0, e1 + 1, e1); }
  fanGeo.setAttribute('position', new T.BufferAttribute(fanPos, 3)); fanGeo.setIndex(fanIdx);
  const fan = new T.Mesh(fanGeo, new T.MeshBasicMaterial({color: 0xffd36a, transparent: true, opacity: 0.22, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false}));
  fan.frustumCulled = false; fan.renderOrder = 3; rotor.add(fan); fan.visible = false;
  function setFan(collimM) {   // rotor frame: origin on the rotation axis; focal spot at +RF (tube side), detector arc radius RD about the focal spot
    const P = fanPos, wd = collimM * (RD / RF), set = (i, x, y, z) => { P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z; };
    set(0, XS - 0.002, RF, 0); set(1, XS + 0.002, RF, 0);
    for (let i = 0; i <= NA; i++) { const a = -HA + (2 * HA * i) / NA, yy = RF - RD * Math.cos(a), zz = RD * Math.sin(a); set(2 + 2 * i, XS - wd / 2, yy, zz); set(3 + 2 * i, XS + wd / 2, yy, zz); }
    fanGeo.attributes.position.needsUpdate = true;
  }
  setFan(0.04);
  const tubeAnim = createTubeAnim(rotor, {xs: XS, rf: RF, rd: RD, ha: HA});

  /* ---------------- lasers (instanced red segments on the surfaces) ---------------- */
  const redMat = new T.MeshBasicMaterial({color: 0xff2418, toneMapped: false});
  const MAXSEG = 400, seg = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), redMat, MAXSEG); seg.frustumCulled = false; seg.count = 0; world.add(seg);
  const dummy = new T.Object3D(); let nseg = 0;
  const put = (x, y, z, sx, sy, sz, ry = 0, rz = 0) => { if (nseg >= MAXSEG) return; dummy.position.set(x, y, z); dummy.scale.set(sx, sy, sz); dummy.rotation.set(0, ry, rz); dummy.updateMatrix(); seg.setMatrixAt(nseg++, dummy.matrix); };
  const wallLaser = new T.Group(); world.add(wallLaser);
  { const lm2 = new T.MeshBasicMaterial({color: 0xff2418, toneMapped: false}), strip = (w, h, x, y, z, ry) => { const m = new T.Mesh(new T.PlaneGeometry(w, h), lm2); m.position.set(x, y, z); m.rotation.y = ry; wallLaser.add(m); };
    for (const s of [-1, 1]) { strip(rW - 0.2, 0.006, rcx, AX_Y, s * (RZ - 0.002), s > 0 ? Math.PI : 0); strip(0.006, RH, XL, RH / 2, s * (RZ - 0.002), s > 0 ? Math.PI : 0); }
    const c = new T.Mesh(new T.PlaneGeometry(rW - 0.2, 0.006), lm2); c.rotation.x = Math.PI / 2; c.position.set(rcx, RH - 0.003, 0); wallLaser.add(c);
    const c2 = new T.Mesh(new T.PlaneGeometry(0.006, RZ * 2 - 0.2), lm2); c2.rotation.x = Math.PI / 2; c2.position.set(XL, RH - 0.003, 0); wallLaser.add(c2);
    for (const x of [XL]) for (const s of [-1, 1]) { const pr = new T.Mesh(new RoundedBoxGeometry(0.12, 0.1, 0.1, 2, 0.02), M.paintGrey()); pr.position.set(x, AX_Y, s * (RZ - 0.05)); wallLaser.add(pr); }
  }
  function laserGeometry() {            // red lines on phantom + table where each laser plane intersects them
    nseg = 0; const topY = tableTop.position.y;
    const xph0 = phantom.getWorldPosition(new T.Vector3()).x, zc = S.zOff;
    const yTable = TOP_Y0 + topY;
    // axial laser ring (plane x = XL) on phantom perimeter, and a line across the table top
    const sPos = (XL - xph0) * 100;
    if (sPos >= 0 && sPos <= PHANTOM_LEN) {
      const sec = sectionAt(sPos), a = sec.ell[0][2] / 100, b = sec.ell[0][3] / 100, yc = yTable + b, N = 64;
      for (let i = 0; i < N; i++) { const t0 = (i / N) * Math.PI * 2, t1 = ((i + 1) / N) * Math.PI * 2, z0 = zc + a * Math.cos(t0), y0 = yc + b * Math.sin(t0), z1 = zc + a * Math.cos(t1), y1 = yc + b * Math.sin(t1);
        const mx = (z0 + z1) / 2, my = (y0 + y1) / 2, L = Math.hypot(z1 - z0, y1 - y0) + 0.002, ang = Math.atan2(y1 - y0, z1 - z0);
        dummy.position.set(XL, my, mx); dummy.scale.set(0.004, 0.004, L); dummy.rotation.set(-ang, 0, 0); dummy.rotation.order = 'XYZ'; dummy.updateMatrix(); if (nseg < MAXSEG) seg.setMatrixAt(nseg++, dummy.matrix); }
    }
    if (xph0 > XL || xph0 + PHANTOM_LEN / 100 < XL) { /* plane outside phantom: still lights the table top */ }
    put(XL, yTable + 0.0015, 0, 0.004, 0.003, 0.48);
    // sagittal laser (z = 0) along the phantom top and the table top
    for (let x = 0; x < PHANTOM_LEN; x += 1) { const sec = sectionAt(x + 0.5), b = sec.ell[0][3] / 100, a = sec.ell[0][2] / 100, yc = yTable + b; const dz = 0 - zc; if (Math.abs(dz) < a) { const yy = yc + b * Math.sqrt(1 - (dz / a) ** 2); put(xph0 + (x + 0.5) / 100, yy + 0.002, 0, 0.0105, 0.004, 0.004); } }
    for (let x = -0.09 - axes.tableIn.val; x < 2.39 - axes.tableIn.val; x += 0.05) { const wx = x + 0.025; if (wx < xph0 - 0.01 || wx > xph0 + PHANTOM_LEN / 100 + 0.01) put(wx, yTable + 0.0015, 0, 0.0505, 0.003, 0.004); }
    // coronal (horizontal) lasers at y = AX_Y hit the phantom sides, if the phantom straddles that height
    for (let x = 0; x < PHANTOM_LEN; x += 1) { const sec = sectionAt(x + 0.5), b = sec.ell[0][3] / 100, a = sec.ell[0][2] / 100, yc = yTable + b, dy = AX_Y - yc; if (Math.abs(dy) < b) { const zz = a * Math.sqrt(1 - (dy / b) ** 2); for (const sgn of [-1, 1]) put(xph0 + (x + 0.5) / 100, AX_Y, zc + sgn * (zz + 0.002), 0.0105, 0.004, 0.004); } }
    seg.count = nseg; seg.instanceMatrix.needsUpdate = true;
  }

  /* ---------------- geometry for collision tests ---------------- */
  function hullPoints() {   // world points on table top corners + phantom hull (inside the gantry zone)
    const pts = [], topY = TOP_Y0 + tableTop.position.y, x0 = tableTop.position.x;
    for (let x = -0.09 + x0; x <= 2.39 + x0; x += 0.1) for (const z of [-0.25, 0.25]) { pts.push([x, topY - 0.04, z]); pts.push([x, topY, z]); }
    const xp = phantom.getWorldPosition(new T.Vector3()).x;
    SECTIONS.forEach((sec) => { const a = sec.ell[0][2] / 100, b = sec.ell[0][3] / 100, yc = topY + b;
      for (let x = sec.s0; x <= sec.s1; x += 2) for (let k = 0; k < 12; k++) { const t = (k / 12) * Math.PI * 2; pts.push([xp + x / 100, yc + b * Math.sin(t), S.zOff + a * Math.cos(t)]); } });
    return pts;
  }
  function collision() {
    const th = (axes.tilt.val * Math.PI) / 180, ax = [Math.cos(th), Math.sin(th), 0];
    for (const [x, y, z] of hullPoints()) {
      const p = [x - XS, y - AX_Y, z], u = p[0] * ax[0] + p[1] * ax[1], d2 = p[0] * p[0] + p[1] * p[1] + p[2] * p[2] - u * u;
      if (u > -0.46 && u < 0.14 && d2 > (BORE_R - 0.01) ** 2) return 'the gantry bore';
    }
    return null;
  }

  function applyAxes() {
    tableTop.position.set(-axes.tableIn.val, axes.tableH.val - TOP_Y0, 0);
    const k = Math.max(0.2, (0.87 + (axes.tableH.val - TOP_Y0) - 0.14) / (0.87 - 0.14)); tableCol.scale.y = k;
    tilt.rotation.z = (axes.tilt.val * Math.PI) / 180;
    phantom.position.z = S.zOff;
  }
  applyAxes();

  /* ---------------- image bookkeeping ---------------- */
  const imgCache = new Map();
  function sliceParams(s) {
    const sec = sectionAt(s), b = sec.ell[0][3] / 100, yTop = axes.tableH.val, yc = yTop + b;
    const off = Math.hypot(S.zOff * 100, (yc - AX_Y) * 100);
    return {section: sec, kvp: S.scanRes?.kvp ?? S.kvp, mAs: S.scanRes?.mAs ?? S.mAs, pitch: S.scanRes?.pitch ?? S.pitch, thick: S.scanRes?.thick ?? S.thick, kernel: S.scanRes?.kernel ?? S.kernel, fov: S.scanRes?.fov ?? S.fov,
      dx: -(S.scanRes ? S.scanRes.zOff : S.zOff) * 100, dy: ((S.scanRes ? S.scanRes.yc[sec.name] ?? yc : yc) - AX_Y) * 100, tableCy: ((S.scanRes ? S.scanRes.yTop : yTop) - 0.009 - AX_Y) * 100, off};
  }
  function recon(sPos) {   // reconstruct (cached) the image at phantom position sPos (cm)
    const res = S.scanRes; if (!res) return null; const s = Math.round(sPos * 10) / 10, key = res.id + '|' + s; if (imgCache.has(key)) return imgCache.get(key);
    const p = sliceParams(s); const miscentre = Math.max(0, p.off - 1.5); const img = reconstruct({...p, tableCx: 0, tableCy: p.tableCy, mAs: p.mAs / (1 + 0.03 * miscentre * miscentre), seed: Math.round(s * 10) + res.id * 131}, stage.mobile ? 160 : 192);
    img.s = s; img.section = p.section; img.params = p; imgCache.set(key, img); if (imgCache.size > 80) imgCache.delete(imgCache.keys().next().value); return img;
  }

  /* ---------------- scan sequencing ---------------- */
  const cbs = {change: [], collision: [], scanEvent: []};
  const emit = (n, d) => cbs[n].forEach((f) => f(d));
  const sToTable = (s) => HEAD_X0 + s / 100 - XS;                       // table travel (m) that puts phantom position s at the scan plane
  const tableToS = (t) => (t + XS - HEAD_X0) * 100;
  function preflight(kind) {
    if (S.doorOpen) return 'Scan-room door is open — close it (X-RAY interlock).';
    if (S.scanState) return 'A scan is already running.';
    if (S.interlock && collision()) return 'Collision interlock active — clear the gantry bore first.';
    const mA = S.mAs / S.trot, len = kind === 'scout' ? 40 : Math.abs(S.range[1] - S.range[0]), T0 = (len / 100) / (S.pitch * S.collim / 1000 / S.trot);
    const add = (S.kvp * mA * (kind === 'scout' ? 3 : T0)) / 1e6;
    if (S.heat + add > S.heatCap * 0.98) return `Tube heat limit: ${((S.heat + add) / S.heatCap * 100).toFixed(0)} % of capacity — wait for cooling or lower kVp/mAs.`;
    if (kind === 'scan' && !S.scoutDone) return 'Take a scout first so the scan range can be planned.';
    if (kind === 'scan' && S.range[1] - S.range[0] < 0.5) return 'Scan range is empty — set a start and end on the scout.';
    if (Math.abs(axes.tilt.val) > 0.01 && kind === 'scout') return 'Tilt the gantry back to 0° for the scout.';
    return null;
  }
  function startScan(kind, opts = {}) {
    const bad = preflight(kind); if (bad) return bad;
    const id = (S._id = (S._id || 0) + 1), mA = S.mAs / S.trot;
    if (kind === 'demo') { S.scanState = {kind, phase: 'spin', t: 0, progress: 0, id, mA, view: 'ap'}; S.status = 'POSITIONING'; }
    else if (kind === 'scout') {
      S.scoutView = opts.view || 'ap';
      S.scanState = {kind, phase: 'move', view: S.scoutView, s0: -2, s1: PHANTOM_LEN + 2, progress: 0, id, mA, kvp: S.kvp, img: scout(S.scoutView, S.kvp, (axes.tableH.val - AX_Y) * 100, -S.zOff * 100, 40, id)};
      axes.tableIn.tgt = sToTable(-2); S.status = 'POSITIONING';
    } else {
      const [s0, s1] = [Math.min(...S.range), Math.max(...S.range)];
      const yc = {}; SECTIONS.forEach((sec) => (yc[sec.name] = axes.tableH.val + sec.ell[0][3] / 100));
      S.scanState = {kind, phase: 'move', s0, s1, progress: 0, id, mA, params: {kvp: S.kvp, mAs: S.mAs, pitch: S.pitch, thick: S.thick, kernel: S.kernel, fov: S.fov, mode: S.mode, trot: S.trot, collim: S.collim, zOff: S.zOff, yTop: axes.tableH.val, yc, id}, step: 0, stepT: 0};
      axes.tableIn.tgt = sToTable(s0); S.status = 'POSITIONING';
    }
    emit('scanEvent', {type: 'start', kind}); return null;
  }
  function abortScan(why) { if (!S.scanState) return; S.scanState = null; S.xray = false; axes.tableIn.tgt = axes.tableIn.val; S.status = 'ABORTED'; emit('scanEvent', {type: 'abort', why}); }
  function stepScan(dt) {
    const st = S.scanState; if (!st) return; const ts = S.timeScale;
    if (st.phase === 'move') { if (Math.abs(axes.tableIn.val - axes.tableIn.tgt) < 1e-4) { st.phase = 'spin'; st.t = 0; S.status = 'SPIN-UP'; axes.tableIn.tgt = axes.tableIn.val; } return; }
    if (st.phase === 'spin') { st.t += dt * ts; const targetW = st.kind === 'scout' || st.kind === 'demo' ? 0 : 360 / S.trot; S.rotorOmega += (targetW - S.rotorOmega) * Math.min(1, dt * ts * 1.8); if (st.t > (st.kind === 'scout' || st.kind === 'demo' ? 0.5 : 1.8)) { st.phase = 'expose'; S.xray = true; S.status = 'X-RAY ON'; if (st.kind === 'scout' || st.kind === 'demo') S.rotorAngle = st.view === 'ap' ? 0 : Math.PI / 2; } return; }
    if (st.phase === 'expose' && st.kind === 'demo') { st.progress = Math.min(1, st.progress + dt * ts / 12); S.heat += (S.kvp * st.mA * dt * ts * 0.2) / 1e6; if (st.progress >= 1) { S.scanState = null; S.xray = false; S.status = 'READY'; emit('scanEvent', {type: 'done', kind: 'demo'}); } return; }
    if (st.phase === 'expose') {
      const mAtot = st.mA, perRot = S.collim / 1000;                                   // beam width per rotation at iso
      let v;                                                                             // table speed (m/s)
      if (st.kind === 'scout') v = 0.1;
      else if (S.mode === 'helical') v = (S.pitch * perRot) / S.trot;
      else v = 0;
      const dTab = (st.kind === 'axial') ? 0 : v * dt * ts;
      if (st.kind === 'scan' && S.mode === 'axial') { // step-and-shoot: one rotation per step then move one beam width
        st.stepT += dt * ts; if (st.stepT >= S.trot) { st.stepT = 0; S.xray = false; st.phase = 'step'; st.target = axes.tableIn.val + perRot; }
      } else axes.tableIn.val = Math.min(axes.tableIn.max, axes.tableIn.val + dTab);
      const sNow = tableToS(axes.tableIn.val), end = st.kind === 'scout' ? PHANTOM_LEN + 2 : st.s1;
      if (S.mode === 'axial' && st.kind === 'scan') st.progress = Math.min(1, (tableToS(axes.tableIn.val) - st.s0) / Math.max(0.1, end - st.s0));
      else st.progress = Math.min(1, (sNow - st.s0) / Math.max(0.1, end - st.s0));
      // heat accumulates while exposing
      S.heat += (S.kvp * mAtot * dt * ts) / 1e6;
      if (st.progress >= 1) finishScan();
      if (S.interlock && collision()) { abortScan('Collision interlock'); }
    }
    if (st.phase === 'step') { axes.tableIn.val = Math.min(axes.tableIn.max, axes.tableIn.val + 0.15 * dt * ts); if (axes.tableIn.val >= st.target - 1e-4) { st.phase = 'expose'; S.xray = true; } }
  }
  function finishScan() {
    const st = S.scanState; S.scanState = null; S.xray = false; S.status = 'READY';
    if (st.kind === 'scout') { S.scoutDone = {view: st.view, img: st.img}; axes.tableIn.tgt = axes.tableIn.val; emit('scanEvent', {type: 'done', kind: 'scout'}); return; }
    S.scanRes = {...st.params, s0: st.s0, s1: st.s1}; imgCache.clear(); axes.tableIn.tgt = axes.tableIn.val;
    const len = st.s1 - st.s0, di = doseInfo({kvp: st.params.kvp, mAs: st.params.mAs, pitch: st.params.pitch, lengthCm: len}); S.scanRes.dose = di; S.scanRes.n = Math.max(1, Math.floor(len / (st.params.thick / 10)));
    emit('scanEvent', {type: 'done', kind: 'scan', res: S.scanRes});
  }

  /* ---------------- per-frame update ---------------- */
  let doorOpenAmt = 0, hitCool = 0;
  function update(dt) {
    const ts = S.timeScale; let moving = false, hit = null;
    for (const [name, a] of Object.entries(axes)) {
      if (S.scanState && name === 'tilt') continue;
      const d = a.tgt - a.val; if (Math.abs(d) < 1e-6) { a.blocked = false; continue; }
      if (S.scanState && S.scanState.phase !== 'move' && name === 'tableIn') continue;
      const wasHit = S.interlock ? collision() : null, prev = a.val; a.val += Math.sign(d) * Math.min(Math.abs(d), a.speed * ts * dt * (name === 'tableIn' && S.scanState ? 1.5 : 1)); applyAxes();
      if (S.interlock) { const c = collision(); if (c && !wasHit) { a.val = prev; applyAxes(); a.blocked = true; hit = {axis: name, what: c}; a.tgt = prev; if (S.scanState) abortScan('Collision with ' + c); } else a.blocked = false; }
      moving = true;
    }
    if (hit) { S.status = 'INTERLOCK'; emit('collision', hit); }
    if (S.scanState) { applyAxes(); stepScan(dt); applyAxes(); }
    // rotor: idles stopped, spins up only during acquisition
    const idle = !S.scanState || S.scanState.phase === 'move';
    if (idle) S.rotorOmega *= Math.max(0, 1 - 1.2 * dt * ts);
    if (S.rotorOmega < 2 && idle) S.rotorOmega = 0;
    S.rotorAngle += (S.rotorOmega * Math.PI / 180) * dt * ts; rotor.rotation.x = S.rotorAngle;
    // beam fan
    tubeAnim.update(dt, S.tubeAnim && (S.selected === 'xray_tube' || (S.scanState && S.scanState.kind === 'demo')), S.xray || (S.selected === 'xray_tube' && !S.scanState), S.collim / 1000);
    fan.visible = S.xray && S.fan; if (S.xray) setFan(S.scanState && S.scanState.kind === 'scout' ? 0.01 : S.collim / 1000);
    // tube heat cooling (-0.35 MHU / min)
    S.heat = Math.max(0, S.heat - ((0.35 / 60) * dt * ts)) ;
    // warning lamp + door
    lamp.material.color.set(S.xray ? 0xff2a1a : 0x1a6a40); lamp.material.emissive.set(S.xray ? 0xff2a1a : 0x1a6a40); lampLight.intensity = S.xray ? 3 : 0; lampSign.material.opacity = S.xray ? (Math.floor(performance.now() / 350) % 2 === 0 ? 1 : 0.15) : 0;
    const tgt = S.doorOpen ? 1 : 0; doorOpenAmt += (tgt - doorOpenAmt) * Math.min(1, dt * 6); door.position.x = doorX + doorOpenAmt * (doorW - 0.05);
    // covers (gantry housing transparency)
    if (!S.selected) { const tr = S.coverOpacity < 0.999; if (housingMat.transparent !== tr) { housingMat.transparent = tr; housingMat.needsUpdate = true; } housingMat.opacity = S.coverOpacity; housingMat.depthWrite = S.coverOpacity > 0.6; }
    // lasers
    wallLaser.visible = S.lasers && !S.ar; seg.visible = S.lasers; if (S.lasers) laserGeometry();
    tween(dt);
    drawMonitor();
    emit('change', moving);
  }

  /* ---------------- operator monitor ---------------- */
  let monSig = '';
  function drawMonitor() {
    const st = S.scanState, img = S.viewImg, sig = [S.status, img && img.s, S.heat.toFixed(2), st && st.progress.toFixed(2), S.xray, S.scoutDone && S.scoutDone.view, S.range.join(), axes.tableIn.val.toFixed(2), S.wl, S.ww].join('|'); if (sig === monSig) return; monSig = sig;
    const g = monCv.getContext('2d'), H = 288; g.fillStyle = '#05090c'; g.fillRect(0, 0, 1024, H);
    // left monitor: image viewer
    if (img && img.canvas) g.drawImage(img.canvas, 10, 9, 270, 270); else { g.fillStyle = '#10191d'; g.fillRect(10, 9, 270, 270); g.fillStyle = '#4f7f89'; g.font = '16px monospace'; g.fillText('no image', 112, 148); }
    g.font = '15px monospace'; const L = (t, x, y, c = '#c8e1e6') => { g.fillStyle = c; g.fillText(t, x, y); };
    L('IMAGE VIEWER', 296, 28, '#6fa3ad'); if (img) { L(`slice ${img.s.toFixed(1)} cm`, 296, 58); L(`W ${Math.round(S.ww)}  L ${Math.round(S.wl)}`, 296, 80); L(img.section.name.slice(0, 18), 296, 102); L(`${img.params.kvp} kVp ${img.params.mAs} mAs`, 296, 124); L(`${img.params.thick} mm  ${img.params.kernel}`, 296, 146); }
    // right monitor: scan control
    if (S.scoutDone) { g.drawImage(scoutCanvas(S.scoutDone.img), 522, 26, 488, 110); g.strokeStyle = '#ffd34d'; g.lineWidth = 2; const x0 = 522 + (S.range[0] / PHANTOM_LEN) * 488, x1 = 522 + (S.range[1] / PHANTOM_LEN) * 488; g.strokeRect(x0, 27, x1 - x0, 108); } else { g.fillStyle = '#10191d'; g.fillRect(522, 26, 488, 110); }
    L('SCAN CONTROL', 522, 18, '#6fa3ad');
    L('STATUS  ' + S.status, 522, 164, S.xray ? '#ff5a4a' : '#7be0a0'); L(`${S.kvp} kVp  ${(S.mAs / S.trot).toFixed(0)} mA  pitch ${S.pitch}`, 522, 188); L(`table ${(axes.tableIn.val * 1000).toFixed(0)} mm   rot ${S.trot}s`, 522, 210); L(`tube heat ${(S.heat / S.heatCap * 100).toFixed(0)} %`, 522, 232, S.heat / S.heatCap > 0.8 ? '#ffb347' : '#c8e1e6');
    if (st) { L(`${st.kind.toUpperCase()} ${Math.round(st.progress * 100)} %`, 760, 232, '#ffd34d'); g.fillStyle = '#1b2a30'; g.fillRect(522, 252, 488, 14); g.fillStyle = '#ffd34d'; g.fillRect(522, 252, 488 * st.progress, 14); }
    g.save(); g.textAlign = 'right'; g.font = 'bold 15px sans-serif'; g.fillStyle = 'rgba(120,225,235,0.85)'; g.fillText('VAIDER LAB', 500, 278); g.fillText('VAIDER LAB', 1012, 278); g.restore();
    monTex.needsUpdate = true; monTex2.needsUpdate = true;
  }
  const scoutCache = new WeakMap();
  function scoutCanvas(sc) {
    if (scoutCache.has(sc)) return scoutCache.get(sc); const c = document.createElement('canvas'); c.width = sc.w; c.height = sc.h; const g = c.getContext('2d'), id = g.createImageData(sc.w, sc.h);
    for (let i = 0; i < sc.data.length; i++) { const v = 255 * (1 - sc.data[i]); id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; } g.putImageData(id, 0, 0); scoutCache.set(sc, c); return c;
  }

  /* ---------------- selection, camera tween ---------------- */
  let tw = null;
  function tween(dt) { if (!tw) return; const k = 1 - Math.pow(0.001, dt); stage.camera.position.lerp(tw.cam, k); stage.controls.target.lerp(tw.target, k); if (stage.camera.position.distanceTo(tw.cam) < 0.01) tw = null; }
  function flyTo(target, cam) { tw = {target: target.clone(), cam: cam.clone()}; }
  function focusPart(id) {
    const ms = registry.get(id); if (!ms || !ms.length) return; const b = new T.Box3(); ms.forEach((m) => b.expandByObject(m)); const c = b.getCenter(new T.Vector3()), r = Math.min(3.5, Math.max(1.0, b.getSize(new T.Vector3()).length() * 0.9));
    const dir = stage.camera.position.clone().sub(stage.controls.target).normalize(); dir.y = Math.max(dir.y, 0.15); dir.normalize(); flyTo(c, c.clone().add(dir.multiplyScalar(r * 1.6)));
  }
  function selectPart(id) {
    S.selected = id; const keepCovers = !id;
    for (const [pid, meshes] of registry) for (const m of meshes) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mt of mats) {
        if (!mt || !('emissive' in mt)) continue;
        if (!mt.userData._orig) mt.userData._orig = {t: mt.transparent, o: mt.opacity, e: mt.emissive.clone(), ei: mt.emissiveIntensity, dw: mt.depthWrite};
        const o = mt.userData._orig, on = id && pid === id, ghost = id && !on;
        mt.emissive.copy(on ? new T.Color(0x1a8f9c) : o.e); mt.emissiveIntensity = on ? 0.55 : o.ei;
        const trn = ghost ? true : o.t; if (mt.transparent !== trn) { mt.transparent = trn; mt.needsUpdate = true; } mt.opacity = ghost ? 0.14 : (mt === housingMat ? S.coverOpacity : o.o); mt.depthWrite = ghost ? false : o.dw;
      }
    }
    if (id) focusPart(id);
  }
  function showMonitorImage(img, wl, ww) { S.viewImg = img; S.wl = wl; S.ww = ww; monSig = ''; }

  return {
    world, axes, S, room, rotor, tilt, phantom, tableTop, registry, housingMat, monitor, wallLaser,
    update, collision, startScan, abortScan, preflight, recon, selectPart, flyTo, focusPart, sToTable, tableToS, sliceParams, showMonitorImage, scoutCanvas,
    on: (ev, f) => cbs[ev].push(f),
    marks() { // alignment of the reference marks to the three lasers (m)
      const xp = phantom.getWorldPosition(new T.Vector3()).x, yTable = axes.tableH.val, b = SECTIONS[0].ell[0][3] / 100;
      return {axial: (xp + 0.05) - XL, sagittal: S.zOff, coronal: (yTable + b) - AX_Y};
    },
    nudge(dz) { S.zOff = Math.max(-0.08, Math.min(0.08, S.zOff + dz)); applyAxes(); },
    recenter: () => ({target: new T.Vector3(0.5, 1.0, 0), cam: new T.Vector3(3.4, 2.1, -3.9)}),
    presets: {
      gantry: {target: new T.Vector3(0.2, 1.2, 0), cam: new T.Vector3(2.4, 1.7, 3.0)},
      operator: {target: new T.Vector3(0.3, 1.1, 0), cam: new T.Vector3(5.6, 1.7, 1.2)},
      side: {target: new T.Vector3(0.4, 1.2, 0), cam: new T.Vector3(0.4, 1.6, 4.4)},
      front: {target: new T.Vector3(0, 1.2, 0), cam: new T.Vector3(3.2, 1.3, 0.2)},
    },
  };
}
