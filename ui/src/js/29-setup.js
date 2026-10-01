/* Ring Studio · first-run setup (Wi-Fi password and studio PIN) and the presentation-mode PIN lock. */
var RS = globalThis.RS || (globalThis.RS = {});
(function () {
  'use strict';
  var U = RS.util, h = U.h, L = RS.link, S = RS.store;
  var SU = RS.setup = { open: false };

  SU.firstRun = function () {
    if (SU.open) return; SU.open = true;
    RS.app.modal(function (box, close) {
      var pass = h('input', { type: 'password', placeholder: '8 to 63 characters', autocomplete: 'new-password' }), pass2 = h('input', { type: 'password', placeholder: 'again' }), pin = h('input', { type: 'password', placeholder: '4 to 8 digits', inputmode: 'numeric' }), err = h('div.small', { style: { color: 'var(--bad)', minHeight: '18px' } });
      box.appendChild(h('div.row', RS.logo(34), h('h2', { style: { margin: 0 } }, 'Set up your ring')));
      box.appendChild(h('p.sub', 'This ring still has its temporary password. Choose the Wi-Fi password every device will use to join ArtesianRing, and a PIN that locks the calibration studio in presentation mode. Write both down and keep them private.'));
      box.appendChild(h('div.col', h('div.field', h('label', 'Wi-Fi password'), h('div.in', pass)), h('div.field', h('label', 'Repeat the password'), h('div.in', pass2)), h('div.field', h('label', 'Studio PIN'), h('div.in', pin)), err));
      box.appendChild(h('div.row.end.mt', h('button.btn.primary', { onclick: function () {
        if (pass.value.length < 8 || pass.value.length > 63) return (err.textContent = 'The password must be 8 to 63 characters.');
        if (pass.value !== pass2.value) return (err.textContent = 'The two passwords differ.');
        if (!/^\d{4,8}$/.test(pin.value)) return (err.textContent = 'The PIN must be 4 to 8 digits.');
        L.send({ c: 'setup', pass: pass.value, pin: pin.value }).then(function (ack) {
          close(); SU.open = false;
          RS.app.modal(function (b2, c2) {
            b2.appendChild(h('h2', { style: { margin: '0 0 8px' } }, 'Saved'));
            b2.appendChild(h('p.sub', ack && ack.restart ? 'The ring is restarting its Wi-Fi with the new password. On your laptop or tablet: forget the old ArtesianRing network, join it again with the new password, then reload this page at http://192.168.4.1.' : 'Done.'));
            b2.appendChild(h('div.row.end', h('button.btn.primary', { onclick: c2 }, 'OK')));
          });
        }).catch(function (e) { err.textContent = e.message; });
      } }, 'Save and restart the Wi-Fi')));
    }, { locked: true, onClose: function () { SU.open = false; } });
  };

  // PIN lock screen for a locked route (studio, tests, settings) in presentation mode
  SU.lock = function (route) {
    var A = RS.app, el = A.el; U.empty(el);
    if (A.active && A.active.unmount) { A.active.unmount(); A.active = null; A.route = null; }
    el.appendChild(A.topbar(route));
    var entered = '', dots = h('div.pindots'), msg = h('div.sub', { style: { minHeight: '20px', textAlign: 'center' } }, 'Enter the studio PIN');
    var render = function () { U.empty(dots); for (var i = 0; i < Math.max(4, entered.length); i++) dots.appendChild(h('i' + (i < entered.length ? '.on' : ''))); };
    var submit = function () {
      if (entered.length < 4) return;
      L.send({ c: 'auth', pin: entered }).then(function (ack) { if (ack && ack.ok === false) throw new Error('Wrong PIN'); S.unlockStudio(); A.route = null; A.render(); })
        .catch(function (e) { msg.textContent = e.message || 'Wrong PIN'; msg.style.color = 'var(--bad)'; entered = ''; render(); });
    };
    var pad = h('div.pinpad');
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'].forEach(function (k) {
      pad.appendChild(h('button', { onclick: function () { if (k === '⌫') entered = entered.slice(0, -1); else if (k === 'OK') return submit(); else if (entered.length < 8) entered += k; render(); if (entered.length === 8) submit(); } }, k));
    });
    var card = h('div.card.solid', { style: { width: 'min(420px, 100%)', padding: '34px 30px' } }, h('div.col.gap-l', { style: { alignItems: 'center' } }, RS.logo(40), h('h2', { style: { margin: 0 } }, 'Studio locked'), msg, dots, pad, h('div.row', h('button.btn.ghost.sm', { onclick: function () { A.go('show'); } }, 'Back to the Showcase'), h('button.btn.ghost.sm', { onclick: function () { S.set('presentation', false); A.route = null; A.render(); } }, 'Leave presentation mode'))));
    el.appendChild(h('div.screen', h('div.center', card)));
    render();
    document.addEventListener('keydown', function onKey(e) { if (!document.body.contains(pad)) return document.removeEventListener('keydown', onKey); if (/^\d$/.test(e.key) && entered.length < 8) { entered += e.key; render(); } else if (e.key === 'Backspace') { entered = entered.slice(0, -1); render(); } else if (e.key === 'Enter') submit(); });
  };
})();
