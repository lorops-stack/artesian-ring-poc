/* Ring Studio · Hardware check: is each sensor powered, wired, answering, configured and measuring?
   Reads the `health` message (1 per second) and shows, per sensor, the first thing that is wrong and what to touch.
   Logic is in 07-hwcore.js. A wave test confirms each sensor really sees a hand. */
var RS = globalThis.RS || (globalThis.RS = {});
(function () {
  'use strict';
  var U = RS.util, h = U.h, L = RS.link, S = RS.store, HW = RS.hw;
  var COL = { A: '#7FD0FF', B: '#FFB27A' };
  var st = null;

  function isSim() { return L.mode === 'sim' && !!L.sim; }
  function btn(label, fn, cls, attrs) { return h('button.btn' + (cls ? '.' + cls.trim().replace(/\s+/g, '.') : ''), Object.assign({ onclick: fn }, attrs || {}), label); }
  function lvlClass(l) { return l === 'ok' ? 'ok' : (l === 'bad' ? 'bad' : (l === 'warn' ? 'warn' : 'info')); }
  function stepRow(s) {
    var k = s.state === 'ok' ? 'ok' : (s.state === 'bad' ? 'bad' : (s.state === 'warn' ? 'run' : ''));
    var ic = s.state === 'ok' ? '✓' : (s.state === 'bad' ? '!' : (s.state === 'warn' ? '~' : '·'));
    return h('div.check' + (k ? '.' + k : ''), { style: s.state === 'wait' ? { opacity: 0.55 } : null }, h('span.ic', ic), h('div.grow', h('div', s.label), s.detail ? h('div.small.dim', s.detail) : null));
  }

  function sensorCard(key) {
    var el = { title: h('h2', 'Sensor ' + key), pins: h('div.sub.small.dim', ''), steps: h('div.col.gap-s.mt'), verdict: h('div.mt'), live: h('div.row.wrap.gap-s.mt-s.small') };
    var card = h('div.card', h('div.row.between.wrap', h('div', h('div.row.gap-s', h('span', { style: { color: COL[key], fontSize: '18px' } }, '●'), el.title), el.pins)), el.verdict, el.steps, el.live);
    return { key: key, card: card, el: el };
  }

  function waveRow(w, key) {
    var r = w[key]; if (!st.waveOn && !st.waveDone) return h('div.small.dim', 'Sensor ' + key + ': not tested');
    var txt = !r.seen ? 'no echoes seen' : ('nearest echo ' + r.near + ' mm, swung ' + r.swing + ' mm');
    var state = st.waveOn ? 'run' : (r.ok ? 'ok' : 'bad'), ic = st.waveOn ? '…' : (r.ok ? '✓' : '!');
    return h('div.check.' + state, h('span.ic', ic), h('div.grow', h('div', 'Sensor ' + key), h('div.small.dim', txt + (!st.waveOn && !r.ok ? (r.seen ? ' (move the hand closer and wave more)' : ' (nothing in view: wave 5 to 20 cm in front of it, or check the wiring)') : ''))));
  }

  function render() {
    if (!st) return;
    var hh = L.latest.health, status = L.latest.status, diags = {}, sys = HW.system(hh, status);
    ['A', 'B'].forEach(function (k) { diags[k] = HW.diagnose(k, hh && hh[k], { errRate: st.err[k].rate() }); });
    var worst = HW.overall([diags.A, diags.B], sys), allOk = worst === 'ok';
    var title = !hh ? 'Waiting for the ring' : (allOk ? 'Both sensors are good' : (worst === 'warn' ? 'Working, with a warning' : (worst === 'wait' ? 'Checking' : 'A wiring or setup fault needs fixing')));
    var sub = !hh ? 'No health message yet.' : (allOk ? 'Powered, answering, configured and measuring. Run the wave test, then go to Calibrate.' : 'The first failing step is shown on each sensor below.');
    U.empty(st.banner);
    st.banner.appendChild(h('div.callout.' + lvlClass(!hh ? 'wait' : worst), h('div.row.between.wrap.top', h('div.grow', h('strong', title), h('div.sub.mt-s', sub)),
      h('div.row.gap-s', st.recheck))));
    if (sys.length) sys.forEach(function (d) { st.banner.appendChild(h('div.callout.' + lvlClass(d.level) + '.mt-s', h('strong', d.title), h('div.sub.mt-s', d.text))); });
    ['A', 'B'].forEach(function (k) {
      var c = st.cards[k], d = diags[k], s = hh && hh[k];
      c.el.pins.textContent = 'SDA GPIO' + HW.PINS[k].sda + ' · SCL GPIO' + HW.PINS[k].scl + ' · RST GPIO' + HW.PINS[k].rst;
      U.empty(c.el.verdict); c.el.verdict.appendChild(h('div.callout.' + lvlClass(d.verdict.level), h('strong', d.verdict.title), h('div.sub.mt-s', d.verdict.text)));
      U.empty(c.el.steps); d.steps.forEach(function (x) { c.el.steps.appendChild(stepRow(x)); });
    });
    refreshLive(); refreshWave(); refreshRecheck();
  }

  function refreshLive() {
    if (!st) return; var hh = L.latest.health, f = L.latest.frame;
    ['A', 'B'].forEach(function (k) {
      var c = st.cards[k], s = hh && hh[k], fs = f && f[k]; U.empty(c.el.live); if (!s) return;
      var near = fs && fs.e && fs.e.length ? fs.e[0] : null;
      c.el.live.appendChild(h('span.chip', (s.hz != null ? (+s.hz).toFixed(1) : '-') + ' Hz'));
      c.el.live.appendChild(h('span.chip', 'errors ' + (s.er || 0)));
      c.el.live.appendChild(h('span.chip.info', near ? 'nearest echo ' + Math.round(near[0]) + ' mm · strength ' + Math.round(near[1]) : 'no echo now'));
      if (s.setups != null) c.el.live.appendChild(h('span.chip', 'set up ' + s.setups + '×'));
      if (s.stop) c.el.live.appendChild(h('span.chip', 'I2C: STOP mode'));
    });
  }
  function refreshWave() {
    if (!st) return; var w = st.wave.result(); U.empty(st.waveRows); st.waveRows.appendChild(waveRow(w, 'A')); st.waveRows.appendChild(waveRow(w, 'B'));
    st.waveBtn.textContent = st.waveOn ? 'Waving… ' + Math.max(0, Math.ceil((st.waveEnd - U.now()) / 1000)) + ' s' : (st.waveDone ? 'Run again' : 'Start wave test'); st.waveBtn.disabled = !!st.waveOn;
  }
  function refreshRecheck() {
    if (!st) return; var hh = L.latest.health, pending = st.recheckAt && (U.now() - st.recheckAt < 25000);
    if (pending && hh && hh.A && st.setupsAt && ((hh.A.setups || 0) > st.setupsAt.A && (hh.B.setups || 0) > st.setupsAt.B)) { pending = false; st.recheckAt = 0; }
    st.recheck.textContent = pending ? 'Re-checking… (about 10 s)' : 'Re-check sensors'; st.recheck.disabled = !!pending;
  }

  function startWave() {
    st.wave.reset(); st.waveOn = true; st.waveDone = false; st.waveEnd = U.now() + 8000; refreshWave();
    if (isSim()) L.sim.setHand({ x: 80, y: 40, h: 0 }, false);
  }
  function endWave() { st.waveOn = false; st.waveDone = true; if (isSim()) L.sim.setHand(null, false); refreshWave(); }

  var HWS = {
    title: 'Hardware check',
    mount: function (host) {
      st = { cards: { A: sensorCard('A'), B: sensorCard('B') }, err: { A: new HW.ErrRate(), B: new HW.ErrRate() }, wave: new HW.Wave(), waveOn: false, waveDone: false, waveEnd: 0, unsub: [], lastLive: 0, recheckAt: 0, setupsAt: null };
      st.banner = h('div'); st.recheck = btn('Re-check sensors', function () {
        var hh = L.latest.health; st.setupsAt = { A: (hh && hh.A && hh.A.setups) || 0, B: (hh && hh.B && hh.B.setups) || 0 }; st.recheckAt = U.now();
        L.send({ c: 'sensors', a: 'recheck' }).catch(function (e) { st.recheckAt = 0; RS.app.toast((e && e.message) || 'could not start the re-check', 'bad'); }); refreshRecheck();
      }, 'primary');
      st.waveBtn = btn('Start wave test', startWave, 'primary'); st.waveRows = h('div.col.gap-s.mt-s');
      var waveCard = h('div.card', h('div.row.between.wrap', h('div', h('h2', 'Wave test'), h('div.sub', 'Hold your hand 5 to 20 cm in front of one sensor and wave it slowly for 8 seconds. Do sensor A, press Run again, then sensor B. The nearest echo should swing by at least 40 mm.')), st.waveBtn), st.waveRows);
      var wrap = h('div.wrap', st.banner, h('div.grid.c2.mt', st.cards.A.card, st.cards.B.card), h('div.mt', waveCard));
      if (isSim()) {
        var chips = h('div.row.wrap.gap-s.mt-s');
        [['A_swapSdaScl', 'A: SDA/SCL swapped'], ['B_noPower', 'B: no power'], ['wrongFw', 'B: presence firmware'], ['statusErr', 'A: setup error'], ['A_loose', 'A: loose wire']].forEach(function (f) {
          var b = h('button.chip', { style: { cursor: 'pointer' } }, f[1]); b.onclick = function () { var on = !L.sim.faults[f[0]]; L.sim.setFault(f[0], on); b.className = 'chip' + (on ? ' info' : ''); L.send({ c: 'get', what: 'health' }).catch(function () { /* the next periodic message will do */ }); }; if (L.sim.faults[f[0]]) b.className = 'chip info'; chips.appendChild(b);
        });
        wrap.appendChild(h('div.card.mt', h('h2', 'Rehearse a fault'), h('div.sub', 'Simulator only. Switch a fault on to see what it looks like here, then switch it off.'), chips));
      }
      host.appendChild(h('div.scroll', wrap));
      st.unsub.push(L.on('health', function (hh) { var t = U.now(); if (hh.A) st.err.A.add(hh.A.er, t); if (hh.B) st.err.B.add(hh.B.er, t); render(); }));
      st.unsub.push(L.on('frame', function (f) { if (st.waveOn) st.wave.add(f); }));
      var hh0 = L.latest.health; if (hh0) { var t0 = U.now(); if (hh0.A) st.err.A.add(hh0.A.er, t0); if (hh0.B) st.err.B.add(hh0.B.er, t0); }
      L.send({ c: 'get', what: 'health' }).catch(function () { /* the periodic message will arrive */ });
      render();
    },
    unmount: function () { if (!st) return; if (st.waveOn && isSim()) L.sim.setHand(null, false); st.unsub.forEach(function (u) { try { u(); } catch (e) { /* ignore */ } }); st = null; },
    tick: function () {
      if (!st) return; var now = U.now();
      if (st.waveOn && now > st.waveEnd) endWave(); else if (st.waveOn) refreshWave();
      if (now - st.lastLive > 250) { st.lastLive = now; refreshLive(); }
    }
  };
  RS.screens.hw = HWS;
})();
