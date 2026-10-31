// Export life-size USDZ files (metres) for iPad AR Quick Look. Usage: node tools/export-usdz.mjs <baseUrl> <outDir>
import {createRequire} from 'module'; import {execSync} from 'child_process';
const req = createRequire(execSync('npm root -g').toString().trim() + '/');
const {chromium} = req('playwright');
import fs from 'fs';
const base = process.argv[2] || 'http://127.0.0.1:5199', out = process.argv[3] || 'public/ar';
fs.mkdirSync(out, {recursive: true});
const POSES = {
  linac: [['linac_gantry0_couch_in', 'gantry=0&couchLng=0'], ['linac_gantry90', 'gantry=90&couchLng=0']],
  ct: [['ct_table_in', 'tableIn=0.9&tableH=1.07'], ['ct_table_out', 'tableIn=0&tableH=1.07']],
};
const br = await chromium.launch({args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
for (const [mode, list] of Object.entries(POSES)) for (const [name, qs] of list) {
  const pg = await br.newPage({viewport: {width: 800, height: 500}});
  pg.on('pageerror', (e) => console.log('pageerror', e.message));
  if (process.env.PREVIEW) await pg.addInitScript(() => { window.__preview = true; });
  await pg.goto(`${base}/?mode=${mode}&${qs}`); await pg.waitForFunction(() => window.ready, null, {timeout: 120000});
  const b64 = await pg.evaluate(async (qs) => {
    const T = await import('/node_modules/three/build/three.module.js'); // same instance as app (vite dedupes)
    const {USDZExporter} = await import('/node_modules/three/examples/jsm/exporters/USDZExporter.js');
    const m = window.mode === 'ct' ? window.ct : window.lin;
    m.S.interlock = false; for (const [k, v] of new URLSearchParams(qs)) if (m.axes[k]) { m.axes[k].val = +v + 1e-3; m.axes[k].tgt = +v; }   // force applyAxes via a tiny offset
    for (let i = 0; i < 400; i++) m.update(0.05);                       // settle animated axes
    const mod = window.mode;
    const hide = mod === 'ct' ? [m.room, m.monitor, ...['control_console', 'image_reconstruction_computer', 'safety_and_intercom_systems', 'cooling_system', 'laser_positioning_lights'].flatMap((id) => (m.registry.get(id) || []))] : [m.room.group];
    hide.filter(Boolean).forEach((o) => { o.visible = false; });
    const root = m.world.parent; root.updateMatrixWorld(true);
    const grp = new T.Group();
    const meshes = [];
    root.traverseVisible((o) => {
      if (!o.isMesh) return;
      let mat = o.material; if (Array.isArray(mat)) mat = mat[0];
      if (!mat || !mat.isMeshStandardMaterial) return;
      if (o.isInstancedMesh) { if (o.renderOrder >= 20 || o.count > 300) return; const mm = new T.Matrix4(); for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, mm); const c = new T.Mesh(o.geometry, mat); c.applyMatrix4(new T.Matrix4().multiplyMatrices(o.matrixWorld, mm)); meshes.push(c); } return; }
      if (mat.transparent && mat.opacity < 0.05) return;
      if (mod === 'ct') { const bb = new T.Box3().setFromObject(o); if (bb.min.z < -1.6 || bb.max.z > 1.6) { if (bb.max.z - bb.min.z < 0.5) return; } }
      const c = new T.Mesh(o.geometry, mat); c.applyMatrix4(o.matrixWorld); meshes.push(c);
    });
    meshes.forEach((c) => grp.add(c)); grp.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(grp); const ctr = box.getCenter(new T.Vector3());
    grp.position.set(-ctr.x, -box.min.y, -ctr.z); grp.updateMatrixWorld(true);
    const size = box.getSize(new T.Vector3());
    const sc = new T.Scene(); sc.add(grp);
    if (window.__preview) { const R = new T.WebGLRenderer({antialias: true, preserveDrawingBuffer: true}); R.setSize(900, 600); R.setClearColor(0xdddddd); sc.add(new T.HemisphereLight(0xffffff, 0x444444, 2.5)); const d = new T.DirectionalLight(0xffffff, 2); d.position.set(3, 5, 4); sc.add(d); const cam = new T.PerspectiveCamera(40, 1.5, 0.1, 50); cam.position.set(size.x * 0.9, size.y * 0.9, size.z * 1.6 + 3); cam.lookAt(0, size.y * 0.4, 0); R.render(sc, cam); window.__png = R.domElement.toDataURL('image/png'); }
    const buf = await new USDZExporter().parse(sc, {quickLookCompatible: true, maxTextureSize: 1024});
    let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return {b64: btoa(s), n: meshes.length, size: size.toArray().map((v) => +v.toFixed(2))};
  }, qs);
  if (process.env.PREVIEW) { const png = await pg.evaluate(() => window.__png); fs.writeFileSync(`/tmp/prev_${name}.png`, Buffer.from(png.split(',')[1], 'base64')); }
  fs.writeFileSync(`${out}/${name}.usdz`, Buffer.from(b64.b64, 'base64'));
  console.log(name, b64.n, 'meshes, size m', b64.size, (fs.statSync(`${out}/${name}.usdz`).size / 1e6).toFixed(1), 'MB');
  await pg.close();
}
await br.close();
