// Reflection and tracking filters on the 406 x 330 bench rig: closed-form solver, first-arrival rule, strength
// envelope, kinematic gate. Numbers come from the 1 Oct 2026 bench (hand strengths 5 to 170, body 70 to 470).
const test = require('node:test');
const assert = require('node:assert');
const RS = require('./load')();

function rig() {
  const c = RS.presetConfig('flat');
  c.plane.w = 406.4; c.plane.d = 330.2; c.sensors.A.x = 0; c.sensors.A.y = 0; c.sensors.B.x = 406.4; c.sensors.B.y = 0;
  c.sensors.A.yaw = 41; c.sensors.B.yaw = 141; c.tuning.nearWin = 120;
  return c;
}
const G = () => RS.geo;

test('closed-form solver: exact recovery everywhere including the back strip, never the mirror root', () => {
  const c = rig(), A = c.sensors.A, B = c.sensors.B, h = c.hand.zwork;
  for (const [x, y] of [[203, 10], [50, 30], [380, 60], [203, 165], [20, 300], [400, 330], [203, 100]]) {
    const p = G().locate(G().range(A, x, y, h), G().range(B, x, y, h), A, B, h, null, c.plane);
    assert.ok(Math.hypot(p.x - x, p.y - y) < 0.01, `(${x},${y}) -> (${p.x.toFixed(2)},${p.y.toFixed(2)})`);
    assert.ok(p.y >= 0, 'sink-side root');
  }
});

test('closed-form solver: circles that fall short land on the baseline with a residual, same answer every call', () => {
  const c = rig(), A = c.sensors.A, B = c.sensors.B;
  const p = G().locate(180, 190, A, B, 0, null, c.plane);        // 370 < 406 base: 36 mm short
  assert.ok(Math.abs(p.y) < 1e-6, 'on the baseline'); assert.ok(p.res > 20 && p.res < 40, 'residual is the shortfall: ' + p.res);
  assert.ok(p.x > 180 && p.x < 230, 'between the sensors');
  const q = G().locate(180, 190, A, B, 0, { x: 203, y: 0 }, c.plane);
  assert.deepEqual([p.x, p.y, p.res], [q.x, q.y, q.res], 'the guess does not change the answer');
});

test('back-edge lock is gone: a track pinned at y=0 does not drag the next fix onto the edge', () => {
  const c = rig(), A = c.sensors.A, B = c.sensors.B, h = c.hand.zwork;
  const rA = G().range(A, 203, 100, h), rB = G().range(B, 203, 100, h);
  const r = G().associate([[Math.round(rA), 60]], [[Math.round(rB), 60]], { A, B, hand: c.hand, plane: c.plane, prev: { x: 203, y: 0 }, maxJump: 220, nearWin: 120 });
  assert.equal(r.flag, 0); assert.ok(Math.abs(r.y - 100) < 2, 'y follows the ranges, got ' + r.y);
  assert.ok(Math.abs(r.uy - r.y) < 1e-6 && Math.abs(r.ux - r.x) < 1e-6, 'raw fix inside the plane equals the clamped one');
  const edge = G().associate([[Math.round(G().range(A, -12, 150, h)), 60]], [[Math.round(G().range(B, -12, 150, h)), 60]], { A, B, hand: c.hand, plane: c.plane, nearWin: 120 });
  assert.equal(edge.flag, RS.FLAG.OUTSIDE, 'an out-of-plane fix is rejected instead of being clamped onto the edge');
  // behind the baseline there is no information: the solver always returns the sink-side root
  const back = G().locate(G().range(A, 203, -12, h), G().range(B, 203, -12, h), A, B, h, null, c.plane);
  assert.ok(back.y > 0, 'mirror root is never returned');
});

