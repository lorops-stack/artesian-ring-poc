// Browser smoke test: serves ui/dist, opens every screen in headless Chromium, drives the simulator with the
// cursor, and fails on any console error. Run: node ui/test/smoke.js   (writes screenshots to ui/test/shots/)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const DIST = path.join(__dirname, '..', 'dist'), SHOTS = path.join(__dirname, 'shots');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.txt': 'text/plain' };
function serve() {
  return new Promise((res) => {
    const srv = http.createServer((req, rsp) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
      const f = path.join(DIST, p);
      if (!f.startsWith(DIST) || !fs.existsSync(f)) { rsp.writeHead(404); return rsp.end(); }
      rsp.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(rsp);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}
(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = await serve(), base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [], logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); else logs.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const shot = (n) => page.screenshot({ path: path.join(SHOTS, n + '.png') });
  const fail = (m) => { console.error('FAIL ' + m); process.exitCode = 1; };

  await page.goto(base + '/#/show'); await page.waitForTimeout(1500);
  const title = await page.title(); if (!/Showcase/.test(title)) fail('title ' + title);
  await shot('01-showcase-idle');
  // move the cursor into the Warm zone (plane coords): basin is at 390..1050 x 168..770 in a 1440x900 stage scaled to fit
  const stage = await page.evaluate(() => { const s = RS.screens.show; return { scale: s.scale, ox: s.ox, oy: s.oy }; });
  const toClient = (sx, sy) => ({ x: stage.ox + sx * stage.scale, y: stage.oy + sy * stage.scale });
  let p = toClient(720, 760); await page.mouse.move(p.x, p.y);           // front edge, warm column
  for (let i = 0; i < 12; i++) { p = toClient(720, 760 - i * 6); await page.mouse.move(p.x, p.y); await page.waitForTimeout(45); }
  await page.waitForTimeout(700);
  let f = await page.evaluate(() => RS.link.latest.frame);
  if (!f || f.fn !== 'warm') fail('expected warm latched, got ' + JSON.stringify(f && { st: f.st, fn: f.fn, zn: f.zn, flag: f.flag, hx: f.hx }));
  await shot('02-showcase-warm');
  // hands out → off after 1 s
  await page.mouse.move(10, 10); await page.waitForTimeout(1500);
  f = await page.evaluate(() => RS.link.latest.frame); if (!f || f.st !== 0) fail('expected IDLE after exit, got st ' + (f && f.st));
  // demo loop starts after 8 s idle
  await page.waitForTimeout(8500);
  const attract = await page.evaluate(() => RS.screens.show.attract); if (!attract) fail('demo loop did not start');
  await page.waitForTimeout(3000); await shot('03-showcase-demo');
  const ghost = await page.evaluate(() => RS.link.latest.frame && RS.link.latest.frame.g === 1); if (!ghost) fail('ghost frames not flowing');
  const sessions = await page.evaluate(() => RS.rec.sessions.length); if (sessions < 1) fail('the real session was not recorded (' + sessions + ')');

  for (const r of ['operator', 'studio', 'aim', 'hw', 'bench', 'tests', 'dashboard', 'settings']) {
    await page.goto(base + '/#/' + r); await page.waitForTimeout(900); await shot('10-' + r);
    const ok = await page.evaluate(() => document.querySelector('.screen') && document.querySelector('.screen').children.length > 0);
    if (!ok) fail(r + ' rendered nothing');
  }
  // operator: engineering panel + cursor latch
  await page.goto(base + '/#/operator'); await page.waitForTimeout(600);
  await page.click('button:has-text("Engineering")'); await page.waitForTimeout(300);
  const plan = await page.$('.op .plan canvas'); const box = await plan.boundingBox();
  const g = await page.evaluate(() => RS.screens.operator.geom());
  for (let i = 0; i < 12; i++) { await page.mouse.move(box.x + g.bx + g.bw * 0.17, box.y + g.by + g.bh * (0.99 - i * 0.015)); await page.waitForTimeout(45); }
  await page.waitForTimeout(600); f = await page.evaluate(() => RS.link.latest.frame);
  if (!f || f.fn !== 'hot') fail('operator: expected hot latched, got ' + JSON.stringify(f && { fn: f.fn, zn: f.zn, flag: f.flag }));
  await shot('11-operator-engineering');
  // aim: demo sweep, then learn the flickering reflector
  await page.goto(base + '/#/aim'); await page.waitForTimeout(600);
  await page.click('button:has-text("Demo sweep")'); await page.waitForTimeout(9000); await shot('15-aim-sweep');
  const aimTxt = await page.evaluate(() => document.querySelector('.screen').innerText);
  if (!/Measured|measured|degrees|°/.test(aimTxt)) fail('aim: no measured aim shown');
  await page.click('button:has-text("Flickering reflector")'); await page.click('button:has-text("Start learning")'); await page.waitForTimeout(6000);
  await shot('16-aim-learn');
  // hardware check: healthy, then a rehearsed fault, then the wave test
  await page.goto(base + '/#/hw'); await page.waitForTimeout(1800);
  let hwTxt = await page.evaluate(() => document.querySelector('.screen').innerText);
  if (!/Both sensors are good/.test(hwTxt)) fail('hw: expected both sensors good, got: ' + hwTxt.slice(0, 200));
  await shot('17-hw-good');
  await page.click('button:has-text("B: no power")'); await page.waitForTimeout(300);
  hwTxt = await page.evaluate(() => document.querySelector('.screen').innerText);
  if (!/Sensor B has no power/.test(hwTxt)) fail('hw: expected the no-power verdict for B');
  await shot('18-hw-fault');
  await page.click('button:has-text("B: no power")'); await page.waitForTimeout(300);
  await page.click('button:has-text("Start wave test")'); await page.waitForTimeout(9500);
  hwTxt = await page.evaluate(() => document.querySelector('.screen').innerText);
  if (!/swung/.test(hwTxt)) fail('hw: wave test produced no result'); await shot('19-hw-wave');
  // bench log: save, change something, compare, restore
  await page.goto(base + '/#/bench'); await page.waitForTimeout(500);
  await page.click('button:has-text("Save snapshot")'); await page.waitForTimeout(300);
  await page.evaluate(() => RS.link.setMany({ 'sensors.A.yaw': 63 })); await page.waitForTimeout(300);
  await page.click('button:has-text("Compare with now")'); await page.waitForTimeout(300);
  const cmpTxt = await page.evaluate(() => document.querySelector('.screen').innerText);
  if (!/sensors\.A\.yaw/.test(cmpTxt)) fail('bench: comparison did not show the changed yaw'); await shot('20-bench');
  await page.click('button:has-text("Restore setup")'); await page.waitForTimeout(200); await page.click('.modal button:has-text("Restore")'); await page.waitForTimeout(500);
  const yaw = await page.evaluate(() => RS.link.latest.cfg.sensors.A.yaw); if (yaw === 63) fail('bench: restore did not put the yaw back');
  // studio: run C0 to completion
  await page.goto(base + '/#/studio/c0'); await page.waitForTimeout(700);
  const runBtn = await page.$('button:has-text("Run hardware check")'); if (!runBtn) fail('no Run hardware check button'); else await runBtn.click();
  for (let i = 0; i < 40; i++) { await page.waitForTimeout(400); const cal = await page.evaluate(() => RS.link.latest.cal); if (cal && cal.state === 'waiting') { const b = await page.$('button:has-text("Done, continue")'); if (b) await b.click(); } if (cal && cal.state === 'done') break; }
  const c0 = await page.evaluate(() => RS.link.latest.cal); if (!c0 || c0.state !== 'done') fail('C0 did not finish: ' + JSON.stringify(c0 && c0.state)); await shot('12-studio-c0');
  await page.goto(base + '/#/studio/c5'); await page.waitForTimeout(800); await shot('13-studio-c5');
  await page.goto(base + '/#/studio/c7'); await page.waitForTimeout(600); await shot('14-studio-c7');
  // dashboard accuracy tab
  await page.goto(base + '/#/dashboard'); await page.waitForTimeout(500); await page.click('.seg button:has-text("Accuracy")'); await page.waitForTimeout(400); await shot('15-dashboard-accuracy');
  await page.click('.seg button:has-text("Recordings")'); await page.waitForTimeout(400); await shot('16-dashboard-recordings');
  // replay the recorded session
  const play = await page.$('button:has-text("Play")'); if (play) { await play.click(); await page.waitForTimeout(1500); const mode = await page.evaluate(() => RS.link.mode); if (mode !== 'replay') fail('replay did not start'); await shot('17-replay'); }

  const realErrors = errors.filter((e) => !/favicon|AudioContext|autoplay/i.test(e));
  if (realErrors.length) { fail('console errors:\n' + realErrors.join('\n')); }
  console.log((process.exitCode ? 'SMOKE FAILED' : 'SMOKE OK') + ' · ' + errors.length + ' console warnings/errors · screenshots in ui/test/shots');
  await browser.close(); srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
