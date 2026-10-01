/* Ring Studio · Operator view: plan view of the sink, the Now card, metric tiles, state strip, and the Engineering
   panel (live echo traces F1, range circles, frame rates, why nothing latches A6). */
var RS = globalThis.RS || (globalThis.RS = {});
(function () {
  'use strict';
  var U = RS.util, h = U.h, L = RS.link, S = RS.store, FN = RS.FN, ST = RS.ST, rgba = U.rgba;

  var OP = RS.screens.operator = { title: 'Operator view' };
  OP.mount = function (host) {
    var self = this; this.host = host;
    this.frame = null; this.vis = { x: null, y: null }; this.lastT = 0; this.events = []; this.latchAt = -1e9; this.soapUntil = 0; this.userHand = null;
    var root = h('div.op'); host.appendChild(root);
    // plan
    this.plan = h('div.plan'); this.canvas = h('canvas', { 'aria-label': 'Plan view of the sink' }); this.plan.appendChild(this.canvas);
    this.caption = h('div.small.dim', { style: { position: 'absolute', left: '26px', top: '20px' } });
    this.phasePill = h('div.chip', { style: { position: 'absolute', right: '22px', top: '16px' } }, this.phaseDot = h('span.dot'), this.phaseText = h('span'));
    this.plan.appendChild(this.caption); this.plan.appendChild(this.phasePill);
    root.appendChild(this.plan);
    // side
    var side = h('div.side'); root.appendChild(side);
    var cfg = S.cfg();
    this.layoutSeg = h('div.seg'); this.unitSeg = h('div.seg');
    side.appendChild(h('div.row.between.wrap', this.layoutSeg, h('div.row', this.unitSeg, this.engBtn = h('button.btn.sm', { onclick: function () { S.toggle('engineering'); self.refreshControls(); } }, 'Engineering'), h('a.btn.sm.primary', { href: '#/studio' }, 'Calibrate'))));
    this.now = { title: h('div.big'), sub: h('div.sub'), detail: h('div.small.dim.num'), ringVal: h('div.num', { style: { fontSize: '26px', fontWeight: '600' } }), ringLbl: h('div.tiny.dim'), arc: null, label: h('span') };
    var ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'); svg.setAttribute('width', '124'); svg.setAttribute('height', '124'); svg.setAttribute('viewBox', '0 0 132 132');
    svg.innerHTML = '<circle cx="66" cy="66" r="56" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="9"/><circle class="arc" cx="66" cy="66" r="56" fill="none" stroke="#8FE3F2" stroke-width="9" stroke-linecap="round" stroke-dasharray="351.86" stroke-dashoffset="351.86" transform="rotate(-90 66 66)" style="transition: stroke-dashoffset .12s linear, stroke .3s ease"/>';
    this.now.arc = svg.querySelector('.arc');
    side.appendChild(h('div.card', h('div.row.gap-s.eyebrow', this.nowDot = h('span.dot', { style: { width: '8px', height: '8px', borderRadius: '4px', background: RS.ACCENT } }), this.now.label),
      h('div.row.between.top.mt', h('div.col.gap-s.grow', this.now.title, this.now.sub, this.now.detail), h('div', { style: { position: 'relative', width: '124px', height: '124px', flex: '0 0 auto' } }, svg, h('div', { style: { position: 'absolute', inset: '0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' } }, this.now.ringVal, this.now.ringLbl)))));
    this.tiles = h('div.grid.c2'); side.appendChild(this.tiles);
    this.strip = h('div.state-strip'); side.appendChild(this.strip);
    this.why = h('div.why'); side.appendChild(h('div.card.tight', h('div.eyebrow', 'Why nothing latches'), h('div.mt-s', this.why)));
    this.eng = h('div.col.gap-s'); side.appendChild(this.eng);
    this.actions = h('div.row.wrap'); side.appendChild(this.actions);
    this.buildEngineering(); this.refreshControls();
    this.unsub = [
      L.on('frame', function (f) { if (!f.g) self.frame = f; }),
      L.on('event', function (e) { if (e.g) return; self.events.unshift(e); if (self.events.length > 12) self.events.pop(); if (e.ev === 'latch') self.latchAt = U.now(); if (e.ev === 'soap') self.soapUntil = U.now() + 1500; }),
      L.on('cfg', function () { self.refreshControls(); }), L.on('mode', function () { self.refreshControls(); }), L.on('health', function (hh) { self.health = hh; }),
      S.on('change', function () { self.refreshControls(); })
    ];
    var cv = this.canvas;
    var pt = function (e) { var r = cv.getBoundingClientRect(); var g = self.geom(); if (!g) return null; var x = e.clientX - r.left, y = e.clientY - r.top; if (x < g.bx || x > g.bx + g.bw || y < g.by || y > g.by + g.bh) return null; var plane = S.cfg().plane; return { x: U.clamp((x - g.bx) / g.bw, 0, 0.9999) * plane.w, y: U.clamp((y - g.by) / g.bh, 0, 0.9999) * plane.d, h: 110 }; };
    cv.addEventListener('pointermove', function (e) { self.userHand = pt(e); if (L.mode === 'sim') L.sim.setHand(self.userHand, false); });
    cv.addEventListener('pointerdown', function (e) { RS.sound.unlockOnGesture(); self.userHand = pt(e); if (L.mode === 'sim') L.sim.setHand(self.userHand, false); });
    cv.addEventListener('pointerleave', function () { self.userHand = null; if (L.mode === 'sim') L.sim.setHand(null, false); });
    cv.addEventListener('pointerup', function (e) { if (e.pointerType !== 'mouse') { self.userHand = null; if (L.mode === 'sim') L.sim.setHand(null, false); } });
  };
  OP.unmount = function () { this.unsub.forEach(function (u) { u(); }); if (L.mode === 'sim' && L.sim) L.sim.setHand(null, false); };
  OP.geom = function () {
    var W = this.plan.clientWidth, H = this.plan.clientHeight; if (!W || !H) return null;
    var plane = S.cfg().plane, pad = 70, aw = W - pad * 2, ah = H - pad * 2 - 20, ar = plane.w / plane.d;
    var bw = Math.min(aw, ah * ar), bh = bw / ar, bx = (W - bw) / 2, by = (H - bh) / 2 + 10;
    return { W: W, H: H, bx: bx, by: by, bw: bw, bh: bh, rx: bx - 26, ry: by - 26, rw: bw + 52, rh: bh + 52 };
  };
  OP.refreshControls = function () {
    var self = this, cfg = S.cfg(), lays = cfg.layouts || RS.LAYOUTS;
    U.empty(this.layoutSeg); Object.keys(lays).forEach(function (k) { self.layoutSeg.appendChild(h('button' + (cfg.layout === k ? '.on' : ''), { onclick: function () { L.send({ c: 'layout', layout: k }); } }, lays[k].name)); });
    U.empty(this.unitSeg); ['F', 'C'].forEach(function (u) { self.unitSeg.appendChild(h('button' + (S.get('unit') === u ? '.on' : ''), { onclick: function () { S.set('unit', u); } }, '°' + u)); });
    this.engBtn.classList.toggle('on', !!S.get('engineering'));
    this.eng.classList.toggle('hide', !S.get('engineering'));
    this.caption.textContent = S.layoutName() + ' layout · ' + U.fmtLen(cfg.plane.w, S.get('lenUnit'), 0) + ' × ' + U.fmtLen(cfg.plane.d, S.get('lenUnit'), 0) + (L.mode === 'sim' ? ' · simulation: your cursor is the hand' : '');
    U.empty(this.actions);
    var f = this.frame;
    this.actions.appendChild(h('button.btn.sm', { onclick: function () { L.send({ c: 'clean', a: (self.frame && self.frame.st === ST.CLEAN) ? 'end' : 'start' }); } }, (f && f.st === ST.CLEAN) ? 'End clean mode' : 'Clean mode'));
    this.actions.appendChild(h('button.btn.sm', { onclick: function () { self.exportLast(); } }, 'Export last session'));
    this.actions.appendChild(h('a.btn.sm', { href: '#/dashboard' }, 'Dashboard'));
    if (L.mode === 'sim') this.actions.appendChild(h('button.btn.sm', { onclick: function () { RS.faultsPanel(); } }, 'Inject a fault (T30)'));
  };
  OP.exportLast = function () { var s = RS.rec.sessions[RS.rec.sessions.length - 1]; if (!s) return RS.app.toast('No recorded session yet', 'warn'); RS.rec.exportSession(s); RS.app.toast('Session exported', 'ok'); };
  OP.buildEngineering = function () {
    var self = this;
    this.echoA = h('canvas'); this.echoB = h('canvas');
    this.engStats = h('div.grid.c4');
    this.eng.appendChild(h('div.card.tight', h('div.row.between', h('div.eyebrow', 'Live echoes · A'), this.engA = h('span.small.dim.mono')), h('div.echo.mt-s', this.echoA),
      h('div.row.between.mt', h('div.eyebrow', 'Live echoes · B'), this.engB = h('span.small.dim.mono')), h('div.echo.mt-s', this.echoB), h('div.mt', this.engStats),
      h('div.small.faint.mt-s', 'Distance along the bar, 60 to 850 mm; bar height is echo strength. The lit echo is the pair used for the fix. Range circles are drawn on the plan.')));
    this.evList = h('div.col.gap-s'); this.eng.appendChild(h('div.card.tight', h('div.eyebrow', 'Recent events'), h('div.mt-s', this.evList)));
  };
  OP.drawEchoes = function (cv, sensor, col, cfg) {
    var W = cv.clientWidth || 300, H = cv.clientHeight || 74, dpr = Math.min(2, devicePixelRatio || 1);
    if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
    var ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    var r0 = cfg.tuning.rangeStart, r1 = cfg.tuning.rangeEnd, X = function (d) { return 10 + (W - 20) * U.clamp((d - r0) / (r1 - r0), 0, 1); };
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(10, H - 14); ctx.lineTo(W - 10, H - 14); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = '10px "Geist Mono", monospace';
    for (var d = 100; d <= r1; d += 100) { var x = X(d); ctx.fillRect(x, H - 16, 1, 3); if (d % 200 === 0) ctx.fillText(d, x - 8, H - 3); }
    if (!sensor) return;
    var e = sensor.e || [], strMax = Math.max(cfg.hand.strMax, 1), lg = function (s) { return Math.log10(1 + Math.max(0, s)) / Math.log10(1 + strMax); };
    for (var i = 0; i < e.length; i++) {
      var x2 = X(e[i][0]), hh = 8 + (H - 30) * lg(e[i][1]), pick = sensor.p === i;
      ctx.fillStyle = pick ? col : rgba(col, 0.28); ctx.shadowColor = pick ? col : 'transparent'; ctx.shadowBlur = pick ? 12 : 0;
      ctx.fillRect(x2 - 2, H - 14 - hh, 4, hh); ctx.shadowBlur = 0;
      if (pick) { ctx.fillStyle = '#fff'; ctx.font = '500 10.5px "Geist Mono", monospace'; ctx.fillText(e[i][0] + ' mm', x2 + 6, H - 14 - hh + 4); }
    }
    // hand strength window
    ctx.fillStyle = 'rgba(255,255,255,0.04)'; var yMin = H - 14 - (8 + (H - 30) * lg(cfg.hand.strMin)), yMax = H - 14 - (8 + (H - 30) * lg(cfg.hand.strMax)); ctx.fillRect(10, yMax, W - 20, Math.max(0, yMin - yMax));
  };
  OP.tick = function (now) {
    var g = this.geom(); if (!g) return;
    var cv = this.canvas, dpr = Math.min(2, devicePixelRatio || 1);
    if (cv.width !== Math.round(g.W * dpr) || cv.height !== Math.round(g.H * dpr)) { cv.width = Math.round(g.W * dpr); cv.height = Math.round(g.H * dpr); }
    var ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, g.W, g.H);
    var dt = Math.min(0.05, (now - (this.lastT || now)) / 1000); this.lastT = now;
    var f = this.frame, cfg = S.cfg(), plane = cfg.plane, zones = S.zones(), time = now / 1000, i;
    var active = f && f.fn && (f.st === ST.ACTIVE || f.st === ST.CUP_FULL || f.st === ST.EXIT_PENDING) ? f.fn : null;
    var col = f && f.st === ST.CLEAN ? '#E8EEF4' : active ? FN[active].color : (now < this.soapUntil ? FN.soap.color : RS.ACCENT);
    var hov = f && f.zn ? RS.geo.zoneById(zones, f.zn) : null, blocked = !hov || hov.fn === 'neutral' || (hov.fn === 'soap' && (f.lk & 1)) || (hov.fn === 'disposal' && ((f.lk & 2) || f.dsp > 0));
    if (!active && hov && !blocked && f.hx != null) col = FN[hov.fn].color;
    // ring
    var rr = function (x, y, w, hh, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + hh, r); ctx.arcTo(x + w, y + hh, x, y + hh, r); ctx.arcTo(x, y + hh, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
    var glow = active ? 0.7 : (f && f.hx != null ? 0.25 + 0.4 * (f.set || 0) : 0.12);
    ctx.save(); ctx.shadowColor = rgba(col, glow); ctx.shadowBlur = 40; ctx.fillStyle = '#151A20'; rr(g.rx, g.ry, g.rw, g.rh, 40); ctx.fill(); ctx.restore();
    ctx.lineWidth = 3; ctx.strokeStyle = rgba(col, 0.35 + 0.65 * glow); rr(g.rx + 1.5, g.ry + 1.5, g.rw - 3, g.rh - 3, 39); ctx.stroke();
    if (f && f.st === ST.EXIT_PENDING) { ctx.setLineDash([]); ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = 3; ctx.beginPath(); var per = 2 * (g.rw + g.rh), L2 = per * f.ex; ctx.setLineDash([L2 / 2, per]); ctx.lineDashOffset = -(g.rw / 2); rr(g.rx + 1.5, g.ry + 1.5, g.rw - 3, g.rh - 3, 39); ctx.stroke(); ctx.setLineDash([]); }
    // basin
    var bg = ctx.createRadialGradient(g.bx + g.bw / 2, g.by + g.bh * 0.42, 10, g.bx + g.bw / 2, g.by + g.bh / 2, g.bw * 0.7); bg.addColorStop(0, '#1C222A'); bg.addColorStop(0.58, '#11151A'); bg.addColorStop(1, '#0B0E12');
    ctx.fillStyle = bg; rr(g.bx, g.by, g.bw, g.bh, 28); ctx.fill();
    ctx.save(); rr(g.bx, g.by, g.bw, g.bh, 28); ctx.clip();
    // zones
    ctx.font = '500 12px Geist, system-ui'; ctx.textBaseline = 'alphabetic';
    for (i = 0; i < zones.length; i++) {
      var z = zones[i], zx = g.bx + z.x0 * g.bw, zy = g.by + z.y0 * g.bh, zw = (z.x1 - z.x0) * g.bw, zh = (z.y1 - z.y0) * g.bh, fz = FN[z.fn];
      var isHov = hov && hov.id === z.id, isAct = active && z.fn === active && isHov, dim = f && ((z.fn === 'soap' && (f.lk & 1)) || (z.fn === 'disposal' && (f.lk & 2) && !(f.dsp > 0)));
      ctx.fillStyle = isAct ? rgba(fz.color, 0.16) : (isHov && !blocked && !active ? rgba(fz.color, 0.05 + 0.1 * (f.set || 0)) : 'rgba(255,255,255,0.015)');
      rr(zx + 4, zy + 4, zw - 8, zh - 8, 16); ctx.fill();
      ctx.strokeStyle = isAct || (isHov && !blocked) ? rgba(fz.color, 0.5) : 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1; ctx.stroke();
      var la = isAct ? 0.95 : isHov ? 0.7 : dim ? 0.15 : 0.35;
      ctx.save(); ctx.translate(zx + 16, zy + 14); ctx.scale(0.9, 0.9); ctx.strokeStyle = (isAct || isHov) ? rgba(fz.color, la) : 'rgba(255,255,255,' + la + ')'; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(new Path2D(fz.icon)); ctx.restore();
      ctx.fillStyle = isAct ? '#fff' : 'rgba(255,255,255,' + la + ')'; ctx.fillText(fz.label, zx + 16, zy + zh - 14);
      if (zh > 60) { ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.font = '11px Geist, system-ui'; ctx.fillText(this.zoneSub(z.fn), zx + 16, zy + zh - 30); ctx.font = '500 12px Geist, system-ui'; }
    }
    // drain and disposal
    var DX = g.bx + g.bw / 2, DY = g.by + g.bh / 2;
    ctx.fillStyle = '#080A0D'; ctx.beginPath(); ctx.arc(DX, DY, 22, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 2; ctx.stroke();
    if (f && f.dsp > 0) { ctx.save(); ctx.translate(DX, DY); ctx.rotate(time * 5); ctx.setLineDash([6, 6]); ctx.strokeStyle = FN.disposal.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 32, 0, 7); ctx.stroke(); ctx.restore(); }
    // water
    if (f && f.st === ST.ACTIVE && active && FN[active].water) {
      var wide = active === 'waterfall', wdt = wide ? g.bw * 0.5 : (active === 'cup' ? 10 : 24), fx = g.bx + g.bw / 2 - wdt / 2, fy = g.by, fh = g.bh * 0.46;
      var wg = ctx.createLinearGradient(0, fy, 0, fy + fh); wg.addColorStop(0, rgba(FN[active].color, 0.75)); wg.addColorStop(1, rgba(FN[active].color, 0.15));
      ctx.fillStyle = wg; rr(fx, fy - 20, wdt, fh + 20, 14); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; for (i = 0; i < 6; i++) { var yy = fy + ((time * 260 + i * fh / 6) % fh); ctx.fillRect(fx + 2, yy, wdt - 4, 3); }
    }
    // range circles (engineering)
    if (S.get('engineering') && f && f.A && f.B && f.A.p != null && f.B.p != null) {
      var mmpx = g.bw / plane.w, sA = cfg.sensors.A, sB = cfg.sensors.B;
      [[sA, f.A.e[f.A.p], '#4FD1E8'], [sB, f.B.e[f.B.p], '#FFB27A']].forEach(function (q) {
        if (!q[1]) return; var r = q[1][0] - (q[0].off || 0), v = cfg.hand.zwork + q[0].z, pl = Math.sqrt(Math.max(0, r * r - v * v)) * mmpx;
        ctx.setLineDash([5, 6]); ctx.strokeStyle = rgba(q[2], 0.55); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(g.bx + q[0].x * mmpx, g.by + q[0].y * mmpx, pl, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      });
    }
    // hand
    if (f && f.hx != null) {
      var tx = g.bx + f.hx / plane.w * g.bw, ty = g.by + f.hy / plane.d * g.bh;
      if (this.vis.x == null) { this.vis.x = tx; this.vis.y = ty; } else { var k = 1 - Math.exp(-dt * 18); this.vis.x += (tx - this.vis.x) * k; this.vis.y += (ty - this.vis.y) * k; }
      RS.drawMarker(ctx, S.get('marker'), { x: this.vis.x, y: this.vis.y, col: col, settle: blocked ? 0 : (f.set || 0), active: !!active || now < this.soapUntil, time: time, k: 0.85, latchAge: (now - this.latchAt) / 1000, label: 'x ' + Math.round(f.hx) + ' y ' + Math.round(f.hy) + ' mm', bounds: { x0: g.bx, x1: g.bx + g.bw, y0: g.by, y1: g.by + g.bh }, A: { x: g.bx + cfg.sensors.A.x / plane.w * g.bw, y: g.by + cfg.sensors.A.y / plane.d * g.bh, c: '#4FD1E8' }, B: { x: g.bx + cfg.sensors.B.x / plane.w * g.bw, y: g.by + cfg.sensors.B.y / plane.d * g.bh, c: '#FFB27A' }, mm: g.bw / plane.w });
    } else this.vis.x = null;
    ctx.restore();
    // sensors
    [['A', cfg.sensors.A, '#4FD1E8'], ['B', cfg.sensors.B, '#FFB27A']].forEach(function (q) {
      var x = g.bx + U.clamp(q[1].x / plane.w, 0, 1) * g.bw, y = g.by + U.clamp(q[1].y / plane.d, 0, 1) * g.bh;
      ctx.fillStyle = '#0C0F13'; ctx.beginPath(); ctx.arc(x, y, 11, 0, 7); ctx.fill(); ctx.strokeStyle = q[2]; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = q[2]; ctx.font = '700 10px Geist, system-ui'; ctx.textAlign = 'center'; ctx.fillText(q[0], x, y + 3.5); ctx.textAlign = 'left';
    });
    if (now - (this.hudT || 0) > 120) { this.hudT = now; this.pushSide(f, col, active, hov, blocked); }
  };
  OP.zoneSub = function (fn) {
    var p = S.profile();
    switch (fn) { case 'soap': return p.soapMl + ' ml dose'; case 'disposal': return 'hold 1 s · 15 s run'; case 'cup': return p.cupMl + ' ml · cold'; case 'waterfall': return S.temp('waterfall') + ' sheet'; case 'hot': return S.temp('hot') + ' · cap ' + S.temp('hotcap'); case 'warm': return S.temp('warm'); case 'cold': return 'mains'; default: return 'hold 3 s to clean'; }
  };
  OP.pushSide = function (f, col, active, hov, blocked) {
    var self = this, cfg = S.cfg(), st = S.status() || {}, prof = S.profile(), N = this.now;
    var phase = f ? RS.ST_LABEL[f.st] : 'Idle'; if (f && f.dsp > 0 && f.st === ST.IDLE) phase = 'Disposal running';
    this.phaseDot.style.background = col; this.phaseText.textContent = phase; this.nowDot.style.background = col; N.label.textContent = phase;
    var title = 'Wave in', sub = 'Nothing latched. Move a hand into the sink.', detail = '', ringFrac = 0, ringVal = '–', ringLbl = '';
    if (f) {
      if (f.st === ST.CLEAN) { title = 'Cleaning'; sub = 'Nothing starts while you wipe the sink.'; ringFrac = (f.cln || 0) / (cfg.tuning.cleanMs / 1000); ringVal = Math.ceil(f.cln || 0); ringLbl = 's left'; }
      else if (f.st === ST.EXIT_PENDING) { title = 'Off in ' + (f.ex * cfg.tuning.exitMs / 1000).toFixed(1) + ' s'; sub = 'Hands out. Everything stops in one second unless a hand comes back.'; ringFrac = f.ex; ringVal = (f.ex * cfg.tuning.exitMs / 1000).toFixed(1); ringLbl = 'seconds'; }
      else if (active) {
        title = FN[active].label; sub = this.zoneSub(active); detail = 'Latched. The hand can move anywhere; other zones are ignored.';
        if (active === 'cup') { ringFrac = (f.cup || 0) / prof.cupMl; ringVal = Math.round(f.cup || 0); ringLbl = '/ ' + prof.cupMl + ' ml'; if (f.st === ST.CUP_FULL) { title = 'Cup full'; sub = 'Water off, still latched until hands leave.'; } }
        else { ringFrac = 1; ringVal = (prof.flowGpm || 1.5); ringLbl = 'gpm'; }
      } else if (f.dsp > 0 && f.hx == null) { title = 'Disposal'; sub = 'Running with no hand in the sink. Stops on a settle in any other zone.'; ringFrac = f.dsp / (cfg.tuning.disposalRunMs / 1000); ringVal = Math.ceil(f.dsp); ringLbl = 's left'; }
      else if (f.hx != null) {
        if (hov && !blocked) { title = FN[hov.fn].label; sub = hov.fn === 'disposal' ? 'Hold still one second to start.' : 'Settling…'; ringFrac = f.set || 0; ringVal = Math.round((f.set || 0) * 100); ringLbl = '% settled'; }
        else if (hov && hov.fn === 'neutral') { title = 'Neutral'; sub = 'Nothing starts here. Hold 3 s for clean mode.'; }
        else if (hov) { title = FN[hov.fn].label; sub = 'Used this session. Hands out to reset.'; }
        else { title = 'Tracking'; sub = 'Between zones.'; }
        detail = 'x ' + Math.round(f.hx) + ' mm · y ' + Math.round(f.hy) + ' mm · ' + Math.round(f.spd || 0) + ' mm/s';
      }
    }
    N.title.textContent = title; N.title.style.color = active ? col : ''; N.sub.textContent = sub; N.detail.textContent = detail;
    N.arc.setAttribute('stroke', col); N.arc.setAttribute('stroke-dashoffset', String(351.86 * (1 - U.clamp(ringFrac, 0, 1)))); N.ringVal.textContent = ringVal; N.ringLbl.textContent = ringLbl;
    // tiles
    var lat = f && f.lat != null ? f.lat : null; var lastLatch = this.events.find(function (e) { return e.ev === 'latch'; }); if (lastLatch) lat = lastLatch.lat;
    var hh = this.health || {};
    var tiles = S.get('engineering') ? [
      ['Frame rate A / B', (f && f.A ? f.A.hz.toFixed ? f.A.hz.toFixed(1) : f.A.hz : '–') + ' / ' + (f && f.B ? (f.B.hz.toFixed ? f.B.hz.toFixed(1) : f.B.hz) : '–'), 'Hz'],
      ['I2C errors A / B', (f && f.A ? f.A.er : '–') + ' / ' + (f && f.B ? f.B.er : '–'), ''],
      ['Still for', f ? (f.still || 0).toFixed(1) : '–', 's · threshold ' + cfg.hand.stillThr + ' mm'],
      ['False-offs · held on', (hh.falseOff == null ? 0 : hh.falseOff) + ' · ' + (hh.heldOn == null ? 0 : hh.heldOn), '']
    ] : [
      ['Response', lat == null ? '–' : lat, 'ms'],
      ['Water saved', U.gal((st.savedOff || 0) + (st.savedFlow || 0)).toFixed(2), 'gal'],
      ['Sessions', st.sess || 0, ''],
      ['Water used', U.fmtMl(st.ml || 0), '']
    ];
    if (this.tiles.childNodes.length !== 4) { U.empty(this.tiles); tiles.forEach(function () { self.tiles.appendChild(h('div.tile', h('div.v', h('span'), h('small')), h('div.l'))); }); }
    tiles.forEach(function (t, i) { var el = self.tiles.childNodes[i]; el.querySelector('.v span').textContent = t[1]; el.querySelector('.v small').textContent = t[2]; el.querySelector('.l').textContent = t[0]; });
    // strip
    var stI = f ? (f.st === ST.CUP_FULL ? 2 : f.st === ST.CLEAN ? 4 : f.st) : 0; if (f && f.dsp > 0 && f.st === ST.IDLE) stI = 2;
    if (!this.strip.childNodes.length) ['Idle', 'Tracking', 'Active', 'Off in 1 s', 'Cleaning'].forEach(function (n) { self.strip.appendChild(h('span', n)); });
    Array.prototype.forEach.call(this.strip.childNodes, function (el, i) { el.classList.toggle('on', i === stI); el.style.color = i === stI ? col : ''; });
    // why nothing latches (A6)
    var why = !f ? 'Waiting for frames' : (active ? 'Latched: ' + FN[active].label : (RS.FLAG_TEXT[f.flag] || 'Ready'));
    var dotCol = !f || f.flag === RS.FLAG.NO_HAND ? 'var(--ink-3)' : (active || f.flag === 0 ? 'var(--ok)' : 'var(--warn)');
    U.empty(this.why); this.why.appendChild(h('span.dot', { style: { background: dotCol } })); this.why.appendChild(h('span', why));
    if (f && f.flag === RS.FLAG.STRENGTH) this.why.appendChild(h('span.fixcode', { onclick: function () { RS.showFix('H2'); } }, 'H2'));
    if (f && f.flag === RS.FLAG.JUMP) this.why.appendChild(h('span.fixcode', { onclick: function () { RS.showFix('N2'); } }, 'N2'));
    // engineering panels
    if (S.get('engineering')) {
      this.drawEchoes(this.echoA, f && f.A, '#4FD1E8', cfg); this.drawEchoes(this.echoB, f && f.B, '#FFB27A', cfg);
      this.engA.textContent = f && f.A ? f.A.e.length + ' echoes · ' + (f.A.p != null ? 'using #' + (f.A.p + 1) : 'none used') : '';
      this.engB.textContent = f && f.B ? f.B.e.length + ' echoes · ' + (f.B.p != null ? 'using #' + (f.B.p + 1) : 'none used') : '';
      var es = [['Offset A / B', (cfg.sensors.A.off || 0).toFixed(0) + ' / ' + (cfg.sensors.B.off || 0).toFixed(0), 'mm'], ['Hand depth', cfg.hand.zwork, 'mm'], ['Strength window', cfg.hand.strMin + '–' + cfg.hand.strMax, ''], ['Flag', f ? f.flag : '–', '']];
      if (this.engStats.childNodes.length !== 4) { U.empty(this.engStats); es.forEach(function () { self.engStats.appendChild(h('div.tile', { style: { padding: '10px 12px' } }, h('div.v', { style: { fontSize: '18px' } }, h('span'), h('small')), h('div.l'))); }); }
      es.forEach(function (t, i) { var el = self.engStats.childNodes[i]; el.querySelector('.v span').textContent = t[1]; el.querySelector('.v small').textContent = t[2]; el.querySelector('.l').textContent = t[0]; });
      U.empty(this.evList); this.events.slice(0, 8).forEach(function (e) { self.evList.appendChild(h('div.row.between.small', h('span.mono', { style: { color: 'var(--ink-2)' } }, e.ev + (e.fn ? ' ' + e.fn : '') + (e.a ? ' ' + e.a : '') + (e.why ? ' (' + e.why + ')' : '') + (e.lat != null ? ' ' + e.lat + ' ms' : '')), h('span.faint.mono', (e.t / 1000).toFixed(1) + ' s'))); });
    }
  };

  // ---- fault injection panel (simulator only; rehearses test T30 and the C14 fixes) ------------------------------------------------------
  RS.FAULTS = [
    ['A_swapSdaScl', 'Sensor A: SDA and SCL swapped (not found)', 'W1'], ['B_noPower', 'Sensor B: no power', 'W6 / W1'], ['B_rstOff', 'Sensor B: reset wire off', 'W4'], ['rstSwapped', 'Reset wires swapped', 'W4'],
    ['wrongFw', 'Sensor B: presence firmware still loaded', 'F1'], ['statusErr', 'Sensor A: setup error flag', 'F2'], ['B_foil', 'Foil in front of sensor B', 'S1 / S5'], ['A_yaw30', 'Sensor A turned 30° outward', 'P4'],
    ['noisy', 'Noisy readings (loose ground)', 'S4'], ['cupInSink', 'A cup left in the sink', 'B1'], ['bgDrift', 'Background has drifted', 'B3'], ['personFront', 'Person leaning at the front edge', 'B6'],
    ['multipath', 'Strong multipath ghost echoes', 'N2'], ['A_loose', 'Sensor A: loose wire (intermittent)', 'W2'], ['swapAB', 'Sensors A and B swapped', 'W3'], ['calNeeded', 'Sensor A asks for recalibration', 'B8']
  ];
  RS.faultsPanel = function () {
    RS.app.modal(function (box) {
      box.appendChild(h('h2', { style: { margin: '0 0 6px' } }, 'Inject a fault'));
      box.appendChild(h('p.sub', { style: { margin: '0 0 14px' } }, 'Simulator only. Each fault reproduces a real wiring or setup problem so the studio\'s diagnostics (C0, C6, C7, C12) can be rehearsed. Expected fix code in brackets.'));
      var list = h('div.col.gap-s'); box.appendChild(list);
      var render = function () {
        U.empty(list); var on = L.sim ? L.sim.faults : {};
        RS.FAULTS.forEach(function (f) { var sw = h('label.switch' + (on[f[0]] ? '.on' : ''), h('span.tr'), h('span', f[1] + '  '), h('span.faint.mono', f[2])); sw.addEventListener('click', function () { L.send({ c: 'fault', name: f[0], on: !on[f[0]] }); setTimeout(render, 30); }); list.appendChild(sw); });
      };
      render();
    });
  };
})();
