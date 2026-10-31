// Treatment-vault shell: floor with couch-swing markings, walls, ceiling lights, door + beam-on lamp, wall laser lines.
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {M, tex} from '../engine/materials.js';

export function buildRoom({iso, floorY, ceilY, rotRadius = 1.75}) {
  const g = new THREE.Group(); g.name = 'room';
  const W = 7.8, D = 7.0;                      // x: along gantry axis, z: lateral
  const cx = iso.x + 0.3, cz = 0;                  // +x wall stays where it was; the foot-of-couch (-x) wall is 1.2 m further back so the opened door and a withdrawn / rotated couch clear each other
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), M.floor());
  floor.rotation.x = -Math.PI / 2; floor.position.set(cx, floorY, cz); floor.receiveShadow = true; g.add(floor);

  // couch-rotation swing marking (yellow/black hatch ring) centred on the isocentre vertical axis
  const hatch = tex.hatch(); hatch.repeat.set(70, 1);
  const ring = new THREE.Mesh(new THREE.RingGeometry(rotRadius, rotRadius + 0.05, 128), new THREE.MeshStandardMaterial({map: hatch, roughness: 0.6}));
  ring.rotation.x = -Math.PI / 2; ring.position.set(iso.x, floorY + 0.002, 0); g.add(ring);

  const wallMat = M.wall();
  const wall = (w, h, x, y, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat); m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; g.add(m); return m; };
  const H = ceilY - floorY, my = floorY + H / 2;
  // -x end wall (foot of couch): solid shielded wall. Megavoltage vaults have no viewing window - the operator watches CCTV and talks over an intercom.
  const WIN = {z: 1.55};                          // (only used to place the console in the control room)
  wall(D, H, cx - W / 2, my, cz, Math.PI / 2);
  wall(D, H, cx + W / 2, my, cz, -Math.PI / 2);         // +x wall behind the stand
  wall(W, H, cx, my, cz - D / 2, 0);                    // -z wall
  const wallPos = wall(W, H, cx, my, cz + D / 2, Math.PI);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), M.ceiling()); ceil.rotation.x = Math.PI / 2; ceil.position.set(cx, ceilY, cz); g.add(ceil);

  // skirting + shielding-door on -x wall
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(W, 0.12, 0.02), new THREE.MeshStandardMaterial({color: 0x7d8a8a, roughness: 0.6}));
  for (const [x, z, ry] of [[cx, cz - D / 2 + 0.01, 0], [cx, cz + D / 2 - 0.01, 0]]) { const s = skirt.clone(); s.position.set(x, floorY + 0.06, z); s.rotation.y = ry; g.add(s); }
  const door = new THREE.Mesh(new RoundedBoxGeometry(0.28, 2.15, 1.5, 2, 0.02), M.paintGrey());
  door.position.set(cx - W / 2 + 0.16, floorY + 1.08, -1.6); door.castShadow = door.receiveShadow = true; g.add(door);
  const trefoil = new THREE.Mesh(new THREE.CircleGeometry(0.16, 3), new THREE.MeshBasicMaterial({color: 0xf5c518}));
  trefoil.rotation.y = Math.PI / 2; trefoil.rotation.z = Math.PI / 2; trefoil.position.set(cx - W / 2 + 0.305, floorY + 1.55, -1.6); g.add(trefoil);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.34), M.led(0x1a6a40));
  lamp.position.set(cx - W / 2 + 0.05, floorY + 2.35, -1.6); g.add(lamp);
  const signCv = document.createElement('canvas'); signCv.width = 512; signCv.height = 112; { const c = signCv.getContext('2d'); c.fillStyle = '#b00d0d'; c.fillRect(0, 0, 512, 112); c.strokeStyle = '#fff'; c.lineWidth = 6; c.strokeRect(5, 5, 502, 102); c.fillStyle = '#fff'; c.font = 'bold 66px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('X-RAYS ON', 256, 58); }
  const signTx = new THREE.CanvasTexture(signCv); signTx.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.153), new THREE.MeshBasicMaterial({map: signTx, toneMapped: false, side: THREE.FrontSide})); sign.rotation.y = Math.PI / 2; sign.position.set(lamp.position.x + 0.045, lamp.position.y + 0.21, lamp.position.z); sign.visible = false; g.add(sign);
  const signB = sign.clone(); signB.rotation.y = -Math.PI / 2; signB.position.x = lamp.position.x - 0.045 - 0.0; signB.visible = false; g.add(signB);  // second face so the text reads correctly from outside the wall too
  const lampLight = new THREE.PointLight(0xff3020, 0, 3, 2); lampLight.position.copy(lamp.position).add(new THREE.Vector3(0.3, 0, 0)); g.add(lampLight);

  // CCTV dome camera on the ceiling and an intercom panel beside the door (the operator's only view into the vault)
  { const dome = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI), new THREE.MeshPhysicalMaterial({color: 0x20262b, roughness: 0.15, metalness: 0.2, clearcoat: 1}));
    dome.position.set(cx - W / 2 + 0.55, ceilY - 0.02, 1.4); g.add(dome);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 20), M.paintWhite()); base.position.set(dome.position.x, ceilY - 0.015, dome.position.z); g.add(base);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), M.led(0xff2a1a)); led.position.set(dome.position.x + 0.07, ceilY - 0.03, dome.position.z); g.add(led);
    const ic = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.2, 0.12, 2, 0.008), M.plasticDark()); ic.position.set(cx - W / 2 + 0.02, floorY + 1.45, -0.55); g.add(ic);
    const grill = new THREE.Mesh(new THREE.CircleGeometry(0.035, 16), new THREE.MeshBasicMaterial({color: 0x8d979f})); grill.rotation.y = Math.PI / 2; grill.position.set(cx - W / 2 + 0.036, floorY + 1.49, -0.55); g.add(grill); }

  // recessed ceiling light panels (emissive) so the room reads as lit
  const panelMat = new THREE.MeshBasicMaterial({color: new THREE.Color(1, 1, 0.97).multiplyScalar(1.4)});
  for (const x of [cx - 1.6, cx + 1.4]) for (const z of [-1.8, 1.8]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.55), panelMat); p.rotation.x = Math.PI / 2; p.position.set(x, ceilY - 0.005, z); g.add(p);
  }

  // wall-mounted laser projectors + laser lines on walls (static, they are world-fixed)
  const redLine = new THREE.MeshBasicMaterial({color: 0xff2a1a, transparent: true, opacity: 0.95});
  const lines = new THREE.Group(); lines.name = 'wallLasers'; g.add(lines);
  const strip = (len, th) => new THREE.PlaneGeometry(len, th);
  const hz = new THREE.Mesh(strip(D - 0.1, 0.006), redLine); hz.rotation.y = Math.PI / 2; hz.position.set(cx - W / 2 + 0.003, iso.y, cz); lines.add(hz); // lateral horizontal on end wall
  const vz = new THREE.Mesh(strip(H, 0.006), redLine); vz.rotation.z = Math.PI / 2; vz.rotation.y = Math.PI / 2; vz.position.set(cx - W / 2 + 0.003, my, 0); lines.add(vz);
  for (const s of [-1, 1]) {
    const l = new THREE.Mesh(strip(W - 0.1, 0.006), redLine); l.position.set(cx, iso.y, s * (D / 2 - 0.003)); l.rotation.y = s > 0 ? Math.PI : 0; lines.add(l);
    const v = new THREE.Mesh(strip(H, 0.006), redLine); v.rotation.z = Math.PI / 2; v.position.set(iso.x, my, s * (D / 2 - 0.003)); v.rotation.y = s > 0 ? Math.PI : 0; lines.add(v);
    const box = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.12, 0.1, 2, 0.02), M.paintGrey()); box.position.set(iso.x, iso.y, s * (D / 2 - 0.05)); g.add(box); // projector heads
  }
  const sag = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.1, 0.16, 2, 0.02), M.paintGrey()); sag.position.set(cx - W / 2 + 0.06, iso.y + 0.9, 0); g.add(sag);
  const ceilProj = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.08, 0.12, 2, 0.02), M.paintGrey()); ceilProj.position.set(iso.x, ceilY - 0.04, 0); g.add(ceilProj);


  // ---- control room OUTSIDE the bunker (no window: CCTV + intercom): floor, walls, desk, monitors, keyboard, chair ----
  const xo = cx - W / 2;                    // outer face of the -x wall
  const CR = {len: 3.0, z0: 0.15, z1: D / 2};
  const crMid = (CR.z0 + CR.z1) / 2, crW = CR.z1 - CR.z0;
  const crFloor = new THREE.Mesh(new THREE.PlaneGeometry(CR.len, crW), M.floor()); crFloor.rotation.x = -Math.PI / 2; crFloor.position.set(xo - CR.len / 2, floorY, crMid); crFloor.receiveShadow = true; g.add(crFloor);
  const crWall = (w, x, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, H), wallMat); m.position.set(x, my, z); m.rotation.y = ry; m.receiveShadow = true; g.add(m); };
  crWall(crW, xo - CR.len, crMid, Math.PI / 2);                  // far wall, faces +x
  crWall(CR.len, xo - CR.len / 2, CR.z0, 0);                      // partition with the maze / door corridor, faces +z
  const crCeil = new THREE.Mesh(new THREE.PlaneGeometry(CR.len, crW), M.ceiling()); crCeil.rotation.x = Math.PI / 2; crCeil.position.set(xo - CR.len / 2, ceilY, crMid); g.add(crCeil);
  const crLight = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.4), panelMat); crLight.rotation.x = Math.PI / 2; crLight.position.set(xo - CR.len / 2, ceilY - 0.005, crMid); g.add(crLight);
  const consoleG = new THREE.Group(); consoleG.position.set(xo - 0.55, floorY, WIN.z); g.add(consoleG);
  const deskMat = new THREE.MeshPhysicalMaterial({color: 0xdfe3e6, roughness: 0.35, clearcoat: 0.5});
  const desk = new THREE.Mesh(new RoundedBoxGeometry(0.75, 0.04, 1.9, 3, 0.012), deskMat); desk.position.set(0, 0.74, 0); desk.castShadow = desk.receiveShadow = true; consoleG.add(desk);
  for (const dz of [-0.85, 0.85]) { const leg = new THREE.Mesh(new RoundedBoxGeometry(0.68, 0.72, 0.04, 2, 0.01), M.paintGrey()); leg.position.set(0, 0.36, dz); leg.castShadow = true; consoleG.add(leg); }
  const mk = (title, lines, col) => { const c = document.createElement('canvas'); c.width = 640; c.height = 400; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return {c, t, draw(tt, ls, hot) { const x = c.getContext('2d'); x.fillStyle = '#0a1018'; x.fillRect(0, 0, 640, 400); x.fillStyle = hot ? '#7a1010' : '#0f4c59'; x.fillRect(0, 0, 640, 46); x.fillStyle = '#e8f6f8'; x.font = 'bold 26px sans-serif'; x.fillText(tt, 16, 32); x.font = '24px monospace'; ls.forEach((l, i) => { x.fillStyle = l[1] || '#bfe6ea'; x.fillText(l[0], 20, 90 + i * 38); }); x.save(); x.textAlign = 'right'; x.font = 'bold 22px sans-serif'; x.fillStyle = 'rgba(120,225,235,0.85)'; x.fillText('VAIDER LAB', 626, 388); x.restore(); t.needsUpdate = true; }}; };
  const scrA = mk(), scrB = mk();
  const screen = (tex, z, ry) => { const grp = new THREE.Group(); grp.position.set(-0.1, 0.80, z); grp.rotation.y = ry;
    const body = new THREE.Mesh(new RoundedBoxGeometry(0.04, 0.34, 0.54, 2, 0.01), M.plasticDark()); body.position.set(0, 0.28, 0); body.castShadow = true; grp.add(body);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.50, 0.30), new THREE.MeshBasicMaterial({map: tex, toneMapped: false})); face.rotation.y = -Math.PI / 2; face.position.set(-0.0215, 0.28, 0); grp.add(face);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.12, 12), M.steelBrushed()); stand.position.set(0, 0.06, 0); grp.add(stand); consoleG.add(grp); };
  screen(scrA.t, -0.32, Math.PI / 2 - Math.PI / 2 + 0.0); screen(scrB.t, 0.32, 0);
  // the screens face -x, toward the operator's chair (the operator looks at the shielded wall)
  const cctv = document.createElement('canvas'); cctv.width = 512; cctv.height = 320; const cctvTx = new THREE.CanvasTexture(cctv); cctvTx.colorSpace = THREE.SRGBColorSpace;
  { const grp = new THREE.Group(); grp.position.set(-0.12, 0.80, 0.80); const body = new THREE.Mesh(new RoundedBoxGeometry(0.04, 0.26, 0.40, 2, 0.01), M.plasticDark()); body.position.set(0, 0.24, 0); grp.add(body);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.37, 0.231), new THREE.MeshBasicMaterial({map: cctvTx, toneMapped: false})); face.rotation.y = -Math.PI / 2; face.position.set(-0.0215, 0.24, 0); grp.add(face);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, 0.1, 12), M.steelBrushed()); st.position.set(0, 0.06, 0); grp.add(st); consoleG.add(grp); }
  function drawCctv(S, axes) {   // schematic live view of the vault (plan view): couch angle, gantry position, door, beam state
    const c = cctv.getContext('2d'); c.fillStyle = '#0b1210'; c.fillRect(0, 0, 512, 320); c.strokeStyle = '#2d4a40'; c.lineWidth = 2; c.strokeRect(10, 24, 492, 286);
    c.save(); c.translate(256, 170); const sc = 38;
    c.strokeStyle = '#3d6b5a'; c.setLineDash([6, 5]); c.beginPath(); c.arc(0, 0, 1.75 * sc, 0, 7); c.stroke(); c.setLineDash([]);                                      // couch swing circle
    c.save(); c.rotate(-(axes.couchRot.val * Math.PI) / 180); c.fillStyle = '#9fb7ae'; c.fillRect((-2.0 - axes.couchLng.val) * sc, -0.27 * sc, 2.1 * sc, 0.54 * sc); c.fillStyle = '#4f7f89'; c.fillRect((-0.15 - axes.couchLng.val) * sc, -0.15 * sc, 0.3 * sc, 0.3 * sc); c.restore();   // couch + phantom
    const ga = (axes.gantry.val * Math.PI) / 180, hz = Math.sin(ga) * 1.0 * sc; c.strokeStyle = S.beamOn ? '#ff5a4a' : '#7fa0b0'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, hz); c.stroke();
    c.fillStyle = '#2a343b'; c.fillRect(-0.36 * sc, hz - 0.31 * sc, 0.72 * sc, 0.62 * sc); c.strokeStyle = '#7fa0b0'; c.lineWidth = 1; c.strokeRect(-0.36 * sc, hz - 0.31 * sc, 0.72 * sc, 0.62 * sc); c.restore();
    c.fillStyle = '#9fe0c0'; c.font = '13px monospace'; c.fillText('CAM 1  VAULT', 18, 18); c.fillStyle = '#ff5a4a'; c.beginPath(); c.arc(480, 14, 5, 0, 7); c.fill(); c.fillStyle = '#9fe0c0'; c.fillText('REC', 436, 18);
    c.fillStyle = S.doorOpen ? '#ffb347' : '#7be0a0'; c.fillText('DOOR ' + (S.doorOpen ? 'OPEN' : 'CLOSED'), 18, 302); if (S.beamOn) { c.fillStyle = '#ff5a4a'; c.font = 'bold 20px sans-serif'; c.fillText('BEAM ON', 380, 302); }
    cctvTx.needsUpdate = true; }
  const kb = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.02, 0.46, 2, 0.006), M.plasticDark()); kb.position.set(-0.2, 0.77, 0); consoleG.add(kb);
  const beamBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.03, 20), M.led(0x1a6a40)); beamBtn.position.set(-0.22, 0.785, -0.62); consoleG.add(beamBtn);
  const stopBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.035, 20), M.led(0x8a1a1a)); stopBtn.position.set(-0.22, 0.787, 0.62); consoleG.add(stopBtn);
  const chair = new THREE.Group(); chair.position.set(-0.85, 0, 0); consoleG.add(chair);
  { const seat = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.07, 0.46, 3, 0.03), M.plasticDark()); seat.position.set(0, 0.5, 0); const back = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.5, 0.44, 3, 0.025), M.plasticDark()); back.position.set(-0.22, 0.78, 0);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.45, 12), M.steelBrushed()); post.position.set(0, 0.25, 0); const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.03, 5), M.steelBrushed()); base.position.set(0, 0.03, 0);
    for (const o of [seat, back, post, base]) { o.castShadow = true; chair.add(o); } }
  let lastSig = '';
  const consoleApi = {
    update(S, axes, ENERGY) {
      const sig = [S.cmdLog.length, S.beamOn, S.status, S.delivered.toFixed(0), S.mu, axes.gantry.val.toFixed(0), axes.coll.val.toFixed(0), axes.couchRot.val.toFixed(0), S.energy, S.fff, S.doorOpen].join('|'); if (sig === lastSig) return; lastSig = sig;
      scrA.draw('TREATMENT CONSOLE', [[`Status  ${S.status}`, S.beamOn ? '#ff7a6a' : '#7be0a0'], [`Energy  ${ENERGY} MV${S.fff ? ' FFF' : ''}`], [`Planned ${S.mu} MU`], [`Delivered ${S.delivered.toFixed(0)} MU`, '#ffe08a'], [`Door    ${S.doorOpen ? 'OPEN - interlock' : 'closed'}`, S.doorOpen ? '#ffb347' : '#7be0a0'], [`Gantry  ${axes.gantry.val.toFixed(1)} deg`], [`Coll    ${axes.coll.val.toFixed(1)} deg`], [`Couch   ${axes.couchRot.val.toFixed(1)} deg`]], S.beamOn);
      const lg = S.cmdLog.slice(-8).map((c, k, arr) => [`${c.t.slice(3)} ${c.text}`.slice(0, 40), c.hot ? '#ff9a8a' : (k === arr.length - 1 ? '#ffe08a' : '#bfe6ea')]);
      scrB.draw('COMMAND LOG', lg.length ? lg : [['(no instructions yet)', '#6fa3ad']], S.beamOn);
      drawCctv(S, axes);
      beamBtn.material.color.set(S.beamOn ? 0xff2a1a : 0x1a6a40); beamBtn.material.emissive.set(S.beamOn ? 0xff2a1a : 0x1a6a40);
    },
  };
  consoleApi.update({beamOn: false, status: 'READY', delivered: 0, mu: 100, energy: 6, fff: false, doorOpen: true, cmdLog: []}, {gantry: {val: 0}, coll: {val: 0}, couchRot: {val: 0}, couchLng: {val: 0}}, 6);
  return {
    group: g, W, D, cx, cz, lampLight, console: consoleApi, consoleGroup: consoleG,
    flashSign(on, tms) { sign.visible = signB.visible = on && (Math.floor(tms / 350) % 2 === 0); },
    setBeamOn(on) { lamp.material.color.set(on ? 0xff2a1a : 0x1a6a40); lamp.material.emissive.set(on ? 0xff2a1a : 0x1a6a40); lampLight.intensity = on ? 3 : 0; },
    setDoor(open) { door.position.z = open ? -0.4 : -1.6; },
    wallLasers: lines,
  };
}

/** Rounded cover shell helper with shared translucent material support. */
export function coverBox(w, h, d, r, mat, pos) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 5, r), mat);
  m.position.copy(pos); m.castShadow = m.receiveShadow = true; return m;
}
