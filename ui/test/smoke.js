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

  for (const r of ['operator', 'studio', 'tests', 'dashboard', 'settings']) {
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
