// Educational CT image physics: analytic phantom -> sinogram (with Poisson-like noise) -> filtered back-projection.
// Lengths in cm, attenuation in 1/cm. Not a clinical simulator; designed so the controls behave the right way
// (kVp changes contrast & noise, mAs / pitch / slice thickness change noise, kernel trades noise for sharpness, FOV changes pixel size).

export const KVP = {
  80: {mu: 0.208, dosePer100: 4.6},
  100: {mu: 0.194, dosePer100: 9.8},
  120: {mu: 0.184, dosePer100: 16.0},
  140: {mu: 0.176, dosePer100: 23.5},
};

/** Phantom sections along the patient axis (s in cm from the head end). Ellipses: [cx, cy, rx, ry, HU] (later ones overwrite earlier). */
const ring = (r, n, size, hus) => hus.map((hu, i) => { const a = (i / n) * Math.PI * 2 - Math.PI / 2; return [Math.cos(a) * r, Math.sin(a) * r, size, size, hu, true]; });
export const SECTIONS = [
  {name: 'Module A · HU linearity', s0: 0, s1: 10, note: 'Water body with seven material inserts (air, PMP, LDPE, polystyrene, acrylic, Delrin, Teflon).',
    ell: [[0, 0, 10, 10, 0], ...ring(5.2, 7, 0.9, [-1000, -200, -100, -35, 120, 340, 990])]},
  {name: 'Module B · Uniformity & noise', s0: 10, s1: 20, note: 'Uniform water cylinder, plus a small low-contrast 1 cm rod (+12 HU) near the top.',
    ell: [[0, 0, 10, 10, 0], [0, 4.4, 0.5, 0.5, 12, true]]},
  {name: 'Module C · Thorax', s0: 20, s1: 34, note: 'Elliptical soft-tissue body, lungs, spine, aorta (contrast), and a 10 mm lung nodule.',
    ell: [[0, 0, 15, 10.5, 40], [-7, 0.4, 5.6, 6.6, -820], [7, 0.4, 5.6, 6.6, -820], [0, -6.2, 2.1, 2.1, 330], [0, -6.2, 1.0, 1.0, 140],
      [0, -2.4, 2.1, 2.1, 140], [0, 1.0, 1.6, 2.2, 55], [-9.4, 2.2, 0.5, 0.5, 15, true], [-9.6, -0.8, 0.8, 0.8, 330, true], [9.6, -0.8, 0.8, 0.8, 330, true]]},
];
export const PHANTOM_LEN = 34;
export const sectionAt = (s) => SECTIONS.find((x) => s >= x.s0 && s < x.s1) || SECTIONS[SECTIONS.length - 1];

const hard = (hu, kvp) => (hu > 100 ? hu * (1 + 0.18 * ((120 - kvp) / 40)) : hu);   // bone-like materials gain HU at low kVp
const muOf = (hu, kvp) => Math.max(0, KVP[kvp].mu * (1 + hard(hu, kvp) / 1000));

/** list of {cx, cy, a, b, mu} with differential mu so overlaps add (overwrite -> delta). Offsets move the phantom in the scan plane (cm). */
function buildEllipses(sec, kvp, dx, dy, table) {
  const out = []; let order = [];
  // painter's algorithm using differential attenuation: each ellipse adds (mu_i - mu_parent)
  for (let i = 0; i < sec.ell.length; i++) {
    const [cx, cy, a, b, hu] = sec.ell[i]; let parent = 0;
    for (let j = i - 1; j >= 0; j--) {
      const [pcx, pcy, pa, pb, phu] = sec.ell[j];
      if (((cx - pcx) / pa) ** 2 + ((cy - pcy) / pb) ** 2 <= 1) { parent = phu; break; }
    }
    order.push({cx: cx + dx, cy: cy + dy, a, b, d: muOf(hu, kvp) - (i === 0 ? 0 : muOf(parent, kvp))});
  }
  out.push(...order);
  if (table) out.push({cx: table.cx, cy: table.cy, a: table.a, b: table.b, d: KVP[kvp].mu * 0.45});   // carbon-fibre table top ~ +(-550 HU) equivalent
  return out;
}

