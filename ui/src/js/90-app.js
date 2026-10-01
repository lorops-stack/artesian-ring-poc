/* Ring Studio · app shell: router, top bar, toasts, modals, the animation loop, first-run setup and the studio lock. */
var RS = globalThis.RS || (globalThis.RS = {});
(function () {
  'use strict';
  var U = RS.util, h = U.h, L = RS.link, S = RS.store;
  var A = RS.app = new U.Emitter();
  RS.screens = RS.screens || {};
  A.route = null; A.active = null; A.el = null;

  var NAV = [['show', 'Showcase'], ['operator', 'Operator'], ['studio', 'Calibrate'], ['tests', 'Tests'], ['dashboard', 'Dashboard'], ['settings', 'Settings']];
  var LOCKED = { studio: 1, tests: 1, settings: 1, dashboard: 0, operator: 0, show: 0 };

  // ---- toasts and modals ---------------------------------------------------------------------------------------------------------------
  A.toast = function (msg, kind, ms) {
    var box = document.querySelector('.toasts') || document.body.appendChild(h('div.toasts'));
    var t = h('div.toast' + (kind ? '.' + kind : ''), msg);
    box.appendChild(t); setTimeout(function () { t.style.opacity = '0'; setTimeout(function () { t.remove(); }, 400); }, ms || 3200);
    return t;
  };
  A.modal = function (build, opts) {
    opts = opts || {};
    var bg = h('div.modal-bg'), box = h('div.modal' + (opts.wide ? '.wide' : ''));
    var close = function () { bg.remove(); document.removeEventListener('keydown', esc); if (opts.onClose) opts.onClose(); };
    var esc = function (e) { if (e.key === 'Escape' && !opts.locked) close(); };
    bg.appendChild(box); if (!opts.locked) bg.addEventListener('click', function (e) { if (e.target === bg) close(); });
    document.addEventListener('keydown', esc);
    build(box, close); document.body.appendChild(bg);
    var f = box.querySelector('input, button.primary, button'); if (f && !opts.noFocus) setTimeout(function () { f.focus(); }, 30);
    return close;
  };
  A.confirm = function (title, text, okLabel, danger) {
    return new Promise(function (res) {
      A.modal(function (box, close) {
        box.appendChild(h('h2', { style: { margin: '0 0 8px', fontSize: '20px' } }, title));
        box.appendChild(h('p.sub', { style: { margin: '0 0 20px' } }, text));
        box.appendChild(h('div.row.end', h('button.btn', { onclick: function () { close(); res(false); } }, 'Cancel'), h('button.btn.primary' + (danger ? '.danger' : ''), { onclick: function () { close(); res(true); } }, okLabel || 'OK')));
      });
    });
  };
  A.prompt = function (title, label, value, opts) {
    opts = opts || {};
    return new Promise(function (res) {
      A.modal(function (box, close) {
        var inp = h('input', { type: opts.type || 'text', value: value || '', placeholder: opts.placeholder || '' });
        box.appendChild(h('h2', { style: { margin: '0 0 12px', fontSize: '20px' } }, title));
        if (opts.text) box.appendChild(h('p.sub', { style: { margin: '0 0 14px' } }, opts.text));
        box.appendChild(h('div.field', h('label', label), h('div.in', inp)));
        var ok = function () { close(); res(inp.value); };
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') ok(); });
        box.appendChild(h('div.row.end.mt-l', h('button.btn', { onclick: function () { close(); res(null); } }, 'Cancel'), h('button.btn.primary', { onclick: ok }, opts.ok || 'Save')));
      });
    });
  };

  // ---- router ----------------------------------------------------------------------------------------------------------------------------
  A.go = function (route) { location.hash = '#/' + route; };
  function routeFromHash() { var m = /^#\/([a-z]+)/.exec(location.hash || ''); return m && RS.screens[m[1]] ? m[1] : (RS.screens[S.get('route')] ? S.get('route') : 'show'); }
  A.render = function () {
    var route = routeFromHash();
    if (LOCKED[route] && S.studioLocked()) { RS.setup.lock(route); return; }
    if (A.route === route && A.active) { if (A.active.onHash) A.active.onHash(location.hash); return; }
    if (A.active && A.active.unmount) A.active.unmount();
    A.route = route; S.set('route', route);
    var scr = RS.screens[route]; A.active = scr;
    U.empty(A.el);
    if (route !== 'show') A.el.appendChild(A.topbar(route));
    var host = h('div.screen'); A.el.appendChild(host);
    scr.mount(host);
    document.title = (scr.title || 'Ring Studio') + ' · Ring Studio';
    A.emit('route', route);
  };
  A.topbar = function (route) {
    var desc = L.describe();
    var linkChip = h('span.chip' + (desc.live ? '.ok' : (L.mode === 'sim' ? '.info' : '.warn')), { title: 'Connection. Change it in Settings.', onclick: function () { A.go('settings'); }, style: { cursor: 'pointer' } }, h('span.dot.live', { style: { background: desc.live ? 'var(--ok)' : (L.mode === 'sim' ? 'var(--cup)' : 'var(--warn)') } }), desc.label + ' · ' + desc.sub);
    A.linkChip = linkChip;
    var rec = h('span.chip.hide', h('span.recording-dot'), 'Recording');
    A.recChip = rec;
    return h('div.topbar',
      h('div.brand', RS.logo(30), h('div', h('div.t', 'Ring Studio'), h('div.s', 'Artesian Streams · the faucetless sink ring'))),
      h('nav.nav', NAV.map(function (n) { return h('a' + (n[0] === route ? '.on' : ''), { href: '#/' + n[0] }, n[1]); })),
      h('div.row', rec, linkChip));
  };
  RS.logo = function (size, color) {
    var ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', size); svg.setAttribute('height', size); svg.setAttribute('viewBox', '0 0 30 30'); svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = '<rect x="3" y="4" width="24" height="22" rx="7" fill="none" stroke="' + (color || '#4FD1E8') + '" stroke-width="2.4"/><rect x="8.5" y="9.5" width="13" height="11" rx="3.5" fill="none" stroke="#EEF1F4" stroke-opacity="0.35" stroke-width="1.4"/>';
    return svg;
  };
  A.refreshChips = function () {
    if (A.linkChip) { var d = L.describe(), chip = A.linkChip; chip.className = 'chip ' + (d.live ? 'ok' : (L.mode === 'sim' ? 'info' : 'warn')); chip.lastChild.textContent = d.label + ' · ' + d.sub; chip.firstChild.style.background = d.live ? 'var(--ok)' : (L.mode === 'sim' ? 'var(--cup)' : 'var(--warn)'); }
    if (A.recChip) A.recChip.classList.toggle('hide', !RS.rec.current);
  };

  // ---- animation loop ------------------------------------------------------------------------------------------------------------------------
  function loop(now) { L.tick(now); if (A.active && A.active.tick) A.active.tick(now); requestAnimationFrame(loop); }

  // ---- boot ---------------------------------------------------------------------------------------------------------------------------------
  A.boot = function () {
    A.el = document.getElementById('app');
    window.addEventListener('hashchange', A.render);
    L.on('open', function () { A.refreshChips(); A.toast(L.describe().label + ' · ' + L.describe().sub, L.mode === 'sim' ? 'info' : 'ok'); });
    L.on('close', function () { A.refreshChips(); A.toast('Connection to the ring lost. Reconnecting…', 'warn'); });
    L.on('mode', A.refreshChips);
    L.on('status', function (st) { if (st.setup && !RS.setup.open) RS.setup.firstRun(); A.refreshChips(); });
    L.on('err', function (e) { if (e.msg) A.toast(e.msg, 'bad'); });
    L.on('event', function (e) { if (e.ev === 'button' && e.a === 'cal') { A.toast('BOOT button: opening the calibration studio', 'info'); A.go('studio'); } if (e.ev === 'button' && e.a === 'reset') A.toast('Wi-Fi password and PIN reset from the BOOT button. The ring restarts with a temporary password (see the serial monitor).', 'warn', 10000); });
    RS.rec.on('start', A.refreshChips); RS.rec.on('session', function () { A.refreshChips(); });
    S.on('change:presentation', function () { if (!S.get('presentation')) S.sessionPin = false; });
    A.render();
    L.autoStart();
    requestAnimationFrame(loop);
    // keyboard: F for full screen, 1-6 screens when not typing
    document.addEventListener('keydown', function (e) {
      if (/input|textarea|select/i.test((e.target && e.target.tagName) || '')) return;
      if (e.key === 'f' || e.key === 'F') { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); }
      var n = parseInt(e.key, 10); if (n >= 1 && n <= NAV.length && !e.metaKey && !e.ctrlKey) A.go(NAV[n - 1][0]);
    });
  };
  if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', A.boot); else A.boot(); }
})();
