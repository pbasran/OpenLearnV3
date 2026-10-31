// Tiny canvas line-plot helper (axes, grid, multiple series, optional vertical marker).
export function plot(canvas, {series, xr, yr, xlabel = '', ylabel = '', marker = null, xticks = 5, yticks = 4}) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), w = canvas.clientWidth || 320, h = canvas.clientHeight || 160;
  if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
  const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const cs = getComputedStyle(document.documentElement), ink = cs.getPropertyValue('--mute').trim() || '#5c6f73', line = cs.getPropertyValue('--line').trim() || '#dbe4e5';
  const L = 38, R = 8, T = 8, B = 26, pw = w - L - R, ph = h - T - B;
  const X = (x) => L + ((x - xr[0]) / (xr[1] - xr[0])) * pw, Y = (y) => T + ph - ((y - yr[0]) / (yr[1] - yr[0])) * ph;
  g.font = '10.5px system-ui,sans-serif'; g.fillStyle = ink; g.strokeStyle = line; g.lineWidth = 1;
  for (let i = 0; i <= xticks; i++) { const v = xr[0] + ((xr[1] - xr[0]) * i) / xticks, x = X(v); g.beginPath(); g.moveTo(x, T); g.lineTo(x, T + ph); g.stroke(); g.textAlign = 'center'; g.fillText(+v.toFixed(1), x, h - 12); }
  for (let i = 0; i <= yticks; i++) { const v = yr[0] + ((yr[1] - yr[0]) * i) / yticks, y = Y(v); g.beginPath(); g.moveTo(L, y); g.lineTo(L + pw, y); g.stroke(); g.textAlign = 'right'; g.fillText(+v.toFixed(2), L - 4, y + 3.5); }
  g.textAlign = 'center'; g.fillText(xlabel, L + pw / 2, h - 1); g.save(); g.translate(9, T + ph / 2); g.rotate(-Math.PI / 2); g.fillText(ylabel, 0, 0); g.restore();
  if (marker != null) { g.strokeStyle = '#e0952b'; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(X(marker), T); g.lineTo(X(marker), T + ph); g.stroke(); g.setLineDash([]); }
  for (const s of series) {
    g.strokeStyle = s.color || '#1a6e78'; g.lineWidth = s.width || 2; g.beginPath();
    s.pts.forEach(([x, y], i) => { const px = X(x), py = Y(Math.min(yr[1], Math.max(yr[0], y))); i ? g.lineTo(px, py) : g.moveTo(px, py); }); g.stroke();
    if (s.label) { g.fillStyle = s.color; g.textAlign = 'left'; g.fillText(s.label, L + 6, T + 12 + (s.row || 0) * 12); }
  }
}
