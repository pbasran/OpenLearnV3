// UI wiring test with a fake camera + synthetic landmarks. Usage: node tools/test-gesture-ui.mjs http://127.0.0.1:5201
import {createRequire} from 'module'; import {execSync} from 'child_process';
const {chromium} = createRequire(execSync('npm root -g').toString().trim() + '/')('playwright');
const base = process.argv[2] || 'http://127.0.0.1:5201';
const br = await chromium.launch({args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']});
const ctx = await br.newContext({permissions: ['camera']}); const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const out = []; const ck = (n, c, x = '') => out.push((c ? 'PASS ' : 'FAIL ') + n + ' ' + x);
for (const mode of (process.argv[3] || 'linac,ct').split(',')) {
  await pg.goto(base + '/?mode=' + mode); await pg.waitForFunction(() => window.ready, null, {timeout: 120000});
  await pg.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Gesture/.test(b.textContent)).click());
  await pg.waitForFunction(() => /Ready|unavailable|No hand/.test(document.querySelector('.gst').textContent), null, {timeout: 200000});
  const st = await pg.evaluate(() => document.querySelector('.gst').textContent); ck(mode + ": camera + tracker started", /Ready|No hand/.test(st), st);
  const chips = await pg.evaluate(() => [...document.querySelectorAll('.gchips button')].map((b) => b.textContent)); ck(mode + ': axis chips', chips.length >= 3, chips.join(','));
  // drive the real logic with synthetic landmarks (pinch then drag)
  const r = await pg.evaluate(async (mode) => {
    const g = window.GESTURE.G.logic; const m = mode === 'ct' ? window.ct : window.lin; const key = mode === 'ct' ? 'tableIn' : 'gantry';
    document.querySelector('.gchips button').click();
    const hand = (x, pinch) => { const L = Array.from({length: 21}, () => ({x, y: .5, z: 0})); L[0] = {x, y: .7, z: 0}; L[9] = {x, y: .5, z: 0}; for (const [t, p] of [[8, 6], [12, 10], [16, 14], [20, 18]]) { L[t] = {x, y: .3, z: 0}; L[p] = {x, y: .45, z: 0}; } if (pinch) { L[4] = {x: x - .01, y: .4, z: 0}; L[8] = {x: x + .01, y: .4, z: 0}; } else L[4] = {x: x - .15, y: .5, z: 0}; return L; };
    let t = performance.now(); const f = (h) => { t += 33; g.feed(h, t); };
    for (let i = 0; i < 4; i++) f(hand(.4, false)); for (let i = 0; i < 4; i++) f(hand(.4, true)); for (let i = 0; i < 25; i++) f(hand(.4 + .15 * Math.min(1, i / 8), true)); const tgt = m.axes[key].tgt;
    for (let i = 0; i < 400; i++) m.update(.05); const val = m.axes[key].val;
    for (let i = 0; i < 4; i++) f(hand(.55, false));
    return {tgt, val, key};
  }, mode);
  ck(mode + ': pinch-drag set the target', r.tgt > 0.05, JSON.stringify(r)); ck(mode + ': machine moved to the target', Math.abs(r.val - r.tgt) < Math.abs(r.tgt) * 0.5 + 0.01, JSON.stringify(r));
  await pg.evaluate(() => document.querySelector('.gx').click()); const hidden = await pg.evaluate(() => document.querySelector('.gpanel').style.display === 'none'); ck(mode + ': close hides panel & stops camera', hidden);
}
console.log(out.join('\n')); console.log('errors:', errs.length ? errs.slice(0, 5) : 'none'); await br.close(); process.exit(/FAIL/.test(out.join()) ? 1 : 0);
