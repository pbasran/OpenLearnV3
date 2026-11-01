// Collimation model: 60-pair MLC (Millennium-like leaf widths) + four jaws, all expressed in IEC cm at the isocentre plane.
// IEC X = leaf travel / cross-plane, IEC Y = leaf stacking / in-plane (positive towards the gantry stand).

export const SAD = 100; // cm
export const N_PAIRS = 60;
export const LEAF_W = [...Array(10).fill(1.0), ...Array(40).fill(0.5), ...Array(10).fill(1.0)];
export const LEAF_Y0 = (() => { const a = [-20]; for (const w of LEAF_W) a.push(a[a.length - 1] + w); return a; })(); // 61 edges, -20..+20
/** Leaf row index containing IEC-Y position y (cm). */
export function rowOf(y) {
  if (y < -10) return Math.min(9, Math.max(0, Math.floor(y + 20)));
  if (y < 10) return 10 + Math.min(39, Math.floor((y + 10) / 0.5));
  return Math.min(N_PAIRS - 1, 50 + Math.floor(y - 10));
}
export const GRID = 160;          // fluence grid resolution over +-20 cm
export const PX = 40 / GRID;       // 0.25 cm
export const LIMITS = {leaf: [-20, 20], jawX: [-20, 20], jawY: [-20, 20], minGap: 0.0};

