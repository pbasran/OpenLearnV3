// A small hidden surprise for the Images tab: at an extreme bone window a dog's skeleton appears in the image.
export function dogBones(g, n) {
  g.save(); g.translate(n * 0.5, n * 0.5); const s = n / 100; g.scale(s, s);
  g.globalAlpha = 0.85; g.strokeStyle = '#f4f1e6'; g.fillStyle = '#f4f1e6'; g.lineCap = 'round'; g.lineWidth = 2.2;
  const bone = (x1, y1, x2, y2) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); [[x1, y1], [x2, y2]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 1.9, 0, 7); g.fill(); }); };
  g.beginPath(); g.moveTo(-30, -4); for (let i = 0; i < 9; i++) g.lineTo(-30 + i * 7, -4 + (i % 2 ? -1.2 : 1.2)); g.lineTo(26, -4); g.lineWidth = 2.6; g.stroke(); g.lineWidth = 2.2;   // spine
  for (let i = 0; i < 7; i++) { const x = -22 + i * 5; g.beginPath(); g.moveTo(x, -4); g.quadraticCurveTo(x - 2, 8, x + 2, 14); g.stroke(); }                                                // ribs
  g.beginPath(); g.moveTo(26, -4); g.quadraticCurveTo(38, -16, 42, -6); g.stroke();                                                                                                   // tail
  bone(-26, -3, -28, 10); bone(-28, 10, -25, 24); bone(24, -3, 28, 10); bone(28, 10, 24, 24); bone(-10, 12, -10, 24); bone(10, 12, 12, 24);                                           // legs
  g.beginPath(); g.ellipse(-40, -12, 8, 6.5, -0.2, 0, 7); g.stroke(); g.beginPath(); g.moveTo(-47, -9); g.lineTo(-54, -7); g.lineTo(-52, -3); g.lineTo(-45, -4); g.stroke();      // skull + snout
  g.beginPath(); g.moveTo(-41, -18); g.lineTo(-44, -26); g.lineTo(-37, -20); g.stroke(); g.beginPath(); g.arc(-42, -13, 1.3, 0, 7); g.fill();
  g.font = 'bold 6px sans-serif'; g.textAlign = 'center'; g.globalAlpha = 0.7; g.fillText('VAIDER LAB', 0, 38);
  g.restore();
}
