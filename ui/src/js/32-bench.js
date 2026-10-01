/* Ring Studio · Bench log: save a timestamped snapshot of the rig (positions, aim, dead areas, sensor health, last aim sweep),
   compare it with now, put it back, download it, or copy it as text to paste into a message. Stored in this browser; download to keep. */
var RS = globalThis.RS || (globalThis.RS = {});
(function () {
  'use strict';
  var U = RS.util, h = U.h, L = RS.link, S = RS.store, BN = RS.bench;
  var st = null;

  function btn(label, fn, cls, attrs) { return h('button.btn' + (cls ? '.' + cls.trim().replace(/\s+/g, '.') : ''), Object.assign({ onclick: fn }, attrs || {}), label); }
  function toast(m, k) { RS.app.toast(m, k || 'ok'); }
  function whenText(iso) { try { return U.stamp(new Date(iso)); } catch (e) { return iso; } }

  // Clipboard on plain http (the ring's own address) is often blocked; fall back to a box the person can copy from.
  function copyText(text, what) {
    function manual() { RS.app.modal(function (box, close) { box.appendChild(h('h2', what || 'Copy this')); box.appendChild(h('div.sub', 'Select all, copy, and paste it into your message.')); var ta = h('textarea', { style: { width: '100%', height: '320px', marginTop: '10px', fontFamily: 'var(--mono, monospace)', fontSize: '12px' }, readonly: true }, text); box.appendChild(ta); box.appendChild(h('div.row.end.mt', btn('Close', close, 'primary'))); setTimeout(function () { ta.focus(); ta.select(); }, 30); }); }
    try {
      if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(function () { toast('Copied'); }, manual); return; }
      var t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); var ok = document.execCommand && document.execCommand('copy'); t.remove();
      if (ok) toast('Copied'); else manual();
    } catch (e) { manual(); }
  }

  function currentCapture(label, note) {
    var hh = L.latest.health, a = RS.aimLast || null;
    return BN.capture({ cfg: S.cfg(), health: hh, status: L.latest.status, aim: a, label: label, note: note, mode: L.mode, ui: RS.VERSION });
  }

  function restore(e) {
    var patch = BN.restorePatch(e, (S.cfg() || {}).masks);
    RS.app.modal(function (box, close) {
      var n = Object.keys(patch).length;
      box.appendChild(h('h2', 'Put the setup back as it was?'));
      box.appendChild(h('div.sub', '"' + e.label + '" · ' + whenText(e.when) + '. This sets ' + n + ' values on the ring: sensor positions and aim, hand height, slot, sensing range, and dead areas. It does not change Wi-Fi, PIN, layout or calibration. If the sensing range differs, the sensors restart and need 3 seconds with an empty sink.'));
      box.appendChild(h('div.row.end.mt', btn('Cancel', close), btn('Restore', function () {
        close(); L.setMany(patch).then(function () { toast('Setup restored', 'ok'); }, function (er) { toast((er && er.message) || 'could not restore', 'bad'); });
      }, 'primary')));
    });
  }

  function compareBox(e) {
    var now = currentCapture('Now'), d = BN.diff(e, now);
    var box = h('div.mt-s', d.length ? h('div.col.gap-s', d.map(function (x) { return h('div.row.between.small', h('span.mono', x.path), h('span', String(x.a == null ? '-' : x.a) + '  →  ' + String(x.b == null ? '-' : x.b))); })) : h('div.small.dim', 'The ring is set up exactly like this snapshot.'));
    return h('div', h('div.tiny.faint', 'Left: this snapshot. Right: the ring now.'), box);
  }

  function entryCard(e) {
    var open = st.open[e.id], lvl = BN.hwLevel(e);
    var head = h('div.row.between.wrap.top', h('div.grow', h('div.row.gap-s.wrap', h('strong', e.label), h('span.chip' + (lvl === 'ok' ? '.ok' : lvl === 'fault' ? '.bad' : ''), lvl === 'ok' ? 'Sensors OK' : lvl === 'fault' ? 'Sensor fault' : 'No sensor data')), h('div.small.dim', whenText(e.when) + (e.note ? ' · ' + e.note : '')), h('div.small.mt-s', BN.summary(e))));
    var actions = h('div.row.wrap.gap-s.mt-s',
      btn(st.open[e.id] === 'cmp' ? 'Hide comparison' : 'Compare with now', function () { st.open[e.id] = st.open[e.id] === 'cmp' ? null : 'cmp'; renderList(); }, 'sm'),
      btn(st.open[e.id] === 'txt' ? 'Hide details' : 'Details', function () { st.open[e.id] = st.open[e.id] === 'txt' ? null : 'txt'; renderList(); }, 'sm'),
      btn('Restore setup', function () { restore(e); }, 'sm'),
      btn('Copy as text', function () { copyText(BN.text(e), 'Snapshot as text'); }, 'sm'),
      btn('Download', function () { U.download('ring-bench-' + U.fileStamp(new Date(e.when)) + '.json', JSON.stringify(e, null, 2), 'application/json'); }, 'sm'),
      btn('Delete', function () { BN.remove(e.id); renderList(); }, 'sm'));
    var card = h('div.card.tight.solid', head, actions);
    if (open === 'cmp') card.appendChild(h('div.mt-s', compareBox(e)));
    if (open === 'txt') card.appendChild(h('pre.small.mono', { style: { whiteSpace: 'pre-wrap', margin: '10px 0 0', color: 'var(--ink-2)' } }, BN.text(e)));
    return card;
  }

  function renderList() {
    if (!st) return; var l = BN.list(); U.empty(st.list);
    st.count.textContent = l.length ? l.length + ' saved in this browser' : '';
    if (!l.length) { st.list.appendChild(h('div.sub.small.dim', 'Nothing saved yet. Set the rig up, then press Save snapshot. Do it again after each change that mattered.')); return; }
    l.forEach(function (e) { st.list.appendChild(entryCard(e)); });
  }
  function renderNow() {
    if (!st) return; var e = currentCapture('now'), a = RS.aimLast; U.empty(st.now);
    st.now.appendChild(h('div.small', BN.summary(e)));
    if (!a || !a.result) st.now.appendChild(h('div.tiny.faint.mt-s', 'No aim sweep this session. Run one on the Aim screen first if you want it in the snapshot.'));
    else st.now.appendChild(h('div.tiny.faint.mt-s', 'Includes the aim sweep from ' + (a.when ? U.stamp(new Date(a.when)) : 'this session') + '.'));
  }

  var BNS = {
    title: 'Bench log',
    mount: function (host) {
      st = { open: {}, unsub: [] };
      var def = 'Bench ' + U.stamp(new Date()).slice(11, 16);
      st.label = h('input', { type: 'text', value: def, maxlength: 60, 'aria-label': 'Snapshot name' });
      st.note = h('input', { type: 'text', placeholder: 'What changed, what you saw (optional)', maxlength: 200, 'aria-label': 'Note' });
      st.now = h('div.mt-s'); st.list = h('div.col.gap-s.mt'); st.count = h('span.small.dim');
      var file = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
      file.addEventListener('change', function () {
        var f = file.files && file.files[0]; if (!f) return; var rd = new FileReader();
        rd.onload = function () { try { var r = BN.import(JSON.parse(rd.result)); toast('Imported ' + r.added + (r.skipped ? ' (' + r.skipped + ' skipped)' : ''), r.added ? 'ok' : 'info'); renderList(); } catch (e) { toast('That file is not a bench log', 'bad'); } file.value = ''; };
        rd.readAsText(f);
      });
      var save = btn('Save snapshot', function () {
        var e = currentCapture(st.label.value, st.note.value); BN.add(e); toast('Saved "' + e.label + '"', 'ok'); st.note.value = ''; st.label.value = 'Bench ' + U.stamp(new Date()).slice(11, 16); renderList();
      }, 'primary');
      var saveCard = h('div.card', h('h2', 'Bench log'), h('div.sub', 'A dated record of how the rig was set up and how it behaved. Save one after each change that mattered, so you can see which setup gave the good run, put it back, or paste it to Claude.'),
        h('div.grid.c2.mt', h('div.field', h('div.l', 'Name'), st.label), h('div.field', h('div.l', 'Note'), st.note)),
        h('div.eyebrow.mt', 'Will be saved'), st.now, h('div.row.wrap.gap-s.mt', save));
      var listCard = h('div.card', h('div.row.between.wrap', h('h2', 'Saved snapshots'), h('div.row.wrap.gap-s', st.count,
        btn('Copy all as text', function () { var l = BN.list(); if (!l.length) return toast('Nothing to copy', 'info'); copyText(l.map(BN.text).join('\n\n----------------------------------------\n\n'), 'All snapshots as text'); }, 'sm'),
        btn('Download all', function () { var l = BN.list(); if (!l.length) return toast('Nothing to download', 'info'); U.download('ring-bench-log-' + U.fileStamp() + '.json', JSON.stringify({ kind: 'ring-bench-log', entries: l }, null, 2), 'application/json'); }, 'sm'),
        btn('Import', function () { file.click(); }, 'sm'))), st.list,
        h('div.tiny.faint.mt', 'Snapshots live in this browser only. Download them if you clear browser data or use another device.'));
      host.appendChild(h('div.scroll', h('div.wrap', h('div.col', saveCard, listCard, file))));
      st.unsub.push(L.on('cfg', renderNow)); st.unsub.push(L.on('health', renderNow));
      renderNow(); renderList();
    },
    unmount: function () { if (!st) return; st.unsub.forEach(function (u) { try { u(); } catch (e) { /* ignore */ } }); st = null; }
  };
  RS.screens.bench = BNS;
})();
