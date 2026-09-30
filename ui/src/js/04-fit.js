/* Ring Studio · calibration maths (C7 wand geometry fit, C8 hand profile). Port of tools/calibration_sim.py.
   Runs in the browser; the results are sent to the device as configuration (protocol `cal apply`). */
var RS = globalThis.RS || (globalThis.RS = {});
(function () {
  'use strict';
  var U = RS.util, G = RS.geo, F = RS.fit = {};

  // Least squares via normal equations with a tiny ridge (small systems only: 4 unknowns).
  function solveNormal(J, r, n) {
    var A = [], b = [], i, j, k;
    for (i = 0; i < n; i++) { A.push(new Array(n).fill(0)); b.push(0); }
    for (k = 0; k < J.length; k++) { for (i = 0; i < n; i++) { b[i] += J[k][i] * r[k]; for (j = 0; j < n; j++) A[i][j] += J[k][i] * J[k][j]; } }
    for (i = 0; i < n; i++) A[i][i] += 1e-9;
    // Gaussian elimination
    for (i = 0; i < n; i++) {
      var p = i; for (j = i + 1; j < n; j++) if (Math.abs(A[j][i]) > Math.abs(A[p][i])) p = j;
      if (p !== i) { var tmp = A[i]; A[i] = A[p]; A[p] = tmp; var tb = b[i]; b[i] = b[p]; b[p] = tb; }
      if (Math.abs(A[i][i]) < 1e-12) continue;
      for (j = i + 1; j < n; j++) { var f = A[j][i] / A[i][i]; for (k = i; k < n; k++) A[j][k] -= f * A[i][k]; b[j] -= f * b[i]; }
    }
    var x = new Array(n).fill(0);
    for (i = n - 1; i >= 0; i--) { var s = b[i]; for (j = i + 1; j < n; j++) s -= A[i][j] * x[j]; x[i] = Math.abs(A[i][i]) < 1e-12 ? 0 : s / A[i][i]; }
    return x;
  }

  // Fit one sensor's position (x,y,z) and distance offset from wand readings.
  // pts: [{x,y,h}] ball centres (h = depth below the ring, positive); meas: measured distance to the ball
  // centre (reading + ballR); s0: tape-measured pose {x,y,z}. Prior sd 15 mm, noise sd 8 mm.
  F.fitSensor = function (pts, meas, s0, priorSd, noiseSd) {
    priorSd = priorSd || 15; noiseSd = noiseSd || 8;
    var q = [s0.x, s0.y, s0.z, 0], wp = noiseSd / priorSd, i, it;
    for (it = 0; it < 40; it++) {
      var J = [], r = [];
      for (i = 0; i < pts.length; i++) {
        var dx = q[0] - pts[i].x, dy = q[1] - pts[i].y, dz = q[2] + pts[i].h, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        J.push([dx / d, dy / d, dz / d, 1]); r.push(d + q[3] - meas[i]);
      }
      J.push([wp, 0, 0, 0]); r.push(wp * (q[0] - s0.x));
      J.push([0, wp, 0, 0]); r.push(wp * (q[1] - s0.y));
      J.push([0, 0, wp, 0]); r.push(wp * (q[2] - s0.z));
      var step = solveNormal(J, r, 4), mx = 0;
      for (i = 0; i < 4; i++) { q[i] -= step[i]; mx = Math.max(mx, Math.abs(step[i])); }
      if (mx < 1e-4) break;
    }
    var resid = [];
    for (i = 0; i < pts.length; i++) { var ddx = q[0] - pts[i].x, ddy = q[1] - pts[i].y, ddz = q[2] + pts[i].h; resid.push(Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz) + q[3] - meas[i]); }
    return { x: q[0], y: q[1], z: q[2], off: q[3], rms: U.rms(resid), resid: resid };
  };

  // Full C7 evaluation. samples: [{hole:n, depth:60|160, A:[d,str]|null, B:[d,str]|null}] (readings to the ball surface).
  // cfg: current configuration. Returns the report used by the studio and the fixes it triggers.
  F.wandFit = function (samples, cfg) {
    var plane = cfg.plane, holes = G.templateHoles(plane), ballR = RS.CAL.ballR, CAL = RS.CAL, out = { ok: true, codes: [], holes: [] };
    var byHole = {}, i;
    samples.forEach(function (s) { (byHole[s.hole] || (byHole[s.hole] = [])).push(s); });
    var fits = {};
    ['A', 'B'].forEach(function (k) {
      var pts = [], meas = [], strs = [];
      samples.forEach(function (s) { if (!s[k]) return; var H = holes[s.hole - 1]; pts.push({ x: H.x, y: H.y, h: s.depth }); meas.push(s[k][0] + ballR); strs.push({ hole: s.hole, depth: s.depth, str: s[k][1] }); });
      if (pts.length < 6) { fits[k] = null; return; }
      var f = F.fitSensor(pts, meas, cfg.sensors[k]); f.n = pts.length; f.strs = strs; f.pts = pts; f.typed = { x: cfg.sensors[k].x, y: cfg.sensors[k].y, z: cfg.sensors[k].z };
      f.moved = Math.sqrt(Math.pow(f.x - f.typed.x, 2) + Math.pow(f.y - f.typed.y, 2) + Math.pow(f.z - f.typed.z, 2));
      fits[k] = f;
    });
    out.fits = fits;
    if (!fits.A || !fits.B) { out.ok = false; out.codes.push('P2'); out.message = 'Not enough readings to fit both sensors.'; return out; }

    // Overall RMS and per-hole errors (position error of the located ball vs the hole)
    var rmsAll = Math.sqrt((Math.pow(fits.A.rms, 2) * fits.A.n + Math.pow(fits.B.rms, 2) * fits.B.n) / (fits.A.n + fits.B.n));
    out.rms = rmsAll;
    var worst = null;
    holes.forEach(function (H) {
      var ss = byHole[H.n] || [], errs = [], near = Math.min(G.planar(fits.A, H.x, H.y), G.planar(fits.B, H.x, H.y));
      ss.forEach(function (s) {
        if (!s.A || !s.B) return;
        var p = G.locate(s.A[0] + ballR - fits.A.off, s.B[0] + ballR - fits.B.off, fits.A, fits.B, s.depth, { x: H.x, y: H.y }, plane);
        errs.push(U.hypot(p.x - H.x, p.y - H.y));
      });
      var e = errs.length ? U.mean(errs) : null, rec = { n: H.n, x: H.x, y: H.y, err: e, near: near, skipped: !ss.length };
      out.holes.push(rec); if (e !== null && (!worst || e > worst.err)) worst = rec;
    });
    out.worstHole = worst;
    var skipped = out.holes.filter(function (h) { return h.skipped; }).length;
    if (skipped > 2) { out.ok = false; out.codes.push('P2'); }
    if (rmsAll > CAL.fitPassMm) { out.ok = false; out.codes.push('P2'); }
    // P6 holes too near a sensor
    if (out.holes.some(function (h) { return h.near < CAL.nearMm; })) out.codes.push('P6');
    // P1 fitted vs typed
    ['A', 'B'].forEach(function (k) { if (fits[k].moved > CAL.poseFailMm) { out.ok = false; out.codes.push('P1'); } });
    // P9 heights differ
    if (Math.abs(fits.A.z - fits.B.z) > CAL.heightDiffMm) out.codes.push('P9');
    // S2 offsets (informational unless extreme)
    ['A', 'B'].forEach(function (k) { if (Math.abs(fits[k].off) > 80) { out.ok = false; out.codes.push('S2'); } });
    // S5 A vs B strength on mirror-image holes (hole n ↔ hole with mirrored column)
    var dbGap = F.mirrorStrengthGap(fits, holes); out.strengthGapDb = dbGap;
    if (dbGap !== null && Math.abs(dbGap) > CAL.strengthGapDb) out.codes.push('S5');
    // P4 yaw estimate from the strength map, P5 tilt from 60 vs 160 strength
    ['A', 'B'].forEach(function (k) {
      var yaw = F.yawFromStrength(fits[k], holes), tilt = F.tiltFromStrength(fits[k]);
      fits[k].yawEst = yaw; fits[k].tiltRatio = tilt;
      if (yaw !== null && Math.abs(yaw - cfg.sensors[k].yaw) > 20) out.codes.push('P4');
      if (tilt !== null && (tilt > 3 || tilt < 0.33)) out.codes.push('P5');
    });
    out.codes = out.codes.filter(function (c, i, a) { return a.indexOf(c) === i; });
    // Static-object reading for the stillness threshold: spread of the still ball's readings
    var stillSpread = [];
    samples.forEach(function (s) { if (s.spread != null) stillSpread.push(s.spread); });
    out.staticSpread = stillSpread.length ? U.median(stillSpread) : null;
    return out;
  };
  F.mirrorStrengthGap = function (fits, holes) {
    var byA = {}, byB = {};
    fits.A.strs.forEach(function (s) { byA[s.hole + '/' + s.depth] = s.str; });
    fits.B.strs.forEach(function (s) { byB[s.hole + '/' + s.depth] = s.str; });
    var gaps = [];
    holes.forEach(function (H) {
      var row = Math.floor((H.n - 1) / 4), col = (H.n - 1) % 4, mirror = row * 4 + (3 - col) + 1;
      [60, 160].forEach(function (d) { var a = byA[H.n + '/' + d], b = byB[mirror + '/' + d]; if (a > 0 && b > 0) gaps.push(10 * Math.log10(a / b)); });
    });
    return gaps.length ? U.mean(gaps) : null;
  };
  // Direction of the strength-weighted centroid of the holes, seen from the fitted sensor (deg, 0 = +x).
  F.yawFromStrength = function (fit, holes) {
    var sx = 0, sy = 0, sw = 0;
    fit.strs.forEach(function (s) { var H = holes[s.hole - 1], d = G.planar(fit, H.x, H.y) || 1, w = s.str * d * d; sx += w * (H.x - fit.x) / d; sy += w * (H.y - fit.y) / d; sw += w; });
    if (sw <= 0) return null; return U.deg(Math.atan2(sy, sx));
  };
  // Ratio of mean strength at 60 mm to 160 mm, distance-normalised. ~1 means the beam covers both depths.
  F.tiltFromStrength = function (fit) {
    var a = [], b = [];
    fit.strs.forEach(function (s) { (s.depth === 60 ? a : b).push(s.str); });
    if (!a.length || !b.length) return null; return U.mean(a) / Math.max(1, U.mean(b));
  };

  // C8 hand profile: samples [{hole, high:true|false, A:[d,str], B:[d,str]}] plus stillHold: [{A:d,B:d}] frames.
  // Returns {zwork, strMin, strMax, stillThr, points:[{n, spread, ok}], codes}
  F.handProfile = function (samples, stillHold, cfg, staticSpread) {
    var A = cfg.sensors.A, B = cfg.sensors.B, plane = cfg.plane, holes = G.templateHoles(plane), depths = [], strs = [], points = [], codes = [];
    var byHole = {};
    samples.forEach(function (s) { if (!s.A || !s.B) return; (byHole[s.hole] || (byHole[s.hole] = [])).push(s); });
    holes.forEach(function (H) {
      var ss = byHole[H.n] || [], est = [];
      ss.forEach(function (s) {
        strs.push(s.A[1], s.B[1]);
        var rr = [s.A[0] - (A.off || 0), s.B[0] - (B.off || 0)], hs = [];
        [[A, rr[0]], [B, rr[1]]].forEach(function (q) { var pl = G.planar(q[0], H.x, H.y), v2 = q[1] * q[1] - pl * pl; if (v2 > 0) hs.push(Math.sqrt(v2) - q[0].z); });
        if (hs.length) { var h = U.mean(hs); depths.push(h); var p = G.locate(rr[0], rr[1], A, B, h, { x: H.x, y: H.y }, plane); est.push(U.hypot(p.x - H.x, p.y - H.y)); }
      });
      var spread = est.length ? U.std(est) + U.mean(est) * 0.5 : null;
      points.push({ n: H.n, samples: ss.length, spread: spread, ok: ss.length >= 2 && (spread === null || spread <= 25), missing: !ss.length });
    });
    var missing = points.filter(function (p) { return p.missing; }).length;
    if (missing > 0) codes.push('H1');
    if (points.some(function (p) { return !p.missing && !p.ok; })) codes.push('H5');
    var zwork = depths.length ? U.median(depths) : cfg.hand.zwork;
    if (zwork < cfg.hand.zmin || zwork > cfg.hand.zmax) codes.push('H3');
    var srt = strs.slice().sort(function (a, b) { return a - b; }), lo = srt.length ? srt[Math.floor(srt.length * 0.05)] : cfg.hand.strMin, hi = srt.length ? srt[Math.floor(srt.length * 0.95)] : cfg.hand.strMax;
    var strMin = Math.max(50, lo * 0.5), strMax = hi * 2.0;
    // Stillness threshold: between the static object's spread and a still hand's movement
    var handMove = null;
    if (stillHold && stillHold.length > 4) {
      var pts = stillHold.map(function (f) { return G.locate(f.A - (A.off || 0), f.B - (B.off || 0), A, B, zwork, null, plane); });
      var cx = U.mean(pts.map(function (p) { return p.x; })), cy = U.mean(pts.map(function (p) { return p.y; }));
      handMove = U.rms(pts.map(function (p) { return U.hypot(p.x - cx, p.y - cy); }));
    }
    var stat = staticSpread == null ? 2.5 : staticSpread, stillThr = cfg.hand.stillThr;
    if (handMove !== null) {
      if (handMove < stat * 1.6) codes.push('H4');
      stillThr = U.round(Math.max(3, Math.min(handMove * 0.5, stat * 2.5 + (handMove - stat) * 0.4)), 1);
    }
    return { zwork: U.round(zwork, 1), strMin: Math.round(strMin), strMax: Math.round(strMax), stillThr: stillThr, handMove: handMove, staticSpread: stat, points: points, codes: codes, ok: codes.length === 0 || (codes.length === 1 && codes[0] === 'H5') };
  };
})();
