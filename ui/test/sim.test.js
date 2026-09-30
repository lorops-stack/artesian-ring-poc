const test = require('node:test'), assert = require('node:assert');
const RS = require('./load')();

function makeSim() { const sim = new RS.Sim(); const msgs = []; sim.out.on('msg', m => msgs.push(m)); return { sim, msgs }; }
function runGhost(sim, seconds, layout) {
  let now = 1000; const dt = 15;
  for (let i = 0; i < seconds * 1000 / dt; i++) {
    now += dt; const ts = (now - 1000) / 1000;
    sim.setHand(RS.ghostHand(layout, ts, sim.cfg.plane), true);
    sim.tick(now);
  }
  return now;
}

test('simulator: ghost script latches the expected functions in the kitchen layout', () => {
  const { sim, msgs } = makeSim();
  runGhost(sim, 32, 'kitchen');
  const latched = msgs.filter(m => m.ev === 'latch').map(m => m.fn), soap = msgs.filter(m => m.ev === 'soap').length;
  assert.equal(soap, 1, 'one soap dose');
  assert.deepEqual(latched, ['warm', 'cup', 'waterfall', 'hot'], 'latched ' + latched);
  assert.ok(msgs.some(m => m.ev === 'cupfull'));
  assert.ok(msgs.every(m => !m.ev || m.ev === 'bg' || m.g === 1), 'ghost events are marked');
  const frames = msgs.filter(m => m.f); assert.ok(frames.length > 600 && frames.every(f => f.f.g === 1));
  assert.ok(frames.some(f => f.f.A.e.length && f.f.B.e.length && f.f.A.p != null), 'echo lists with a picked pair');
  const offs = msgs.filter(m => m.ev === 'off'); assert.equal(offs.length, 4);
});

test('simulator: C7 wand calibration finds the hidden geometry, C8 gives a hand profile', () => {
  const { sim, msgs } = makeSim();
  let now = 1000; const step = () => { now += 45; sim.tick(now); };
  sim.cmd({ c: 'cal', step: 'c7', a: 'start', id: 1 });
  for (let guard = 0; guard < 3000 && sim.cal.state !== 'done'; guard++) {
    if (sim.cal.state === 'waiting') sim.cmd({ c: 'cal', step: 'c7', a: 'sample', id: 2 });
    step();
  }
  assert.equal(sim.cal.state, 'done'); const r = sim.cal.result;
  assert.ok(r.rms < 12, 'rms ' + r.rms); assert.equal(r.holes.length, 16);
  const tA = sim.truePose('A'), tB = sim.truePose('B');
  assert.ok(Math.abs(r.fits.A.off - tA.off) < 8 && Math.abs(r.fits.B.off - tB.off) < 8, 'offsets ' + r.fits.A.off + ' ' + r.fits.B.off);
  assert.ok(Math.hypot(r.fits.A.x - tA.x, r.fits.A.y - tA.y) < 12, 'A pose');
  assert.ok(!r.codes.includes('P2') && !r.codes.includes('P1'), 'codes ' + r.codes);
  // apply, then C8
  sim.cmd({ c: 'cal', step: 'c7', a: 'apply', id: 3, sensors: { A: { x: r.fits.A.x, y: r.fits.A.y, z: r.fits.A.z, off: r.fits.A.off }, B: { x: r.fits.B.x, y: r.fits.B.y, z: r.fits.B.z, off: r.fits.B.off } } });
  sim.cmd({ c: 'cal', step: 'c8', a: 'start', id: 4 });
  for (let guard = 0; guard < 5000 && sim.cal.state !== 'done'; guard++) {
    if (sim.cal.state === 'waiting') sim.cmd({ c: 'cal', step: 'c8', a: 'sample', id: 5 });
    step();
  }
  assert.equal(sim.cal.state, 'done'); const h = sim.cal.result;
  assert.ok(h.zwork > 60 && h.zwork < 170, 'zwork ' + h.zwork); assert.ok(h.strMin < h.strMax); assert.equal(h.points.length, 16);
  assert.ok(msgs.some(m => m.ev === 'beep'));
});

test('simulator: C0 reports W1 when sensor A is wired wrong, passes when clean', () => {
  const { sim } = makeSim();
  let now = 1000; const step = () => { now += 45; sim.tick(now); };
  const runC0 = () => {
    sim.cmd({ c: 'cal', step: 'c0', a: 'start', id: 1 });
    for (let g = 0; g < 2000 && sim.cal.state !== 'done'; g++) { if (sim.cal.state === 'waiting') sim.cmd({ c: 'cal', step: 'c0', a: 'next', id: 2 }); step(); }
    return sim.cal.result;
  };
  sim.setFault('A_swapSdaScl', true);
  const bad = runC0(); assert.equal(bad.ok, false); assert.ok(bad.checks.find(c => c.id === 'found' && c.ok === false && c.code === 'W1'));
  sim.setFault('A_swapSdaScl', false);
  const good = runC0(); assert.equal(good.ok, true);
});

test('simulator: background capture (C6) learns the basin echoes and flags a cup in the sink', () => {
  const { sim } = makeSim();
  let now = 1000; const step = () => { now += 45; sim.tick(now); };
  sim.cmd({ c: 'cal', step: 'c6', a: 'start', id: 1 });
  for (let g = 0; g < 200 && sim.cal.state !== 'done'; g++) step();
  assert.equal(sim.cal.state, 'done'); assert.ok(sim.recorded.A.length >= 1 && sim.recorded.B.length >= 1); assert.equal(sim.cal.result.ok, true);
  sim.setFault('cupInSink', true);
  sim.cmd({ c: 'cal', step: 'c6', a: 'start', id: 2 });
  for (let g = 0; g < 200 && sim.cal.state !== 'done'; g++) step();
  assert.ok(sim.cal.result.codes.includes('B1'));
});

test('simulator: a still cursor hand becomes an object after 10 s and the water stops', () => {
  const { sim, msgs } = makeSim();
  let now = 1000; const step = () => { now += 45; sim.tick(now); };
  const P = sim.cfg.plane, warm = { x: P.w / 2, y: P.d * 0.83, h: 110 };
  // enter moving from the front, then hold perfectly still
  for (let i = 0; i < 20; i++) { sim.setHand({ x: warm.x, y: P.d - i * 4, h: 110 }, false); step(); }
  for (let i = 0; i < 12; i++) { sim.setHand(warm, false); step(); }
  assert.ok(msgs.some(m => m.ev === 'latch' && m.fn === 'warm'), 'latched warm');
  for (let i = 0; i < 240; i++) { sim.setHand(warm, false); step(); }
  assert.ok(msgs.some(m => m.ev === 'still'), 'still rule fired'); assert.equal(sim.sm.st, RS.ST.IDLE);
  assert.ok(sim.bg.A.length >= 1, 'object learned as background');
});
