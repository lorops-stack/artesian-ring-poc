/* Ring Studio · the latch state machine (spec section 4). Pure and time-driven: every call to step()
   carries the frame time, so the same code runs live, in the simulator, in replay and in node tests.
   The firmware's lib/core/state_machine.cpp implements the same transitions; both run the same fixtures. */
var RS = globalThis.RS || (globalThis.RS = {});
(function () {
  'use strict';
  var U = RS.util, G = RS.geo, ST = RS.ST, FLAG = RS.FLAG;

  function SM(cfg) {
    this.ev = new U.Emitter();
    this.setConfig(cfg || RS.DEFAULTS);
    this.reset();
  }
  SM.prototype.setConfig = function (cfg) {
    this.cfg = cfg; this.tun = cfg.tuning; this.prof = cfg.profiles[cfg.profile] || cfg.profiles.default;
    this.zones = G.zones(cfg.layout, cfg.layouts);
    this.flowMls = (this.prof.flowGpm || 1.5) * RS.GPM_TO_MLS; this.baseMls = RS.BASELINE_GPM * RS.GPM_TO_MLS;
  };
  SM.prototype.reset = function () {
    this.st = ST.IDLE; this.fn = null; this.zone = null; this.armZone = null; this.armSince = 0; this.settle = 0;
    this.session = false; this.sessionStart = 0; this.entryT = 0; this.soapUsed = false; this.dispUsed = false;
    this.disposalUntil = 0; this.cupMl = 0; this.exitStart = 0; this.resumeSt = ST.IDLE; this.gone = 0; this.present = 0;
    this.cleanUntil = 0; this.neutralSince = 0; this.lastSeen = 0; this.lat = null; this.falseOff = 0; this.heldOn = 0;
    this.refX = null; this.refY = null; this.lastMove = 0; this.still = 0; this.win = []; this.flag = FLAG.NO_HAND; this.t = 0;
    this.flowMs = 0; this.usedMl = 0; this.lastOffT = -1e9; this.dropFrames = 0; this.totals = { sess: 0, ml: 0, savedOff: 0, savedFlow: 0 };
  };
  SM.prototype.snapshot = function () {
    var s = this, exitRem = s.st === ST.EXIT_PENDING ? U.clamp(1 - (s.t - s.exitStart) / s.tun.exitMs, 0, 1) : 0;
    return { st: s.st, fn: s.fn, zn: s.zone ? s.zone.id : null, set: s.settle, ex: exitRem, dsp: s.disposalUntil ? Math.max(0, (s.disposalUntil - s.t) / 1000) : 0,
      cup: s.cupMl, lk: (s.soapUsed ? 1 : 0) | (s.dispUsed ? 2 : 0), flag: s.flag, still: s.still, lat: s.lat, session: s.session,
      clean: s.st === ST.CLEAN ? Math.max(0, (s.cleanUntil - s.t) / 1000) : 0, falseOff: s.falseOff, heldOn: s.heldOn };
  };
  SM.prototype.flowing = function () { return (this.st === ST.ACTIVE && RS.FN[this.fn] && RS.FN[this.fn].water) ? true : false; };
  SM.prototype.zoneBlocked = function (fn) {
    if (fn === 'neutral') return true;
    if (fn === 'soap' && this.soapUsed) return true;
    if (fn === 'disposal' && (this.dispUsed || this.disposalUntil)) return true;
    var L = this.cfg.layouts[this.cfg.layout];
    return !L;
  };
  SM.prototype.emit = function (name, extra) { var e = Object.assign({ ev: name, t: this.t }, extra || {}); this.ev.emit('event', e); return e; };

  // --- Session bookkeeping ------------------------------------------------------------------------------
  SM.prototype.startSession = function () {
    this.session = true; this.sessionStart = this.t; this.entryT = this.t; this.flowMs = 0; this.usedMl = 0;
    this.soapUsed = false; this.dispUsed = false; this.emit('session', { a: 'start' });
  };
  SM.prototype.endSession = function () {
    if (!this.session) return;
    var ms = this.t - this.sessionStart, used = this.usedMl, savedFlow = (this.baseMls - this.flowMls) * this.flowMs / 1000, savedOff = this.baseMls * Math.max(0, ms - this.flowMs) / 1000;
    this.totals.sess += 1; this.totals.ml += used; this.totals.savedOff += savedOff; this.totals.savedFlow += savedFlow;
    this.session = false; this.soapUsed = false; this.dispUsed = false; this.armZone = null; this.settle = 0; this.cupMl = 0;
    this.emit('session', { a: 'end', ms: ms, used: used, savedOff: savedOff, savedFlow: savedFlow });
  };
  SM.prototype.allOff = function (why, keepDisposal) {
    var hadWater = this.st === ST.ACTIVE || this.st === ST.CUP_FULL;
    this.fn = null; this.st = ST.IDLE; this.zone = null; this.armZone = null; this.settle = 0;
    if (!keepDisposal && this.disposalUntil) { this.disposalUntil = 0; this.emit('disp', { a: 'stop', why: why }); }
    this.emit('off', { why: why, water: hadWater }); this.lastOffT = this.t;
    this.endSession();
  };
  SM.prototype.stopDisposal = function (why) { if (this.disposalUntil) { this.disposalUntil = 0; this.emit('disp', { a: 'stop', why: why }); } };

  // --- Commands --------------------------------------------------------------------------------------------
  SM.prototype.setLayout = function (id) {
    if (!this.cfg.layouts[id]) return false;
    this.cfg.layout = id; this.zones = G.zones(id, this.cfg.layouts);
    if (this.st === ST.CLEAN) this.cleanUntil = 0;
    this.allOff('layout'); this.st = ST.IDLE; this.emit('layout', { id: id }); return true;
  };
  SM.prototype.startClean = function (source) {
    if (this.st === ST.CLEAN) return;
    this.stopDisposal('clean'); this.allOff('clean', true);
    this.st = ST.CLEAN; this.cleanUntil = this.t + this.tun.cleanMs; this.emit('clean', { a: 'start', src: source || 'ui' });
  };
  SM.prototype.endClean = function () { if (this.st !== ST.CLEAN) return; this.st = ST.IDLE; this.cleanUntil = 0; this.emit('clean', { a: 'end' }); };

  // --- The frame step -----------------------------------------------------------------------------------
  // input: {t, pos:{x,y}|null, speed, flag}. flag from association (0 none, 2 strength, 3 outside, 4 jump).
  SM.prototype.step = function (inp) {
    var t = inp.t, tun = this.tun, dt = this.t ? Math.max(0, Math.min(0.2, (t - this.t) / 1000)) : 0; this.t = t;
    var pos = inp.pos || null, flag = pos ? (inp.flag || FLAG.NONE) : FLAG.NO_HAND;
    var present = !!pos && (flag === FLAG.NONE || flag === FLAG.JUMP);   // strength/outside: no fused target
    var usable = present && flag === FLAG.NONE;

    // Water accounting (before transitions, for the elapsed dt)
    if (this.flowing()) {
      this.flowMs += dt * 1000; this.usedMl += this.flowMls * dt;
      if (this.fn === 'cup') { this.cupMl += this.flowMls * dt; if (this.cupMl >= this.prof.cupMl) { this.cupMl = this.prof.cupMl; this.st = ST.CUP_FULL; this.emit('cupfull', { ml: this.cupMl }); } }
    }
    // Disposal timer runs in parallel with everything
    if (this.disposalUntil && t >= this.disposalUntil) { this.disposalUntil = 0; this.emit('disp', { a: 'stop', why: 'timer' }); }

    // Presence / gone counting
    if (present) {
      this.lastSeen = t;
      if (this.gone > 0 && this.gone < tun.goneFrames && this.session && this.st !== ST.EXIT_PENDING) { this.heldOn += 1; this.emit('heldon', { frames: this.gone }); }
      this.gone = 0;
    } else { this.gone += 1; }

    // Stillness tracking (spec 4.4). The position is averaged over the last half second so range noise does not
    // look like movement; a shift of the averaged position beyond the still-hand threshold refreshes lastMove.
    if (usable) {
      this.win.push(pos); if (this.win.length > 11) this.win.shift();
      var mx = 0, my = 0; for (var wi = 0; wi < this.win.length; wi++) { mx += this.win[wi].x; my += this.win[wi].y; } mx /= this.win.length; my /= this.win.length;
      if (this.refX === null) { this.refX = mx; this.refY = my; this.lastMove = t; }
      else if (U.hypot(mx - this.refX, my - this.refY) > this.cfg.hand.stillThr) { this.refX = mx; this.refY = my; this.lastMove = t; }
      this.still = (t - this.lastMove) / 1000;
    } else if (!present && this.gone >= tun.goneFrames) { this.refX = null; this.still = 0; this.win.length = 0; }   // a bridged dropout keeps the still timer

    // CLEAN: nothing latches, wait it out
    if (this.st === ST.CLEAN) {
      this.flag = present ? FLAG.BLOCKED : FLAG.NO_HAND; this.settle = 0; this.zone = null;
      if (t >= this.cleanUntil) this.endClean();
      return this.snapshot();
    }

    // IDLE: a moving target present for presentFrames starts a session
    if (this.st === ST.IDLE) {
      this.zone = null; this.settle = 0;
      if (present && inp.speed >= (tun.startSpeed || 60)) this.present += 1; else this.present = 0;
      if (this.present >= tun.presentFrames) {
        this.present = 0; this.startSession(); this.st = ST.ARMING; this.armZone = null; this.refX = null;
        if (t - this.lastOffT < 1000 && this.lastOffWhy === 'exit') { this.falseOff += 1; this.emit('falseoff', { why: 'hand back within 1 s' }); }
      } else { this.flag = present ? FLAG.NOT_SETTLED : (pos ? flag : FLAG.NO_HAND); return this.snapshot(); }
    }

    // EXIT_PENDING: one present frame cancels; timeout ends everything (disposal keeps running)
    if (this.st === ST.EXIT_PENDING) {
      if (present) { this.st = this.resumeSt; this.emit('resume', {}); }
      else if (t - this.exitStart >= tun.exitMs) { this.lastOffWhy = 'exit'; this.allOff('exit', true); this.flag = FLAG.NO_HAND; return this.snapshot(); }
      else { this.flag = FLAG.NO_HAND; return this.snapshot(); }
    }

    // Hand gone → EXIT_PENDING, timed from the last frame seen
    if (!present) {
      if (this.gone >= tun.goneFrames) { this.resumeSt = this.st; this.st = ST.EXIT_PENDING; this.exitStart = this.lastSeen || t; this.settle = 0; }
      this.flag = FLAG.NO_HAND; this.zone = this.zone; return this.snapshot();
    }

    // Stillness rule: an object, not a hand
    if (usable && this.still * 1000 >= tun.stillOffMs) {
      this.emit('still', { x: pos.x, y: pos.y }); this.lastOffWhy = 'still'; this.allOff('still', true);
      this.flag = FLAG.STILL; this.refX = null; this.present = 0; return this.snapshot();
    }

    // Zone with hysteresis (only from a usable frame; a jump frame keeps the last zone)
    if (usable) this.zone = G.zoneAt(this.zones, this.cfg.plane, pos.x, pos.y, this.zone ? this.zone.id : null, tun.hyst);
    var z = this.zone;

    // Settle timer: restarts on zone change or speed above the limit, or on a flagged frame
    if (!z || !usable || (this.armZone !== z.id) || inp.speed >= tun.settleSpeed) { this.armZone = z ? z.id : null; this.armSince = t; }
    var held = t - this.armSince, need = z && z.fn === 'disposal' ? tun.disposalHoldMs : tun.settleMs;
    var latched = this.st === ST.ACTIVE || this.st === ST.CUP_FULL;
    var blocked = z ? this.zoneBlocked(z.fn) : true;
    this.settle = (z && !blocked && !latched) ? U.clamp(held / need, 0, 1) : 0;
    this.flag = !usable ? flag : (!z ? FLAG.NOT_SETTLED : (blocked && !latched ? FLAG.BLOCKED : (latched ? FLAG.NONE : (held >= need ? FLAG.NONE : FLAG.NOT_SETTLED))));

    if (!z || !usable) return this.snapshot();

    // Disposal stops when a hand settles in any other zone, Neutral included
    if (this.disposalUntil && z.fn !== 'disposal' && held >= tun.settleMs) this.stopDisposal('zone');

    if (this.st === ST.ARMING) {
      if (z.fn === 'neutral') {
        if (held >= tun.cleanHoldMs && inp.speed < tun.settleSpeed) { this.startClean('neutral'); }
        return this.snapshot();
      }
      if (blocked || held < need) return this.snapshot();
      var lat = Math.round(t - this.entryT);
      if (z.fn === 'soap') { this.soapUsed = true; this.entryT = t; this.armSince = t; this.emit('soap', { ml: this.prof.soapMl, lat: lat }); this.lat = lat; }
      else if (z.fn === 'disposal') { this.dispUsed = true; this.disposalUntil = t + tun.disposalRunMs; this.entryT = t; this.armSince = t; this.emit('disp', { a: 'start', lat: lat }); this.lat = lat; }
      else { this.st = ST.ACTIVE; this.fn = z.fn; this.cupMl = 0; this.lat = lat; this.emit('latch', { fn: z.fn, lat: lat }); }
    }
    // ACTIVE / CUP_FULL: the latch holds wherever the hand goes
    return this.snapshot();
  };

  RS.StateMachine = SM;
})();
