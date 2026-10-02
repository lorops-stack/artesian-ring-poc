/* Ring Studio · Calibration studio (spec section 8, C0 to C14): a guided step list on the left, one panel per step on
   the right. Drives the device's calibration steps over the protocol (`cal` messages), computes nothing the device
   does not send except the C5 coverage prediction and the C11 accuracy run, and keeps the operator's progress in
   browser storage. Also exposes RS.accuracyRun (shared with the dashboard's full F16 mode) and RS.studioProgress. */
var RS = globalThis.RS || (globalThis.RS = {});
(function () {
  'use strict';
  var U = RS.util, h = U.h, L = RS.link, S = RS.store, G = RS.geo, FN = RS.FN, ST = RS.ST, rgba = U.rgba;
  RS.screens = RS.screens || {};
  var COL = { A: '#4FD1E8', B: '#FFB27A', C: '#B69CFF' };
  var WARM_MS = 10 * 60 * 1000;

  var STEPS = [
    { id: 'c0', n: 'C0', label: 'Warm-up and hardware check', hint: 'Buses, firmware, resets, wave, noise, LEDs' },
    { id: 'c1', n: 'C1', label: 'Plane', hint: 'Width and depth of the sink opening' },
    { id: 'c2', n: 'C2', label: 'Sensor placement', hint: 'x, y, height; identify A and B' },
    { id: 'c3', n: 'C3', label: 'Sensor angles', hint: 'Yaw, tilt, beam half-angle' },
    { id: 'c4', n: 'C4', label: 'Hand depth band', hint: 'Expected depth below the ring' },
    { id: 'c5', n: 'C5', label: 'Coverage', hint: 'Predicted zone accuracy' },
    { id: 'c6', n: 'C6', label: 'Background capture', hint: 'Empty-sink echoes' },
    { id: 'c7', n: 'C7', label: 'Wand geometry', hint: '16 holes, two depths, 32 readings' },
    { id: 'c8', n: 'C8', label: 'Hand profile', hint: 'Depth, strength window, stillness' },
    { id: 'c9', n: 'C9', label: 'Zone editor', hint: 'Layouts and their functions' },
    { id: 'c10', n: 'C10', label: 'Tuning', hint: 'Live settings' },
    { id: 'c11', n: 'C11', label: 'Validation', hint: 'Quick on-site check, 5 per zone' },
    { id: 'c12', n: 'C12', label: 'Health and drift', hint: 'Live monitor' },
    { id: 'c13', n: 'C13', label: 'Save, load, compare', hint: 'Named calibrations' },
    { id: 'c14', n: 'C14', label: 'Diagnostics', hint: 'Symptom finder, techniques, export' }
  ];
  function stepById(id) { for (var i = 0; i < STEPS.length; i++) if (STEPS[i].id === id) return STEPS[i]; return STEPS[0]; }
  var progress = RS.studioProgress = U.store.get('studio.progress', {}) || {};
  function setProgress(id, state) {
    if (progress[id] === state || (!state && !progress[id])) return;
    if (state) progress[id] = state; else delete progress[id];
    U.store.set('studio.progress', progress);
    if (STU.host) STU.refreshSteps();
  }

  // ---- small helpers -----------------------------------------------------------------------------------------------------------
  // Commands: link-level failures (no reply, not connected) are toasted here; device `err` replies are toasted by the app shell.
  function send(cmd) { return L.send(cmd).catch(function (e) { var m = (e && e.message) || 'command failed'; if (/^no reply|^not connected/.test(m)) RS.app.toast(m, 'bad'); return null; }); }
  function setCfg(obj) { return send({ c: 'cfg', set: obj }); }
  function simHand(pt) { if (L.mode === 'sim' && L.sim) L.sim.setHand(pt, false); }
  function btn(label, onclick, cls, attrs) { return h('button.btn' + (cls ? '.' + cls.trim().replace(/\s+/g, '.') : ''), Object.assign({ onclick: onclick }, attrs || {}), label); }
  function chip(text, kind) { return h('span.chip' + (kind ? '.' + kind : ''), text); }
  function fixChip(code, onTest) { var fx = RS.fixInfo ? RS.fixInfo(code) : null; return h('span.fixcode', { title: fx ? fx.title : code, onclick: function () { RS.showFix(code, onTest); } }, code); }
  function callout(kind, title, text) {
    var extra = Array.prototype.slice.call(arguments, 3);
    return h('div.callout' + (kind ? '.' + kind : ''), title ? h('strong', title) : null, text ? h('div.sub' + (title ? '.mt-s' : ''), text) : null, extra);
  }
  function tile(label, value, unit) {
    var vs = h('span', value == null ? '–' : String(value)), us = h('small', unit || ''), t = h('div.tile', h('div.v.num', vs, us), h('div.l', label));
    t.setValue = function (v, u) { vs.textContent = v == null ? '–' : String(v); if (u != null) us.textContent = u; };
    return t;
  }
  function field(label, input, unit) { if (unit) input.classList.add('u'); return h('div.field', label ? h('label', label) : null, h('div.in', input, unit ? h('span.unit', unit) : null)); }
  function numInput(v, opts) { var a = Object.assign({ type: 'number' }, opts || {}); a.value = v == null ? '' : String(v); return h('input.num', a); }
  function num(el, d) { var v = parseFloat(el.value); return isFinite(v) ? v : d; }
  function fmtIn(mm, unit) { return unit === 'in' ? U.round(mm / U.IN, 2) : Math.round(mm); }
  function lenStep(unit) { return unit === 'in' ? 0.05 : 1; }
  function fmtLen(mm, digits) { return U.fmtLen(mm, S.get('lenUnit'), digits); }
  function fmtTempC(c) { return S.get('unit') === 'C' ? c.toFixed(1) + ' °C' : (c * 9 / 5 + 32).toFixed(1) + ' °F'; }
  // A length input bound to draft[key] (always mm), shown in the user's unit.
  function lenField(label, draft, key, onChange, opts) {
    var unit = S.get('lenUnit'), inp = numInput(fmtIn(draft[key], unit), Object.assign({ step: lenStep(unit) }, opts || {}));
    inp.addEventListener('input', function () { var v = parseFloat(inp.value); if (isFinite(v)) { draft[key] = U.unitToMm(v, unit); if (onChange) onChange(); } });
    var f = field(label, inp, unit); f.input = inp; f.refresh = function () { inp.value = fmtIn(draft[key], unit); }; return f;
  }
  function unitSeg() { var seg = h('div.seg'); ['in', 'mm'].forEach(function (u) { seg.appendChild(h('button' + (S.get('lenUnit') === u ? '.on' : ''), { onclick: function () { S.set('lenUnit', u); } }, u)); }); return seg; }
  function pulse(el) { if (!el) return; el.style.transition = 'box-shadow .25s ease'; el.style.boxShadow = '0 0 0 3px var(--ok)'; setTimeout(function () { el.style.boxShadow = ''; }, 320); }
  function flatten(obj, prefix, out) {
    out = out || {};
    Object.keys(obj || {}).forEach(function (k) { var v = obj[k], p = prefix ? prefix + '.' + k : k; if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, p, out); else out[p] = v; });
    return out;
  }
  function posWords(z, zones) {
    var rows = 0, cols = 0; zones.forEach(function (q) { if (q.row + 1 > rows) rows = q.row + 1; if (q.row === z.row && q.col + 1 > cols) cols = q.col + 1; });
    var rw = rows <= 1 ? '' : z.row === 0 ? 'back' : z.row === rows - 1 ? 'front' : 'middle';
    var cw = cols <= 1 ? '' : z.col === 0 ? 'left' : z.col === cols - 1 ? 'right' : 'centre';
    return (rw + ' ' + cw).trim();
  }
  function zoneLabel(z, zones) { var f = FN[z.fn]; return (f ? f.label : z.fn) + (zones ? ' · ' + posWords(z, zones) : ''); }

  // ---- plan-mini canvas ---------------------------------------------------------------------------------------------------------------
  function PlanMini(opts) {
    opts = opts || {};
    this.el = h('div.plan-mini', { style: { height: (opts.height || 240) + 'px', width: '100%' } });
    this.cv = h('canvas', { 'aria-label': opts.label || 'Plan view of the sink' }); this.cv.style.touchAction = 'none'; this.el.appendChild(this.cv);
    this.pad = opts.pad == null ? 24 : opts.pad; this.maxH = opts.maxH || 380; this.drawFn = opts.draw; this.dirty = true; this.lastW = 0; this.g = null;
  }
  PlanMini.prototype.geom = function (plane) {
    var W = this.el.clientWidth || 480, ar = Math.max(0.2, plane.w / Math.max(1, plane.d)), pad = this.pad, bw = W - 2 * pad, bh = bw / ar, H = bh + 2 * pad;
    if (H > this.maxH) { H = this.maxH; bh = H - 2 * pad; bw = bh * ar; }
    return { W: W, H: Math.round(H), bx: (W - bw) / 2, by: pad, bw: bw, bh: bh, mm: bw / plane.w };
  };
  PlanMini.prototype.draw = function (plane) {
    var g = this.geom(plane), dpr = Math.min(2, (typeof devicePixelRatio !== 'undefined' && devicePixelRatio) || 1);
    if (this.el.style.height !== g.H + 'px') this.el.style.height = g.H + 'px';
    if (this.cv.width !== Math.round(g.W * dpr) || this.cv.height !== Math.round(g.H * dpr)) { this.cv.width = Math.round(g.W * dpr); this.cv.height = Math.round(g.H * dpr); }
    var ctx = this.cv.getContext('2d'); if (!ctx) return g;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, g.W, g.H);
    this.g = g; this.lastW = g.W; this.dirty = false;
    if (this.drawFn) { try { this.drawFn(ctx, g); } catch (e) { console.error('[studio] draw failed', e); } }
    return g;
  };
  PlanMini.prototype.tick = function (plane) { if (this.dirty || this.el.clientWidth !== this.lastW) this.draw(plane); };
  PlanMini.prototype.toMm = function (e, plane) {
    var r = this.cv.getBoundingClientRect(), g = this.g || this.geom(plane), x = (e.clientX - r.left - g.bx) / g.mm, y = (e.clientY - r.top - g.by) / g.mm;
    return { x: x, y: y, inside: x >= 0 && x <= plane.w && y >= 0 && y <= plane.d };
  };

  function rrect(ctx, x, y, w, hh, r) { r = Math.max(0, Math.min(r, w / 2, hh / 2)); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + hh, r); ctx.arcTo(x + w, y + hh, x, y + hh, r); ctx.arcTo(x, y + hh, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function drawBasin(ctx, g) { ctx.fillStyle = '#0B0E12'; rrect(ctx, g.bx, g.by, g.bw, g.bh, 10); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 1; ctx.stroke(); }
  function drawZones(ctx, g, zones, opts) {
    opts = opts || {}; var fa = opts.fillAlpha == null ? 0.08 : opts.fillAlpha;
    ctx.font = '500 11px Geist, system-ui'; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    for (var i = 0; i < zones.length; i++) {
      var z = zones[i], f = FN[z.fn], c = f ? f.color : '#AEB7C2', x = g.bx + z.x0 * g.bw, y = g.by + z.y0 * g.bh, w = (z.x1 - z.x0) * g.bw, hh = (z.y1 - z.y0) * g.bh, hi = opts.highlight === z.id;
      if (fa > 0 || hi) { ctx.fillStyle = hi ? rgba(c, 0.3) : rgba(c, fa); ctx.fillRect(x + 1, y + 1, Math.max(0, w - 2), Math.max(0, hh - 2)); }
      ctx.strokeStyle = hi ? rgba(c, 0.95) : (opts.outline || 'rgba(255,255,255,0.16)'); ctx.lineWidth = hi ? 1.5 : 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, hh - 1);
      if (opts.labels !== false && w > 46 && hh > 26) { ctx.fillStyle = hi ? '#fff' : 'rgba(255,255,255,0.5)'; ctx.fillText(f ? f.label : z.fn, x + 7, y + hh - 7); }
    }
  }
  function drawCone(ctx, g, s, col, half) {
    var cx = g.bx + s.x * g.mm, cy = g.by + s.y * g.mm, R = U.hypot(g.bw, g.bh) * 1.1, a0 = U.rad(s.yaw - half), a1 = U.rad(s.yaw + half);
    ctx.save(); rrect(ctx, g.bx - 2, g.by - 2, g.bw + 4, g.bh + 4, 10); ctx.clip();
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0, a1); ctx.closePath(); ctx.fillStyle = rgba(col, 0.07); ctx.fill();
    ctx.setLineDash([4, 5]); ctx.strokeStyle = rgba(col, 0.6); ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(U.rad(s.yaw)) * R, cy + Math.sin(U.rad(s.yaw)) * R); ctx.strokeStyle = rgba(col, 0.3); ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  }
  function drawSensorDot(ctx, g, key, s, col, opts) {
    opts = opts || {}; var x = g.bx + s.x * g.mm, y = g.by + s.y * g.mm, r = opts.r || 11;
    ctx.save(); if (opts.faded) ctx.globalAlpha = 0.4;
    if (opts.drag) { ctx.shadowColor = col; ctx.shadowBlur = 16; }
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7);
    if (!opts.hollow) { ctx.fillStyle = '#0C0F13'; ctx.fill(); }
    ctx.strokeStyle = col; ctx.lineWidth = opts.hollow ? 1.5 : 2; if (opts.hollow) ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]); ctx.shadowBlur = 0;
    if (!opts.hollow) { ctx.fillStyle = col; ctx.font = '700 10px Geist, system-ui'; ctx.textAlign = 'center'; ctx.fillText(key, x, y + 3.5); ctx.textAlign = 'left'; }
    ctx.restore();
  }
  function drawHand(ctx, g, plane, f, col) {
    if (!f || f.hx == null) return; var x = g.bx + f.hx / plane.w * g.bw, y = g.by + f.hy / plane.d * g.bh, c = col || RS.ACCENT;
    ctx.save(); ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.stroke(); ctx.fillStyle = rgba(c, 0.4); ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill(); ctx.restore();
  }
  function drawHoles(ctx, g, holes, states) {
    holes.forEach(function (H, i) {
      var x = g.bx + H.xf * g.bw, y = g.by + H.yf * g.bh, s = states ? states[i] : 'todo', c = s === 'now' ? '#fff' : s === 'done' ? '#7FE0C4' : s === 'bad' ? '#FF6B6B' : 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.arc(x, y, s === 'now' ? 8 : 6, 0, 7); ctx.fillStyle = s === 'now' ? rgba(RS.ACCENT, 0.9) : 'rgba(0,0,0,0.4)'; ctx.fill(); ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = s === 'now' ? '#07090C' : c; ctx.font = '600 9px Geist, system-ui'; ctx.textAlign = 'center'; ctx.fillText(String(H.n), x, y + 3); ctx.textAlign = 'left';
    });
  }
  function planeLabel(ctx, g, plane, extra) {
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = '11px Geist, system-ui'; ctx.textAlign = 'center';
    ctx.fillText(fmtLen(plane.w, 1) + ' × ' + fmtLen(plane.d, 1) + ' · you stand at the bottom edge' + (extra ? ' · ' + extra : ''), g.bx + g.bw / 2, g.by + g.bh + 16); ctx.textAlign = 'left';
  }
  function hatch(ctx, x, y, w, hh) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, hh); ctx.clip(); ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
    for (var d = -hh; d < w; d += 5) { ctx.beginPath(); ctx.moveTo(x + d, y + hh); ctx.lineTo(x + d + hh, y); ctx.stroke(); }
    ctx.restore();
  }

  // ---- accuracy run (F16 / C11), shared with the dashboard --------------------------------------------------------------------------
  // opts: {trialsPerZone, timeoutMs, onUpdate(run), onDone(run)}. Prompts one zone at a time (run.target); a trial starts when a
  // hand appears (first frame with hx) and ends on the first latch / soap / disposal-start event, or after timeoutMs with no
  // latch. Between trials the hand must leave and the session must end (frame with no hx in IDLE). Neutral zones are skipped.
  RS.accuracyRun = function (opts) {
    opts = opts || {};
    var cfg = S.cfg(), layoutId = cfg.layout, zonesAll = G.zones(layoutId, cfg.layouts), zones = zonesAll.filter(function (z) { return z.fn !== 'neutral'; });
    var per = opts.trialsPerZone || 5, queue = [], i, j, t;
    zones.forEach(function (z) { for (var k = 0; k < per; k++) queue.push(z); });
    for (i = queue.length - 1; i > 0; i--) { j = Math.floor(Math.random() * (i + 1)); t = queue[i]; queue[i] = queue[j]; queue[j] = t; }
    var run = { layout: layoutId, layouts: U.deepClone(cfg.layouts || RS.LAYOUTS), zones: zones, allZones: zonesAll, total: queue.length, trials: [], target: null, phase: 'clear', done: false, entered: null, timer: null, when: new Date().toISOString() };
    var subs = [];
    function update() { if (opts.onUpdate) { try { opts.onUpdate(run); } catch (e) { console.error(e); } } }
    function stopSubs() { subs.forEach(function (u) { u(); }); subs = []; clearTimeout(run.timer); run.timer = null; }
    function finish() {
      stopSubs(); run.done = true; run.phase = 'done'; run.target = null;
      run.passed = run.trials.length > 0 && run.trials.every(function (x) { return x.ok; });
      run.perZone = {}; zones.forEach(function (z) { run.perZone[z.id] = { n: 0, ok: 0 }; });
      run.trials.forEach(function (x) { var p = run.perZone[x.zone]; if (p) { p.n += 1; if (x.ok) p.ok += 1; } });
      update(); if (opts.onDone) { try { opts.onDone(run); } catch (e) { console.error(e); } }
    }
    function next() { if (!queue.length) return finish(); run.target = queue.shift(); run.phase = 'prompt'; run.entered = null; update(); }
    function record(got, gotFn, ms, ok) {
      clearTimeout(run.timer); run.timer = null;
      run.trials.push({ zone: run.target.id, fn: run.target.fn, got: got, gotFn: gotFn, ms: ms, ok: ok, noLatch: gotFn == null });
      run.phase = 'between'; run.target = null; update();
    }
    subs.push(L.on('frame', function (f) {
      if (f.g || run.done) return;
      if (run.phase === 'clear' || run.phase === 'between') { if (f.hx == null && f.st === ST.IDLE) next(); return; }
      if (run.phase === 'prompt' && f.hx != null) {
        run.phase = 'in'; run.entered = U.now();
        run.timer = setTimeout(function () { if (run.phase === 'in' && !run.done) record(null, null, null, false); }, opts.timeoutMs || 8000);
        update();
      }
    }));
    subs.push(L.on('event', function (e) {
      if (e.g || run.done || run.phase !== 'in' || !run.target) return;
      var gotFn = e.ev === 'latch' ? e.fn : e.ev === 'soap' ? 'soap' : (e.ev === 'disp' && e.a === 'start') ? 'disposal' : null;
      if (!gotFn) return;
      var f = L.latest.frame, got = f && f.zn ? f.zn : null;
      if (!got) { var same = zones.filter(function (z) { return z.fn === gotFn; }); if (same.length === 1) got = same[0].id; }
      var ms = e.lat != null ? e.lat : Math.round(U.now() - run.entered);
      record(got, gotFn, ms, gotFn === run.target.fn && (!got || got === run.target.id));
    }));
    run.stop = function () { if (run.done) return; stopSubs(); run.done = true; run.phase = 'stopped'; run.target = null; update(); };
    update();
    return run;
  };
  // Turns a finished run's failures into fix codes (A1 to A4).
  RS.accuracyCodes = function (run) {
    var fails = (run.trials || []).filter(function (x) { return !x.ok; }); if (!fails.length) return [];
    var byId = {}, rowsN = {}; (run.allZones || run.zones || []).forEach(function (z) { byId[z.id] = z; rowsN[z.row] = Math.max(rowsN[z.row] || 0, z.col + 1); });
    var codes = [], mirrored = 0, shiftF = 0, shiftB = 0, backCorner = 0, perZone = {};
    fails.forEach(function (x) {
      var z = byId[x.zone], g = x.got ? byId[x.got] : null; perZone[x.zone] = (perZone[x.zone] || 0) + 1;
      if (z && g && g.row === z.row && g.col !== z.col && g.col === rowsN[z.row] - 1 - z.col) mirrored += 1;
      if (z && g && g.col === z.col && g.row === z.row + 1) shiftF += 1;
      if (z && g && g.col === z.col && g.row === z.row - 1) shiftB += 1;
      if (z && z.row === 0 && (z.col === 0 || z.col === rowsN[0] - 1)) backCorner += 1;
    });
    if (mirrored >= 2 && mirrored * 2 >= fails.length) codes.push('A3');
    if ((shiftF >= 2 && !shiftB) || (shiftB >= 2 && !shiftF)) codes.push('A4');
    var zoneIds = Object.keys(perZone);
    if (zoneIds.length === 1 && fails.length >= 2) codes.push('A2');
    if (backCorner >= 2 && backCorner * 2 >= fails.length && codes.indexOf('A3') < 0 && codes.indexOf('A2') < 0) codes.push('A1');
    if (!codes.length && zoneIds.length === 1) codes.push('A2');
    return codes;
  };

  var P = {};   // step id → panel factory(stu) → {tick, onCal, onCfg, onFrame, onEvent, onHealth, onCals, onStatus, destroy}

  // ---- C0 · warm-up and hardware check ------------------------------------------------------------------------------------------------
  var PERMS = [['RGB', 'Red, green, blue'], ['GRB', 'Green, red, blue'], ['RBG', 'Red, blue, green'], ['BGR', 'Blue, green, red'], ['GBR', 'Green, blue, red'], ['BRG', 'Blue, red, green']];
  P.c0 = function (stu) {
    var st = stu.st.c0 || (stu.st.c0 = {}); st.led = st.led || {};
    var warmTile = tile('Warm-up after power-on', '–', ''), warmChip = h('span.chip.warn', 'Waiting for the device');
    var runBtn = btn('Run hardware check', start, 'primary'), checksBox = h('div.col.gap-s.mt'), promptBox = h('div'), fixBox = h('div.col.gap-s'), ledBox = h('div');
    stu.body.appendChild(h('div.card', h('div.row.between.wrap.top', h('div.grow', h('h2', 'Warm-up'), h('div.sub', 'The radar sensors drift for the first minutes after power-on. Wait ten minutes before the background capture (C6) and the wand step (C7). The hardware check can run straight away.')), warmChip), h('div.grid.c3.mt', warmTile)));
    stu.body.appendChild(h('div.card', h('div.row.between.wrap.top', h('div.grow', h('h2', 'Hardware check'), h('div.sub', 'Each sensor on its bus (W1), the sensor firmware (F1), status flags (F2), the reset lines (W4), a wave test (S1), still-target noise (S4), then the LED ring (L1, L3, L5).')), runBtn), checksBox, promptBox, fixBox, ledBox));

    function start() { st.led = {}; st.ledTest = null; st.cal = { step: 'c0', state: 'running', checks: [], n: 7 }; render(); send({ c: 'cal', step: 'c0', a: 'start' }); }
    function checkRow(c) {
      var k = c.ok === true ? 'ok' : c.ok === false ? 'bad' : 'run';
      return h('div.check.' + k, h('span.ic', c.ok === true ? '✓' : c.ok === false ? '!' : '?'), h('div.grow', h('div', c.label), c.detail ? h('div.small.dim', c.detail) : null), c.ok === false && c.code ? fixChip(c.code, start) : null);
    }
    function ledOk() { var l = st.led; return l.white === 'ok' && (l.rgb === 'RGB' || l.rgb === 'fixed') && l.countOk === true; }
    function ledDone() { var l = st.led; return l.white != null && l.rgb != null && l.countOk != null; }
    function render() {
      var cal = st.cal; U.empty(checksBox); U.empty(promptBox); U.empty(fixBox); U.empty(ledBox);
      var busy = !!(cal && (cal.state === 'running' || cal.state === 'waiting'));
      runBtn.textContent = busy ? 'Running…' : (cal ? 'Run again' : 'Run hardware check'); runBtn.disabled = busy;
      if (!cal) { checksBox.appendChild(h('div.small.dim', 'Not run yet in this session.')); return; }
      var checks = cal.checks || [], n = cal.n || 7;
      checks.forEach(function (c) { if (c.id !== 'led') checksBox.appendChild(checkRow(c)); });
      if (cal.state === 'running' && checks.length < n) checksBox.appendChild(h('div.check.run', h('span.ic', '…'), h('div.grow', h('div', 'Checking…'), h('div.small.dim', 'Check ' + (checks.length + 1) + ' of ' + n))));
      if (cal.state === 'waiting' && cal.prompt) promptBox.appendChild(h('div.mt', callout('info', cal.prompt, 'Click when you have done it.', h('div.row.end.mt-s', btn('Done, continue', function () { send({ c: 'cal', step: 'c0', a: 'next' }); }, 'primary')))));
      checks.forEach(function (c) { if (c.ok === false && c.code) fixBox.appendChild(h('div.mt', RS.fixPanel(c.code, { onTest: start, detail: c.detail }))); });
      if (checks.some(function (c) { return c.id === 'led'; })) renderLed();
      if (cal.state === 'done' || cal.state === 'failed') {
        var hwOk = checks.every(function (c) { return c.ok !== false; });
        if (!hwOk) setProgress('c0', 'fail'); else if (ledDone()) setProgress('c0', ledOk() ? 'done' : 'fail');
      }
    }
    function ledCmd(test) { st.ledTest = test; send({ c: 'led', test: test, n: S.cfg().tuning.ledCount }); render(); }
    function ledOff() { st.ledTest = null; send({ c: 'led', test: 'off' }); }
    function answerColour(seen) {
      var l = st.led; l.seen = seen; ledOff();
      if (seen === 'RGB') { l.rgb = 'RGB'; render(); return; }
      // The strip lit colour seen[i] when the firmware sent channel 'RGB'[i]. With configured byte order O, byte k carries channel
      // O[k], so the strip's real order is P[k] = seen(O[k]).
      var order = S.cfg().tuning.ledOrder || 'GRB', map = { R: seen[0], G: seen[1], B: seen[2] };
      var derived = order.split('').map(function (ch) { return map[ch] || ch; }).join('');
      l.rgb = 'fixed'; l.setTo = derived;
      setCfg({ 'tuning.ledOrder': derived }).then(function (ack) { if (ack) RS.app.toast('LED colour order set to ' + derived, 'ok'); });
      render();
    }
    function renderLed() {
      var cfg = S.cfg(), l = st.led, on = function (t) { return 'sm' + (st.ledTest === t ? ' on' : ''); }, sel = function (v, cur) { return 'sm' + (v === cur ? ' on' : ''); };
      ledBox.appendChild(h('div.eyebrow.mt-l', 'LED ring · three quick questions'));
      var w = h('div.card.tight.mt-s'); ledBox.appendChild(w);
      w.appendChild(h('div.row.between.wrap', h('div', h('h3', '1 · White test'), h('div.small.dim', 'Lights the whole ring white at low brightness for a moment.')), btn('White test', function () { ledCmd('white'); }, on('white'))));
      w.appendChild(h('div.row.wrap.mt-s', h('span.sub', 'What do you see?'), btn('All lit', function () { l.white = 'ok'; ledOff(); render(); }, sel('ok', l.white)), btn('Some lit', function () { l.white = 'some'; ledOff(); render(); }, sel('some', l.white)), btn('Dark', function () { l.white = 'dark'; ledOff(); render(); }, sel('dark', l.white))));
      if (l.white === 'ok') w.appendChild(h('div.mt-s', chip('Every LED lit', 'ok')));
      if (l.white === 'dark') w.appendChild(h('div.mt-s', RS.fixPanel('L1', { onTest: function () { l.white = null; ledCmd('white'); } })));
      if (l.white === 'some') w.appendChild(h('div.mt-s', RS.fixPanel('L5', { onTest: function () { l.white = null; ledCmd('white'); } })));
      var c = h('div.card.tight.mt-s'); ledBox.appendChild(c);
      c.appendChild(h('div.row.between.wrap', h('div', h('h3', '2 · Colour test'), h('div.small.dim', 'Shows red, then green, then blue. Configured colour order: ' + (cfg.tuning.ledOrder || 'GRB') + '.')), btn('Colour test', function () { ledCmd('rgb'); }, on('rgb'))));
      var pr = h('div.row.wrap.mt-s', h('span.sub', 'Which order did you see?')); PERMS.forEach(function (p) { pr.appendChild(btn(p[1], function () { answerColour(p[0]); }, sel(p[0], l.seen))); }); c.appendChild(pr);
      if (l.rgb === 'RGB') c.appendChild(h('div.mt-s', chip('Colour order correct', 'ok')));
      if (l.rgb === 'fixed') c.appendChild(h('div.mt-s', callout('ok', 'Colour order set to ' + l.setTo, 'Run the colour test again and confirm you now see red, green, blue.', h('div.row.mt-s', fixChip('L3')))));
      var k = h('div.card.tight.mt-s'); ledBox.appendChild(k);
      var cntIn = numInput(l.count == null ? '' : l.count, { min: 1, max: 300, step: 1 });
      k.appendChild(h('div.row.between.wrap', h('div', h('h3', '3 · Count test'), h('div.small.dim', 'Lights the LEDs one at a time up to the configured count of ' + cfg.tuning.ledCount + '.')), btn('Count test', function () { ledCmd('count'); }, on('count'))));
      k.appendChild(h('div.row.wrap.mt-s', h('div', { style: { width: '180px' } }, field('How many LEDs lit?', cntIn)), btn('Check', function () { var n = num(cntIn, NaN); if (!isFinite(n) || n < 1) return RS.app.toast('Enter the number you counted', 'warn'); l.count = Math.round(n); l.countOk = l.count === cfg.tuning.ledCount; ledOff(); render(); }, 'sm')));
      if (l.countOk === true) k.appendChild(h('div.mt-s', chip('Count matches: ' + l.count + ' LEDs', 'ok')));
      if (l.countOk === false) k.appendChild(h('div.mt-s', callout('warn', l.count + ' lit, ' + cfg.tuning.ledCount + ' configured', 'If every LED on the strip lit, set the count to what you saw. If the strip stopped part way, see L5.',
        h('div.row.wrap.mt-s', btn('Set LED count to ' + l.count, function () { setCfg({ 'tuning.ledCount': l.count }).then(function (ack) { if (ack) { l.countOk = true; RS.app.toast('LED count set to ' + l.count, 'ok'); render(); } }); }, 'sm primary'), fixChip('L5')))));
    }
    var lastWarm = 0;
    function tick(now) {
      if (now - lastWarm < 500) return; lastWarm = now;
      var stt = S.status();
      if (!stt || stt.up == null) { warmTile.setValue('–', ''); warmChip.className = 'chip warn'; warmChip.textContent = 'Waiting for the device'; return; }
      var up = stt.up + (U.now() - (stu.statusAt || U.now())), left = WARM_MS - up;
      if (left <= 0) { warmTile.setValue('Ready', ''); warmChip.className = 'chip ok'; warmChip.textContent = 'Warmed up · ' + U.fmtDur(up) + ' since power-on'; }
      else { var s = Math.ceil(left / 1000); warmTile.setValue(Math.floor(s / 60) + ':' + U.pad2(s % 60), 'remaining'); warmChip.className = 'chip warn'; warmChip.textContent = 'Warming up · ' + U.fmtDur(up) + ' since power-on'; }
    }
    render();
    return { tick: tick, onCal: function (cal) { if (!cal.step || cal.step === 'c0') render(); }, onCfg: function () { if (ledBox.firstChild) render(); } };
  };

  // ---- C1 · plane ------------------------------------------------------------------------------------------------------------------------
  P.c1 = function (stu) {
    var cfg = S.cfg(), st = stu.st.c1 || (stu.st.c1 = {});
    if (!st.draft) st.draft = { w: cfg.plane.w, d: cfg.plane.d };
    var d = st.draft;
    var pm = new PlanMini({ maxH: 300, draw: function (ctx, g) {
      var plane = { w: d.w, d: d.d }; drawBasin(ctx, g); drawZones(ctx, g, S.zones());
      drawSensorDot(ctx, g, 'A', cfg.sensors.A, COL.A); drawSensorDot(ctx, g, 'B', cfg.sensors.B, COL.B); planeLabel(ctx, g, plane);
    } });
    var fW = lenField('Width (x, left to right)', d, 'w', changed), fD = lenField('Depth (y, back to front)', d, 'd', changed), preset = h('div.seg');
    function isPoc() { return Math.abs(d.w - 584.2) < 0.6 && Math.abs(d.d - 533.4) < 0.6; }
    function refreshPreset() {
      U.empty(preset);
      preset.appendChild(h('button' + (isPoc() ? '.on' : ''), { onclick: function () { d.w = 584.2; d.d = 533.4; fW.refresh(); fD.refresh(); changed(); } }, '23 × 21 in (PoC rig)'));
      preset.appendChild(h('button' + (!isPoc() ? '.on' : ''), { onclick: function () { fW.input.focus(); fW.input.select(); } }, 'Custom'));
    }
    function changed() { st.dirty = true; pm.dirty = true; refreshPreset(); }
    var apply = btn('Apply', function () {
      if (!(d.w >= 100 && d.d >= 100)) return RS.app.toast('Width and depth must be at least 100 mm', 'warn');
      setCfg({ 'plane.w': U.round(d.w, 1), 'plane.d': U.round(d.d, 1), 'plane.unit': S.get('lenUnit') }).then(function (ack) { if (ack) { st.dirty = false; setProgress('c1', 'done'); RS.app.toast('Sensing plane set', 'ok'); } });
    }, 'primary');
    stu.body.appendChild(h('div.card', h('div.row.between.wrap.top', h('div.grow', h('h2', 'Sensing plane'), h('div.sub', 'The sink opening, measured at the ring. The origin is the back-left corner; x runs to the right and y toward you. Nothing about the geometry is hard-coded: every dimension comes from here.')), unitSeg()),
      h('div.row.wrap.mt', preset), h('div.grid.c2.mt', fW, fD), h('div.row.end.mt', apply)));
    stu.body.appendChild(h('div.card', h('div.eyebrow', 'Preview · ' + S.layoutName() + ' layout'), h('div.mt', pm.el)));
    refreshPreset();
    return { tick: function () { pm.tick({ w: d.w, d: d.d }); }, onCfg: function () { cfg = S.cfg(); if (!st.dirty) { d.w = cfg.plane.w; d.d = cfg.plane.d; fW.refresh(); fD.refresh(); refreshPreset(); } pm.dirty = true; } };
  };

  // ---- C2 · sensor placement and identify -------------------------------------------------------------------------------------------------
  P.c2 = function (stu) {
    var cfg = S.cfg(), st = stu.st.c2 || (stu.st.c2 = {}), idn = stu.st.identify || (stu.st.identify = {});
    var pick = function (s) { return { x: s.x, y: s.y, z: s.z }; };
    if (!st.draft) st.draft = { A: pick(cfg.sensors.A), B: pick(cfg.sensors.B) };
    var d = st.draft, fields = {}, drag = null, spacingBox = h('div.mt'), idBox = h('div');
    var pm = new PlanMini({ maxH: 340, draw: draw });
    function identifying() { return !!(idn.cal && idn.cal.state === 'waiting'); }
    function draw(ctx, g) {
      var plane = cfg.plane; drawBasin(ctx, g); drawZones(ctx, g, S.zones(), { labels: false, fillAlpha: 0.04 });
      var ax = g.bx + d.A.x * g.mm, ay = g.by + d.A.y * g.mm, bx = g.bx + d.B.x * g.mm, by = g.by + d.B.y * g.mm;
      ctx.save(); ctx.setLineDash([3, 5]); ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '11px Geist, system-ui'; ctx.textAlign = 'center'; ctx.fillText(fmtLen(U.hypot(d.B.x - d.A.x, d.B.y - d.A.y), 1), (ax + bx) / 2, Math.min(ay, by) - 8); ctx.textAlign = 'left';
      if (identifying()) drawHand(ctx, g, plane, S.frame());
      if (cfg.sensors.C) drawSensorDot(ctx, g, 'C', cfg.sensors.C, COL.C, { faded: true });
      drawSensorDot(ctx, g, 'A', d.A, COL.A, { drag: drag === 'A' }); drawSensorDot(ctx, g, 'B', d.B, COL.B, { drag: drag === 'B' });
      planeLabel(ctx, g, plane, identifying() && L.mode === 'sim' ? 'move the cursor near A' : 'drag A or B');
    }
    function nearest(p) { var best = null, bd = 1e9; ['A', 'B'].forEach(function (k) { var dd = U.hypot(p.x - d[k].x, p.y - d[k].y); if (dd < bd) { bd = dd; best = k; } }); return bd * (pm.g ? pm.g.mm : 1) < 18 ? best : null; }
    pm.cv.addEventListener('pointerdown', function (e) { var k = nearest(pm.toMm(e, cfg.plane)); if (k) { drag = k; try { pm.cv.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } pm.dirty = true; } });
    pm.cv.addEventListener('pointermove', function (e) {
      var p = pm.toMm(e, cfg.plane);
      if (drag) { d[drag].x = U.round(U.clamp(p.x, -60, cfg.plane.w + 60), 1); d[drag].y = U.round(U.clamp(p.y, -60, cfg.plane.d + 60), 1); fields[drag].x.refresh(); fields[drag].y.refresh(); changed(); }
      else if (identifying()) { simHand(p.inside ? { x: p.x, y: p.y, h: cfg.hand.zwork } : null); pm.dirty = true; }
    });
    pm.cv.addEventListener('pointerup', function () { drag = null; pm.dirty = true; });
    pm.cv.addEventListener('pointerleave', function () { if (!drag) simHand(null); });
    function changed() { st.dirty = true; pm.dirty = true; refreshSpacing(); }
    function sensorRow(k, col, src, disabled) {
      var fx = lenField('x', src, 'x', changed), fy = lenField('y', src, 'y', changed), fz = lenField('Height z above the ring', src, 'z', changed);
      if (disabled) [fx, fy, fz].forEach(function (f) { f.input.disabled = true; });
      fields[k] = { x: fx, y: fy, z: fz };
      return h('div.card.tight', { style: { opacity: disabled ? 0.55 : 1 } }, h('div.row.between.wrap', h('div.row.gap-s', h('span', { style: { width: '10px', height: '10px', borderRadius: '5px', background: col, display: 'inline-block' } }), h('h3', { style: { margin: 0 } }, 'Sensor ' + k + (k === 'A' ? ' · back-left' : k === 'B' ? ' · back-right' : ''))), disabled ? chip('Reserved for the future third sensor') : null), h('div.grid.c3.mt-s', fx, fy, fz));
    }
    function refreshSpacing() {
      U.empty(spacingBox); var sp = U.hypot(d.B.x - d.A.x, d.B.y - d.A.y), diff = sp - cfg.plane.w;
      spacingBox.appendChild(h('div.grid.c2', tile('Sensor spacing, A to B', fmtLen(sp, 1), ''), tile('Sink width from C1', fmtLen(cfg.plane.w, 1), '')));
      if (Math.abs(diff) > 25) spacingBox.appendChild(h('div.mt-s', callout('warn', 'Spacing differs from the sink width by ' + fmtLen(Math.abs(diff), 1), 'Check that the width in C1 and both positions here were entered in the same units, then re-measure if needed.', h('div.row.mt-s', fixChip('P8')))));
    }
    function swapAB() {
      var s = cfg.sensors, set = {}; ['x', 'y', 'z', 'yaw', 'tilt'].forEach(function (k) { set['sensors.A.' + k] = s.B[k]; set['sensors.B.' + k] = s.A[k]; });
      setCfg(set).then(function (ack) { if (ack) { st.dirty = false; idn.cal = null; RS.app.toast('A and B swapped', 'ok'); renderIdentify(); setProgress('c2', null); } });
    }
    function renderIdentify() {
      U.empty(idBox); var cal = idn.cal, waiting = identifying();
      idBox.appendChild(h('div.row.between.wrap.top', h('div.grow', h('h2', 'Identify A and B'), h('div.sub', 'Confirms that the sensor wired as A is the one at the back-left. Hold a hand about 20 cm in front of the back-left module; the studio watches which sensor reacts.')),
        h('div.row', waiting ? btn('Cancel', function () { send({ c: 'cal', step: 'identify', a: 'stop' }); simHand(null); }, 'sm ghost') : null, btn(waiting ? 'Waiting…' : 'Identify', function () { send({ c: 'cal', step: 'identify', a: 'start' }); }, 'primary', waiting ? { disabled: true } : null))));
      if (waiting) idBox.appendChild(h('div.mt', callout('info', cal.prompt || 'Hold your hand 20 cm in front of the back-left sensor', L.mode === 'sim' ? 'Simulation: move your cursor over the plan below, close to the A corner.' : 'Keep your other hand away from the sink.')));
      if (cal && cal.state === 'done' && cal.result) {
        var r = cal.result;
        if (r.swapped) idBox.appendChild(h('div.mt', callout('bad', 'Sensor B reacted, not A', 'The boards are wired or mounted the other way round, so left and right would be mirrored. Swap them in the studio, or fix the wiring and test again.', h('div.row.wrap.mt-s', btn('Swap A and B', swapAB, 'primary'), fixChip('W3')))));
        else if (r.ok) idBox.appendChild(h('div.mt', callout('ok', 'Sensor A reacted first', 'A and B are the right way round.')));
        else idBox.appendChild(h('div.mt', callout('warn', 'Could not tell', 'Both sensors reacted, or neither did. Try again with the hand close to the back-left module only.')));
      }
    }
    var apply = btn('Apply positions', function () {
      var set = {}; ['A', 'B'].forEach(function (k) { ['x', 'y', 'z'].forEach(function (p) { set['sensors.' + k + '.' + p] = U.round(d[k][p], 1); }); });
      setCfg(set).then(function (ack) { if (ack) { st.dirty = false; setProgress('c2', 'done'); RS.app.toast('Sensor positions set', 'ok'); } });
    }, 'primary');
    stu.body.appendChild(h('div.card', h('div.row.between.wrap.top', h('div.grow', h('h2', 'Sensor placement'), h('div.sub', 'Where each radar module sits, in plane coordinates. Type the tape-measure values or drag the dots on the plan.')), unitSeg()),
      h('div.mt', callout('info', 'Measure to the centre of the blue module', 'x from the left edge of the opening, y from the back edge (0 when the module sits on the back edge), z the height of the module centre above the ring surface (0 when level with it, negative below).')),
      h('div.col.gap-s.mt', sensorRow('A', COL.A, d.A, false), sensorRow('B', COL.B, d.B, false), sensorRow('C', COL.C, U.deepClone(cfg.sensors.C || RS.DEFAULTS.sensors.C), true)),
      spacingBox, h('div.row.end.mt', apply)));
    stu.body.appendChild(h('div.card', h('div.eyebrow', 'Plan · drag a sensor to move it'), h('div.mt', pm.el)));
    stu.body.appendChild(h('div.card', idBox));
    refreshSpacing(); renderIdentify();
    return {
      tick: function () { pm.tick(cfg.plane); },
      onFrame: function () { if (identifying()) pm.dirty = true; },
      onCfg: function () { cfg = S.cfg(); if (!st.dirty) { d.A = pick(cfg.sensors.A); d.B = pick(cfg.sensors.B); ['A', 'B'].forEach(function (k) { ['x', 'y', 'z'].forEach(function (p) { fields[k][p].refresh(); }); }); } refreshSpacing(); pm.dirty = true; },
      onCal: function (cal) { if (cal.step && cal.step !== 'identify') return; if (cal.state === 'done') { simHand(null); if (cal.result && cal.result.swapped) setProgress('c2', 'fail'); } renderIdentify(); pm.dirty = true; },
      destroy: function () { simHand(null); }
    };
  };

  // ---- C3 · sensor angles ---------------------------------------------------------------------------------------------------------------
  P.c3 = function (stu) {
    var cfg = S.cfg(), st = stu.st.c3 || (stu.st.c3 = {});
    var take = function () { return { A: { yaw: cfg.sensors.A.yaw, tilt: cfg.sensors.A.tilt }, B: { yaw: cfg.sensors.B.yaw, tilt: cfg.sensors.B.tilt }, beamHalf: cfg.tuning.beamHalf || 60 }; };
    if (!st.draft) st.draft = take();
    var d = st.draft, fields = [];
    var pm = new PlanMini({ maxH: 340, draw: function (ctx, g) {
      drawBasin(ctx, g); drawZones(ctx, g, S.zones(), { labels: false, fillAlpha: 0.04 });
      ['A', 'B'].forEach(function (k) { drawCone(ctx, g, { x: cfg.sensors[k].x, y: cfg.sensors[k].y, yaw: d[k].yaw }, COL[k], d.beamHalf); });
      ['A', 'B'].forEach(function (k) { drawSensorDot(ctx, g, k, cfg.sensors[k], COL[k]); });
      planeLabel(ctx, g, cfg.plane, 'beam cones at ±' + Math.round(d.beamHalf) + '°');
    } });
    function angleField(label, obj, key, min, max) {
      var n = numInput(obj[key], { min: min, max: max, step: 1 }), r = h('input', { type: 'range', min: min, max: max, step: 1, value: obj[key] });
      var sync = function (v) { v = U.clamp(v, min, max); obj[key] = v; n.value = v; r.value = v; st.dirty = true; pm.dirty = true; };
      n.addEventListener('input', function () { var v = parseFloat(n.value); if (isFinite(v)) sync(v); });
      r.addEventListener('input', function () { sync(parseFloat(r.value)); });
      var f = field(label, n, '°'); f.appendChild(r); f.refresh = function () { n.value = obj[key]; r.value = obj[key]; }; fields.push(f); return f;
    }
    function sensorCard(k) { return h('div.card.tight', h('div.row.gap-s', h('span', { style: { width: '10px', height: '10px', borderRadius: '5px', background: COL[k], display: 'inline-block' } }), h('h3', { style: { margin: 0 } }, 'Sensor ' + k)), h('div.grid.c2.mt-s', angleField('Yaw (aim in the plane)', d[k], 'yaw', 0, 360), angleField('Tilt (down into the basin)', d[k], 'tilt', -60, 20))); }
    var apply = btn('Apply angles', function () {
      setCfg({ 'sensors.A.yaw': d.A.yaw, 'sensors.A.tilt': d.A.tilt, 'sensors.B.yaw': d.B.yaw, 'sensors.B.tilt': d.B.tilt, 'tuning.beamHalf': d.beamHalf }).then(function (ack) { if (ack) { st.dirty = false; setProgress('c3', 'done'); RS.app.toast('Angles set', 'ok'); } });
    }, 'primary');
    stu.body.appendChild(h('div.card', h('h2', 'Sensor angles'), h('div.sub', 'Yaw is the aim in the plane: 0° points right (+x), 90° points toward you, 45° from the back-left corner aims at the sink centre. Tilt is negative down into the basin, about -20° on the PoC rig. Angles do not change the distance maths; they drive the coverage prediction in C5 and the aim checks in C7.'),
      h('div.grid.c2.mt', sensorCard('A'), sensorCard('B')),
      h('div.card.tight.mt', h('h3', 'Beam'), h('div.grid.c2.mt-s', angleField('Beam half-angle (tuning.beamHalf)', d, 'beamHalf', 20, 90), h('div.small.dim', 'An assumption until measured on the bench. The XM125 module is roughly ±60° at half power. Narrower beams leave the far corners outside a cone in C5.'))),
      h('div.row.end.mt', apply)));
    stu.body.appendChild(h('div.card', h('div.eyebrow', 'Beam cones'), h('div.mt', pm.el)));
    return { tick: function () { pm.tick(cfg.plane); }, onCfg: function () { cfg = S.cfg(); if (!st.dirty) { var t = take(); d.A = t.A; d.B = t.B; d.beamHalf = t.beamHalf; st.draft = d; fields.forEach(function (f) { f.refresh(); }); } pm.dirty = true; } };
  };

  // ---- C4 · hand depth band -------------------------------------------------------------------------------------------------------------
  P.c4 = function (stu) {
    var cfg = S.cfg(), st = stu.st.c4 || (stu.st.c4 = {});
    if (!st.draft) st.draft = { zmin: cfg.hand.zmin, zmax: cfg.hand.zmax };
    var d = st.draft, fMin = lenField('Shallowest hand (zmin)', d, 'zmin', function () { st.dirty = true; }), fMax = lenField('Deepest hand (zmax)', d, 'zmax', function () { st.dirty = true; });
    var zw = tile('Working hand depth (zwork)', fmtLen(cfg.hand.zwork, 1), 'measured in step C8');
    var apply = btn('Apply band', function () {
      if (!(d.zmin >= 0 && d.zmax > d.zmin)) return RS.app.toast('zmin must be 0 or more and below zmax', 'warn');
      setCfg({ 'hand.zmin': Math.round(d.zmin), 'hand.zmax': Math.round(d.zmax) }).then(function (ack) { if (ack) { st.dirty = false; setProgress('c4', 'done'); RS.app.toast('Hand depth band set', 'ok'); } });
    }, 'primary');
    stu.body.appendChild(h('div.card', h('div.row.between.wrap.top', h('div.grow', h('h2', 'Hand depth band'), h('div.sub', 'How far below the ring a hand can be. Default 30 to 200 mm.')), unitSeg()),
      h('div.grid.c3.mt', fMin, fMax, zw),
      h('div.mt', callout('info', 'Why it matters', 'Two sensors give two distances, so the hand\'s depth has to be assumed: every position fix uses the working depth zwork, which C8 measures from real hands. The band says how far a real hand can be from that assumption. The wider the band, the more position error the coverage prediction (C5) expects, especially near a sensor where depth and planar distance are hard to tell apart. Too narrow a band and real hands fall outside the model.')),
      h('div.row.end.mt', apply)));
    return { onCfg: function () { cfg = S.cfg(); if (!st.dirty) { d.zmin = cfg.hand.zmin; d.zmax = cfg.hand.zmax; fMin.refresh(); fMax.refresh(); } zw.setValue(fmtLen(cfg.hand.zwork, 1)); } };
  };

  // ---- C5 · coverage and accuracy heatmap -------------------------------------------------------------------------------------------------
  P.c5 = function (stu) {
    var cfg = S.cfg(), cov = null, seg = h('div.seg'), legend = h('div.row.wrap.mt-s'), zonesBox = h('div'), warnBox = h('div');
    var overall = tile('Predicted overall accuracy', '–', '%'), weakest = tile('Weakest zone', '–', ''), redCells = tile('Cells under 90%', '–', 'of ' + (23 * 21));
    var pm = new PlanMini({ maxH: 440, pad: 26, draw: draw });
    function accColor(a) { if (a >= 0.97) return rgba('#7FE0C4', 0.3 + 0.5 * Math.min(1, (a - 0.97) / 0.03)); if (a >= 0.9) return rgba('#F2B44B', 0.45); return rgba('#FF6B6B', 0.35 + 0.4 * (1 - a / 0.9)); }
    function draw(ctx, g) {
      drawBasin(ctx, g); if (!cov) return;
      var cw = g.bw / cov.nx, ch = g.bh / cov.ny;
      ctx.save(); rrect(ctx, g.bx, g.by, g.bw, g.bh, 10); ctx.clip();
      cov.cells.forEach(function (c) { var x = g.bx + (c.xf - 0.5 / cov.nx) * g.bw, y = g.by + (c.yf - 0.5 / cov.ny) * g.bh; ctx.fillStyle = c.blind ? 'rgba(0,0,0,0.55)' : accColor(c.acc); ctx.fillRect(x, y, cw + 0.6, ch + 0.6); if (c.blind) hatch(ctx, x, y, cw + 0.6, ch + 0.6); });
      var mb = 45 * g.mm; ctx.fillStyle = 'rgba(255,107,107,0.12)'; ctx.fillRect(g.bx, g.by, g.bw, mb);
      ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(255,107,107,0.8)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(g.bx, g.by + mb + 0.5); ctx.lineTo(g.bx + g.bw, g.by + mb + 0.5); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,160,160,0.9)'; ctx.font = '10px Geist, system-ui'; ctx.fillText('mirror band (P7)', g.bx + 8, g.by + mb - 4);
      ctx.restore();
      drawZones(ctx, g, cov.zones, { fillAlpha: 0, outline: 'rgba(255,255,255,0.4)' });
      ['A', 'B'].forEach(function (k) { drawCone(ctx, g, cfg.sensors[k], COL[k], cfg.tuning.beamHalf || 60); });
      ['A', 'B'].forEach(function (k) { drawSensorDot(ctx, g, k, cfg.sensors[k], COL[k]); });
      planeLabel(ctx, g, cfg.plane, 'hand depth ' + Math.round(cfg.hand.zmin) + ' to ' + Math.round(cfg.hand.zmax) + ' mm');
    }
    function swatch(bg, label, hatched) { var s = h('span', { style: { width: '14px', height: '14px', borderRadius: '4px', background: bg, border: '1px solid rgba(255,255,255,0.15)', display: 'inline-block', backgroundImage: hatched ? 'repeating-linear-gradient(45deg, rgba(255,255,255,0.25) 0 1px, transparent 1px 4px)' : '' } }); return h('span.row.gap-s.small.dim', s, label); }
    function compute() {
      cfg = S.cfg();
      try { cov = G.coverage(cfg, 23, 21, cfg.layout); } catch (e) { console.error(e); cov = null; }
      pm.dirty = true; renderSide();
    }
    function renderSide() {
      U.empty(seg); U.empty(zonesBox); U.empty(warnBox); U.empty(legend);
      var lays = cfg.layouts || RS.LAYOUTS; Object.keys(lays).forEach(function (k) { seg.appendChild(h('button' + (cfg.layout === k ? '.on' : ''), { onclick: function () { send({ c: 'layout', layout: k }); } }, (lays[k] && lays[k].name) || k)); });
      [swatch(rgba('#7FE0C4', 0.6), '97% or better'), swatch(rgba('#F2B44B', 0.45), '90 to 97%'), swatch(rgba('#FF6B6B', 0.6), 'under 90%'), swatch('rgba(0,0,0,0.6)', 'blind: nearer than the range start', true), swatch('rgba(255,107,107,0.3)', 'mirror band: both solutions near the sensor line')].forEach(function (s) { legend.appendChild(s); });
      if (!cov) { zonesBox.appendChild(callout('warn', 'Coverage could not be computed', 'Check the plane and sensor positions.')); return; }
      overall.setValue(Math.round(cov.overall * 100));
      var ids = Object.keys(cov.perZone), weakId = null; ids.forEach(function (id) { if (weakId === null || cov.perZone[id] < cov.perZone[weakId]) weakId = id; });
      var weakZ = weakId ? G.zoneById(cov.zones, weakId) : null;
      weakest.setValue(weakZ ? Math.round(cov.perZone[weakId] * 100) + '%' : '–', weakZ ? zoneLabel(weakZ, cov.zones) : '');
      var red = cov.cells.filter(function (c) { return !c.blind && c.zone && c.acc < 0.9; }).length; redCells.setValue(red);
      var tb = h('tbody'); cov.zones.forEach(function (z) {
        var a = cov.perZone[z.id] || 0, k = a >= 0.97 ? 'ok' : a >= 0.93 ? 'warn' : 'bad', isWeak = z.id === weakId;
        tb.appendChild(h('tr', { style: isWeak ? { background: 'rgba(255,107,107,0.06)' } : null }, h('td', h('span.row.gap-s', h('span', { style: { width: '8px', height: '8px', borderRadius: '4px', background: FN[z.fn] ? FN[z.fn].color : '#AEB7C2', display: 'inline-block' } }), (isWeak ? h('strong', zoneLabel(z, cov.zones)) : zoneLabel(z, cov.zones)))), h('td.small.dim.mono', z.id), h('td.num', Math.round(a * 100) + '%'), h('td', chip(k === 'ok' ? 'On target' : k === 'warn' ? 'Below 97%' : 'Below 93% floor', k))));
      });
      zonesBox.appendChild(h('table.t.compact', h('thead', h('tr', h('th', 'Zone'), h('th', 'Id'), h('th', 'Expected'), h('th', 'Against spec 1'))), tb));
      if (red > 0 || (weakZ && cov.perZone[weakId] < 0.93)) warnBox.appendChild(h('div.mt', callout('warn', red > 0 ? red + ' cells predict under 90%' : 'A zone predicts under the 93% floor', 'Red inside a zone means a hand there is likely to be placed in a neighbouring zone. The usual causes, most likely first: a sensor aimed the wrong way (P4), tilted too far or too flat (P5), a zone too close to a sensor (P6), or the mirror band along the back edge (P7). Deeper back zones in the zone editor (C9) also help.', h('div.row.wrap.mt-s', fixChip('P4'), fixChip('P5'), fixChip('P6'), fixChip('P7')))));
      else warnBox.appendChild(h('div.mt', callout('ok', 'No red areas', 'Every zone predicts 93% or better for the current geometry and hand depth band. The real test is C11.')));
      setProgress('c5', red > 0 ? 'fail' : 'done');
    }
    stu.body.appendChild(h('div.card', h('div.row.between.wrap.top', h('div.grow', h('h2', 'Coverage and accuracy prediction'), h('div.sub', 'From the plane (C1), sensor poses (C2, C3) and the hand depth band (C4): range noise and depth uncertainty become a position error per cell, then the chance that a hand at that cell is placed in the right zone of the active layout. Recomputes on every change.')), seg),
      h('div.mt', pm.el), legend, h('div.grid.c3.mt', overall, weakest, redCells)));
    stu.body.appendChild(h('div.card', h('div.eyebrow', 'Expected accuracy per zone'), h('div.mt-s', zonesBox), warnBox));
    compute();
    return { tick: function () { pm.tick(cfg.plane); }, onCfg: compute };
  };

  // ---- C6 · empty-sink background capture -------------------------------------------------------------------------------------------------
  P.c6 = function (stu) {
    var st = stu.st.c6 || (stu.st.c6 = {});
    var startBtn = btn('Capture', start, 'primary'), box = h('div.mt');
    stu.body.appendChild(h('div.card', h('div.row.between.wrap.top', h('div.grow', h('h2', 'Empty-sink background'), h('div.sub', 'Records the echoes the basin itself returns (seams, the drain, the far wall) so they are suppressed inside the sensors from now on. Redo it after moving the rig or changing anything in the sink.')), startBtn),
      h('div.mt', callout('info', 'Before you capture', null, h('ol.steps', h('li', 'Take everything out of the sink: cups, sponges, the wand and the template.'), h('li', 'Step back at least a metre and keep your hands away from the opening.'), h('li', 'The capture takes about two seconds. Do not lean over it.')))), box));
    function start() { st.cal = { step: 'c6', state: 'running', i: 0, n: 40 }; render(); send({ c: 'cal', step: 'c6', a: 'start' }); }
    function echoTable(k, list) {
      list = list || [];
      if (!list.length) return h('div.card.tight', h('div.eyebrow', 'Sensor ' + k), h('div.sub.mt-s', 'No steady echoes recorded'));
      return h('div.card.tight', h('div.eyebrow', 'Sensor ' + k + ' · ' + list.length + ' recorded'), h('table.t.compact.mt-s', h('thead', h('tr', h('th', 'Distance'), h('th', 'Strength'), h('th', 'Seen in'))), h('tbody', list.map(function (e) { return h('tr', h('td.num', Math.round(e.d) + ' mm'), h('td.num', Math.round(e.s)), h('td.num.dim', e.n + ' frames')); }))));
    }
    function render() {
      U.empty(box); var cal = st.cal;
      startBtn.disabled = !!(cal && cal.state === 'running');
      if (!cal) { box.appendChild(h('div.small.dim', 'Not captured yet in this session.')); return; }
      if (cal.state === 'running') {
        var fr = cal.n ? (cal.i || 0) / cal.n : 0;
        box.appendChild(h('div', h('div.row.between.small.dim', h('span', 'Capturing…'), h('span.num', (cal.i || 0) + ' / ' + (cal.n || 40) + ' frames')), h('div.bar.mt-s', h('i', { style: { width: Math.round(fr * 100) + '%' } }))));
        if (cal.warn) box.appendChild(h('div.mt-s', callout('warn', cal.warn, 'Take it out and capture again.')));
        return;
      }
      if (cal.state === 'done' && cal.result) {
        var r = cal.result;
        box.appendChild(h('div.grid.c2', echoTable('A', r.A), echoTable('B', r.B)));
        if (r.codes && r.codes.length) r.codes.forEach(function (c) { box.appendChild(h('div.mt', RS.fixPanel(c, { onTest: start, detail: c === 'B1' ? 'A strong echo at a fixed distance: something is in the sink.' : 'Strongest background echo ' + Math.round(r.maxStrength || 0) + '. Strong basin reflections narrow the hand window.' }))); });
        else box.appendChild(h('div.mt', callout('ok', 'Background captured', 'Strongest recorded echo ' + Math.round(r.maxStrength || 0) + '. These distances are now suppressed inside each sensor; a hand at the same distance still shows because it is stronger.')));
        box.appendChild(h('div.row.end.mt', btn('Capture again', start, 'sm')));
        setProgress('c6', r.ok ? 'done' : 'fail');
      }
      if (cal.state === 'failed') { box.appendChild(callout('bad', 'Capture failed on the device', cal.message || '')); setProgress('c6', 'fail'); }
    }
    render();
    return { onCal: function (cal) { if (!cal.step || cal.step === 'c6') render(); } };
  };

  // ---- shared bits for the wand (C7) and hand (C8) steps -----------------------------------------------------------------------------------
  function readingTiles(rd) {
    rd = rd || {}; var steady = rd.steady || 0;
    return h('div.grid.c3', tile('Sensor A', rd.A ? Math.round(rd.A[0]) : '–', rd.A ? 'mm · strength ' + Math.round(rd.A[1]) : 'no echo'), tile('Sensor B', rd.B ? Math.round(rd.B[0]) : '–', rd.B ? 'mm · strength ' + Math.round(rd.B[1]) : 'no echo'),
      h('div.tile', h('div.l', 'Steadiness'), h('div.bar', h('i', { style: { width: Math.round(steady * 100) + '%' } })), h('div.small.dim', steady >= 1 ? 'Steady. Reading taken.' : 'Hold still…')));
  }
  function holeGrid(states, onClick) {
    var grid = h('div.holes');
    states.forEach(function (x, i) { grid.appendChild(h('button.hole' + (x.s !== 'todo' ? '.' + x.s : ''), { title: x.title, type: 'button', onclick: function () { onClick(i + 1); } }, String(i + 1), x.s === 'done' ? h('span.tiny', '✓') : x.s === 'bad' ? h('span.tiny', '!') : x.s === 'skip' ? h('span.tiny.dim', 'skip') : null)); });
    return grid;
  }
  function hasSample(cal, n) { return cal.samples ? cal.samples.some(function (s) { return s.hole === n; }) : n < (cal.hole || 1); }

  // ---- C7 · wand geometry -----------------------------------------------------------------------------------------------------------------
  P.c7 = function (stu) {
    var st = stu.st.c7 || (stu.st.c7 = {}); st.skips = st.skips || {};
    var CAL = RS.CAL, gridBox = h('div.mt-s'), stage = h('div.mt'), report = h('div');
    var pm = new PlanMini({ maxH: 260, pad: 22, draw: draw });
    function holeStates() {
      var cal = st.cal, r = st.result, out = [];
      for (var i = 1; i <= 16; i++) {
        var s = 'todo', title = 'Hole ' + i + ' · click to redo';
        if (r && r.holes && r.holes[i - 1]) { var hr = r.holes[i - 1]; if (hr.skipped) { s = 'skip'; title = 'Hole ' + i + ' · skipped'; } else if (hr.err != null) { s = (hr.err > CAL.fitPassMm * 1.5 || (r.worstHole && r.worstHole.n === i && r.rms > CAL.fitPassMm)) ? 'bad' : 'done'; title = 'Hole ' + i + ' · error ' + hr.err.toFixed(1) + ' mm · click to redo'; } }
        else if (cal && cal.state !== 'idle' && cal.state !== 'done') { if (cal.hole === i) s = 'now'; else if (hasSample(cal, i)) s = 'done'; else if (st.skips[i]) { s = 'skip'; title = 'Hole ' + i + ' · skipped'; } }
        out.push({ s: s, title: title });
      }
      return out;
    }
    function draw(ctx, g) {
      var cfg = S.cfg(), plane = cfg.plane; drawBasin(ctx, g); drawZones(ctx, g, S.zones(), { labels: false, fillAlpha: 0.03 });
      drawHoles(ctx, g, G.templateHoles(plane), holeStates().map(function (x) { return x.s; }));
      ['A', 'B'].forEach(function (k) { drawSensorDot(ctx, g, k, cfg.sensors[k], COL[k], { r: 9 }); if (st.result && st.result.fits && st.result.fits[k]) drawSensorDot(ctx, g, k, st.result.fits[k], COL[k], { hollow: true, r: 12 }); });
      planeLabel(ctx, g, plane, st.result ? 'dashed: fitted position' : 'hole 1 at the back-left');
    }
    function start() { st.result = null; st.skips = {}; st.skipHole = null; st.applied = false; st.cal = { step: 'c7', state: 'waiting', hole: 1, depth: CAL.depths[0], i: 0, n: 32 }; renderAll(); send({ c: 'cal', step: 'c7', a: 'start' }); }
    function sample() { send({ c: 'cal', step: 'c7', a: 'sample' }); }
    function redo(n) { if (!st.cal || st.cal.state === 'idle') return RS.app.toast('Press Start first', 'warn'); delete st.skips[n]; st.result = null; send({ c: 'cal', step: 'c7', a: 'redo', hole: n }); }
    function skip() {
      var cal = st.cal; if (!cal) return;
      if (Object.keys(st.skips).length >= 2 && !st.skips[cal.hole]) return RS.app.toast('At most 2 holes can be skipped (P2)', 'warn');
      st.skips[cal.hole] = true; st.skipHole = cal.hole; send({ c: 'cal', step: 'c7', a: 'skip' });
    }
    function stop() { send({ c: 'cal', step: 'c7', a: 'stop' }); }
    function apply() {
      var r = st.result; if (!r || !r.fits || !r.fits.A || !r.fits.B) return;
      var sens = {}; ['A', 'B'].forEach(function (k) { var f = r.fits[k]; sens[k] = { x: U.round(f.x, 1), y: U.round(f.y, 1), z: U.round(f.z, 1), off: U.round(f.off, 1) }; });
      send({ c: 'cal', step: 'c7', a: 'apply', sensors: sens }).then(function (ack) { if (ack) { st.applied = true; setProgress('c7', 'done'); RS.app.toast('Fitted positions and offsets applied', 'ok'); renderReport(); pm.dirty = true; } });
    }
    function exportResult() { if (!st.result) return; U.download('ring-cal-c7-' + U.fileStamp() + '.json', JSON.stringify({ kind: 'ring-cal-c7', when: new Date().toISOString(), fw: L.info.fw, cfg: S.cfg(), result: st.result })); RS.app.toast('Result exported', 'ok'); }
    function renderStage() {
      U.empty(stage); var cal = st.cal, skipsUsed = Object.keys(st.skips).length;
      if (!cal || cal.state === 'idle') { stage.appendChild(callout(null, 'Ready when you are', 'Lay the template across the opening flush with the ring, hole 1 at the back-left. Have the wand in hand, then press Start.')); return; }
      var cd = RS.calDepths(S.cfg()), mark = cal.depth === cd[1] ? 2 : 1;
      if (cal.state === 'waiting' || cal.state === 'running') {
        stage.appendChild(h('div.row.between.wrap.top', h('div', h('div.eyebrow', 'Reading ' + Math.min((cal.i || 0) + 1, cal.n || 32) + ' of ' + (cal.n || 32)), h('div.big.mt-s', 'Hole ' + cal.hole), h('div.sub', 'Mark ' + mark + ' · ball centre ' + cal.depth + ' mm below the ring')),
          h('div.row.wrap', btn('Redo this hole', function () { redo(cal.hole); }, 'sm'), btn('Skip this hole', skip, 'sm', skipsUsed >= 2 && !st.skips[cal.hole] ? { disabled: true, title: 'At most 2 holes can be skipped' } : { title: 'Skips both marks of this hole' }), btn('Stop', stop, 'sm danger'))));
        if (cal.state === 'waiting') stage.appendChild(h('div.mt', callout('info', 'Push the ball down to mark ' + mark + ' in hole ' + cal.hole + ' and hold it still', 'Then take the reading. The ring beeps once it has a steady value and moves on by itself.', h('div.row.end.mt-s', btn('Hold steady, take reading', sample, 'primary lg')))));
        else stage.appendChild(h('div.mt', readingTiles(cal.reading)));
        stage.appendChild(h('div.small.faint.mt-s', 'Skipped ' + skipsUsed + ' of 2 allowed. Holes nearer than ' + CAL.nearMm + ' mm to a sensor are flagged (P6).'));
        return;
      }
      if (cal.state === 'done') stage.appendChild(h('div.row.between.wrap', h('div', h('div.eyebrow', 'Complete'), h('div.sub.mt-s', (cal.samples ? cal.samples.length : (cal.i || 32)) + ' readings taken. Click a hole to redo it, or run the whole step again.')), h('div.row.wrap', btn('Run again', start, 'sm'), btn('Export result', exportResult, 'sm'))));
      if (cal.state === 'failed') stage.appendChild(callout('bad', 'The step failed on the device', cal.message || '', h('div.row.end.mt-s', btn('Run again', start, 'sm'))));
    }
    function xyz(o) { return fmtLen(o.x, 1) + ', ' + fmtLen(o.y, 1) + ', z ' + fmtLen(o.z, 1); }
    function renderReport() {
      U.empty(report); var r = st.result; if (!r) return;
      var cfg = S.cfg();
      report.appendChild(h('div.eyebrow.mt-l', 'Result'));
      if (!r.fits || !r.fits.A || !r.fits.B) { report.appendChild(h('div.mt-s', RS.fixPanel('P2', { onTest: start, detail: r.message || 'Not enough readings to fit both sensors.' }))); setProgress('c7', 'fail'); return; }
      var pass = r.rms <= CAL.fitPassMm, fA = r.fits.A, fB = r.fits.B, dz = Math.abs(fA.z - fB.z), gap = r.strengthGapDb;
      var rmsT = tile('Fit error, RMS', r.rms.toFixed(1), 'mm · pass under ' + CAL.fitPassMm); rmsT.appendChild(chip(pass ? 'Pass' : 'Fail', pass ? 'ok' : 'bad'));
      var dzT = tile('Height difference, A vs B', dz.toFixed(0), 'mm · limit ' + CAL.heightDiffMm); dzT.appendChild(chip(dz > CAL.heightDiffMm ? 'Over limit (P9)' : 'Within limit', dz > CAL.heightDiffMm ? 'warn' : 'ok'));
      var gapT = tile('Strength gap, A vs B', gap == null ? '–' : gap.toFixed(1), 'dB · limit ' + CAL.strengthGapDb); gapT.appendChild(chip(gap != null && Math.abs(gap) > CAL.strengthGapDb ? 'Over limit (S5)' : 'Within limit', gap != null && Math.abs(gap) > CAL.strengthGapDb ? 'warn' : 'ok'));
      report.appendChild(h('div.grid.c3.mt-s', rmsT, dzT, gapT));
      report.appendChild(h('div.card.tight.mt', h('table.t.compact', h('thead', h('tr', h('th', 'Sensor'), h('th', 'Typed in C2'), h('th', 'Fitted'), h('th', 'Moved'), h('th', 'Distance offset'), h('th', 'Yaw: typed · estimated'))),
        h('tbody', ['A', 'B'].map(function (k) {
          var f = r.fits[k], typed = f.typed || cfg.sensors[k], far = f.moved > CAL.poseFailMm;
          return h('tr', h('td', h('strong', { style: { color: COL[k] } }, k)), h('td.num', xyz(typed)), h('td.num', xyz(f)), h('td.num', h('span', { style: far ? { color: 'var(--bad)' } : null }, 'moved ' + fmtLen(f.moved, 1) + (far ? ' (P1)' : ''))), h('td.num', (f.off >= 0 ? '+' : '') + f.off.toFixed(0) + ' mm'), h('td.num', Math.round(cfg.sensors[k].yaw) + '° · ' + (f.yawEst == null ? '–' : Math.round(f.yawEst) + '°')));
        })))));
      var worst = r.worstHole;
      report.appendChild(h('div.card.tight.mt', h('div.eyebrow', 'Per-hole error: where the located ball landed against the hole'),
        h('div.holes.mt-s', (r.holes || []).map(function (hh) { var isW = worst && worst.n === hh.n && hh.err != null; return h('div.hole' + (hh.skipped ? '' : isW ? '.bad' : (hh.err != null && hh.err > CAL.fitPassMm * 1.5 ? '.bad' : '.done')), { style: { cursor: 'default' }, title: hh.near != null ? 'Nearest sensor ' + Math.round(hh.near) + ' mm' : '' }, h('span', String(hh.n)), h('span.num.small', hh.skipped ? 'skipped' : hh.err == null ? '–' : hh.err.toFixed(1) + ' mm')); })),
        worst && worst.err != null ? h('div.small.dim.mt-s', 'Worst: hole ' + worst.n + ' at ' + worst.err.toFixed(1) + ' mm.' + (worst.near < CAL.nearMm ? ' It sits within ' + CAL.nearMm + ' mm of a sensor (P6).' : '') + (r.staticSpread != null ? ' Still-ball spread ' + r.staticSpread.toFixed(1) + ' mm (a static object; C8 uses it for the stillness threshold).' : '')) : null));
      (r.codes || []).forEach(function (c) { report.appendChild(h('div.mt', RS.fixPanel(c, { onTest: start }))); });
      var applyBtn = btn(st.applied ? 'Applied' : (r.ok ? 'Apply fitted positions' : 'Apply anyway'), apply, 'primary lg', st.applied ? { disabled: true } : null);
      report.appendChild(h('div.row.between.wrap.mt-l', h('div.sub.grow', r.ok ? 'The fit passed. Apply writes each sensor\'s fitted x, y, z and distance offset to the ring; C2 keeps the tape-measure values as its guide.' : 'The fit has warnings. Fix them and run again, or apply anyway if you accept them.'), h('div.row', btn('Export result', exportResult, 'sm'), applyBtn)));
      if (!r.ok && !st.applied) setProgress('c7', 'fail');
    }
    function renderAll() { U.empty(gridBox); gridBox.appendChild(holeGrid(holeStates(), redo)); renderStage(); renderReport(); pm.dirty = true; }
    stu.body.appendChild(h('div.card', h('div.row.between.wrap.top', h('div.grow', h('h2', 'Wand geometry'), h('div.sub', 'Finds where each sensor really is, and its distance offset, from 32 readings of a foil ball at known points. The tape-measure values from C2 are a soft guide. Pass mark: fit error under ' + CAL.fitPassMm + ' mm RMS.')), btn('Start', start, 'primary')),
      h('div.grid.c2.mt', h('div', h('div.eyebrow', 'The template'), h('div.sub.mt-s', 'A card with 16 holes in a 4 × 4 grid at 1/8, 3/8, 5/8 and 7/8 of the width and depth. Lay it across the opening, flush with the ring, hole 1 at the back-left. Holes count left to right, back to front.')), h('div', h('div.eyebrow', 'The wand'), h('div.sub.mt-s', 'A 40 mm foil-covered ball on a rod with two marks, ' + RS.calDepths(S.cfg()).join(' and ') + ' mm from the ball centre. Push the ball through each hole down to a mark, hold it still, take the reading. A beep confirms each one: 32 readings per sensor.')))));
    stu.body.appendChild(h('div.card', h('div.grid.c2', h('div', h('div.eyebrow', 'Holes · click one to redo it'), gridBox), h('div', h('div.eyebrow', 'Template on the sink'), h('div.mt-s', pm.el))), stage, report));
    renderAll();
    return {
      tick: function () { pm.tick(S.cfg().plane); },
      onCal: function (cal) {
        if (cal.step && cal.step !== 'c7') return;
        if (!cal.step) { st.cal = null; renderAll(); return; }
        if (cal.state === 'done' && cal.result) { st.result = cal.result; st.applied = false; }
        if (cal.state === 'waiting' && st.skipHole != null) {
          // The device may skip one mark at a time; finish the hole when it comes back with the second mark.
          if (cal.hole === st.skipHole && cal.depth === CAL.depths[1]) { send({ c: 'cal', step: 'c7', a: 'skip' }); return; }
          st.skipHole = null;
        }
        renderAll();
      },
      onEvent: function (e) { if (e.ev === 'beep') pulse(gridBox.firstChild); },
      onCfg: function () { pm.dirty = true; }
    };
  };

  // ---- C8 · hand profile --------------------------------------------------------------------------------------------------------------------
  P.c8 = function (stu) {
    var st = stu.st.c8 || (stu.st.c8 = {});
    var gridBox = h('div.mt-s'), stage = h('div.mt'), report = h('div'), stillBar = null;
    var pm = new PlanMini({ maxH: 260, pad: 22, draw: draw });
    function pointStates() {
      var cal = st.cal, r = st.result, out = [];
      for (var i = 1; i <= 16; i++) {
        var s = 'todo', title = 'Point ' + i + ' · click to redo';
        if (r && r.points && r.points[i - 1]) { var p = r.points[i - 1]; if (p.missing) { s = 'skip'; title = 'Point ' + i + ' · no samples (H1)'; } else { s = p.ok ? 'done' : 'bad'; title = 'Point ' + i + ' · ' + p.samples + ' samples' + (p.spread != null ? ' · spread ' + p.spread.toFixed(1) + ' mm' : '') + ' · click to redo'; } }
        else if (cal && cal.state !== 'idle' && cal.state !== 'done') { if (cal.phase !== 'still' && cal.hole === i) s = 'now'; else if (hasSample(cal, i)) s = 'done'; }
        out.push({ s: s, title: title });
      }
      return out;
    }
    function draw(ctx, g) {
      var cfg = S.cfg(), plane = cfg.plane; drawBasin(ctx, g); drawZones(ctx, g, S.zones(), { labels: false, fillAlpha: 0.03 });
      drawHoles(ctx, g, G.templateHoles(plane), pointStates().map(function (x) { return x.s; }));
      if (st.cal && st.cal.phase === 'still') { var cx = g.bx + g.bw / 2, cy = g.by + g.bh / 2; ctx.strokeStyle = RS.ACCENT; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(cx, cy, 14, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
      ['A', 'B'].forEach(function (k) { drawSensorDot(ctx, g, k, cfg.sensors[k], COL[k], { r: 9 }); });
      planeLabel(ctx, g, plane, 'the same 16 points as C7');
    }
    function start() { st.result = null; st.applied = false; st.stillStart = null; st.cal = { step: 'c8', state: 'waiting', hole: 1, high: true, i: 0, n: 33 }; renderAll(); send({ c: 'cal', step: 'c8', a: 'start' }); }
    function sample() { if (st.cal && st.cal.phase === 'still') st.stillStart = U.now(); send({ c: 'cal', step: 'c8', a: 'sample' }); }
    function redo(n) { if (!st.cal || st.cal.state === 'idle') return RS.app.toast('Press Start first', 'warn'); st.result = null; send({ c: 'cal', step: 'c8', a: 'redo', hole: n }); }
    function skip() { send({ c: 'cal', step: 'c8', a: 'skip' }); }
    function stop() { send({ c: 'cal', step: 'c8', a: 'stop' }); }
    function apply() {
      var r = st.result; if (!r) return;
      send({ c: 'cal', step: 'c8', a: 'apply', hand: { zwork: r.zwork, strMin: r.strMin, strMax: r.strMax, stillThr: r.stillThr, envRef: r.envRef, envK: r.envK } }).then(function (ack) { if (ack) { st.applied = true; setProgress('c8', 'done'); RS.app.toast('Hand profile applied', 'ok'); renderReport(); } });
    }
    function renderStage() {
      U.empty(stage); stillBar = null; var cal = st.cal;
      if (!cal || cal.state === 'idle') { stage.appendChild(callout(null, 'Ready when you are', 'Use the template from C7. Real hands only: this step measures how your hand looks to the radar. Press Start.')); return; }
      if (cal.state === 'waiting' || cal.state === 'running') {
        var still = cal.phase === 'still';
        stage.appendChild(h('div.row.between.wrap.top', h('div', h('div.eyebrow', still ? 'Final step' : 'Point ' + Math.min((cal.i || 0) + 1, 32) + ' of 32'), h('div.big.mt-s', still ? 'Still hold' : 'Hole ' + cal.hole), h('div.sub', still ? (cal.prompt || 'Hold your hand as still as you can over the drain for 5 seconds') : (cal.high ? 'Hand held high: fingers just below the ring, the way you reach for a tap' : 'Hand held low: as deep as you would naturally reach into the basin'))),
          h('div.row.wrap', !still ? btn('Redo this point', function () { redo(cal.hole); }, 'sm') : null, !still ? btn('Skip', skip, 'sm', { title: 'Skips this reading' }) : null, btn('Stop', stop, 'sm danger'))));
        if (cal.state === 'waiting') stage.appendChild(h('div.mt', callout('info', still ? 'Relax the hand over the drain, then start the hold' : 'Put your hand through hole ' + cal.hole + (cal.high ? ', held high' : ', held low') + ' and keep it there', still ? 'A relaxed hand moves a few millimetres on its own. That movement is what separates a hand from an object under the 10 second stillness rule.' : 'Then take the reading. The ring beeps once it has a steady value and moves on by itself.', h('div.row.end.mt-s', btn(still ? 'Start 5 s hold' : 'Hold steady, take reading', sample, 'primary lg')))));
        else if (still) { stillBar = h('i', { style: { width: '0%' } }); stage.appendChild(h('div.mt', h('div.row.between.small.dim', h('span', 'Holding…'), h('span.num', 'A ' + (cal.reading && cal.reading.A ? Math.round(cal.reading.A[0]) + ' mm' : '–') + ' · B ' + (cal.reading && cal.reading.B ? Math.round(cal.reading.B[0]) + ' mm' : '–'))), h('div.bar.mt-s', stillBar))); }
        else stage.appendChild(h('div.mt', readingTiles(cal.reading)));
        return;
      }
      if (cal.state === 'done') stage.appendChild(h('div.row.between.wrap', h('div', h('div.eyebrow', 'Complete'), h('div.sub.mt-s', (cal.samples ? cal.samples.length : 32) + ' hand readings and one still hold. Click a point to redo it, or run the whole step again.')), btn('Run again', start, 'sm')));
      if (cal.state === 'failed') stage.appendChild(callout('bad', 'The step failed on the device', cal.message || '', h('div.row.end.mt-s', btn('Run again', start, 'sm'))));
    }
    function renderReport() {
      U.empty(report); var r = st.result; if (!r) return;
      var cfg = S.cfg(), inBand = r.zwork >= cfg.hand.zmin && r.zwork <= cfg.hand.zmax;
      report.appendChild(h('div.eyebrow.mt-l', 'Result'));
      var zT = tile('Working hand depth', fmtLen(r.zwork, 1), 'now ' + fmtLen(cfg.hand.zwork, 1)); zT.appendChild(chip(inBand ? 'Inside the C4 band ' + Math.round(cfg.hand.zmin) + ' to ' + Math.round(cfg.hand.zmax) + ' mm' : 'Outside the C4 band (H3)', inBand ? 'ok' : 'bad'));
      var sT = tile('Hand strength window', r.strMin + ' to ' + r.strMax, 'now ' + cfg.hand.strMin + ' to ' + cfg.hand.strMax);
      var eT = tile('Strength envelope', r.envRef ? r.envRef + ' at 300 mm, falls as d^-' + r.envK : 'not fitted', cfg.hand.envRef ? 'now ' + cfg.hand.envRef + ', d^-' + cfg.hand.envK : 'now off');
      var tT = tile('Still threshold', r.stillThr, 'mm · now ' + cfg.hand.stillThr);
      report.appendChild(h('div.grid.c3.mt-s', zT, sT, tT)); report.appendChild(h('div.grid.c3.mt-s', eT));
      var tooClose = r.handMove != null && r.handMove < r.staticSpread * 1.6;
      report.appendChild(h('div.card.tight.mt', h('h3', 'The stillness rule'), h('div.sub', 'A target that moves less than the still threshold for 10 seconds is treated as an object, and the water turns off. The threshold has to sit between how much a static object appears to move (the still wand in C7: ' + (r.staticSpread != null ? r.staticSpread.toFixed(1) : '–') + ' mm) and how much a relaxed still hand moves (' + (r.handMove != null ? r.handMove.toFixed(1) : 'not measured') + ' mm RMS). Threshold: ' + r.stillThr + ' mm.' + (tooClose ? ' The two are too close to tell apart, so the rule would be held off (H4).' : ''))));
      report.appendChild(h('div.card.tight.mt', h('div.eyebrow', 'Per-point spread (position scatter of the located hand)'),
        h('div.holes.mt-s', (r.points || []).map(function (p) { return h('div.hole' + (p.missing ? '' : p.ok ? '.done' : '.bad'), { style: { cursor: 'default' } }, h('span', String(p.n)), h('span.num.small', p.missing ? 'none' : (p.spread == null ? p.samples + ' smp' : p.spread.toFixed(0) + ' mm'))); })),
        h('div.small.dim.mt-s', 'Pass: at least 2 samples and a spread of 25 mm or less per point (H5).')));
      (r.codes || []).forEach(function (c) { report.appendChild(h('div.mt', RS.fixPanel(c, { onTest: start }))); });
      var applyBtn = btn(st.applied ? 'Applied' : (r.ok ? 'Apply hand profile' : 'Apply anyway'), apply, 'primary lg', st.applied ? { disabled: true } : null);
      report.appendChild(h('div.row.between.wrap.mt-l', h('div.sub.grow', r.ok ? 'Apply writes the working depth, the strength window and the still threshold to the ring.' : 'The profile has warnings. Redo the flagged points, or apply anyway if you accept them.'), applyBtn));
      if (!r.ok && !st.applied) setProgress('c8', 'fail');
    }
    function renderAll() { U.empty(gridBox); gridBox.appendChild(holeGrid(pointStates(), redo)); renderStage(); renderReport(); pm.dirty = true; }
    stu.body.appendChild(h('div.card', h('div.row.between.wrap.top', h('div.grow', h('h2', 'Hand profile'), h('div.sub', 'A real hand at the same 16 points, held naturally high and low, plus one 5 second still hold. It measures the working hand depth used in every position fix, the echo strength of a real hand (the hand-sized window), and how much a still hand moves (the stillness threshold). Any point can be redone. It does not build a correction map.')), btn('Start', start, 'primary'))));
    stu.body.appendChild(h('div.card', h('div.grid.c2', h('div', h('div.eyebrow', 'Points · click one to redo it'), gridBox), h('div', h('div.eyebrow', 'Template on the sink'), h('div.mt-s', pm.el))), stage, report));
    renderAll();
    return {
      tick: function () { pm.tick(S.cfg().plane); if (stillBar && st.stillStart) stillBar.style.width = Math.round(Math.min(1, (U.now() - st.stillStart) / 5000) * 100) + '%'; },
      onCal: function (cal) {
        if (cal.step && cal.step !== 'c8') return;
        if (!cal.step) { st.cal = null; renderAll(); return; }
        if (cal.state === 'done' && cal.result) { st.result = cal.result; st.applied = false; }
        renderAll();
      },
      onEvent: function (e) { if (e.ev === 'beep') pulse(gridBox.firstChild); },
      onCfg: function () { pm.dirty = true; if (st.result) renderReport(); }
    };
  };

  // ---- C9 · zone editor ------------------------------------------------------------------------------------------------------------------
  P.c9 = function (stu) {
    var cfg = S.cfg(), st = stu.st.c9 || (stu.st.c9 = {}), lays = cfg.layouts || RS.LAYOUTS;
    if (!st.draft || !st.editId || (!st.isNew && !lays[st.editId])) { st.editId = lays[cfg.layout] ? cfg.layout : Object.keys(lays)[0]; st.draft = U.deepClone(lays[st.editId] || RS.LAYOUTS.kitchen); st.isNew = false; }
    var seg = h('div.seg'), rowsBox = h('div.col.gap-s.mt'), warnBox = h('div.mt'), actions = h('div.row.wrap.end.mt'), nameIn = h('input', { type: 'text', value: st.draft.name || st.editId });
    nameIn.addEventListener('input', function () { st.draft.name = nameIn.value; });
    var pm = new PlanMini({ maxH: 300, draw: function (ctx, g) { drawBasin(ctx, g); if (!st.draft) return; drawZones(ctx, g, draftZones()); planeLabel(ctx, g, cfg.plane, (st.draft.name || st.editId) + (st.isNew ? ' (not saved yet)' : '')); } });
    function draftZones() { if (!st.draft) return []; var o = {}; o[st.editId] = st.draft; return G.zones(st.editId, o); }
    function isBuiltin(id) { return !!RS.LAYOUTS[id]; }
    function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24); }
    function touch() { pm.dirty = true; renderWarn(); }
    function pickLayout(k) { st.editId = k; st.draft = U.deepClone(lays[k]); st.isNew = false; nameIn.value = st.draft.name || k; renderAll(); }
    function newLayout() {
      RS.app.prompt('New custom layout', 'Name', 'Custom', { ok: 'Create', text: 'Starts as a copy of ' + (st.draft.name || st.editId) + '.' }).then(function (name) {
        if (!name || !name.trim()) return;
        var id = slug(name) || 'custom'; while (lays[id]) id += Math.floor(Math.random() * 9 + 1);
        st.editId = id; st.draft = U.deepClone(st.draft); st.draft.name = name.trim(); st.isNew = true; nameIn.value = st.draft.name; renderAll();
      });
    }
    function renderSeg() {
      U.empty(seg);
      Object.keys(lays).forEach(function (k) { seg.appendChild(h('button' + (st.editId === k && !st.isNew ? '.on' : ''), { onclick: function () { pickLayout(k); } }, (lays[k] && lays[k].name) || k)); });
      if (st.isNew) seg.appendChild(h('button.on', { onclick: function () {} }, st.draft.name || 'New'));
    }
    function renderRows() {
      U.empty(rowsBox); var rows = st.draft.rows;
      rows.forEach(function (row, ri) {
        var hIn = numInput(Math.round(row.h * 100), { min: 5, max: 95, step: 1 });
        hIn.addEventListener('input', function () { var v = parseFloat(hIn.value); if (isFinite(v) && v > 0) { row.h = v / 100; touch(); } });
        var cells = h('div.row.wrap');
        row.fns.forEach(function (fn, ci) {
          var sel = h('select', { onchange: function () { row.fns[ci] = sel.value; touch(); } }, Object.keys(FN).map(function (k) { return h('option', { value: k, selected: k === fn }, FN[k].label); }));
          cells.appendChild(h('div.row.gap-s', h('div.field', { style: { width: '132px' } }, sel), btn('×', function () { if (row.fns.length <= 1) return RS.app.toast('A row needs at least one zone', 'warn'); row.fns.splice(ci, 1); renderRows(); touch(); }, 'sm ghost', { title: 'Remove this zone' })));
        });
        cells.appendChild(btn('+ zone', function () { if (row.fns.length >= 5) return RS.app.toast('At most 5 zones in a row', 'warn'); row.fns.push('neutral'); renderRows(); touch(); }, 'sm'));
        rowsBox.appendChild(h('div.card.tight', h('div.row.between.wrap', h('div.row.gap-s', h('strong', 'Row ' + (ri + 1)), h('span.small.dim', ri === 0 ? 'back' : ri === rows.length - 1 ? 'front' : 'middle')), h('div.row', h('div', { style: { width: '130px' } }, field(null, hIn, '% depth')), btn('Remove row', function () { if (rows.length <= 1) return RS.app.toast('A layout needs at least one row', 'warn'); rows.splice(ri, 1); renderRows(); touch(); }, 'sm ghost'))), h('div.mt-s', cells)));
      });
      rowsBox.appendChild(h('div.row', btn('+ row', function () { rows.push({ h: 0.3, fns: ['hot', 'warm', 'cold'] }); renderRows(); touch(); }, 'sm')));
    }
    function renderWarn() {
      U.empty(warnBox); var rows = st.draft.rows, sum = rows.reduce(function (a, r) { return a + (r.h || 0); }, 0), all = [].concat.apply([], rows.map(function (r) { return r.fns; }));
      var missing = ['hot', 'warm', 'cold'].filter(function (f) { return all.indexOf(f) < 0; });
      if (Math.abs(sum - 1) > 0.005) warnBox.appendChild(callout('info', 'Row depths add up to ' + Math.round(sum * 100) + '%', 'They are scaled to 100% when you save.'));
      if (missing.length) warnBox.appendChild(h('div' + (warnBox.firstChild ? '.mt-s' : ''), callout('warn', 'Missing: ' + missing.map(function (f) { return FN[f].label; }).join(', '), 'Hot, Warm and Cold must appear in every layout (spec section 3). You can still save, but the ring cannot run them from this layout.')));
      var zones = draftZones(), small = zones.filter(function (z) { return (z.x1 - z.x0) * cfg.plane.w < 120 || (z.y1 - z.y0) * cfg.plane.d < 120; });
      if (small.length) warnBox.appendChild(h('div' + (warnBox.firstChild ? '.mt-s' : ''), callout('warn', small.length + ' zone' + (small.length > 1 ? 's' : '') + ' narrower than 120 mm', 'Zones that small are hard to hit with a hand and lose accuracy at the edges (C5).')));
    }
    function renderActions() {
      U.empty(actions);
      actions.appendChild(btn('New custom layout', newLayout, 'sm'));
      if (!isBuiltin(st.editId) && !st.isNew) actions.appendChild(btn('Delete custom layout', del, 'sm danger'));
      if (!st.isNew && cfg.layout !== st.editId) actions.appendChild(btn('Use this layout now', function () { send({ c: 'layout', layout: st.editId }); }, 'sm'));
      actions.appendChild(btn('Save layout', save, 'primary'));
    }
    function save() {
      var rows = st.draft.rows, sum = rows.reduce(function (a, r) { return a + (r.h || 0); }, 0);
      if (!rows.length || !rows.every(function (r) { return r.fns && r.fns.length; })) return RS.app.toast('Every row needs at least one zone', 'warn');
      if (sum > 0) rows.forEach(function (r) { r.h = U.round(r.h / sum, 4); });
      st.draft.name = (nameIn.value || '').trim() || st.draft.name || st.editId;
      var id = st.editId, wasNew = st.isNew, set = {}; set['layouts.' + id] = U.deepClone(st.draft);
      setCfg(set).then(function (ack) { if (!ack) return; st.isNew = false; setProgress('c9', 'done'); RS.app.toast('Layout saved', 'ok'); if (wasNew) send({ c: 'layout', layout: id }); renderAll(); });
    }
    function del() {
      var id = st.editId; if (isBuiltin(id)) return;
      RS.app.confirm('Delete layout ' + (st.draft.name || id) + '?', 'The ring switches to Kitchen first if this layout is active. There is no undo.', 'Delete', true).then(function (ok) {
        if (!ok) return;
        var del = {}; del['layouts.' + id] = null;   // a null value deletes the key (protocol: cfg set)
        var p = cfg.layout === id ? send({ c: 'layout', layout: 'kitchen' }) : Promise.resolve(true);
        p.then(function () { return setCfg(del); }).then(function (ack) { if (ack) { st.editId = null; st.draft = null; RS.app.toast('Layout deleted', 'ok'); } });
      });
    }
    function renderAll() { renderSeg(); renderRows(); renderWarn(); renderActions(); pm.dirty = true; }
    stu.body.appendChild(h('div.card', h('div.row.between.wrap.top', h('div.grow', h('h2', 'Zone editor'), h('div.sub', 'Rows run back to front; each row splits its width equally between its zones. Edit a built-in layout or make a custom one. Saved layouts switch live.')), seg),
      h('div.grid.c2.mt', h('div', h('div.mt-s', field('Layout name', nameIn)), rowsBox, warnBox, actions), h('div', h('div.eyebrow', 'Preview'), h('div.mt-s', pm.el)))));
    renderAll();
    return {
      tick: function () { pm.tick(cfg.plane); },
      onCfg: function () { cfg = S.cfg(); lays = cfg.layouts || RS.LAYOUTS; if (!st.isNew && (!st.editId || !lays[st.editId])) { st.editId = lays[cfg.layout] ? cfg.layout : Object.keys(lays)[0]; st.draft = U.deepClone(lays[st.editId]); nameIn.value = st.draft.name || st.editId; renderAll(); } else { renderSeg(); renderActions(); pm.dirty = true; } }
    };
  };

  // ---- C10 · tuning ------------------------------------------------------------------------------------------------------------------------
  P.c10 = function (stu) {
    var cfg = S.cfg(), fields = {}, timers = {};
    function setLater(key, v) { clearTimeout(timers[key]); timers[key] = setTimeout(function () { var o = {}; o['tuning.' + key] = v; setCfg(o); }, 250); }
    var grid = h('div.grid.c2');
    RS.TUNING_META.forEach(function (m) {
      var key = m[0]; if (key === 'i2cKhz') return;
      var v = cfg.tuning[key], n = numInput(v, { min: m[3], max: m[4], step: m[5] }), r = h('input', { type: 'range', min: m[3], max: m[4], step: m[5], value: v });
      var push = function (val) { val = U.clamp(val, m[3], m[4]); n.value = val; r.value = val; setLater(key, val); };
      n.addEventListener('change', function () { var x = parseFloat(n.value); if (isFinite(x)) push(x); });
      r.addEventListener('input', function () { push(parseFloat(r.value)); });
      fields[key] = { n: n, r: r };
      var f = field(m[1], n, m[2]); f.appendChild(r);
      grid.appendChild(h('div.card.tight', f, h('div.small.dim.mt-s', m[6])));
    });
    var logSw = h('label.switch' + (cfg.tuning.log ? '.on' : ''), h('span.tr'), h('span', 'Serial logging'));
    logSw.addEventListener('click', function () { var on = !logSw.classList.contains('on'); logSw.classList.toggle('on', on); setCfg({ 'tuning.log': on }); });
    var ORDERS = ['GRB', 'RGB', 'BRG', 'BGR', 'RBG', 'GBR'];
    var orderSel = h('select', { onchange: function () { setCfg({ 'tuning.ledOrder': orderSel.value }); } }, ORDERS.map(function (o) { return h('option', { value: o, selected: o === (cfg.tuning.ledOrder || 'GRB') }, o); }));
    var i2cSel = h('select', { onchange: function () { setCfg({ 'tuning.i2cKhz': parseInt(i2cSel.value, 10) }); } }, [400, 100].map(function (o) { return h('option', { value: String(o), selected: o === cfg.tuning.i2cKhz }, o + ' kHz'); }));
    var reset = btn('Reset to defaults', function () {
      RS.app.confirm('Reset tuning to factory defaults?', 'Every value on this page goes back to defaults.h. Geometry, hand profile and layouts are not touched.', 'Reset', true).then(function (ok) {
        if (!ok) return; var set = {}; Object.keys(RS.DEFAULTS.tuning).forEach(function (k) { set['tuning.' + k] = RS.DEFAULTS.tuning[k]; });
        setCfg(set).then(function (ack) { if (ack) RS.app.toast('Tuning reset', 'ok'); });
      });
    }, 'sm danger');
    stu.body.appendChild(h('div.card', h('div.row.between.wrap.top', h('div.grow', h('h2', 'Tuning'), h('div.sub', 'Every change applies live and is saved to flash after two quiet seconds. The defaults come from firmware/include/defaults.h.')), reset),
      h('div.mt', grid),
      h('div.grid.c3.mt', h('div.card.tight', h('div.field', h('label', 'LED colour order'), h('div.in', orderSel)), h('div.small.dim.mt-s', 'What the strip expects. The C0 colour test sets this for you.')), h('div.card.tight', h('div.field', h('label', 'I2C speed'), h('div.in', i2cSel)), h('div.small.dim.mt-s', '400 kHz normally; 100 kHz if bus errors appear (W2).')), h('div.card.tight', h('div.field', h('label', 'Logging'), h('div.mt-s', logSw)), h('div.small.dim.mt-s', 'Prints frames and events on USB serial. Slows the ESP32 a little.')))));
    setProgress('c10', 'done');
    return {
      onCfg: function () {
        cfg = S.cfg(); var ae = typeof document !== 'undefined' ? document.activeElement : null;
        Object.keys(fields).forEach(function (k) { var f = fields[k], v = cfg.tuning[k]; if (v == null) return; if (ae !== f.n && ae !== f.r) { f.n.value = v; f.r.value = v; } });
        logSw.classList.toggle('on', !!cfg.tuning.log); orderSel.value = cfg.tuning.ledOrder || 'GRB'; i2cSel.value = String(cfg.tuning.i2cKhz || 400);
      },
      destroy: function () { Object.keys(timers).forEach(function (k) { clearTimeout(timers[k]); }); }
    };
  };

  // ---- C11 · validation (quick on-site check) ------------------------------------------------------------------------------------------------
  P.c11 = function (stu) {
    var st = stu.st.c11 || (stu.st.c11 = {}), cfg = S.cfg(), run = st.run || null;
    var head = h('div'), progBox = h('div.mt'), zonesBox = h('div.mt'), resBox = h('div');
    var pm = new PlanMini({ maxH: 380, draw: draw });
    function draw(ctx, g) {
      var plane = cfg.plane, zones = S.zones(), tgt = run && run.target;
      drawBasin(ctx, g); drawZones(ctx, g, zones, { highlight: tgt ? tgt.id : null });
      if (tgt) { var c = G.zoneCentre(tgt, plane), x = g.bx + c.x * g.mm, y = g.by + c.y * g.mm, col = FN[tgt.fn] ? FN[tgt.fn].color : RS.ACCENT, ph = (U.now() / 600) % 1; ctx.strokeStyle = rgba(col, 0.9 - 0.6 * ph); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 10 + 14 * ph, 0, 7); ctx.stroke(); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fill(); }
      drawHand(ctx, g, plane, S.frame());
      ['A', 'B'].forEach(function (k) { drawSensorDot(ctx, g, k, cfg.sensors[k], COL[k], { r: 9 }); });
      planeLabel(ctx, g, plane, L.mode === 'sim' ? 'your cursor is the hand' : null);
    }
    pm.cv.addEventListener('pointermove', function (e) { if (L.mode !== 'sim') return; var p = pm.toMm(e, cfg.plane); simHand(p.inside ? { x: p.x, y: p.y, h: cfg.hand.zwork } : null); });
    pm.cv.addEventListener('pointerdown', function (e) { if (RS.sound && RS.sound.unlockOnGesture) RS.sound.unlockOnGesture(); if (L.mode !== 'sim') return; var p = pm.toMm(e, cfg.plane); simHand(p.inside ? { x: p.x, y: p.y, h: cfg.hand.zwork } : null); });
    pm.cv.addEventListener('pointerleave', function () { simHand(null); });
    function start() {
      if (run && !run.done) return;
      run = st.run = RS.accuracyRun({ trialsPerZone: 5, onUpdate: function () { render(); pm.dirty = true; }, onDone: finish });
      render();
    }
    function stop() { if (run) run.stop(); render(); }
    function finish(r) {
      r.codes = RS.accuracyCodes(r);
      RS.rec.saveAccuracy({ id: U.uuid(), when: r.when, layout: r.layout, layouts: r.layouts, trials: r.trials, quick: true, cal: (S.status() || {}).cal || null, passed: r.passed });
      setProgress('c11', r.passed ? 'done' : 'fail'); render();
    }
    function render() {
      U.empty(head); U.empty(progBox); U.empty(zonesBox); U.empty(resBox);
      var active = run && !run.done;
      head.appendChild(h('div.row.between.wrap.top', h('div.grow', h('h2', 'Quick on-site check'), h('div.sub', '5 trials per zone of the ' + S.layoutName() + ' layout, all must pass. Reach in from the front to the target dot the way a user would, hold until the function starts, then take your hand out. About 5 minutes. The full F16 test lives on the Dashboard.')),
        h('div.row', active ? btn('Stop', stop, 'sm danger') : null, btn(run && run.done ? 'Run again' : 'Start quick check', start, 'primary', active ? { disabled: true } : null))));
      if (!run) return;
      var done = run.trials.length, fr = run.total ? done / run.total : 0;
      progBox.appendChild(h('div.row.between.small.dim', h('span', active ? 'Trial ' + Math.min(done + 1, run.total) + ' of ' + run.total : (run.phase === 'stopped' ? 'Stopped after ' + done + ' of ' + run.total : 'Finished: ' + done + ' trials')), h('span.num', Math.round(fr * 100) + '%')));
      progBox.appendChild(h('div.bar.mt-s', h('i', { style: { width: Math.round(fr * 100) + '%' } })));
      if (active) {
        var t = run.target, msg, sub;
        if (run.phase === 'clear' || run.phase === 'between') { msg = 'Take your hand out of the sink'; sub = 'The next target appears once the session has ended.'; }
        else if (t) { msg = 'Reach for ' + zoneLabel(t, run.allZones); sub = run.phase === 'in' ? 'Hold still in the zone until it starts.' : 'Reach in now, straight to the dot.'; }
        progBox.appendChild(h('div.mt', h('div.big', { style: t && run.phase !== 'between' && run.phase !== 'clear' ? { color: FN[t.fn] ? FN[t.fn].color : '' } : null }, msg || ''), h('div.sub', sub || '')));
        var last = run.trials[run.trials.length - 1];
        if (last) progBox.appendChild(h('div.mt-s', chip(last.ok ? 'Last: ' + (FN[last.fn] ? FN[last.fn].label : last.fn) + ' in ' + last.ms + ' ms' : 'Last: expected ' + (FN[last.fn] ? FN[last.fn].label : last.fn) + ', got ' + (last.gotFn ? (FN[last.gotFn] ? FN[last.gotFn].label : last.gotFn) : 'no latch in 8 s'), last.ok ? 'ok' : 'bad')));
      }
      var per = {}; run.zones.forEach(function (z) { per[z.id] = { n: 0, ok: 0, z: z }; }); run.trials.forEach(function (x) { if (per[x.zone]) { per[x.zone].n += 1; if (x.ok) per[x.zone].ok += 1; } });
      var tb = h('tbody'); run.zones.forEach(function (z) { var p = per[z.id], k = p.n === 0 ? '' : p.ok === p.n ? 'ok' : 'bad'; tb.appendChild(h('tr', h('td', zoneLabel(z, run.allZones)), h('td.num', p.ok + ' / ' + p.n + ' of 5'), h('td', p.n ? chip(k === 'ok' ? 'Passing' : (p.n - p.ok) + ' failed', k) : h('span.small.dim', 'waiting')))); });
      zonesBox.appendChild(h('table.t.compact', h('thead', h('tr', h('th', 'Zone'), h('th', 'Passed'), h('th', 'State'))), tb));
      if (run.done && run.phase === 'done') {
        var fails = run.trials.filter(function (x) { return !x.ok; }), lats = run.trials.filter(function (x) { return x.ok && x.ms != null; }).map(function (x) { return x.ms; });
        resBox.appendChild(h('div.mt', run.passed ? callout('ok', 'Passed: ' + run.trials.length + ' of ' + run.trials.length + ' trials', 'Median response ' + Math.round(U.median(lats)) + ' ms. This calibration is ready for the venue. Save it in C13.') : callout('bad', 'Failed: ' + fails.length + ' of ' + run.trials.length + ' trials', 'Failures: ' + fails.map(function (x) { var z = G.zoneById(run.allZones, x.zone); return (z ? zoneLabel(z) : x.zone) + ' → ' + (x.gotFn ? (FN[x.gotFn] ? FN[x.gotFn].label : x.gotFn) : 'no latch'); }).join('; ') + '.')));
        (run.codes || []).forEach(function (c) { resBox.appendChild(h('div.mt', RS.fixPanel(c, { onTest: start }))); });
        if (fails.length && !(run.codes || []).length) resBox.appendChild(h('div.mt', callout('warn', 'Failures are scattered', 'No single pattern. Check the C7 holes near the failing zones, recapture C6, and run again. If it persists, run C8 with the person who will demo.')));
        resBox.appendChild(h('div.row.end.mt', btn('Export CSV', function () { U.download('ring-quick-check-' + U.fileStamp() + '.csv', RS.rec.accuracyCsv(run), 'text/csv'); }, 'sm')));
      }
      if (run.phase === 'stopped') resBox.appendChild(h('div.mt', callout('warn', 'Stopped', 'Nothing was saved. Start again when ready.')));
    }
    stu.body.appendChild(h('div.card', head, progBox));
    stu.body.appendChild(h('div.card', h('div.grid.c2', h('div', h('div.eyebrow', 'Target'), h('div.mt-s', pm.el)), h('div', h('div.eyebrow', 'Per zone'), zonesBox)), resBox));
    render();
    return {
      tick: function () { pm.tick(cfg.plane); if (run && !run.done) pm.dirty = true; },
      onFrame: function () { if (run && !run.done) pm.dirty = true; },
      onCfg: function () { cfg = S.cfg(); pm.dirty = true; },
      destroy: function () { simHand(null); }
    };
  };

  // ---- C12 · health and drift monitor -----------------------------------------------------------------------------------------------------
  P.c12 = function (stu) {
    var hist = stu.healthHist, grid = h('div.grid.c4.mt'), faultsBox = h('div.mt'), tiles = {}, ageEl = h('span.small.dim');
    function mk(key, label) { var t = tile(label, '–', ''), chips = h('div.row.wrap.gap-s'); t.appendChild(chips); t.chips = chips; tiles[key] = t; grid.appendChild(t); }
    ['hzA', 'Frame rate A', 'hzB', 'Frame rate B', 'erA', 'I2C errors A', 'erB', 'I2C errors B', 'strA', 'Echo strength A', 'strB', 'Echo strength B', 'drift', 'Background drift', 'ghosts', 'Ghost echoes', 'front', 'Front-edge echoes', 'trig', 'Triggers with no hand', 'fo', 'False-offs · held on', 'rst', 'Last reset', 'led', 'LED brightness', 'temp', 'ESP32 temperature', 'rssi', 'Wi-Fi signal', 'heap', 'Free memory'].forEach(function (x, i, a) { if (i % 2 === 0) mk(x, a[i + 1]); });
    function setT(key, v, u, codes) {
      var t = tiles[key]; t.setValue(v, u || ''); U.empty(t.chips); (codes || []).forEach(function (c) { t.chips.appendChild(fixChip(c)); });
      t.style.borderColor = codes && codes.length ? 'rgba(242,180,75,0.55)' : '';
    }
    function render(hh) {
      if (!hh) return;
      var now = U.now(), old = null; for (var i = 0; i < hist.length; i++) if (now - hist[i].t <= 60000) { old = hist[i].h; break; }
      var winMin = old ? Math.max(0.1, (now - hist[i].t) / 60000) : 1;
      var d = function (k, sub) { if (!old) return 0; var a = sub ? (hh[k] || {})[sub] : hh[k], b = sub ? (old[k] || {})[sub] : old[k]; return (a || 0) - (b || 0); };
      ['A', 'B'].forEach(function (k) {
        var s = hh[k] || {}, erRate = d(k, 'er') / winMin, bright = (hh.led || 0) >= 128, codes = [];
        setT('hz' + k, s.hz == null ? '–' : Number(s.hz).toFixed(1), 'Hz · fail under 20', s.hz != null && s.hz < 20 ? ['N1'] : []);
        if (erRate > 0) codes.push('W2'); if (erRate > 0 && bright) codes.push('N4');
        setT('er' + k, s.er == null ? '–' : s.er, erRate > 0 ? 'since boot · ' + erRate.toFixed(1) + ' per min' : 'since boot', codes);
        setT('str' + k, s.str == null ? '–' : Math.round(s.str), s.calNeeded ? 'sensor asks to recalibrate' : 'linear amplitude', s.calNeeded ? ['B8'] : []);
      });
      setT('drift', hh.bgDrift == null ? '–' : Math.round(hh.bgDrift), 'mm since C6 · warn over 25', hh.bgDrift > 25 ? ['B3'] : []);
      var gRate = d('ghosts') / winMin / 60; setT('ghosts', hh.ghosts == null ? '–' : hh.ghosts, gRate > 0 ? 'since boot · ' + gRate.toFixed(1) + ' per s' : 'since boot', gRate > 10 ? ['N2'] : []);
      var dfr = d('front'); setT('front', hh.front == null ? '–' : hh.front, dfr > 0 ? '+' + dfr + ' this minute' : 'since boot', dfr > 0 ? ['B6'] : []);
      var dtr = d('trigNoHand'); setT('trig', hh.trigNoHand == null ? '–' : hh.trigNoHand, dtr > 0 ? '+' + dtr + ' this minute' : 'since boot', dtr > 0 ? ['A9', 'B5'] : []);
      var dfo = d('falseOff'); setT('fo', (hh.falseOff || 0) + ' · ' + (hh.heldOn || 0), dfo > 0 ? '+' + dfo + ' false-off this minute' : 'held on = dropouts bridged', dfo > 0 ? ['A7'] : []);
      var rstOk = !hh.rst || hh.rst === 'POWERON' || hh.rst === 'SW_RESET'; setT('rst', hh.rst || '–', rstOk ? 'normal' : 'unexpected restart', rstOk ? [] : ['W5', 'L6']);
      setT('led', hh.led == null ? '–' : hh.led, '/255 · errors grow when bright: N4', []);
      setT('temp', hh.temp == null ? '–' : fmtTempC(Number(hh.temp)), '', []);
      setT('rssi', hh.rssi == null ? '–' : hh.rssi, 'dBm', []);
      setT('heap', hh.heap == null ? '–' : Math.round(hh.heap / 1024), 'kB', []);
      U.empty(faultsBox); if (hh.faults && hh.faults.length) faultsBox.appendChild(callout('warn', 'Simulator faults active: ' + hh.faults.join(', '), 'Injected from the Operator view (T30 rehearsal). Each should show up above and in C0, C6 or C7.'));
      var flagged = Object.keys(tiles).some(function (k) { return tiles[k].chips.firstChild; }); setProgress('c12', flagged ? 'fail' : 'done');
    }
    stu.body.appendChild(h('div.card', h('div.row.between.wrap.top', h('div.grow', h('h2', 'Health and drift'), h('div.sub', 'Updated every second from the ring. Rates are over the last minute while this page is open. A fix code appears next to anything out of range; click it for the guided fix.')), ageEl), grid, faultsBox));
    render(S.health());
    var lastAge = 0;
    return {
      onHealth: render,
      tick: function (now) { if (now - lastAge < 500) return; lastAge = now; var last = hist.length ? hist[hist.length - 1].t : null; ageEl.textContent = last == null ? 'No health message yet' : 'Last update ' + ((U.now() - last) / 1000).toFixed(0) + ' s ago'; }
    };
  };

  // ---- C13 · save, load, compare -----------------------------------------------------------------------------------------------------------
  P.c13 = function (stu) {
    var st = stu.st.c13 || (stu.st.c13 = {}), snaps = U.store.get('studio.calSnaps', {}) || {};
    var nameIn = h('input', { type: 'text', placeholder: 'e.g. Bench 1', value: st.name || '' }), notesIn = h('textarea', { placeholder: 'Rig, venue, who calibrated, anything odd' }); notesIn.value = st.notes || '';
    nameIn.addEventListener('input', function () { st.name = nameIn.value; }); notesIn.addEventListener('input', function () { st.notes = notesIn.value; });
    var listBox = h('div.col.gap-s.mt'), cmpBox = h('div.mt'), selA = h('select'), selB = h('select');
    function saveSnaps() { U.store.set('studio.calSnaps', snaps); }
    function snapNow(name) { snaps[name] = { when: U.stamp(), cfg: U.deepClone(S.cfg()) }; saveSnaps(); }
    function save() {
      var name = (nameIn.value || '').trim(); if (!name) return RS.app.toast('Give the calibration a name', 'warn');
      var exists = (L.latest.cals || []).some(function (c) { return c.name === name; });
      (exists ? RS.app.confirm('Replace ' + name + '?', 'A calibration with this name is already on the ring.', 'Replace') : Promise.resolve(true)).then(function (ok) {
        if (!ok) return;
        send({ c: 'save', name: name, notes: (notesIn.value || '').trim() }).then(function (ack) { if (ack) { snapNow(name); setProgress('c13', 'done'); RS.app.toast('Saved as ' + name, 'ok'); renderList(); } });
      });
    }
    function load(name) {
      RS.app.confirm('Load ' + name + '?', 'Replaces the current geometry, hand profile, layouts and tuning on the ring.', 'Load').then(function (ok) {
        if (!ok) return; st.pendingSnap = name;
        send({ c: 'load', name: name }).then(function (ack) { if (ack) RS.app.toast('Loaded ' + name, 'ok'); else st.pendingSnap = null; });
      });
    }
    function del(name) {
      RS.app.confirm('Delete ' + name + '?', 'Removes it from the ring. This browser keeps its snapshot for comparison.', 'Delete', true).then(function (ok) { if (!ok) return; send({ c: 'delete', name: name }).then(function (ack) { if (ack) RS.app.toast('Deleted ' + name, 'ok'); }); });
    }
    function exportCfg() { var stt = S.status() || {}; U.download('ring-cal-' + U.fileStamp() + '.json', JSON.stringify({ kind: 'ring-cal', when: new Date().toISOString(), fw: L.info.fw, name: stt.cal ? stt.cal.name : null, cfg: S.cfg() })); RS.app.toast('Calibration exported', 'ok'); }
    function importCfg() {
      U.pickFile('.json,application/json', function (text, fname) {
        try {
          var o = JSON.parse(text), c = o.cfg || o, set = {};
          ['sensors', 'hand', 'plane', 'tuning', 'layouts'].forEach(function (k) { if (c[k] && typeof c[k] === 'object') flatten(c[k], k, set); });
          var n = Object.keys(set).length; if (!n) throw new Error('no calibration fields in ' + fname);
          setCfg(set).then(function (ack) { if (ack) RS.app.toast('Imported ' + n + ' values from ' + fname, 'ok'); });
        } catch (e) { RS.app.toast('Import failed: ' + e.message, 'bad'); }
      });
    }
    function latestRun(name) { var runs = (RS.rec.accuracy || []).filter(function (r) { return r.cal && r.cal.name === name; }); return runs.length ? runs[runs.length - 1] : null; }
    function runText(r) { if (!r) return 'no accuracy run recorded'; var ok = r.trials.filter(function (t) { return t.ok; }).length; return ok + ' of ' + r.trials.length + ' passed' + (r.quick ? ' (quick check)' : '') + ' · ' + String(r.when).slice(0, 10); }
    function renderList() {
      U.empty(listBox); var cals = L.latest.cals || [], stt = S.status() || {}, cur = stt.cal && stt.cal.saved ? stt.cal.name : null;
      if (!cals.length) { listBox.appendChild(h('div.small.dim', 'No saved calibrations on the ring yet.')); }
      cals.forEach(function (c) {
        listBox.appendChild(h('div.check', h('div.grow', h('div.row.gap-s', h('strong', c.name), c.name === cur ? chip('Current', 'ok') : null, snaps[c.name] ? null : h('span.tiny.dim', 'no snapshot in this browser')), h('div.small.dim', (c.when || '') + (c.notes ? ' · ' + c.notes : '') + ' · ' + runText(latestRun(c.name)))),
          h('div.row', btn('Load', function () { load(c.name); }, 'sm'), btn('Delete', function () { del(c.name); }, 'sm ghost'))));
      });
      [selA, selB].forEach(function (sel, i) { var prev = sel.value; U.empty(sel); sel.appendChild(h('option', { value: '' }, 'Choose…')); cals.forEach(function (c) { sel.appendChild(h('option', { value: c.name }, c.name)); }); if (prev && cals.some(function (c) { return c.name === prev; })) sel.value = prev; else if (cals[i]) sel.value = cals[i].name; });
      renderCompare();
    }
    function renderCompare() {
      U.empty(cmpBox); var a = selA.value, b = selB.value; if (!a || !b) { cmpBox.appendChild(h('div.small.dim', 'Pick two saved calibrations.')); return; }
      if (a === b) { cmpBox.appendChild(h('div.small.dim', 'Pick two different calibrations.')); return; }
      var sa = snaps[a], sb = snaps[b];
      if (!sa || !sb) { cmpBox.appendChild(callout('warn', 'No snapshot for ' + (!sa ? a : b), 'The ring\'s list carries names only. This browser keeps a copy of the configuration whenever you save or load here; load that calibration once and it will be available to compare.')); return; }
      var fa = {}, fb = {}; ['sensors', 'hand', 'plane'].forEach(function (k) { flatten(sa.cfg[k] || {}, k, fa); flatten(sb.cfg[k] || {}, k, fb); });
      var keys = Object.keys(Object.assign({}, fa, fb)).filter(function (k) { return JSON.stringify(fa[k]) !== JSON.stringify(fb[k]); }).sort();
      var fmt = function (k, v) { if (v == null) return '–'; if (typeof v === 'number') return /\.(x|y|z|off|w|d|zmin|zmax|zwork|stillThr)$/.test(k) ? fmtLen(v, 1) : String(U.round(v, 2)); return String(v); };
      var tb = h('tbody'); keys.forEach(function (k) { tb.appendChild(h('tr', h('td.mono.small', k), h('td.num', fmt(k, fa[k])), h('td.num', fmt(k, fb[k])))); });
      cmpBox.appendChild(h('table.t.compact', h('thead', h('tr', h('th', keys.length ? keys.length + ' differences' : 'No differences in sensors, hand or plane'), h('th', a), h('th', b))), tb, h('tfoot', h('tr', h('td.small.dim', 'Saved'), h('td.small.dim', sa.when), h('td.small.dim', sb.when)), h('tr', h('td.small.dim', 'Latest accuracy run'), h('td.small', runText(latestRun(a))), h('td.small', runText(latestRun(b)))))));
    }
    selA.addEventListener('change', renderCompare); selB.addEventListener('change', renderCompare);
    stu.body.appendChild(h('div.card', h('div.row.between.wrap.top', h('div.grow', h('h2', 'Save this calibration'), h('div.sub', 'Stores the whole configuration on the ring under a name, with the date and your notes. Save after C11 passes.')), h('div.row', btn('Export file', exportCfg, 'sm'), btn('Import file', importCfg, 'sm'))),
      h('div.grid.c2.mt', field('Name', nameIn), h('div.field', h('label', 'Notes'), notesIn)), h('div.row.end.mt', btn('Save', save, 'primary'))));
    stu.body.appendChild(h('div.card', h('div.row.between.wrap', h('h2', 'Saved on the ring'), btn('Refresh', function () { send({ c: 'list' }); }, 'sm ghost')), listBox));
    stu.body.appendChild(h('div.card', h('h2', 'Compare two'), h('div.sub', 'Differences in sensors, hand and plane, side by side, with each one\'s latest accuracy run.'), h('div.grid.c2.mt', field('First', selA), field('Second', selB)), cmpBox));
    renderList(); send({ c: 'list' });
    return {
      onCals: renderList, onStatus: renderList,
      onCfg: function () { if (st.pendingSnap) { snapNow(st.pendingSnap); st.pendingSnap = null; renderList(); } }
    };
  };

  // ---- C14 · diagnostics and guided fixes ---------------------------------------------------------------------------------------------------
  P.c14 = function (stu) {
    var finder = h('div.card'); stu.body.appendChild(finder);
    finder.appendChild(h('div.row.between.wrap.top', h('div.grow', h('h2', 'Diagnostics'), h('div.sub', 'Every failed check in the studio shows its code from the troubleshooting guide: what is wrong, the likely causes, the fix and a Test again button. The symptom finder covers what only a person can see.')), btn('Export a diagnostics file', exportDiag, 'primary')));
    var finderHost = h('div.mt'); finder.appendChild(finderHost); RS.symptomFinder(finderHost);
    var fam = {}, order = []; Object.keys(RS.FIXES || {}).forEach(function (c) { var f = RS.FIXES[c].family || 'Other'; if (!fam[f]) { fam[f] = []; order.push(f); } fam[f].push(c); });
    var famBox = h('div.col.gap-s.mt');
    order.forEach(function (f) { famBox.appendChild(h('div.row.between.wrap.check', h('strong', { style: { minWidth: '200px' } }, f), h('span.row.wrap.gap-s', fam[f].map(function (c) { return fixChip(c); })))); });
    stu.body.appendChild(h('div.card', h('h2', 'All fix codes'), h('div.sub', 'Click a code for its guide entry. Auto codes are raised by the studio; Symptom codes are things you notice.'), famBox));
    if (RS.TECHNIQUES) stu.body.appendChild(h('div.card', h('h2', 'Techniques'), h('div.sub', 'The general methods the fixes refer to.'), h('div.mt', { style: { fontSize: '13px' } }, RS.md(RS.TECHNIQUES))));
    function exportDiag() {
      var out = { kind: 'ring-diagnostics', when: new Date().toISOString(), ui: RS.VERSION, link: L.mode, fw: L.info.fw, status: S.status(), cfg: S.cfg(), health: S.health(), cal: L.latest.cal, frames: stu.frames.slice(), events: stu.events.slice(), progress: progress,
        results: { c0: stu.st.c0 && stu.st.c0.cal, c6: stu.st.c6 && stu.st.c6.result, c7: stu.st.c7 && stu.st.c7.result, c8: stu.st.c8 && stu.st.c8.result, c11: stu.st.c11 && stu.st.c11.run && { trials: stu.st.c11.run.trials, passed: stu.st.c11.run.passed, codes: stu.st.c11.run.codes } },
        accuracy: (RS.rec.accuracy || []).slice(-5), faults: L.sim ? Object.keys(L.sim.faults || {}) : undefined };
      U.download('ring-diagnostics-' + U.fileStamp() + '.json', JSON.stringify(out)); RS.app.toast('Diagnostics file exported. Send it with a description of what you see.', 'ok', 5000);
    }
    return {};
  };

  // ---- the screen ------------------------------------------------------------------------------------------------------------------------------
  var STU = RS.screens.studio = { title: 'Calibration studio', st: {} };
  STU.mount = function (host) {
    var self = this; this.host = host; this.st = this.st || {}; this.frames = []; this.events = []; this.healthHist = []; this.statusAt = U.now();
    var root = h('div.studio'); host.appendChild(root);
    this.stepsEl = h('div.steps', { role: 'tablist' }); this.main = h('div.main'); root.appendChild(this.stepsEl); root.appendChild(this.main);
    this.unsub = [
      L.on('cal', function (cal) { self.onCal(cal); }),
      L.on('cfg', function () { if (self.panel && self.panel.onCfg) self.panel.onCfg(); }),
      L.on('status', function () { self.statusAt = U.now(); self.refreshHeader(); if (self.panel && self.panel.onStatus) self.panel.onStatus(); }),
      L.on('health', function (hh) { self.healthHist.push({ t: U.now(), h: hh }); while (self.healthHist.length > 2 && U.now() - self.healthHist[0].t > 90000) self.healthHist.shift(); if (self.panel && self.panel.onHealth) self.panel.onHealth(hh); }),
      L.on('frame', function (f) { if (!f.g) { self.frames.push(f); if (self.frames.length > 200) self.frames.shift(); } if (self.panel && self.panel.onFrame) self.panel.onFrame(f); }),
      L.on('event', function (e) { if (!e.g) { self.events.push(e); if (self.events.length > 60) self.events.shift(); } if (self.panel && self.panel.onEvent) self.panel.onEvent(e); }),
      L.on('cals', function (c) { if (self.panel && self.panel.onCals) self.panel.onCals(c); }),
      L.on('mode', function () { if (self.host) self.select(self.cur, true); }),
      S.on('change:lenUnit', function () { if (self.host) self.select(self.cur, true); }),
      S.on('change:unit', function () { if (self.panel && self.panel.onCfg) self.panel.onCfg(); })
    ];
    var m = /^#\/studio\/(c\d{1,2})/.exec((typeof location !== 'undefined' && location.hash) || ''), wanted = m ? m[1] : U.store.get('studio.step', 'c0');
    this.select(STEPS.some(function (s) { return s.id === wanted; }) ? wanted : 'c0', true);
    send({ c: 'get', what: 'cal' });
  };
  STU.onHash = function (hash) { var m = /^#\/studio\/(c\d{1,2})/.exec(hash || ''); if (m && this.host && STEPS.some(function (s) { return s.id === m[1]; }) && m[1] !== this.cur) this.select(m[1], true); };
  STU.unmount = function () {
    (this.unsub || []).forEach(function (u) { u(); }); this.unsub = [];
    if (this.panel && this.panel.destroy) { try { this.panel.destroy(); } catch (e) { /* ignore */ } }
    this.panel = null; simHand(null); this.host = null; this.header = null; this.stepsEl = null; this.main = null;
  };
  STU.tick = function (now) { if (this.panel && this.panel.tick) { try { this.panel.tick(now); } catch (e) { console.error('[studio] tick failed', e); this.panel.tick = null; } } };
  STU.onCal = function (cal) {
    if (!cal) return;
    // A real ring sends the raw samples and leaves the fit to the browser (docs/10-protocol.md); the simulator
    // already includes the result. Compute it here when missing so every panel sees the same shape.
    if (cal.state === 'done' && !cal.result && cal.samples) {
      try {
        if (cal.step === 'c7') { cal.result = RS.fit.wandFit(cal.samples, S.cfg()); if (cal.result && cal.result.staticSpread != null) this.staticSpread = cal.result.staticSpread; }
        else if (cal.step === 'c8') cal.result = RS.fit.handProfile(cal.samples, cal.still || [], S.cfg(), this.staticSpread);
      } catch (e) { console.error('[studio] fit failed', e); }
    }
    if (cal.step) { var s = this.st[cal.step] || (this.st[cal.step] = {}); s.cal = cal; this.calStep = cal.step; }
    else if (this.calStep && this.st[this.calStep]) this.st[this.calStep].cal = null;
    if (this.panel && this.panel.onCal) this.panel.onCal(cal);
  };
  STU.select = function (id, force) {
    if (!this.host) return;
    if (!force && this.cur === id && this.panel) return;
    var self = this; if (this.panel && this.panel.destroy) { try { this.panel.destroy(); } catch (e) { /* ignore */ } }
    this.cur = id; U.store.set('studio.step', id);
    U.empty(this.main); this.header = h('div.row.between.wrap.top.mb'); this.main.appendChild(this.header); this.refreshHeader();
    this.body = h('div.col.gap-l'); this.main.appendChild(this.body);
    try { this.panel = P[id](this) || {}; } catch (e) { console.error('[studio] panel ' + id + ' failed', e); this.body.appendChild(callout('bad', 'This step failed to render', String(e && e.message || e))); this.panel = {}; }
    var idx = -1; STEPS.forEach(function (s, i) { if (s.id === id) idx = i; });
    var prev = STEPS[idx - 1], next = STEPS[idx + 1];
    this.main.appendChild(h('div.row.between.wrap.mt-l', prev ? btn('Back: ' + prev.label, function () { self.select(prev.id); }, 'ghost') : h('span'), next ? btn('Next: ' + next.label, function () { self.select(next.id); }) : h('span')));
    this.refreshSteps(); this.main.scrollTop = 0;
  };
  STU.refreshHeader = function () {
    if (!this.header) return; var step = stepById(this.cur), stt = S.status() || {}, cal = stt.cal || {};
    U.empty(this.header);
    this.header.appendChild(h('div', h('div', { style: { fontSize: '22px', fontWeight: '600', letterSpacing: '-0.02em' } }, step.n + ' · ' + step.label), h('div.sub', step.hint)));
    this.header.appendChild(h('div.row.wrap', cal.saved ? chip('Saved: ' + (cal.name || '') + (cal.when ? ' · ' + cal.when : ''), 'ok') : chip('Draft calibration · not saved', 'warn'), h('a.btn.sm', { href: '#/operator' }, 'Back to live view')));
  };
  STU.refreshSteps = function () {
    if (!this.stepsEl) return; var self = this; U.empty(this.stepsEl);
    this.stepsEl.appendChild(h('div.eyebrow', { style: { padding: '0 10px 10px' } }, 'Calibration · ' + STEPS.length + ' steps'));
    STEPS.forEach(function (s) {
      var p = progress[s.id];
      self.stepsEl.appendChild(h('div.step' + (self.cur === s.id ? '.on' : '') + (p === 'done' ? '.done' : p === 'fail' ? '.fail' : ''), { role: 'tab', tabindex: '0', onclick: function () { self.select(s.id); }, onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); self.select(s.id); } } },
        h('span.n', p === 'done' ? '✓' : p === 'fail' ? '!' : s.n), h('div.grow', h('div.l', s.label), h('div.h', s.hint))));
    });
  };
})();
