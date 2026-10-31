// Headless test of the gesture logic using synthetic hand landmarks (no camera). Usage: node tools/test-gesture-logic.mjs http://127.0.0.1:5201
import {createRequire} from 'module'; import {execSync} from 'child_process';
const {chromium} = createRequire(execSync('npm root -g').toString().trim() + '/')('playwright');
const base = process.argv[2] || 'http://127.0.0.1:5201';
const br = await chromium.launch({args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader']});
const pg = await br.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
await pg.goto(base + '/?mode=linac'); await pg.waitForFunction(() => window.ready, null, {timeout: 120000});
const res = await pg.evaluate(async () => {
  const {createGestureLogic} = await import('/src/engine/gesture.js'); const out = [];
  const ck = (n, c, x = '') => out.push((c ? 'PASS ' : 'FAIL ') + n + ' ' + x);
  // Synthetic hand: wrist (x, y+.2), middle knuckle (x, y) => hand size .2
  const hand = ({pinch = false, fist = false, x = 0.5, y = 0.5}) => {
    const L = Array.from({length: 21}, () => ({x, y, z: 0})); L[0] = {x, y: y + 0.2, z: 0}; L[9] = {x, y, z: 0};
    for (const [t, p] of [[8, 6], [12, 10], [16, 14], [20, 18]]) {
      if (fist) { L[t] = {x, y: y + 0.17, z: 0}; L[p] = {x, y, z: 0}; } else { L[t] = {x: x + (t - 12) * 0.01, y: y - 0.2, z: 0}; L[p] = {x: x + (t - 12) * 0.01, y: y - 0.05, z: 0}; }
    }
    if (pinch) { L[4] = {x: x - 0.01, y: y - 0.1, z: 0}; L[8] = {x: x + 0.01, y: y - 0.1, z: 0}; } else if (!fist) L[4] = {x: x - 0.15, y, z: 0}; else L[4] = {x: x - 0.15, y: y + 0.1, z: 0};
    return L;
  };
  const A = {gantry: {min: -180, max: 180, val: 0, tgt: 0}}; const ev = []; const g = createGestureLogic(() => A, (e) => ev.push(e));
  let t = 1000; const step = (h) => { t += 33; return g.feed(h, t); };
  for (let i = 0; i < 5; i++) step(hand({pinch: true, x: 0.4}));
  ck('no axis selected: pinch does nothing', !ev.includes('grab') && A.gantry.tgt === 0);
  g.select('gantry', ['gantry', 'Gantry', 360, '°']);
  for (let i = 0; i < 3; i++) step(hand({x: 0.4})); ck('open hand: not grabbing', !ev.includes('grab'));
  for (let i = 0; i < 5; i++) step(hand({pinch: true, x: 0.4})); ck('pinch grabs', ev.includes('grab'));
  for (let i = 0; i < 40; i++) step(hand({pinch: true, x: 0.4 + 0.1 * Math.min(1, i / 10)}));
  ck('drag +0.1 of width gives about +36 deg', Math.abs(A.gantry.tgt - 36) < 4, 'tgt=' + A.gantry.tgt.toFixed(1));
  for (let i = 0; i < 40; i++) step(hand({pinch: true, x: 0.98})); ck('clamped to max', A.gantry.tgt <= 180 && A.gantry.tgt > 100, 'tgt=' + A.gantry.tgt.toFixed(1));
  for (let i = 0; i < 5; i++) step(hand({x: 0.95})); ck('open hand releases', ev.includes('release'));
  const keep = A.gantry.tgt; for (let i = 0; i < 10; i++) step(hand({x: 0.2})); ck('open hand moving does not move axis', A.gantry.tgt === keep);
  for (let i = 0; i < 5; i++) step(hand({pinch: true, x: 0.6})); for (let i = 0; i < 30; i++) step(hand({pinch: true, x: 0.5}));
  ck('drag left reduces the value', A.gantry.tgt < keep - 20, 'tgt=' + A.gantry.tgt.toFixed(1));
  A.gantry.val = 10; for (let i = 0; i < 6; i++) step(hand({fist: true})); ck('fist stops motion (tgt=val)', A.gantry.tgt === 10 && ev.includes('stop'), 'tgt=' + A.gantry.tgt);
  for (let i = 0; i < 5; i++) step(hand({pinch: true, x: 0.4})); for (let i = 0; i < 10; i++) step(hand({pinch: true, x: 0.5}));
  A.gantry.val = 5; t += 600; g.feed(null, t); t += 100; g.feed(null, t); ck('hand lost mid-drag stops motion', A.gantry.tgt === 5 && ev.includes('lost'), 'tgt=' + A.gantry.tgt);
  const n = ev.filter((e) => e === 'stop').length; step(hand({fist: true})); step(hand({x: 0.5})); ck('single fist frame ignored', ev.filter((e) => e === 'stop').length === n);
  return out.join('\n');
});
console.log(res); console.log('page errors:', errs.length ? errs : 'none'); await br.close();
process.exit(/FAIL/.test(res) ? 1 : 0);
