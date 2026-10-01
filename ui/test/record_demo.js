// Records a demo video of Ring Studio in headless Chromium (Playwright). Run: node ui/test/record_demo.js
// Output: ui/test/demo/ring-studio-demo.webm (convert with ffmpeg; see tools/make_demo_video.sh)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const DIST = path.join(__dirname, '..', 'dist'), OUT = path.join(__dirname, 'demo');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
function serve() { return new Promise((res) => { const srv = http.createServer((req, rsp) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(DIST, p); if (!f.startsWith(DIST) || !fs.existsSync(f)) { rsp.writeHead(404); return rsp.end(); } rsp.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(rsp); }); srv.listen(0, '127.0.0.1', () => res(srv)); }); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve(), base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: OUT, size: { width: 1440, height: 900 } }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(base + '/#/show'); await sleep(2200);
  const st = await page.evaluate(() => { const s = RS.screens.show; return { scale: s.scale, ox: s.ox, oy: s.oy }; });
  const C = (sx, sy) => ({ x: st.ox + sx * st.scale, y: st.oy + sy * st.scale });
  // Zone centres in plane fractions (kitchen); the page drives a smooth scripted hand (RS.screens.show.driveHand)
  const Z = { soap: [0.17, 0.17], disposal: [0.5, 0.17], cup: [0.83, 0.17], wfL: [0.17, 0.5], neutral: [0.5, 0.5], wfR: [0.83, 0.5], hot: [0.17, 0.83], warm: [0.5, 0.83], cold: [0.83, 0.83] };
  const drive = (segs) => page.evaluate((segs) => RS.screens.show.driveHand(segs), segs);
  await page.mouse.move(60, 450); await sleep(500);
  // 1 soap, then warm (through the neutral middle, the way a hand crosses a sink)
  await drive([{ to: Z.soap, ms: 900 }, { hold: 700 }, { to: Z.neutral, ms: 450 }, { to: Z.warm, ms: 450 }, { hold: 2800 }, { out: 500 }]); await sleep(2000);
  // 2 cup fill to full
  await drive([{ to: Z.cup, ms: 900 }, { hold: 4600 }, { out: 500 }]); await sleep(1800);
  // 3 disposal: one second hold, hands out, it keeps running
  await drive([{ to: Z.disposal, ms: 900 }, { hold: 1500 }, { out: 500 }]); await sleep(2600);
  // 4 another marker style on the hot zone
  await page.click('.pillbar.small button:has-text("Glass droplet")'); await sleep(300);
  await drive([{ to: Z.hot, ms: 800 }, { hold: 2200 }, { out: 500 }]); await sleep(1600);
  await page.click('.pillbar.small button:has-text("Focus lock")');
  // 5 bathroom layout: the waterfall is the back centre zone
  await page.click('.pillbar button:has-text("Bathroom")'); await sleep(900);
  await drive([{ to: [0.5, 0.25], ms: 900 }, { hold: 2200 }, { out: 500 }]); await sleep(1600);
  await page.click('.pillbar button:has-text("Kitchen")'); await sleep(600);
  // 6 operator view with engineering
  await page.goto(base + '/#/operator'); await sleep(900);
  await page.click('button:has-text("Engineering")'); await sleep(500);
  const g = await page.evaluate(() => RS.screens.operator.geom()), plan = await page.$('.op .plan canvas'), box = await plan.boundingBox();
  const PC = (xf, yf) => ({ x: box.x + g.bx + g.bw * xf, y: box.y + g.by + g.bh * yf });
  let q = PC(0.5, 0.99); await page.mouse.move(q.x, q.y); await sleep(150);
  for (let i = 0; i <= 25; i++) { const t = i / 25; q = PC(0.5 + 0.33 * t, 0.99 - 0.82 * t); await page.mouse.move(q.x, q.y); await sleep(35); }
  for (let k = 0; k < 36; k++) { q = PC(0.83 + 0.004 * Math.sin(k), 0.17 + 0.004 * Math.cos(k)); await page.mouse.move(q.x, q.y); await sleep(60); }
  await page.mouse.move(20, 450); await sleep(1800);
  // 7 back to the showcase to let the demo loop show for a few seconds
  await page.goto(base + '/#/show'); await sleep(1200);
  await page.evaluate(() => { RS.screens.show.lastUserT = -1e9; }); await sleep(6000);
  await ctx.close(); await browser.close(); srv.close();
  const files = fs.readdirSync(OUT).filter((f) => f.endsWith('.webm'));
  fs.renameSync(path.join(OUT, files[0]), path.join(OUT, 'ring-studio-demo.webm'));
  console.log('recorded ui/test/demo/ring-studio-demo.webm');
})().catch((e) => { console.error(e); process.exit(1); });
