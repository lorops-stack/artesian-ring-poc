const test = require('node:test'), assert = require('node:assert');
const RS = require('./load')();

// Helper: drive the machine with a hand path. Frames every 45 ms.
function run(sm, plan, log) {
  // plan: [{ms, pos:{x,y}|null, speed}] segments held for ms
  let t = sm.t || 0; const events = log || [];
  const off = sm.ev.on('event', e => events.push(e));
  for (const seg of plan) {
    const frames = Math.max(1, Math.round(seg.ms / 45));
    for (let i = 0; i < frames; i++) { t += 45; sm.step({ t, pos: seg.pos ? { x: seg.pos.x + (seg.wobble ? (i % 2 ? 4 : -4) : 0), y: seg.pos.y } : null, speed: seg.speed == null ? (seg.pos ? 20 : 0) : seg.speed, flag: seg.flag || 0 }); }
  }
  off(); return events;
}
const P = RS.DEFAULTS.plane;
const Z = (fn, layout) => { const z = RS.geo.zones(layout || 'kitchen').find(z => z.fn === fn); return { x: (z.x0 + z.x1) / 2 * P.w, y: (z.y0 + z.y1) / 2 * P.d }; };
const fresh = () => new RS.StateMachine(RS.util.deepClone(RS.DEFAULTS));
const enter = (pos) => [{ ms: 135, pos, speed: 400 }];     // 3 fast frames: session starts (2 needed)

test('T5 latch: hand settles in Warm, water on after 150 ms, latency reported', () => {
  const sm = fresh(); const ev = run(sm, [...enter(Z('warm')), { ms: 300, pos: Z('warm'), wobble: true }]);
  assert.equal(sm.st, RS.ST.ACTIVE); assert.equal(sm.fn, 'warm');
  const l = ev.find(e => e.ev === 'latch'); assert.ok(l && l.lat >= 150 && l.lat < 400, 'latency ' + (l && l.lat));
});

test('T6 latch holds while the hand roams other zones; exit turns off after 1.0 s from last seen', () => {
  const sm = fresh(); run(sm, [...enter(Z('hot')), { ms: 300, pos: Z('hot'), wobble: true }, { ms: 500, pos: Z('cold'), wobble: true }, { ms: 500, pos: Z('soap'), wobble: true }]);
  assert.equal(sm.fn, 'hot', 'latch holds');
  const ev = run(sm, [{ ms: 900, pos: null }]);
  assert.equal(sm.st, RS.ST.EXIT_PENDING, 'counting down');
  run(sm, [{ ms: 200, pos: null }], ev);
  assert.equal(sm.st, RS.ST.IDLE); assert.ok(ev.some(e => e.ev === 'off' && e.why === 'exit')); assert.ok(ev.some(e => e.ev === 'session' && e.a === 'end'));
});

test('T7 hand back within the countdown cancels it (bias to staying on)', () => {
  const sm = fresh(); run(sm, [...enter(Z('cold')), { ms: 300, pos: Z('cold'), wobble: true }, { ms: 600, pos: null }, { ms: 200, pos: Z('cold'), wobble: true }]);
  assert.equal(sm.st, RS.ST.ACTIVE); assert.equal(sm.fn, 'cold');
});

test('T8 soap: one dose then blocked for the session; water zone still latches afterwards', () => {
  const sm = fresh(); const ev = run(sm, [...enter(Z('soap')), { ms: 300, pos: Z('soap'), wobble: true }, { ms: 400, pos: Z('soap'), wobble: true }]);
  assert.equal(ev.filter(e => e.ev === 'soap').length, 1, 'exactly one dose'); assert.equal(sm.st, RS.ST.ARMING);
  run(sm, [{ ms: 400, pos: Z('warm'), wobble: true }], ev); assert.equal(sm.fn, 'warm');
});

