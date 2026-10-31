import './style.css';
import {createStage} from './engine/stage.js';
import {createUI} from './engine/ui.js';
import {setupAR} from './engine/ar.js';
import {setupGestures} from './engine/gesture.js';
import * as THREE from 'three';

const q = new URLSearchParams(location.search);
const host = document.getElementById('stage');
const stage = createStage(host); window.stage = stage;
const ui = createUI(document.getElementById('ui')); window.ui = ui;
const MODES = [['linac', 'Linac'], ['ct', 'CT scanner']];
const mods = {};          // loaded modules
let current = null;

async function load(id) {
  if (mods[id]) return mods[id];
  const hint = document.createElement('div'); hint.className = 'toast show'; hint.textContent = 'Loading ' + (id === 'ct' ? 'CT scanner' : 'linear accelerator') + '…'; document.body.append(hint);
  let m;
  if (id === 'linac') {
    const [{createLinac}, {buildLinacPanels}] = await Promise.all([import('./linac/linac.js'), import('./linac/panel.js')]);
    const lin = await createLinac(stage); window.lin = lin; const root = new THREE.Group(); root.add(lin.world); stage.scene.add(root);
    const rc = lin.recenter();
    m = {obj: lin, world: lin.world, root, arRadius: 3.2, arHide: () => [lin.room.group],  update: (dt) => lin.update(dt), start: () => { ui.hud.innerHTML = ''; window.panels = buildLinacPanels(stage, lin, ui); stage.frame(rc.target, 3.2, rc.cam); stage.scene.background.set(0xdfe5e8); }};
  } else {
    const [{createCT}, {buildCTPanels}] = await Promise.all([import('./ct/ct.js'), import('./ct/panel.js')]);
    const ct = await createCT(stage); window.ct = ct; const root = new THREE.Group(); root.add(ct.world); stage.scene.add(root);
    const rc = ct.recenter();
    m = {obj: ct, world: ct.world, root, arRadius: 3.0, arHide: () => [ct.room, ct.monitor, ...['control_console', 'image_reconstruction_computer', 'safety_and_intercom_systems', 'cooling_system', 'laser_positioning_lights'].flatMap((id) => (ct.registry.get(id) || []))],  update: (dt) => ct.update(dt), start: () => { ui.hud.innerHTML = ''; window.ctp = buildCTPanels(stage, ct, ui); stage.frame(rc.target, 4.6, rc.cam); stage.scene.background.set(0x20282b); }};
  }
  hint.remove(); mods[id] = m; return m;
}
async function setMode(id) {
  if (id === current) return;
  const m = await load(id);
  for (const [k, v] of Object.entries(mods)) v.world.visible = v.root.visible = k === id;
  current = id; ui.hideCard(); m.start(); ui.modes(MODES, id, setMode);
  window.mode = id; window.dispatchEvent(new Event('mode-changed'));
}
const xBanner = document.createElement('div'); xBanner.className = 'xbanner'; xBanner.textContent = '☢ X-RAYS ON'; xBanner.style.display = 'none'; document.body.append(xBanner);
stage.onFrame(() => { const m = current && mods[current]; const on = !!(m && (current === 'linac' ? m.obj.S.beamOn : m.obj.S.xray)); const d = on ? 'block' : 'none'; if (xBanner.style.display !== d) xBanner.style.display = d; });
stage.onFrame((dt) => { if (current && mods[current]) mods[current].update(dt); });
window.tick = (dt) => { if (current) mods[current].update(dt); };
await setMode(q.get('mode') === 'ct' ? 'ct' : 'linac');
if (current === 'linac') for (const [k, v] of q) if (window.lin && k in lin.axes) lin.axes[k].val = lin.axes[k].tgt = +v;
if (current === 'ct') for (const [k, v] of q) if (window.ct && k in ct.axes) ct.axes[k].val = ct.axes[k].tgt = +v;
window.AR = setupAR(stage, ui, () => mods[current]);
window.GESTURE = setupGestures(stage, ui, () => mods[current], () => current);
window.ready = true;