export class Aperture {
  constructor() {
    this.a = new Float32Array(N_PAIRS); // bank A (X1, negative side) tip positions
    this.b = new Float32Array(N_PAIRS); // bank B (X2, positive side) tip positions
    this.jaw = {x1: -5, x2: 5, y1: -5, y2: 5};
    this.version = 0;
    this.fluence = new Float32Array(GRID * GRID);
    this.setRect(10, 10);
  }
  /** Conformal rectangular field: jaws at the field edge, MLC parked just outside (like a real open field). */
  setRect(w, l, cx = 0, cy = 0, mlcMargin = 0.5) {
    this.jaw = {x1: cx - w / 2, x2: cx + w / 2, y1: cy - l / 2, y2: cy + l / 2};
    for (let i = 0; i < N_PAIRS; i++) { this.a[i] = this.jaw.x1 - mlcMargin; this.b[i] = this.jaw.x2 + mlcMargin; }
    this.clamp(); this.version++;
  }
  /** Independent (asymmetric) jaws: x1/y1 are the negative-side jaws, x2/y2 the positive-side jaws (IEC cm at isocentre). MLC parks just outside the jaws. */
  setJaws(x1, x2, y1, y2, mlcMargin = 0.5) {
    this.jaw = {x1, x2, y1, y2};
    this.clamp();
    for (let i = 0; i < N_PAIRS; i++) { this.a[i] = this.jaw.x1 - mlcMargin; this.b[i] = this.jaw.x2 + mlcMargin; }
    this.clamp(); this.version++;
  }
  clamp() {
    const j = this.jaw, [lo, hi] = LIMITS.jawX;
    j.x1 = Math.max(lo, Math.min(j.x1, hi)); j.x2 = Math.max(j.x1 + 0.2, Math.min(j.x2, hi));
    j.y1 = Math.max(lo, Math.min(j.y1, hi)); j.y2 = Math.max(j.y1 + 0.2, Math.min(j.y2, hi));
    for (let i = 0; i < N_PAIRS; i++) {
      this.a[i] = Math.max(LIMITS.leaf[0], Math.min(this.a[i], LIMITS.leaf[1]));
      this.b[i] = Math.max(LIMITS.leaf[0], Math.min(this.b[i], LIMITS.leaf[1]));
      if (this.b[i] < this.a[i]) { const m = (this.a[i] + this.b[i]) / 2; this.a[i] = this.b[i] = m; }
    }
  }
  /** Named conformal shapes for teaching: circle (SRS-like), L-shape, "tumour + avoidance" blob. */
  shape(kind) {
    const c = {x: 0, y: 0};
    if (kind === 'rect') return this.setRect(10, 10);
    if (kind === 'circle' || kind === 'ellipse') {
      const rx = 4, ry = kind === 'circle' ? 4 : 6; this.jaw = {x1: -rx - 0.5, x2: rx + 0.5, y1: -ry - 0.5, y2: ry + 0.5};
      for (let i = 0; i < N_PAIRS; i++) {
        const yc = (LEAF_Y0[i] + LEAF_Y0[i + 1]) / 2, t = 1 - (yc / ry) ** 2;
        if (t > 0) { const h = rx * Math.sqrt(t); this.a[i] = c.x - h; this.b[i] = c.x + h; } else { this.a[i] = -0.3; this.b[i] = -0.3; }
      }
    } else if (kind === 'lshape') {
      this.jaw = {x1: -6, x2: 6, y1: -6, y2: 6};
      for (let i = 0; i < N_PAIRS; i++) { const yc = (LEAF_Y0[i] + LEAF_Y0[i + 1]) / 2; this.a[i] = -6; this.b[i] = yc < 0 ? 6 : -1; }
    } else if (kind === 'blob') {
      this.jaw = {x1: -7, x2: 7, y1: -7.5, y2: 7.5};
      for (let i = 0; i < N_PAIRS; i++) {
        const yc = (LEAF_Y0[i] + LEAF_Y0[i + 1]) / 2;
        const l = -5.5 + 1.2 * Math.sin(yc * 0.9) - 0.12 * yc, r = 5 + 1.5 * Math.cos(yc * 0.7) + 0.1 * yc;
        const t = 1 - (yc / 7.5) ** 2; if (t > 0) { this.a[i] = l * Math.sqrt(t); this.b[i] = r * Math.sqrt(t); } else { this.a[i] = this.b[i] = 0; }
      }
    }
    this.clamp(); this.version++;
  }
  /** Rows currently open: returns [{y0,y1,x0,x1}] in cm at isocentre (jaw-clipped). */
  rows() {
    const j = this.jaw, out = [];
    for (let i = 0; i < N_PAIRS; i++) {
      const y0 = Math.max(LEAF_Y0[i], j.y1), y1 = Math.min(LEAF_Y0[i + 1], j.y2);
      if (y1 <= y0 + 1e-6) continue;
      const x0 = Math.max(this.a[i], j.x1), x1 = Math.min(this.b[i], j.x2);
      if (x1 > x0 + 1e-6) out.push({i, y0, y1, x0, x1});
    }
    return out;
  }
  /** Boundary polygon of the open aperture (cm, iso plane). Rows merge into one simple outline when contiguous. */
  outline() {
    const rows = this.rows(); if (!rows.length) return [];
    const left = [], right = [];
    for (const r of rows) { left.push([r.x0, r.y0], [r.x0, r.y1]); right.push([r.x1, r.y0], [r.x1, r.y1]); }
    return [...left, ...right.reverse()];
  }
  stats() {
    const rows = this.rows(); let area = 0, per = 0, prev = null;
    for (const r of rows) {
      area += (r.x1 - r.x0) * (r.y1 - r.y0);
      per += 2 * (r.y1 - r.y0);
      per += prev ? Math.abs(r.x0 - prev.x0) + Math.abs(r.x1 - prev.x1) : (r.x1 - r.x0) * 2;
      prev = r;
    }
    if (prev) per += (prev.x1 - prev.x0);
    const eq = per > 0 ? (4 * area) / per : 0;
    const fx = Math.max(...rows.map((r) => r.x1), -99) - Math.min(...rows.map((r) => r.x0), 99);
    const fy = rows.length ? rows[rows.length - 1].y1 - rows[0].y0 : 0;
    return {area, eq, fx: rows.length ? fx : 0, fy};
  }
  /** Fluence on the 160x160 iso-plane grid (index = iy*GRID+ix; x,y from -20..20 cm) incl. leaf/jaw transmission. */
  computeFluence() {
    const F = this.fluence, j = this.jaw, Tm = 0.015, Tj = 0.003, h = PX / 2;
    const cov = (lo, hi, c) => Math.max(0, Math.min(1, (Math.min(hi, c + h) - Math.max(lo, c - h)) / PX));
    for (let iy = 0; iy < GRID; iy++) {
      const y = -20 + (iy + 0.5) * PX;
      const row = rowOf(y);
      const cy = cov(j.y1, j.y2, y), a = this.a[row], b = this.b[row];
      for (let ix = 0; ix < GRID; ix++) {
        const x = -20 + (ix + 0.5) * PX;
        const cj = cy * cov(j.x1, j.x2, x), cl = cov(a, b, x);
        F[iy * GRID + ix] = cj * (cl + (1 - cl) * Tm) + (1 - cj) * Tj;
      }
    }
    return F;
  }
}

/** Separable Gaussian blur of a GRIDxGRID field (sigma in cm). */
export function blur(src, sigmaCm, out = new Float32Array(src.length)) {
  const s = Math.max(sigmaCm / PX, 0.01), R = Math.ceil(s * 3), K = [];
  let sum = 0; for (let i = -R; i <= R; i++) { const v = Math.exp(-(i * i) / (2 * s * s)); K.push(v); sum += v; }
  for (let i = 0; i < K.length; i++) K[i] /= sum;
  const tmp = new Float32Array(src.length);
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    let a = 0; for (let k = -R; k <= R; k++) { const xx = Math.min(GRID - 1, Math.max(0, x + k)); a += src[y * GRID + xx] * K[k + R]; }
    tmp[y * GRID + x] = a;
  }
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    let a = 0; for (let k = -R; k <= R; k++) { const yy = Math.min(GRID - 1, Math.max(0, y + k)); a += tmp[yy * GRID + x] * K[k + R]; }
    out[y * GRID + x] = a;
  }
  return out;
}
