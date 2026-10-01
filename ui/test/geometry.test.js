const test = require('node:test'), assert = require('node:assert');
const RS = require('./load')();
const cfg = RS.DEFAULTS;

test('zones: kitchen has 9 zones with correct functions', () => {
  const z = RS.geo.zones('kitchen');
  assert.equal(z.length, 9);
  assert.equal(z[0].fn, 'soap'); assert.equal(z[2].fn, 'cup'); assert.equal(z[4].fn, 'neutral'); assert.equal(z[6].fn, 'hot'); assert.equal(z[8].fn, 'cold');
  assert.equal(RS.geo.zones('bathroom').length, 6); assert.equal(RS.geo.zones('accessible').length, 5);
  const acc = RS.geo.zones('accessible'); assert.ok(Math.abs(acc[0].y1 - 0.4) < 1e-9); assert.ok(Math.abs(acc[4].y1 - 1) < 1e-9);
});

test('zone hysteresis keeps the previous zone near an edge and needs 20 mm inside a new one', () => {
  const z = RS.geo.zones('kitchen'), P = cfg.plane, edge = P.w / 3;
  const a = RS.geo.zoneAt(z, P, edge - 40, 450, null, 20); assert.equal(a.fn, 'hot');
  const b = RS.geo.zoneAt(z, P, edge + 10, 450, a.id, 20); assert.equal(b.id, a.id, 'stays in hot within hysteresis');
  const c = RS.geo.zoneAt(z, P, edge + 10, 450, null, 20); assert.equal(c, null, 'dead band without a previous zone');
  const d = RS.geo.zoneAt(z, P, edge + 25, 450, a.id, 20); assert.equal(d.fn, 'warm');
});

const MOUNTS = ['flat', 'raised'];

for (const mount of MOUNTS) {
  const c = RS.presetConfig(mount), A = c.sensors.A, B = c.sensors.B, h = c.hand.zwork;

  test(`[${mount}] trilateration recovers a known position`, () => {
    for (const [x, y] of [[100, 100], [292, 267], [500, 480], [60, 500]]) {
      const rA = RS.geo.range(A, x, y, h), rB = RS.geo.range(B, x, y, h);
      const p = RS.geo.locate(rA, rB, A, B, h, null, c.plane);
      assert.ok(Math.hypot(p.x - x, p.y - y) < 0.5, `(${x},${y}) -> (${p.x.toFixed(1)},${p.y.toFixed(1)})`);
    }
  });

  test(`[${mount}] association picks the nearer pair and rejects background and weak echoes (strength below 3)`, () => {
    const x = 200, y = 400, rA = RS.geo.range(A, x, y, h), rB = RS.geo.range(B, x, y, h);
    const eA = [[520, 900], [Math.round(rA), 2000], [Math.round(rA) + 200, 2]], eB = [[Math.round(rB), 1800], [650, 820], [Math.round(rB) + 210, 2]];
    const r = RS.geo.associate(eA, eB, { A, B, hand: c.hand, plane: c.plane, bg: { A: [520], B: [650] } });
    assert.equal(r.flag, 0); assert.ok(Math.hypot(r.x - x, r.y - y) < 4, `got ${r.x},${r.y}`);
    const weak = RS.geo.associate([[400, 1]], [[400, 1]], { A, B, hand: c.hand, plane: c.plane });
    assert.equal(weak.flag, RS.FLAG.STRENGTH);
    const none = RS.geo.associate([], [], { A, B, hand: c.hand, plane: c.plane });
    assert.equal(none.flag, RS.FLAG.NO_HAND);
    // nearest-echo gate
    const gx = 200, gy = 150, hA = RS.geo.range(A, gx, gy, h), hB = RS.geo.range(B, gx, gy, h);
    const gA = [[Math.round(hA), 80], [Math.round(hA) + 260, 150]], gB = [[Math.round(hB), 90], [Math.round(hB) + 240, 160]];
    const g1 = RS.geo.associate(gA, gB, { A, B, hand: c.hand, plane: c.plane, nearWin: 120 });
    assert.equal(g1.flag, 0); assert.equal(g1.iA, 0); assert.equal(g1.iB, 0);
    const g2 = RS.geo.associate([[70, 4], [Math.round(hA), 80]], [[Math.round(hB), 90]], { A, B, hand: c.hand, plane: c.plane, nearWin: 120 });
    assert.equal(g2.flag, 0); assert.equal(g2.iA, 1, 'a faint blip nearer than the hand does not drop it');
  });

  test(`[${mount}] coverage prediction: back row is the weakest, overall high`, () => {
    const cov = RS.geo.coverage(c, 23, 21, 'kitchen');
    const rows = [0, 1, 2].map(r => cov.zones.filter(z => z.row === r).map(z => cov.perZone[z.id]).reduce((a, b) => a + b, 0) / 3);
    assert.ok(cov.overall > 0.85, 'overall ' + cov.overall);
    assert.ok(rows[0] <= rows[2] + 0.02, 'back row should not beat the front row: ' + rows);
  });

  test(`[${mount}] wand fit finds hidden sensor errors and offsets`, () => {
    const rnd = RS.util.rng(5), holes = RS.geo.templateHoles(c.plane), truth = { A: { x: 8, y: -5, z: 6, off: 18 }, B: { x: 574.2, y: 4, z: -3, off: 24 } };
    const samples = [];
    for (const H of holes) for (const depth of RS.calDepths(c)) {
      const s = { hole: H.n, depth };
      for (const k of ['A', 'B']) { const d = RS.geo.range(truth[k], H.x, H.y, depth) + truth[k].off - 20 + 3 * rnd.gauss(); s[k] = [d, 1500]; }
      samples.push(s);
    }
    const fit = RS.fit.wandFit(samples, c);
    assert.ok(fit.rms < 12, 'rms ' + fit.rms);
    for (const k of ['A', 'B']) {
      assert.ok(Math.abs(fit.fits[k].off - truth[k].off) < 10, k + ' offset ' + fit.fits[k].off);
      assert.ok(Math.hypot(fit.fits[k].x - truth[k].x, fit.fits[k].y - truth[k].y) < 14, k + ' pose');
    }
    assert.ok(!fit.codes.includes('P1'), 'codes ' + fit.codes);
  });
}

