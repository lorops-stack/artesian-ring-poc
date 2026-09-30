/* Ring Studio · the simulator: a virtual rig that behaves like the ESP32 over the protocol.
   It owns "true" geometry (with hidden errors the calibration is meant to find), turns a hand position into
   echo lists for A and B, runs the same association, tracker and state machine the firmware runs, and answers
   the same commands (layout, clean, cfg, cal steps, LED tests). It also plays the ghost demo hand (F25). */
var RS = globalThis.RS || (globalThis.RS = {});
(function () {
  'use strict';
  var U = RS.util, G = RS.geo, ST = RS.ST, FLAG = RS.FLAG;

  var RATE_MS = 45;                 // ~22 frames per second per sensor pair
  var NOISE_MM = 3.0;               // 1σ range noise on a good echo
  var S0 = 4200, D0 = 300;          // hand echo strength at 300 mm

  function Sim(cfg) {
    this.out = new U.Emitter();
    this.cfg = U.deepClone(cfg || RS.DEFAULTS);
    this.rnd = U.rng(11);
    this.truth = {                   // hidden errors: what C7 is meant to discover
      A: { dx: 8, dy: -5, dz: 6, off: 18, yawErr: 0 }, B: { dx: -10, dy: 4, dz: -3, off: 24, yawErr: 0 },
      basin: { A: [[520, 380], [700, 220]], B: [[560, 340], [740, 240]] }   // stainless basin reflections (recorded by C6)
    };
    // Two kinds of background. `recorded` is the detector's recorded threshold (C6 capture of the empty sink):
    // echoes at those distances are suppressed inside the sensor. `bg` is the list of still objects learned by the
    // stillness rule, used by the association. A real device loads both from flash; the simulator starts as a rig
    // whose empty sink was captured at boot.
    this.recorded = { A: this.truth.basin.A.map(function (e) { return [e[0], e[1]]; }), B: this.truth.basin.B.map(function (e) { return [e[0], e[1]]; }) };
    this.bg = { A: [], B: [] };
    this.idleSince = 0; this.idleAcc = null;
    this.faults = {};
    this.sm = new RS.StateMachine(this.cfg);
    var self = this;
    this.sm.ev.on('event', function (e) { self.onEvent(e); });
    this.tracker = new G.Tracker();
    this.hand = null; this.ghost = false; this.t0 = null; this.t = 0; this.n = 0; this.lastTick = -1e9; this.prev = null;
    this.err = { A: 0, B: 0 }; this.fps = { A: 22, B: 22 }; this.lastStatus = -1e9; this.lastHealth = -1e9;
    this.cal = { step: null, state: 'idle' }; this.auth = true; this.setup = false; this.ledTest = null;
    this.savedCals = U.store.get('sim.cals', {}); this.uptime0 = U.now(); this.resetReason = 'POWERON';
    this.stillFlag = 0; this.trigNoHand = 0; this.frontEcho = 0; this.ghostEcho = 0;
  }

  // ---- inputs -----------------------------------------------------------------------------------------------
  // truth {x, y, h} in mm (h = depth below the ring) or null; ghost marks the demo hand (excluded from metrics)
  Sim.prototype.setHand = function (truth, ghost) { this.hand = truth; this.ghost = !!ghost; };
  Sim.prototype.setFault = function (name, on) { if (on) this.faults[name] = true; else delete this.faults[name]; this.out.emit('faults', Object.keys(this.faults)); };
  Sim.prototype.now = function () { return this.t; };

  // ---- physics ----------------------------------------------------------------------------------------------
  Sim.prototype.truePose = function (k) {
    var kk = this.faults.swapAB ? (k === 'A' ? 'B' : 'A') : k, typed = this.cfg.sensors[kk], tr = this.truth[kk];
    return { x: typed.x + tr.dx, y: typed.y + tr.dy, z: typed.z + tr.dz, yaw: typed.yaw + tr.yawErr + (this.faults.A_yaw30 && kk === 'A' ? -30 : 0), off: tr.off };
  };
  Sim.prototype.echoStrength = function (pose, x, y, h, d, kind) {
    var a = Math.atan2(y - pose.y, x - pose.x) - U.rad(pose.yaw); while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI;
    var half = U.rad(this.cfg.tuning.beamHalf || 60), beam = Math.exp(-0.7 * Math.pow(a / half, 2));
    var s = S0 * Math.pow(D0 / Math.max(80, d), 2) * beam * (kind === 'ball' ? 0.9 : 1) * (1 + 0.12 * this.rnd.gauss());
    return Math.max(0, s);
  };
  // Echo list for one sensor given an optional target {x,y,h,kind}
  Sim.prototype.echoes = function (k, target) {
    var f = this.faults, list = [], pose = this.truePose(k);
    if ((k === 'A' && f.A_swapSdaScl) || (k === 'B' && f.B_noPower)) { this.err[k] += 1; return null; }         // not found on the bus
    if (k === 'A' && f.A_loose && this.rnd() < 0.3) { this.err[k] += 1; return null; }
    var atten = (k === 'B' && f.B_foil) ? 0.02 : 1;
    var rec = this.recorded[k], self = this;
    // The recorded threshold: an echo near a recorded background distance must beat that background to show
    var passes = function (d, s) { for (var i = 0; i < rec.length; i++) if (Math.abs(rec[i][0] - d) <= 20) return s > rec[i][1] * (self.cfg.tuning.threshSens || 1) * 1.35; return s > 60 * (self.cfg.tuning.threshSens || 1); };
    var push = function (d, s) { if (d >= self.cfg.tuning.rangeStart && d <= self.cfg.tuning.rangeEnd && passes(d, s)) list.push([Math.round(d), Math.round(s)]); };
    if (target) {
      var d = G.range(pose, target.x, target.y, target.h) + pose.off + NOISE_MM * this.rnd.gauss();
      var s = this.echoStrength(pose, target.x, target.y, target.h, d, target.kind) * atten;
      push(d, s);
      if (f.multipath || this.rnd() < 0.04) { var g = d + 170 + 60 * this.rnd(); push(g, s * 0.22); if (g < this.cfg.tuning.rangeEnd) this.ghostEcho += 1; }
    }
    var basin = this.truth.basin[k];
    for (var i = 0; i < basin.length; i++) { var bd = basin[i][0] + (f.bgDrift && i === 0 ? 45 : 0) + 1.5 * this.rnd.gauss(); push(bd, basin[i][1] * (1 + 0.1 * this.rnd.gauss()) * atten); }
    if (f.cupInSink) push((k === 'A' ? 300 : 420) + 1.5 * this.rnd.gauss(), 1500 * atten);
    if (f.personFront) push((k === 'A' ? 640 : 610) + 8 * this.rnd.gauss(), 1900 * atten);
    list.sort(function (a, b) { return a[0] - b[0]; });
    return list.slice(0, 10);
  };

  // ---- the frame tick ----------------------------------------------------------------------------------------
  Sim.prototype.tick = function (nowMs) {
    if (this.t0 === null) this.t0 = nowMs;
    if (nowMs - this.lastTick < RATE_MS) return null;
    var late = this.lastTick > 0 ? (nowMs - this.lastTick) / RATE_MS : 1; this.lastTick = nowMs;
    var t = Math.round(nowMs - this.t0); this.t = t; this.n += 1;
    var cfg = this.cfg, hand = this.hand;
    var target = hand ? { x: hand.x, y: hand.y, h: hand.h == null ? cfg.hand.zwork : hand.h, kind: 'hand' } : null;
    var eA = this.echoes('A', target), eB = this.echoes('B', target);
    var fpsA = eA ? 1000 / RATE_MS / late : 0, fpsB = eB ? 1000 / RATE_MS / late : 0;
    this.fps.A = 0.9 * this.fps.A + 0.1 * fpsA; this.fps.B = 0.9 * this.fps.B + 0.1 * fpsB;
    var opts = { A: cfg.sensors.A, B: cfg.sensors.B, hand: cfg.hand, plane: cfg.plane, bg: this.bg, prev: this.prev, maxJump: 220 };
    var assoc = (eA && eB) ? G.associate(eA, eB, opts) : { flag: FLAG.NO_HAND };
    var pos = null, speed = 0;
    if (assoc.flag === FLAG.NONE) { this.miss = 0; var tr = this.tracker.update(assoc.x, assoc.y, t); pos = { x: tr.x, y: tr.y }; speed = tr.speed; this.prev = { x: assoc.x, y: assoc.y }; }
    else if (assoc.flag === FLAG.JUMP) { pos = this.prev; speed = this.tracker.x !== null ? U.hypot(this.tracker.vx, this.tracker.vy) : 0; }
    else { this.miss = (this.miss || 0) + 1; if (this.miss >= cfg.tuning.goneFrames) { this.tracker.reset(); this.prev = null; } }   // coast through a brief dropout
    if (this.faults.personFront && !hand && assoc.flag === FLAG.OUTSIDE) this.frontEcho += 1;
    var wasSession = this.sm.session;
    var snap = this.sm.step({ t: t, pos: pos, speed: speed, flag: assoc.flag });
    this.idleRelearn(t, eA, eB, snap);
    if (!wasSession && this.sm.session && !hand) this.trigNoHand += 1;
    var f = { t: t, n: this.n, st: snap.st, set: U.round(snap.set, 3), ex: U.round(snap.ex, 3), dsp: U.round(snap.dsp, 1), cup: Math.round(snap.cup), lk: snap.lk, flag: snap.flag, still: U.round(snap.still, 1), spd: Math.round(speed) };
    if (snap.fn) f.fn = snap.fn; if (snap.zn) f.zn = snap.zn;
    if (pos) { f.hx = U.round(pos.x, 1); f.hy = U.round(pos.y, 1); }
    if (snap.clean) f.cln = U.round(snap.clean, 1);
    f.A = { e: eA || [], hz: U.round(this.fps.A, 1), er: this.err.A }; f.B = { e: eB || [], hz: U.round(this.fps.B, 1), er: this.err.B };
    if (assoc.flag === FLAG.NONE) { f.A.p = assoc.iA; f.B.p = assoc.iB; }
    if (this.ghost) f.g = 1;
    this.out.emit('msg', { f: f });
    if (nowMs - this.lastStatus > 5000) { this.lastStatus = nowMs; this.out.emit('msg', { status: this.status() }); }
    if (nowMs - this.lastHealth > 1000) { this.lastHealth = nowMs; this.out.emit('msg', { health: this.health() }); }
    if (this.cal.state === 'running' || this.cal.state === 'waiting') this.calTick(eA, eB, target);
    return f;
  };
  // Spec 4.4: after 30 s in IDLE with no session, whatever echoes are steadily present are background.
  Sim.prototype.idleRelearn = function (t, eA, eB, snap) {
    if (snap.st !== ST.IDLE || this.sm.session || this.cal.state === 'running') { this.idleSince = t; this.idleAcc = null; return; }
    if (t - this.idleSince < (this.cfg.tuning.bgRelearnIdleMs || 30000)) return;
    if (!this.idleAcc) this.idleAcc = { A: [], B: [] };
    this.idleAcc.A.push(eA || []); this.idleAcc.B.push(eB || []);
    if (this.idleAcc.A.length < 40) return;
    var toRec = function (frames, into) {
      var counts = {}; frames.forEach(function (fr) { fr.forEach(function (e) { var b = Math.round(e[0] / 20) * 20; counts[b] = counts[b] || { n: 0, s: 0 }; counts[b].n += 1; counts[b].s += e[1]; }); });
      Object.keys(counts).forEach(function (b) { if (counts[b].n >= frames.length * 0.8) { var d = +b, seen = false; for (var i = 0; i < into.length; i++) if (Math.abs(into[i][0] - d) <= 25) { seen = true; into[i][1] = Math.max(into[i][1], counts[b].s / counts[b].n); } if (!seen) into.push([d, Math.round(counts[b].s / counts[b].n)]); } });
    };
    toRec(this.idleAcc.A, this.recorded.A); toRec(this.idleAcc.B, this.recorded.B); this.bg = { A: [], B: [] };
    this.idleAcc = null; this.idleSince = t; this.out.emit('msg', { ev: 'bg', t: t, A: this.recorded.A.slice(), B: this.recorded.B.slice(), why: 'idle' });
  };
  Sim.prototype.onEvent = function (e) {
    if (this.ghost) e.g = 1;
    if (e.ev === 'still' && e.x != null) { // learn the still object as background
      var self = this, poses = { A: this.cfg.sensors.A, B: this.cfg.sensors.B };
      ['A', 'B'].forEach(function (k) { var d = G.range(poses[k], e.x, e.y, self.cfg.hand.zwork) + (poses[k].off || 0); self.bg[k].push([Math.round(d), 2500]); });
      this.out.emit('msg', { ev: 'bg', t: e.t, A: this.bg.A.slice(), B: this.bg.B.slice() });
    }
    this.out.emit('msg', e);
  };
  Sim.prototype.status = function () {
    var tot = this.sm.totals;
    return { fw: RS.VERSION + '-sim', proto: RS.PROTO, up: Math.round(U.now() - this.uptime0), rst: this.resetReason, setup: this.setup, heap: 182000, clients: 1, sim: true,
      cal: { saved: !!this.calName, name: this.calName || null, when: this.calWhen || null }, sess: tot.sess, ml: Math.round(tot.ml), savedOff: Math.round(tot.savedOff), savedFlow: Math.round(tot.savedFlow) };
  };
  Sim.prototype.health = function () {
    var f = this.faults, cfg = this.cfg;
    return { A: { hz: U.round(this.fps.A, 1), er: this.err.A, calNeeded: !!f.calNeeded, str: f.A_swapSdaScl ? 0 : 1800 }, B: { hz: U.round(this.fps.B, 1), er: this.err.B, calNeeded: false, str: f.B_foil ? 30 : 1700 },
      bgDrift: f.bgDrift ? 38 : 3, ghosts: this.ghostEcho, front: this.frontEcho, trigNoHand: this.trigNoHand, falseOff: this.sm.falseOff, heldOn: this.sm.heldOn,
      led: cfg.tuning.ledBright, rssi: -38, heap: 182000, rst: this.resetReason, temp: 41 + (this.t / 60000) * 0.3, faults: Object.keys(f) };
  };

  // ---- commands (what the firmware's WebSocket handler does) ------------------------------------------------------
  Sim.prototype.cmd = function (c) {
    var self = this, ack = function (extra) { self.out.emit('msg', { ack: Object.assign({ c: c.c, id: c.id }, extra || {}) }); };
    var err = function (msg) { self.out.emit('msg', { err: { c: c.c, id: c.id, msg: msg } }); };
    switch (c.c) {
      case 'hello': this.out.emit('msg', { status: this.status() }); this.out.emit('msg', { cfg: this.cfg }); this.out.emit('msg', { health: this.health() }); ack(); break;
      case 'auth': this.auth = true; ack({ ok: true }); break;
      case 'setup': if (!c.pass || c.pass.length < 8 || c.pass.length > 63) return err('Password must be 8 to 63 characters'); if (!/^\d{4,8}$/.test(c.pin || '')) return err('PIN must be 4 to 8 digits'); this.setup = false; ack({ restart: true }); this.out.emit('msg', { status: this.status() }); break;
      case 'layout': if (!this.sm.setLayout(c.id)) return err('unknown layout'); ack(); this.out.emit('msg', { cfg: this.cfg }); break;
      case 'clean': if (c.a === 'end') this.sm.endClean(); else this.sm.startClean('ui'); ack(); break;
      case 'cfg':
        if (!c.set) return err('nothing to set');
        Object.keys(c.set).forEach(function (k) { U.setPath(self.cfg, k, c.set[k]); });
        this.sm.setConfig(this.cfg); ack(); this.out.emit('msg', { cfg: this.cfg }); break;
      case 'cal': this.calCmd(c, ack, err); break;
      case 'led': this.ledTest = c.test === 'off' ? null : { test: c.test, n: c.n }; ack(); this.out.emit('msg', { led: this.ledTest }); break;
      case 'save': if (!c.name) return err('name required'); this.savedCals[c.name] = { name: c.name, notes: c.notes || '', when: U.stamp(), cfg: U.deepClone(this.cfg), bg: U.deepClone(this.bg), recorded: U.deepClone(this.recorded) }; this.calName = c.name; this.calWhen = U.stamp(); U.store.set('sim.cals', this.savedCals); ack(); this.out.emit('msg', { cals: this.calList() }); this.out.emit('msg', { status: this.status() }); break;
      case 'load': var s = this.savedCals[c.name]; if (!s) return err('no such calibration'); this.cfg = U.deepClone(s.cfg); this.bg = U.deepClone(s.bg || { A: [], B: [] }); if (s.recorded) this.recorded = U.deepClone(s.recorded); this.sm.setConfig(this.cfg); this.calName = c.name; this.calWhen = s.when; ack(); this.out.emit('msg', { cfg: this.cfg }); this.out.emit('msg', { status: this.status() }); break;
      case 'delete': delete this.savedCals[c.name]; U.store.set('sim.cals', this.savedCals); ack(); this.out.emit('msg', { cals: this.calList() }); break;
      case 'list': ack(); this.out.emit('msg', { cals: this.calList() }); break;
      case 'wifi': if (!c.pass || c.pass.length < 8 || c.pass.length > 63) return err('Password must be 8 to 63 characters'); ack({ restart: true }); break;
      case 'pin': if (!/^\d{4,8}$/.test(c.pin || '')) return err('PIN must be 4 to 8 digits'); ack(); break;
      case 'get': if (c.what === 'cfg') this.out.emit('msg', { cfg: this.cfg }); else if (c.what === 'health') this.out.emit('msg', { health: this.health() }); else if (c.what === 'cal') this.out.emit('msg', { cal: this.cal }); else this.out.emit('msg', { status: this.status() }); ack(); break;
      case 'reset': if (c.what === 'totals') this.sm.totals = { sess: 0, ml: 0, savedOff: 0, savedFlow: 0 }; else { this.cfg = U.deepClone(RS.DEFAULTS); this.bg = { A: [], B: [] }; this.recorded = { A: [], B: [] }; this.sm.setConfig(this.cfg); this.calName = null; this.out.emit('msg', { cfg: this.cfg }); } ack(); this.out.emit('msg', { status: this.status() }); break;
      case 'reboot': this.resetReason = 'SW_RESET'; this.uptime0 = U.now(); this.sm.reset(); ack(); this.out.emit('msg', { status: this.status() }); break;
      case 'fault': this.setFault(c.name, c.on); ack(); break;   // simulator only (T30 rehearsal)
      default: err('unknown command ' + c.c);
    }
  };
  Sim.prototype.calList = function () { var self = this; return Object.keys(this.savedCals).map(function (k) { var s = self.savedCals[k]; return { name: s.name, notes: s.notes, when: s.when }; }); };

  // ---- calibration steps (C0, identify, C6, C7, C8) ----------------------------------------------------------------
  Sim.prototype.calEmit = function () { this.out.emit('msg', { cal: U.deepClone(this.cal) }); };
  Sim.prototype.calCmd = function (c, ack, err) {
    var self = this, step = c.step, a = c.a;
    if (a === 'stop') { this.cal = { step: null, state: 'idle' }; this.calEmit(); return ack(); }
    if (a === 'apply') {        // fitted results computed in the browser
      if (c.sensors) ['A', 'B'].forEach(function (k) { if (c.sensors[k]) Object.assign(self.cfg.sensors[k], c.sensors[k]); });
      if (c.hand) Object.assign(this.cfg.hand, c.hand);
      this.sm.setConfig(this.cfg); this.out.emit('msg', { cfg: this.cfg }); return ack();
    }
    if (a === 'start') {
      this.cal = { step: step, state: 'running', i: 0, n: 0, t0: this.t, checks: [], samples: [] };
      if (step === 'c0') { this.cal.n = 7; this.cal.checks = []; }
      else if (step === 'identify') { this.cal.n = 1; this.cal.state = 'waiting'; this.cal.prompt = 'Hold your hand 20 cm in front of the back-left sensor'; }
      else if (step === 'c6') { this.cal.n = 40; this.cal.frames = { A: [], B: [] }; }
      else if (step === 'c7') { this.cal.n = 32; this.cal.hole = 1; this.cal.depth = RS.CAL.depths[0]; this.cal.state = 'waiting'; this.cal.buf = []; }
      else if (step === 'c8') { this.cal.n = 33; this.cal.hole = 1; this.cal.high = true; this.cal.state = 'waiting'; this.cal.buf = []; this.cal.samples = []; this.cal.still = []; }
      else return err('unknown step');
      this.calEmit(); return ack();
    }
    if (this.cal.step !== step) return err('step not running');
    if (a === 'next') { this.cal.answer = c.answer; this.cal.state = 'running'; this.calEmit(); return ack(); }
    if (a === 'redo') { this.calRedo(c.hole); return ack(); }
    if (a === 'skip') { this.calSkip(); return ack(); }
    if (a === 'sample') { this.cal.state = 'running'; this.cal.buf = []; this.calEmit(); return ack(); }
    err('unknown action ' + a);
  };
  Sim.prototype.calRedo = function (hole) {
    var cal = this.cal; if (cal.step === 'c7' || cal.step === 'c8') { cal.samples = cal.samples.filter(function (s) { return s.hole !== hole; }); cal.hole = hole; cal.depth = RS.CAL.depths[0]; cal.high = true; cal.i = cal.samples.length; cal.state = 'waiting'; cal.result = null; this.calEmit(); }
  };
  Sim.prototype.calSkip = function () {
    var cal = this.cal; if (cal.step === 'c7') { cal.skipped = (cal.skipped || 0) + 1; this.calAdvance(); }
    else if (cal.step === 'c8') { this.calAdvance(); }
  };
  Sim.prototype.calAdvance = function () {
    var cal = this.cal;
    if (cal.step === 'c7') {
      if (cal.depth === RS.CAL.depths[0]) cal.depth = RS.CAL.depths[1];
      else { cal.depth = RS.CAL.depths[0]; cal.hole += 1; }
      cal.i = cal.samples.length; cal.buf = [];
      if (cal.hole > 16) { cal.state = 'done'; cal.result = RS.fit.wandFit(cal.samples, this.cfg); } else cal.state = 'waiting';
    } else if (cal.step === 'c8') {
      if (cal.high) cal.high = false; else { cal.high = true; cal.hole += 1; }
      cal.i = cal.samples.length; cal.buf = [];
      if (cal.hole > 16 && !cal.stillDone) { cal.phase = 'still'; cal.state = 'waiting'; cal.prompt = 'Hold your hand as still as you can over the drain for 5 seconds'; }
      else if (cal.hole > 16) { cal.state = 'done'; cal.result = RS.fit.handProfile(cal.samples, cal.still, this.cfg, this.lastStaticSpread); }
      else cal.state = 'waiting';
    }
    this.calEmit();
  };
  // Called every frame while a step runs. eA/eB are this frame's echo lists; target is the true hand (if any).
  Sim.prototype.calTick = function (eA, eB, target) {
    var cal = this.cal, f = this.faults, self = this, holes = G.templateHoles(this.cfg.plane);
    if (cal.step === 'c0') {
      if (cal.state !== 'running') return;
      var elapsed = this.t - cal.t0, idx = cal.checks.length;
      if (elapsed < (idx + 1) * 700) return;              // one check per 0.7 s for a visible sequence
      var chk = null;
      switch (idx) {
        case 0: chk = { id: 'found', label: 'Sensors answer on their buses', ok: !f.A_swapSdaScl && !f.B_noPower, code: 'W1', detail: (f.A_swapSdaScl ? 'Sensor A not found. ' : '') + (f.B_noPower ? 'Sensor B not found.' : '') }; break;
        case 1: chk = { id: 'fw', label: 'Distance detector firmware', ok: !f.wrongFw, code: 'F1', detail: f.wrongFw ? 'Sensor B reports the presence detector' : 'A: distance detector v1.x · B: distance detector v1.x' }; break;
        case 2: chk = { id: 'status', label: 'Sensor status flags', ok: !f.statusErr, code: 'F2', detail: f.statusErr ? 'A: CONFIG_APPLY_ERROR' : 'no error flags' }; break;
        case 3: chk = { id: 'rst', label: 'Reset lines', ok: !f.B_rstOff && !f.rstSwapped, code: 'W4', detail: f.rstSwapped ? 'Resetting A restarted B' : (f.B_rstOff ? 'Sensor B did not restart when reset' : 'A and B each restart on their own line') }; break;
        case 4: if (!cal.wavePrompted) { cal.wavePrompted = true; cal.state = 'waiting'; cal.prompt = 'Wave the foil ball 20 cm in front of sensor A, then sensor B'; this.calEmit(); return; }
          var seenA = !f.A_swapSdaScl && !f.A_dead, seenB = !f.B_foil && !f.B_noPower;
          chk = { id: 'wave', label: 'Wave test: each sensor sees the ball', ok: seenA && seenB, code: 'S1', detail: (seenA ? 'A sees the ball. ' : 'A sees nothing. ') + (seenB ? 'B sees the ball.' : 'B sees nothing.') }; break;
        case 5: if (!cal.stillPrompted) { cal.stillPrompted = true; cal.state = 'waiting'; cal.prompt = 'Hold the ball still in the middle of the sink for 3 seconds'; this.calEmit(); return; }
          var spread = f.noisy ? 9.5 : NOISE_MM * 1.1; this.lastStaticSpread = spread;
          chk = { id: 'noise', label: 'Still-target noise under 5 mm', ok: spread < 5, code: 'S4', detail: 'spread ' + spread.toFixed(1) + ' mm' }; break;
        case 6: chk = { id: 'led', label: 'LED ring (answer the questions)', ok: null, code: null, detail: 'white test, colour order, count' }; break;
      }
      if (chk) { cal.checks.push(chk); cal.i = cal.checks.length; if (cal.i >= cal.n) { cal.state = 'done'; cal.result = { checks: cal.checks, ok: cal.checks.every(function (c) { return c.ok !== false; }) }; } this.calEmit(); }
      return;
    }
    if (cal.step === 'identify') {
      if (cal.state !== 'waiting') return;
      if (!target) return;
      var nearA = G.planar(this.truePose('A'), target.x, target.y), nearB = G.planar(this.truePose('B'), target.x, target.y);
      var close = Math.min(nearA, nearB) < 260; if (!close) return;
      var reactedA = eA && eA.length && eA[0][0] < 300, reactedB = eB && eB.length && eB[0][0] < 300;
      cal.state = 'done'; cal.result = { swapped: !!(reactedB && !reactedA), ok: !!(reactedA && !reactedB), code: (reactedB && !reactedA) ? 'W3' : null }; this.calEmit(); return;
    }
    if (cal.step === 'c6') {
      if (target && !this.ghost) { cal.warn = 'Something is in the sink'; }
      cal.frames.A.push(eA || []); cal.frames.B.push(eB || []); cal.i = cal.frames.A.length; if (cal.i % 5 === 0) this.calEmit();
      if (cal.i >= cal.n) {
        var stable = function (frames) { var counts = {}; frames.forEach(function (fr) { fr.forEach(function (e) { var b = Math.round(e[0] / 20) * 20; counts[b] = counts[b] || { n: 0, s: 0 }; counts[b].n += 1; counts[b].s += e[1]; }); }); return Object.keys(counts).filter(function (b) { return counts[b].n >= frames.length * 0.6; }).map(function (b) { return { d: +b, s: Math.round(counts[b].s / counts[b].n), n: counts[b].n }; }); };
        var bgA = stable(cal.frames.A), bgB = stable(cal.frames.B), addRec = function (list, into) { list.forEach(function (e) { var seen = false; for (var i = 0; i < into.length; i++) if (Math.abs(into[i][0] - e.d) <= 25) { seen = true; into[i][1] = Math.max(into[i][1], e.s); } if (!seen) into.push([e.d, e.s]); }); };
        addRec(bgA, this.recorded.A); addRec(bgB, this.recorded.B); this.bg = { A: [], B: [] };
        var strong = bgA.concat(bgB).filter(function (e) { return e.s > 1200; }), maxS = Math.max.apply(null, [0].concat(bgA.concat(bgB).map(function (e) { return e.s; })));
        cal.state = 'done'; cal.result = { A: bgA, B: bgB, codes: (strong.length ? ['B1'] : []).concat(maxS > 1000 && !strong.length ? ['B2'] : []), ok: !strong.length, maxStrength: maxS };
        this.calEmit();
      }
      return;
    }
    if (cal.step === 'c7' || cal.step === 'c8') {
      if (cal.state !== 'running') return;
      var H = holes[cal.hole - 1]; if (!H && cal.phase !== 'still') return;
      // the operator's ball/hand is assumed at the hole; readings come from the true geometry
      var depth = cal.step === 'c7' ? cal.depth : (cal.high ? 55 + 10 * this.rnd() : 150 + 15 * this.rnd());
      var jitter = cal.step === 'c8' ? 12 : 1.5, tgt;
      if (cal.phase === 'still') tgt = { x: this.cfg.plane.w / 2 + 4 * this.rnd.gauss(), y: this.cfg.plane.d / 2 + 4 * this.rnd.gauss(), h: 110, kind: 'hand' };
      else tgt = { x: H.x + jitter * this.rnd.gauss(), y: H.y + jitter * this.rnd.gauss(), h: depth, kind: cal.step === 'c7' ? 'ball' : 'hand' };
      var rA = null, rB = null;
      ['A', 'B'].forEach(function (k) {
        var pose = self.truePose(k), d = G.range(pose, tgt.x, tgt.y, tgt.h) + pose.off + NOISE_MM * self.rnd.gauss() - (cal.step === 'c7' ? RS.CAL.ballR : 0);
        var s = self.echoStrength(pose, tgt.x, tgt.y, tgt.h, d, tgt.kind) * ((k === 'B' && f.B_foil) ? 0.02 : 1);
        if ((k === 'A' && f.A_swapSdaScl) || s < 60) return;
        if (k === 'A') rA = [Math.round(d), Math.round(s)]; else rB = [Math.round(d), Math.round(s)];
      });
      cal.buf.push({ A: rA, B: rB });
      cal.reading = { A: rA, B: rB, steady: Math.min(1, cal.buf.length / 12) };
      if (cal.phase === 'still') { if (rA && rB) cal.still.push({ A: rA[0], B: rB[0] }); if (cal.buf.length >= 110) { cal.stillDone = true; cal.phase = null; cal.hole = 17; this.calAdvance(); } else if (cal.buf.length % 6 === 0) this.calEmit(); return; }
      if (cal.buf.length >= 12) {                 // steady for ~0.5 s: take the median reading
        var med = function (k) { var v = cal.buf.filter(function (b) { return b[k]; }); if (v.length < 6) return null; var ds = v.map(function (b) { return b[k][0]; }), ss = v.map(function (b) { return b[k][1]; }); return [U.median(ds), U.median(ss), U.std(ds)]; };
        var mA = med('A'), mB = med('B');
        var sample = { hole: cal.hole, A: mA ? [mA[0], mA[1]] : null, B: mB ? [mB[0], mB[1]] : null, spread: mA && mB ? (mA[2] + mB[2]) / 2 : null };
        if (cal.step === 'c7') sample.depth = cal.depth; else sample.high = cal.high;
        cal.samples.push(sample); cal.lastSample = sample; this.out.emit('msg', { ev: 'beep', t: this.t });
        this.calAdvance();
      } else if (cal.buf.length % 3 === 0) this.calEmit();
    }
  };

  // ---- ghost demo hand (F25): scripted sequences per layout, in plane fractions -----------------------------------
  function makeScript(p) {
    function at(t, q) { return { t: t, on: true, x: q[0], y: q[1] }; }
    return [
      { t: 0, on: false }, at(1.0, [0.5, 0.94]), at(2.2, p.soap), at(3.4, p.soap), at(4.4, p.warm), at(7.6, p.warm), { t: 7.61, on: false },
      at(10.0, [0.62, 0.94]), at(11.2, p.cup), at(16.2, p.cup), { t: 16.21, on: false },
      at(18.6, [0.3, 0.94]), at(19.4, p.third), at(23.0, p.third), { t: 23.01, on: false },
      at(25.5, [0.5, 0.94]), at(26.0, p.hot), at(29.4, p.hot), { t: 29.41, on: false }, { t: 32.0, on: false }
    ];
  }
  RS.GHOST_SCRIPTS = {
    kitchen: makeScript({ soap: [0.17, 0.17], warm: [0.5, 0.8], cup: [0.83, 0.18], third: [0.16, 0.5], hot: [0.17, 0.83] }),
    bathroom: makeScript({ soap: [0.17, 0.25], warm: [0.5, 0.78], cup: [0.83, 0.25], third: [0.5, 0.25], hot: [0.17, 0.78] }),
    accessible: makeScript({ soap: [0.25, 0.2], warm: [0.5, 0.75], cup: [0.75, 0.2], third: [0.83, 0.75], hot: [0.17, 0.75] })
  };
  // Position of the ghost hand at script time ts (seconds); null when out of the sink. Adds a natural tremor.
  RS.ghostHand = function (layoutId, ts, plane) {
    var S = RS.GHOST_SCRIPTS[layoutId] || RS.GHOST_SCRIPTS.kitchen, T = S[S.length - 1].t, t = ts % T;
    for (var i = 0; i < S.length - 1; i++) {
      var a = S[i], b = S[i + 1];
      if (t >= a.t && t < b.t) {
        if (!a.on) return null;
        var f = (t - a.t) / (b.t - a.t), xf = b.on ? a.x + (b.x - a.x) * f : a.x, yf = b.on ? a.y + (b.y - a.y) * f : a.y;
        var tremor = 4; // mm: a real hand is never perfectly still
        return { x: xf * plane.w + tremor * Math.sin(ts * 7.3), y: yf * plane.d + tremor * Math.cos(ts * 5.1), h: 105 + 12 * Math.sin(ts * 0.9), xf: xf, yf: yf };
      }
    }
    return null;
  };
  RS.Sim = Sim;
})();
