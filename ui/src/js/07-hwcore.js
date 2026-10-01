/* Ring Studio · hardware check core: turns the firmware's per-sensor health into a checklist and a plain verdict.
   No DOM here, so it is unit-tested. The firmware reports (docs/10-protocol.md, `health`):
   sda/scl  idle level of the I2C lines (the module's own pull-ups hold them high only when it has 3V3 and ground)
   pres     answers at address 0x52          cfg  the distance detector accepted its configuration
   ver/st   version and detector status registers   bus  last Wire error code    alive/hz/er  live measuring, rate, error count */
var RS = globalThis.RS || (globalThis.RS = {});
(function () {
  'use strict';
  var HW = RS.hw = RS.hw || {};

  // Pins as wired (docs/03-pinout-and-wiring.md)
  HW.PINS = { A: { sda: 8, scl: 9, rst: 6 }, B: { sda: 17, scl: 18, rst: 7 } };
  HW.ERR_BITS = 0x03FF0000;

  function pins(k) { var p = HW.PINS[k]; return 'SDA GPIO' + p.sda + ', SCL GPIO' + p.scl + ', RST GPIO' + p.rst; }
  function hex(v) { return '0x' + ((v >>> 0).toString(16).toUpperCase()); }
  HW.versionText = function (v) { return v ? ((v >>> 16) + '.' + ((v >>> 8) & 255) + '.' + (v & 255)) : '-'; };
  HW.busText = function (code) {
    return { 0: 'ok', 1: 'data too long', 2: 'no ACK at the address (nothing answered)', 3: 'no ACK on data', 4: 'other bus error', 5: 'timeout (a line is held low)' }[code] || ('code ' + code);
  };

  // Does this health message carry the new per-sensor fields? (older firmware only sends hz/er/str)
  HW.hasDetail = function (s) { return !!s && typeof s.pres === 'boolean'; };

  // opts: { errRate: I2C errors per second over the last few seconds, linkOk: bool }
  // Returns { steps: [{id,label,state,detail}], verdict: {level:'ok'|'bad'|'warn'|'wait', title, text} }
  HW.diagnose = function (key, s, opts) {
    opts = opts || {}; var steps = [], P = pins(key), fail = null;
    function step(id, label, state, detail) { steps.push({ id: id, label: label, state: state, detail: detail }); if ((state === 'bad') && !fail) fail = steps[steps.length - 1]; }
    if (!s) { return { steps: [], verdict: { level: 'wait', title: 'No health data yet', text: 'Waiting for the ring to report. If this stays, check the Wi-Fi link.' } }; }
    if (!HW.hasDetail(s)) {
      var live = s.alive !== false && s.hz > 3;
      step('live', 'Measuring', live ? 'ok' : 'bad', live ? s.hz.toFixed(1) + ' readings per second' : 'no readings');
      return { steps: steps, verdict: live ? { level: 'ok', title: 'Sensor ' + key + ' is measuring', text: 'This firmware is older and reports no wiring detail.' } : { level: 'bad', title: 'Sensor ' + key + ' is not measuring', text: 'Update the firmware for wiring detail, or check power and the I2C wires.' } };
    }
    var up = s.sda && s.scl;
    step('lines', 'Power and I2C lines', up ? 'ok' : (s.pres ? 'warn' : 'bad'), up ? 'SDA and SCL held high by the module' : (!s.sda && !s.scl ? 'SDA and SCL both low' : (!s.sda ? 'SDA low' : 'SCL low')));
    step('answer', 'Answers on the bus (0x52)', s.pres ? 'ok' : (fail ? 'wait' : 'bad'), s.pres ? 'yes' : HW.busText(s.bus));
    var hasErr = (s.st & HW.ERR_BITS) !== 0;
    step('fw', 'Distance detector set up', s.pres ? (s.cfg ? 'ok' : 'bad') : 'wait',
      s.pres ? (s.cfg ? 'version ' + HW.versionText(s.ver) + ', status ' + hex(s.st) : 'status ' + hex(s.st) + (hasErr ? ' (error flags set)' : '') + ', version ' + HW.versionText(s.ver)) : 'not reached yet');
    var meas = s.cfg ? (s.alive && s.hz >= 5 ? 'ok' : (s.alive && s.hz > 0 ? 'warn' : 'bad')) : 'wait';
    step('live', 'Measuring', meas, s.cfg ? (s.alive ? (+s.hz).toFixed(1) + ' readings per second' : 'configured, but no readings are coming back') : 'not reached yet');
    var er = opts.errRate == null ? 0 : opts.errRate;
    step('errs', 'Bus errors', s.cfg ? (er > 0.5 ? 'bad' : (er > 0.05 ? 'warn' : 'ok')) : 'wait', s.cfg ? (er > 0.05 ? er.toFixed(1) + ' errors per second' : 'none recently') + ' (total ' + (s.er || 0) + ')' : 'not reached yet');

    var v;
    if (!up && !s.pres) {
      if (!s.sda && !s.scl) v = { level: 'bad', title: 'Sensor ' + key + ' has no power', text: 'Both I2C lines idle low, so the module is not powering its pull-ups. Check its red wire to the ESP32 3V3 pin and its black wire to GND, at both ends. A cold or loose solder joint on the 3V3 or G pad is the usual cause. (' + P + ')' };
      else v = { level: 'bad', title: 'Sensor ' + key + ': ' + (s.sda ? 'SCL' : 'SDA') + ' line stuck low', text: 'The ' + (s.sda ? 'SCL' : 'SDA') + ' wire is open (not connected at one end) or shorted to ground or to its neighbour. Meter it end to end and check it does not touch the next pad. (' + P + ')' };
    } else if (!s.pres) {
      v = { level: 'bad', title: 'Sensor ' + key + ' is powered but silent', text: 'The lines are held up, yet nothing answers at 0x52. In order of likelihood: SDA and SCL swapped (check SDA goes to GPIO' + HW.PINS[key].sda + ' and SCL to GPIO' + HW.PINS[key].scl + '), the RST wire is shorted low or on the wrong pad (GPIO' + HW.PINS[key].rst + '), or the module did not finish booting: press Re-check.' };
    } else if (!s.cfg) {
      v = { level: 'bad', title: 'Sensor ' + key + ' answers but the distance detector did not start', text: hasErr ? 'The module reports a setup error (status ' + hex(s.st) + '). Press Re-check once. If it repeats, reflash it with i2c_distance_detector.bin (docs/05).' : 'Most likely this board still has the presence-detector firmware. Reflash it with i2c_distance_detector.bin (docs/05), with the board unplugged from the ESP32.' };
    } else if (meas === 'bad') {
      v = { level: 'bad', title: 'Sensor ' + key + ' is configured but not measuring', text: 'Press Re-check. If readings do not start, a wire is intermittent: wiggle the bundle gently and watch the error counter.' };
    } else if (er > 0.5) {
      v = { level: 'bad', title: 'Sensor ' + key + ' has bus errors', text: 'Readings are getting through but the bus is failing often. Re-solder the SDA and SCL joints, shorten or strain-relieve the wires, and keep them away from the LED strip.' };
    } else if (meas === 'warn' || er > 0.05) {
      v = { level: 'warn', title: 'Sensor ' + key + ' works but is marginal', text: er > 0.05 ? 'Occasional bus errors. Gently wiggle the wires: if the count jumps, that joint is loose.' : 'The reading rate is low. Check the range setting and the I2C speed.' };
    } else {
      v = { level: 'ok', title: 'Sensor ' + key + ' is good', text: 'Powered, answering, configured and measuring.' };
    }
    return { steps: steps, verdict: v };
  };

  // Rolling bus-error rate from successive health messages: feed (er, tMs) each second.
  HW.ErrRate = function () { this.h = []; };
  HW.ErrRate.prototype.add = function (er, t) { this.h.push([t, er || 0]); while (this.h.length > 2 && t - this.h[0][0] > 8000) this.h.shift(); };
  HW.ErrRate.prototype.rate = function () {
    if (this.h.length < 2) return 0; var a = this.h[0], b = this.h[this.h.length - 1], dt = (b[0] - a[0]) / 1000;
    if (dt <= 0) return 0; var d = b[1] - a[1]; return d < 0 ? 0 : d / dt;       // a counter that went down means the module restarted
  };

  // Overall: the worst level across the two sensors plus the system checks.
  HW.overall = function (diags, sys) {
    var rank = { ok: 0, wait: 1, warn: 2, bad: 3 }, worst = 'ok';
    diags.concat(sys || []).forEach(function (d) { var l = d.verdict ? d.verdict.level : d.level; if (rank[l] > rank[worst]) worst = l; });
    return worst;
  };
  // System checks from the health message: reset reason, heap, temperature
  HW.system = function (hh, status) {
    var out = [];
    if (!hh) return out;
    var rst = hh.rst || (status && status.rst) || '';
    if (/BROWN/i.test(rst)) out.push({ level: 'bad', title: 'The ESP32 restarted from a brown-out', text: 'The supply dipped. Use a different USB cable or port, and keep the LED strip off this supply (W5).' });
    else if (/WDT|PANIC|EXCEPTION/i.test(rst)) out.push({ level: 'bad', title: 'The ESP32 restarted after a fault (' + rst + ')', text: 'Send me the serial monitor output from the restart.' });
    if (hh.heap != null && hh.heap < 60000) out.push({ level: 'warn', title: 'Low memory (' + Math.round(hh.heap / 1000) + ' kB free)', text: 'Close extra browser tabs connected to the ring.' });
    if (hh.temp != null && hh.temp > 70) out.push({ level: 'warn', title: 'Hot (' + hh.temp.toFixed(0) + ' °C)', text: 'Let it cool; check airflow.' });
    return out;
  };

  // Wave test: wave a hand 5 to 20 cm in front of one sensor; its nearest echo should swing.
  HW.Wave = function () { this.reset(); };
  HW.Wave.prototype.reset = function () { this.k = { A: { min: 1e9, max: -1, n: 0, frames: 0 }, B: { min: 1e9, max: -1, n: 0, frames: 0 } }; this.frames = 0; };
  HW.Wave.prototype.add = function (f) {
    if (!f) return; this.frames++;
    var self = this; ['A', 'B'].forEach(function (key) {
      var s = f[key], r = self.k[key]; if (!s) return; r.frames++;
      if (s.e && s.e.length) { var d = s.e[0][0]; r.n++; if (d < r.min) r.min = d; if (d > r.max) r.max = d; }
    });
  };
  // Result per sensor: seen (had echoes), swing (max-min of nearest echo, mm), ok
  HW.Wave.prototype.result = function (minSwing) {
    var ms = minSwing || 40, out = {}, self = this;
    ['A', 'B'].forEach(function (key) {
      var r = self.k[key], seen = r.n > 3; out[key] = { seen: seen, swing: seen ? Math.round(r.max - r.min) : 0, ok: seen && (r.max - r.min) >= ms, near: seen ? Math.round(r.min) : null, echoFrames: r.n };
    });
    return out;
  };
})();
