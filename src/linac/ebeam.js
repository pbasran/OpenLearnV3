// Educational animation: electron bunches from the gun, through the accelerating waveguide, round the 270° bending magnet and onto the target,
// where bremsstrahlung photons leave downward in a forward-peaked cone. Schematic path in gantry-local coordinates (not to scale in time).
import * as T from 'three';

export function createElectronBeam(parent, {targetX, targetY, gunX = 1.03, gunY = 1.78}) {
  const g = new T.Group(); g.name = 'electron_beam_anim'; g.visible = false; parent.add(g);
  // path: gun -> straight along the waveguide -> 270° loop in the magnet -> straight down to the target
  const R = 0.05, cx = targetX - 0.05, cy = targetY + 0.097, y0 = cy - R;               // loop centre; entry line y0; exit at x = cx+R (= targetX)
  const pts = [];
  for (let i = 0; i <= 60; i++) pts.push(new T.Vector3(gunX + (cx - gunX) * i / 60, y0, 0));
  for (let i = 1; i <= 54; i++) { const a = -Math.PI / 2 - (i / 54) * 1.5 * Math.PI; pts.push(new T.Vector3(cx + R * Math.cos(a), cy + R * Math.sin(a), 0)); }   // clockwise from bottom through left, top, to right
  const endY = targetY + 0.004; for (let i = 1; i <= 12; i++) pts.push(new T.Vector3(targetX, cy + (endY - cy) * i / 12, 0));
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1])); const L = cum[cum.length - 1];
  const at = (s, out) => { s = Math.min(L - 1e-6, Math.max(0, s)); let lo = 0, hi = cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; } const k = (s - cum[lo]) / (cum[hi] - cum[lo] || 1); return out.copy(pts[lo]).lerp(pts[hi], k); };
  // faint guide tube
  const tube = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts.filter((_, i) => i % 3 === 0 || i === pts.length - 1)), 200, 0.004, 8, false), new T.MeshBasicMaterial({color: 0x37d6ff, transparent: true, opacity: 0.18, depthTest: false, toneMapped: false}));
  tube.renderOrder = 20; g.add(tube);
  // electrons: bunches of 3 (RF bunching), slow at the gun and faster after acceleration
  const NB = 14, PER = 3, N = NB * PER, em = new T.MeshBasicMaterial({color: 0x9fe8ff, depthTest: false, toneMapped: false});
  const el = new T.InstancedMesh(new T.SphereGeometry(0.0065, 10, 8), em, N); el.renderOrder = 22; el.frustumCulled = false; g.add(el);
  // photons
  const NP = 140, pm = new T.MeshBasicMaterial({color: 0xffd35a, transparent: true, opacity: 0.9, depthTest: false, toneMapped: false});
  const ph = new T.InstancedMesh(new T.SphereGeometry(0.0045, 6, 5), pm, NP); ph.renderOrder = 22; ph.frustumCulled = false; g.add(ph);
  const glow = new T.Mesh(new T.SphereGeometry(0.02, 16, 12), new T.MeshBasicMaterial({color: 0xfff2a8, transparent: true, opacity: 0.8, depthTest: false, toneMapped: false})); glow.position.set(targetX, targetY - 0.006, 0); glow.renderOrder = 23; g.add(glow);
  const seed = Array.from({length: NP}, () => ({ph: Math.random(), a: Math.random() * 6.283, th: Math.pow(Math.random(), 1.8) * 0.45, v: 0.5 + Math.random() * 0.5}));
  const m4 = new T.Matrix4(), v3 = new T.Vector3(), q = new T.Quaternion(), sc = new T.Vector3(1, 1, 1);
  let t = 0;
  function update(dt, active) {
    g.visible = !!active; if (!active) return; t += dt;
    for (let b = 0; b < NB; b++) for (let k = 0; k < PER; k++) {
      let u = ((t * 0.16 + b / NB) % 1) - k * 0.006; if (u < 0) u += 1;
      const s = L * Math.pow(u, 1.35); at(s, v3); v3.z += (k - 1) * 0.0; m4.compose(v3, q, sc); el.setMatrixAt(b * PER + k, m4);
    }
    el.instanceMatrix.needsUpdate = true;
    const pulse = 0.65 + 0.35 * Math.sin(t * 14); glow.scale.setScalar(pulse * 1.2); glow.material.opacity = 0.5 + 0.4 * pulse;
    for (let i = 0; i < NP; i++) {
      const p = seed[i], life = (t * 0.9 * p.v + p.ph) % 1, d = life * 0.55;           // photons spread over 55 cm below the target
      const r = d * Math.tan(p.th); v3.set(targetX + r * Math.cos(p.a), targetY - 0.012 - d, r * Math.sin(p.a));
      const f = (1 - life) * 0.9 + 0.1; m4.compose(v3, q, sc.set(f, f, f)); ph.setMatrixAt(i, m4);
    }
    sc.set(1, 1, 1); ph.instanceMatrix.needsUpdate = true;
  }
  return {group: g, update, pathLength: L};
}
