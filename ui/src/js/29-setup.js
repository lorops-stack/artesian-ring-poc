/* Ring Studio · first-run network setup. */
var RS = globalThis.RS || (globalThis.RS = {});
(function () {
  'use strict';
  var U = RS.util, h = U.h, L = RS.link, S = RS.store;
  var SU = RS.setup = { open: false };

  SU.firstRun = function () {
    if (SU.open) return; SU.open = true;
    RS.app.modal(function (box, close) {
      var pass = h('input', { type: 'password', placeholder: '8 to 63 characters', autocomplete: 'new-password' }), pass2 = h('input', { type: 'password', placeholder: 'again' }), err = h('div.small', { style: { color: 'var(--bad)', minHeight: '18px' } });
      box.appendChild(h('div.row', RS.logo(34), h('h2', { style: { margin: 0 } }, 'Set up your ring')));
      box.appendChild(h('p.sub', 'This ring still has its temporary password. Choose the Wi-Fi password every device will use to join ArtesianRing. Access to Ring Studio is protected by this private WPA2 network.'));
      box.appendChild(h('div.col', h('div.field', h('label', 'Wi-Fi password'), h('div.in', pass)), h('div.field', h('label', 'Repeat the password'), h('div.in', pass2)), err));
      box.appendChild(h('div.row.end.mt', h('button.btn.primary', { onclick: function () {
        if (pass.value.length < 8 || pass.value.length > 63) return (err.textContent = 'The password must be 8 to 63 characters.');
        if (pass.value !== pass2.value) return (err.textContent = 'The two passwords differ.');
        L.send({ c: 'setup', pass: pass.value }).then(function (ack) {
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

})();
