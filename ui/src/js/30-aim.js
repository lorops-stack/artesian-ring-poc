/* Ring Studio · Aim and area: live field of view from above and from the side, aim by sweep (self-calibration), dead areas.
   Logic without DOM lives in 06-aimcore.js; this file draws it and sends changes with the normal `cfg` command.
   Everything applies to the ring straight away (no draft), so the view always shows what the ring is using. */
var RS = globalThis.RS || (globalThis.RS = {});
(function () {
  'use strict';
  var U = RS.util, h = U.h, L = RS.link, S = RS.store, G = RS.geo, rgba = U.rgba;
  var COL = { A: '#7FD0FF', B: '#FFB27A' }, BAD = '#FF6B6B', OK = '#7FE0C4', WARN = '#F2B44B', HEAT = '#FFB000';
  var MASK_MIN = 20;                       // mm, smallest dead area that can be drawn

  var st = null;                           // screen state while mounted

  // ---- small helpers -----------------------------------------------------------------------------------------------------------------------
  function cfg() { return S.cfg(); }
  function unit() { return S.get('lenUnit'); }
  function lenTxt(mm, d) { return U.fmtLen(mm, unit(), d == null ? 1 : d); }
  function toUnit(mm) { var u = unit(); return u === 'in' ? U.round(mm / U.IN, 2) : Math.round(mm); }
  function fromUnit(v) { return U.unitToMm(v, unit()); }
  function send(obj) { return L.setMany(obj).catch(function (e) { var m = (e && e.message) || 'command failed'; if (/^no reply|^not connected/.test(m)) RS.app.toast(m, 'bad'); return null; }); }
  function chip(text, kind) { return h('span.chip' + (kind ? '.' + kind : ''), text); }
  function btn(label, fn, cls, attrs) { return h('button.btn' + (cls ? '.' + cls.trim().replace(/\s+/g, '.') : ''), Object.assign({ onclick: fn }, attrs || {}), label); }
  function rrect(ctx, x, y, w, hh, r) { r = Math.max(0, Math.min(r, w / 2, hh / 2)); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + hh, r); ctx.arcTo(x + w, y + hh, x, y + hh, r); ctx.arcTo(x, y + hh, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function isSim() { return L.mode === 'sim' && !!L.sim; }

  // ---- canvas wrapper -------------------------------------------------------------------------------------------------------------------------
  function Cv(label, getH) {
    this.el = h('div.aimcv'); this.cv = h('canvas', { 'aria-label': label }); this.cv.style.touchAction = 'none'; this.el.appendChild(this.cv);
    this.getH = getH; this.W = 0; this.H = 0;
  }
  Cv.prototype.begin = function (hPx) {
    var W = this.el.clientWidth || 600, H = Math.round(hPx), dpr = Math.min(2, (typeof devicePixelRatio !== 'undefined' && devicePixelRatio) || 1);
    if (this.el.style.height !== H + 'px') this.el.style.height = H + 'px';
    if (this.cv.width !== Math.round(W * dpr) || this.cv.height !== Math.round(H * dpr)) { this.cv.width = Math.round(W * dpr); this.cv.height = Math.round(H * dpr); }
    var ctx = this.cv.getContext('2d'); if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H); this.W = W; this.H = H; return ctx;
  };

  // ---- top view geometry -----------------------------------------------------------------------------------------------------------------------
  var PAD = 130;                                              // mm shown around the sink
  function topGeom(cv, c) {
    var W = cv.el.clientWidth || 620, M = 14, ew = c.plane.w + 2 * PAD, eh = c.plane.d + 2 * PAD, sc = (W - 2 * M) / ew, H = eh * sc + 2 * M, maxH = 560;
    if (H > maxH) { H = maxH; sc = (H - 2 * M) / eh; }
    var ox = (W - ew * sc) / 2, oy = M;
    return { W: W, H: H, sc: sc, ox: ox, oy: oy, tx: function (x) { return ox + (x + PAD) * sc; }, ty: function (y) { return oy + (y + PAD) * sc; }, fx: function (px) { return (px - ox) / sc - PAD; }, fy: function (py) { return (py - oy) / sc - PAD; } };
  }

  // Mask as currently shown (the one being dragged is the local copy)
  function maskView(id) { return (st.drag && st.drag.id === id && st.drag.m) ? st.drag.m : (cfg().masks || {})[id]; }
  function allMasks() { var c = cfg(), out = []; Object.keys(c.masks || {}).forEach(function (id) { var m = maskView(id); if (m) out.push(Object.assign({ id: id }, m)); }); return out; }

  function drawTop(now) {
    var c = cfg(), cv = st.top, g = topGeom(cv, c), ctx = cv.begin(g.H); if (!ctx) return;
    var P = c.plane, tun = c.tuning, f = st.frame, half = tun.beamHalf || 60;
    // outside area: hatched, so a false reading out here is obviously "not the sink"
    ctx.fillStyle = '#080A0D'; rrect(ctx, g.tx(-PAD), g.ty(-PAD), (P.w + 2 * PAD) * g.sc, (P.d + 2 * PAD) * g.sc, 12); ctx.fill();
    ctx.save(); rrect(ctx, g.tx(-PAD), g.ty(-PAD), (P.w + 2 * PAD) * g.sc, (P.d + 2 * PAD) * g.sc, 12); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.035)'; ctx.lineWidth = 1; ctx.beginPath();
    for (var k = -g.H; k < g.W + g.H; k += 14) { ctx.moveTo(k, 0); ctx.lineTo(k + g.H, g.H); } ctx.stroke(); ctx.restore();
    // the sink
    ctx.fillStyle = '#0E1217'; rrect(ctx, g.tx(0), g.ty(0), P.w * g.sc, P.d * g.sc, 10); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1.2; ctx.stroke();
    // zones
    if (st.showZones) {
      var zones = G.zones(c.layout, c.layouts); ctx.font = '500 10.5px Geist, system-ui';
      zones.forEach(function (z) { var fn = RS.FN[z.fn], col = fn ? fn.color : '#AEB7C2', x = g.tx(z.x0 * P.w), y = g.ty(z.y0 * P.d), w = (z.x1 - z.x0) * P.w * g.sc, hh = (z.y1 - z.y0) * P.d * g.sc;
        ctx.fillStyle = rgba(col, 0.05); ctx.fillRect(x + 1, y + 1, w - 2, hh - 2); ctx.strokeStyle = 'rgba(255,255,255,0.09)'; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, hh - 1);
        if (w > 50 && hh > 24) { ctx.fillStyle = 'rgba(255,255,255,0.32)'; ctx.fillText(fn ? fn.label : z.fn, x + 6, y + hh - 6); } });
    }
    // field of view per sensor
    ['A', 'B'].forEach(function (key) {
      var s = c.sensors[key]; if (!s || s.on === false) return;
      var cx = g.tx(s.x), cy = g.ty(s.y), r0 = (tun.rangeStart || 60) * g.sc, r1 = (tun.rangeEnd || 850) * g.sc, a0 = U.rad(s.yaw - half), a1 = U.rad(s.yaw + half), col = COL[key];
      ctx.save(); rrect(ctx, g.tx(-PAD), g.ty(-PAD), (P.w + 2 * PAD) * g.sc, (P.d + 2 * PAD) * g.sc, 12); ctx.clip();
      if (st.showFov) {
        ctx.beginPath(); ctx.arc(cx, cy, r1, a0, a1); ctx.arc(cx, cy, r0, a1, a0, true); ctx.closePath(); ctx.fillStyle = rgba(col, 0.09); ctx.fill();
        ctx.setLineDash([4, 5]); ctx.strokeStyle = rgba(col, 0.55); ctx.lineWidth = 1.1; ctx.stroke(); ctx.setLineDash([]);
      }
      // configured boresight
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(U.rad(s.yaw)) * r1, cy + Math.sin(U.rad(s.yaw)) * r1); ctx.strokeStyle = rgba(col, 0.55); ctx.lineWidth = 1; ctx.stroke();
      // measured boresight from the sweep
      var res = st.result && st.result[key];
      if (res && res.yaw != null) {
        var my = U.rad(res.yaw), len = Math.min(r1, 520 * g.sc);
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(my) * len, cy + Math.sin(my) * len); ctx.setLineDash([7, 4]); ctx.strokeStyle = col; ctx.lineWidth = 2.2; ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = col; ctx.font = '600 11px Geist, system-ui'; ctx.fillText('measured ' + Math.round(res.yaw) + '°', cx + Math.cos(my) * (len + 8) - (Math.cos(my) < 0 ? 78 : 0), cy + Math.sin(my) * (len + 8) + 4);
      }
      ctx.restore();
    });
    // learned false readings (heat)
    var ln = st.learn;
    if (ln && ln.hits > 0) {
      var cell = ln.cell;
      Object.keys(ln.cnt).forEach(function (k2) { var p = k2.split(','), x = +p[0] * cell - ln.pad, y = +p[1] * cell - ln.pad, v = ln.cnt[k2]; if (v < 2) return;
        ctx.fillStyle = rgba(HEAT, Math.min(0.85, 0.14 + 0.7 * v / Math.max(1, ln.max))); ctx.fillRect(g.tx(x), g.ty(y), cell * g.sc + 0.6, cell * g.sc + 0.6); });
    }
    // dead areas
    var masks = allMasks(), drawM = function (m, sel, ghost) {
      ctx.save(); ctx.setLineDash(ghost ? [3, 3] : [6, 4]); ctx.lineWidth = sel ? 2.2 : 1.4; ctx.strokeStyle = rgba(BAD, ghost ? 0.7 : 0.95); ctx.fillStyle = rgba(BAD, ghost ? 0.12 : 0.2);
      if (m.t === 'circle') { ctx.beginPath(); ctx.arc(g.tx(m.x), g.ty(m.y), m.r * g.sc, 0, 7); ctx.fill(); ctx.stroke(); }
      else { ctx.fillRect(g.tx(m.x), g.ty(m.y), m.w * g.sc, m.h * g.sc); ctx.strokeRect(g.tx(m.x), g.ty(m.y), m.w * g.sc, m.h * g.sc); }
      ctx.setLineDash([]);
      if (m.id) { ctx.fillStyle = '#FFB3B3'; ctx.font = '600 10.5px Geist, system-ui'; var lx = m.t === 'circle' ? g.tx(m.x) - 6 : g.tx(m.x) + 5, ly = m.t === 'circle' ? g.ty(m.y) + 4 : g.ty(m.y) + 14; ctx.fillText(m.id, lx, ly); }
      if (sel) { ctx.fillStyle = '#fff'; var hx = m.t === 'circle' ? g.tx(m.x + m.r) : g.tx(m.x + m.w), hy = m.t === 'circle' ? g.ty(m.y) : g.ty(m.y + m.h); ctx.beginPath(); ctx.arc(hx, hy, 5, 0, 7); ctx.fill(); }
      ctx.restore();
    };
    masks.forEach(function (m) { drawM(m, m.id === st.sel); });
    if (st.drag && st.drag.create) drawM(st.drag.create, false, true);
    // live echoes: one arc per echo, brighter for the pair the ring used
    if (f && st.showEchoes) {
      ['A', 'B'].forEach(function (key) {
        var s = c.sensors[key], fs = f[key]; if (!fs || !fs.e) return;
        var cx = g.tx(s.x), cy = g.ty(s.y), a0 = U.rad(s.yaw - half), a1 = U.rad(s.yaw + half), v = (c.hand.zwork || 0) + (s.z || 0);
        ctx.save(); rrect(ctx, g.tx(-PAD), g.ty(-PAD), (P.w + 2 * PAD) * g.sc, (P.d + 2 * PAD) * g.sc, 12); ctx.clip();
        fs.e.forEach(function (e, i) {
          var r = e[0] - (s.off || 0); if (r <= Math.abs(v)) return; var p = Math.sqrt(r * r - v * v) * g.sc, paired = fs.p === i, a = Math.max(0.12, Math.min(0.95, (Math.log(Math.max(e[1], 10)) / Math.LN10 - 2.4) / 2.4));
          ctx.beginPath(); ctx.arc(cx, cy, p, a0, a1); ctx.strokeStyle = rgba(COL[key], paired ? 0.95 : a * 0.8); ctx.lineWidth = paired ? 2.6 : 1.3; ctx.stroke();
        });
        ctx.restore();
      });
    }
    // hand: trail, rays from each sensor, marker
    if (f && f.hx != null) {
      var hx = g.tx(f.hx), hy = g.ty(f.hy);
      ['A', 'B'].forEach(function (key) { var s = c.sensors[key]; ctx.beginPath(); ctx.moveTo(g.tx(s.x), g.ty(s.y)); ctx.lineTo(hx, hy); ctx.strokeStyle = rgba(COL[key], 0.22); ctx.lineWidth = 1; ctx.stroke(); });
      var tr = st.trail; if (tr.length > 1) { ctx.beginPath(); tr.forEach(function (p, i) { var x = g.tx(p.x), y = g.ty(p.y); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.6; ctx.stroke(); }
      var inside = f.hx >= 0 && f.hx <= P.w && f.hy >= 0 && f.hy <= P.d;
      ctx.beginPath(); ctx.arc(hx, hy, 9, 0, 7); ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill(); ctx.strokeStyle = inside ? '#fff' : WARN; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(hx, hy, 2.5, 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
    } else if (f && f.flag) {   // why there is no fix (masked / outside / strength)
      ctx.fillStyle = f.flag === RS.FLAG.MASKED ? '#FFB3B3' : 'rgba(255,255,255,0.45)'; ctx.font = '500 12px Geist, system-ui'; ctx.textAlign = 'left';
      if (f.flag === RS.FLAG.MASKED || f.flag === RS.FLAG.OUTSIDE || f.flag === RS.FLAG.STRENGTH) ctx.fillText(RS.FLAG_TEXT[f.flag], g.tx(0) + 8, g.ty(0) + 18);
    }
    // sensors and the spacing line
    ['A', 'B'].forEach(function (key) {
      var s = c.sensors[key]; if (!s) return; var x = g.tx(s.x), y = g.ty(s.y);
      ctx.beginPath(); ctx.arc(x, y, 11, 0, 7); ctx.fillStyle = '#0C0F13'; ctx.fill(); ctx.strokeStyle = COL[key]; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = COL[key]; ctx.font = '700 10px Geist, system-ui'; ctx.textAlign = 'center'; ctx.fillText(key, x, y + 3.5); ctx.textAlign = 'left';
    });
    var A = c.sensors.A, B = c.sensors.B, base = U.hypot(A.x - B.x, A.y - B.y), bs = st.result && st.result.base, bcol = !bs || bs.status === 'few' || bs.status === 'wide' ? 'rgba(255,255,255,0.5)' : (bs.status === 'ok' ? OK : BAD);
    var dy = g.ty(-PAD * 0.5); ctx.strokeStyle = bcol; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(g.tx(A.x), dy); ctx.lineTo(g.tx(B.x), dy); ctx.moveTo(g.tx(A.x), dy - 4); ctx.lineTo(g.tx(A.x), dy + 4); ctx.moveTo(g.tx(B.x), dy - 4); ctx.lineTo(g.tx(B.x), dy + 4); ctx.stroke();
    ctx.fillStyle = bcol; ctx.font = '600 11px Geist, system-ui'; ctx.textAlign = 'center'; ctx.fillText('A to B ' + lenTxt(base) + (bs && bs.status === 'ok' ? ' · checks out' : ''), (g.tx(A.x) + g.tx(B.x)) / 2, dy - 6); ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '500 11px Geist, system-ui'; ctx.fillText('back of the sink', g.tx(P.w / 2) - 36, g.ty(0) - 6); ctx.fillText('front (you stand here)', g.tx(P.w / 2) - 56, g.ty(P.d) + 15);
    ctx.fillText('outside the sink: ignored', g.tx(-PAD) + 8, g.ty(P.d + PAD) - 6);
    st.topG = g;
  }

  // ---- side view ----------------------------------------------------------------------------------------------------------------------------------
  function rayExit(s, yawDeg, P) {
    var dx = Math.cos(U.rad(yawDeg)), dy = Math.sin(U.rad(yawDeg)), t = Infinity;
    if (dx > 1e-6) t = Math.min(t, (P.w - s.x) / dx); else if (dx < -1e-6) t = Math.min(t, (0 - s.x) / dx);
    if (dy > 1e-6) t = Math.min(t, (P.d - s.y) / dy); else if (dy < -1e-6) t = Math.min(t, (0 - s.y) / dy);
    return isFinite(t) && t > 0 ? t : 600;
  }
  function sideModel(c, key) {
    var s = c.sensors[key], r = c.rig || {}, tun = c.tuning, edge = rayExit(s, s.yaw, c.plane), recess = Math.max(0, r.recess || 0), slotH = Math.max(2, r.slotH || 14), beamV = r.beamV || 35;
    var phi0 = s.tilt || 0, slotLim = recess > 0 ? U.deg(Math.atan((slotH / 2) / recess)) : 90, lo = Math.max(phi0 - beamV, -slotLim), hi = Math.min(phi0 + beamV, slotLim);
    var vEff = G.vHalf(c), xmax = Math.max(edge + 90, 520), sink = r.sinkDepth || 190;
    return { s: s, edge: edge, recess: recess, slotH: slotH, beamV: beamV, phi0: phi0, slotLim: slotLim, lo: lo, hi: hi, vEff: vEff, xmax: xmax, sink: sink, zTop: 70, zBot: -(sink + 30), rs: tun.rangeStart || 60, re: tun.rangeEnd || 850 };
  }
  function sideGeom(cv, m) {
    var W = cv.el.clientWidth || 620, M = 12, xmin = -(m.recess + 70), span = m.xmax - xmin, sc = (W - 2 * M) / span, zspan = m.zTop - m.zBot, H = Math.min(330, zspan * sc + 2 * M + 8);
    sc = Math.min(sc, (H - 2 * M - 8) / zspan); var ox = M - xmin * sc + (W - 2 * M - span * sc) / 2, oy = M + 4;
    return { W: W, H: H, sc: sc, tx: function (x) { return ox + x * sc; }, tz: function (z) { return oy + (m.zTop - z) * sc; }, fz: function (py) { return m.zTop - (py - oy) / sc; } };
  }
  function drawSide(now) {
    var c = cfg(), key = st.side, m = sideModel(c, key), cv = st.sideCv, g = sideGeom(cv, m), ctx = cv.begin(g.H); if (!ctx) return;
    var s = m.s, col = COL[key], ez = s.z || 0, ex = -m.recess;
    // solids: countertop above the slot, sink lip below it; the far side mirrors them
    var solid = function (x0, x1, z0, z1, fill) { ctx.fillStyle = fill; ctx.fillRect(g.tx(x0), g.tz(z1), (x1 - x0) * g.sc, (z1 - z0) * g.sc); };
    var cTop = ez + m.slotH / 2, lipBot = ez - m.slotH / 2 - 14;
    solid(-m.recess - 70, 0, cTop, cTop + 30, '#2A2F36'); solid(-m.recess - 70, 0, lipBot, ez - m.slotH / 2, '#232830');
    solid(m.edge, m.edge + 90, cTop, cTop + 30, '#2A2F36'); solid(m.edge, m.edge + 90, lipBot, ez - m.slotH / 2, '#232830');
    // sink void outline: near wall, floor, far wall
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(g.tx(0), g.tz(lipBot)); ctx.lineTo(g.tx(0), g.tz(-m.sink)); ctx.lineTo(g.tx(m.edge), g.tz(-m.sink)); ctx.lineTo(g.tx(m.edge), g.tz(lipBot)); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(g.tx(0), g.tz(-m.sink), m.edge * g.sc, 4);
    // plane line
    ctx.setLineDash([2, 4]); ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(g.tx(-m.recess - 70), g.tz(0)); ctx.lineTo(g.tx(m.xmax), g.tz(0)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '500 10.5px Geist, system-ui'; ctx.fillText('sensing plane', g.tx(m.xmax) - 70, g.tz(0) - 4); ctx.fillText('countertop', g.tx(-m.recess - 64), g.tz(cTop + 12)); ctx.fillText('sink floor', g.tx(m.edge / 2) - 20, g.tz(-m.sink) - 6);
    // hand height band (assumed, not measured)
    var hd = c.hand, zA = -(hd.zmin), zB = -(hd.zmax), p0 = Math.max(m.rs, 0);
    ctx.fillStyle = rgba(OK, 0.09); ctx.fillRect(g.tx(p0), g.tz(Math.max(zA, zB)), (m.edge - p0) * g.sc, Math.abs(zA - zB) * g.sc); ctx.setLineDash([5, 4]); ctx.strokeStyle = rgba(OK, 0.6); ctx.lineWidth = 1;
    ctx.strokeRect(g.tx(p0), g.tz(Math.max(zA, zB)), (m.edge - p0) * g.sc, Math.abs(zA - zB) * g.sc); ctx.setLineDash([]);
    // the fan (what the sensor sees through the slot) and the wider lobe
    var fan = function (phiLo, phiHi, fill, stroke, dash) {
      var L1 = m.xmax * 1.3, a0 = U.rad(phiLo), a1 = U.rad(phiHi);
      ctx.beginPath(); ctx.moveTo(g.tx(ex), g.tz(ez)); ctx.lineTo(g.tx(ex + Math.cos(a0) * L1), g.tz(ez + Math.sin(a0) * L1)); ctx.lineTo(g.tx(ex + Math.cos(a1) * L1), g.tz(ez + Math.sin(a1) * L1)); ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.setLineDash(dash || []); ctx.strokeStyle = stroke; ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]); }
    };
    ctx.save(); ctx.beginPath(); ctx.rect(g.tx(0), 0, g.W, g.H); ctx.clip();            // only past the aperture
    if (m.recess > 0) fan(m.phi0 - m.beamV, m.phi0 + m.beamV, null, rgba(col, 0.35), [3, 4]);
    fan(m.lo, m.hi, rgba(col, 0.12), rgba(col, 0.75));
    // range limits
    [m.rs, m.re].forEach(function (R, i) { ctx.beginPath(); ctx.arc(g.tx(ex), g.tz(ez), R * g.sc, -U.rad(m.hi), -U.rad(m.lo)); ctx.setLineDash(i ? [2, 5] : [3, 3]); ctx.strokeStyle = rgba(col, 0.5); ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]); });
    // live echo arcs
    var f = st.frame;
    if (f && f[key] && f[key].e && st.showEchoes) f[key].e.forEach(function (e, i) { var r = e[0] - (s.off || 0), paired = f[key].p === i;
      ctx.beginPath(); ctx.arc(g.tx(ex), g.tz(ez), r * g.sc, -U.rad(m.hi), -U.rad(m.lo)); ctx.strokeStyle = rgba(col, paired ? 0.95 : 0.35); ctx.lineWidth = paired ? 2.6 : 1.2; ctx.stroke(); });
    ctx.restore();
    // sensor in its slot
    ctx.fillStyle = '#0C0F13'; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.fillRect(g.tx(ex) - 5, g.tz(ez) - 8, 6, 16); ctx.strokeRect(g.tx(ex) - 5, g.tz(ez) - 8, 6, 16);
    ctx.fillStyle = col; ctx.font = '700 11px Geist, system-ui'; ctx.fillText(key, g.tx(ex) - 4, g.tz(ez) - 12);
    // hand marker and the assumed height line
    var zw = -(hd.zwork || 0); ctx.setLineDash([6, 4]); ctx.strokeStyle = OK; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(g.tx(p0), g.tz(zw)); ctx.lineTo(g.tx(m.edge), g.tz(zw)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = OK; ctx.beginPath(); ctx.arc(g.tx(m.edge) - 2, g.tz(zw), 6, 0, 7); ctx.fill(); ctx.font = '600 10.5px Geist, system-ui';
    ctx.fillText('hand height ' + (hd.zwork >= 0 ? lenTxt(hd.zwork) + ' below' : lenTxt(-hd.zwork) + ' above') + ' the sensors (assumed, not measured)', g.tx(p0) + 6, g.tz(zw) - 6 - (zw > -20 ? 10 : 0));
    if (f && f.hx != null) { var p = G.planar(s, f.hx, f.hy); if (p < m.xmax) { ctx.beginPath(); ctx.arc(g.tx(p), g.tz(zw), 7, 0, 7); ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); } }
    st.sideG = g; st.sideM = m;
  }
  function sideNotes() {
    var c = cfg(), m = sideModel(c, st.side), out = [], hd = c.hand, tanV = Math.tan(U.rad(Math.max(1, m.vEff))), need = Math.max(Math.abs(hd.zmin), Math.abs(hd.zmax)) / tanV;
    out.push(['Vertical fan', '±' + Math.round(m.vEff) + '°', m.recess > 0 && m.slotLim < m.beamV ? 'The ' + Math.round(m.beamV) + '° lobe is narrowed by the slot (' + lenTxt(m.slotH) + ' high, ' + lenTxt(m.recess) + ' deep).' : 'The lobe sets the fan; there is no slot narrowing.']);
    out.push(['Hand band covered from', need > m.edge ? 'never' : lenTxt(need, 0), need > m.edge ? 'The hand band is taller than the fan across the whole sink. Make the slot taller or the recess shorter, or narrow the band.' : 'Closer to the sensor than this, a hand at the top or bottom of its height range leaves the fan.']);
    var phi = m.lo; if (phi < -0.5) { var dz = (m.s.z || 0) + m.sink, xh = -m.recess + dz / Math.tan(U.rad(-phi)), r = Math.sqrt(Math.pow(xh + m.recess, 2) + dz * dz);
      out.push(['Sink floor in the beam', xh < m.edge && r < m.re ? 'from ' + lenTxt(xh, 0) : 'out of range', xh < m.edge && r < m.re ? 'Expect a steady echo from the floor at about ' + lenTxt(r, 0) + '. Record it with C6 (empty sink) so it is ignored.' : 'The floor is not in view, so it cannot cause echoes.']); }
    else out.push(['Sink floor in the beam', 'not hit', 'The lower edge of the fan never reaches the floor.']);
    return out;
  }

  // ---- panels ------------------------------------------------------------------------------------------------------------------------------------------
  // numeric config field bound to a path; kind: 'len' (mm shown in the length unit), 'deg', 'mm' (always mm), 'n'
  function bindField(label, path, kind, opts) {
    opts = opts || {}; var inp = h('input.num', { type: 'number', step: kind === 'len' ? (unit() === 'in' ? 0.05 : 1) : (opts.step || 1) }), unitLbl = h('span.unit', ''), wrap = h('div.field', h('label', label), h('div.in', inp, unitLbl));
    inp.classList.add('u');
    var get = function () { var v = U.getPath(cfg(), path); return v == null ? 0 : v; };
    var refresh = function () { if (document.activeElement === inp) return; var v = get(); inp.value = kind === 'len' ? toUnit(v) : U.round(v, kind === 'deg' ? 1 : 0); unitLbl.textContent = kind === 'len' ? unit() : kind === 'deg' ? '°' : 'mm'; };
    inp.addEventListener('change', function () {
      var v = parseFloat(inp.value); if (!isFinite(v)) { refresh(); return; }
      var val = kind === 'len' ? fromUnit(v) : v; if (opts.min != null) val = Math.max(opts.min, val); if (opts.max != null) val = Math.min(opts.max, val);
      var o = {}; o[path] = U.round(val, 2); if (opts.after) opts.after(val, o); send(o);
      if (/^tuning\.range/.test(path)) RS.app.toast('Range changed: the sensors reset and re-apply it (keep the sink empty for 3 s).', 'info', 4200);
    });
    wrap.refresh = refresh; refresh(); st.fields.push(wrap); return wrap;
  }
  function stepper(label, path, small, big) {
    var val = h('span.num', { style: { minWidth: '54px', textAlign: 'center', fontWeight: 600 } }, ''), refresh = function () { val.textContent = U.round(U.getPath(cfg(), path) || 0, 1) + '°'; };
    var bump = function (d) { return function () { var o = {}; o[path] = U.round(((U.getPath(cfg(), path) || 0) + d + 360) % 360, 1); send(o); }; };
    var row = h('div.row.gap-s', h('span.small.dim', { style: { width: '46px' } }, label), btn('−' + big, bump(-big), 'sm ghost'), btn('−' + small, bump(-small), 'sm ghost'), val, btn('+' + small, bump(small), 'sm ghost'), btn('+' + big, bump(big), 'sm ghost'));
    row.refresh = refresh; refresh(); st.fields.push(row); return row;
  }
  function applyPreset(mount) {
    var P = RS.PRESETS[mount], c = cfg(); if (!P || RS.mountOf(c) === mount) return;
    RS.app.confirm('Switch to the ' + P.name + ' mount?', P.note + '. This sets the sensor tilt and height, the hand height range and the wand depths. Positions, yaw and calibration offsets stay as they are.', 'Switch').then(function (ok) {
      if (!ok) return; var o = {};
      ['A', 'B', 'C'].forEach(function (k) { o['sensors.' + k + '.tilt'] = P.tilt; o['sensors.' + k + '.z'] = P.z; });
      o['hand.zmin'] = P.hand.zmin; o['hand.zmax'] = P.hand.zmax; o['hand.zwork'] = P.hand.zwork; Object.keys(P.rig).forEach(function (k) { o['rig.' + k] = P.rig[k]; }); send(o);
    });
  }

  function buildRigCard() {
    var seg = h('div.seg'); st.mountBtns = {};
    Object.keys(RS.PRESETS).forEach(function (k) { var b = h('button', { onclick: function () { applyPreset(k); } }, RS.PRESETS[k].name); st.mountBtns[k] = b; seg.appendChild(b); });
    var grp = function (title, kids) { return h('div.mt', h('div.eyebrow', title), h('div.grid.c2.mt-s', kids)); };
    var card = h('div.card', h('div.row.between.wrap', h('div', h('h2', 'Mount and area'), h('div.sub', 'Everything here applies to the ring straight away.')), seg),
      h('div.sub.small.mt-s', { id: 'aim-mount-note' }, ''),
      grp('Sink', [bindField('Width (A to B side)', 'plane.w', 'len', { min: 100 }), bindField('Depth (back to front)', 'plane.d', 'len', { min: 100 }), bindField('Spacing A to B', 'sensors.B.x', 'len', { min: 100 }), bindField('Sink depth to floor', 'rig.sinkDepth', 'len', { min: 20 })]),
      h('div.mt', h('div.eyebrow', 'Aim (where the beam points)'), h('div.col.gap-s.mt-s', [stepper('Sensor A', 'sensors.A.yaw', 1, 5), stepper('Sensor B', 'sensors.B.yaw', 1, 5)]), h('div.tiny.faint.mt-s', 'Angles are measured from the back edge toward the front: A at 45° and B at 135° point at each other’s far corner. Position does not depend on aim; only the echo strength does.')),
      grp('Slot and beam', [bindField('Slot height', 'rig.slotH', 'len', { min: 2 }), bindField('Recess (emitter to opening)', 'rig.recess', 'len', { min: 0 }), bindField('Beam half-width, flat', 'tuning.beamHalf', 'deg', { min: 10, max: 89 }), bindField('Beam half-width, vertical', 'rig.beamV', 'deg', { min: 5, max: 89 })]),
      grp('Hand', [bindField('Hand height (below the sensors)', 'hand.zwork', 'len'), bindField('Highest it goes (below sensors)', 'hand.zmin', 'len'), bindField('Lowest it goes (below sensors)', 'hand.zmax', 'len')]),
      grp('Range', [bindField('Nearest echo', 'tuning.rangeStart', 'mm', { min: 40, max: 300 }), bindField('Farthest echo', 'tuning.rangeEnd', 'mm', { min: 400, max: 1500 })]));
    return card;
  }

  // ---- aim assistant (self-calibration) -----------------------------------------------------------------------------------------------------------
  function buildAimCard() {
    st.sweepBtn = btn('Start sweep', toggleSweep, 'primary'); st.sweepInfo = h('div.sub.small', 'Not started'); st.aimBody = h('div.col.mt');
    var demo = isSim() ? btn('Demo sweep', function () { st.demo = { t0: U.now() }; if (!st.sweeping) toggleSweep(); }, 'sm accent') : null;
    return h('div.card', h('h2', 'Aim assistant'),
      h('div.sub', 'Move your hand slowly over the whole sink for about 20 seconds. The ring reads where each beam is strongest, checks the sensor spacing against your readings, and tells you how to turn each block.'),
      h('div.row.wrap.mt', st.sweepBtn, btn('Reset', resetSweep, 'sm'), demo, st.sweepInfo), st.aimBody);
  }
  function toggleSweep() {
    st.sweeping = !st.sweeping; st.sweepBtn.textContent = st.sweeping ? 'Stop sweep' : 'Start sweep'; st.sweepBtn.classList.toggle('primary', !st.sweeping);
    if (st.sweeping) { st.sweepT0 = U.now(); } else if (st.demo) { st.demo = null; if (isSim()) L.sim.setHand(null, false); }
    refreshAim();
  }
  function resetSweep() { st.sweep.reset(); st.result = null; st.sweepT0 = U.now(); refreshAim(); }
  function refreshAim() {
    var c = cfg(), r = st.sweep.n >= 1 ? st.sweep.result(c) : null; st.result = r;
    var secs = st.sweeping ? Math.round((U.now() - st.sweepT0) / 1000) : 0;
    st.sweepInfo.textContent = (st.sweeping ? 'Sweeping ' + secs + ' s · ' : '') + st.sweep.A.length + ' readings · ' + Math.round(st.sweep.coverage() * 100) + '% of the sink covered';
    var body = st.aimBody; U.empty(body); if (!r) { body.appendChild(h('div.sub.small.dim', 'Nothing yet. Press Start sweep, then move your hand around the sink.')); return; }
    var cov = h('div.bar', h('i', { style: { width: Math.round(r.coverage * 100) + '%' } }));
    body.appendChild(h('div', h('div.row.between.small.dim', h('span', 'Coverage'), h('span', Math.round(r.coverage * 100) + '%')), cov));
    ['A', 'B'].forEach(function (key) {
      var res = r[key], typed = c.sensors[key].yaw, ok = res && res.yaw != null, hint = RS.aim.hint(key, res, c);
      var row = h('div.card.tight.solid', { style: { borderColor: rgba(COL[key], 0.35) } },
        h('div.row.between.wrap', h('div.row', h('span.fixcode', { style: { color: COL[key], borderColor: rgba(COL[key], 0.5) } }, key), h('strong', 'Sensor ' + key)), ok ? chip(res.quality === 'good' ? 'Reliable' : res.quality === 'fair' ? 'Rough' : 'Weak', res.quality === 'good' ? 'ok' : 'warn') : chip('Need more', 'info')),
        h('div.grid.c3.mt-s', stat('Set to', Math.round(typed) + '°'), stat('Measured', ok ? Math.round(res.yaw) + '°' : '–'), stat('Off by', ok ? (res.delta > 0 ? '+' : '') + U.round(res.delta, 0) + '°' : '–')),
        h('div.sub.small.mt-s', hint));
      if (ok && Math.abs(res.delta) >= 2) row.appendChild(h('div.row.wrap.mt-s', btn('Apply ' + Math.round(res.yaw) + '° to ' + key, function () { var o = {}; o['sensors.' + key + '.yaw'] = U.round(res.yaw, 1); send(o); }, 'sm accent'), res.half && res.quality !== 'poor' ? h('span.tiny.faint', 'Beam half-width about ' + Math.round(res.half) + '° (set ' + Math.round(c.tuning.beamHalf) + '°)') : null));
      body.appendChild(row);
    });
    var A = r.A, B = r.B;
    if (A && B && A.yaw != null && B.yaw != null && (Math.abs(A.delta) >= 2 || Math.abs(B.delta) >= 2)) body.appendChild(h('div.row.end', btn('Apply both', function () { var o = {}; o['sensors.A.yaw'] = U.round(A.yaw, 1); o['sensors.B.yaw'] = U.round(B.yaw, 1); send(o); }, 'sm primary')));
    var bs = r.base, kind = bs.status === 'ok' ? 'ok' : bs.status === 'low' || bs.status === 'high' ? 'bad' : 'info';
    body.appendChild(h('div.callout.' + kind, h('strong', 'Sensor spacing check'), h('div.sub.small.mt-s', bs.msg), bs.lo != null ? h('div.tiny.faint.mt-s', 'Readings allow ' + lenTxt(bs.lo, 0) + ' to ' + lenTxt(bs.hi, 0) + '. Set to ' + lenTxt(bs.base, 0) + '.') : null));
    body.appendChild(h('div.tiny.faint', 'The aim estimate is accurate to roughly ±8° when the sweep covers the sink. It reads the beam from echo strength, which also depends on how you hold your hand.'));
  }
  function stat(label, value) { return h('div.tile', h('div.v.num', value), h('div.l', label)); }

  // ---- dead areas ---------------------------------------------------------------------------------------------------------------------------------------
  function buildMaskCard() {
    st.maskList = h('div.col.gap-s.mt'); st.learnInfo = h('div.sub.small'); st.learnList = h('div.col.gap-s.mt-s');
    st.toolBtns = {};
    var tools = h('div.seg');
    [['hand', 'Hand'], ['select', 'Edit'], ['rect', 'Draw box'], ['circle', 'Draw circle']].forEach(function (t) { if (t[0] === 'hand' && !isSim()) return; var b = h('button', { onclick: function () { setTool(t[0]); } }, t[1]); st.toolBtns[t[0]] = b; tools.appendChild(b); });
    st.learnBtn = btn('Start learning', toggleLearn, 'sm primary');
    var faults = isSim() ? h('div.row.wrap.mt', h('span.tiny.faint', 'Simulator:'), faultChip('hotspot', 'Flickering reflector in the sink'), faultChip('aimOff', 'Blocks not aimed perfectly')) : null;
    return h('div.card', h('div.row.between.wrap', h('div', h('h2', 'Dead areas'), h('div.sub', 'A reading that lands in a dead area is ignored. Outside the sink is always ignored.')), tools),
      h('div.tiny.faint.mt-s', isSim() ? 'Hand: your cursor is the hand (move it outside the sink to try a body beside it). Edit: drag a dead area to move it, drag the white dot to resize. Draw: drag on the plan.' : 'Edit: drag a dead area to move it, drag the white dot to resize. Draw: drag on the plan.'),
      h('div.mt', h('div.eyebrow', 'Learn false readings'), h('div.sub.small.mt-s', 'Keep the sink empty, start learning, then make the false readings happen (someone walks past, the tap drips, a cloth hangs on the edge). Busy spots light up orange and are offered as dead areas.'),
        h('div.row.wrap.mt-s', st.learnBtn, btn('Clear', function () { st.learn.reset(); st.learnProps = []; refreshLearn(); }, 'sm'), st.learnInfo), st.learnList),
      faults, h('div.mt', h('div.row.between', h('div.eyebrow', 'Dead areas now'), btn('Remove all', clearMasks, 'sm ghost')), st.maskList));
  }
  function faultChip(name, label) {
    var on = false, el = h('button.chip', { style: { cursor: 'pointer' } }, label), sync = function () { el.classList.toggle('info', on); };
    el.addEventListener('click', function () { on = !on; sync(); L.send({ c: 'fault', name: name, on: on }); if (name === 'hotspot' && on) RS.app.toast('A reflector now flickers at 17 in across, 6 in from the back. Try Learn false readings.', 'info', 4200); });
    return el;
  }
  function setTool(t) { st.tool = t; Object.keys(st.toolBtns).forEach(function (k) { st.toolBtns[k].classList.toggle('on', k === t); }); if (t !== 'hand' && isSim()) L.sim.setHand(null, false); st.top.cv.style.cursor = t === 'hand' ? 'crosshair' : (t === 'select' ? 'default' : 'copy'); }
  function toggleLearn() {
    st.learning = !st.learning; st.learnBtn.textContent = st.learning ? 'Stop learning' : 'Start learning'; st.learnBtn.classList.toggle('primary', !st.learning);
    if (!st.learning) st.learnProps = st.learn.proposals(cfg()); refreshLearn();
  }
  function refreshLearn() {
    var ln = st.learn; st.learnInfo.textContent = ln.frames ? ln.frames + ' frames · ' + ln.inside + ' false readings inside, ' + ln.outside + ' outside (ignored)' : 'Not started';
    U.empty(st.learnList);
    if (st.learning) { st.learnList.appendChild(h('div.tiny.faint', 'Learning… stop it when the false readings have happened a few times.')); return; }
    var props = st.learnProps || [];
    if (!ln.frames) return;
    if (!props.length) { st.learnList.appendChild(h('div.callout.ok', h('div.sub.small', ln.hits ? 'No busy spot stood out. The few readings seen were scattered.' : 'No false readings seen. Nothing to mask.'))); return; }
    props.forEach(function (p, i) {
      var m = p.mask, desc = m.t === 'circle' ? 'circle, radius ' + lenTxt(m.r) : 'box ' + lenTxt(m.w) + ' by ' + lenTxt(m.h);
      st.learnList.appendChild(h('div.row.between.wrap.check', h('span', h('strong', p.where === 'inside' ? 'Inside the sink' : 'Outside the sink'), ' · ' + p.hits + ' readings near ' + lenTxt(p.cx, 0) + ' across, ' + lenTxt(p.cy, 0) + ' from the back · ' + desc),
        p.where === 'inside' ? btn('Add as dead area', function () { addMask(m); st.learnProps.splice(i, 1); refreshLearn(); }, 'sm accent') : chip('already ignored', 'info')));
    });
    var ins = props.filter(function (p) { return p.where === 'inside'; });
    if (ins.length > 1) st.learnList.appendChild(h('div.row.end', btn('Add all inside the sink', function () { ins.forEach(function (p) { addMask(p.mask); }); st.learnProps = props.filter(function (p) { return p.where !== 'inside'; }); refreshLearn(); }, 'sm primary')));
  }
  function addMask(m) {
    var id = RS.aim.nextMaskId(Object.assign({}, cfg().masks, st.pendingIds)); st.pendingIds = st.pendingIds || {}; st.pendingIds[id] = 1; setTimeout(function () { delete st.pendingIds[id]; }, 800);
    var o = {}; o['masks.' + id] = m; send(o); return id;
  }
  function clearMasks() {
    var ids = Object.keys(cfg().masks || {}); if (!ids.length) return;
    RS.app.confirm('Remove all dead areas?', ids.length + ' dead area' + (ids.length > 1 ? 's' : '') + ' will be removed.', 'Remove', true).then(function (ok) { if (!ok) return; var o = {}; ids.forEach(function (id) { o['masks.' + id] = null; }); send(o); });
  }
  function refreshMasks() {
    var list = st.maskList; U.empty(list); var ids = Object.keys(cfg().masks || {});
    if (!ids.length) { list.appendChild(h('div.sub.small.dim', 'None. Everything inside the sink counts.')); return; }
    ids.forEach(function (id) {
      var m = cfg().masks[id], sel = st.sel === id, desc = m.t === 'circle' ? 'circle · radius ' + lenTxt(m.r) + ' · centre ' + lenTxt(m.x, 1) + ', ' + lenTxt(m.y, 1) : 'box · ' + lenTxt(m.w) + ' by ' + lenTxt(m.h) + ' · corner ' + lenTxt(m.x, 1) + ', ' + lenTxt(m.y, 1);
      var row = h('div.card.tight.solid', { style: sel ? { borderColor: rgba(BAD, 0.6) } : null },
        h('div.row.between.wrap', h('div.row', { style: { cursor: 'pointer' }, onclick: function () { st.sel = sel ? null : id; refreshMasks(); } }, h('span.fixcode.bad', id), h('span.small', desc)), btn('Delete', function () { var o = {}; o['masks.' + id] = null; if (st.sel === id) st.sel = null; send(o); }, 'sm ghost')));
      if (sel) {
        var fields = m.t === 'circle' ? [['Centre across', 'x'], ['Centre from back', 'y'], ['Radius', 'r']] : [['Corner across', 'x'], ['Corner from back', 'y'], ['Width', 'w'], ['Height', 'h']];
        row.appendChild(h('div.grid.c2.mt-s', fields.map(function (fl) {
          var inp = h('input.num.u', { type: 'number', step: unit() === 'in' ? 0.05 : 1, value: toUnit(m[fl[1]]) });
          inp.addEventListener('change', function () { var v = parseFloat(inp.value); if (!isFinite(v)) return; var o = {}, nm = Object.assign({}, m); nm[fl[1]] = U.round(fromUnit(v), 1); if ((fl[1] === 'r' || fl[1] === 'w' || fl[1] === 'h') && nm[fl[1]] < MASK_MIN / 2) return; o['masks.' + id] = nm; send(o); });
          return h('div.field', h('label', fl[0]), h('div.in', inp, h('span.unit', unit())));
        })));
      }
      list.appendChild(row);
    });
  }

  // ---- pointer handling on the top view -----------------------------------------------------------------------------------------------------------
  function evMm(e) { var r = st.top.cv.getBoundingClientRect(), g = st.topG || topGeom(st.top, cfg()); return { x: g.fx(e.clientX - r.left), y: g.fy(e.clientY - r.top), px: e.clientX - r.left, py: e.clientY - r.top }; }
  function hitMask(p) {
    var g = st.topG, ms = allMasks(), i;
    for (i = ms.length - 1; i >= 0; i--) {   // resize handle of the selected one first
      var m = ms[i]; if (m.id !== st.sel) continue;
      var hx = m.t === 'circle' ? g.tx(m.x + m.r) : g.tx(m.x + m.w), hy = m.t === 'circle' ? g.ty(m.y) : g.ty(m.y + m.h);
      if (U.hypot(p.px - hx, p.py - hy) < 11) return { id: m.id, mode: 'resize', m: m };
    }
    for (i = ms.length - 1; i >= 0; i--) { var q = ms[i]; if (G.maskHit([q], p.x, p.y)) return { id: q.id, mode: 'move', m: q }; }
    return null;
  }
  function onDown(e) {
    if (st.tool === 'hand') { if (RS.sound && RS.sound.unlockOnGesture) RS.sound.unlockOnGesture(); onMove(e); return; }
    var p = evMm(e); try { st.top.cv.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
    if (st.tool === 'select') {
      var hit = hitMask(p); if (hit) { st.sel = hit.id; st.drag = { id: hit.id, mode: hit.mode, start: p, orig: Object.assign({}, hit.m), m: Object.assign({}, hit.m) }; delete st.drag.m.id; refreshMasks(); } else { st.sel = null; refreshMasks(); }
    } else { st.drag = { create: { t: st.tool === 'circle' ? 'circle' : 'rect', x: p.x, y: p.y, r: 0, w: 0, h: 0 }, start: p }; }
  }
  function onMove(e) {
    var p = evMm(e), c = cfg();
    if (st.tool === 'hand') { if (isSim()) L.sim.setHand({ x: U.clamp(p.x, -PAD, c.plane.w + PAD), y: U.clamp(p.y, -PAD, c.plane.d + PAD), h: c.hand.zwork }, false); return; }
    var d = st.drag; if (!d) { st.top.cv.style.cursor = st.tool === 'select' ? (hitMask(p) ? 'move' : 'default') : 'copy'; return; }
    var dx = p.x - d.start.x, dy = p.y - d.start.y;
    if (d.create) {
      var m = d.create; if (m.t === 'circle') { m.r = U.hypot(dx, dy); } else { m.x = Math.min(d.start.x, p.x); m.y = Math.min(d.start.y, p.y); m.w = Math.abs(dx); m.h = Math.abs(dy); }
    } else if (d.mode === 'move') { d.m.x = U.round(d.orig.x + dx, 1); d.m.y = U.round(d.orig.y + dy, 1); }
    else if (d.m.t === 'circle') d.m.r = Math.max(MASK_MIN / 2, U.round(d.orig.r + dx, 1)); else { d.m.w = Math.max(MASK_MIN, U.round(d.orig.w + dx, 1)); d.m.h = Math.max(MASK_MIN, U.round(d.orig.h + dy, 1)); }
  }
  function onUp(e) {
    if (st.tool === 'hand') { if (e && e.pointerType === 'touch' && isSim()) L.sim.setHand(null, false); return; }
    var d = st.drag; st.drag = null; if (!d) return;
    if (d.create) {
      var m = d.create, ok = m.t === 'circle' ? m.r >= MASK_MIN / 2 : (m.w >= MASK_MIN && m.h >= MASK_MIN); if (!ok) return;
      var out = m.t === 'circle' ? { t: 'circle', x: U.round(m.x, 1), y: U.round(m.y, 1), r: U.round(m.r, 1) } : { t: 'rect', x: U.round(m.x, 1), y: U.round(m.y, 1), w: U.round(m.w, 1), h: U.round(m.h, 1) };
      st.sel = addMask(out); setTool('select');
    } else { var o = {}; o['masks.' + d.id] = d.m; send(o); }
  }
  function onLeave() { if (st.tool === 'hand' && isSim()) L.sim.setHand(null, false); }
  // Dragging the hand-height line in the side view
  function sideDown(e) {
    var g = st.sideG, m = st.sideM; if (!g || !m) return; var r = st.sideCv.cv.getBoundingClientRect(), py = e.clientY - r.top, zw = -(cfg().hand.zwork || 0);
    if (Math.abs(py - g.tz(zw)) < 14) { st.sideDrag = true; try { st.sideCv.cv.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } }
  }
  function sideMove(e) {
    var g = st.sideG; if (!g) return; var r = st.sideCv.cv.getBoundingClientRect(), py = e.clientY - r.top;
    if (st.sideDrag) { var z = U.clamp(g.fz(py), -st.sideM.sink, 60), v = Math.round(-z / 5) * 5; st.sideHand = v; }
    else st.sideCv.cv.style.cursor = Math.abs(py - g.tz(-(cfg().hand.zwork || 0))) < 14 ? 'ns-resize' : 'default';
  }
  function sideUp() { if (!st.sideDrag) return; st.sideDrag = false; if (st.sideHand != null) { send({ 'hand.zwork': st.sideHand }); st.sideHand = null; } }

  // ---- screen ----------------------------------------------------------------------------------------------------------------------------------------------
  function onFrame(f) {
    st.frame = f;
    if (f.hx != null) { st.trail.push({ x: f.hx, y: f.hy, t: f.t }); while (st.trail.length && f.t - st.trail[0].t > 1500) st.trail.shift(); } else if (st.trail.length && f.t - st.trail[st.trail.length - 1].t > 400) st.trail = [];
    var c = cfg(); if (st.sweeping) st.sweep.add(f, c); if (st.learning) st.learn.add(f, c);
  }
  function refreshLive() {
    var f = st.frame, c = cfg(); if (!f) { st.live.textContent = 'Waiting for the ring…'; return; }
    var parts = [];
    parts.push(f.hx != null ? 'Fix ' + lenTxt(f.hx, 1) + ' across, ' + lenTxt(f.hy, 1) + ' from the back' : (f.flag ? RS.FLAG_TEXT[f.flag] : 'No hand'));
    parts.push('A ' + (f.A && f.A.e ? f.A.e.length : 0) + ' echoes · B ' + (f.B && f.B.e ? f.B.e.length : 0) + ' echoes');
    if (f.A && f.B) parts.push(Math.round((f.A.hz + f.B.hz) / 2) + ' Hz');
    st.live.textContent = parts.join('   ·   ');
    var flagged = f.flag === RS.FLAG.MASKED; st.live.style.color = flagged ? '#FFB3B3' : '';
  }
  function refreshStatic() {
    st.fields.forEach(function (fl) { fl.refresh(); });
    var c = cfg(), P = RS.preset(c); var note = document.getElementById('aim-mount-note'); if (note) note.textContent = P.note + '.';
    Object.keys(st.mountBtns).forEach(function (k) { st.mountBtns[k].classList.toggle('on', RS.mountOf(c) === k); });
    refreshMasks(); refreshSideNotes();
  }
  function refreshSideNotes() {
    var box = st.sideNotes; U.empty(box); sideNotes().forEach(function (n) { box.appendChild(h('div.tile', h('div.v.num', { style: { fontSize: '20px' } }, n[1]), h('div.l', n[0]), h('div.tiny.faint.mt-s', n[2]))); });
  }

  var Aim = {
    title: 'Aim and area',
    mount: function (host) {
      st = { fields: [], tool: isSim() ? 'hand' : 'select', sel: null, drag: null, frame: L.latest.frame, trail: [], sweep: new RS.aim.Sweep(), learn: new RS.aim.Learn(), learnProps: [], sweeping: false, learning: false, result: null,
        side: 'A', showZones: true, showFov: true, showEchoes: true, unsub: [], lastUi: 0, lastCfgKey: '' };
      st.top = new Cv('Plan view of the sink with sensor fields of view'); st.sideCv = new Cv('Side view of the slot, beam and hand height');
      var scroll = h('div.scroll'), wrap = h('div.wrap'); scroll.appendChild(wrap); host.appendChild(scroll);
      st.live = h('div.small', { style: { minHeight: '18px' } }, '');
      var toggles = h('div.row.wrap.gap-s');
      [['showZones', 'Zones'], ['showFov', 'Field of view'], ['showEchoes', 'Echoes']].forEach(function (t) { var b = h('button.chip' + (st[t[0]] ? '.info' : ''), { style: { cursor: 'pointer' }, onclick: function () { st[t[0]] = !st[t[0]]; b.classList.toggle('info', st[t[0]]); } }, t[1]); toggles.appendChild(b); });
      var legend = h('div.row.wrap.gap-s.tiny.dim', h('span', { style: { color: COL.A } }, '● Sensor A'), h('span', { style: { color: COL.B } }, '● Sensor B'), h('span', { style: { color: BAD } }, '▭ Dead area'), h('span', { style: { color: HEAT } }, '■ False readings learned'), h('span', 'Arcs are the echoes each sensor hears; the bright arc is the one the ring used.'));
      var topCard = h('div.card', h('div.row.between.wrap', h('div', h('h2', 'From above'), h('div.sub', 'What each sensor can see across the sink, live.')), toggles), h('div.mt-s', st.live), st.top.el, h('div.mt-s', legend));
      var sideSeg = h('div.seg'); ['A', 'B'].forEach(function (k) { var b = h('button' + (k === st.side ? '.on' : ''), { onclick: function () { st.side = k; Array.prototype.forEach.call(sideSeg.children, function (x) { x.classList.toggle('on', x.textContent === 'Sensor ' + k); }); refreshSideNotes(); } }, 'Sensor ' + k); sideSeg.appendChild(b); });
      st.sideNotes = h('div.grid.c3.mt');
      var sideCard = h('div.card', h('div.row.between.wrap', h('div', h('h2', 'From the side'), h('div.sub', 'The beam leaving the slot, the sink floor and the height range of your hand. Drag the green line to set the hand height.')), sideSeg), h('div.mt-s', st.sideCv.el), st.sideNotes,
        h('div.tiny.faint.mt-s', 'The sensor measures distance, not height. The hand height here is a setting, not a reading. Beam and slot are modelled as straight-line fans; real radar also bends around edges, so treat the numbers as a guide.'));
      var left = h('div.col', topCard, sideCard), right = h('div.col', buildAimCard(), buildMaskCard(), buildRigCard());
      wrap.appendChild(h('div.aim-grid', left, right));
      st.top.cv.addEventListener('pointerdown', onDown); st.top.cv.addEventListener('pointermove', onMove); st.top.cv.addEventListener('pointerup', onUp); st.top.cv.addEventListener('pointercancel', onUp); st.top.cv.addEventListener('pointerleave', onLeave);
      st.sideCv.cv.addEventListener('pointerdown', sideDown); st.sideCv.cv.addEventListener('pointermove', sideMove); st.sideCv.cv.addEventListener('pointerup', sideUp); st.sideCv.cv.addEventListener('pointercancel', sideUp);
      st.unsub.push(L.on('frame', onFrame)); st.unsub.push(L.on('cfg', function () { refreshStatic(); }));
      st.unsub.push(S.on('change:lenUnit', function () { refreshStatic(); refreshAim(); }));
      setTool(st.tool); refreshStatic(); refreshAim(); refreshLearn();
    },
    unmount: function () {
      if (!st) return; if (isSim()) L.sim.setHand(null, false);
      st.unsub.forEach(function (u) { try { u(); } catch (e) { /* ignore */ } }); st = null;
    },
    tick: function (now) {
      if (!st) return;
      var c = cfg();
      // scripted weave for the demo sweep (simulation only)
      if (st.demo && isSim()) {
        var t = (U.now() - st.demo.t0) / 1000, P = c.plane;
        if (t > 36) { st.demo = null; L.sim.setHand(null, false); if (st.sweeping) toggleSweep(); }
        else L.sim.setHand({ x: P.w * (0.5 + 0.46 * Math.sin(t * 0.9)), y: P.d * (0.5 + 0.44 * Math.sin(t * 0.55 + 1.1)), h: c.hand.zwork }, false);
      }
      drawTop(now); drawSide(now);
      if (now - st.lastUi > 250) {
        st.lastUi = now; refreshLive();
        if (st.sweeping) refreshAim();
        if (st.learning) refreshLearn();
        if (st.top.el.style.cursor === '') st.top.el.style.cursor = '';
      }
    }
  };
  RS.screens.aim = Aim;
})();
