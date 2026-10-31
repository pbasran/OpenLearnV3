// Shared flat, indexed couch-top markings (same style as the CT couch): cm ticks, centre line and numbered
// index slots every 5 cm on both rails, numbered from the HEAD end. Used by the linac couch.
import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {M} from './materials.js';

// parent: group whose local y=0 is the top surface; headX = x of the head end; dir = -1 if the couch extends toward -x from headX.
export function addIndexTop(parent, {len, wid, headX, dir = -1, step = 0.05, topY = 0, th = 0.05}) {
  const W = 4096, H = 512, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d'); g.clearRect(0, 0, W, H);
  const pxm = W / len; g.fillStyle = g.strokeStyle = 'rgba(235,240,245,0.92)'; g.font = 'bold 22px sans-serif'; g.textAlign = 'center';
  const nSlots = Math.floor(len / step);
  for (let k = 0; k <= nSlots; k++) {
    const x = k * step * pxm + 10; if (x > W - 10) break; const major = k % 2 === 0;
    for (const side of [0, 1]) {
      const yEdge = side === 0 ? 20 : H - 20, d = side === 0 ? 1 : -1;
      g.lineWidth = major ? 4 : 2.5; g.beginPath(); g.moveTo(x, yEdge); g.lineTo(x, yEdge + d * (major ? 40 : 24)); g.stroke();
      if (major) g.fillText(String(k / 2 + 1).padStart(2, '0'), x, yEdge + d * 66 + 8);
    }
  }
  g.lineWidth = 3; g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
  for (let cm = 0; cm * 0.01 < len; cm += 10) { const x = cm * 0.01 * pxm + 10, M5 = cm % 50 === 0; g.lineWidth = M5 ? 4 : 2; g.beginPath(); g.moveTo(x, H / 2 - (M5 ? 26 : 14)); g.lineTo(x, H / 2 + (M5 ? 26 : 14)); g.stroke(); if (M5) g.fillText(String(cm), x, H / 2 - 36); }
  const tx = new T.CanvasTexture(cv); tx.colorSpace = T.SRGBColorSpace; tx.anisotropy = 8;
  const cx = headX + dir * len / 2;
  const scale = new T.Mesh(new T.PlaneGeometry(len, wid).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({map: tx, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2}));
  if (dir < 0) scale.rotation.y = Math.PI;       // texture u=0 (index 01) sits at the head end
  scale.position.set(cx, topY + 0.0008, 0); scale.renderOrder = 3; parent.add(scale);
  const slots = new T.InstancedMesh(new T.BoxGeometry(0.014, 0.004, 0.02), M.plasticDark(), (nSlots + 1) * 2); let n = 0; const mm = new T.Matrix4();
  for (let k = 0; k <= nSlots; k += 2) for (const sg of [-1, 1]) { mm.makeTranslation(headX + dir * (0.01 + k * step), topY + 0.0006, sg * (wid / 2 - 0.015)); slots.setMatrixAt(n++, mm); }
  slots.count = n; parent.add(slots);
  const rail = new T.Mesh(new RoundedBoxGeometry(len, 0.012, 0.014, 2, 0.005), M.steelBrushed());
  for (const sg of [-1, 1]) { const r = rail.clone(); r.position.set(cx, topY - th + 0.004, sg * (wid / 2 - 0.002)); parent.add(r); }
  return {scale, slots};
}