test('flat mount is the default and has no tilt, no height difference and a plane-level hand', () => {
  assert.equal(RS.mountOf(RS.DEFAULTS), 'flat');
  assert.equal(RS.DEFAULTS.sensors.A.tilt, 0); assert.equal(RS.DEFAULTS.hand.zwork, 0);
  assert.deepEqual(RS.calDepths(RS.DEFAULTS), [10, 50]); assert.deepEqual(RS.calDepths(RS.presetConfig('raised')), [60, 160]);
});

test('vertical beam: the slot narrows the lobe, and a hand off the boresight is attenuated', () => {
  const c = RS.presetConfig('flat');
  assert.ok(RS.geo.vHalf(c) < c.rig.beamV, 'slot narrows the lobe: ' + RS.geo.vHalf(c));
  assert.ok(Math.abs(RS.geo.vHalf(c) - Math.atan((c.rig.slotH / 2) / c.rig.recess) * 180 / Math.PI) < 1e-9);
  const A = c.sensors.A;
  assert.ok(RS.geo.vertFactor(c, A, 300, 0) > 0.99, 'level hand: full strength');
  assert.ok(RS.geo.vertFactor(c, A, 300, 200) < 0.3, 'a hand 200 mm below a flat sensor is mostly outside the lobe');
  const r = RS.presetConfig('raised'); assert.equal(RS.geo.vHalf(r), r.rig.beamV, 'no recess, no narrowing');
});

