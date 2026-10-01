/* Ring Studio · UI state: persisted preferences plus derived live values, with change notification. */
var RS = globalThis.RS || (globalThis.RS = {});
(function () {
  'use strict';
  var U = RS.util, L = RS.link;
  var S = RS.store = new U.Emitter();
  S.prefs = Object.assign({
    unit: 'F', marker: 'focus', sound: 'locked', radar: true, engineering: false, presentation: false,
    lenUnit: 'in', route: 'show', pinOk: false, heatmap: false, demoLoop: true, reduced: U.reducedMotion()
  }, U.store.get('prefs', {}));
  S.get = function (k) { return S.prefs[k]; };
  S.set = function (k, v) { if (S.prefs[k] === v) return; S.prefs[k] = v; U.store.set('prefs', S.prefs); S.emit('change', k, v); S.emit('change:' + k, v); };
  S.toggle = function (k) { S.set(k, !S.prefs[k]); };

  // Convenience accessors over the link's latest messages
  S.cfg = function () { return L.latest.cfg || RS.DEFAULTS; };
  S.profile = function () { var c = S.cfg(); return c.profiles[c.profile] || c.profiles.default || RS.DEFAULTS.profiles.default; };
  S.frame = function () { return L.latest.frame; };
  S.status = function () { return L.latest.status; };
  S.health = function () { return L.latest.health; };
  S.zones = function () { var c = S.cfg(); return RS.geo.zones(c.layout, c.layouts); };
  S.layoutName = function () { var c = S.cfg(); return (c.layouts[c.layout] || {}).name || c.layout; };
  S.temp = function (fn) {
    var p = S.profile(), u = S.prefs.unit;
    if (fn === 'hot') return U.fmtTemp(p.hotF, u); if (fn === 'hotcap') return U.fmtTemp(p.hotCapF, u);
    if (fn === 'warm' || fn === 'waterfall') return U.fmtTemp(p.warmF, u); return 'mains';
  };
  // Studio lock: in presentation mode the studio needs the PIN once per browser session
  S.studioLocked = function () { return S.prefs.presentation && !S.sessionPin; };
  S.unlockStudio = function () { S.sessionPin = true; S.emit('change', 'lock'); };
})();