function sinogram(ell, nViews, nDet, detSpacing) {
  const sino = new Float32Array(nViews * nDet);
  for (let v = 0; v < nViews; v++) {
    const th = (v / nViews) * Math.PI, c = Math.cos(th), s = Math.sin(th), nx = -s, ny = c;   // ray dir (c,s), normal (nx,ny)
    for (const e of ell) {
      const A2 = (e.a * nx) ** 2 + (e.b * ny) ** 2, off = e.cx * nx + e.cy * ny, A = Math.sqrt(A2), k = (2 * e.a * e.b) / A2;
      const i0 = Math.max(0, Math.floor((off - A) / detSpacing + nDet / 2)), i1 = Math.min(nDet - 1, Math.ceil((off + A) / detSpacing + nDet / 2));
      for (let i = i0; i <= i1; i++) { const t = (i - nDet / 2 + 0.5) * detSpacing - off, q = A2 - t * t; if (q > 0) sino[v * nDet + i] += e.d * k * Math.sqrt(q); }
    }
  }
  return sino;
}

// seeded gaussian noise so the same scan gives the same image (repeatable teaching)
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()); }

const KERNELS = {soft: {cut: 0.55, name: 'Soft (B30)'}, standard: {cut: 0.8, name: 'Standard (B40)'}, sharp: {cut: 1.0, name: 'Sharp (B70)'}};
export const KERNEL_NAMES = KERNELS;

/**
 * Reconstruct one axial image. Returns {hu:Float32Array(n*n), n, fov, noiseSD(measured in water if possible)}.
 * p: {section, sPos, kvp, mAs, pitch, thick(mm), kernel, fov(cm), dx, dy (cm, phantom offset from iso), tableOffsetY(cm), seed}
 */
export function reconstruct(p, n = 192) {
  const sec = p.section, kvp = p.kvp, nViews = 360, nDet = 320, FOVd = 50, ds = FOVd / nDet;
  const table = {cx: p.tableCx ?? 0, cy: p.tableCy ?? -12, a: 22, b: 0.9};
  const ell = buildEllipses(sec, kvp, p.dx || 0, p.dy || 0, table);
  const sino = sinogram(ell, nViews, nDet, ds);
  // photon statistics: N0 per detector reading
  const N0 = 7.0e4 * (p.mAs / p.pitch / 100) * (kvp / 120) ** 2.2 * (p.thick / 5) * (ds / 0.156);
  const r = rng(p.seed || 7);
  const bowtie = (i) => 1 + 2.2 * (((i - nDet / 2) / (nDet / 2)) ** 2);                   // bow-tie filter lowers edge flux (raises noise at the edges)
  for (let v = 0; v < nViews; v++) for (let i = 0; i < nDet; i++) {
    const k = v * nDet + i, pr = sino[k] + 0.018 * Math.max(0, 1 - Math.abs(i - nDet / 2) / (nDet / 2));
    const N = (N0 / bowtie(i)) * Math.exp(-pr);                                           // expected detected photons
    const nn = Math.max(1, N + Math.sqrt(N) * gauss(r));                                  // Poisson ≈ Gaussian
    sino[k] = -Math.log(nn / (N0 / bowtie(i)));
  }
  // ramp filter (spatial domain, Ram-Lak with Hamming-like window controlled by kernel)
  const K = KERNELS[p.kernel] || KERNELS.standard, L = 63, h = new Float32Array(2 * L + 1);
  for (let m = -L; m <= L; m++) { let v; if (m === 0) v = 1 / (4 * ds * ds); else if (m % 2 === 0) v = 0; else v = -1 / (Math.PI * Math.PI * m * m * ds * ds); h[m + L] = v; }
  // smooth for kernel cut-off: convolve ramp with gaussian of width inversely related to cut
  const sg = (1.0 - K.cut) * 3.2 + 0.12, ge = []; for (let m = -4; m <= 4; m++) ge.push(Math.exp(-(m * m) / (2 * sg * sg))); const gs = ge.reduce((a, b) => a + b, 0);
  const hs = new Float32Array(h.length); for (let i = 0; i < h.length; i++) { let a = 0; for (let m = -4; m <= 4; m++) { const j = i + m; if (j >= 0 && j < h.length) a += h[j] * (ge[m + 4] / gs); } hs[i] = a; }
  const flt = new Float32Array(nViews * nDet);
  for (let v = 0; v < nViews; v++) for (let i = 0; i < nDet; i++) { let a = 0; const i0 = Math.max(0, i - L), i1 = Math.min(nDet - 1, i + L); for (let j = i0; j <= i1; j++) a += sino[v * nDet + j] * hs[i - j + L]; flt[v * nDet + i] = a * ds; }
  // back-projection onto n x n grid covering `fov` cm
  const fov = p.fov, px = fov / n, img = new Float32Array(n * n), cs = new Float32Array(nViews), sn = new Float32Array(nViews);
  for (let v = 0; v < nViews; v++) { const th = (v / nViews) * Math.PI; cs[v] = Math.cos(th); sn[v] = Math.sin(th); }
  for (let j = 0; j < n; j++) { const y = (n / 2 - j - 0.5) * px; for (let i = 0; i < n; i++) { const x = (i - n / 2 + 0.5) * px; let a = 0;
    for (let v = 0; v < nViews; v++) { const t = (x * -sn[v] + y * cs[v]) / ds + nDet / 2 - 0.5, i0 = Math.floor(t), f = t - i0; if (i0 < 0 || i0 >= nDet - 1) continue; a += flt[v * nDet + i0] * (1 - f) + flt[v * nDet + i0 + 1] * f; }
    img[j * n + i] = 0.97 * (a * Math.PI) / nViews; } }
  // convert to HU w.r.t. calibrated water mu for this kVp
  const muW = KVP[kvp].mu; for (let i = 0; i < img.length; i++) img[i] = (1000 * (img[i] - muW)) / muW;
  return {hu: img, n, fov, kvp};
}