test('dead areas: a masked pair is ignored, the next best pair wins, and a fully masked scene is flagged', () => {
  const c = RS.presetConfig('flat'), A = c.sensors.A, B = c.sensors.B, h = c.hand.zwork;
  const at = (x, y) => [RS.geo.range(A, x, y, h), RS.geo.range(B, x, y, h)];
  const [a1, b1] = at(430, 150), [a2, b2] = at(150, 400);
  const eA = [[Math.round(a1), 3000], [Math.round(a2), 2500]], eB = [[Math.round(b1), 3000], [Math.round(b2), 2500]];
  const base = { A, B, hand: c.hand, plane: c.plane };
  const open = RS.geo.associate(eA, eB, base);
  assert.equal(open.flag, 0); assert.ok(RS.geo.maskHit({ m: { t: 'circle', x: 430, y: 150, r: 60 } }, open.x, open.y), 'unmasked, the clutter spot wins (a cross-pairing ghost lands next to it)');
  const masks = { m1: { t: 'circle', x: 430, y: 150, r: 60 } };
  const next = RS.geo.associate(eA, eB, Object.assign({ masks }, base));
  assert.equal(next.flag, 0); assert.ok(Math.hypot(next.x - 150, next.y - 400) < 5, 'the other pair wins: ' + next.x + ',' + next.y);
  const all = RS.geo.associate([eA[0]], [eB[0]], Object.assign({ masks }, base));
  assert.equal(all.flag, RS.FLAG.MASKED);
  const rect = { m2: { t: 'rect', x: 400, y: 100, w: 100, h: 100 } };
  assert.equal(RS.geo.associate([eA[0]], [eB[0]], Object.assign({ masks: rect }, base)).flag, RS.FLAG.MASKED);
  assert.equal(RS.geo.maskHit(rect, 399, 150), null); assert.equal(RS.geo.maskHit(rect, 401, 150), 'm2');
  assert.equal(RS.geo.associate([eA[0]], [eB[0]], Object.assign({ masks: {} }, base)).flag, 0, 'empty masks do nothing');
});

test('aim estimate: reads the beam centre from a hand sweep, with its noise and a typed yaw that is wrong', () => {
  const c = RS.presetConfig('flat'), rnd = RS.util.rng(21), A = c.sensors.A;
  const trueYaw = 57, half = 55, samples = [];
  for (let i = 0; i < 400; i++) {
    const x = 20 + rnd() * 540, y = 20 + rnd() * 490, dx = x - A.x, dy = y - A.y, d = Math.hypot(dx, dy);
    let a = Math.atan2(dy, dx) * 180 / Math.PI - trueYaw; while (a > 180) a -= 360; while (a < -180) a += 360;
    const s = 4200 * Math.pow(300 / d, 2) * Math.exp(-0.7 * Math.pow(a / half, 2)) * (1 + 0.12 * rnd.gauss());
    samples.push({ x, y, s });
  }
  const r = RS.fit.aimFromSamples(samples, A);
  assert.ok(r.yaw !== null, r.why); assert.ok(Math.abs(r.yaw - trueYaw) < 6, 'estimate ' + r.yaw + ' vs ' + trueYaw);
  assert.ok(Math.abs(r.delta - (trueYaw - A.yaw)) < 6, 'delta ' + r.delta); assert.ok(r.quality === 'good' || r.quality === 'fair', r.quality);
  assert.ok(Math.abs(r.half - half) < 15, 'half-width ' + r.half);
  const few = RS.fit.aimFromSamples(samples.slice(0, 10), A); assert.equal(few.yaw, null);
  const narrow = RS.fit.aimFromSamples(samples.filter(q => Math.abs(Math.atan2(q.y, q.x) * 180 / Math.PI - 45) < 8), A); assert.equal(narrow.yaw, null);
});

test('baseline check: brackets the sensor spacing and flags a wrong one', () => {
  const c = RS.presetConfig('flat'), rnd = RS.util.rng(8), A = c.sensors.A, B = c.sensors.B, h = c.hand.zwork, samples = [];
  for (let i = 0; i < 300; i++) {
    const x = 10 + rnd() * 560, y = 8 + rnd() * 520;
    samples.push({ rA: RS.geo.range(A, x, y, h) + 3 * rnd.gauss(), rB: RS.geo.range(B, x, y, h) + 3 * rnd.gauss() });
  }
  const ok = RS.fit.baselineBracket(samples, c); assert.ok(ok.status === 'ok' || ok.status === 'wide', ok.status + ' ' + ok.msg);
  assert.ok(ok.lo <= 584.2 + 25 && ok.hi >= 584.2 - 25, `bracket ${ok.lo}..${ok.hi}`);
  const wrong = RS.util.deepClone(c); wrong.sensors.B.x = 700;       // typed 700 mm instead of 584
  assert.equal(RS.fit.baselineBracket(samples, wrong).status, 'high');
  const wrong2 = RS.util.deepClone(c); wrong2.sensors.B.x = 400;
  assert.equal(RS.fit.baselineBracket(samples, wrong2).status, 'low');
  assert.equal(RS.fit.baselineBracket(samples.slice(0, 10), c).status, 'few');
});
