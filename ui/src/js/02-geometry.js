/* Ring Studio · geometry: zones with hysteresis, trilateration, echo association, coverage prediction.
   Pure functions, no DOM. The firmware's lib/core implements the same rules in C++; the fixtures in
   firmware/test/fixtures are run against both. Spec section 6. */
var RS = globalThis.RS || (globalThis.RS = {});
(function () {
  'use strict';
  var U = RS.util, G = RS.geo = {};

  // ---- Zones -------------------------------------------------------------------------------------------
  // Returns [{id, fn, row, col, x0, x1, y0, y1}] in plane fractions (0..1). Rows back to front.
  G.zones = function (layoutId, layouts) {
    var L = (layouts || RS.LAYOUTS)[layoutId]; if (!L) return [];
    var out = [], y = 0;
    for (var r = 0; r < L.rows.length; r++) {
      var row = L.rows[r], n = row.fns.length, h = (r === L.rows.length - 1) ? 1 - y : row.h;
      for (var c = 0; c < n; c++) out.push({ id: layoutId + '-' + r + '-' + c, fn: row.fns[c], row: r, col: c, x0: c / n, x1: (c + 1) / n, y0: y, y1: y + h });
      y += h;
    }
    return out;
  };
  G.zoneById = function (zones, id) { for (var i = 0; i < zones.length; i++) if (zones[i].id === id) return zones[i]; return null; };
  G.rawZone = function (zones, xf, yf) {
    for (var i = 0; i < zones.length; i++) { var z = zones[i]; if (xf >= z.x0 && xf < z.x1 && yf >= z.y0 && yf < z.y1) return z; }
    if (xf >= 0 && xf <= 1 && yf >= 0 && yf <= 1) return zones[zones.length - 1] || null;
    return null;
  };
  // Zone with hysteresis (mm). prevId keeps its zone while the point stays within hyst of the zone's outer
  // edges; a new zone counts only once the point is hyst inside its internal edges. Returns zone or null.
  G.zoneAt = function (zones, plane, xmm, ymm, prevId, hyst) {
    var W = plane.w, D = plane.d, xf = xmm / W, yf = ymm / D, hx = (hyst || 0) / W, hy = (hyst || 0) / D;
    if (prevId) {
      var p = G.zoneById(zones, prevId);
      if (p && xf >= p.x0 - hx && xf <= p.x1 + hx && yf >= p.y0 - hy && yf <= p.y1 + hy) return p;
    }
    var z = G.rawZone(zones, xf, yf); if (!z) return null;
    var inX = (z.x0 <= 0 || xf >= z.x0 + hx) && (z.x1 >= 1 || xf <= z.x1 - hx);
    var inY = (z.y0 <= 0 || yf >= z.y0 + hy) && (z.y1 >= 1 || yf <= z.y1 - hy);
    return (inX && inY) ? z : null;
  };
  G.zoneCentre = function (z, plane) { return { x: (z.x0 + z.x1) / 2 * plane.w, y: (z.y0 + z.y1) / 2 * plane.d }; };

  // ---- Ranges and trilateration ---------------------------------------------------------------------------
  // Range from a sensor pose {x,y,z} (z above the ring plane) to a point at depth h below the plane.
  G.range = function (S, x, y, h) { var dx = x - S.x, dy = y - S.y, dz = -h - S.z; return Math.sqrt(dx * dx + dy * dy + dz * dz); };
  G.planar = function (S, x, y) { return U.hypot(x - S.x, y - S.y); };

  // Solve x,y from two ranges (already corrected for each sensor's distance offset) at assumed hand depth h.
  // Closed-form two-circle intersection in the sensor-baseline frame. Both solutions are mirror images across the line
  // through the sensors; the one on the sink side (the side of the plane centre) is returned. When the circles fall short
  // of meeting, the point sits on the baseline between them and res says by how much they missed. `guess` is accepted
  // for callers that still pass it, and only decides the side when no plane is given. Same arithmetic as geometry.cpp.
  G.locate = function (rA, rB, A, B, h, guess, plane) {
    var gx = plane ? plane.w / 2 : (guess ? guess.x : 292), gy = plane ? plane.d / 2 : (guess ? guess.y : 267);
    var vA = h + (A.z || 0), vB = h + (B.z || 0);
    var pA = rA * rA - vA * vA, pB = rB * rB - vB * vB; pA = pA > 0 ? Math.sqrt(pA) : 0; pB = pB > 0 ? Math.sqrt(pB) : 0;
    var ux = B.x - A.x, uy = B.y - A.y, base = U.hypot(ux, uy); if (base < 1e-3) return { x: A.x, y: A.y + pA, res: 0 };
    ux /= base; uy /= base; var nx = -uy, ny = ux;                                   // n is perpendicular to the baseline
    if ((gx - A.x) * nx + (gy - A.y) * ny < 0) { nx = -nx; ny = -ny; }              // point n toward the sink
    var xp = (pA * pA - pB * pB + base * base) / (2 * base), y2 = pA * pA - xp * xp, yp = y2 > 0 ? Math.sqrt(y2) : 0;
    return { x: A.x + ux * xp + nx * yp, y: A.y + uy * xp + ny * yp, res: U.hypot(pA - U.hypot(xp, yp), pB - U.hypot(base - xp, yp)) };
  };

  // Do two range circles (planar) intersect at all? Used to reject impossible pairs quickly.
  G.pairFeasible = function (rA, rB, A, B, h) {
    var vA = h + A.z, vB = h + B.z;
    if (rA < Math.abs(vA) || rB < Math.abs(vB)) return false;
    var pA = Math.sqrt(rA * rA - vA * vA), pB = Math.sqrt(rB * rB - vB * vB), base = U.hypot(A.x - B.x, A.y - B.y);
    return pA + pB >= base - 40 && Math.abs(pA - pB) <= base + 40;
  };

  // ---- Dead areas (masks) ---------------------------------------------------------------------------------------------------------
  // cfg.masks is {id: {t:'rect', x, y, w, h} | {t:'circle', x, y, r}} in mm, plane coordinates (origin back-left, y toward the user).
  // A fix that lands inside one is ignored. Rect x,y is the top-left (back-left) corner.
  G.maskList = function (masks) {
    if (!masks) return []; if (Array.isArray(masks)) return masks;
    return Object.keys(masks).map(function (k) { var m = masks[k]; return m ? Object.assign({ id: k }, m) : null; }).filter(Boolean);
  };
  G.maskHit = function (masks, x, y) {
    var L = G.maskList(masks);
    for (var i = 0; i < L.length; i++) {
      var m = L[i];
      if (m.t === 'circle') { if (U.hypot(x - m.x, y - m.y) <= m.r) return m.id; }
      else if (x >= m.x && x <= m.x + m.w && y >= m.y && y <= m.y + m.h) return m.id;
    }
    return null;
  };

  // ---- Vertical beam (side view) -----------------------------------------------------------------------------------------------------
  // The radar lobe is wide. A sensor recessed behind a slot only sees through the opening, so the slot narrows the vertical
  // half-angle to atan((slotH / 2) / recess) when the lobe is wider than that. Approximate: real radar also diffracts at the edges.
  G.vHalf = function (cfg) {
    var r = (cfg && cfg.rig) || {}, v = r.beamV || 60;
    if (r.recess > 0 && r.slotH > 0) v = Math.min(v, U.deg(Math.atan((r.slotH / 2) / r.recess)));
    return v;
  };
  // How far (degrees) a point at planar distance p and depth h below the plane is from the sensor's vertical boresight.
  // tilt is negative when the sensor points down; the boresight depression is -tilt.
  G.vertOff = function (S, p, h) { return U.deg(Math.atan2(h + (S.z || 0), Math.max(1, p))) + (S.tilt || 0); };
  G.vertFactor = function (cfg, S, p, h) { var v = G.vHalf(cfg), o = G.vertOff(S, p, h); return Math.exp(-0.7 * Math.pow(o / Math.max(1, v), 2)); };

  // ---- Echo association (spec 6, one rule) --------------------------------------------------------------------
  // echoes: [[d_mm, strength], ...] per sensor. Returns {x,y,ux,uy,iA,iB,flag} ; flag 0 = good. x,y are clamped to the
  // plane; ux,uy are the raw fix (the track must follow the raw one, or a hand at the edge gets pinned there).
  // opts: {A,B poses with .off, hand {zwork,strMin,strMax,envRef,envK,envDb}, plane, bg {A:[[d,s]..], B:[..]}, prev {x,y}, maxJump, masks, nearWin}
  // Hand strength envelope: a hand at range d returns about envRef * (300 / d) ^ envK. An echo more than envDb away from
  // that is not a hand at that range (a metal wall is far above it, a second bounce far below). envRef 0 = off.
  G.strengthInEnvelope = function (hand, d, s) {
    if (!(hand.envRef > 0) || !(s > 0) || !(d > 0)) return true;
    var expct = hand.envRef * Math.pow(300 / d, hand.envK == null ? 2 : hand.envK), db = 20 * Math.log10(s / expct);
    return Math.abs(db) <= (hand.envDb == null ? 12 : hand.envDb);
  };
  G.geometryUncertainty = function (A, B, x, y, h, sigma) {
    sigma = sigma == null ? 8 : sigma;
    var rA=G.range(A,x,y,h), rB=G.range(B,x,y,h); if(rA<1||rB<1) return 999;
    var j00=(x-A.x)/rA,j01=(y-A.y)/rA,j10=(x-B.x)/rB,j11=(y-B.y)/rB,det=j00*j11-j01*j10;
    if(Math.abs(det)<1e-4) return 999;
    var i00=j11/det,i01=-j01/det,i10=-j10/det,i11=j00/det;
    return Math.hypot(sigma*Math.hypot(i00,i01),sigma*Math.hypot(i10,i11));
  };
  G.associate = function (eA, eB, opts) {
    var A = opts.A, B = opts.B, hand = opts.hand, plane = opts.plane, bg = opts.bg || {}, tol = 15;
    // Learned still objects: [[d, strength], ...]. An echo is background when it sits within tol of one and is
    // not clearly stronger than it (a hand passing at that distance still shows, because it is stronger).
    var isBg = function (list, d, s) { if (!list) return false; for (var i = 0; i < list.length; i++) { var e = list[i], bd = Array.isArray(e) ? e[0] : e, bs = Array.isArray(e) ? e[1] : 0; if (Math.abs(bd - d) <= tol && s < bs * 1.8 + 1) return true; } return false; };
    var okStr = function (e) { return e[1] >= hand.strMin && e[1] <= hand.strMax && G.strengthInEnvelope(hand, e[0], e[1]); };
    var candA = [], candB = [], i, j, anyStrengthFail = false;
    for (i = 0; i < eA.length; i++) { if (!okStr(eA[i])) { anyStrengthFail = true; continue; } if (isBg(bg.A, eA[i][0], eA[i][1])) continue; candA.push(i); }
    for (j = 0; j < eB.length; j++) { if (!okStr(eB[j])) { anyStrengthFail = true; continue; } if (isBg(bg.B, eB[j][0], eB[j][1])) continue; candB.push(j); }
    if (!candA.length || !candB.length) return { flag: (eA.length || eB.length) ? (anyStrengthFail ? RS.FLAG.STRENGTH : RS.FLAG.NO_HAND) : RS.FLAG.NO_HAND };
    var best = null, margin = 30, anyOutside = false, anyMasked = false, pairs = [];
    // Pass 1: every pair that is geometrically possible, inside the sink and not in a dead area.
    for (i = 0; i < candA.length; i++) for (j = 0; j < candB.length; j++) {
      var rA = eA[candA[i]][0] - (A.off || 0), rB = eB[candB[j]][0] - (B.off || 0);
      if (!G.pairFeasible(rA, rB, A, B, hand.zwork)) continue;
      var p = G.locate(rA, rB, A, B, hand.zwork, null, plane);
      if (p.x < -margin || p.x > plane.w + margin || p.y < -margin || p.y > plane.d + margin || p.res > 60) { anyOutside = true; continue; }
      if (opts.masks && G.maskHit(opts.masks, p.x, p.y)) { anyMasked = true; continue; }       // a dead area: this pair is ignored, the next best may still win
      pairs.push({ p: p, ia: candA[i], ib: candB[j], rA: rA, rB: rB });
    }
    if (!pairs.length) return { flag: anyMasked ? RS.FLAG.MASKED : (anyOutside ? RS.FLAG.OUTSIDE : RS.FLAG.NO_HAND) };
    // First-arrival rule (nearWin). The direct path is the shortest path a radar pulse can take, so on each sensor the
    // nearest surviving echo is the hand and anything much further is a bounce off the sink or a body behind it. With an
    // established track the reference is the pair nearest the track instead, so a cup set down nearer the sensor than the
    // hand cannot steal it. Applied after the dead-area check so a reflector in a dead area never hides a real hand.
    var limA = Infinity, limB = Infinity;
    if (opts.nearWin > 0) {
      var refA = Infinity, refB = Infinity;
      if (opts.prev) { var k0 = null, bd = Infinity; pairs.forEach(function (q) { var dd = U.hypot(q.p.x - opts.prev.x, q.p.y - opts.prev.y); if (dd < bd) { bd = dd; k0 = q; } }); refA = eA[k0.ia][0]; refB = eB[k0.ib][0]; }
      else pairs.forEach(function (q) { refA = Math.min(refA, eA[q.ia][0]); refB = Math.min(refB, eB[q.ib][0]); });
      limA = refA + opts.nearWin; limB = refB + opts.nearWin;
    }
    pairs.forEach(function (q) {
      if (eA[q.ia][0] > limA || eB[q.ib][0] > limB) return;
      var trackErr = opts.prev ? U.hypot(q.p.x - opts.prev.x, q.p.y - opts.prev.y) : 0;
      var unc = G.geometryUncertainty(A, B, q.p.x, q.p.y, hand.zwork, opts.rangeSigma || 8);
      var score = q.rA + q.rB + 4 * q.p.res + 0.35 * Math.min(200, unc);
      if (opts.prev) score += 2.5 * trackErr;
      var evidence = q.p.res + (opts.prev ? 0.35 * trackErr : 0) + 0.15 * Math.min(200, unc);
      if (!best || score < best.score) best = { x: U.clamp(q.p.x, 0, plane.w), y: U.clamp(q.p.y, 0, plane.d), ux: q.p.x, uy: q.p.y, iA: q.ia, iB: q.ib, res: q.p.res, score: score, rA: q.rA, rB: q.rB, uncertainty: unc, confidence: 1 / (1 + evidence / 25) };
    });
    if (!best) return { flag: anyMasked ? RS.FLAG.MASKED : (anyOutside ? RS.FLAG.OUTSIDE : RS.FLAG.NO_HAND) };
    if (opts.prev && opts.maxJump > 0) {
      var dynamicJump = opts.maxJump + Math.min(180, Math.abs(opts.speed || 0) * Math.max(0, opts.dt || 0.045) * 1.5) + Math.min(100, best.uncertainty || 0);
      if (U.hypot(best.ux - opts.prev.x, best.uy - opts.prev.y) > dynamicJump) { best.flag = RS.FLAG.JUMP; return best; }
    }
    best.flag = RS.FLAG.NONE;
    return best;
  };

  // ---- Alpha-beta tracker for a 2D position; gives a smoothed position and speed (mm/s) ------------------------
  G.Tracker = function (alpha, beta) { this.a = alpha || 0.6; this.b = beta || 0.15; this.reset(); };
  G.Tracker.prototype.setAlpha = function (a) { this.a = U.clamp(a, 0.05, 1); this.b = 0.25 * this.a; };
  G.Tracker.prototype.reset = function () { this.x = null; this.y = null; this.vx = 0; this.vy = 0; this.t = 0; };
  // Where the track should be at time t, without updating it
  G.Tracker.prototype.predict = function (t) { var dt = U.clamp((t - this.t) / 1000, 0, 0.5); return { x: this.x + this.vx * dt, y: this.y + this.vy * dt }; };
  G.Tracker.prototype.update = function (x, y, t) {
    if (this.x === null) { this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.t = t; return { x: x, y: y, speed: 0 }; }
    var dt = Math.max(0.001, (t - this.t) / 1000); this.t = t;
    var px = this.x + this.vx * dt, py = this.y + this.vy * dt, rx = x - px, ry = y - py;
    this.x = px + this.a * rx; this.y = py + this.a * ry; this.vx += this.b * rx / dt; this.vy += this.b * ry / dt;
    var sp = U.hypot(this.vx, this.vy); if (sp > 3000) { this.vx *= 3000 / sp; this.vy *= 3000 / sp; sp = 3000; }
    return { x: this.x, y: this.y, speed: sp };
  };

  // ---- Coverage and accuracy prediction (C5) ----------------------------------------------------------------
  // Returns cells [{xf,yf,x,y,err,acc,blind,beamA,beamB,mirror,zone}] on an nx x ny grid.
  // cfg: full configuration. Model: range noise σr; hand depth spread (zmin..zmax) around zwork; beam half-angle.
  G.coverage = function (cfg, nx, ny, layoutId) {
    nx = nx || 23; ny = ny || 21;
    var plane = cfg.plane, A = cfg.sensors.A, B = cfg.sensors.B, hand = cfg.hand, tun = cfg.tuning;
    var zones = G.zones(layoutId || cfg.layout, cfg.layouts), sigR = 8, half = U.rad(tun.beamHalf || 60);
    var dzs = [hand.zmin - hand.zwork, hand.zmax - hand.zwork];
    var cells = [];
    for (var j = 0; j < ny; j++) for (var i = 0; i < nx; i++) {
      var xf = (i + 0.5) / nx, yf = (j + 0.5) / ny, x = xf * plane.w, y = yf * plane.d, cell = { xf: xf, yf: yf, x: x, y: y };
      var S = [A, B], dists = [], vert = [], ang = [];
      for (var k = 0; k < 2; k++) {
        dists.push(G.range(S[k], x, y, hand.zwork)); vert.push(hand.zwork + S[k].z);
        var a = Math.atan2(y - S[k].y, x - S[k].x) - U.rad(S[k].yaw); while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; ang.push(Math.abs(a));
      }
      cell.blind = dists[0] < tun.rangeStart || dists[1] < tun.rangeStart;
      cell.beamA = ang[0] <= half; cell.beamB = ang[1] <= half;
      var vh = G.vHalf(cfg), vo = [G.vertOff(A, G.planar(A, x, y), hand.zwork), G.vertOff(B, G.planar(B, x, y), hand.zwork)];
      cell.vOffA = vo[0]; cell.vOffB = vo[1]; cell.vokA = Math.abs(vo[0]) <= vh; cell.vokB = Math.abs(vo[1]) <= vh;
      cell.masked = !!G.maskHit(cfg.masks, x, y);
      cell.mirror = y < 45;                                        // both solutions within ~45 mm of the sensor line
      // range error from depth uncertainty: d' = sqrt(r² - v²); |∂d'/∂v| = v/d'
      var errs = [];
      for (k = 0; k < 2; k++) {
        var pl = Math.max(20, G.planar(S[k], x, y));
        var dz = Math.max(Math.abs(dzs[0]), Math.abs(dzs[1])) / 1.7;        // ~1σ of a uniform spread
        errs.push(Math.sqrt(sigR * sigR + Math.pow(vert[k] / pl * dz, 2)));
      }
      // Position error = ||J⁻¹ ε|| for the planar geometry
      var J = [[(x - A.x) / Math.max(1, G.planar(A, x, y)), (y - A.y) / Math.max(1, G.planar(A, x, y))], [(x - B.x) / Math.max(1, G.planar(B, x, y)), (y - B.y) / Math.max(1, G.planar(B, x, y))]];
      var det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
      if (Math.abs(det) < 0.05) cell.err = 400;
      else {
        var inv = [[J[1][1] / det, -J[0][1] / det], [-J[1][0] / det, J[0][0] / det]];
        var ex = Math.sqrt(Math.pow(inv[0][0] * errs[0], 2) + Math.pow(inv[0][1] * errs[1], 2)), ey = Math.sqrt(Math.pow(inv[1][0] * errs[0], 2) + Math.pow(inv[1][1] * errs[1], 2));
        cell.err = Math.sqrt(ex * ex + ey * ey); cell.ex = ex; cell.ey = ey;
      }
      if (cell.blind || !cell.beamA || !cell.beamB || !cell.vokA || !cell.vokB) cell.err = Math.max(cell.err, 150);
      if (cell.masked) cell.err = Math.max(cell.err, 400);
      // Probability the fix lands in the right zone: product of per-axis probabilities of staying inside the zone
      var z = G.rawZone(zones, xf, yf); cell.zone = z ? z.id : null; cell.fn = z ? z.fn : null;
      if (z) {
        var dxl = (xf - z.x0) * plane.w, dxr = (z.x1 - xf) * plane.w, dyb = (yf - z.y0) * plane.d, dyf = (z.y1 - yf) * plane.d;
        var sx = Math.max(1, cell.ex || cell.err / 1.414), sy = Math.max(1, cell.ey || cell.err / 1.414);
        var px = (z.x0 <= 0 ? 1 : phi(dxl / sx)) - (z.x1 >= 1 ? 0 : phi(-dxr / sx)), py = (z.y0 <= 0 ? 1 : phi(dyb / sy)) - (z.y1 >= 1 ? 0 : phi(-dyf / sy));
        cell.acc = U.clamp(px * py, 0, 1); if (cell.blind) cell.acc *= 0.2; if (cell.masked) cell.acc = 0;
      } else cell.acc = 0;
      cells.push(cell);
    }
    // Per-zone expected accuracy: mean over the inner 70% of each zone's cells
    var perZone = {};
    zones.forEach(function (z) {
      var vals = [];
      cells.forEach(function (c) { if (c.zone !== z.id) return; var fx = (c.xf - z.x0) / (z.x1 - z.x0), fy = (c.yf - z.y0) / (z.y1 - z.y0); if (fx > 0.15 && fx < 0.85 && fy > 0.15 && fy < 0.85) vals.push(c.acc); });
      perZone[z.id] = vals.length ? U.mean(vals) : 0;
    });
    var overall = U.mean(Object.keys(perZone).map(function (k) { return perZone[k]; }));
    return { cells: cells, nx: nx, ny: ny, zones: zones, perZone: perZone, overall: overall };
  };
  function phi(z) { // standard normal CDF
    var t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2);
    var p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z > 0 ? 1 - p : p;
  }
  G.phi = phi;

  // Calibration template holes (C7): 16 points, back row first, left to right, in mm.
  G.templateHoles = function (plane) {
    var out = [], fr = RS.CAL.gridFr;
    for (var j = 0; j < 4; j++) for (var i = 0; i < 4; i++) out.push({ n: j * 4 + i + 1, x: fr[i] * plane.w, y: fr[j] * plane.d, xf: fr[i], yf: fr[j] });
    return out;
  };
})();
