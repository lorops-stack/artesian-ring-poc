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
  F.fitSensor = function (pts, meas, s0, priorSd, noiseSd, opts) {
    priorSd = priorSd || 15; noiseSd = noiseSd || 8; opts = opts || {};
    var q = [s0.x, s0.y, s0.z, 0], wp = noiseSd / priorSd, i, it, weights = new Array(pts.length).fill(1);
    for (it = 0; it < 40; it++) {
      var J = [], r = [];
      for (i = 0; i < pts.length; i++) {
        var dx = q[0] - pts[i].x, dy = q[1] - pts[i].y, dz = q[2] + pts[i].h, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        var rr = d + q[3] - meas[i], sw = Math.sqrt(weights[i]);
        J.push([sw * dx / d, sw * dy / d, sw * dz / d, sw]); r.push(sw * rr);
      }
      J.push([wp, 0, 0, 0]); r.push(wp * (q[0] - s0.x));
      J.push([0, wp, 0, 0]); r.push(wp * (q[1] - s0.y));
      var wz = opts.fixZ ? noiseSd / 0.5 : wp;          // flat mount: the sensor height is not observable and is held at the typed value
      J.push([0, 0, wz, 0]); r.push(wz * (q[2] - s0.z));
      var step = solveNormal(J, r, 4), mx = 0;
      for (i = 0; i < 4; i++) { q[i] -= step[i]; mx = Math.max(mx, Math.abs(step[i])); }
      // Huber IRLS: preserve normal measurements while preventing one multipath return from dragging the installation fit.
      var absr = []; for (i = 0; i < pts.length; i++) { var ax=q[0]-pts[i].x, ay=q[1]-pts[i].y, az=q[2]+pts[i].h; absr.push(Math.abs(Math.sqrt(ax*ax+ay*ay+az*az)+q[3]-meas[i])); }
      var mad = U.median(absr), scale = Math.max(2, mad / 0.6745), huber = 1.5 * scale;
      for (i = 0; i < pts.length; i++) weights[i] = absr[i] <= huber ? 1 : huber / absr[i];
      if (mx < 1e-4) break;
    }
    var resid = [];
    for (i = 0; i < pts.length; i++) { var ddx = q[0] - pts[i].x, ddy = q[1] - pts[i].y, ddz = q[2] + pts[i].h; resid.push(Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz) + q[3] - meas[i]); }
    var absFinal=resid.map(Math.abs), med=U.median(absFinal), sc=Math.max(2,med/0.6745), outliers=[];
    for(i=0;i<resid.length;i++) if(Math.abs(resid[i])>Math.max(12,3*sc)) outliers.push(i);
    return { x: q[0], y: q[1], z: q[2], off: q[3], rms: U.rms(resid), robustRms: U.rms(resid.filter(function(_,ix){return outliers.indexOf(ix)<0;})), resid: resid, outliers: outliers, scale: sc };
  };

  // Full C7 evaluation. samples: [{hole:n, depth:60|160, A:[d,str]|null, B:[d,str]|null}] (readings to the ball surface).
  // cfg: current configuration. Returns the report used by the studio and the fixes it triggers.
  F.wandFit = function (samples, cfg) {
    var plane = cfg.plane, holes = G.templateHoles(plane), ballR = RS.CAL.ballR, CAL = RS.CAL, out = { ok: true, codes: [], holes: [] }, flat = RS.mountOf(cfg) === 'flat';
    var byHole = {}, i;
    samples.forEach(function (s) { (byHole[s.hole] || (byHole[s.hole] = [])).push(s); });
    var fits = {};
    ['A', 'B'].forEach(function (k) {
      var pts = [], meas = [], strs = [];
      samples.forEach(function (s) { if (!s[k]) return; var H = holes[s.hole - 1]; pts.push({ x: H.x, y: H.y, h: s.depth }); meas.push(s[k][0] + ballR); strs.push({ hole: s.hole, depth: s.depth, str: s[k][1] }); });
      if (pts.length < 6) { fits[k] = null; return; }
      var f = F.fitSensor(pts, meas, cfg.sensors[k], null, null, { fixZ: flat }); f.n = pts.length; f.strs = strs; f.pts = pts; f.typed = { x: cfg.sensors[k].x, y: cfg.sensors[k].y, z: cfg.sensors[k].z };
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
    // Independent validation: refit while withholding one hole at a time, then predict that hole.
    // This prevents a low training RMS from disguising a calibration that does not generalise across the sink.
    var cv = [];
    holes.forEach(function(H) {
      var held = samples.filter(function(s){return s.hole===H.n && s.A && s.B;}); if(!held.length) return;
      var train = samples.filter(function(s){return s.hole!==H.n;}); var ff={};
      ['A','B'].forEach(function(k){ var pts=[],meas=[]; train.forEach(function(s){if(!s[k])return;var P=holes[s.hole-1];pts.push({x:P.x,y:P.y,h:s.depth});meas.push(s[k][0]+ballR);}); ff[k]=pts.length>=6?F.fitSensor(pts,meas,cfg.sensors[k],null,null,{fixZ:flat}):null; });
      if(!ff.A||!ff.B)return; var errs=[];
      held.forEach(function(s){var p=G.locate(s.A[0]+ballR-ff.A.off,s.B[0]+ballR-ff.B.off,ff.A,ff.B,s.depth,{x:H.x,y:H.y},plane);errs.push(U.hypot(p.x-H.x,p.y-H.y));});
      cv.push({n:H.n,err:U.mean(errs)});
    });
    out.validation = cv; out.validationRms = cv.length ? Math.sqrt(U.mean(cv.map(function(v){return v.err*v.err;}))) : null;
    out.validationWorst = cv.length ? cv.reduce(function(a,b){return b.err>a.err?b:a;}) : null;
    var outlierCount=(fits.A.outliers||[]).length+(fits.B.outliers||[]).length; out.outliers=outlierCount;
    var vr=out.validationRms==null?999:out.validationRms, we=out.validationWorst?out.validationWorst.err:999;
    out.quality = (!out.ok||vr>35||we>55)?'fail':(vr<=12&&we<=25&&outlierCount<=2?'excellent':(vr<=22&&we<=40?'good':'marginal'));
    var skipped = out.holes.filter(function (h) { return h.skipped; }).length;
    if (skipped > 2) { out.ok = false; out.codes.push('P2'); }
    if (rmsAll > CAL.fitPassMm) { out.ok = false; out.codes.push('P2'); }
    // P6 holes too near a sensor
    if (out.holes.some(function (h) { return h.near < CAL.nearMm; })) out.codes.push('P6');
    // P1 fitted vs typed
    ['A', 'B'].forEach(function (k) { if (fits[k].moved > CAL.poseFailMm) { out.ok = false; out.codes.push('P1'); } });
    // P9 heights differ
    if (!flat && Math.abs(fits.A.z - fits.B.z) > CAL.heightDiffMm) out.codes.push('P9');
    // S2 offsets (informational unless extreme)
    ['A', 'B'].forEach(function (k) { if (Math.abs(fits[k].off) > 80) { out.ok = false; out.codes.push('S2'); } });
    // S5 A vs B strength on mirror-image holes (hole n ↔ hole with mirrored column)
    var dbGap = F.mirrorStrengthGap(fits, holes); out.strengthGapDb = dbGap;
    if (dbGap !== null && Math.abs(dbGap) > CAL.strengthGapDb) out.codes.push('S5');
    // P4 yaw estimate from the strength map, P5 tilt from 60 vs 160 strength
    ['A', 'B'].forEach(function (k) {
      var yaw = F.yawFromStrength(fits[k], holes, cfg.tuning.beamHalf), tilt = F.tiltFromStrength(fits[k]);
      fits[k].yawEst = yaw; fits[k].tiltRatio = tilt;
      if (yaw !== null && Math.abs(yaw - cfg.sensors[k].yaw) > 20) out.codes.push('P4');
      if (!flat && tilt !== null && (tilt > 3 || tilt < 0.33)) out.codes.push('P5');
    });
    out.codes = out.codes.filter(function (c, i, a) { return a.indexOf(c) === i; });
    // Static-object reading for the stillness threshold: spread of the still ball's readings
    var stillSpread = [];
    samples.forEach(function (s) { if (s.spread != null) stillSpread.push(s.spread); });
    out.staticSpread = stillSpread.length ? U.median(stillSpread) : null;
    return out;
  };
  F.depthsOf = function (fits) { var d = {}; ['A', 'B'].forEach(function (k) { if (fits[k]) fits[k].strs.forEach(function (s) { d[s.depth] = 1; }); }); return Object.keys(d).map(Number).sort(function (a, b) { return a - b; }); };
  F.mirrorStrengthGap = function (fits, holes) {
    var byA = {}, byB = {};
    fits.A.strs.forEach(function (s) { byA[s.hole + '/' + s.depth] = s.str; });
    fits.B.strs.forEach(function (s) { byB[s.hole + '/' + s.depth] = s.str; });
    var gaps = [];
    holes.forEach(function (H) {
      var row = Math.floor((H.n - 1) / 4), col = (H.n - 1) % 4, mirror = row * 4 + (3 - col) + 1;
      F.depthsOf(fits).forEach(function (d) { var a = byA[H.n + '/' + d], b = byB[mirror + '/' + d]; if (a > 0 && b > 0) gaps.push(10 * Math.log10(a / b)); });
    });
    return gaps.length ? U.mean(gaps) : null;
  };
  // Where does the beam actually point? Strengths are normalised for spreading (× d²) and compared with a beam
  // model exp(-0.7 (Δangle / half)²) over every candidate yaw; the best-correlated yaw is the estimate (deg, 0 = +x).
  F.yawFromStrength = function (fit, holes, half) {
    half = half || 60; var obs = [];
    fit.strs.forEach(function (s) { var H = holes[s.hole - 1], d = G.planar(fit, H.x, H.y) || 1; if (s.str > 0) obs.push({ ang: U.deg(Math.atan2(H.y - fit.y, H.x - fit.x)), v: Math.log(s.str * d * d) }); });
    if (obs.length < 6) return null;
    var mv = U.mean(obs.map(function (o) { return o.v; })), best = null;
    for (var yaw = 0; yaw < 360; yaw += 2) {
      var m = obs.map(function (o) { var a = o.ang - yaw; while (a > 180) a -= 360; while (a < -180) a += 360; return -0.7 * Math.pow(a / half, 2); });
      var mm = U.mean(m), num = 0, da = 0, db = 0;
      for (var i = 0; i < obs.length; i++) { num += (obs[i].v - mv) * (m[i] - mm); da += Math.pow(obs[i].v - mv, 2); db += Math.pow(m[i] - mm, 2); }
      var corr = da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
      if (!best || corr > best.corr) best = { yaw: yaw, corr: corr };
    }
    return best && best.corr > 0.3 ? best.yaw : null;   // too little angular spread to tell: no estimate
  };
  // Ratio of mean strength at the shallow wand depth to the deep one. ~1 means the beam covers both depths.
  F.tiltFromStrength = function (fit) {
    var a = [], b = [];
    var lo = Math.min.apply(null, fit.strs.map(function (s) { return s.depth; }));
    fit.strs.forEach(function (s) { (s.depth === lo ? a : b).push(s.str); });
    if (!a.length || !b.length) return null; return U.mean(a) / Math.max(1, U.mean(b));
  };

  // C8 hand profile: samples [{hole, high:true|false, A:[d,str], B:[d,str]}] plus stillHold: [{A:d,B:d}] frames.
  // Returns {zwork, strMin, strMax, stillThr, points:[{n, spread, ok}], codes}
  F.handProfile = function (samples, stillHold, cfg, staticSpread) {
    var A = cfg.sensors.A, B = cfg.sensors.B, plane = cfg.plane, holes = G.templateHoles(plane), depths = [], strs = [], env = [], points = [], codes = [];
    var byHole = {};
    samples.forEach(function (s) { if (!s.A || !s.B) return; (byHole[s.hole] || (byHole[s.hole] = [])).push(s); });
    holes.forEach(function (H) {
      var ss = byHole[H.n] || [], est = [];
      ss.forEach(function (s) {
        strs.push(s.A[1], s.B[1]); env.push([s.A[0], s.A[1]], [s.B[0], s.B[1]]);
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
    // Flat mount: the hand is about level with the sensors, so v² = r² - p² is almost pure noise (±50 mm). The depth is not estimated
    // there; the typed value stays (it only matters at about v²/2p, a few mm, and the side view in the Aim screen is where to set it).
    var flat = RS.mountOf(cfg) === 'flat';
    var zwork = flat || !depths.length ? cfg.hand.zwork : U.median(depths);
    if (!flat && (zwork < cfg.hand.zmin || zwork > cfg.hand.zmax)) codes.push('H3');
    var srt = strs.slice().sort(function (a, b) { return a - b; }), lo = srt.length ? srt[Math.floor(srt.length * 0.05)] : cfg.hand.strMin, hi = srt.length ? srt[Math.floor(srt.length * 0.95)] : cfg.hand.strMax;
    var strMin = Math.max(1, lo * 0.5), strMax = hi * 2.0;   // measured XM125 hand echoes run 5 to 170, so no absolute floor
    // Strength-vs-range envelope: ln(s) = ln(envRef) - k ln(d / 300), least squares over every sample from both sensors.
    // k is held to 1..4 (point targets fall as d^-2 in amplitude); fewer than 6 samples keep k = 2 and fit envRef alone.
    var envRef = cfg.hand.envRef || 0, envK = cfg.hand.envK || 2, ev = env.filter(function (e) { return e[0] > 0 && e[1] > 0; });
    if (ev.length >= 3) {
      var xs = ev.map(function (e) { return Math.log(e[0] / 300); }), ys = ev.map(function (e) { return Math.log(e[1]); }), mx = U.mean(xs), my = U.mean(ys), sxx = 0, sxy = 0;
      for (var q = 0; q < xs.length; q++) { sxx += (xs[q] - mx) * (xs[q] - mx); sxy += (xs[q] - mx) * (ys[q] - my); }
      if (ev.length >= 6 && sxx > 0.05) envK = U.clamp(-sxy / sxx, 1, 4); else envK = 2;
      envRef = Math.exp(my + envK * mx);
    }
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
    return { zwork: U.round(zwork, 1), strMin: Math.round(strMin), strMax: Math.round(strMax), stillThr: stillThr, envRef: U.round(envRef, 1), envK: U.round(envK, 2), handMove: handMove, staticSpread: stat, points: points, codes: codes, ok: codes.length === 0 || (codes.length === 1 && codes[0] === 'H5') };
  };
  // ---- Self-calibration from a free sweep (Aim screen) -----------------------------------------------------------------------------------
  // Position needs only the sensor positions, not their angles; the aim only changes how strong the echoes are. So the aim can be
  // read from the strengths while a hand moves around the sink: the beam is strongest along its centre line.
  // samples: [{x, y, s}] = tracked hand fix (mm) and the linear strength this sensor reported for the echo paired with it.
  // Strength falls with distance², so v = ln(s·d²) is fitted against the bearing as v = a·r² + b·r + c (r = bearing minus the typed yaw);
  // the peak r0 = -b / 2a is the beam centre. Returns null with a reason when the sweep cannot tell.
  F.aimFromSamples = function (samples, pose, minSpreadDeg) {
    minSpreadDeg = minSpreadDeg || 35;
    var pts = [], i;
    for (i = 0; i < samples.length; i++) {
      var q = samples[i], dx = q.x - pose.x, dy = q.y - pose.y, d = U.hypot(dx, dy); if (d < 90 || !(q.s > 0)) continue;
      var rel = U.deg(Math.atan2(dy, dx)) - pose.yaw; while (rel > 180) rel -= 360; while (rel < -180) rel += 360;
      pts.push({ r: rel, v: Math.log(q.s * d * d) });
    }
    var out = { n: pts.length, spread: 0, yaw: null, delta: null, half: null, r2: 0, quality: 'none', why: '' };
    if (pts.length < 30) { out.why = 'Keep moving your hand around the whole sink'; return out; }
    var lo = Infinity, hi = -Infinity; pts.forEach(function (p) { if (p.r < lo) lo = p.r; if (p.r > hi) hi = p.r; });
    // spread from the 5th to the 95th percentile so one stray fix does not count as coverage
    var rs = pts.map(function (p) { return p.r; }).sort(function (a, b) { return a - b; }); lo = rs[Math.floor(rs.length * 0.05)]; hi = rs[Math.floor(rs.length * 0.95)];
    out.spread = hi - lo; out.lo = lo; out.hi = hi;
    if (out.spread < minSpreadDeg) { out.why = 'Cover more of the sink, especially the far sides'; return out; }
    // normal equations for v = a r² + b r + c
    var S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], T = [0, 0, 0];
    pts.forEach(function (p) { var f = [p.r * p.r, p.r, 1]; for (var u = 0; u < 3; u++) { T[u] += f[u] * p.v; for (var w = 0; w < 3; w++) S[u][w] += f[u] * f[w]; } });
    var sol = solve3(S, T); if (!sol) { out.why = 'The readings were too flat to tell'; return out; }
    var a = sol[0], b = sol[1], c0 = sol[2], mean = U.mean(pts.map(function (p) { return p.v; })), ssTot = 0, ssRes = 0;
    pts.forEach(function (p) { var fit = a * p.r * p.r + b * p.r + c0; ssTot += Math.pow(p.v - mean, 2); ssRes += Math.pow(p.v - fit, 2); });
    out.r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
    if (!(a < -1e-5)) { out.why = 'No clear peak in the echo strength. Sweep slowly across the whole sink'; return out; }
    var r0 = -b / (2 * a);
    if (r0 < lo - 15 || r0 > hi + 15) { out.why = 'The strongest direction is outside where you swept. Sweep a wider area'; out.rawDelta = r0; return out; }
    out.delta = r0; out.yaw = ((pose.yaw + r0) % 360 + 360) % 360; out.half = Math.sqrt(0.7 / -a);
    out.quality = (out.r2 > 0.5 && out.spread > 60 && pts.length > 120) ? 'good' : (out.r2 > 0.2 ? 'fair' : 'poor');
    return out;
  };
  function solve3(M, T) {
    var A = M.map(function (r, i) { return r.concat([T[i]]); }), n = 3, i, j, k;
    for (i = 0; i < n; i++) {
      var p = i; for (j = i + 1; j < n; j++) if (Math.abs(A[j][i]) > Math.abs(A[p][i])) p = j;
      if (Math.abs(A[p][i]) < 1e-12) return null; var t = A[i]; A[i] = A[p]; A[p] = t;
      for (j = i + 1; j < n; j++) { var f = A[j][i] / A[i][i]; for (k = i; k <= n; k++) A[j][k] -= f * A[i][k]; }
    }
    var x = [0, 0, 0]; for (i = n - 1; i >= 0; i--) { var s = A[i][n]; for (j = i + 1; j < n; j++) s -= A[i][j] * x[j]; x[i] = s / A[i][i]; }
    return x;
  }
  // Baseline check. For any real point the plane triangle holds: |pA - pB| <= L <= pA + pB (p = planar distances, from the ranges).
  // So a sweep brackets the sensor spacing L: the largest |pA - pB| is a floor, the smallest pA + pB a ceiling. Robust percentiles are used.
  // samples: [{rA, rB}] raw ranges of the paired echoes (mm). Returns {lo, hi, base, status: 'ok'|'low'|'high'|'wide'|'few', msg}.
  F.baselineBracket = function (samples, cfg) {
    var A = cfg.sensors.A, B = cfg.sensors.B, v = cfg.hand.zwork, diffs = [], sums = [];
    samples.forEach(function (s) {
      var rA = s.rA - (A.off || 0), rB = s.rB - (B.off || 0), vA = v + (A.z || 0), vB = v + (B.z || 0);
      if (rA <= Math.abs(vA) || rB <= Math.abs(vB)) return;
      var pA = Math.sqrt(rA * rA - vA * vA), pB = Math.sqrt(rB * rB - vB * vB); diffs.push(Math.abs(pA - pB)); sums.push(pA + pB);
    });
    var base = U.hypot(A.x - B.x, A.y - B.y), out = { n: diffs.length, base: base, lo: null, hi: null, status: 'few', msg: 'Move your hand around the sink for a few seconds' };
    if (diffs.length < 40) return out;
    diffs.sort(function (a, b) { return a - b; }); sums.sort(function (a, b) { return a - b; });
    out.lo = diffs[Math.floor(diffs.length * 0.98)]; out.hi = sums[Math.floor(sums.length * 0.02)];
    var tol = 25;
    if (base < out.lo - tol) { out.status = 'low'; out.msg = 'The readings need the sensors at least ' + Math.round(out.lo) + ' mm apart, but the spacing is set to ' + Math.round(base) + ' mm. Re-measure, or check the distance offsets (S2).'; }
    else if (base > out.hi + tol) { out.status = 'high'; out.msg = 'The readings put the sensors at most ' + Math.round(out.hi) + ' mm apart, but the spacing is set to ' + Math.round(base) + ' mm. Re-measure, or check the distance offsets (S2).'; }
    else if (out.hi - out.lo > 120) { out.status = 'wide'; out.msg = 'Consistent so far. Sweep along the back edge, between the sensors, to tighten the check.'; }
    else { out.status = 'ok'; out.msg = 'Consistent: the readings fit a spacing of ' + Math.round(out.lo) + ' to ' + Math.round(out.hi) + ' mm.'; }
    return out;
  };
})();
