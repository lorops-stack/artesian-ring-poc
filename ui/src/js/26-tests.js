/* Ring Studio · test runner (F26): walks through the bench tests of docs/07 one by one, records pass, fail and notes,
   and exports the results to a file (browser storage can be cleared). Data: js/data/tests.js (generated). */
var RS = globalThis.RS || (globalThis.RS = {});
(function () {
  'use strict';
  var U = RS.util, h = U.h, L = RS.link, R = RS.rec;
  var EXIT = { 1: ['T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T16', 'T17', 'T18', 'T19', 'T20', 'T21', 'T28', 'T29', 'T30'], 2: ['T12', 'T13', 'T14', 'T15', 'T22', 'T23', 'T24', 'T25', 'T26', 'T27'] };
  var RUN = {
    T16: { label: 'Open the accuracy test', go: function () { RS.app.go('dashboard'); } },
    T29: { label: 'Open the calibration studio', go: function () { RS.app.go('studio'); } },
    T30: { label: 'Open the diagnostics', go: function () { RS.app.go('studio'); if (L.mode === 'sim') setTimeout(RS.faultsPanel, 400); } },
    T12: { label: 'Open Settings', go: function () { RS.app.go('settings'); } },
    T13: { label: 'Open Settings', go: function () { RS.app.go('settings'); } },
    T1: { label: 'Open the hardware check', go: function () { location.hash = '#/studio/c0'; } },
    T4: { label: 'Open background capture', go: function () { location.hash = '#/studio/c6'; } },
    T28: { label: 'Open the hand profile', go: function () { location.hash = '#/studio/c8'; } }
  };

  var T = RS.screens.tests = { title: 'Tests' };
  T.mount = function (host) {
    var self = this; this.filter = U.store.get('tests.filter', 'all');
    var scroll = h('div.scroll'), wrap = h('div.wrap'); scroll.appendChild(wrap); host.appendChild(scroll);
    this.summary = h('div.row.wrap'); this.list = h('div.card.solid');
    this.seg = h('div.seg');
    wrap.appendChild(h('div.row.between.wrap.mb', h('div', h('h2', { style: { margin: 0, fontSize: '22px' } }, 'Bench tests'), h('div.sub', 'Follow each test as written, then press Pass or Fail. The full plan is docs/07-test-and-demo-plan.md.')),
      h('div.row', h('button.btn.sm', { onclick: function () { self.importFile(); } }, 'Import'), h('button.btn.sm.primary', { onclick: function () { R.exportTests(RS.TESTS); RS.app.toast('Results exported (CSV and JSON)', 'ok'); } }, 'Export results'))));
    wrap.appendChild(h('div.callout.info.mb', 'Results live in this browser until you export them. Export after every test session and send the files to Checkpoint 5 or 7. The Phase 1 exit needs every Phase 1 exit test passed; the Phase 2 exit the same for Phase 2.'));
    wrap.appendChild(h('div.row.between.wrap.mb', this.summary, this.seg));
    wrap.appendChild(this.list);
    this.unsub = [R.on('change', function () { self.render(); })];
    this.render();
  };
  T.unmount = function () { this.unsub.forEach(function (u) { u(); }); };
  T.importFile = function () {
    U.pickFile('.json', function (text) {
      try { var o = JSON.parse(text); if (o.kind !== 'ring-tests' || !o.results) throw new Error('not a test results file'); var n = 0; Object.keys(o.results).forEach(function (id) { var r = o.results[id]; if (r && r.result) { R.tests[id] = r; n++; } }); U.store.set('rec.tests', R.tests); R.emit('change'); RS.app.toast('Imported ' + n + ' results', 'ok'); }
      catch (e) { RS.app.toast('Import failed: ' + e.message, 'bad'); }
    });
  };
  T.render = function () {
    var self = this, res = R.tests, tests = RS.TESTS || [];
    var counts = { pass: 0, fail: 0, none: 0 };
    tests.forEach(function (t) { var r = res[t.id]; if (!r || !r.result) counts.none++; else counts[r.result]++; });
    U.empty(this.summary);
    this.summary.appendChild(h('span.chip.ok', counts.pass + ' passed')); this.summary.appendChild(h('span.chip' + (counts.fail ? '.bad' : ''), counts.fail + ' failed')); this.summary.appendChild(h('span.chip', counts.none + ' not run'));
    [1, 2].forEach(function (ph) {
      var ids = EXIT[ph], done = ids.filter(function (id) { return res[id] && res[id].result === 'pass'; }).length, ready = done === ids.length;
      self.summary.appendChild(h('span.chip' + (ready ? '.ok' : '.info'), 'Phase ' + ph + ' exit: ' + done + ' / ' + ids.length + (ready ? ' · ready' : '')));
    });
    U.empty(this.seg);
    [['all', 'All'], ['0', 'Phase 0'], ['1', 'Phase 1'], ['2', 'Phase 2'], ['none', 'Not run'], ['fail', 'Failed']].forEach(function (f) { self.seg.appendChild(h('button' + (self.filter === f[0] ? '.on' : ''), { onclick: function () { self.filter = f[0]; U.store.set('tests.filter', f[0]); self.render(); } }, f[1])); });
    U.empty(this.list);
    var shown = tests.filter(function (t) { var r = res[t.id] || {}; if (self.filter === 'all') return true; if (self.filter === 'none') return !r.result; if (self.filter === 'fail') return r.result === 'fail'; return String(t.phase) === self.filter; });
    if (!shown.length) this.list.appendChild(h('div.sub', 'Nothing in this filter.'));
    shown.forEach(function (t) {
      var r = res[t.id] || {}, row = h('div.testrow' + (r.result ? '.' + r.result : ''));
      var body = h('div.col.gap-s', h('div', h('strong', t.title), h('span.chip', { style: { marginLeft: '10px', height: '22px' } }, 'Phase ' + t.phase)), h('div.sub', RS.md(t.procedure)), h('div.small', h('span.dim', 'Pass: '), RS.md(t.expected)));
      if (r.note) body.appendChild(h('div.small', { style: { color: 'var(--warn)' } }, 'Note: ' + r.note));
      if (r.when) body.appendChild(h('div.tiny.faint', (r.result === 'pass' ? 'Passed ' : 'Failed ') + U.stamp(new Date(r.when)) + (r.fw ? ' · firmware ' + r.fw : '')));
      var act = h('div.col.gap-s');
      act.appendChild(h('div.row', h('button.btn.sm' + (r.result === 'pass' ? '.on' : ''), { onclick: function () { R.setTest(t.id, 'pass', r.note); } }, 'Pass'),
        h('button.btn.sm' + (r.result === 'fail' ? '.danger' : ''), { onclick: function () { RS.app.prompt('Why did ' + t.id + ' fail?', 'Note', r.note || '', { ok: 'Record failure' }).then(function (v) { if (v === null) return; R.setTest(t.id, 'fail', v); }); } }, 'Fail'),
        h('button.btn.sm.ghost', { onclick: function () { RS.app.prompt('Note for ' + t.id, 'Note', r.note || '').then(function (v) { if (v === null) return; R.setTest(t.id, r.result || null, v); }); } }, 'Note'),
        r.result ? h('button.btn.sm.ghost', { title: 'Clear the result', onclick: function () { delete R.tests[t.id]; U.store.set('rec.tests', R.tests); R.emit('change'); } }, 'Reset') : null));
      if (RUN[t.id]) act.appendChild(h('button.btn.sm.accent', { onclick: RUN[t.id].go }, RUN[t.id].label));
      row.appendChild(h('div.id', t.id)); row.appendChild(body); row.appendChild(act);
      self.list.appendChild(row);
    });
  };
})();
