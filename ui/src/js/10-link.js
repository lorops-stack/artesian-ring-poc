/* Ring Studio · the link to the ring: WebSocket (ESP32), USB serial (laptop copy), replay, or the built-in
   simulator. Every source produces the same protocol messages (docs/10-protocol.md). */
var RS = globalThis.RS || (globalThis.RS = {});
(function () {
  'use strict';
  var U = RS.util;
  var L = RS.link = new U.Emitter();
  L.mode = 'sim'; L.connected = false; L.pending = {}; L.nextId = 1; L.info = { fw: null, sim: true };
  L.latest = { frame: null, status: null, cfg: null, health: null, cal: null, cals: [] };
  L.sim = null; L.ws = null; L.serial = null; L.replay = null; L.autoTried = false;

  // ---- dispatch a device message to typed events -------------------------------------------------------------------
  L.handle = function (m) {
    if (!m || typeof m !== 'object') return;
    L.emit('msg', m);
    if (m.f) { L.latest.frame = m.f; L.emit('frame', m.f); }
    else if (m.ev) L.emit('event', m);
    else if (m.status) { L.latest.status = m.status; L.info.fw = m.status.fw; L.info.sim = !!m.status.sim; L.emit('status', m.status); }
    else if (m.cfg) { L.latest.cfg = m.cfg; L.emit('cfg', m.cfg); }
    else if (m.health) { L.latest.health = m.health; L.emit('health', m.health); }
    else if (m.cal) { L.latest.cal = m.cal; L.emit('cal', m.cal); }
    else if (m.cals) { L.latest.cals = m.cals; L.emit('cals', m.cals); }
    else if (m.led) L.emit('led', m.led);
    else if (m.ack) { var p = L.pending[m.ack.id]; if (p) { delete L.pending[m.ack.id]; p.res(m.ack); } L.emit('ack', m.ack); }
    else if (m.err) { var q = L.pending[m.err.id]; if (q) { delete L.pending[m.err.id]; q.rej(new Error(m.err.msg || 'error')); } L.emit('err', m.err); }
  };

  // ---- commands ---------------------------------------------------------------------------------------------------------
  L.send = function (cmd) {
    var c = Object.assign({}, cmd, { id: L.nextId++ });
    var prom = new Promise(function (res, rej) {
      L.pending[c.id] = { res: res, rej: rej, t: U.now() };
      setTimeout(function () { if (L.pending[c.id]) { delete L.pending[c.id]; rej(new Error('no reply to ' + c.c)); } }, 6000);
    });
    prom.catch(function () { /* callers may ignore */ });
    if (L.mode === 'sim' || L.mode === 'replay') { if (L.sim) setTimeout(function () { L.sim.cmd(c); }, 0); }
    else if (L.mode === 'ws' && L.ws && L.ws.readyState === 1) L.ws.send(JSON.stringify(c));
    else if (L.mode === 'serial' && L.serialWriter) L.serialWriter.write(new TextEncoder().encode(JSON.stringify(c) + '\n'));
    else { delete L.pending[c.id]; return Promise.reject(new Error('not connected')); }
    return prom;
  };
  L.set = function (path, value) { var o = {}; o[path] = value; return L.send({ c: 'cfg', set: o }); };
  L.setMany = function (obj) { return L.send({ c: 'cfg', set: obj }); };

  // ---- the simulator as a source ------------------------------------------------------------------------------------------
  L.ensureSim = function () {
    if (L.sim) return L.sim;
    L.sim = new RS.Sim(RS.DEFAULTS);
    L.sim.out.on('msg', function (m) { if (L.mode === 'sim') L.handle(m); });
    return L.sim;
  };
  L.useSim = function (reason) {
    L.closeWs(); L.stopReplay();
    L.ensureSim(); L.mode = 'sim'; L.connected = true; L.info.sim = true; L.reason = reason || '';
    L.emit('mode', L.mode); L.emit('open', { mode: 'sim' });
    L.send({ c: 'hello', ui: RS.VERSION });
  };
  // Called from the animation loop. Drives the simulator clock when it is the source.
  L.tick = function (now) { if (L.mode === 'sim' && L.sim) L.sim.tick(now); };

  // ---- WebSocket to the ESP32 ------------------------------------------------------------------------------------------------
  L.connectWs = function (host, opts) {
    opts = opts || {};
    L.stopReplay();
    var url = host ? ('ws://' + host.replace(/^ws:\/\//, '').replace(/\/$/, '') + (host.indexOf('/ws') >= 0 ? '' : '/ws')) : ('ws://' + location.host + '/ws');
    L.closeWs(); L.wsHost = url; L.wsWanted = true;
    var ws; try { ws = new WebSocket(url); } catch (e) { L.emit('err', { msg: 'WebSocket failed: ' + e.message }); if (opts.fallback) L.useSim('no ring found'); return; }
    L.ws = ws; L.mode = 'ws'; L.connected = false; L.emit('mode', L.mode);
    var opened = false, timer = setTimeout(function () { if (!opened) { try { ws.close(); } catch (e) { /* ignore */ } if (opts.fallback) L.useSim('no ring found at ' + url); } }, opts.timeout || 3000);
    ws.onopen = function () { opened = true; clearTimeout(timer); L.connected = true; L.info.sim = false; L.retry = 0; L.emit('open', { mode: 'ws', url: url }); L.send({ c: 'hello', ui: RS.VERSION }); };
    ws.onmessage = function (e) { var lines = String(e.data).split('\n'); for (var i = 0; i < lines.length; i++) { if (!lines[i]) continue; try { L.handle(JSON.parse(lines[i])); } catch (err) { console.warn('bad message', lines[i].slice(0, 80)); } } };
    ws.onclose = function () {
      var was = L.connected; L.connected = false; if (L.ws === ws) L.ws = null;
      if (was) L.emit('close', { mode: 'ws' });
      if (L.wsWanted && L.mode === 'ws') { L.retry = Math.min(10, (L.retry || 0) + 1); setTimeout(function () { if (L.wsWanted && L.mode === 'ws' && !L.ws) L.connectWs(host, { timeout: 4000 }); }, 800 * L.retry); }
    };
    ws.onerror = function () { /* onclose follows */ };
  };
  L.closeWs = function () { L.wsWanted = false; if (L.ws) { try { L.ws.onclose = null; L.ws.close(); } catch (e) { /* ignore */ } L.ws = null; } };

  // ---- Web Serial (laptop copy over USB) ----------------------------------------------------------------------------------------
  L.serialSupported = function () { return typeof navigator !== 'undefined' && !!navigator.serial; };
  L.connectSerial = async function () {
    if (!L.serialSupported()) throw new Error('Web Serial is not available in this browser (use Chrome or Edge from http://localhost)');
    L.closeWs(); L.stopReplay();
    var port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });
    L.serial = port; L.mode = 'serial'; L.connected = true; L.info.sim = false; L.emit('mode', L.mode); L.emit('open', { mode: 'serial' });
    L.serialWriter = port.writable.getWriter();
    var reader = port.readable.getReader(), dec = new TextDecoder(), buf = '';
    L.send({ c: 'hello', ui: RS.VERSION });
    (async function () {
      try {
        for (;;) { var r = await reader.read(); if (r.done) break; buf += dec.decode(r.value, { stream: true }); var idx; while ((idx = buf.indexOf('\n')) >= 0) { var line = buf.slice(0, idx).trim(); buf = buf.slice(idx + 1); if (line[0] === '{') { try { L.handle(JSON.parse(line)); } catch (e) { /* log line */ L.emit('log', line); } } else if (line) L.emit('log', line); } }
      } catch (e) { L.emit('err', { msg: 'serial: ' + e.message }); }
      L.connected = false; L.emit('close', { mode: 'serial' }); try { reader.releaseLock(); } catch (e) { /* ignore */ }
    })();
  };
  L.disconnectSerial = async function () { try { if (L.serialWriter) { L.serialWriter.releaseLock(); L.serialWriter = null; } if (L.serial) await L.serial.close(); } catch (e) { /* ignore */ } L.serial = null; };

  // ---- Replay of a recorded session ---------------------------------------------------------------------------------------------
  L.playReplay = function (session, opts) {
    opts = opts || {}; L.stopReplay(); L.closeWs();
    L.ensureSim(); L.mode = 'replay'; L.connected = true; L.info.sim = true; L.emit('mode', L.mode);
    if (session.cfg) L.handle({ cfg: session.cfg });
    var items = [];
    (session.frames || []).forEach(function (f) { items.push({ t: f.t, m: { f: f } }); });
    (session.events || []).forEach(function (e) { items.push({ t: e.t, m: e }); });
    items.sort(function (a, b) { return a.t - b.t; });
    var i = 0, t0 = items.length ? items[0].t : 0, start = U.now(), speed = opts.speed || 1;
    L.replay = { session: session, items: items, i: 0, paused: false, speed: speed, start: start, t0: t0, total: items.length ? items[items.length - 1].t - t0 : 0 };
    L.emit('open', { mode: 'replay' });
    var step = function () {
      var R = L.replay; if (!R) return;
      if (!R.paused) {
        var el = (U.now() - R.start) * R.speed;
        while (R.i < R.items.length && R.items[R.i].t - R.t0 <= el) { L.handle(R.items[R.i].m); R.i += 1; }
        R.pos = el;
        if (R.i >= R.items.length) { if (opts.loop) { R.i = 0; R.start = U.now(); } else { L.emit('replayEnd', {}); } }
      }
      R.timer = setTimeout(step, 20);
    };
    step();
  };
  L.stopReplay = function () { if (L.replay) { clearTimeout(L.replay.timer); L.replay = null; L.emit('replayEnd', {}); } };
  L.replaySeek = function (frac) { var R = L.replay; if (!R) return; R.i = 0; R.start = U.now() - frac * R.total / R.speed; };

  // ---- automatic start: a ring if the page came from one, otherwise the simulator ------------------------------------------------
  L.autoStart = function () {
    if (L.autoTried) return; L.autoTried = true;
    var h = (typeof location !== 'undefined') ? location.hostname : '';
    var fromRing = (/^(\d+\.){3}\d+$/.test(h) && !/^127\./.test(h)) || /ring/i.test(h);   // an IP that is not loopback: the ESP32
    var remembered = U.store.get('link.host', null);
    // A page served by the ESP32 is a hardware session. If its WebSocket is temporarily unavailable,
    // stay in live mode and retry rather than silently substituting simulated data.
    if (fromRing) L.connectWs(location.host, { fallback: false, timeout: 3000 });
    else if (remembered && U.store.get('link.autoconnect', false)) L.connectWs(remembered, { fallback: true, timeout: 3000 });
    else L.useSim('laptop copy');
  };
  L.describe = function () {
    if (L.mode === 'sim') return { label: 'Simulation', sub: 'your cursor is the hand', live: false };
    if (L.mode === 'replay') return { label: 'Replay', sub: L.replay && L.replay.session.name || 'recorded session', live: false };
    if (L.mode === 'serial') return { label: L.connected ? 'USB link' : 'USB link lost', sub: 'Web Serial', live: L.connected };
    return { label: L.connected ? 'Live' : 'Connecting…', sub: L.connected ? 'radar tracking your hand' : (L.wsHost || ''), live: L.connected };
  };
})();
