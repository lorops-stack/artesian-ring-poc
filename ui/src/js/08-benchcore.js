/* Ring Studio · bench log core: capture a timestamped snapshot of how the rig is set up and how it behaved
   (sensor positions and aim, dead areas, sensor health, the last aim sweep), compare two snapshots, restore one, and
   turn one into plain text. No DOM, so it is unit-tested. */
var RS = globalThis.RS || (globalThis.RS = {});
(function () {
  'use strict';
  var BN = RS.bench = RS.bench || {};
  var MAX = 60;

  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function r1(v) { return v == null || isNaN(v) ? null : Math.round(v * 10) / 10; }
  function pick(o, keys) { var out = {}; keys.forEach(function (k) { if (o && o[k] !== undefined) out[k] = clone(o[k]); }); return out; }

  // The settings that describe the rig, as dotted-path groups. Restore touches only these.
  BN.SENSOR_KEYS = ['x', 'y', 'z', 'yaw', 'tilt', 'off', 'on'];
  BN.TUNING_KEYS = ['rangeStart', 'rangeEnd', 'threshSens', 'i2cKhz'];

  function slimAim(a) {
    if (!a || !a.result) return null; var r = a.result;
    function one(x) { return x ? { yaw: r1(x.yaw), delta: r1(x.delta), quality: x.quality || null, half: r1(x.half) } : null; }
    return { when: a.when || null, n: r.n || 0, coverage: r1(r.coverage), A: one(r.A), B: one(r.B), base: r.base ? { status: r.base.status, msg: r.base.msg, lo: r1(r.base.lo), hi: r1(r.base.hi) } : null };
  }
  function slimHw(h) {
    if (!h) return null; var out = {};
    ['A', 'B'].forEach(function (k) { var s = h[k]; if (s) out[k] = pick(s, ['pres', 'cfg', 'sda', 'scl', 'ver', 'st', 'hz', 'er', 'alive', 'setups']); });
    out.rst = h.rst || null; return out;
  }

  // ctx: { cfg, health, status, aim: {when, result}, label, note, now: Date, mode, ui }
  BN.capture = function (ctx) {
    var c = ctx.cfg || {}, d = ctx.now || new Date(), s = c.sensors || {};
    return {
      kind: 'ring-bench', v: 1, id: 'b' + d.getTime().toString(36) + Math.floor(Math.random() * 1296).toString(36), when: d.toISOString(),
      label: (ctx.label || '').trim() || 'Snapshot', note: (ctx.note || '').trim(), fw: (ctx.status && ctx.status.fw) || null, mode: ctx.mode || null, ui: ctx.ui || null,
      setup: { plane: pick(c.plane, ['w', 'd']), sensors: { A: pick(s.A, BN.SENSOR_KEYS), B: pick(s.B, BN.SENSOR_KEYS) }, hand: pick(c.hand, ['zmin', 'zmax', 'zwork', 'strMin', 'strMax', 'stillThr']),
        rig: clone(c.rig || null), tuning: pick(c.tuning, BN.TUNING_KEYS), layout: c.layout || null },
      masks: clone(c.masks || {}), hw: slimHw(ctx.health), aim: slimAim(ctx.aim)
    };
  };

  function hwLevel(e) {
    if (!e.hw) return 'unknown'; var ok = true;
    ['A', 'B'].forEach(function (k) { var s = e.hw[k]; if (!s || !s.pres || !s.cfg || !s.alive) ok = false; });
    return ok ? 'ok' : 'fault';
  }
  BN.hwLevel = hwLevel;

  BN.maskCount = function (e) { return Object.keys(e.masks || {}).length; };
  BN.spacing = function (e) { var a = e.setup.sensors.A, b = e.setup.sensors.B; if (!a || !b) return null; return Math.round(Math.hypot(a.x - b.x, a.y - b.y)); };

  // One-line summary for the list
  BN.summary = function (e) {
    var a = e.setup.sensors.A || {}, b = e.setup.sensors.B || {}, sp = BN.spacing(e), parts = [];
    if (sp != null) parts.push('spacing ' + sp + ' mm');
    parts.push('A ' + Math.round(a.yaw) + '° · B ' + Math.round(b.yaw) + '°');
    parts.push(BN.maskCount(e) + ' dead area' + (BN.maskCount(e) === 1 ? '' : 's'));
    if (e.aim && e.aim.A && e.aim.B && e.aim.A.delta != null && e.aim.B.delta != null) parts.push('aim off A ' + sgn(e.aim.A.delta) + '° B ' + sgn(e.aim.B.delta) + '°'); else parts.push('no aim sweep');
    var l = hwLevel(e); parts.push(l === 'ok' ? 'sensors OK' : l === 'fault' ? 'sensor fault' : 'no sensor data');
    return parts.join(' · ');
  };
  function sgn(v) { return (v > 0 ? '+' : '') + Math.round(v); }

  // Flatten a setup into { 'sensors.A.yaw': 45, ... } for comparison and restore
  function flat(e) {
    var out = {}, s = e.setup;
    Object.keys(s.plane || {}).forEach(function (k) { out['plane.' + k] = s.plane[k]; });
    ['A', 'B'].forEach(function (id) { Object.keys(s.sensors[id] || {}).forEach(function (k) { out['sensors.' + id + '.' + k] = s.sensors[id][k]; }); });
    Object.keys(s.hand || {}).forEach(function (k) { out['hand.' + k] = s.hand[k]; });
    if (s.rig) Object.keys(s.rig).forEach(function (k) { out['rig.' + k] = s.rig[k]; });
    Object.keys(s.tuning || {}).forEach(function (k) { out['tuning.' + k] = s.tuning[k]; });
    return out;
  }
  BN.flat = flat;

  // What differs between two entries (a then b). Dead areas are compared by id and shape.
  BN.diff = function (a, b) {
    var fa = flat(a), fb = flat(b), out = [], keys = {}; Object.keys(fa).concat(Object.keys(fb)).forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).sort().forEach(function (k) { var x = fa[k], y = fb[k]; if (x !== y && !(typeof x === 'number' && typeof y === 'number' && Math.abs(x - y) < 0.05)) out.push({ path: k, a: x, b: y }); });
    var ma = a.masks || {}, mb = b.masks || {}, ids = {}; Object.keys(ma).concat(Object.keys(mb)).forEach(function (k) { ids[k] = 1; });
    Object.keys(ids).sort().forEach(function (id) { var x = ma[id], y = mb[id]; if (JSON.stringify(x) !== JSON.stringify(y)) out.push({ path: 'masks.' + id, a: x ? maskText(x) : 'none', b: y ? maskText(y) : 'none' }); });
    return out;
  };
  function maskText(m) { return m.t === 'circle' ? 'circle at ' + Math.round(m.x) + ',' + Math.round(m.y) + ' r ' + Math.round(m.r) : 'box at ' + Math.round(m.x) + ',' + Math.round(m.y) + ' ' + Math.round(m.w) + '×' + Math.round(m.h); }
  BN.maskText = maskText;

  // Settings to send with `cfg set` to put the ring back as it was in entry e. curMasks: the masks the ring has now.
  BN.restorePatch = function (e, curMasks) {
    var patch = flat(e), saved = e.masks || {};
    Object.keys(saved).forEach(function (id) { patch['masks.' + id] = clone(saved[id]); });
    Object.keys(curMasks || {}).forEach(function (id) { if (!saved[id]) patch['masks.' + id] = null; });
    return patch;
  };

  // Plain text, for pasting into a message
  BN.text = function (e) {
    var L = [], s = e.setup, a = s.sensors.A || {}, b = s.sensors.B || {};
    L.push('BENCH SNAPSHOT: ' + e.label + '  (' + e.when + ')');
    if (e.note) L.push('Note: ' + e.note);
    L.push('Firmware ' + (e.fw || '?') + ' · ' + (e.mode || '?') + ' · Ring Studio ' + (e.ui || '?'));
    L.push('Sink ' + Math.round(s.plane.w) + ' × ' + Math.round(s.plane.d) + ' mm · spacing A to B ' + BN.spacing(e) + ' mm');
    [['A', a], ['B', b]].forEach(function (p) { var k = p[1]; L.push('Sensor ' + p[0] + ': x ' + r1(k.x) + ' y ' + r1(k.y) + ' z ' + r1(k.z) + ' mm, yaw ' + r1(k.yaw) + '°, tilt ' + r1(k.tilt) + '°, range offset ' + r1(k.off) + ' mm, ' + (k.on === false ? 'OFF' : 'on')); });
    L.push('Hand: depth ' + r1(s.hand.zmin) + ' to ' + r1(s.hand.zmax) + ' mm, assumed ' + r1(s.hand.zwork) + ' mm, strength ' + s.hand.strMin + ' to ' + s.hand.strMax);
    if (s.rig) L.push('Slot: height ' + s.rig.slotH + ' mm, recess ' + s.rig.recess + ' mm, sink depth ' + s.rig.sinkDepth + ' mm, beam ' + s.rig.beamV + '°');
    L.push('Sensing range ' + s.tuning.rangeStart + ' to ' + s.tuning.rangeEnd + ' mm, sensitivity ' + s.tuning.threshSens + ', I2C ' + s.tuning.i2cKhz + ' kHz');
    var ids = Object.keys(e.masks || {}); L.push('Dead areas: ' + (ids.length ? ids.map(function (id) { return id + ' ' + maskText(e.masks[id]); }).join('; ') : 'none'));
    if (e.hw) ['A', 'B'].forEach(function (k) { var h = e.hw[k]; if (h) L.push('Sensor ' + k + ' health: ' + (h.pres ? 'answers' : 'NO ANSWER') + ', ' + (h.cfg ? 'configured' : 'NOT configured') + ', ' + (+h.hz).toFixed(1) + ' Hz, ' + (h.er || 0) + ' errors, lines ' + (h.sda && h.scl ? 'high' : 'LOW')); }); else L.push('Sensor health: no data');
    if (e.aim) { var ai = e.aim; L.push('Aim sweep (' + Math.round((ai.coverage || 0) * 100) + '% coverage, ' + ai.n + ' readings): A measured ' + (ai.A && ai.A.yaw != null ? ai.A.yaw + '° (off ' + sgn(ai.A.delta) + '°, ' + ai.A.quality + ')' : 'n/a') + ', B measured ' + (ai.B && ai.B.yaw != null ? ai.B.yaw + '° (off ' + sgn(ai.B.delta) + '°, ' + ai.B.quality + ')' : 'n/a') + '. Spacing check: ' + (ai.base ? ai.base.status + (ai.base.lo != null ? ' (readings allow ' + ai.base.lo + ' to ' + ai.base.hi + ' mm)' : '') : 'n/a')); }
    else L.push('Aim sweep: none run');
    return L.join('\n');
  };

  // Storage: newest first, capped
  BN.list = function () { var v = RS.util.store.get('bench', []); return Array.isArray(v) ? v : []; };
  BN.add = function (e) { var l = BN.list(); l.unshift(e); if (l.length > MAX) l.length = MAX; RS.util.store.set('bench', l); return l; };
  BN.remove = function (id) { var l = BN.list().filter(function (x) { return x.id !== id; }); RS.util.store.set('bench', l); return l; };
  BN.clear = function () { RS.util.store.set('bench', []); };
  // Accept a downloaded file: one entry, an array, or { entries: [...] }; skip anything already present or malformed
  BN.import = function (data) {
    var arr = Array.isArray(data) ? data : (data && Array.isArray(data.entries) ? data.entries : [data]), l = BN.list(), have = {}, added = 0, skipped = 0;
    l.forEach(function (x) { have[x.id] = 1; });
    arr.forEach(function (e) {
      if (!e || e.kind !== 'ring-bench' || !e.id || !e.setup || !e.setup.sensors || !e.setup.plane || have[e.id]) { skipped++; return; }
      l.push(e); have[e.id] = 1; added++;
    });
    l.sort(function (a, b) { return a.when < b.when ? 1 : -1; }); if (l.length > MAX) l.length = MAX; RS.util.store.set('bench', l);
    return { added: added, skipped: skipped };
  };
})();
