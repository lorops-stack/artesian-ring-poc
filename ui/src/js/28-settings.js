/* Ring Studio · Settings: connection, profiles (F14, F23), display, the ring (Wi-Fi password, LEDs), firmware
   (status, over-the-air update F18, reboot, resets) and about. Calibration save/load lives in the studio (C13). */
var RS = globalThis.RS || (globalThis.RS = {});
(function () {
  'use strict';
  var U = RS.util, h = U.h, L = RS.link, S = RS.store;

  var SET = RS.screens.settings = { title: 'Settings' };
  SET.mount = function (host) {
    var self = this;
    var scroll = h('div.scroll'), wrap = h('div.wrap'); scroll.appendChild(wrap); host.appendChild(scroll);
    this.wrap = wrap; this.render();
    this.unsub = [L.on('cfg', function () { self.render(); }), L.on('status', function () { self.renderFirmware(); }), L.on('mode', function () { self.render(); }), L.on('open', function () { self.render(); }), S.on('change', function (k) { if (k !== 'route') self.renderDisplay(); })];
  };
  SET.unmount = function () { this.unsub.forEach(function (u) { u(); }); };
  SET.render = function () {
    U.empty(this.wrap);
    this.wrap.appendChild(h('div.mb', h('h2', { style: { margin: 0, fontSize: '22px' } }, 'Settings'), h('div.sub', 'Connection, profiles, display, the ring and its firmware.')));
    var grid = h('div.grid.c2'); this.wrap.appendChild(grid);
    this.conn = h('div.card'); this.prof = h('div.card'); this.disp = h('div.card'); this.ring = h('div.card'); this.fw = h('div.card'); this.about = h('div.card');
    grid.appendChild(this.conn); grid.appendChild(this.prof); grid.appendChild(this.disp); grid.appendChild(this.ring); grid.appendChild(this.fw); grid.appendChild(this.about);
    this.renderConnection(); this.renderProfiles(); this.renderDisplay(); this.renderRing(); this.renderFirmware(); this.renderAbout();
  };
  function field(label, input, unit) { return h('div.field', h('label', label), h('div.in', input, unit ? h('span.unit', unit) : null)); }
  function num(val, min, max, step) { var i = h('input.u', { type: 'number', value: val, min: min, max: max, step: step || 1 }); return i; }

  // ---- connection -------------------------------------------------------------------------------------------------------------------------------------
  SET.renderConnection = function () {
    var self = this, box = this.conn; U.empty(box);
    var d = L.describe();
    box.appendChild(h('h3', 'Connection'));
    box.appendChild(h('div.row.mb', h('span.chip' + (d.live ? '.ok' : (L.mode === 'sim' ? '.info' : '.warn')), h('span.dot', { style: { background: d.live ? 'var(--ok)' : 'var(--cup)' } }), d.label + ' · ' + d.sub), L.info.fw ? h('span.chip', 'firmware ' + L.info.fw) : null));
    var host = h('input', { type: 'text', value: U.store.get('link.host', '192.168.4.1'), placeholder: '192.168.4.1' });
    var auto = h('label.switch' + (U.store.get('link.autoconnect', false) ? '.on' : ''), h('span.tr'), h('span', 'Connect to this ring automatically when Ring Studio opens'));
    auto.addEventListener('click', function () { var v = !U.store.get('link.autoconnect', false); U.store.set('link.autoconnect', v); auto.classList.toggle('on', v); });
    box.appendChild(h('div.col', field('Ring address (join the ArtesianRing Wi-Fi first)', host),
      h('div.row.wrap', h('button.btn.primary', { onclick: function () { var v = host.value.trim(); if (!v) return; U.store.set('link.host', v); L.connectWs(v, { fallback: false, timeout: 4000 }); RS.app.toast('Connecting to ' + v + '…', 'info'); } }, 'Connect to the ring'),
        L.serialSupported() ? h('button.btn', { onclick: function () { L.connectSerial().catch(function (e) { RS.app.toast(e.message, 'bad'); }); } }, 'Connect over USB') : h('span.small.dim', 'USB (Web Serial) needs Chrome or Edge from http://localhost'),
        h('button.btn', { onclick: function () { L.disconnectSerial(); L.useSim('chosen'); } }, 'Use the simulator')),
      auto,
      h('div.small.faint', 'From the ring itself (http://192.168.4.1) Ring Studio connects on its own. The laptop copy uses this address, USB, or the simulator.')));
  };

  // ---- profiles (F14) ------------------------------------------------------------------------------------------------------------------------------------
  SET.renderProfiles = function () {
    var self = this, box = this.prof, cfg = S.cfg(), profs = cfg.profiles || {}, cur = cfg.profile, p = profs[cur] || RS.DEFAULTS.profiles.default, unit = S.get('unit'); U.empty(box);
    box.appendChild(h('div.row.between', h('h3', 'User profile'), h('div.row', h('button.btn.sm', { onclick: function () { self.newProfile(); } }, 'New'), Object.keys(profs).length > 1 && cur !== 'default' ? h('button.btn.sm.danger', { onclick: function () { RS.app.confirm('Delete profile ' + p.name + '?', '', 'Delete', true).then(function (ok) { if (!ok) return; var set = {}; set['profiles.' + cur] = null; set.profile = 'default'; L.setMany(set); }); } }, 'Delete') : null)));
    var seg = h('div.seg.mb'); Object.keys(profs).forEach(function (k) { seg.appendChild(h('button' + (k === cur ? '.on' : ''), { onclick: function () { L.set('profile', k); } }, profs[k].name || k)); }); box.appendChild(seg);
    var toU = function (f) { return unit === 'C' ? U.round(U.fToC(f), 0) : Math.round(f); }, fromU = function (v) { return unit === 'C' ? v * 9 / 5 + 32 : v; };
    var hot = num(toU(p.hotF), 60, 130), cap = num(toU(p.hotCapF), 60, 140), warm = num(toU(p.warmF), 60, 120), cup = num(p.cupMl, 50, 5000, 10), soap = num(p.soapMl, 0.2, 5, 0.1), flow = num(p.flowGpm, 0.5, 2.5, 0.1), name = h('input', { type: 'text', value: p.name });
    var save = function () {
      var set = {}, base = 'profiles.' + cur + '.';
      set[base + 'name'] = name.value || cur; set[base + 'hotF'] = U.round(fromU(+hot.value), 1); set[base + 'hotCapF'] = U.round(fromU(+cap.value), 1); set[base + 'warmF'] = U.round(fromU(+warm.value), 1);
      set[base + 'cupMl'] = +cup.value; set[base + 'soapMl'] = +soap.value; set[base + 'flowGpm'] = +flow.value;
      if (set[base + 'hotF'] > set[base + 'hotCapF']) return RS.app.toast('Hot set point cannot exceed the anti-scald cap', 'bad');
      L.setMany(set).then(function () { RS.app.toast('Profile saved', 'ok'); });
    };
    box.appendChild(h('div.grid.c2', field('Name', name), field('Flow rate', flow, 'gpm'), field('Hot', hot, '°' + unit), field('Hot cap (anti-scald)', cap, '°' + unit), field('Warm and waterfall', warm, '°' + unit), field('Soap dose', soap, 'ml')));
    box.appendChild(h('div.mt', field('Cup fill volume', cup, 'ml'), h('div.row.wrap.mt-s', RS.CUP_PRESETS.map(function (c) { return h('button.btn.sm' + (+cup.value === c.ml ? '.on' : ''), { onclick: function () { cup.value = c.ml; } }, c.name + ' ' + c.ml + ' ml'); }))));
    box.appendChild(h('div.row.end.mt', h('button.btn.primary', { onclick: save }, 'Save profile')));
  };
  SET.newProfile = function () {
    RS.app.prompt('New profile', 'Name', '', { ok: 'Create' }).then(function (v) {
      if (!v) return; var id = v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || ('p' + Date.now()), cfg = S.cfg(), base = U.deepClone(cfg.profiles[cfg.profile] || RS.DEFAULTS.profiles.default); base.name = v;
      var set = {}; set['profiles.' + id] = base; set.profile = id; L.setMany(set);
    });
  };

  // ---- display -------------------------------------------------------------------------------------------------------------------------------------------------
  SET.renderDisplay = function () {
    var box = this.disp; if (!box) return; U.empty(box);
    box.appendChild(h('h3', 'Display and sound'));
    var sw = function (label, key, onchange) { var el = h('label.switch' + (S.get(key) ? '.on' : ''), h('span.tr'), h('span', label)); el.addEventListener('click', function () { S.toggle(key); if (onchange) onchange(); }); return el; };
    var segOf = function (key, opts) { var s = h('div.seg'); opts.forEach(function (o) { s.appendChild(h('button' + (S.get(key) === o[0] ? '.on' : ''), { onclick: function () { S.set(key, o[0]); } }, o[1])); }); return s; };
    box.appendChild(h('div.col', h('div.row.between', h('span.sub', 'Temperature'), segOf('unit', [['F', '°F'], ['C', '°C']])), h('div.row.between', h('span.sub', 'Lengths'), segOf('lenUnit', [['in', 'inches'], ['mm', 'mm']])),
      h('div.row.between', h('span.sub', 'Hand marker'), segOf('marker', RS.MARKERS.map(function (m) { return [m.id, m.name]; }))),
      h('div.row.between', h('span.sub', 'Sound'), h('div.seg', h('button' + (S.get('sound') === 'on' ? '.on' : ''), { onclick: function () { RS.sound.enable(true); } }, 'On'), h('button' + (S.get('sound') !== 'on' ? '.on' : ''), { onclick: function () { RS.sound.enable(false); } }, 'Off'))),
      sw('Radar pulses in the Showcase', 'radar'), sw('Demo loop after 8 s idle (ghost hand, never counted)', 'demoLoop'), sw('Presentation mode: hide the Showcase controls', 'presentation'),
      h('div.small.faint', U.reducedMotion() ? 'Your device asks for reduced motion; animations are off.' : 'Press F for full screen. Keys 1 to 6 switch screens.')));
  };

  // ---- the ring -------------------------------------------------------------------------------------------------------------------------------------------------
  SET.renderRing = function () {
    var box = this.ring, cfg = S.cfg(); U.empty(box);
    box.appendChild(h('h3', 'The ring'));
    var pass = h('input', { type: 'password', placeholder: '8 to 63 characters', autocomplete: 'new-password' });
    box.appendChild(h('div.col', field('New Wi-Fi password (ArtesianRing)', pass), h('div.row.end', h('button.btn.sm', { onclick: function () { if (pass.value.length < 8 || pass.value.length > 63) return RS.app.toast('The password must be 8 to 63 characters', 'bad'); RS.app.confirm('Change the Wi-Fi password?', 'Every device must rejoin ArtesianRing with the new password. Write it down first. Forgotten later: hold BOOT for 10 s (troubleshooting U4).', 'Change').then(function (ok) { if (!ok) return; L.send({ c: 'wifi', pass: pass.value }).then(function () { RS.app.toast('Password changed. Rejoin the Wi-Fi with the new password.', 'ok', 8000); pass.value = ''; }); }); } }, 'Change password'))));
    var count = num(cfg.tuning.ledCount, 1, 300), bright = num(cfg.tuning.ledBright, 10, 255, 5);
    box.appendChild(h('hr.sep'));
    box.appendChild(h('div.grid.c2', field('LED count', count, 'LEDs'), field('LED brightness cap', bright, '/255')));
    box.appendChild(h('div.row.between.mt-s', h('span.small.faint', 'More tuning in the studio (step 10). The colour order is set by the C0 colour test.'), h('button.btn.sm', { onclick: function () { L.setMany({ 'tuning.ledCount': +count.value, 'tuning.ledBright': +bright.value }).then(function () { RS.app.toast('LED settings applied', 'ok'); }); } }, 'Apply')));
    box.appendChild(h('div.row.wrap.mt', h('button.btn.sm', { onclick: function () { L.send({ c: 'led', test: 'white' }); setTimeout(function () { L.send({ c: 'led', test: 'off' }); }, 3000); } }, 'LED white test (3 s)'), h('a.btn.sm', { href: '#/studio/c13' }, 'Saved calibrations'), h('a.btn.sm', { href: '#/studio/c10' }, 'Tuning')));
  };

  // ---- firmware --------------------------------------------------------------------------------------------------------------------------------------------------
  SET.renderFirmware = function () {
    var box = this.fw; if (!box) return; U.empty(box); var st = S.status() || {};
    box.appendChild(h('h3', 'Firmware'));
    box.appendChild(h('div.grid.c2', h('div.tile', h('div.v', h('span', st.fw || '–')), h('div.l', 'firmware')), h('div.tile', h('div.v', h('span', st.up ? U.fmtDur(st.up) : '–')), h('div.l', 'up time')), h('div.tile', h('div.v', h('span', st.rst || '–')), h('div.l', 'last reset reason')), h('div.tile', h('div.v', h('span', st.heap ? Math.round(st.heap / 1024) : '–'), h('small', 'kB')), h('div.l', 'free memory'))));
    box.appendChild(h('div.mt', h('div.field', h('label', 'Over-the-air update'), h('div.small.warn', 'Disabled in this hardening build until the authenticated update path and firmware verification are complete.'))));
    box.appendChild(h('div.row.wrap.mt', h('button.btn.sm', { onclick: function () { RS.app.confirm('Restart the ring?', 'Water stops and the Wi-Fi drops for about 10 seconds.', 'Restart').then(function (ok) { if (ok) L.send({ c: 'reboot' }); }); } }, 'Restart'),
      h('button.btn.sm', { onclick: function () { RS.app.confirm('Reset the running totals?', 'Sessions and water counters on the ring go back to zero. Recordings in this browser stay.', 'Reset').then(function (ok) { if (ok) L.send({ c: 'reset', what: 'totals' }); }); } }, 'Reset totals'),
      h('button.btn.sm.danger', { onclick: function () { RS.app.confirm('Factory reset?', 'Calibration, layouts, profiles and tuning go back to defaults. Saved calibrations are kept. The Wi-Fi password is kept (hold BOOT 10 s to reset it).', 'Factory reset', true).then(function (ok) { if (ok) L.send({ c: 'reset', what: 'factory' }); }); } }, 'Factory reset')));
  };
  SET.ota = function (file) {
    var host = (L.wsHost || '').replace(/^ws:\/\//, '').replace(/\/ws$/, '') || location.host, fd = new FormData(); fd.append('update', file, file.name);
    var t = RS.app.toast('Uploading firmware… do not switch off', 'info', 120000);
    fetch('http://' + host + '/api/update', { method: 'POST', body: fd }).then(function (r) { if (!r.ok) throw new Error('upload failed (' + r.status + ')'); return r.text(); }).then(function () { t.remove(); RS.app.toast('Update received. The ring is restarting.', 'ok', 8000); }).catch(function (e) { t.remove(); RS.app.toast(e.message, 'bad'); });
  };
  SET.renderAbout = function () {
    var box = this.about; U.empty(box);
    box.appendChild(h('h3', 'About'));
    box.appendChild(h('div.col.gap-s.sub', h('div', 'Ring Studio ' + RS.VERSION + ' · protocol ' + RS.PROTO), h('div', 'Artesian Streams · Project Collins · confidential'), h('div', 'Type: Geist (SIL Open Font License, fonts/OFL.txt). No other third-party code.'), h('div.small.faint', 'Docs: 01 design spec, 07 test plan, 08 build guide, 09 troubleshooting, 10 protocol.')));
  };
})();
