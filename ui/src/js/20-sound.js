/* Ring Studio · sound (F22): synthesized in the browser, no audio files. Driven by protocol events. */
var RS = globalThis.RS || (globalThis.RS = {});
(function () {
  'use strict';
  var U = RS.util, L = RS.link, S = RS.store;
  var CHIME = { soap: [880, 1319], hot: [392, 523], warm: [440, 587], cold: [659, 988], waterfall: [523, 784], cup: [587, 880], disposal: [196, 147], clean: [523, 659] };

  function Sound() { this.ac = null; this.on = false; this.state = { flowing: false, fn: null, cupFrac: 0, disposal: false }; }
  Sound.prototype.unlock = function () {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return true; }
    var AC = globalThis.AudioContext || globalThis.webkitAudioContext; if (!AC) return false;
    var ac = new AC(), i; this.ac = ac;
    this.master = ac.createGain(); this.master.gain.value = 0.5; this.master.connect(ac.destination);
    var len = ac.sampleRate * 3, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0), last = 0;
    for (i = 0; i < len; i++) { var w = Math.random() * 2 - 1; last = (last + 0.04 * w) / 1.04; d[i] = last * 3 + w * 0.12; }
    var src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
    var bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.7;
    var lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5000;
    var g = ac.createGain(); g.gain.value = 0; src.connect(bp); bp.connect(lp); lp.connect(g); g.connect(this.master); src.start();
    this.water = { bp: bp, lp: lp, g: g };
    var o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 46;
    var rl = ac.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 160;
    var rg = ac.createGain(); rg.gain.value = 0; o.connect(rl); rl.connect(rg); rg.connect(this.master); o.start();
    this.rumble = { g: rg, o: o };
    return true;
  };
  Sound.prototype.ready = function () { return this.on && this.ac && this.ac.state === 'running'; };
  // Continuous layers follow the latest frame
  Sound.prototype.update = function (f, cupMl) {
    if (!this.ac) return;
    var t = this.ac.currentTime, on = this.ready(), st = f ? f.st : 0, fn = f ? f.fn : null;
    var flowing = (st === RS.ST.ACTIVE) && fn && RS.FN[fn] && RS.FN[fn].water;
    var gw = 0, fr = 900, q = 0.7;
    if (on && flowing) {
      if (fn === 'waterfall') { gw = 0.55; fr = 620; q = 0.45; }
      else if (fn === 'cup') { gw = 0.32; fr = 700 + 1300 * U.clamp((f.cup || 0) / (cupMl || 350), 0, 1); q = 2.2; }
      else if (fn === 'hot') { gw = 0.42; fr = 760; }
      else if (fn === 'cold') { gw = 0.42; fr = 1250; }
      else { gw = 0.42; fr = 950; }
    }
    this.water.g.gain.setTargetAtTime(gw, t, 0.12); this.water.bp.frequency.setTargetAtTime(fr, t, 0.08); this.water.bp.Q.setTargetAtTime(q, t, 0.1);
    this.rumble.g.gain.setTargetAtTime(on && f && f.dsp > 0 ? 0.3 : 0, t, 0.15);
  };
  Sound.prototype.tone = function (freq, when, dur, vol, type) {
    var ac = this.ac, o = ac.createOscillator(), g = ac.createGain(); o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(vol, when + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(this.master); o.start(when); o.stop(when + dur + 0.05);
  };
  Sound.prototype.chime = function (fn) { if (!this.ready()) return; var t = this.ac.currentTime, p = CHIME[fn] || [523, 784]; this.tone(p[0], t, 0.9, 0.16); this.tone(p[1], t + 0.07, 1.1, 0.12); this.tone(p[1] * 2, t + 0.07, 0.5, 0.025, 'triangle'); };
  Sound.prototype.pops = function () { if (!this.ready()) return; var t = this.ac.currentTime; for (var i = 0; i < 12; i++) this.tone(700 + Math.random() * 1100, t + 0.12 + Math.random() * 0.6, 0.06, 0.05); };
  Sound.prototype.off = function () { if (!this.ready()) return; var t = this.ac.currentTime; this.tone(659, t, 0.35, 0.08); this.tone(440, t + 0.12, 0.6, 0.08); };
  Sound.prototype.ding = function () { if (!this.ready()) return; var t = this.ac.currentTime; this.tone(1568, t, 1.4, 0.12); this.tone(2093, t + 0.02, 0.9, 0.05); };
  Sound.prototype.tick = function () { if (!this.ready()) return; this.tone(1800, this.ac.currentTime, 0.03, 0.025); };
  Sound.prototype.beep = function () { if (!this.ready()) return; var t = this.ac.currentTime; this.tone(1046, t, 0.12, 0.12); };
  Sound.prototype.buzz = function () { if (!this.ready()) return; var t = this.ac.currentTime; this.tone(196, t, 0.25, 0.14, 'square'); this.tone(185, t + 0.28, 0.25, 0.14, 'square'); };
  Sound.prototype.still = function () { if (!this.ready()) return; var t = this.ac.currentTime; this.tone(330, t, 0.5, 0.1); this.tone(247, t + 0.25, 0.8, 0.1); };

  var snd = RS.sound = new Sound();
  snd.enable = function (on) { if (on) snd.unlock(); snd.on = !!on; S.set('sound', on ? 'on' : 'off'); if (!on && snd.ac) snd.update(null); };
  snd.toggle = function () { snd.enable(!snd.on); };
  snd.unlockOnGesture = function () { if (S.get('sound') === 'locked' || S.get('sound') === 'on') { if (snd.unlock()) { snd.on = true; S.set('sound', 'on'); } } };
  if (S.get('sound') === 'on') snd.on = true;   // resumes on the first gesture

  // Events from any source (device, sim, replay) drive the one-shot sounds. Ghost events sound too (it is the demo).
  L.on('event', function (e) {
    if (!snd.ready()) return;
    switch (e.ev) {
      case 'latch': snd.chime(e.fn); break;
      case 'soap': snd.chime('soap'); snd.pops(); break;
      case 'cupfull': snd.ding(); break;
      case 'off': if (e.water || e.why === 'exit') snd.off(); break;
      case 'still': snd.still(); break;
      case 'disp': if (e.a === 'start') snd.chime('disposal'); break;
      case 'clean': if (e.a === 'start') snd.chime('clean'); break;
      case 'beep': snd.beep(); break;
      case 'falseoff': break;
    }
  });
  var lastFrameSound = 0;
  L.on('frame', function (f) { var now = U.now(); if (now - lastFrameSound < 100) return; lastFrameSound = now; snd.update(f, S.profile().cupMl); });
})();
