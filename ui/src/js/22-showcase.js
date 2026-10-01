/* Ring Studio · Showcase screen (F13): the rendered sink, LED ring, water, radar and hand marker, driven by
   protocol frames from whichever source is linked. The ghost demo hand (F25) plays after 8 s idle. */
var RS = globalThis.RS || (globalThis.RS = {});
(function () {
  'use strict';
  var U = RS.util, h = U.h, L = RS.link, S = RS.store, FN = RS.FN, rgba = U.rgba, mix = U.mix, ST = RS.ST;
  var CW = 1440, CH = 900;
  var BX = 390, BY = 168, BW = 660, BH = 602, BR = 50;          // basin
  var RX = 356, RY = 134, RW = 728, RH = 670, RR = 82;          // ring
  var MANI = { x: 720, y: RY + 17 };                            // water manifold

  function rr(ctx, x, y, w, hh, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + hh, r); ctx.arcTo(x + w, y + hh, x, y + hh, r); ctx.arcTo(x, y + hh, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function rrPoints(x, y, w, hh, r, n) {
    var pts = [], seg = 10, i;
    function arc(cx, cy, a0) { for (var k = 0; k <= seg; k++) { var a = a0 + (Math.PI / 2) * (k / seg); pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } }
    pts.push([x + w / 2, y]); arc(x + w - r, y + r, -Math.PI / 2); arc(x + w - r, y + hh - r, 0); arc(x + r, y + hh - r, Math.PI / 2); arc(x + r, y + r, Math.PI); pts.push([x + w / 2, y]);
    var Ls = [0]; for (i = 1; i < pts.length; i++) Ls.push(Ls[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    var tot = Ls[Ls.length - 1], out = [], k2 = 1;
    for (var j = 0; j < n; j++) { var d = tot * j / n; while (Ls[k2] < d) k2++; var f = (d - Ls[k2 - 1]) / (Ls[k2] - Ls[k2 - 1] || 1); out.push([pts[k2 - 1][0] + (pts[k2][0] - pts[k2 - 1][0]) * f, pts[k2 - 1][1] + (pts[k2][1] - pts[k2 - 1][1]) * f]); }
    return out;
  }

  var SC = RS.screens.show = { title: 'Showcase' };
  SC.mount = function (host) {
    var self = this;
    this.host = host; this.wrap = h('div.stage-wrap'); host.appendChild(this.wrap);
    this.canvas = h('canvas', { 'aria-label': 'Live view of the sink ring. Move over the sink to control it.' }); this.wrap.appendChild(this.canvas);
    this.stage = h('div.stage', { style: { pointerEvents: 'none' } }); this.wrap.appendChild(this.stage);
    this.buildHud(); this.resize();
    this.onResize = function () { self.resize(); }; window.addEventListener('resize', this.onResize);
    this.parts = []; this.ripples = []; this.pulses = []; this.pings = []; this.vortex = []; this.lastPulse = 0; this.lastRipple = 0; this.hudT = 0;
    this.t0 = U.now(); this.lastT = 0; this.latchAt = -1e9; this.soapFlashUntil = 0; this.flashZone = null; this.stillMsgUntil = 0; this.lastUserT = U.now(); this.userHand = null;
    this.vis = { x: null, y: null }; this.frame = null; this.ghostSim = null; this.ghostStart = 0; this.attract = false; this.liveTotals = { off: 0, flow: 0, lastStatusT: 0 };
    this.bg = this.makeBackground(); this.basinTex = this.makeBasin();
    this.leds = rrPoints(RX + 13, RY + 13, RW - 26, RH - 26, RR - 13, (S.cfg().tuning.ledCount || 132));
    this.icons = {}; Object.keys(FN).forEach(function (k) { self.icons[k] = new Path2D(FN[k].icon); });
    this.unsub = [
      L.on('frame', function (f) { self.onFrame(f); }),
      L.on('event', function (e) { self.onEvent(e); }),
      L.on('cfg', function () { self.leds = rrPoints(RX + 13, RY + 13, RW - 26, RH - 26, RR - 13, (S.cfg().tuning.ledCount || 132)); self.refreshBars(); }),
      L.on('status', function () { self.liveTotals.off = 0; self.liveTotals.flow = 0; }),
      L.on('mode', function () { self.refreshBars(); }),
      S.on('change', function () { self.refreshBars(); })
    ];
    var cv = this.canvas;
    cv.addEventListener('pointermove', function (e) { self.pointer(e); });
    cv.addEventListener('pointerdown', function (e) { RS.sound.unlockOnGesture(); self.pointer(e); });
    cv.addEventListener('pointerleave', function () { self.userHand = null; self.lastUserT = U.now(); self.pushHand(); });
    cv.addEventListener('pointerup', function (e) { if (e.pointerType !== 'mouse') { self.userHand = null; self.lastUserT = U.now(); self.pushHand(); } });
    this.refreshBars();
  };
  SC.unmount = function () { window.removeEventListener('resize', this.onResize); this.unsub.forEach(function (u) { u(); }); if (L.sim) L.sim.setHand(null, false); this.ghostSim = null; };
  SC.resize = function () {
    var W = this.wrap.clientWidth || 1440, H = this.wrap.clientHeight || 900, dpr = Math.min(2, window.devicePixelRatio || 1);
    this.scale = Math.min(W / CW, H / CH); this.ox = (W - CW * this.scale) / 2; this.oy = (H - CH * this.scale) / 2; this.dpr = dpr;
    this.canvas.width = Math.round(W * dpr); this.canvas.height = Math.round(H * dpr); this.canvas.style.width = W + 'px'; this.canvas.style.height = H + 'px';
    this.stage.style.left = this.ox + 'px'; this.stage.style.top = this.oy + 'px'; this.stage.style.transform = 'scale(' + this.scale + ')';
  };
  SC.toScene = function (e) { var r = this.canvas.getBoundingClientRect(); return { x: (e.clientX - r.left - this.ox) / this.scale, y: (e.clientY - r.top - this.oy) / this.scale }; };
  SC.pointer = function (e) {
    var p = this.toScene(e), plane = S.cfg().plane;
    if (p.x < BX || p.x > BX + BW || p.y < BY || p.y > BY + BH) this.userHand = null;
    else this.userHand = { x: U.clamp((p.x - BX) / BW, 0, 0.9999) * plane.w, y: U.clamp((p.y - BY) / BH, 0, 0.9999) * plane.d, h: 110 };
    this.lastUserT = U.now(); this.pushHand();
  };
  // In simulation the cursor is the hand. On a real ring the cursor does nothing (the radar is the hand).
  SC.pushHand = function () { if (L.mode === 'sim' && L.sim) { if (this.userHand) { if (this.attract) this.stopAttract(); L.sim.setHand(this.userHand, false); } else if (!this.attract) L.sim.setHand(null, false); } };

  // ---- data in ------------------------------------------------------------------------------------------------------------------------------
  SC.onFrame = function (f) {
    if (this.attract && !f.g && (f.hx != null || f.st !== ST.IDLE) && L.mode !== 'sim') this.stopAttract();   // a real hand always wins
    if (f.g && !this.attract) return;                                                                          // stale ghost frame
    this.frame = f;
    var flowing = f.st === ST.ACTIVE && f.fn && FN[f.fn] && FN[f.fn].water, base = RS.BASELINE_GPM * RS.GPM_TO_MLS, flow = (S.profile().flowGpm || 1.5) * RS.GPM_TO_MLS, dt = 0.045;
    if (!f.g) { if (flowing) this.liveTotals.flow += (base - flow) * dt; else if (f.st !== ST.IDLE && f.st !== ST.CLEAN) this.liveTotals.off += base * dt; }
  };
  SC.onEvent = function (e) {
    if (e.g && !this.attract) return;
    var now = U.now();
    if (e.ev === 'latch') this.latchAt = now;
    if (e.ev === 'soap') { this.soapFlashUntil = now + 1500; this.latchAt = now; this.flashZone = this.frame && this.frame.zn; if (this.vis.x != null) this.foam(this.vis.x, this.vis.y); }
    if (e.ev === 'still') this.stillMsgUntil = now + 4000;
    if (e.ev === 'latch' && !e.g && e.lat != null) this.lastLat = e.lat;
  };
  // ---- ghost demo loop (F25) ----------------------------------------------------------------------------------------------------------------
  SC.startAttract = function (now) {
    this.attract = true; this.ghostStart = now;
    if (L.mode === 'sim') { L.sim.resetSession(); L.sim.setHand(null, true); }
    else { var self = this; this.ghostSim = new RS.Sim(U.deepClone(S.cfg())); this.ghostSim.ghost = true; this.ghostSim.out.on('msg', function (m) { if (m.f) self.frame = m.f; else if (m.ev) { m.g = 1; L.emit('event', m); } }); }
  };
  SC.stopAttract = function () { this.attract = false; this.ghostSim = null; if (L.mode === 'sim' && L.sim) { L.sim.resetSession(); L.sim.setHand(this.userHand, false); } this.frame = null; this.lastUserT = U.now(); };
  SC.tickGhost = function (now) {
    var idle = now - this.lastUserT > 8000 && !this.userHand && S.get('demoLoop') && L.mode !== 'replay';
    var deviceIdle = L.mode === 'sim' || !this.frame || this.frame.g || (this.frame.st === ST.IDLE && this.frame.hx == null && !(this.frame.dsp > 0));
    if (!this.attract && idle && deviceIdle && (L.mode === 'sim' ? L.sim && L.sim.sm.st === ST.IDLE && !L.sim.sm.disposalUntil : true)) this.startAttract(now);
    if (this.attract && !idle) this.stopAttract();
    if (!this.attract) return;
    var ts = (now - this.ghostStart) / 1000, cfg = S.cfg(), hand = RS.ghostHand(cfg.layout, ts, cfg.plane);
    if (L.mode === 'sim') L.sim.setHand(hand, true);
    else if (this.ghostSim) { if (this.ghostSim.cfg.layout !== cfg.layout) this.ghostSim.cmd({ c: 'layout', layout: cfg.layout, id: 0 }); this.ghostSim.setHand(hand, true); this.ghostSim.tick(now); }
  };

  // ---- textures ------------------------------------------------------------------------------------------------------------------------------
  SC.offscreen = function (w, hh) { var c = document.createElement('canvas'); c.width = w; c.height = hh; return c; };
  SC.makeBackground = function () {
    var c = this.offscreen(CW, CH), g = c.getContext('2d'), i;
    g.fillStyle = '#141619'; g.fillRect(0, 0, CW, CH);
    var rnd = U.rng(7);
    for (i = 0; i < 26000; i++) { var v = 30 + rnd() * 50, a = rnd() * 0.5; g.fillStyle = 'rgba(' + v + ',' + v + ',' + (v + 4) + ',' + a + ')'; g.fillRect(rnd() * CW, rnd() * CH, 1 + rnd() * 1.6, 1 + rnd() * 1.6); }
    for (i = 0; i < 900; i++) { g.fillStyle = 'rgba(210,215,222,' + (0.05 + rnd() * 0.18) + ')'; g.beginPath(); g.arc(rnd() * CW, rnd() * CH, 0.6 + rnd() * 1.4, 0, 7); g.fill(); }
    var lg = g.createRadialGradient(CW * 0.5, -120, 50, CW * 0.5, CH * 0.35, CW * 0.75); lg.addColorStop(0, 'rgba(255,255,255,0.10)'); lg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = lg; g.fillRect(0, 0, CW, CH);
    var vg = g.createRadialGradient(CW / 2, CH / 2, 300, CW / 2, CH / 2, 900); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.75)'); g.fillStyle = vg; g.fillRect(0, 0, CW, CH);
    g.save(); g.shadowColor = 'rgba(0,0,0,0.7)'; g.shadowBlur = 50; g.shadowOffsetY = 16; rr(g, RX, RY, RW, RH, RR); g.fillStyle = '#1A1D21'; g.fill(); g.restore();
    var rg = g.createLinearGradient(0, RY, 0, RY + RH); rg.addColorStop(0, '#2A2F35'); rg.addColorStop(0.5, '#1C2024'); rg.addColorStop(1, '#15181B');
    rr(g, RX, RY, RW, RH, RR); g.fillStyle = rg; g.fill();
    g.lineWidth = 1; g.strokeStyle = 'rgba(255,255,255,0.10)'; rr(g, RX + 0.5, RY + 0.5, RW - 1, RH - 1, RR); g.stroke();
    g.fillStyle = '#0B0D0F'; rr(g, RX + 9, RY + 9, RW - 18, RH - 18, RR - 9); g.fill();
    g.fillStyle = '#20252B'; rr(g, RX + 17, RY + 17, RW - 34, RH - 34, RR - 17); g.fill();
    g.fillStyle = '#2C333B'; rr(g, MANI.x - 42, MANI.y - 6, 84, 12, 6); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.12)'; rr(g, MANI.x - 40, MANI.y - 5, 80, 3, 2); g.fill();
    for (i = 0; i < 7; i++) { g.fillStyle = '#0A0C0E'; g.beginPath(); g.arc(MANI.x - 30 + i * 10, MANI.y + 2, 1.6, 0, 7); g.fill(); }
    return c;
  };
  SC.makeBasin = function () {
    var c = this.offscreen(BW, BH), g = c.getContext('2d'), i, rnd = U.rng(3);
    var bg = g.createRadialGradient(BW * 0.45, BH * 0.38, 40, BW * 0.5, BH * 0.5, BW * 0.75); bg.addColorStop(0, '#3A4149'); bg.addColorStop(0.45, '#262B31'); bg.addColorStop(1, '#101316');
    g.fillStyle = bg; g.fillRect(0, 0, BW, BH);
    for (i = 0; i < 1400; i++) { var y = rnd() * BH; g.strokeStyle = 'rgba(255,255,255,' + (rnd() * 0.035) + ')'; g.lineWidth = 0.6; g.beginPath(); var x = rnd() * BW; g.moveTo(x, y); g.lineTo(x + 40 + rnd() * 160, y + (rnd() - 0.5) * 0.8); g.stroke(); }
    var sp = g.createRadialGradient(BW * 0.3, BH * 0.24, 10, BW * 0.3, BH * 0.24, 260); sp.addColorStop(0, 'rgba(255,255,255,0.10)'); sp.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = sp; g.fillRect(0, 0, BW, BH);
    [[0, 0, BW, 60, 0, 0, 0, 60], [0, BH - 50, BW, 50, 0, BH, 0, BH - 50], [0, 0, 50, BH, 0, 0, 50, 0], [BW - 50, 0, 50, BH, BW, 0, BW - 50, 0]].forEach(function (e) { var lg = g.createLinearGradient(e[4], e[5], e[6], e[7]); lg.addColorStop(0, 'rgba(0,0,0,0.55)'); lg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = lg; g.fillRect(e[0], e[1], e[2], e[3]); });
    return c;
  };
  SC.foam = function (x, y) { for (var i = 0; i < 46; i++) { var a = Math.random() * 6.283, v = 20 + Math.random() * 90; this.parts.push({ k: 'bub', x: x + (Math.random() - 0.5) * 30, y: y + (Math.random() - 0.5) * 30, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 2 + Math.random() * 7, life: 0, max: 0.8 + Math.random() * 1.1, c: '#D9CCFF' }); } };

  // ---- derived scene values --------------------------------------------------------------------------------------------------------------------
  SC.hoverFn = function () { var f = this.frame; if (!f || !f.zn) return null; var z = RS.geo.zoneById(S.zones(), f.zn); return z ? z.fn : null; };
  SC.blockedHover = function () { var f = this.frame, fn = this.hoverFn(); if (!fn) return true; if (fn === 'neutral') return true; if (fn === 'soap' && (f.lk & 1)) return true; if (fn === 'disposal' && ((f.lk & 2) || f.dsp > 0)) return true; return false; };
  SC.color = function (now) {
    var f = this.frame; if (!f) return RS.ACCENT;
    if (f.st === ST.CLEAN) return '#E8EEF4';
    if (f.fn && (f.st === ST.ACTIVE || f.st === ST.CUP_FULL || f.st === ST.EXIT_PENDING)) return FN[f.fn].color;
    if (now < this.soapFlashUntil) return FN.soap.color;
    if (f.dsp > 0 && f.hx == null) return FN.disposal.color;
    var hv = this.hoverFn(); if (f.hx != null && hv && !this.blockedHover()) return FN[hv].color;
    return RS.ACCENT;
  };

  // ---- per frame render --------------------------------------------------------------------------------------------------------------------------
  SC.tick = function (now) {
    this.tickGhost(now);
    var cv = this.canvas, ctx = cv.getContext('2d'), sc = this.dpr * this.scale;
    ctx.setTransform(sc, 0, 0, sc, this.ox * this.dpr, this.oy * this.dpr);
    ctx.fillStyle = '#050607'; ctx.fillRect(-this.ox / this.scale, -this.oy / this.scale, cv.width / sc, cv.height / sc);
    var dt = Math.min(0.05, (now - (this.lastT || now)) / 1000); this.lastT = now;
    var f = this.frame, col = this.color(now), intro = Math.min(1, (now - this.t0) / 1800), time = now / 1000, i;
    var cfg = S.cfg(), plane = cfg.plane, zones = S.zones();
    var active = f && f.fn && (f.st === ST.ACTIVE || f.st === ST.CUP_FULL || f.st === ST.EXIT_PENDING) ? f.fn : null;
    var flowing = f && f.st === ST.ACTIVE && active && FN[active].water;
    var hasHand = f && f.hx != null;
    // visual hand position: smoothed
    if (hasHand) { var tx = BX + f.hx / plane.w * BW, ty = BY + f.hy / plane.d * BH; if (this.vis.x == null) { this.vis.x = tx; this.vis.y = ty; } else { var k = 1 - Math.exp(-dt * 18); this.vis.x += (tx - this.vis.x) * k; this.vis.y += (ty - this.vis.y) * k; } }
    else this.vis.x = this.vis.y = null;
    var hp = this.vis.x != null ? { x: this.vis.x, y: this.vis.y } : null;

    ctx.drawImage(this.bg, 0, 0, CW, CH);
    ctx.save(); rr(ctx, BX, BY, BW, BH, BR); ctx.clip();
    ctx.globalAlpha = 0.3 + 0.7 * intro; ctx.drawImage(this.basinTex, BX, BY); ctx.globalAlpha = 1;
    var lit = active || now < this.soapFlashUntil, settle = f ? f.set : 0;
    var spill = lit ? 0.3 : (hasHand ? 0.08 + 0.18 * settle : 0.05);
    ctx.lineWidth = 60; ctx.strokeStyle = rgba(col, spill * 0.5); ctx.shadowColor = rgba(col, spill); ctx.shadowBlur = 60; rr(ctx, BX - 20, BY - 20, BW + 40, BH + 40, BR + 20); ctx.stroke(); ctx.shadowBlur = 0;

    // zones
    var hz = f && f.zn ? f.zn : null, hov = this.hoverFn(), blocked = this.blockedHover();
    ctx.font = '500 13px Geist, system-ui, sans-serif'; ctx.textBaseline = 'alphabetic';
    for (i = 0; i < zones.length; i++) {
      var z = zones[i], zx = BX + z.x0 * BW, zy = BY + z.y0 * BH, zw = (z.x1 - z.x0) * BW, zh = (z.y1 - z.y0) * BH, fz = FN[z.fn];
      var isAct = active && f.st !== ST.EXIT_PENDING && z.fn === active && (hz === z.id || this.actZone === z.id);
      if (active && hz && hz === z.id && z.fn === active) this.actZone = z.id;
      var isHov = !active && hz === z.id && !blocked, isFlash = now < this.soapFlashUntil && this.flashZone === z.id;
      if (isAct || isFlash || isHov) { var a = isAct || isFlash ? 0.16 : 0.05 + 0.1 * settle; var zg = ctx.createRadialGradient(zx + zw / 2, zy + zh / 2, 10, zx + zw / 2, zy + zh / 2, Math.max(zw, zh) * 0.7); zg.addColorStop(0, rgba(fz.color, a)); zg.addColorStop(1, rgba(fz.color, 0)); ctx.fillStyle = zg; ctx.fillRect(zx, zy, zw, zh); }
      var dim = f && ((z.fn === 'soap' && (f.lk & 1)) || (z.fn === 'disposal' && (f.lk & 2) && !(f.dsp > 0)));
      var la = (isAct || isFlash) ? 0.95 : (isHov ? 0.5 + 0.4 * settle : (dim ? 0.14 : 0.32));
      ctx.save(); ctx.translate(zx + 22, zy + 20); ctx.strokeStyle = (isAct || isFlash || isHov) ? rgba(fz.color, la) : 'rgba(255,255,255,' + la + ')'; ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(this.icons[z.fn]); ctx.restore();
      ctx.fillStyle = (isAct || isFlash) ? '#FFFFFF' : 'rgba(255,255,255,' + la + ')'; ctx.fillText(fz.label.toUpperCase(), zx + 22, zy + zh - 22);
    }
    if (!active) this.actZone = null;
    ctx.strokeStyle = 'rgba(255,255,255,0.045)'; ctx.lineWidth = 1;
    for (i = 0; i < zones.length; i++) { var q = zones[i]; if (q.x0 > 0) { ctx.beginPath(); ctx.moveTo(BX + q.x0 * BW, BY + q.y0 * BH + 16); ctx.lineTo(BX + q.x0 * BW, BY + q.y1 * BH - 16); ctx.stroke(); } if (q.y0 > 0) { ctx.beginPath(); ctx.moveTo(BX + q.x0 * BW + 16, BY + q.y0 * BH); ctx.lineTo(BX + q.x1 * BW - 16, BY + q.y0 * BH); ctx.stroke(); } }

    // drain
    var DX = 720, DY = BY + BH * 0.5;
    var dr = ctx.createRadialGradient(DX - 8, DY - 8, 4, DX, DY, 36); dr.addColorStop(0, '#5A636D'); dr.addColorStop(0.7, '#2A3037'); dr.addColorStop(1, '#15181C');
    ctx.fillStyle = dr; ctx.beginPath(); ctx.arc(DX, DY, 34, 0, 7); ctx.fill();
    ctx.fillStyle = '#07080A'; ctx.beginPath(); ctx.arc(DX, DY, 24, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(DX, DY, 34, 0, 7); ctx.stroke();
    for (i = 0; i < 8; i++) { var ang = i * Math.PI / 4; ctx.strokeStyle = 'rgba(120,130,140,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(DX + Math.cos(ang) * 7, DY + Math.sin(ang) * 7); ctx.lineTo(DX + Math.cos(ang) * 20, DY + Math.sin(ang) * 20); ctx.stroke(); }

    // water
    var land = { x: 720, y: BY + BH * 0.36 };
    if (flowing) {
      var fc = mix(FN[active].color, '#FFFFFF', 0.35), wide = active === 'waterfall', thin = active === 'cup', nSpawn = wide ? 14 : (thin ? 3 : 6);
      for (i = 0; i < nSpawn; i++) { var sx = MANI.x + (wide ? (Math.random() - 0.5) * 240 : (Math.random() - 0.5) * (thin ? 3 : 8)), sy = MANI.y + 4, ly = land.y + (Math.random() - 0.5) * 10, T = 0.32 + Math.random() * 0.06; this.parts.push({ k: 'w', x: sx, y: sy, vx: (wide ? (sx - 720) * 0.25 : (land.x - sx) / T), vy: (ly - sy) / T, life: 0, max: T, c: fc }); }
      if (now - this.lastRipple > (wide ? 90 : 160)) { this.lastRipple = now; this.ripples.push({ x: land.x + (wide ? (Math.random() - 0.5) * 220 : 0), y: land.y, r: 4, life: 0, c: fc }); }
      for (i = 0; i < (wide ? 5 : 3); i++) { var a2 = Math.random() * 6.283, v2 = 50 + Math.random() * 150; this.parts.push({ k: 'd', x: land.x + (wide ? (Math.random() - 0.5) * 220 : 0), y: land.y, vx: Math.cos(a2) * v2, vy: Math.sin(a2) * v2 * 0.7, life: 0, max: 0.25 + Math.random() * 0.35, c: fc }); }
      if (active === 'hot' && Math.random() < 0.5) this.parts.push({ k: 'steam', x: land.x + (Math.random() - 0.5) * 60, y: land.y + (Math.random() - 0.5) * 30, vx: (Math.random() - 0.5) * 20, vy: -10 - Math.random() * 20, r: 10 + Math.random() * 16, life: 0, max: 1.6 + Math.random(), c: '#FFFFFF' });
      if (active === 'cold' && Math.random() < 0.3) this.parts.push({ k: 'glint', x: land.x + (Math.random() - 0.5) * 120, y: land.y + (Math.random() - 0.5) * 80, vx: 0, vy: 0, life: 0, max: 0.5, c: '#DDEEFF' });
      var sg = ctx.createLinearGradient(0, MANI.y, 0, land.y); sg.addColorStop(0, rgba(fc, 0.55)); sg.addColorStop(1, rgba(fc, 0.18));
      ctx.fillStyle = sg; ctx.beginPath();
      if (wide) { ctx.moveTo(MANI.x - 120, MANI.y); ctx.lineTo(MANI.x + 120, MANI.y); ctx.lineTo(land.x + 150, land.y); ctx.lineTo(land.x - 150, land.y); }
      else { var w0 = thin ? 2 : 5, w1 = thin ? 3 : 9; ctx.moveTo(MANI.x - w0, MANI.y); ctx.lineTo(MANI.x + w0, MANI.y); ctx.lineTo(land.x + w1, land.y); ctx.lineTo(land.x - w1, land.y); }
      ctx.closePath(); ctx.fill();
    }
    if (active === 'cup' && f.st !== ST.EXIT_PENDING) {
      var cupMl = S.profile().cupMl || 350, cx = land.x, cy = land.y, frac = U.clamp((f.cup || 0) / cupMl, 0, 1), full = f.st === ST.CUP_FULL;
      ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.beginPath(); ctx.arc(cx, cy, 46, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(cx, cy, 46, 0, 7); ctx.stroke();
      ctx.fillStyle = rgba(FN.cup.color, 0.18 + 0.25 * frac); ctx.beginPath(); ctx.arc(cx, cy, 8 + 34 * frac, 0, 7); ctx.fill();
      ctx.strokeStyle = FN.cup.color; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(cx, cy, 56, -Math.PI / 2, -Math.PI / 2 + 6.283 * frac); ctx.stroke();
      if (full) { ctx.fillStyle = '#FFFFFF'; ctx.font = '600 12px Geist, system-ui'; ctx.textAlign = 'center'; ctx.fillText('FULL', cx, cy + 4); ctx.textAlign = 'left'; }
    }
    if (f && f.dsp > 0) {
      if (this.vortex.length < 60) for (i = 0; i < 4; i++) this.vortex.push({ a: Math.random() * 6.283, r: 70 + Math.random() * 40 });
      ctx.globalCompositeOperation = 'lighter';
      for (i = this.vortex.length - 1; i >= 0; i--) { var p0 = this.vortex[i]; p0.a += (3 + 120 / p0.r) * dt; p0.r -= 34 * dt; if (p0.r < 22) { this.vortex.splice(i, 1); continue; } ctx.fillStyle = rgba(FN.disposal.color, Math.min(0.8, (p0.r - 22) / 40)); ctx.beginPath(); ctx.arc(DX + Math.cos(p0.a) * p0.r, DY + Math.sin(p0.a) * p0.r * 0.9, 2.2, 0, 7); ctx.fill(); }
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = rgba(FN.disposal.color, 0.5 + 0.3 * Math.sin(time * 8)); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(DX, DY, 34, 0, 7); ctx.stroke();
    } else this.vortex.length = 0;
    for (i = this.ripples.length - 1; i >= 0; i--) { var rp = this.ripples[i]; rp.life += dt; rp.r += 70 * dt; var ra = Math.max(0, 0.35 - rp.life * 0.3); if (ra <= 0) { this.ripples.splice(i, 1); continue; } ctx.strokeStyle = rgba(rp.c, ra); ctx.lineWidth = 1.3; ctx.beginPath(); ctx.ellipse(rp.x, rp.y, rp.r, rp.r * 0.8, 0, 0, 7); ctx.stroke(); }
    ctx.globalCompositeOperation = 'lighter';
    for (i = this.parts.length - 1; i >= 0; i--) {
      var p = this.parts[i]; p.life += dt; if (p.life >= p.max) { this.parts.splice(i, 1); continue; }
      var u = p.life / p.max;
      if (p.k === 'w') { p.x += p.vx * dt; p.y += p.vy * dt; ctx.strokeStyle = rgba(p.c, 0.5 * (1 - u * 0.5)); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025); ctx.stroke(); }
      else if (p.k === 'd') { p.vx *= 0.93; p.vy *= 0.93; p.x += p.vx * dt; p.y += p.vy * dt; ctx.fillStyle = rgba(p.c, 0.7 * (1 - u)); ctx.beginPath(); ctx.arc(p.x, p.y, 1.4, 0, 7); ctx.fill(); }
      else if (p.k === 'steam') { p.x += p.vx * dt; p.y += p.vy * dt; p.r += 14 * dt; var sg2 = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r); sg2.addColorStop(0, 'rgba(255,255,255,' + (0.07 * Math.sin(u * Math.PI)) + ')'); sg2.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = sg2; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }
      else if (p.k === 'glint') { var ga = Math.sin(u * Math.PI); ctx.strokeStyle = 'rgba(220,238,255,' + (0.8 * ga) + ')'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x - 5 * ga, p.y); ctx.lineTo(p.x + 5 * ga, p.y); ctx.moveTo(p.x, p.y - 5 * ga); ctx.lineTo(p.x, p.y + 5 * ga); ctx.stroke(); }
      else if (p.k === 'bub') { p.vx *= 0.96; p.vy *= 0.96; p.x += p.vx * dt; p.y += p.vy * dt; ctx.strokeStyle = rgba(p.c, 0.8 * (1 - u)); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + u * 0.3), 0, 7); ctx.stroke(); ctx.fillStyle = rgba(p.c, 0.12 * (1 - u)); ctx.fill(); }
    }
    ctx.globalCompositeOperation = 'source-over';

    // radar pulses from the (typed) sensor positions
    var sA = cfg.sensors.A, sB = cfg.sensors.B;
    var sensA = { x: BX + U.clamp(sA.x / plane.w, 0, 1) * BW + 2, y: BY + U.clamp(sA.y / plane.d, 0, 1) * BH + 2, c: '#4FD1E8', a0: 0, a1: Math.PI / 2 }, sensB = { x: BX + U.clamp(sB.x / plane.w, 0, 1) * BW - 2, y: BY + U.clamp(sB.y / plane.d, 0, 1) * BH + 2, c: '#FFB27A', a0: Math.PI / 2, a1: Math.PI };
    if (S.get('radar')) {
      if (now - this.lastPulse > 420) { this.lastPulse = now; this.pulses.push({ s: sensA, r: 0 }); this.pulses.push({ s: sensB, r: 0 }); }
      for (i = this.pulses.length - 1; i >= 0; i--) {
        var pu = this.pulses[i]; pu.r += 900 * dt; var target = hp ? Math.hypot(hp.x - pu.s.x, hp.y - pu.s.y) : 900;
        if (pu.r >= target) { if (hp) this.pings.push({ x: hp.x, y: hp.y, c: pu.s.c, life: 0 }); this.pulses.splice(i, 1); continue; }
        ctx.strokeStyle = rgba(pu.s.c, 0.22 * (1 - pu.r / 900)); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(pu.s.x, pu.s.y, pu.r, pu.s.a0, pu.s.a1); ctx.stroke();
      }
      if (hp && S.get('marker') !== 'range') { [sensA, sensB].forEach(function (Sn) { ctx.strokeStyle = rgba(Sn.c, 0.14); ctx.setLineDash([3, 7]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(Sn.x, Sn.y); ctx.lineTo(hp.x, hp.y); ctx.stroke(); ctx.setLineDash([]); }); }
    } else this.pulses.length = 0;
    ctx.restore();

    // hand marker
    if (hp) {
      RS.drawMarker(ctx, S.get('marker'), { x: hp.x, y: hp.y, col: col, settle: blocked ? 0 : settle, active: !!active || now < this.soapFlashUntil, time: time, k: 1,
        bounds: { x0: BX, x1: BX + BW, y0: BY, y1: BY + BH }, label: 'x ' + Math.round(f.hx) + '  y ' + Math.round(f.hy) + ' mm',
        A: { x: sensA.x, y: sensA.y, c: sensA.c }, B: { x: sensB.x, y: sensB.y, c: sensB.c }, mm: BW / plane.w, latchAge: (now - this.latchAt) / 1000 });
    }
    for (i = this.pings.length - 1; i >= 0; i--) { var pg = this.pings[i]; pg.life += dt; if (pg.life > 0.5) { this.pings.splice(i, 1); continue; } ctx.strokeStyle = rgba(pg.c, 0.5 * (1 - pg.life * 2)); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(pg.x, pg.y, 20 + pg.life * 60, 0, 7); ctx.stroke(); }

    // LED ring (mirrors what the real strip does, spec 4.2)
    var n = this.leds.length, bright = [], exitLeft = f && f.st === ST.EXIT_PENDING ? f.ex : 1, soapNow = now < this.soapFlashUntil, clean = f && f.st === ST.CLEAN;
    var armFill = hasHand && !active && !blocked ? settle : 0, dispSweep = f && f.dsp > 0 && !active;
    for (i = 0; i < n; i++) {
      var uu = i / n, d = Math.min(uu, 1 - uu) * 2, b;
      if (intro < 1) b = d <= intro ? 0.9 : 0.04;
      else if (clean) b = 0.35 + 0.35 * Math.sin(time * 1.2);
      else if (active && f.st !== ST.EXIT_PENDING) b = 0.72 + 0.28 * Math.sin(uu * 60 - time * 5);
      else if (f && f.st === ST.EXIT_PENDING) b = d <= exitLeft ? 0.85 : 0.06;
      else if (soapNow) b = 0.4 + 0.5 * Math.abs(Math.sin(time * 6));
      else if (armFill > 0) b = d <= armFill ? 0.95 : 0.1;
      else if (dispSweep) b = 0.08 + 0.85 * Math.exp(-Math.pow((d - 0.12 * (1 + Math.sin(time * 3))) * 6, 2));
      else { var cp = (time * 0.09) % 1, dd = Math.min(Math.abs(uu - cp), 1 - Math.abs(uu - cp)); b = 0.07 + 0.75 * Math.exp(-dd * dd * 900) + 0.03 * Math.sin(time * 1.5); }
      bright.push(U.clamp(b, 0, 1));
    }
    var avg = bright.reduce(function (x, y) { return x + y; }, 0) / n;
    ctx.save(); ctx.lineWidth = 7; ctx.strokeStyle = rgba(col, 0.25 + 0.5 * avg); ctx.shadowColor = rgba(col, 0.9); ctx.shadowBlur = 20 + 30 * avg; rr(ctx, RX + 13, RY + 13, RW - 26, RH - 26, RR - 13); ctx.globalAlpha = Math.max(0.15, avg); ctx.stroke(); ctx.restore();
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < n; i++) { var Lp = this.leds[i], bb = bright[i]; if (bb < 0.02) continue; ctx.fillStyle = rgba(mix(col, '#FFFFFF', 0.45 * bb), bb); ctx.beginPath(); ctx.arc(Lp[0], Lp[1], 2.3, 0, 7); ctx.fill(); }
    ctx.globalCompositeOperation = 'source-over';
    [['A', sensA.x - 14, sensA.y - 14, '#4FD1E8'], ['B', sensB.x + 14, sensB.y - 14, '#FFB27A']].forEach(function (Sn) {
      ctx.fillStyle = '#0B0D0F'; ctx.beginPath(); ctx.arc(Sn[1], Sn[2], 9, 0, 7); ctx.fill();
      ctx.strokeStyle = rgba(Sn[3], 0.7); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(Sn[1], Sn[2], 9, 0, 7); ctx.stroke();
      ctx.fillStyle = rgba(Sn[3], 0.5 + 0.5 * Math.abs(Math.sin(time * 3))); ctx.beginPath(); ctx.arc(Sn[1], Sn[2], 2.5, 0, 7); ctx.fill();
    });
    if (now - this.hudT > 110) { this.hudT = now; this.pushHud(now, col); }
  };

  // ---- HUD (DOM overlay) --------------------------------------------------------------------------------------------------------------------------
  SC.buildHud = function () {
    var self = this, st = this.stage;
    this.hud = {
      eyebrow: h('div.fade', { style: { fontSize: '12px', fontWeight: '600', letterSpacing: '0.22em' } }),
      title: h('div.fade', { style: { fontSize: '60px', lineHeight: '1', fontWeight: '250', letterSpacing: '-0.04em', color: '#fff' } }),
      sub: h('div', { style: { fontSize: '17px', lineHeight: '1.45', fontWeight: '350', color: '#A9B2BC' } }),
      meter: h('div.num.fade', { style: { marginTop: '10px', fontSize: '30px', fontWeight: '300', letterSpacing: '-0.02em' } }),
      mode: h('span'), modeDot: h('span.live', { style: { width: '7px', height: '7px', borderRadius: '4px', background: RS.ACCENT } }),
      logo: RS.logo(34, RS.ACCENT), stats: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '34px', alignItems: 'flex-end', textAlign: 'right' } })
    };
    st.appendChild(h('div.hud', { style: { left: '56px', top: '44px', display: 'flex', alignItems: 'center', gap: '14px' } }, this.hud.logo, h('div', h('div', { style: { fontSize: '15px', fontWeight: '600', letterSpacing: '0.32em' } }, 'ARTESIAN'), h('div', { style: { fontSize: '12px', letterSpacing: '0.04em', color: '#7D8792' } }, 'The faucetless sink ring'))));
    st.appendChild(h('div.hud', { style: { right: '56px', top: '44px' } }, h('div.modepill', this.hud.modeDot, this.hud.mode)));
    st.appendChild(h('div.hud', { style: { left: '56px', top: '250px', width: '290px', display: 'flex', flexDirection: 'column', gap: '18px' } }, this.hud.eyebrow, this.hud.title, this.hud.sub, this.hud.meter));
    st.appendChild(h('div.hud', { style: { right: '56px', top: '250px', width: '230px' } }, this.hud.stats));
    // bottom controls
    this.bars = { layouts: h('span'), units: h('span'), radar: h('button.acc', { onclick: function () { S.toggle('radar'); } }, 'Radar'), sound: h('button.acc', { onclick: function () { RS.sound.toggle(); } }, 'Sound'), markers: h('span'), present: h('button', { onclick: function () { S.toggle('presentation'); self.stage.classList.toggle('presenting', S.get('presentation')); RS.app.toast(S.get('presentation') ? 'Presentation mode: controls hide until you move the mouse; the studio needs the PIN' : 'Presentation mode off', 'info'); }, title: 'Hide the controls and lock the studio behind the PIN' }, 'Present') };
    var bottom = h('div.hud.hidebar', { style: { left: '0', bottom: '34px', width: '1440px', display: 'flex', justifyContent: 'center' } },
      h('div.pillbar', this.bars.layouts, h('div.vsep'), this.bars.units, this.bars.radar, this.bars.sound, this.bars.present, h('div.vsep'), h('a', { href: '#/operator', style: { pointerEvents: 'auto' } }, 'Operator view')));
    st.appendChild(bottom);
    st.appendChild(h('div.hud.hidebar', { style: { left: '0', top: '44px', width: '1440px', display: 'flex', justifyContent: 'center' } }, h('div.pillbar.small', { role: 'group', 'aria-label': 'Hand marker style', style: { paddingLeft: '14px', background: 'rgba(18,21,25,0.6)' } }, h('span', { style: { fontSize: '11px', fontWeight: '600', letterSpacing: '0.18em', color: '#6E7883', marginRight: '6px' } }, 'MARKER'), this.bars.markers)));
    st.appendChild(h('div.hud.hidebar', { style: { left: '56px', top: '100px', width: '290px', fontSize: '11px', lineHeight: '1.5', color: '#4F5862' } }, this.hud.hint = h('span')));
    this.stage.classList.toggle('presenting', !!S.get('presentation'));
  };
  SC.refreshBars = function () {
    var self = this, cfg = S.cfg(), lays = cfg.layouts || RS.LAYOUTS;
    U.empty(this.bars.layouts); RS.LAYOUT_ORDER.concat(Object.keys(lays).filter(function (k) { return RS.LAYOUT_ORDER.indexOf(k) < 0; })).forEach(function (k) { if (!lays[k]) return; self.bars.layouts.appendChild(h('button' + (cfg.layout === k ? '.on' : ''), { onclick: function () { L.send({ c: 'layout', layout: k }); RS.sound.unlockOnGesture(); } }, lays[k].name)); });
    U.empty(this.bars.units); ['F', 'C'].forEach(function (u) { self.bars.units.appendChild(h('button' + (S.get('unit') === u ? '.on' : ''), { onclick: function () { S.set('unit', u); }, style: { width: '48px', padding: '0' } }, '°' + u)); });
    this.bars.radar.classList.toggle('on', !!S.get('radar'));
    var snd = S.get('sound'); this.bars.sound.classList.toggle('on', snd === 'on'); this.bars.sound.textContent = snd === 'on' ? 'Sound on' : (snd === 'off' ? 'Sound off' : 'Enable sound');
    this.bars.present.classList.toggle('on', !!S.get('presentation'));
    U.empty(this.bars.markers); RS.MARKERS.forEach(function (m) { self.bars.markers.appendChild(h('button' + (S.get('marker') === m.id ? '.on' : ''), { title: m.why, onclick: function () { S.set('marker', m.id); } }, m.name)); });
    var d = L.describe();
    this.hud.hint.textContent = L.mode === 'sim' ? 'Simulated with your cursor as the hand; the demo loop never counts toward the numbers. Flow ' + (S.profile().flowGpm || 1.5) + ' gpm; savings compare a 2.2 gpm faucet running while hands are in the sink.' : (d.label + ' from the ring at ' + (L.wsHost || 'USB') + '. Flow ' + (S.profile().flowGpm || 1.5) + ' gpm; savings compare a 2.2 gpm faucet running while hands are in the sink.');
  };
  SC.pushHud = function (now, col) {
    var f = this.frame, hud = this.hud, cupMl = S.profile().cupMl || 350;
    var H = { eyebrow: 'READY', title: 'Wave in', sub: 'No faucet. No buttons. No camera. Radar in the ring sees your hands.', meter: '' };
    var hov = this.hoverFn(), blocked = this.blockedHover();
    if (f) {
      var active = f.fn && (f.st === ST.ACTIVE || f.st === ST.CUP_FULL);
      if (now < this.stillMsgUntil && f.hx == null) H = { eyebrow: 'STILL FOR 10 S', title: 'Object', sub: 'Nothing moved for 10 seconds, so it is not a hand. The water stopped.', meter: '' };
      else if (f.st === ST.CLEAN) H = { eyebrow: 'CLEAN MODE', title: 'Cleaning', sub: 'Nothing starts while you wipe the sink.', meter: Math.ceil(f.cln || 0) + ' s' };
      else if (now < this.soapFlashUntil && !active) H = { eyebrow: 'SOAP', title: 'Soap', sub: 'One measured dose. Move to a water zone to rinse.', meter: (S.profile().soapMl || 0.8) + ' ml' };
      else if (f.st === ST.EXIT_PENDING) H = { eyebrow: 'HANDS OUT', title: 'Off in', sub: 'Everything stops one second after your hands leave.', meter: (f.ex * (S.cfg().tuning.exitMs || 1000) / 1000).toFixed(1) + ' s' };
      else if (active) {
        var a = f.fn;
        if (a === 'cup') H = { eyebrow: 'CUP FILL', title: f.st === ST.CUP_FULL ? 'Full' : 'Filling', sub: 'Cold water. Fills to ' + cupMl + ' ml and stops by itself.', meter: Math.round(f.cup || 0) + ' / ' + cupMl + ' ml' };
        else if (a === 'waterfall') H = { eyebrow: 'WATERFALL', title: 'Waterfall', sub: 'A wide sheet of water for rinsing produce and pans.', meter: S.temp('waterfall') + ' · ' + (S.profile().flowGpm || 1.5) + ' gpm' };
        else if (a === 'hot') H = { eyebrow: 'HOT', title: 'Hot', sub: 'Never above ' + S.temp('hotcap') + ', to protect against scalding.', meter: S.temp('hot') + ' · ' + (S.profile().flowGpm || 1.5) + ' gpm' };
        else if (a === 'warm') H = { eyebrow: 'WARM', title: 'Warm', sub: 'The everyday hand-washing temperature.', meter: S.temp('warm') + ' · ' + (S.profile().flowGpm || 1.5) + ' gpm' };
        else H = { eyebrow: 'COLD', title: 'Cold', sub: 'Straight from the mains.', meter: (S.profile().flowGpm || 1.5) + ' gpm' };
      } else if (f.dsp > 0 && f.hx == null) H = { eyebrow: 'DISPOSAL', title: 'Disposal', sub: 'Runs 15 seconds, even after hands leave. Stops at once if a hand settles in any other zone.', meter: Math.ceil(f.dsp) + ' s' };
      else if (f.hx != null) {
        if (f.dsp > 0 && hov === 'disposal') H = { eyebrow: 'DISPOSAL', title: 'Running', sub: 'Runs once per session. Settle anywhere else to stop it.', meter: Math.ceil(f.dsp) + ' s' };
        else if (hov === 'neutral') H = { eyebrow: 'TRACKING', title: 'Neutral', sub: 'Nothing starts here. Hold still 3 s for clean mode.', meter: '' };
        else if (hov === 'soap' && (f.lk & 1)) H = { eyebrow: 'TRACKING', title: 'Rinse', sub: 'Soap done. Pick a water zone.', meter: '' };
        else if (hov === 'disposal' && (f.lk & 2)) H = { eyebrow: 'TRACKING', title: 'Disposal', sub: 'Runs once per session. Hands out to reset.', meter: '' };
        else if (hov && !blocked) H = { eyebrow: 'HOLD STEADY', title: FN[hov].label, sub: hov === 'disposal' ? 'Hold still for one second to start the disposal.' : 'Settle your hand and it starts.', meter: Math.round((f.set || 0) * 100) + '%' };
        else H = { eyebrow: 'TRACKING', title: 'Tracking', sub: f.flag === RS.FLAG.NOT_SETTLED ? 'Move into a zone.' : RS.FLAG_TEXT[f.flag] || '', meter: '' };
      }
    }
    hud.eyebrow.textContent = H.eyebrow; hud.eyebrow.style.color = col; hud.title.textContent = H.title; hud.sub.textContent = H.sub; hud.meter.textContent = H.meter; hud.meter.style.color = col;
    hud.modeDot.style.background = col; hud.logo.querySelector('rect').setAttribute('stroke', col);
    var d = L.describe(); hud.mode.textContent = this.attract ? 'Demo loop · ' + (L.mode === 'sim' ? 'move over the sink to take over' : 'wave in the sink to take over') : (L.mode === 'sim' ? 'Simulation · your cursor is the hand' : d.label + ' · ' + d.sub);
    var st = S.status() || {}, savedOff = (st.savedOff || 0) + this.liveTotals.off, savedFlow = (st.savedFlow || 0) + this.liveTotals.flow;
    var gal = function (ml) { return U.gal(ml).toFixed(2); };
    var stats = [
      ['WATER SAVED', gal(savedOff + savedFlow), 'gal', '#7FE0C4', gal(savedOff) + ' off when hands out · ' + gal(savedFlow) + ' flow rate'],
      ['RESPONSE', this.lastLat == null ? '–' : String(this.lastLat), 'ms', '#F2F4F6', 'hand in sink to water on'],
      ['SESSIONS', String(st.sess || 0), '', '#F2F4F6', 'zero surfaces touched']
    ];
    var box = hud.stats;
    if (box.childNodes.length !== stats.length) { U.empty(box); stats.forEach(function () { box.appendChild(h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' } }, h('div', { style: { fontSize: '11.5px', fontWeight: '600', letterSpacing: '0.2em', color: '#6E7883' } }), h('div', { style: { display: 'flex', alignItems: 'baseline', gap: '8px' } }, h('span.num', { style: { fontSize: '46px', fontWeight: '250', letterSpacing: '-0.04em' } }), h('span', { style: { fontSize: '14px', color: '#7D8792' } })), h('div', { style: { fontSize: '12px', color: '#5E6873' } }))); }); }
    stats.forEach(function (s, i) { var el = box.childNodes[i]; el.childNodes[0].textContent = s[0]; el.childNodes[1].childNodes[0].textContent = s[1]; el.childNodes[1].childNodes[0].style.color = s[3]; el.childNodes[1].childNodes[1].textContent = s[2]; el.childNodes[2].textContent = s[4]; });
  };
})();
