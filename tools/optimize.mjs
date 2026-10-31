// Optimises the OpenLearn source GLBs for mobile: weld, simplify heavy meshes, meshopt-compress.
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {weld, simplify, prune, dedup, meshopt} from '@gltf-transform/functions';
import {MeshoptEncoder, MeshoptSimplifier} from 'meshoptimizer';
import fs from 'fs';
import path from 'path';
const SRC = process.argv[2];            // OpenLearn/src/equipment
const OUT = process.argv[3];            // public/assets
await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder': MeshoptEncoder});
// [module, file, simplify ratio, error]
const jobs = {
  CTScanner: {
    collimators: [0.04, 0.004], detector_array: [0.35, 0.002], gantry_housing: [1, 0], gantry_ring: [1, 0], xray_tube: [1, 0],
    slip_ring_assembly: [1, 0], bore: [1, 0], patient_table: [1, 0], control_console: [0.5, 0.002],
    control_room: [1, 0], cooling_system: [1, 0], laser_positioning_lights: [0.5, 0.002],
    image_reconstruction_computer: [1, 0], screen: [1, 0], safety_and_intercom_systems: [1, 0],
  },
  Linac: {
    '01_Bed': [1, 0], '01_Oil_Tank': [1, 0], '02_Klystron_Inside': [1, 0], '02_Klystron_Outside': [1, 0],
    '03_Cooling_system': [1, 0], '04_Circulator': [1, 0], '05_Electro_Gun': [1, 0], '05_Electro_Gun_Split': [1, 0], '06_Waveguide_Split': [0.4, 0.002], '06_Waveguide': [0.4, 0.002],
    '07_Bending_Magnet': [1, 0], '08_Target': [1, 0], '09_Primary_Collimator': [0.5, 0.002], '10_Secondary_Collimator': [1, 0],
    '11_Flatening_Filter': [0.25, 0.002], '15_KV_Imagine_System': [1, 0],
  },
};
let tin = 0, tout = 0;
for (const [mod, files] of Object.entries(jobs)) {
  const dst = path.join(OUT, mod === 'CTScanner' ? 'ct' : 'linac'); fs.mkdirSync(dst, {recursive: true});
  for (const [name, [ratio, err]] of Object.entries(files)) {
    const f = path.join(SRC, mod, 'assets', name + '.glb');
    if (!fs.existsSync(f)) { console.log('missing', f); continue; }
    const doc = await io.read(f);
    if (name === '01_Casing') for (const n of doc.getRoot().listNodes()) if (/floor/i.test(n.getName())) n.dispose();
    await doc.transform(prune(), weld());
    if (ratio < 1) await doc.transform(simplify({simplifier: MeshoptSimplifier, ratio, error: err, lockBorder: false}));
    await doc.transform(dedup(), prune(), meshopt({encoder: MeshoptEncoder, level: 'medium'}));
    const o = path.join(dst, name + '.glb'); await io.write(o, doc);
    const a = fs.statSync(f).size, b = fs.statSync(o).size; tin += a; tout += b;
    console.log(name.padEnd(34), (a / 1024).toFixed(0).padStart(7), 'KB ->', (b / 1024).toFixed(0).padStart(6), 'KB');
  }
}
console.log('TOTAL', (tin / 1048576).toFixed(1), 'MB ->', (tout / 1048576).toFixed(1), 'MB');
