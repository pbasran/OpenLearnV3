// Upright status display mounted on the back plate in the middle of the gantry ring (it stays level while the gantry and collimator rotate).
// Shows the selected beam, gantry and collimator angles, every jaw position (IEC X1/X2/Y1/Y2, cm from the central axis), and a beam's-eye-view field diagram.
import * as THREE from 'three';

export function createGantryDisplay({x, y, size = 0.52}) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 512; const c = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateY(-Math.PI / 2), new THREE.MeshBasicMaterial({map: tex, transparent: true, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2}));
  mesh.position.set(x, y, 0); mesh.name = 'gantry_display'; mesh.renderOrder = 4; mesh.raycast = () => {};
  let last = '';
  const f1 = (v) => (Math.abs(v) < 0.05 ? 0 : v).toFixed(1);
  function draw(S, axes, ap, label) {
    const j = ap.jaw, X1 = -j.x1, X2 = j.x2, Y1 = -j.y1, Y2 = j.y2, fw = j.x2 - j.x1, fl = j.y2 - j.y1;
    const asym = Math.abs(j.x1 + j.x2) > 0.05 || Math.abs(j.y1 + j.y2) > 0.05, on = S.beamOn;
    c.clearRect(0, 0, 512, 512);
    c.fillStyle = 'rgba(8,16,22,0.93)'; c.beginPath(); c.roundRect(6, 6, 500, 500, 44); c.fill();
    c.strokeStyle = on ? '#ff4d4d' : '#1f8a96'; c.lineWidth = 6; c.stroke();
    c.textBaseline = 'middle';
    // header: beam + state
    c.fillStyle = '#e9f6f8'; c.font = 'bold 54px sans-serif'; c.textAlign = 'left'; c.fillText(label, 34, 58);
    c.textAlign = 'right'; c.fillStyle = on ? '#ff6b6b' : '#50e0a0'; c.font = 'bold 34px sans-serif'; c.fillText(on ? 'BEAM ON' : 'BEAM OFF', 478, 58);
    c.fillStyle = '#7fb5be'; c.font = '26px sans-serif'; c.textAlign = 'left'; c.fillText(`${S.delivered.toFixed(0)} / ${S.mu} MU`, 34, 100);
    c.textAlign = 'right'; c.fillStyle = asym ? '#ffc04d' : '#7fb5be'; c.fillText(asym ? 'ASYMMETRIC JAWS' : 'SYMMETRIC JAWS', 478, 100);
    // angles
    c.textAlign = 'left'; c.fillStyle = '#7fb5be'; c.font = '24px sans-serif'; c.fillText('GANTRY', 34, 140); c.fillText('COLL', 282, 140);
    c.fillStyle = '#ffffff'; c.font = 'bold 46px sans-serif'; c.fillText(`${axes.gantry.val.toFixed(1)}°`, 34, 182); c.fillText(`${axes.coll.val.toFixed(1)}°`, 282, 182);
    // beam's-eye-view diagram (rotates with the collimator; labels follow the jaw edges)
    const cx = 130, cy = 358, k = 4.1;   // px per cm; +-20 cm = +-82 px
    c.save(); c.translate(cx, cy);
    c.strokeStyle = '#1b3a44'; c.lineWidth = 2; c.strokeRect(-82, -82, 164, 164);
    c.rotate((axes.coll.val * Math.PI) / 180);
    c.fillStyle = 'rgba(80,190,255,0.28)'; c.fillRect(j.x1 * k, -j.y2 * k, fw * k, fl * k);
    c.strokeStyle = '#6fd0ff'; c.lineWidth = 3; c.strokeRect(j.x1 * k, -j.y2 * k, fw * k, fl * k);
    c.strokeStyle = '#ffffffaa'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-90, 0); c.lineTo(90, 0); c.moveTo(0, -90); c.lineTo(0, 90); c.stroke();
    c.fillStyle = '#ffd24d'; c.font = 'bold 20px sans-serif'; c.textAlign = 'center';
    const lab = (t, px, py) => { c.save(); c.translate(px, py); c.rotate((-axes.coll.val * Math.PI) / 180); c.fillText(t, 0, 0); c.restore(); };
    lab('X1', j.x1 * k - 16, 0); lab('X2', j.x2 * k + 16, 0); lab('Y1', 0, -j.y1 * k + 16); lab('Y2', 0, -j.y2 * k - 14);
    c.restore();
    // jaw table
    c.textAlign = 'left'; c.font = '24px sans-serif'; c.fillStyle = '#7fb5be'; c.fillText('JAWS (cm from axis)', 262, 232);
    const row = (a, va, b, vb, yy) => { c.fillStyle = '#ffd24d'; c.font = 'bold 28px sans-serif'; c.fillText(a, 262, yy); c.fillText(b, 262, yy + 44); c.fillStyle = '#ffffff'; c.textAlign = 'right'; c.fillText(f1(va), 380, yy); c.fillText(f1(vb), 380, yy + 44); c.textAlign = 'left'; };
    row('X1', X1, 'X2', X2, 270); c.fillStyle = '#ffd24d'; c.font = 'bold 28px sans-serif'; c.fillText('Y1', 392, 270); c.fillText('Y2', 392, 314);
    c.fillStyle = '#ffffff'; c.textAlign = 'right'; c.fillText(f1(Y1), 500, 270); c.fillText(f1(Y2), 500, 314); c.textAlign = 'left';
    c.fillStyle = '#7fb5be'; c.font = '24px sans-serif'; c.fillText('FIELD', 262, 392); c.fillStyle = '#ffffff'; c.font = 'bold 36px sans-serif'; c.fillText(`${f1(fw)} × ${f1(fl)} cm`, 262, 430);
    c.fillStyle = '#4f7d86'; c.font = '19px sans-serif'; c.fillText('X1/Y1 = negative-side jaws', 262, 474);
    tex.needsUpdate = true;
  }
  return {
    mesh, setVisible(v) { mesh.visible = !!v; },
    update(S, axes, ap, label) {
      const j = ap.jaw, sig = [label, S.beamOn, S.delivered.toFixed(0), S.mu, axes.gantry.val.toFixed(1), axes.coll.val.toFixed(1), j.x1.toFixed(2), j.x2.toFixed(2), j.y1.toFixed(2), j.y2.toFixed(2)].join('|');
      if (sig !== last) { last = sig; draw(S, axes, ap, label); }
    },
  };
}
