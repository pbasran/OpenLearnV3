// Treatment couch (carbon-fibre top on a telescoping pedestal), water phantom with skin marks, and room-laser lines projected on surfaces.
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {M} from '../engine/materials.js';
import {addIndexTop} from '../engine/indextop.js';

export const PH = {size: 0.30};            // water phantom edge (m)
export class Couch {
  constructor({isoX, isoY, floorY}) {
    this.isoX = isoX; this.isoY = isoY; this.floorY = floorY;
    this.root = new THREE.Group(); this.root.position.set(isoX, 0, 0); this.root.name = 'couch';
    const shell = M.paintWhite(), grey = M.paintGrey();
    const add = (geo, mat, x, y, z, parent = this.root) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
    // pedestal
    add(new RoundedBoxGeometry(0.95, 0.13, 0.75, 3, 0.03), grey, -1.72, floorY + 0.065, 0);
    // accordion (bellows) lift column: pleats stack between the base and the carriage, compress flat when the couch is lowered and open up when it rises
    this.pleats = []; { const pg = new RoundedBoxGeometry(1, 1, 1, 2, 0.12), dark = M.rubber(), ribbed = M.paintGrey();
      for (let k = 0; k < 14; k++) { const m = new THREE.Mesh(pg, k % 2 ? dark : ribbed); m.castShadow = m.receiveShadow = true; m.userData.k = k; m.position.set(-1.72, floorY + 0.2, 0); this.root.add(m); this.pleats.push(m); } }
    this.baseTop = floorY + 0.13;
    add(new RoundedBoxGeometry(0.56, 0.04, 0.48, 3, 0.012), M.steelBrushed(), -1.72, floorY + 0.15, 0);   // fixed collar the bellows sits on
    this.carriage = add(new RoundedBoxGeometry(1.05, 0.15, 0.5, 4, 0.04), shell, -1.55, 0, 0);
    // sliding top
    this.top = new THREE.Group(); this.root.add(this.top);
    this.slab = add(new RoundedBoxGeometry(2.1, 0.05, 0.53, 4, 0.02), M.couchTop(), -0.9, -0.025, 0, this.top);
    this.index = addIndexTop(this.top, {len: 2.08, wid: 0.5, headX: 0.14, dir: -1, topY: 0, th: 0.05});   // same indexed flat top as the CT couch
    add(new THREE.BoxGeometry(0.02, 0.012, 0.5), M.rubber(), 0.14, -0.004, 0, this.top);
    // phantom (centred above top surface); local x/z relative to the couch top reference point
    this.phantom = new THREE.Group(); this.top.add(this.phantom);
    const S = PH.size;
    const tank = new THREE.Mesh(new RoundedBoxGeometry(S, S, S, 3, 0.004), M.acrylic()); tank.renderOrder = 1; tank.position.y = S / 2; this.phantom.add(tank);
    const water = new THREE.Mesh(new THREE.BoxGeometry(S - 0.014, S - 0.014, S - 0.014), M.water()); water.renderOrder = 1; water.position.y = S / 2; this.phantom.add(water);
    this.water = water;
    // marks: top-centre cross, side crosses at the "isocentre" level (10 cm depth), BB inside
    const markMat = new THREE.MeshBasicMaterial({color: 0x101010});
    const cross = (len, w) => { const g = new THREE.Group(); for (const r of [0, Math.PI / 2]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(len, w), markMat); m.rotation.z = r; g.add(m); } return g; };
    const tc = cross(0.04, 0.0015); tc.rotation.x = -Math.PI / 2; tc.position.set(0, S + 0.0006, 0); this.phantom.add(tc);
    for (const sgn of [-1, 1]) { const c = cross(0.04, 0.0015); c.position.set(0, S - 0.10, sgn * (S / 2 + 0.0006)); if (sgn < 0) c.rotation.y = Math.PI; this.phantom.add(c); }
    const c3 = cross(0.04, 0.0015); c3.rotation.y = Math.PI / 2; c3.position.set(S / 2 + 0.0006, S - 0.10, 0); this.phantom.add(c3);
    this.bb = new THREE.Mesh(new THREE.SphereGeometry(0.007, 20, 14), M.steel()); this.bb.position.set(0, S - 0.10, 0); this.bb.castShadow = true; this.phantom.add(this.bb);
    // laser ribbons
    const g = new THREE.BufferGeometry(); const N = 40; g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 4 * 3), 3));
    g.setIndex(new THREE.BufferAttribute(new Uint16Array(N * 6), 1)); this.laserGeo = g; this.laserN = N;
    const lm = new THREE.MeshBasicMaterial({color: 0xff2a14, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2});
    this.lasers = new THREE.Mesh(g, lm); this.lasers.frustumCulled = false; this.lasers.renderOrder = 3;
    // state
    this.state = {lat: 0, lng: 0, H: isoY - 0.2, rot: 0};
    this.setup = {x: 0.03, z: -0.02};       // initial (deliberate) skin-mark set-up error, metres
    this.bbErr = {x: 0.004, y: -0.003, z: 0.002}; // hidden marker offset (unused now that there is no on-board imaging)
    this.apply();
  }
  placePhantom(errX, errZ) { this.setup = {x: errX, z: errZ}; this.apply(); }
  apply() {
    const s = this.state, S = PH.size;
    this.root.rotation.y = THREE.MathUtils.degToRad(s.rot);
    this.top.position.set(-s.lng, s.H, s.lat);
    // reference: phantom centre sits at iso-axis (x_local 0) at lng=0 plus setup error
    this.phantom.position.set(this.setup.x, 0, this.setup.z);
    this.bb.position.set(this.bbErr.x, S - 0.10 + this.bbErr.y, this.bbErr.z);
    const yu = s.H - 0.05;
    this.carriage.position.y = yu - 0.075;
    const bot = this.baseTop + 0.04, topY = yu - 0.15, len = Math.max(0.01, topY - bot), N = this.pleats.length, ph = len / N;
    this.pleats.forEach((m, k) => { const wide = k % 2 === 0; m.scale.set(wide ? 0.5 : 0.42, Math.max(0.004, ph * 1.15), wide ? 0.42 : 0.35); m.position.y = bot + (k + 0.5) * ph; });
  }
  set(k, v) { this.state[k] = v; this.apply(); }
  /** Couch-frame boxes used for collision checks (couch-root local coordinates). */
  boxes() {
    const s = this.state, S = PH.size;
    return {
      top: new THREE.Box3(new THREE.Vector3(-2.0 - s.lng, s.H - 0.05, s.lat - 0.27), new THREE.Vector3(0.16 - s.lng, s.H, s.lat + 0.27)),
      phantom: new THREE.Box3(new THREE.Vector3(-S / 2 + this.setup.x - s.lng, s.H, s.lat - S / 2 + this.setup.z), new THREE.Vector3(S / 2 + this.setup.x - s.lng, s.H + S, s.lat + S / 2 + this.setup.z)),
    };
  }
  _inv() { return this.frame ? this.frame.matrixWorld.clone().invert() : new THREE.Matrix4(); }
  /** Phantom reference marks in world coordinates: top-cross and side-cross (isocentre level). */
  marks() {
    this.root.updateMatrixWorld(true); const S = PH.size;
    const inv = this._inv();
    const top = new THREE.Vector3(0, S, 0).applyMatrix4(this.phantom.matrixWorld).applyMatrix4(inv);
    const iso = new THREE.Vector3(0, S - 0.10, 0).applyMatrix4(this.phantom.matrixWorld).applyMatrix4(inv);
    const bb = this.bb.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
    return {top, iso, bb};
  }
  /** Update laser ribbons: intersection of world-fixed laser planes with the phantom box and couch top. */
  updateLasers(on) {
    this.lasers.visible = on; if (!on) return;
    this.root.updateMatrixWorld(true);
    const planes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.isoY), new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), new THREE.Plane(new THREE.Vector3(1, 0, 0), -this.isoX)];
    const inv = this._inv(), mul = (m) => new THREE.Matrix4().multiplyMatrices(inv, m);
    const boxes = [{m: mul(this.phantom.matrixWorld), h: new THREE.Vector3(PH.size / 2, PH.size / 2, PH.size / 2), c: new THREE.Vector3(0, PH.size / 2, 0)},
      {m: mul(this.top.matrixWorld), h: new THREE.Vector3(1.05, 0.025, 0.265), c: new THREE.Vector3(-0.9, -0.025, 0)}];
    const pos = this.laserGeo.attributes.position.array, idx = this.laserGeo.index.array; let n = 0;
    const faces = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
    const w = 0.0016, a = new THREE.Vector3(), b = new THREE.Vector3(), nrm = new THREE.Vector3(), dir = new THREE.Vector3(), side = new THREE.Vector3();
    for (const bx of boxes) for (const pl of planes) for (const f of faces) {
      if (bx === boxes[1] && f[1] !== 1) continue; // couch: top surface only
      // face quad corners (local), then clip against plane in world
      const n3 = new THREE.Vector3(...f), u = new THREE.Vector3(f[1] ? 1 : 0, f[0] || f[2] ? 0 : 0, 0);
      const t1 = f[0] ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0), t2 = new THREE.Vector3().crossVectors(n3, t1);
      const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => new THREE.Vector3().copy(bx.c).addScaledVector(n3, Math.abs(f[0]) * bx.h.x + Math.abs(f[1]) * bx.h.y + Math.abs(f[2]) * bx.h.z)
        .addScaledVector(t1, i * (Math.abs(t1.x) * bx.h.x + Math.abs(t1.y) * bx.h.y + Math.abs(t1.z) * bx.h.z)).addScaledVector(t2, j * (Math.abs(t2.x) * bx.h.x + Math.abs(t2.y) * bx.h.y + Math.abs(t2.z) * bx.h.z)).applyMatrix4(bx.m));
      const d = cs.map((c) => pl.distanceToPoint(c)), hits = [];
      for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; if ((d[i] > 0) !== (d[j] > 0)) { const t = d[i] / (d[i] - d[j]); hits.push(new THREE.Vector3().lerpVectors(cs[i], cs[j], t)); } }
      if (hits.length !== 2 || n >= this.laserN) continue;
      nrm.copy(n3).transformDirection(bx.m); dir.subVectors(hits[1], hits[0]).normalize(); side.crossVectors(nrm, dir).normalize().multiplyScalar(w);
      a.copy(hits[0]).addScaledVector(nrm, 0.0008); b.copy(hits[1]).addScaledVector(nrm, 0.0008);
      const o = n * 12; const q = [a.clone().sub(side), a.clone().add(side), b.clone().add(side), b.clone().sub(side)];
      q.forEach((v, k) => { pos[o + k * 3] = v.x; pos[o + k * 3 + 1] = v.y; pos[o + k * 3 + 2] = v.z; });
      const io = n * 6, vo = n * 4; idx.set([vo, vo + 1, vo + 2, vo, vo + 2, vo + 3], io); n++;
    }
    this.laserGeo.setDrawRange(0, n * 6); this.laserGeo.attributes.position.needsUpdate = true; this.laserGeo.index.needsUpdate = true;
  }
}
