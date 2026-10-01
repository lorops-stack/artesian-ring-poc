/* Ring Studio · aim and dead-area logic without any DOM: the sweep collector (self-calibration), the false-reading learner and the
   mask proposals. The Aim screen (30-aim.js) draws it; the tests in ui/test run it against the simulator. */
var RS = globalThis.RS || (globalThis.RS = {});
(function () {
  'use strict';
  var U = RS.util, G = RS.geo, F = RS.fit, AIM = RS.aim = {};

  // ---- Sweep: collects hand fixes and the strengths each sensor reported for them -----------------------------------------------------
  function Sweep() { this.reset(); }
  Sweep.prototype.reset = function () { this.A = []; this.B = []; this.pairs = []; this.visited = {}; this.nVisited = 0; this.n = 0; this.cap = 3000; };
  // f is a protocol frame {hx, hy, A:{e:[[d,s]..], p}, B:{...}}
  Sweep.prototype.add = function (f, cfg) {
    if (!f || f.hx == null || !f.A || !f.B || f.A.p == null || f.B.p == null || f.A.p < 0 || f.B.p < 0) return false;
    var ea = f.A.e[f.A.p], eb = f.B.e[f.B.p]; if (!ea || !eb) return false;
    var x = f.hx, y = f.hy;
    this.A.push({ x: x, y: y, s: ea[1] }); this.B.push({ x: x, y: y, s: eb[1] }); this.pairs.push({ rA: ea[0], rB: eb[0] });
    if (this.A.length > this.cap) { this.A.shift(); this.B.shift(); this.pairs.shift(); }
    var P = cfg.plane, key = Math.floor(x / P.w * 12) + ',' + Math.floor(y / P.d * 12);
    if (!this.visited[key]) { this.visited[key] = 1; this.nVisited++; }
    this.n++; return true;
  };
  Sweep.prototype.coverage = function () { return Math.min(1, this.nVisited / 120); };      // 12 x 12 cells, about 120 reachable
  Sweep.prototype.result = function (cfg) {
    var A = cfg.sensors.A, B = cfg.sensors.B;
    return { n: this.A.length, coverage: this.coverage(), A: F.aimFromSamples(this.A, A), B: F.aimFromSamples(this.B, B), base: F.baselineBracket(this.pairs, cfg) };
  };
  // Plain-language advice for one sensor. Positions never depend on the aim, only the echo strength does.
  AIM.hint = function (key, res, cfg) {
    var typed = cfg.sensors[key].yaw;
    if (!res || res.yaw == null) return res ? res.why : '';
    var d = res.delta, mag = Math.abs(d);
    if (mag < 4) return 'Aimed as set (within 4°). Nothing to change.';
    var angTo90 = function (a) { var x = ((a - 90) % 360 + 540) % 360 - 180; return Math.abs(x); };
    var moreFront = angTo90(res.yaw) < angTo90(typed);
    return 'The beam points ' + Math.round(mag) + '° more toward the ' + (moreFront ? 'front' : 'back wall') + ' than the ' + Math.round(typed) + '° you set. Turn the block ' + Math.round(mag) + '° toward the ' + (moreFront ? 'back wall' : 'front') + ' to match, or Apply to accept ' + Math.round(res.yaw) + '°.';
  };

  // ---- Learn: where would the device report a hand while the sink is empty? ------------------------------------------------------------------
  // Same pairing rule as the firmware (nearer pair wins) but without the plane and dead-area gates, so clutter outside the sink shows too.
  function bestPairAny(f, cfg) {
    var A = cfg.sensors.A, B = cfg.sensors.B, hand = cfg.hand, h = hand.zwork, best = null, i, j;
    if (!f.A || !f.B) return null;
    for (i = 0; i < f.A.e.length; i++) { var ea = f.A.e[i]; if (ea[1] < hand.strMin || ea[1] > hand.strMax) continue;
      for (j = 0; j < f.B.e.length; j++) { var eb = f.B.e[j]; if (eb[1] < hand.strMin || eb[1] > hand.strMax) continue;
        var rA = ea[0] - (A.off || 0), rB = eb[0] - (B.off || 0);
        if (!G.pairFeasible(rA, rB, A, B, h)) continue;
        var p = G.locate(rA, rB, A, B, h, null, cfg.plane); if (p.res > 60) continue;
        var sc = rA + rB; if (!best || sc < best.score) best = { x: p.x, y: p.y, score: sc };
      } }
    return best;
  }
  AIM.bestPairAny = bestPairAny;
  function Learn() { this.cell = 20; this.pad = 300; this.reset(); }
  Learn.prototype.reset = function () { this.cnt = {}; this.frames = 0; this.hits = 0; this.inside = 0; this.outside = 0; this.max = 0; };
  Learn.prototype.add = function (f, cfg) {
    this.frames++;
    var p = bestPairAny(f, cfg); if (!p) return false;
    var P = cfg.plane, ins = p.x >= 0 && p.x <= P.w && p.y >= 0 && p.y <= P.d;
    if (p.x < -this.pad || p.x > P.w + this.pad || p.y < -this.pad || p.y > P.d + this.pad) return false;
    var i = Math.floor((p.x + this.pad) / this.cell), j = Math.floor((p.y + this.pad) / this.cell), k = i + ',' + j, c = (this.cnt[k] || 0) + 1;
    this.cnt[k] = c; if (c > this.max) this.max = c; this.hits++; if (ins) this.inside++; else this.outside++; return true;
  };
  // Clusters of busy cells become proposals. Inside the sink: a mask is offered. Outside: reported only (the plane gate already ignores it).
  Learn.prototype.proposals = function (cfg, minHits) {
    var th = minHits || Math.max(4, Math.round(this.frames * 0.01)), cell = this.cell, pad = this.pad, P = cfg.plane, seen = {}, out = [], self = this;
    var keys = Object.keys(this.cnt).filter(function (k) { return self.cnt[k] >= th; });
    var has = {}; keys.forEach(function (k) { has[k] = 1; });
    keys.forEach(function (k) {
      if (seen[k]) return;
      var stack = [k], comp = []; seen[k] = 1;
      while (stack.length) {
        var cur = stack.pop(), pr = cur.split(','), ci = +pr[0], cj = +pr[1]; comp.push([ci, cj, self.cnt[cur]]);
        for (var di = -2; di <= 2; di++) for (var dj = -2; dj <= 2; dj++) { var nk = (ci + di) + ',' + (cj + dj); if (has[nk] && !seen[nk]) { seen[nk] = 1; stack.push(nk); } }
      }
      var sw = 0, sx = 0, sy = 0, hits = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      comp.forEach(function (c) { var x = c[0] * cell - pad + cell / 2, y = c[1] * cell - pad + cell / 2; sw += c[2]; sx += x * c[2]; sy += y * c[2]; hits += c[2]; x0 = Math.min(x0, x - cell / 2); x1 = Math.max(x1, x + cell / 2); y0 = Math.min(y0, y - cell / 2); y1 = Math.max(y1, y + cell / 2); });
      var cx = sx / sw, cy = sy / sw, w = x1 - x0, hh = y1 - y0, inside = cx >= 0 && cx <= P.w && cy >= 0 && cy <= P.d;
      var prop = { cx: Math.round(cx), cy: Math.round(cy), hits: hits, where: inside ? 'inside' : 'outside' };
      var aspect = Math.max(w, hh) / Math.max(1, Math.min(w, hh));
      if (aspect < 2.2) { var r = Math.max(45, Math.max(w, hh) / 2 + 30); prop.mask = { t: 'circle', x: Math.round(cx), y: Math.round(cy), r: Math.round(r) }; }
      else { var m = 25; prop.mask = { t: 'rect', x: Math.round(x0 - m), y: Math.round(y0 - m), w: Math.round(w + 2 * m), h: Math.round(hh + 2 * m) }; }
      out.push(prop);
    });
    out.sort(function (a, b) { return b.hits - a.hits; });
    return out;
  };
  AIM.Sweep = Sweep; AIM.Learn = Learn;

  // Next free mask id: m1, m2, ...
  AIM.nextMaskId = function (masks) { var n = 1; while (masks && masks['m' + n]) n++; return 'm' + n; };
})();
