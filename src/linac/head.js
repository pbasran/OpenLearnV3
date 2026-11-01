// Treatment-head collimation hardware: tungsten jaws (divergent faces), 120-leaf MLC (instanced), light field projector and beam visual.
// Built in "head frame": gantry 0, collimator 0, world metres. IEC X = +z, IEC Y = +x, source at (isoX, srcY, 0).
import * as THREE from 'three';
import {M} from '../engine/materials.js';
import {N_PAIRS, LEAF_W, LEAF_Y0} from './aperture.js';

export const SRC_TO_ISO = 1.0;

export class Head {
  constructor(aperture, {isoX, isoY}) {
    this.ap = aperture; this.isoX = isoX; this.isoY = isoY;
    this.src = new THREE.Vector3(isoX, isoY + SRC_TO_ISO, 0);
    this.group = new THREE.Group(); this.group.name = 'collimation';
    this.yMLC = 1.4025; this.hMLC = 0.0745; this.leafLen = 0.11;
    this.dMLC = this.src.y - this.yMLC;
    this.lastVersion = -1;
    this._buildJaws(); this._buildMLC(); this._buildBeam(); this._buildFieldLight(); this._buildEnvelope();
  }

  /* ---------- jaws ---------- */
  _buildJaws() {
    const mat = M.tungsten(); mat.side = THREE.DoubleSide;
    const mk = (lateral, sgn, yBot, yTop, wid, L) => {
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(36 * 3), 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(36 * 3), 3));
      const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false;
      this.group.add(mesh);
      return {mesh, lateral, sgn, yBot, yTop, wid, L};
    };
    this.jawX1 = mk('z', -1, 1.545, 1.605, 0.13, 0.075); this.jawX2 = mk('z', +1, 1.545, 1.605, 0.13, 0.075);
    this.jawY1 = mk('x', -1, 1.475, 1.525, 0.2, 0.075); this.jawY2 = mk('x', +1, 1.475, 1.525, 0.2, 0.075);
  }
  _setJaw(j, edgeCm) {
    // edgeCm: signed iso-plane position of the jaw's inner edge; block extends outward (sgn direction)
    const dT = this.src.y - j.yTop, dB = this.src.y - j.yBot;
    const iT = edgeCm * 0.01 * dT, iB = edgeCm * 0.01 * dB;
    const oT = iT + j.sgn * j.L, oB = iB + j.sgn * j.L, w = j.wid / 2;
    const V = (lat, y, wd) => (j.lateral === 'z' ? [this.isoX + wd, y, lat] : [this.isoX + lat, y, wd]);
    // 8 corners: [inner/outer][bottom/top][-w/+w]
    const c = {
      ib0: V(iB, j.yBot, -w), ib1: V(iB, j.yBot, w), it0: V(iT, j.yTop, -w), it1: V(iT, j.yTop, w),
      ob0: V(oB, j.yBot, -w), ob1: V(oB, j.yBot, w), ot0: V(oT, j.yTop, -w), ot1: V(oT, j.yTop, w),
    };
    const quads = [['ib0', 'ib1', 'it1', 'it0'], ['ob1', 'ob0', 'ot0', 'ot1'], ['it0', 'it1', 'ot1', 'ot0'], ['ib1', 'ib0', 'ob0', 'ob1'], ['ib0', 'it0', 'ot0', 'ob0'], ['ib1', 'ob1', 'ot1', 'it1']];
    const p = j.mesh.geometry.attributes.position.array; let o = 0;
    for (const q of quads) for (const k of [0, 1, 2, 0, 2, 3]) { const v = c[q[k]]; p[o++] = v[0]; p[o++] = v[1]; p[o++] = v[2]; }
    j.mesh.geometry.attributes.position.needsUpdate = true; j.mesh.geometry.computeVertexNormals();
  }

  /* ---------- MLC ---------- */
  _buildMLC() {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.leaves = new THREE.InstancedMesh(geo, M.steelBrushed(), N_PAIRS * 2); this.leaves.castShadow = true; this.leaves.receiveShadow = true; this.leaves.frustumCulled = false;
    this.group.add(this.leaves);
    // carriage / guide plates
    const frame = M.paintGrey(), xr = this.isoX, yb = this.yMLC - this.hMLC / 2 - 0.004, yt = this.yMLC + this.hMLC / 2 + 0.004;
    const plate = (sx, sy, sz, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), frame); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; this.group.add(m); };
    const span = 40 * 0.01 * this.dMLC / 2 + 0.012;
    // (no enclosing box: only two slim guide rails remain so every leaf stays visible)
    plate(span * 2 + 0.024, 0.008, 0.045, xr, yb, -0.19); plate(span * 2 + 0.024, 0.008, 0.045, xr, yb, 0.19);
  }
  _updateMLC() {
    const ap = this.ap, k = this.dMLC / SRC_TO_ISO * 0.01, m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < N_PAIRS; i++) {
      const yc = (LEAF_Y0[i] + LEAF_Y0[i + 1]) / 2, th = LEAF_W[i] * k * 0.94;
      const x = this.isoX + yc * k;
      for (const [bank, tip, sgn] of [[0, ap.a[i], -1], [1, ap.b[i], 1]]) {
        const zt = tip * k, L = this.leafLen;
        p.set(x, this.yMLC, zt + sgn * L / 2); s.set(th, this.hMLC, L); m.compose(p, q, s); this.leaves.setMatrixAt(i * 2 + bank, m);
      }
    }
    this.leaves.instanceMatrix.needsUpdate = true;
  }

  /* ---------- beam visual (not visible in real life; for teaching) ---------- */
  _buildBeam() {
    this.beamN = 0; const maxV = 400;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxV * 2 * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(maxV * 2 * 4), 4));
    geo.setIndex(new THREE.BufferAttribute(new Uint16Array(maxV * 6), 1));
    this.beamMat = new THREE.MeshBasicMaterial({vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide});
    this.beam = new THREE.Mesh(geo, this.beamMat); this.beam.frustumCulled = false; this.beam.visible = false; this.beam.renderOrder = 5;
    this.group.add(this.beam);
  }
  _updateBeam() {
    const poly = this.ap.outline(), n = poly.length, g = this.beam.geometry;
    this.beamN = n; if (n < 3) { g.setDrawRange(0, 0); return; }
    const P = g.attributes.position.array, C = g.attributes.color.array, I = g.index.array;
    const dTop = this.dMLC + 0.05, dBot = 2.0;
    for (let i = 0; i < n; i++) {
      const [X, Y] = poly[i];
      for (const [r, d] of [[0, dTop], [1, dBot]]) {
        const o = (r * n + i) * 3; P[o] = this.src.x + Y * 0.01 * d; P[o + 1] = this.src.y - d; P[o + 2] = this.src.z + X * 0.01 * d;
        const c = (r * n + i) * 4; C[c] = 0.25; C[c + 1] = 0.62; C[c + 2] = 1.0; C[c + 3] = r === 0 ? 0.22 : 0.06;
      }
    }
    let t = 0; for (let i = 0; i < n; i++) { const a = i, b = (i + 1) % n, c = n + i, d = n + ((i + 1) % n); I[t++] = a; I[t++] = b; I[t++] = c; I[t++] = b; I[t++] = d; I[t++] = c; }
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.index.needsUpdate = true; g.setDrawRange(0, n * 6);
    g.computeBoundingSphere();
  }

  /* ---------- light field (projected through a spot light's texture map -> casts real shadows on couch/phantom) ---------- */
  _buildFieldLight() {
    const c = this.fieldCanvas = document.createElement('canvas'); c.width = c.height = 512;
    this.fieldTex = new THREE.CanvasTexture(c); this.fieldTex.colorSpace = THREE.SRGBColorSpace; this.fieldTex.generateMipmaps = false; this.fieldTex.minFilter = this.fieldTex.magFilter = THREE.LinearFilter;
    const L = new THREE.SpotLight(0xfff0c8, 42, 0, Math.atan(0.30), 0, 0);
    L.position.copy(this.src); L.target.position.set(this.isoX, this.isoY, 0);
    L.castShadow = true; L.shadow.mapSize.set(1024, 1024); L.shadow.camera.near = 0.46; L.shadow.camera.far = 9; L.shadow.bias = -0.0006; L.shadow.normalBias = 0.01; L.shadow.radius = 2;
    L.map = this.fieldTex; this.light = L; this.group.add(L); this.group.add(L.target);
  }
  _drawField() {
    const c = this.fieldCanvas, g = c.getContext('2d'), S = 512 / 60; // px per cm over +-30 cm
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#000'; g.fillRect(0, 0, 512, 512);
    const poly = this.ap.outline();
    g.filter = 'blur(1.4px)';
    if (poly.length) {
      g.beginPath();
      // texture u -> IEC Y, v -> IEC X (orientation fixed by shadow-camera up vector in update()); y flips for canvas
      poly.forEach(([X, Y], i) => { const u = 256 + Y * S, v = 256 - X * S; i ? g.lineTo(u, v) : g.moveTo(u, v); });
      g.closePath(); g.fillStyle = '#fff'; g.fill();
    }
    g.filter = 'none';
    // cross-hair + 1 cm ticks (like the wires in a real light-field reticle)
    g.strokeStyle = 'rgba(30,20,0,0.85)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(256 - 12 * S, 256); g.lineTo(256 + 12 * S, 256); g.moveTo(256, 256 - 12 * S); g.lineTo(256, 256 + 12 * S); g.stroke();
    for (let t = -10; t <= 10; t++) { if (!t) continue; const s = (t % 5 ? 3 : 6); g.beginPath(); g.moveTo(256 + t * S, 256 - s); g.lineTo(256 + t * S, 256 + s); g.moveTo(256 - s, 256 + t * S); g.lineTo(256 + s, 256 + t * S); g.stroke(); }
    this.fieldTex.needsUpdate = true;
  }

  /** Call every frame. `collAxisWorld` = world direction of the collimator's IEC-Y axis (used to orient the light-field projection). */
  update(collYWorld) {
    if (this.ap.version !== this.lastVersion) {
      const j = this.ap.jaw;
      this._setJaw(this.jawX1, j.x1); this._setJaw(this.jawX2, j.x2); this._setJaw(this.jawY1, j.y1); this._setJaw(this.jawY2, j.y2);
      this._updateMLC(); this._updateBeam(); this._drawField(); this.lastVersion = this.ap.version;
    }
    if (collYWorld) this.light.shadow.camera.up.copy(collYWorld);
  }
  /** Thin transparent ring marking the real physical envelope of the collimator (jaws + MLC): the part of the head that can strike the couch or patient. */
  _buildEnvelope() {
    const R = 0.27, y0 = 1.36, y1 = 1.66;
    this.ringMat = new THREE.MeshBasicMaterial({color: 0xffb020, transparent: true, opacity: 0.10, side: THREE.DoubleSide, depthWrite: false, toneMapped: false});
    this.ringEdgeMat = new THREE.MeshBasicMaterial({color: 0xffb020, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false});
    this.ring = new THREE.Group(); this.ring.name = 'head_envelope'; this.ring.position.set(this.isoX, 0, 0);
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R, y1 - y0, 64, 1, true), this.ringMat); wall.position.y = (y0 + y1) / 2; wall.renderOrder = 6; this.ring.add(wall);
    for (const y of [y0, y1]) { const t = new THREE.Mesh(new THREE.TorusGeometry(R, 0.0025, 8, 96), this.ringEdgeMat); t.rotation.x = Math.PI / 2; t.position.y = y; t.renderOrder = 6; this.ring.add(t); }
    this.group.add(this.ring);
  }
  setEnvelope(visible, hot) { this.ring.visible = !!visible; const c = hot ? 0xff3030 : 0xffb020; this.ringMat.color.setHex(c); this.ringEdgeMat.color.setHex(c); this.ringMat.opacity = hot ? 0.28 : 0.10; }
  setBeam({visible, intensity = 1}) { this.beam.visible = !!visible; this.beamMat.opacity = intensity; }
  setFieldLight(on) { this.light.visible = on; }
}
