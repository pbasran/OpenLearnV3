// Educational photon dose model for a water phantom (NOT a clinical dose calculation).
// Central-axis: build-up + exponential attenuation x inverse-square. Off-axis: aperture fluence blurred by a depth-dependent
// penumbra x flattening-filter horn/peak shape. Everything is evaluated in the same head/phantom frames the 3D scene uses.
import * as THREE from 'three';
import {GRID, PX, blur} from './aperture.js';

export const ENERGIES = {
  6: {label: '6 MV', dmax: 1.5, mu: 0.0275, s0: 0.5, rate: 600, fffRate: 1400, tpr: '0.67'},
  10: {label: '10 MV', dmax: 2.4, mu: 0.0225, s0: 0.35, rate: 600, fffRate: 2400, tpr: '0.73'},
  15: {label: '15 MV', dmax: 2.9, mu: 0.018, s0: 0.25, rate: 600, fffRate: 600, tpr: '0.76'},
};
const SIGMAS = [0.2, 0.35, 0.55, 0.8, 1.2];
const sigmaAt = (d) => 0.22 + 0.026 * Math.max(d, 0); // cm: penumbra widens with depth (scatter) -> ~0.5 cm @ 10 cm.

export function pddCAX(E, d, ssd, fff = false) {
  const e = ENERGIES[E], mu = e.mu * (fff ? 1.07 : 1), dm = e.dmax;
  const B = d < dm ? e.s0 + (1 - e.s0) * (1 - (1 - d / dm) ** 2) : Math.exp(-mu * (d - dm));
  return B * ((100 + dm) / (ssd + d)) ** 2;
}
export const outputFactor = (eq) => Math.min(1.15, Math.max(0.85, 1 + 0.0072 * (eq - 10)));
export function oar(r, d, fff, E) {
  if (fff) return 1 / (1 + 0.0021 * r * r * (1 + d / 60));
  const horn = 0.035 * Math.max(0, 1 - d / (E == 15 ? 18 : 12)); // slight horns near surface, flat at depth
  return 1 + horn * (r / 20) ** 2 * 4 - 0.0000 * r;
}

export class DoseEngine {
  constructor() {
    this.maps = SIGMAS.map(() => new Float32Array(GRID * GRID));
    this.version = -1; this.eq = 10; this.E = 6; this.fff = false;
    this._v = new THREE.Vector3(); this._w = new THREE.Vector3();
  }
  update(ap) {
    if (this.version === ap.version) return false;
    const f = ap.computeFluence(); SIGMAS.forEach((s, i) => blur(f, s, this.maps[i]));
    this.eq = Math.max(ap.stats().eq, 1); this.version = ap.version; return true;
  }
  sample(X, Y, sigma) {
    const gx = (X + 20) / PX - 0.5, gy = (Y + 20) / PX - 0.5;
    if (gx < 0 || gy < 0 || gx > GRID - 1 || gy > GRID - 1) return 0.003 * 0 + 0.0015;
    let si = 0; while (si < SIGMAS.length - 2 && sigma > SIGMAS[si + 1]) si++;
    const t = Math.min(1, Math.max(0, (sigma - SIGMAS[si]) / (SIGMAS[si + 1] - SIGMAS[si])));
    const x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
    const at = (m, x, y) => m[Math.min(GRID - 1, y) * GRID + Math.min(GRID - 1, x)];
    const bil = (m) => at(m, x0, y0) * (1 - fx) * (1 - fy) + at(m, x0 + 1, y0) * fx * (1 - fy) + at(m, x0, y0 + 1) * (1 - fx) * fy + at(m, x0 + 1, y0 + 1) * fx * fy;
    return bil(this.maps[si]) * (1 - t) + bil(this.maps[si + 1]) * t;
  }
  /**
   * ctx = {headInv: Matrix4 (world->head-local), phInv: Matrix4 (world->phantom-local), half: Vector3 (phantom half-size, m),
   *        srcHead: Vector3 (source in head-local), srcPh: Vector3 (source in phantom-local)}
   * Returns dose per MU (cGy/MU, 1.0 = dmax of 10x10 @ SSD 100) at world point Pw, or -1 if outside phantom.
   */
  point(ctx, Pw, out = {}) {
    const P = this._v.copy(Pw).applyMatrix4(ctx.phInv), h = ctx.half;
    if (Math.abs(P.x) > h.x || Math.abs(P.y) > h.y || Math.abs(P.z) > h.z) return -1;
    const S = ctx.srcPh, d = this._w.copy(P).sub(S), len = d.length();
    // ray S -> P : entry parameter into the phantom box (slab method)
    let t0 = 0;
    for (const ax of ['x', 'y', 'z']) {
      const dv = d[ax]; if (Math.abs(dv) < 1e-9) continue;
      const a = (-h[ax] - S[ax]) / dv, b = (h[ax] - S[ax]) / dv; t0 = Math.max(t0, Math.min(a, b));
    }
    if (t0 >= 1) return -1;
    const depth = (1 - t0) * len * 100, ssd = t0 * len * 100;
    const Ph = this._v.copy(Pw).applyMatrix4(ctx.headInv), s = ctx.srcHead, w = s.y - Ph.y;
    if (w < 0.05) return -1;
    const X = ((Ph.z - s.z) / w) * 100, Y = ((Ph.x - s.x) / w) * 100;
    const F = this.sample(X, Y, sigmaAt(depth));
    const val = pddCAX(this.E, depth, ssd, this.fff) * outputFactor(this.eq) * F * oar(Math.hypot(X, Y), depth, this.fff, this.E);
    out.depth = depth; out.ssd = ssd; out.X = X; out.Y = Y;
    return val;
  }
}

/** Isodose colour map: value 0..1.2 -> [r,g,b]. */
export function doseColor(v) {
  const stops = [[0, [20, 20, 90]], [0.1, [30, 60, 200]], [0.3, [20, 170, 210]], [0.5, [40, 190, 90]], [0.7, [190, 220, 40]], [0.9, [250, 160, 30]], [1.0, [235, 60, 40]], [1.1, [150, 20, 90]]];
  v = Math.max(0, Math.min(1.1, v));
  for (let i = 1; i < stops.length; i++) if (v <= stops[i][0]) {
    const [a, ca] = stops[i - 1], [b, cb] = stops[i], t = (v - a) / (b - a);
    return ca.map((c, k) => c + (cb[k] - c) * t);
  }
  return stops[stops.length - 1][1];
}