test('first-arrival rule: a metal-sink bounce later than the hand is dropped on both sensors', () => {
  const c = rig(), A = c.sensors.A, B = c.sensors.B, h = c.hand.zwork, x = 200, y = 180;
  const rA = Math.round(G().range(A, x, y, h)), rB = Math.round(G().range(B, x, y, h));
  // bounces: 90 mm and 160 mm later, as strong as or stronger than the hand, plus a far second bounce
  const eA = [[rA, 55], [rA + 90, 70], [rA + 240, 30]], eB = [[rB, 48], [rB + 160, 60]];
  const r = G().associate(eA, eB, { A, B, hand: c.hand, plane: c.plane, nearWin: 120 });
  assert.equal(r.flag, 0); assert.equal(r.iA, 0); assert.equal(r.iB, 0);
  assert.ok(Math.hypot(r.x - x, r.y - y) < 3, `fix at ${r.x.toFixed(0)},${r.y.toFixed(0)}`);
  // a strong metal echo alone cannot set the reference any more: no 25% rule, the nearest surviving echo is the reference
  const eA2 = [[rA, 12], [rA + 90, 170]], eB2 = [[rB, 10], [rB + 160, 160]];
  const r2 = G().associate(eA2, eB2, { A, B, hand: c.hand, plane: c.plane, nearWin: 120 });
  assert.equal(r2.flag, 0); assert.equal(r2.iA, 0); assert.equal(r2.iB, 0, 'the weak direct echo wins over the strong bounce');
});

test('track-aware reference: a cup set down nearer sensor A than the hand does not steal an established track', () => {
  const c = rig(), A = c.sensors.A, B = c.sensors.B, h = c.hand.zwork;
  const hand = { x: 150, y: 200 }, cup = { x: 100, y: 80 };
  const eA = [[Math.round(G().range(A, cup.x, cup.y, h)), 40], [Math.round(G().range(A, hand.x, hand.y, h)), 20]];
  const eB = [[Math.round(G().range(B, hand.x, hand.y, h)), 20], [Math.round(G().range(B, cup.x, cup.y, h)), 40]];
  const r = G().associate(eA, eB, { A, B, hand: c.hand, plane: c.plane, prev: hand, maxJump: 220, nearWin: 120 });
  assert.equal(r.flag, 0); assert.ok(Math.hypot(r.x - hand.x, r.y - hand.y) < 5, `stayed on the hand: ${r.x.toFixed(0)},${r.y.toFixed(0)}`);
  // with no track the nearest pair is taken, which is the cup: that is the acquisition rule and is expected
  const r0 = G().associate(eA, eB, { A, B, hand: c.hand, plane: c.plane, nearWin: 120 });
  assert.equal(r0.flag, 0); assert.ok(Math.hypot(r0.x - cup.x, r0.y - cup.y) < 5);
});

test('strength envelope: a hand-shaped echo passes, a metal wall at the same range is rejected, off means unchanged', () => {
  const c = rig(), A = c.sensors.A, B = c.sensors.B, h = c.hand.zwork;
  const hand = Object.assign({}, c.hand, { envRef: 60, envK: 2, envDb: 12 });
  assert.ok(G().strengthInEnvelope(hand, 300, 60)); assert.ok(G().strengthInEnvelope(hand, 300, 20)); assert.ok(G().strengthInEnvelope(hand, 150, 180));
  assert.ok(!G().strengthInEnvelope(hand, 250, 400), 'metal at 250 mm'); assert.ok(!G().strengthInEnvelope(hand, 300, 4), 'a far second bounce');
  assert.ok(G().strengthInEnvelope(c.hand, 250, 400), 'envRef 0 is off');
  const x = 200, y = 180, rA = Math.round(G().range(A, x, y, h)), rB = Math.round(G().range(B, x, y, h));
  const metal = G().associate([[rA, 400]], [[rB, 380]], { A, B, hand, plane: c.plane, nearWin: 120 });
  assert.equal(metal.flag, RS.FLAG.STRENGTH);
  const ok = G().associate([[rA, 70]], [[rB, 55]], { A, B, hand, plane: c.plane, nearWin: 120 });
  assert.equal(ok.flag, 0);
});

