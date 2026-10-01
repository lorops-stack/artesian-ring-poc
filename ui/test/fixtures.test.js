// Runs firmware/test/fixtures/scenarios.json through the JavaScript state machine. The C++ machine runs the same file.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const RS = require('./load')();
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'firmware', 'test', 'fixtures', 'scenarios.json'), 'utf8'));
const P = RS.DEFAULTS.plane;
function zoneCentre(fn) { const z = RS.geo.zones('kitchen').find(z => z.fn === fn); return { x: (z.x0 + z.x1) / 2 * P.w, y: (z.y0 + z.y1) / 2 * P.d }; }
function runScenario(sc) {
  const sm = new RS.StateMachine(RS.util.deepClone(RS.DEFAULTS)), events = []; sm.ev.on('event', e => events.push(e));
  let t = 0;
  for (const seg of sc.plan) {
    const pos = seg.pos === null ? null : (seg.zone ? zoneCentre(seg.zone) : { x: seg.pos[0], y: seg.pos[1] });
    const frames = Math.max(1, Math.round(seg.ms / 45));
    for (let i = 0; i < frames; i++) { t += 45; sm.step({ t, pos: pos ? { x: pos.x + (seg.wobble ? (i % 2 ? 4 : -4) : 0), y: pos.y } : null, speed: seg.speed == null ? (pos ? 20 : 0) : seg.speed, flag: seg.flag || 0 }); }
  }
  return { sm, events };
}
const matches = (e, x) => e.ev === x.ev && (x.fn == null || e.fn === x.fn) && (x.a == null || e.a === x.a) && (x.why == null || e.why === x.why);
for (const sc of FX.scenarios) {
  test('fixture ' + sc.id + ': ' + sc.title, () => {
    const { sm, events } = runScenario(sc);
    let k = 0;
    for (const e of events) if (k < sc.events.length && matches(e, sc.events[k])) { const x = sc.events[k]; if (x.usedMin != null) assert.ok(e.used >= x.usedMin && e.savedOff >= x.savedOffMin && e.savedFlow >= x.savedFlowMin, 'saved split ' + JSON.stringify(e)); k++; }
    assert.equal(k, sc.events.length, 'expected events in order; got ' + events.map(e => e.ev + (e.fn ? ':' + e.fn : '') + (e.a ? ':' + e.a : '') + (e.why ? '(' + e.why + ')' : '')).join(' '));
    assert.equal(sm.st, sc.state, 'final state');
    if (sc.fn) assert.equal(sm.fn, sc.fn);
    if (sc.latMax) { const l = events.find(e => e.ev === 'latch'); assert.ok(l.lat <= sc.latMax && l.lat >= 150, 'latency ' + l.lat); }
    (sc.noEvents || []).forEach(x => assert.ok(!events.some(e => matches(e, x)), 'unexpected ' + JSON.stringify(x)));
    Object.keys(sc.count || {}).forEach(key => { const [ev, a] = key.split('.'); const n = events.filter(e => e.ev === ev && (a == null || e.a === a)).length; assert.equal(n, sc.count[key], 'count of ' + key); });
  });
}
