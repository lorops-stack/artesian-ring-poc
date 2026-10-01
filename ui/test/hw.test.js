const test = require('node:test'), assert = require('node:assert');
const RS = require('./load')();
const HW = RS.hw;
const good = { hz: 22, er: 0, alive: true, sda: true, scl: true, pres: true, cfg: true, ver: 0x010400, st: 0x380, bus: 0, setups: 1 };
const lv = (k, s, o) => HW.diagnose(k, s, o).verdict;
const stepState = (k, s, id, o) => HW.diagnose(k, s, o).steps.find(x => x.id === id).state;

test('a healthy sensor is good and every step passes', () => {
  const d = HW.diagnose('A', good, { errRate: 0 });
  assert.equal(d.verdict.level, 'ok'); assert.ok(d.steps.every(s => s.state === 'ok'), JSON.stringify(d.steps));
});
test('no data yet waits, it does not fail', () => { assert.equal(lv('A', null).level, 'wait'); });
test('both lines low: no power, names the red and black wires and the pins', () => {
  const v = lv('B', Object.assign({}, good, { sda: false, scl: false, pres: false, cfg: false, alive: false, hz: 0, bus: 5 }));
  assert.equal(v.level, 'bad'); assert.match(v.title, /no power/); assert.match(v.text, /3V3/); assert.match(v.text, /GPIO17/);
});
test('one line low names that line', () => {
  const v = lv('A', Object.assign({}, good, { sda: false, pres: false, cfg: false, alive: false, hz: 0 }));
  assert.match(v.title, /SDA line stuck low/);
  const v2 = lv('A', Object.assign({}, good, { scl: false, pres: false, cfg: false, alive: false, hz: 0 }));
  assert.match(v2.title, /SCL line stuck low/);
});
test('powered but silent points at swapped SDA/SCL first, with this sensor\'s pins', () => {
  const v = lv('A', Object.assign({}, good, { pres: false, cfg: false, alive: false, hz: 0, bus: 2 }));
  assert.match(v.title, /powered but silent/); assert.match(v.text, /swapped/); assert.match(v.text, /GPIO8/); assert.match(v.text, /GPIO9/);
  assert.equal(stepState('A', Object.assign({}, good, { pres: false, cfg: false, bus: 2 }), 'answer'), 'bad');
});
test('answers but not configured: presence firmware hint, or a setup error when error flags are set', () => {
  const noErr = lv('B', Object.assign({}, good, { cfg: false, st: 0, alive: false, hz: 0 }));
  assert.match(noErr.text, /presence/);
  const withErr = lv('B', Object.assign({}, good, { cfg: false, st: 0x00010080, alive: false, hz: 0 }));
  assert.match(withErr.text, /setup error/); assert.match(withErr.text, /0x10080/);
});
test('configured but silent measuring, then bus errors, then marginal', () => {
  assert.match(lv('A', Object.assign({}, good, { alive: false, hz: 0 })).title, /not measuring/);
  assert.equal(lv('A', good, { errRate: 2 }).level, 'bad');
  assert.equal(lv('A', good, { errRate: 0.2 }).level, 'warn');
  assert.equal(lv('A', Object.assign({}, good, { hz: 3 })).level, 'warn');
});
test('a powered sensor is not blamed for a stray low line sample', () => {
  const v = lv('A', Object.assign({}, good, { sda: false }));
  assert.equal(v.level, 'ok'); assert.equal(stepState('A', Object.assign({}, good, { sda: false }), 'lines'), 'warn');
});
test('older firmware without wiring detail still gets a verdict', () => {
  assert.equal(lv('A', { hz: 20, er: 0, alive: true }).level, 'ok');
  assert.equal(lv('A', { hz: 0, er: 3, alive: false }).level, 'bad');
});
test('error rate: counts, ignores a restarted counter', () => {
  const r = new HW.ErrRate(); r.add(0, 0); r.add(5, 5000); assert.equal(Math.round(r.rate() * 10) / 10, 1);
  const r2 = new HW.ErrRate(); r2.add(100, 0); r2.add(2, 1000); assert.equal(r2.rate(), 0);
});
test('overall takes the worst level; system checks add brown-out and low heap', () => {
  const ok = HW.diagnose('A', good), bad = HW.diagnose('B', Object.assign({}, good, { pres: false, cfg: false }));
  assert.equal(HW.overall([ok, ok]), 'ok'); assert.equal(HW.overall([ok, bad]), 'bad');
  assert.equal(HW.system({ rst: 'BROWNOUT', heap: 150000, temp: 40 })[0].level, 'bad');
  assert.equal(HW.system({ rst: 'POWERON', heap: 40000, temp: 40 })[0].level, 'warn');
  assert.equal(HW.system({ rst: 'POWERON', heap: 150000, temp: 40 }).length, 0);
});
test('wave test: a swinging echo passes, a steady or missing one does not', () => {
  const w = new HW.Wave();
  for (let i = 0; i < 40; i++) w.add({ A: { e: [[150 + 100 * Math.sin(i / 3), 900]] }, B: { e: [[420, 500]] } });
  let r = w.result(); assert.equal(r.A.ok, true); assert.ok(r.A.swing > 100); assert.equal(r.B.ok, false); assert.equal(r.B.swing, 0);
  const w2 = new HW.Wave(); for (let i = 0; i < 40; i++) w2.add({ A: { e: [] }, B: { e: [] } }); r = w2.result(); assert.equal(r.A.seen, false); assert.equal(r.A.ok, false);
});
test('simulator reports the new fields and the faults produce the matching diagnosis', () => {
  const sim = new RS.Sim(); let h = sim.health();
  assert.equal(HW.diagnose('A', h.A).verdict.level, 'ok'); assert.equal(HW.diagnose('B', h.B).verdict.level, 'ok');
  sim.setFault('B_noPower', true); h = sim.health(); assert.match(HW.diagnose('B', h.B).verdict.title, /no power/);
  sim.setFault('B_noPower', false); sim.setFault('A_swapSdaScl', true); h = sim.health(); assert.match(HW.diagnose('A', h.A).verdict.title, /silent/);
  sim.setFault('A_swapSdaScl', false); sim.setFault('wrongFw', true); h = sim.health(); assert.match(HW.diagnose('B', h.B).verdict.title, /did not start/);
  sim.setFault('wrongFw', false); sim.setFault('statusErr', true); h = sim.health(); assert.match(HW.diagnose('A', h.A).verdict.text, /setup error/);
});
