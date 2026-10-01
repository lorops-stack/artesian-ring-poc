const test = require('node:test'), assert = require('node:assert');
const RS = require('./load')();
const BN = RS.bench;
function cfg() { return JSON.parse(JSON.stringify(new RS.Sim().cfg)); }
const hwOk = { A: { pres: true, cfg: true, sda: true, scl: true, ver: 66560, st: 896, hz: 22, er: 0, alive: true, setups: 1 }, B: { pres: true, cfg: true, sda: true, scl: true, ver: 66560, st: 896, hz: 21, er: 1, alive: true, setups: 1 }, rst: 'POWERON' };
const aim = { when: '2026-10-01T18:00:00Z', result: { n: 400, coverage: 0.8, A: { yaw: 48.2, delta: 3.2, quality: 'good', half: 38 }, B: { yaw: 130, delta: -5, quality: 'fair', half: 40 }, base: { status: 'ok', msg: 'fine', lo: 570, hi: 600 } } };
const mk = (o) => BN.capture(Object.assign({ cfg: cfg(), health: hwOk, status: { fw: '0.1.0' }, aim, label: 'T1', note: 'n', now: new Date('2026-10-01T18:05:00Z'), mode: 'device', ui: 'x' }, o || {}));

test('capture records setup, masks, health, aim and a timestamp', () => {
  const c = cfg(); c.masks = { m1: { t: 'circle', x: 300, y: 120, r: 40 } };
  const e = mk({ cfg: c });
  assert.equal(e.kind, 'ring-bench'); assert.equal(e.when, '2026-10-01T18:05:00.000Z'); assert.equal(e.fw, '0.1.0');
  assert.equal(e.setup.sensors.A.yaw, c.sensors.A.yaw); assert.equal(e.setup.plane.w, c.plane.w); assert.equal(e.masks.m1.r, 40);
  assert.equal(e.hw.A.pres, true); assert.equal(e.aim.A.delta, 3.2); assert.equal(e.aim.base.status, 'ok');
  assert.ok(e.id && e.id.length > 4);
});
test('capture works with no health and no aim', () => {
  const e = mk({ health: null, aim: null }); assert.equal(e.hw, null); assert.equal(e.aim, null);
  assert.match(BN.summary(e), /no aim sweep/); assert.match(BN.summary(e), /no sensor data/); assert.match(BN.text(e), /Aim sweep: none run/);
});
test('summary names spacing, yaws, dead areas, aim error and sensor status', () => {
  const s = BN.summary(mk()); assert.match(s, /spacing 584 mm/); assert.match(s, /A 45°/); assert.match(s, /0 dead areas/); assert.match(s, /aim off A \+3° B -5°/); assert.match(s, /sensors OK/);
  const bad = JSON.parse(JSON.stringify(hwOk)); bad.B.pres = false; assert.equal(BN.hwLevel(mk({ health: bad })), 'fault');
});
test('diff lists changed settings and dead areas only', () => {
  const a = mk(), c2 = cfg(); c2.sensors.A.yaw = 52; c2.masks = { m1: { t: 'rect', x: 0, y: 0, w: 80, h: 60 } };
  const b = mk({ cfg: c2 }), d = BN.diff(a, b), paths = d.map(x => x.path);
  assert.deepEqual(paths.sort(), ['masks.m1', 'sensors.A.yaw']); assert.equal(d.find(x => x.path === 'sensors.A.yaw').b, 52);
  assert.equal(BN.diff(a, mk()).length, 0);
});
test('restore patch sets saved values and deletes masks that were added since', () => {
  const c = cfg(); c.masks = { m1: { t: 'circle', x: 1, y: 2, r: 30 } }; const e = mk({ cfg: c });
  const p = BN.restorePatch(e, { m1: { t: 'circle', x: 9, y: 9, r: 9 }, m7: { t: 'circle', x: 5, y: 5, r: 5 } });
  assert.equal(p['sensors.A.yaw'], c.sensors.A.yaw); assert.equal(p['masks.m1'].r, 30); assert.equal(p['masks.m7'], null); assert.equal(p['plane.w'], c.plane.w);
  assert.ok(!('layout' in p) && !Object.keys(p).some(k => /wifi|pin|layouts/.test(k)));
});
test('restore patch applied to the simulator puts the setup back', () => {
  const sim = new RS.Sim(), c0 = JSON.parse(JSON.stringify(sim.cfg)); const e = BN.capture({ cfg: c0, now: new Date() });
  sim.cmd({ c: 'cfg', id: 1, set: { 'sensors.A.yaw': 70, 'masks.m3': { t: 'circle', x: 200, y: 200, r: 30 } } });
  assert.equal(sim.cfg.sensors.A.yaw, 70);
  sim.cmd({ c: 'cfg', id: 2, set: BN.restorePatch(e, sim.cfg.masks) });
  assert.equal(sim.cfg.sensors.A.yaw, c0.sensors.A.yaw); assert.equal(sim.cfg.masks && sim.cfg.masks.m3, undefined);
});
test('text report carries the facts a reviewer needs', () => {
  const t = BN.text(mk()); assert.match(t, /BENCH SNAPSHOT: T1/); assert.match(t, /Sensor A: x 0/); assert.match(t, /yaw 45/); assert.match(t, /Dead areas: none/); assert.match(t, /Sensor B health: answers, configured/); assert.match(t, /A measured 48.2°/);
});
test('storage: newest first, capped, import skips duplicates and junk', () => {
  BN.clear(); const a = mk({ label: 'a' }), b = mk({ label: 'b' }); BN.add(a); BN.add(b); assert.equal(BN.list()[0].label, 'b');
  const r = BN.import({ entries: [a, { kind: 'other' }, Object.assign({}, a, { id: 'zz9999' })] }); assert.equal(r.added, 1); assert.equal(r.skipped, 2); assert.equal(BN.list().length, 3);
  for (let i = 0; i < 70; i++) BN.add(Object.assign({}, a, { id: 'x' + i })); assert.equal(BN.list().length, 60);
  BN.remove('x65'); assert.equal(BN.list().length, 59); BN.clear(); assert.equal(BN.list().length, 0);
});
