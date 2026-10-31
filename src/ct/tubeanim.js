// Educational cutaway of the CT x-ray tube: electrons boil off the cathode filament, are accelerated by the tube voltage and strike the
// track of the ROTATING tungsten anode at the focal spot; photons are emitted from that spot in all forward directions. Those outside the
// collimator opening stop in the collimator blades; the rest form the fan beam and travel on to the detector arc.
// Rotor-local coordinates (origin on the rotation axis, +y = tube side).
import * as T from 'three';

export function createTubeAnim(rotor, {xs, rf, rd, ha}) {
  const g = new T.Group(); g.name = 'tube_anim'; g.visible = false; rotor.add(g);
  const R = 0.075, TR = R * 0.97, cy = rf + TR, DC = 0.11;               // anode radius, focal-track radius, disc centre height, focal spot -> collimator distance
  const mat = (c, o = 1) => new T.MeshBasicMaterial({color: c, transparent: o < 1, opacity: o, depthTest: false, depthWrite: false, toneMapped: false});
  const add = (m, ro = 19) => { m.renderOrder = ro; g.add(m); return m; };
  const glass = add(new T.Mesh(new T.CylinderGeometry(0.105, 0.105, 0.34, 40, 1, true).rotateZ(Math.PI / 2), new T.MeshBasicMaterial({color: 0x9fd8ff, transparent: true, opacity: 0.12, side: T.DoubleSide, depthTest: false, depthWrite: false, toneMapped: false})), 18);
  glass.position.set(xs, cy - 0.025, 0);
  // rotating anode: disc + hot track + radial marks so the rotation can be seen
  const spin = new T.Group(); spin.position.set(xs + 0.004, cy, 0); g.add(spin);
  const disc = new T.Mesh(new T.CylinderGeometry(R, R * 0.93, 0.016, 48).rotateZ(Math.PI / 2), mat(0xb9c2cc)); disc.renderOrder = 19; spin.add(disc);
  const track = new T.Mesh(new T.TorusGeometry(TR, 0.0045, 8, 64).rotateY(Math.PI / 2), mat(0xff8a3d)); track.position.x = -0.0085; track.renderOrder = 20; spin.add(track);
  for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2, m = new T.Mesh(new T.BoxGeometry(0.002, 0.034, 0.006), mat(k === 0 ? 0xff4040 : 0x4b5560)); m.position.set(-0.0095, Math.cos(a) * 0.04, Math.sin(a) * 0.04); m.rotation.x = -a; m.renderOrder = 21; spin.add(m); }
  const stem = add(new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 0.16, 12).rotateZ(Math.PI / 2), mat(0x8e98a4))); stem.position.set(xs + 0.1, cy, 0);
  const fx = xs - 0.115, fy = rf;                                              // cathode plate faces the anode face: electrons fly straight along +x, perpendicular to both
  const cathode = add(new T.Mesh(new T.BoxGeometry(0.012, 0.034, 0.05), mat(0x59d0ff)), 20); cathode.position.set(fx, fy, 0);
  const cup = add(new T.Mesh(new T.BoxGeometry(0.02, 0.006, 0.056), mat(0x3a8fb3)), 20); cup.position.set(fx + 0.004, fy + 0.02, 0); const cup2 = cup.clone(); cup2.position.y = fy - 0.02; g.add(cup2);
  const focal = new T.Vector3(xs - 0.0085, rf, 0), start = new T.Vector3(fx + 0.008, fy, 0);
  // collimator: lead blades just below the tube window (z-blades shape the fan, x-blades set the slice width)
  const bladeMat = mat(0x6d7883), blades = [];
  const blade = (w, h, d) => add(new T.Mesh(new T.BoxGeometry(w, h, d), bladeMat), 21);
  const zb = [blade(0.16, 0.014, 0.12), blade(0.16, 0.014, 0.12)], xb = [blade(0.01, 0.014, 0.16), blade(0.01, 0.014, 0.16)];
  const tanHA = Math.tan(ha);
  // electrons filament -> focal spot
  const NE = 40, el = add(new T.InstancedMesh(new T.SphereGeometry(0.0042, 8, 6), mat(0x9fe8ff), NE), 22); el.frustumCulled = false;
  // photons: 55 % inside the fan opening, the rest emitted outside it and absorbed in the blades
  const NP = 700, ph = add(new T.InstancedMesh(new T.SphereGeometry(0.0038, 6, 5), mat(0xffd35a, 0.95), NP), 22); ph.frustumCulled = false;
  const glow = add(new T.Mesh(new T.SphereGeometry(0.013, 14, 10), mat(0xfff2a8, 0.9)), 23); glow.position.copy(focal);
  const seed = Array.from({length: NP}, (_, i) => { const inside = Math.random() < 0.55; return {ph: Math.random(), v: 0.55 + Math.random() * 0.45, u: Math.random() * 2 - 1, w: Math.random() * 2 - 1, wide: Math.random() < 0.3 || !inside, zin: inside, kz: inside ? 1 : 1 + Math.random() * 0.9}; });
  const m4 = new T.Matrix4(), v3 = new T.Vector3(), q = new T.Quaternion(), sc = new T.Vector3(1, 1, 1);
  let t = 0;
  function update(dt, active, emitPhotons, collimM = 0.04) {
    g.visible = !!active; if (!active) return; t += dt; spin.rotation.x += dt * 11;
    const xh = (collimM / 2) * (DC / rf);                                         // half slice-width at the blades
    zb[0].position.set(xs, rf - DC, DC * tanHA + 0.06); zb[1].position.set(xs, rf - DC, -(DC * tanHA + 0.06));
    xb[0].position.set(xs + xh + 0.005, rf - DC - 0.012, 0); xb[1].position.set(xs - xh - 0.005, rf - DC - 0.012, 0);
    for (let i = 0; i < NE; i++) { const u = (t * 0.9 + i / NE) % 1, e = u * u; v3.lerpVectors(start, focal, e); v3.z = Math.sin(i * 12.9) * 0.004 * (1 - e); m4.compose(v3, q, sc); el.setMatrixAt(i, m4); }
    el.instanceMatrix.needsUpdate = true;
    glow.scale.setScalar((0.7 + 0.3 * Math.sin(t * 18)) * 1.1);
    ph.visible = !!emitPhotons;
    if (emitPhotons) {
      for (let i = 0; i < NP; i++) {
        const p = seed[i];
        const a = p.zin ? p.u * ha * 0.98 : Math.sign(p.u || 1) * ha * p.kz;                    // angle across the fan (z)
        const bmax = p.wide ? 0.22 : Math.max(1e-4, xh / DC) * 0.95;                           // angle along the table axis (x)
        const b = p.w * bmax;
        const dir = v3.set(Math.sin(b), -Math.cos(b) * Math.cos(a), Math.cos(b) * Math.sin(a)).clone();
        const dStop = DC / (Math.cos(b) * Math.cos(a));                                        // distance along the ray to the blade plane
        const px = DC * Math.tan(b) / Math.cos(a), pz = DC * Math.tan(a);
        const passes = Math.abs(pz) <= DC * tanHA && Math.abs(px) <= xh;
        const dEnd = passes ? rd : dStop;                                                      // pass -> detector arc; else stopped in the blade
        const phase = (t * 0.75 * p.v + p.ph) % 1, d = phase * dEnd * (passes ? 1 : 1);
        v3.copy(focal).addScaledVector(dir, d);
        const f = passes ? 0.95 : Math.max(0.15, 1 - phase * 0.7); sc.set(f, f, f); m4.compose(v3, q, sc); ph.setMatrixAt(i, m4);
      }
      sc.set(1, 1, 1); ph.instanceMatrix.needsUpdate = true;
    }
  }
  return {group: g, update};
}
