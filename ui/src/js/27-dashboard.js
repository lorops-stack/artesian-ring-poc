/* Ring Studio · Dashboard: usage (F15), the full accuracy test (F16), the hand heatmap (F24) and recordings (F11). */
var RS = globalThis.RS || (globalThis.RS = {});
(function () {
  'use strict';
  var U = RS.util, h = U.h, L = RS.link, S = RS.store, R = RS.rec, FN = RS.FN, G = RS.geo;

  var D = RS.screens.dashboard = { title: 'Dashboard' };
  D.mount = function (host) {
    var self = this; this.tab = U.store.get('dash.tab', 'usage'); this.run = null; this.viewRun = null;
    var scroll = h('div.scroll'), wrap = h('div.wrap'); scroll.appendChild(wrap); host.appendChild(scroll);
    this.seg = h('div.seg.lg'); this.body = h('div');
    wrap.appendChild(h('div.row.between.wrap.mb', h('div', h('h2', { style: { margin: 0, fontSize: '22px' } }, 'Dashboard'), h('div.sub', 'Usage, accuracy evidence, where hands actually go, and recorded sessions.')), this.seg));
    wrap.appendChild(this.body);
    this.unsub = [R.on('change', function () { self.render(); }), R.on('session', function () { if (self.tab === 'usage' || self.tab === 'recordings') self.render(); }), L.on('status', function () { if (self.tab === 'usage') self.renderUsageTiles(); }), L.on('mode', function () { if (self.tab === 'recordings') self.render(); }), L.on('replayEnd', function () { if (self.tab === 'recordings') self.render(); })];
    this.render();
  };
  D.unmount = function () { this.unsub.forEach(function (u) { u(); }); if (this.run && !this.run.done) this.run.stop(); };
  D.render = function () {
    var self = this; U.empty(this.seg);
    [['usage', 'Usage'], ['accuracy', 'Accuracy'], ['heat', 'Heatmap'], ['recordings', 'Recordings']].forEach(function (t) { self.seg.appendChild(h('button' + (self.tab === t[0] ? '.on' : ''), { onclick: function () { self.tab = t[0]; U.store.set('dash.tab', t[0]); self.render(); } }, t[1])); });
    U.empty(this.body);
    if (this.tab === 'usage') this.renderUsage(); else if (this.tab === 'accuracy') this.renderAccuracy(); else if (this.tab === 'heat') this.renderHeat(); else this.renderRecordings();
  };

  // ---- Usage -------------------------------------------------------------------------------------------------------------------------------------
  D.renderUsage = function () {
    var self = this, hist = R.history, prof = S.profile();
    this.tiles = h('div.grid.c4'); this.body.appendChild(this.tiles); this.renderUsageTiles();
    this.body.appendChild(h('div.callout.mt', h('div.eyebrow', 'How water saved is counted (both parts shown separately)'),
      h('div.sub.mt-s', '1. Off when hands are out: a conventional faucet is assumed to run for the whole session, including soaping and cup-full time, while the ring flows only while a function is actually running.'),
      h('div.sub', '2. Flow rate: ' + (prof.flowGpm || 1.5) + ' gpm against the ' + RS.BASELINE_GPM + ' gpm US federal maximum for kitchen faucets.'),
      h('div.small.faint.mt-s', 'The demo loop (ghost hand) never counts. Totals on the tiles come from the ring; the charts below come from the sessions this browser has seen.')));
    // function mix
    var mix = {}, n = 0; hist.forEach(function (s) { (s.fns || []).forEach(function (f) { mix[f] = (mix[f] || 0) + 1; n++; }); });
    var bar = h('div.row', { style: { height: '14px', borderRadius: '7px', overflow: 'hidden', gap: '2px' } }), legend = h('div.row.wrap.mt-s');
    Object.keys(FN).forEach(function (k) { if (!mix[k]) return; var pct = mix[k] / n * 100; bar.appendChild(h('div', { style: { width: pct + '%', background: FN[k].color, height: '100%' }, title: FN[k].label + ' ' + Math.round(pct) + '%' })); legend.appendChild(h('span.chip', h('span.dot', { style: { background: FN[k].color } }), FN[k].label + ' ' + Math.round(pct) + '%')); });
    this.body.appendChild(h('div.card.mt', h('h3', 'Function mix'), h('div.sub.mb', n ? n + ' function uses across ' + hist.length + ' sessions' : 'No sessions recorded yet. Use the ring (or the simulator) and come back.'), n ? bar : null, n ? legend : null));
    // sessions chart
    var cv = h('canvas', { style: { width: '100%', height: '220px', display: 'block' } });
    this.body.appendChild(h('div.card.mt', h('div.row.between', h('h3', 'Sessions'), h('span.small.dim', 'water used per session (ml), newest on the right')), cv));
    setTimeout(function () { self.drawSessions(cv); }, 0);
    this.body.appendChild(h('div.row.end.mt', h('button.btn.sm.danger', { onclick: function () { RS.app.confirm('Clear the usage history?', 'Sessions, the history table and the heatmap in this browser are removed. Recordings stay. Export first if you need them.', 'Clear', true).then(function (ok) { if (ok) { R.clearHistory(); RS.app.toast('History cleared', 'ok'); } }); } }, 'Clear history'), h('button.btn.sm.primary', { onclick: function () { U.download('ring-usage-' + U.fileStamp() + '.csv', R.historyCsv(), 'text/csv'); } }, 'Export CSV')));
  };
  D.renderUsageTiles = function () {
    if (!this.tiles) return; var st = S.status() || {}, hist = R.history, lats = hist.map(function (s) { return s.lat; }).filter(function (v) { return v != null; });
    var falseOff = hist.reduce(function (a, s) { return a + (s.falseOff || 0); }, 0);
    var tiles = [['Sessions', st.sess || hist.length, ''], ['Water used', U.fmtMl(st.ml || 0), ''], ['Water saved', U.gal((st.savedOff || 0) + (st.savedFlow || 0)).toFixed(2), 'gal · ' + U.gal(st.savedOff || 0).toFixed(2) + ' off when hands out, ' + U.gal(st.savedFlow || 0).toFixed(2) + ' flow rate'], ['Median response', lats.length ? Math.round(U.median(lats)) : '–', 'ms · ' + falseOff + ' false-offs']];
    U.empty(this.tiles); tiles.forEach(function (t) { this.tiles.appendChild(h('div.tile', h('div.v', h('span', t[1]), h('small', t[2].split(' · ')[0])), h('div.l', t[0] + (t[2].indexOf(' · ') >= 0 ? ' · ' + t[2].split(' · ')[1] : '')))); }, this);
  };
  D.drawSessions = function (cv) {
    var W = cv.clientWidth || 600, H = 220, dpr = Math.min(2, devicePixelRatio || 1); cv.width = W * dpr; cv.height = H * dpr; var ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var data = R.history.slice(-120); if (!data.length) { ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = '13px Geist, system-ui'; ctx.fillText('No sessions yet', 12, 30); return; }
    var max = Math.max(1, Math.max.apply(null, data.map(function (s) { return s.used || 0; }))), pad = 28, bw = (W - pad * 2) / data.length;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; [0.25, 0.5, 0.75, 1].forEach(function (f) { var y = H - 24 - (H - 48) * f; ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = '10px "Geist Mono", monospace'; ctx.fillText(Math.round(max * f), 2, y + 3); });
    data.forEach(function (s, i) { var v = (s.used || 0) / max, x = pad + i * bw, hh = (H - 48) * v, fn = (s.fns || []).filter(function (f) { return FN[f] && FN[f].water; })[0] || (s.fns || [])[0]; ctx.fillStyle = fn && FN[fn] ? U.rgba(FN[fn].color, 0.85) : 'rgba(255,255,255,0.35)'; ctx.fillRect(x + 1, H - 24 - hh, Math.max(1, bw - 2), hh); });
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = '10px Geist, system-ui'; ctx.fillText(U.stamp(new Date(data[0].when)), pad, H - 8); ctx.textAlign = 'right'; ctx.fillText(U.stamp(new Date(data[data.length - 1].when)), W - pad, H - 8); ctx.textAlign = 'left';
  };

  // ---- Accuracy (F16) ---------------------------------------------------------------------------------------------------------------------------------
  D.renderAccuracy = function () {
    var self = this, cfg = S.cfg();
    this.accTop = h('div.card'); this.body.appendChild(this.accTop);
    this.accResult = h('div.mt'); this.body.appendChild(this.accResult);
    var runs = R.accuracy.slice().reverse();
    var list = h('div.card.mt', h('h3', 'Past runs'), runs.length ? null : h('div.sub', 'No runs yet.'));
    runs.forEach(function (run) {
      var acc = run.trials.length ? run.trials.filter(function (t) { return t.ok; }).length / run.trials.length : 0;
      var layName = ((cfg.layouts || RS.LAYOUTS)[run.layout] || {}).name || run.layout;
      list.appendChild(h('div.row.between.check', h('div', h('strong', (acc * 100).toFixed(1) + '%'), h('span.dim', '  ' + U.stamp(new Date(run.when)) + ' · ' + layName + ' · ' + run.trials.length + ' trials' + (run.quick ? ' · quick check' : '') + (run.tester ? ' · ' + run.tester : '') + (run.cal && run.cal.name ? ' · cal ' + run.cal.name : ''))),
        h('div.row', h('button.btn.sm', { onclick: function () { self.viewRun = run; self.showResult(run); } }, 'View'), h('button.btn.sm', { onclick: function () { U.download('ring-accuracy-' + U.fileStamp(new Date(run.when)) + '.csv', R.accuracyCsv(run), 'text/csv'); } }, 'CSV'))));
    });
    this.body.appendChild(list);
    this.renderAccTop();
    if (this.viewRun) this.showResult(this.viewRun);
  };
  D.renderAccTop = function () {
    var self = this, box = this.accTop; U.empty(box);
    var run = this.run;
    if (!run || run.done) {
      var per = h('input', { type: 'number', value: U.store.get('acc.per', 20), min: 1, max: 50 }), tester = h('input', { type: 'text', value: U.store.get('acc.tester', ''), placeholder: 'Who is reaching in' });
      box.appendChild(h('h3', 'Accuracy test (F16)'));
      box.appendChild(h('div.sub.mb', 'The UI shows a random zone with a target dot at its centre. The tester reaches in naturally from the front, aims at the dot and stops. No slow, careful placement. ' + (S.zones().filter(function (z) { return z.fn !== 'neutral'; }).length) + ' zones in the ' + S.layoutName() + ' layout; 20 trials per zone is the evidence figure (180 for Kitchen).'));
      box.appendChild(h('div.grid.c3', h('div.field', h('label', 'Trials per zone'), h('div.in', per)), h('div.field', h('label', 'Tester'), h('div.in', tester)), h('div.field', h('label', ' '), h('button.btn.primary', { onclick: function () { var n = U.clamp(parseInt(per.value, 10) || 20, 1, 50); U.store.set('acc.per', n); U.store.set('acc.tester', tester.value); self.startRun(n, tester.value); } }, 'Start'))));
      if (L.mode === 'sim') box.appendChild(h('div.small.faint.mt-s', 'Simulation: move the cursor over the plan to the target dot and hold still, as a hand would. Leave the plan between trials.'));
      return;
    }
    // running
    var plane = S.cfg().plane, cv = h('canvas', { style: { width: '100%', height: '100%' } }), pm = h('div.plan-mini', { style: { height: '360px' } }, cv);
    box.appendChild(h('div.row.between', h('div', h('div.eyebrow', 'Trial ' + Math.min(run.trials.length + 1, run.total) + ' of ' + run.total), self.accPrompt = h('div.big.mt-s')), h('button.btn.danger', { onclick: function () { run.stop(); self.renderAccTop(); } }, 'Stop')));
    box.appendChild(h('div.mt', pm)); self.accCanvas = cv;
    box.appendChild(self.accBar = h('div.bar.mt', h('i', { style: { width: (run.trials.length / run.total * 100) + '%' } })));
    var ptr = function (e) { if (L.mode !== 'sim' || !L.sim) return; var r = cv.getBoundingClientRect(), g = self.accGeom(); if (!g) return; var x = e.clientX - r.left, y = e.clientY - r.top; if (x < g.bx || x > g.bx + g.bw || y < g.by || y > g.by + g.bh) { L.sim.setHand(null, false); return; } L.sim.setHand({ x: (x - g.bx) / g.bw * plane.w, y: (y - g.by) / g.bh * plane.d, h: 110 }, false); };
    cv.addEventListener('pointermove', ptr); cv.addEventListener('pointerdown', ptr); cv.addEventListener('pointerleave', function () { if (L.mode === 'sim' && L.sim) L.sim.setHand(null, false); });
    this.updateRun();
  };
  D.accGeom = function () { var cv = this.accCanvas; if (!cv) return null; var W = cv.clientWidth, H = cv.clientHeight, plane = S.cfg().plane, pad = 16, ar = plane.w / plane.d, bw = Math.min(W - pad * 2, (H - pad * 2) * ar), bh = bw / ar; return { W: W, H: H, bx: (W - bw) / 2, by: (H - bh) / 2, bw: bw, bh: bh }; };
  D.startRun = function (per, tester) {
    var self = this;
    this.run = RS.accuracyRun({ trialsPerZone: per, onUpdate: function () { self.updateRun(); }, onDone: function (run) { run.tester = tester; run.cal = (S.status() || {}).cal || null; run.id = U.uuid(); R.saveAccuracy(run); self.viewRun = run; RS.app.toast('Accuracy run saved', 'ok'); self.render(); } });
    this.renderAccTop();
  };
  D.updateRun = function () {
    var run = this.run; if (!run || !this.accPrompt) return;
    if (run.done) { this.renderAccTop(); return; }
    var zName = run.target ? FN[run.target.fn].label : '';
    this.accPrompt.textContent = run.phase === 'prompt' ? 'Reach for ' + zName : run.phase === 'in' ? 'Hold on ' + zName : 'Hands out';
    if (this.accBar) this.accBar.firstChild.style.width = (run.trials.length / run.total * 100) + '%';
  };
  D.tick = function (now) {
    if (this.tab !== 'accuracy' || !this.run || this.run.done || !this.accCanvas) return;
    var cv = this.accCanvas, g = this.accGeom(), dpr = Math.min(2, devicePixelRatio || 1); if (!g) return;
    if (cv.width !== Math.round(g.W * dpr)) { cv.width = Math.round(g.W * dpr); cv.height = Math.round(g.H * dpr); }
    var ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, g.W, g.H);
    var zones = S.zones(), run = this.run, f = L.latest.frame, plane = S.cfg().plane;
    zones.forEach(function (z) { var x = g.bx + z.x0 * g.bw, y = g.by + z.y0 * g.bh, w = (z.x1 - z.x0) * g.bw, hh = (z.y1 - z.y0) * g.bh; ctx.fillStyle = run.target && run.target.id === z.id ? U.rgba(FN[z.fn].color, 0.18) : 'rgba(255,255,255,0.02)'; ctx.fillRect(x + 2, y + 2, w - 4, hh - 4); ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.strokeRect(x + 2, y + 2, w - 4, hh - 4); ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '12px Geist, system-ui'; ctx.fillText(FN[z.fn].label, x + 10, y + hh - 10); });
    if (run.target) { var c = G.zoneCentre(run.target, plane), tx = g.bx + c.x / plane.w * g.bw, ty = g.by + c.y / plane.d * g.bh, pulse = 1 + 0.15 * Math.sin(now / 200); ctx.strokeStyle = FN[run.target.fn].color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(tx, ty, 18 * pulse, 0, 7); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(tx, ty, 5, 0, 7); ctx.fill(); }
    if (f && f.hx != null && !f.g) { var hx = g.bx + f.hx / plane.w * g.bw, hy = g.by + f.hy / plane.d * g.bh; RS.drawMarker(ctx, S.get('marker'), { x: hx, y: hy, col: f.fn ? FN[f.fn].color : RS.ACCENT, settle: f.set || 0, active: !!f.fn, time: now / 1000, k: 0.7 }); }
  };
  D.showResult = function (run) {
    var box = this.accResult; U.empty(box);
    var n = run.trials.length, ok = run.trials.filter(function (t) { return t.ok; }).length, acc = n ? ok / n : 0, lays = run.layouts || RS.LAYOUTS;
    var lats = run.trials.filter(function (t) { return t.ok && t.ms != null; }).map(function (t) { return t.ms; }).sort(function (a, b) { return a - b; });
    var p90 = lats.length ? lats[Math.min(lats.length - 1, Math.floor(lats.length * 0.9))] : null;
    var conf = R.confusion(run), zones = conf.zones;
    var card = h('div.card', h('div.row.between.wrap', h('div', h('div.eyebrow', (run.quick ? 'Quick check' : 'Accuracy run') + ' · ' + U.stamp(new Date(run.when)) + (run.tester ? ' · ' + run.tester : '')), h('div.row.top.mt-s', h('div', { style: { fontSize: '56px', fontWeight: '600', letterSpacing: '-0.04em', lineHeight: '1', color: acc >= 0.95 ? 'var(--ok)' : acc >= 0.9 ? 'var(--warn)' : 'var(--bad)' } }, (acc * 100).toFixed(1) + '%'), h('div.col.gap-s', { style: { paddingTop: '8px' } }, h('div.sub', ok + ' of ' + n + ' trials · target 95%'), h('div.small.dim', lats.length ? 'median response ' + Math.round(U.median(lats)) + ' ms · 90th percentile ' + p90 + ' ms' : '')))),
      h('div.row', h('button.btn.sm', { onclick: function () { U.download('ring-accuracy-' + U.fileStamp(new Date(run.when)) + '.csv', R.accuracyCsv(run), 'text/csv'); } }, 'Export CSV'), h('button.btn.sm', { onclick: function () { U.download('ring-accuracy-' + U.fileStamp(new Date(run.when)) + '.json', JSON.stringify(run)); } }, 'Export JSON'))));
    // per zone
    var per = {}; zones.forEach(function (z) { per[z.id] = { n: 0, ok: 0 }; }); run.trials.forEach(function (t) { if (per[t.zone]) { per[t.zone].n++; if (t.ok) per[t.zone].ok++; } });
    var worst = null; zones.forEach(function (z) { var p = per[z.id]; if (p.n && (!worst || p.ok / p.n < per[worst.id].ok / per[worst.id].n)) worst = z; });
    var tbl = h('table.t.compact', h('thead', h('tr', h('th', 'Zone'), h('th', 'Trials'), h('th', 'Correct'), h('th', 'Accuracy'))));
    zones.forEach(function (z) { var p = per[z.id]; if (!p.n) return; tbl.appendChild(h('tr', { style: worst && worst.id === z.id && p.ok < p.n ? { color: 'var(--warn)' } : null }, h('td', FN[z.fn].label + ' (row ' + (z.row + 1) + ', col ' + (z.col + 1) + ')'), h('td', p.n), h('td', p.ok), h('td', (p.ok / p.n * 100).toFixed(0) + '%' + (worst && worst.id === z.id && p.ok < p.n ? ' · weakest' : '')))); });
    // confusion matrix
    var m = h('table.t.compact.matrix'), head = h('tr', h('th', 'Prompted ↓ / Latched →')); zones.forEach(function (z) { head.appendChild(h('th', FN[z.fn].label.split(' ')[0])); }); head.appendChild(h('th', 'none')); m.appendChild(h('thead', head));
    conf.M.forEach(function (row, i) { var tr = h('tr', h('td', FN[zones[i].fn].label)); row.forEach(function (v, j) { tr.appendChild(h('td' + (i === j ? '.diag' : (v ? '.off' : '')), v || '')); }); m.appendChild(tr); });
    card.appendChild(h('div.grid.c2.mt', h('div', h('h3', 'Per zone'), tbl), h('div', h('h3', 'Confusion matrix'), m)));
    var codes = RS.accuracyCodes ? RS.accuracyCodes(run) : [];
    if (codes.length) { var fx = h('div.col.gap-s.mt'); codes.forEach(function (c) { fx.appendChild(RS.fixPanel(c)); }); card.appendChild(fx); }
    else if (n && acc < 1) card.appendChild(h('div.callout.warn.mt', 'Misses without a clear pattern. Check the C7 fit error and C8 hand profile, then run again.'));
    box.appendChild(card);
  };

  // ---- Heatmap (F24) -------------------------------------------------------------------------------------------------------------------------------------
  D.renderHeat = function () {
    var self = this, cfg = S.cfg(), lays = cfg.layouts || RS.LAYOUTS, keys = Object.keys(R.heat || {}), lay = this.heatLay && R.heat[this.heatLay] ? this.heatLay : (keys[0] || cfg.layout);
    var seg = h('div.seg'); keys.forEach(function (k) { seg.appendChild(h('button' + (lay === k ? '.on' : ''), { onclick: function () { self.heatLay = k; self.render(); } }, (lays[k] || {}).name || k)); });
    var H = R.heat[lay], cv = h('canvas', { style: { width: '100%', height: '100%' } }), plane = cfg.plane, ar = plane.w / plane.d;
    this.body.appendChild(h('div.card', h('div.row.between.wrap', h('div', h('h3', 'Where hands actually go'), h('div.sub', 'Every tracked hand position while a function was latched, ' + (H ? H.n + ' samples' : 'no samples yet') + '. Evidence for zone sizing.')), h('div.row', seg, h('button.btn.sm.danger', { onclick: function () { RS.app.confirm('Clear the heatmap?', 'All layouts.', 'Clear', true).then(function (ok) { if (ok) { R.heat = {}; U.store.set('rec.heat', R.heat); self.render(); } }); } }, 'Clear'))),
      h('div.heat.mt', { style: { aspectRatio: ar + '', maxWidth: '760px' } }, cv)));
    setTimeout(function () {
      var W = cv.clientWidth || 600, Hh = Math.round(W / ar), dpr = Math.min(2, devicePixelRatio || 1); cv.width = W * dpr; cv.height = Hh * dpr; var ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#101317'; ctx.fillRect(0, 0, W, Hh);
      if (H && H.n) { var max = Math.log(1 + Math.max.apply(null, H.cells)), cw = W / H.nx, ch = Hh / H.ny; for (var j = 0; j < H.ny; j++) for (var i = 0; i < H.nx; i++) { var v = H.cells[j * H.nx + i]; if (!v) continue; var t = Math.log(1 + v) / max; ctx.fillStyle = 'rgba(' + Math.round(255) + ',' + Math.round(120 + 100 * (1 - t)) + ',' + Math.round(60 * (1 - t)) + ',' + (0.15 + 0.85 * t) + ')'; ctx.fillRect(i * cw, j * ch, cw + 0.5, ch + 0.5); } }
      G.zones(lay, lays).forEach(function (z) { ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(z.x0 * W, z.y0 * Hh, (z.x1 - z.x0) * W, (z.y1 - z.y0) * Hh); ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '600 12px Geist, system-ui'; ctx.fillText(FN[z.fn].label, z.x0 * W + 8, z.y0 * Hh + 18); });
    }, 0);
  };

  // ---- Recordings (F11) -------------------------------------------------------------------------------------------------------------------------------------
  D.renderRecordings = function () {
    var self = this, list = h('div.card.solid.mt');
    this.body.appendChild(h('div.row.between.wrap', h('div.sub', 'Sessions recorded by this browser, newest first. A recording replays in the Showcase and is also a regression fixture for the firmware tests (firmware/test/fixtures).'), h('div.row', h('button.btn.sm', { onclick: function () { U.pickFile('.json', function (text) { try { var n = R.importText(text); RS.app.toast('Imported ' + n + ' session' + (n === 1 ? '' : 's'), 'ok'); } catch (e) { RS.app.toast('Import failed: ' + e.message, 'bad'); } }); } }, 'Import'), h('button.btn.sm', { onclick: function () { R.exportAll(); } }, 'Export all'))));
    if (L.mode === 'replay' && L.replay) {
      var rp = L.replay, slider = h('input', { type: 'range', min: 0, max: 1000, value: Math.round((rp.pos || 0) / (rp.total || 1) * 1000) });
      slider.addEventListener('input', function () { L.replaySeek(slider.value / 1000); });
      this.transport = h('div.card.mt', h('div.row.between.wrap', h('div', h('div.eyebrow', 'Replaying'), h('strong', rp.session.name || 'Session')), h('div.row', h('button.btn.sm', { onclick: function () { rp.paused = !rp.paused; if (!rp.paused) { rp.start = U.now() - rp.pos / rp.speed; } self.render(); } }, rp.paused ? 'Resume' : 'Pause'), h('div.seg', [0.5, 1, 2].map(function (sp) { return h('button' + (rp.speed === sp ? '.on' : ''), { onclick: function () { rp.start = U.now() - rp.pos / sp; rp.speed = sp; self.render(); } }, sp + 'x'); })), h('a.btn.sm', { href: '#/show' }, 'Watch'), h('button.btn.sm.danger', { onclick: function () { L.stopReplay(); L.useSim(); self.render(); } }, 'Stop'))), h('div.field.mt-s', h('div.in', slider)));
      this.body.appendChild(this.transport); this.slider = slider;
    }
    var sessions = R.sessions.slice().reverse();
    if (!sessions.length) list.appendChild(h('div.sub', 'No recordings yet. Every real session (not the demo loop) is recorded automatically.'));
    sessions.forEach(function (s) {
      list.appendChild(h('div.row.between.check', h('div.col.gap-s', h('strong', s.name || 'Session'), h('div.small.dim', U.stamp(new Date(s.when)) + ' · ' + U.fmtDur(s.ms || 0) + ' · ' + (s.fns && s.fns.length ? s.fns.map(function (f) { return FN[f] ? FN[f].label : f; }).join(', ') : 'no function') + ' · ' + U.fmtMl(s.used || 0) + ' · ' + s.frames.length + ' frames' + (s.notes ? ' · ' + s.notes : ''))),
        h('div.row', h('button.btn.sm.primary', { onclick: function () { L.playReplay(s, { loop: false }); RS.app.go('show'); } }, 'Play'), h('button.btn.sm', { onclick: function () { R.exportSession(s); } }, 'Export'), h('button.btn.sm.ghost', { onclick: function () { RS.app.prompt('Rename recording', 'Name', s.name).then(function (v) { if (v) R.renameSession(s.id, v); }); } }, 'Rename'), h('button.btn.sm.ghost.danger', { onclick: function () { RS.app.confirm('Delete this recording?', s.name, 'Delete', true).then(function (ok) { if (ok) R.deleteSession(s.id); }); } }, 'Delete'))));
    });
    this.body.appendChild(list);
  };
  var origTick = D.tick;
  D.tick = function (now) { origTick.call(this, now); if (this.tab === 'recordings' && this.slider && L.replay && !L.replay.paused && !this.sliderHeld) this.slider.value = Math.round((L.replay.pos || 0) / (L.replay.total || 1) * 1000); };
})();
