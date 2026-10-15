/* Ring Studio · recorder (F11), usage history (F15), accuracy results (F16), test results (F26).
   Everything lives in the browser's storage and is exported to files straight away (spec 6, data storage). */
var RS = globalThis.RS || (globalThis.RS = {});
(function () {
  'use strict';
  var U = RS.util, L = RS.link;
  var R = RS.rec = new U.Emitter();
  var MAX_SESSIONS = 40, MAX_FRAMES = 6000;   // ~4.5 minutes of frames per session

  R.sessions = U.store.get('rec.sessions', []);      // [{id, name, when, frames:[], events:[], cfg, fw, ms, used, savedOff, savedFlow, fns:[], notes, ghost:false}]
  R.history = U.store.get('rec.history', []);        // per-session summaries, kept longer than raw sessions
  R.accuracy = U.store.get('rec.accuracy', []);      // F16 runs: {id, when, layout, trials:[{zone, got, ms, ok}], cal}
  R.tests = U.store.get('rec.tests', {});            // F26: {T5: {result:'pass'|'fail', note, when}}
  R.heat = U.store.get('rec.heat', {});              // F24: per layout, 46 x 42 counts of latched-hand positions
  R.current = null; R.armed = true; R.replaying = false;

  function save(key, val) { U.store.set(key, val); }
  function trimSessions() {
    while (R.sessions.length > MAX_SESSIONS) R.sessions.shift();
    try { save('rec.sessions', R.sessions); } catch (e) { R.sessions.splice(0, Math.ceil(R.sessions.length / 2)); save('rec.sessions', R.sessions); }
  }

  // Frames and events flow in from the link. Ghost frames (f.g) are never recorded and never count.
  L.on('frame', function (f) {
    if (f.g || L.mode === 'replay') return;
    if (R.current) { if (R.current.frames.length < MAX_FRAMES) R.current.frames.push(f); if (f.hx != null && f.fn) heat(f); }
  });
  L.on('event', function (e) {
    if (e.g || L.mode === 'replay') return;
    if (e.ev === 'session' && e.a === 'start') {
      R.current = { id: U.uuid(), kind: 'ring-session', proto: RS.PROTO, fw: L.info.fw, when: new Date().toISOString(), name: 'Session ' + U.stamp(), cfg: L.latest.cfg ? U.deepClone(L.latest.cfg) : null, layout: L.latest.cfg ? L.latest.cfg.layout : null, frames: [], events: [e], fns: [], notes: '', ghost: false };
      R.emit('start', R.current); return;
    }
    if (!R.current) return;
    R.current.events.push(e);
    if (e.ev === 'latch') R.current.fns.push(e.fn); if (e.ev === 'soap') R.current.fns.push('soap'); if (e.ev === 'disp' && e.a === 'start') R.current.fns.push('disposal');
    if (e.ev === 'latch' && e.lat != null) R.current.lat = e.lat;
    if (e.ev === 'session' && e.a === 'end') {
      var s = R.current; R.current = null;
      s.ms = e.ms; s.used = e.used; s.savedOff = e.savedOff; s.savedFlow = e.savedFlow;
      if (s.frames.length < 4) return;                        // nothing worth keeping
      R.sessions.push(s); trimSessions();
      R.history.push({ id: s.id, when: s.when, layout: s.layout, ms: s.ms, used: s.used, savedOff: s.savedOff, savedFlow: s.savedFlow, fns: s.fns, lat: s.lat, falseOff: s.events.filter(function (x) { return x.ev === 'falseoff'; }).length, offWhy: (s.events.filter(function (x) { return x.ev === 'off'; }).pop() || {}).why });
      while (R.history.length > 2000) R.history.shift(); save('rec.history', R.history);
      R.emit('session', s);
    }
  });
  function heat(f) {
    var lay = L.latest.cfg ? L.latest.cfg.layout : 'kitchen', cfg = L.latest.cfg || RS.DEFAULTS;
    var H = R.heat[lay] || (R.heat[lay] = { nx: 46, ny: 42, n: 0, cells: new Array(46 * 42).fill(0) });
    var i = U.clamp(Math.floor(f.hx / cfg.plane.w * H.nx), 0, H.nx - 1), j = U.clamp(Math.floor(f.hy / cfg.plane.d * H.ny), 0, H.ny - 1);
    H.cells[j * H.nx + i] += 1; H.n += 1;
    if (H.n % 50 === 0) save('rec.heat', R.heat);
  }

  // ---- files -----------------------------------------------------------------------------------------------------------------------
  R.exportSession = function (s) { U.download('ring-session-' + U.fileStamp(new Date(s.when)) + '.json', JSON.stringify(s)); };
  R.exportAll = function () { U.download('ring-sessions-' + U.fileStamp() + '.json', JSON.stringify({ kind: 'ring-sessions', sessions: R.sessions })); };
  R.importText = function (text) {
    var o = JSON.parse(text), list = o.kind === 'ring-sessions' ? o.sessions : [o];
    list.forEach(function (s) { if (s.kind !== 'ring-session' || !s.frames) throw new Error('not a ring session file'); s.id = s.id || U.uuid(); if (!R.sessions.some(function (x) { return x.id === s.id; })) R.sessions.push(s); });
    trimSessions(); R.emit('change'); return list.length;
  };
  R.deleteSession = function (id) { R.sessions = R.sessions.filter(function (s) { return s.id !== id; }); save('rec.sessions', R.sessions); R.emit('change'); };
  R.renameSession = function (id, name, notes) { R.sessions.forEach(function (s) { if (s.id === id) { s.name = name; if (notes != null) s.notes = notes; } }); save('rec.sessions', R.sessions); R.emit('change'); };
  R.historyCsv = function () {
    var rows = [['when', 'layout', 'duration_s', 'used_ml', 'saved_off_ml', 'saved_flow_ml', 'functions', 'latency_ms', 'false_off', 'off_reason']];
    R.history.forEach(function (h) { rows.push([h.when, h.layout, (h.ms / 1000).toFixed(1), Math.round(h.used), Math.round(h.savedOff), Math.round(h.savedFlow), (h.fns || []).join('+'), h.lat == null ? '' : h.lat, h.falseOff, h.offWhy || '']); });
    return U.toCsv(rows);
  };
  R.clearHistory = function () { R.history = []; save('rec.history', R.history); R.heat = {}; save('rec.heat', R.heat); R.emit('change'); };

  // Explicit raw radar capture for bench work. Unlike session recording this also works with an empty sink,
  // so background/multipath/hostile-object evidence can be saved before any tuning decision is made.
  R.captureEcho = function (seconds, label) {
    seconds = U.clamp(+seconds || 10, 1, 60); var frames = [], started = new Date().toISOString();
    return new Promise(function (resolve) {
      var off = L.on('frame', function (f) { if (!f.g && L.mode !== 'replay') frames.push(U.deepClone(f)); });
      setTimeout(function () {
        off(); var out = { kind: 'ring-echo-capture', proto: RS.PROTO, fw: L.info.fw, when: started, label: label || 'echo capture', seconds: seconds, cfg: L.latest.cfg ? U.deepClone(L.latest.cfg) : null, health: L.latest.health ? U.deepClone(L.latest.health) : null, frames: frames };
        U.download('ring-echo-' + U.fileStamp() + '.json', JSON.stringify(out), 'application/json'); resolve(out);
      }, seconds * 1000);
    });
  };

  // ---- accuracy runs (F16) ---------------------------------------------------------------------------------------------------------------
  R.saveAccuracy = function (run) { R.accuracy.push(run); while (R.accuracy.length > 50) R.accuracy.shift(); save('rec.accuracy', R.accuracy); R.emit('change'); };
  R.accuracyCsv = function (run) {
    var rows = [['trial', 'prompted_zone', 'prompted_fn', 'latched_zone', 'latched_fn', 'response_ms', 'ok', 'false_off']];
    run.trials.forEach(function (t, i) { rows.push([i + 1, t.zone, t.fn, t.got || '', t.gotFn || '', t.ms == null ? '' : t.ms, t.ok ? 1 : 0, t.falseOff ? 1 : 0]); });
    return U.toCsv(rows);
  };
  R.confusion = function (run) {
    var zones = RS.geo.zones(run.layout, run.layouts || RS.LAYOUTS), idx = {}, n = zones.length, M = [];
    zones.forEach(function (z, i) { idx[z.id] = i; M.push(new Array(n + 1).fill(0)); });   // last column: no latch
    run.trials.forEach(function (t) { var r = idx[t.zone]; if (r == null) return; var c = t.got != null && idx[t.got] != null ? idx[t.got] : n; M[r][c] += 1; });
    return { zones: zones, M: M };
  };

  // ---- test runner results (F26) ---------------------------------------------------------------------------------------------------------
  R.setTest = function (id, result, note) { R.tests[id] = { result: result, note: note || '', when: new Date().toISOString(), fw: L.info.fw }; save('rec.tests', R.tests); R.emit('change'); };
  R.exportTests = function (catalog) {
    var rows = [['test', 'phase', 'title', 'result', 'note', 'when', 'fw']];
    (catalog || []).forEach(function (t) { var r = R.tests[t.id] || {}; rows.push([t.id, t.phase, t.title, r.result || '', r.note || '', r.when || '', r.fw || '']); });
    U.download('ring-tests-' + U.fileStamp() + '.csv', U.toCsv(rows), 'text/csv');
    U.download('ring-tests-' + U.fileStamp() + '.json', JSON.stringify({ kind: 'ring-tests', when: new Date().toISOString(), fw: L.info.fw, results: R.tests }));
  };
})();