/** Mean / SD of HU in a circular ROI given in cm relative to image centre. */
export function roiStats(img, cx, cy, r) {
  const {hu, n, fov} = img, px = fov / n; let s = 0, s2 = 0, c = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const x = (i - n / 2 + 0.5) * px, y = (n / 2 - j - 0.5) * px; if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) { const v = hu[j * n + i]; s += v; s2 += v * v; c++; } }
  const m = c ? s / c : 0; return {mean: m, sd: c ? Math.sqrt(Math.max(0, s2 / c - m * m)) : 0, n: c};
}

export function windowToCanvas(img, canvas, wl, ww, rois = []) {
  const {hu, n} = img; canvas.width = canvas.height = n; const g = canvas.getContext('2d'), id = g.createImageData(n, n);
  const lo = wl - ww / 2;
  for (let i = 0; i < n * n; i++) { const v = Math.max(0, Math.min(255, ((hu[i] - lo) / ww) * 255)); id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
  g.putImageData(id, 0, 0);
  for (const r of rois) { const px = n / img.fov; g.strokeStyle = r.color || '#ffd34d'; g.lineWidth = 1; g.beginPath(); g.arc(n / 2 + r.cx * px, n / 2 - r.cy * px, r.r * px, 0, Math.PI * 2); g.stroke(); }
}

/** Scout (topogram): AP or lateral projection of the full phantom along its length. Returns {w,h,data:Float32Array(0..1)}. */
export function scout(view, kvp, topRel = 0, dx = 0, mAs = 40, seed = 3) {
  const nS = 340, nU = 160, du = 0.25, r = rng(seed), data = new Float32Array(nS * nU);   // 0.1 cm per column along s
  let mx = 0;
  for (let si = 0; si < nS; si++) {
    const s = (si + 0.5) * (PHANTOM_LEN / nS), sec = sectionAt(s), ell = buildEllipses(sec, kvp, dx, topRel + sec.ell[0][3], {cx: 0, cy: topRel - 0.9, a: 22, b: 0.9});
    for (let ui = 0; ui < nU; ui++) {
      const u = -(ui - nU / 2 + 0.5) * du; let line = 0;   // image rows run downward, so negate: patient-left (AP) / anterior (lateral) at the top, table at the bottom
      for (const e of ell) {
        if (view === 'ap') { const t = (u - e.cx) / e.a; if (Math.abs(t) < 1) line += e.d * 2 * e.b * Math.sqrt(1 - t * t); }
        else { const t = (u - e.cy) / e.b; if (Math.abs(t) < 1) line += e.d * 2 * e.a * Math.sqrt(1 - t * t); }
      }
      const N = (4000 * mAs) / 40 * Math.exp(-line), nn = Math.max(1, N + Math.sqrt(N) * gauss(r)); const v = -Math.log(nn / ((4000 * mAs) / 40)); data[ui * nS + si] = v; if (v > mx) mx = v;
    }
  }
  for (let i = 0; i < data.length; i++) data[i] = 1 - Math.pow(Math.min(1, data[i] / (mx || 1)), 0.8);
  return {w: nS, h: nU, data, view};
}

/** CTDIvol / DLP / effective dose (illustrative: k = 0.014 mSv/mGy·cm for chest). */
export function doseInfo({kvp, mAs, pitch, lengthCm}) {
  const ctdi = (KVP[kvp].dosePer100 * (mAs / 100)) / pitch, dlp = ctdi * lengthCm;
  return {ctdi, dlp, eff: dlp * 0.014};
}