test('T9 disposal: 1 s hold, 15 s run, stops on a settle in Neutral, never restarts in the session, survives exit', () => {
  const sm = fresh(); const ev = run(sm, [...enter(Z('disposal')), { ms: 600, pos: Z('disposal'), wobble: true }]);
  assert.ok(!ev.some(e => e.ev === 'disp'), 'not yet at 0.6 s');
  run(sm, [{ ms: 600, pos: Z('disposal'), wobble: true }], ev);
  assert.ok(ev.some(e => e.ev === 'disp' && e.a === 'start')); assert.ok(sm.disposalUntil > 0);
  run(sm, [{ ms: 400, pos: Z('neutral'), wobble: true }], ev);
  assert.ok(ev.some(e => e.ev === 'disp' && e.a === 'stop' && e.why === 'zone'), 'Neutral settle stops it');
  run(sm, [{ ms: 1500, pos: Z('disposal'), wobble: true }], ev);
  assert.equal(ev.filter(e => e.ev === 'disp' && e.a === 'start').length, 1, 'no restart');
  // new session: disposal runs and keeps running after hands leave
  run(sm, [{ ms: 1200, pos: null }], ev); assert.equal(sm.st, RS.ST.IDLE);
  run(sm, [...enter(Z('disposal')), { ms: 1200, pos: Z('disposal'), wobble: true }, { ms: 1200, pos: null }], ev);
  assert.equal(sm.st, RS.ST.IDLE); assert.ok(sm.disposalUntil > 0, 'still running after exit');
  run(sm, [{ ms: 15000, pos: null }], ev); assert.equal(sm.disposalUntil, 0);
  assert.ok(ev.some(e => e.ev === 'disp' && e.a === 'stop' && e.why === 'timer'));
});

test('T10 objects never start a session; a still target ends one within 10 s (Q9)', () => {
  const sm = fresh(); run(sm, [{ ms: 2000, pos: Z('warm'), speed: 0 }]);
  assert.equal(sm.st, RS.ST.IDLE, 'no movement, no session');
  const ev = run(sm, [...enter(Z('cup')), { ms: 300, pos: Z('cup'), wobble: true }]); assert.equal(sm.fn, 'cup');
  run(sm, [{ ms: 11000, pos: Z('cup'), speed: 0 }], ev);
  assert.equal(sm.st, RS.ST.IDLE); assert.ok(ev.some(e => e.ev === 'still')); assert.ok(ev.some(e => e.ev === 'off' && e.why === 'still'));
});

test('T11 cup fill stops at the set volume and stays latched (CUP_FULL)', () => {
  const sm = fresh(); const ev = run(sm, [...enter(Z('cup')), { ms: 300, pos: Z('cup'), wobble: true }, { ms: 4500, pos: Z('cup'), wobble: true }]);
  assert.equal(sm.st, RS.ST.CUP_FULL); assert.ok(ev.some(e => e.ev === 'cupfull')); assert.ok(Math.abs(sm.cupMl - 350) < 1);
});

test('flagged frames never latch; a jump frame keeps presence', () => {
  const sm = fresh(); run(sm, [...enter(Z('warm')), { ms: 400, pos: Z('warm'), flag: RS.FLAG.JUMP }]);
  assert.equal(sm.st, RS.ST.ARMING, 'no latch on flagged frames');
  run(sm, [{ ms: 300, pos: Z('warm'), wobble: true }]); assert.equal(sm.fn, 'warm');
});

test('clean mode: Neutral held 3 s starts it, nothing latches, it ends after cleanMs or by command', () => {
  const sm = fresh(); const ev = run(sm, [...enter(Z('neutral')), { ms: 3200, pos: Z('neutral'), wobble: true }]);
  assert.equal(sm.st, RS.ST.CLEAN); assert.ok(ev.some(e => e.ev === 'clean' && e.a === 'start'));
  run(sm, [{ ms: 500, pos: Z('hot'), wobble: true }], ev); assert.equal(sm.st, RS.ST.CLEAN);
  sm.endClean(); assert.equal(sm.st, RS.ST.IDLE);
});

test('layout change turns everything off and stops the disposal', () => {
  const sm = fresh(); const ev = run(sm, [...enter(Z('disposal')), { ms: 1200, pos: Z('disposal'), wobble: true }, { ms: 200, pos: Z('warm'), wobble: true }]);
  sm.ev.on('event', e => ev.push(e)); sm.setLayout('bathroom'); assert.equal(sm.st, RS.ST.IDLE); assert.equal(sm.disposalUntil, 0); assert.equal(sm.cfg.layout, 'bathroom');
  assert.ok(ev.some(e => e.ev === 'off' && e.why === 'layout'));
});

test('water saved splits into off-when-hands-out and flow rate', () => {
  const sm = fresh(); const ev = run(sm, [...enter(Z('warm')), { ms: 2000, pos: Z('warm'), wobble: true }, { ms: 1200, pos: null }]);
  const end = ev.find(e => e.ev === 'session' && e.a === 'end');
  assert.ok(end.used > 100 && end.savedFlow > 0 && end.savedOff > 0, JSON.stringify(end));
});