test('C8 fits the envelope from samples and no longer forces a strength floor of 50', () => {
  const c = rig(), A = c.sensors.A, B = c.sensors.B, h = c.hand.zwork, holes = G().templateHoles(c.plane), samples = [];
  holes.forEach(H => { for (let k = 0; k < 2; k++) {
    const dA = G().range(A, H.x, H.y, h), dB = G().range(B, H.x, H.y, h);
    samples.push({ hole: H.n, high: k === 0, A: [Math.round(dA), 60 * Math.pow(300 / dA, 2)], B: [Math.round(dB), 60 * Math.pow(300 / dB, 2)] });
  } });
  const r = RS.fit.handProfile(samples, [], c, 2.5);
  assert.ok(r.strMin < 50, 'no absolute floor: ' + r.strMin);
  assert.ok(Math.abs(r.envRef - 60) < 3, 'envRef ' + r.envRef); assert.ok(Math.abs(r.envK - 2) < 0.1, 'envK ' + r.envK);
});

test('tracker predict: a moving track is extrapolated and the kinematic gate follows it', () => {
  const T = new (G().Tracker)(); T.setAlpha(0.6);
  for (let i = 0; i < 8; i++) T.update(100 + 20 * i, 150, 1000 + 43 * i);
  const p = T.predict(1000 + 43 * 8);
  assert.ok(p.x > 100 + 20 * 7.5, 'ahead of the last update: ' + p.x.toFixed(1)); assert.ok(Math.abs(p.y - 150) < 1);
});

test('simulator: a hand in a stainless bowl is tracked to the truth despite wall reflections', () => {
  const sim = new RS.Sim(rig()); sim.setFault('metalSink', true);
  let now = 1000; for (let i = 0; i < 60; i++) { now += 45; sim.tick(now); }
  const errs = [], truth = { x: 180, y: 170 };
  for (let i = 0; i < 120; i++) { now += 45; sim.setHand({ x: truth.x + 30 * Math.sin(i / 10), y: truth.y, h: sim.cfg.hand.zwork }, false); const f = sim.tick(now); if (f && f.hx != null && i > 10) errs.push(Math.hypot(f.hx - (truth.x + 30 * Math.sin(i / 10)), f.hy - truth.y)); }
  errs.sort((a, b) => a - b);
  assert.ok(errs.length > 80, 'fixes most frames: ' + errs.length);
  assert.ok(errs[Math.floor(errs.length / 2)] < 25, 'median error mm: ' + errs[Math.floor(errs.length / 2)].toFixed(1));
  assert.ok(errs[Math.floor(errs.length * 0.95)] < 60, '95th percentile mm: ' + errs[Math.floor(errs.length * 0.95)].toFixed(1));
});

test('simulator: two agreeing jumps re-acquire, one stray frame does not move the dot', () => {
  const sim = new RS.Sim(rig());
  let now = 1000; for (let i = 0; i < 30; i++) { now += 45; sim.tick(now); }
  const stay = (x, y, n) => { let last = null; for (let i = 0; i < n; i++) { now += 45; sim.setHand({ x, y, h: 0 }, false); last = sim.tick(now); } return last; };
  // the simulator hides pose errors the calibration is meant to find, so compare against the settled fix, not the truth
  let f = stay(100, 150, 25); const f0 = { x: f.hx, y: f.hy }; assert.ok(Math.hypot(f.hx - 100, f.hy - 150) < 40, 'settled near the hand: ' + f.hx + ',' + f.hy);
  f = stay(350, 250, 1); assert.ok(Math.hypot(f.hx - f0.x, f.hy - f0.y) < 25, 'one stray frame is held: ' + f.hx + ',' + f.hy);
  f = stay(380, 40, 1); assert.ok(Math.hypot(f.hx - f0.x, f.hy - f0.y) < 35, 'a second jump elsewhere is not a re-acquire: ' + f.hx + ',' + f.hy);
  f = stay(100, 150, 3); assert.ok(Math.hypot(f.hx - f0.x, f.hy - f0.y) < 20);
  f = stay(350, 250, 3); assert.ok(Math.hypot(f.hx - f0.x, f.hy - f0.y) > 200, 'a real move is followed within three frames: ' + f.hx + ',' + f.hy);
});
