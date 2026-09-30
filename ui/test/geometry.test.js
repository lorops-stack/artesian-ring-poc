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

test('trilateration recovers a known position', () => {
  const A = cfg.sensors.A, B = cfg.sensors.B, h = 115;
  for (const [x, y] of [[100, 100], [292, 267], [500, 480], [60, 500]]) {
    const rA = RS.geo.range(A, x, y, h), rB = RS.geo.range(B, x, y, h);
    const p = RS.geo.locate(rA, rB, A, B, h, null, cfg.plane);
    assert.ok(Math.hypot(p.x - x, p.y - y) < 0.5, `(${x},${y}) -> (${p.x.toFixed(1)},${p.y.toFixed(1)})`);
  }
});

test('association picks the nearer pair and rejects background and weak echoes', () => {
  const A = cfg.sensors.A, B = cfg.sensors.B, h = 115, x = 200, y = 400;
  const rA = RS.geo.range(A, x, y, h), rB = RS.geo.range(B, x, y, h);
  const eA = [[520, 900], [Math.round(rA), 2000], [Math.round(rA) + 200, 500]], eB = [[Math.round(rB), 1800], [650, 820], [Math.round(rB) + 210, 480]];
  const r = RS.geo.associate(eA, eB, { A, B, hand: cfg.hand, plane: cfg.plane, bg: { A: [520], B: [650] } });
  assert.equal(r.flag, 0); assert.ok(Math.hypot(r.x - x, r.y - y) < 4, `got ${r.x},${r.y}`);
  const weak = RS.geo.associate([[400, 100]], [[400, 100]], { A, B, hand: cfg.hand, plane: cfg.plane });
  assert.equal(weak.flag, RS.FLAG.STRENGTH);
  const none = RS.geo.associate([], [], { A, B, hand: cfg.hand, plane: cfg.plane });
  assert.equal(none.flag, RS.FLAG.NO_HAND);
});

test('coverage prediction: back row is the weakest, overall high', () => {
  const cov = RS.geo.coverage(cfg, 23, 21, 'kitchen');
  const rows = [0, 1, 2].map(r => cov.zones.filter(z => z.row === r).map(z => cov.perZone[z.id]).reduce((a, b) => a + b, 0) / 3);
  assert.ok(cov.overall > 0.9, 'overall ' + cov.overall);
  assert.ok(rows[0] <= rows[2] + 0.02, 'back row should not beat the front row: ' + rows);
});

test('wand fit finds hidden sensor errors and offsets', () => {
  const rnd = RS.util.rng(5), holes = RS.geo.templateHoles(cfg.plane), truth = { A: { x: 8, y: -5, z: 6, off: 18 }, B: { x: 574.2, y: 4, z: -3, off: 24 } };
  const samples = [];
  for (const H of holes) for (const depth of [60, 160]) {
    const s = { hole: H.n, depth };
    for (const k of ['A', 'B']) { const d = RS.geo.range(truth[k], H.x, H.y, depth) + truth[k].off - 20 + 3 * rnd.gauss(); s[k] = [d, 1500]; }
    samples.push(s);
  }
  const fit = RS.fit.wandFit(samples, cfg);
  assert.ok(fit.rms < 12, 'rms ' + fit.rms);
  for (const k of ['A', 'B']) {
    assert.ok(Math.abs(fit.fits[k].off - truth[k].off) < 8, k + ' offset ' + fit.fits[k].off);
    assert.ok(Math.hypot(fit.fits[k].x - truth[k].x, fit.fits[k].y - truth[k].y) < 12, k + ' pose');
  }
  assert.ok(!fit.codes.includes('P1'));
});
