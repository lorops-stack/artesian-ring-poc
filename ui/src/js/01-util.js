/* Ring Studio · small utilities shared by every module. */
var RS = globalThis.RS || (globalThis.RS = {});
(function () {
  'use strict';
  var U = RS.util = {};

  U.clamp = function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
  U.hypot = function (x, y) { return Math.sqrt(x * x + y * y); };
  U.deg = function (r) { return r * 180 / Math.PI; };
  U.rad = function (d) { return d * Math.PI / 180; };
  U.round = function (v, n) { var p = Math.pow(10, n || 0); return Math.round(v * p) / p; };
  U.mean = function (a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0; };
  U.median = function (a) { if (!a.length) return 0; var b = a.slice().sort(function (x, y) { return x - y; }); var m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
  U.std = function (a) { var m = U.mean(a), s = 0; for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m); return a.length > 1 ? Math.sqrt(s / (a.length - 1)) : 0; };
  U.rms = function (a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i] * a[i]; return a.length ? Math.sqrt(s / a.length) : 0; };
  U.uuid = function () { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }); };
  U.deepClone = function (o) { return JSON.parse(JSON.stringify(o)); };
  U.deepMerge = function (base, patch) {
    if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return patch === undefined ? base : patch;
    var out = (base && typeof base === 'object' && !Array.isArray(base)) ? Object.assign({}, base) : {};
    Object.keys(patch).forEach(function (k) { out[k] = U.deepMerge(out[k], patch[k]); });
    return out;
  };
  U.getPath = function (o, path) { var p = path.split('.'), c = o; for (var i = 0; i < p.length; i++) { if (c == null) return undefined; c = c[p[i]]; } return c; };
  U.setPath = function (o, path, v) { var p = path.split('.'), c = o; for (var i = 0; i < p.length - 1; i++) { if (c[p[i]] == null || typeof c[p[i]] !== 'object') c[p[i]] = {}; c = c[p[i]]; } c[p[p.length - 1]] = v; return o; };

  // Seeded random (Park-Miller), so simulations are repeatable in tests.
  U.rng = function (seed) {
    var s = (seed || 7) % 2147483647; if (s <= 0) s += 2147483646;
    var next = function () { s = (s * 16807) % 2147483647; return s / 2147483647; };
    next.gauss = function () { var u = 0, v = 0; while (u === 0) u = next(); v = next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    return next;
  };

  // Colours
  U.hexRgb = function (h) { var n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  U.rgba = function (h, a) { var c = U.hexRgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; };
  U.mix = function (h1, h2, t) { var a = U.hexRgb(h1), b = U.hexRgb(h2); return '#' + [0, 1, 2].map(function (i) { return ('0' + Math.round(a[i] + (b[i] - a[i]) * t).toString(16)).slice(-2); }).join(''); };

  // Units and formatting
  U.IN = 25.4;
  U.mmToUnit = function (mm, unit) { return unit === 'in' ? mm / U.IN : mm; };
  U.unitToMm = function (v, unit) { return unit === 'in' ? v * U.IN : v; };
  U.fmtLen = function (mm, unit, digits) { return unit === 'in' ? (mm / U.IN).toFixed(digits == null ? 2 : digits) + ' in' : Math.round(mm) + ' mm'; };
  U.fToC = function (f) { return (f - 32) * 5 / 9; };
  U.fmtTemp = function (f, unit) { return unit === 'C' ? Math.round(U.fToC(f)) + '°C' : Math.round(f) + '°F'; };
  U.gal = function (ml) { return ml / 3785.41; };
  U.fmtMl = function (ml) { return ml >= 1000 ? (ml / 1000).toFixed(2) + ' L' : Math.round(ml) + ' ml'; };
  U.fmtDur = function (ms) { var s = Math.round(ms / 1000); if (s < 60) return s + ' s'; var m = Math.floor(s / 60); s -= m * 60; if (m < 60) return m + ' min ' + s + ' s'; var h = Math.floor(m / 60); return h + ' h ' + (m - h * 60) + ' min'; };
  U.pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
  U.stamp = function (d) { d = d || new Date(); return d.getFullYear() + '-' + U.pad2(d.getMonth() + 1) + '-' + U.pad2(d.getDate()) + ' ' + U.pad2(d.getHours()) + ':' + U.pad2(d.getMinutes()); };
  U.fileStamp = function (d) { d = d || new Date(); return d.getFullYear() + U.pad2(d.getMonth() + 1) + U.pad2(d.getDate()) + '-' + U.pad2(d.getHours()) + U.pad2(d.getMinutes()) + U.pad2(d.getSeconds()); };

  // Event emitter
  U.Emitter = function () { this._h = {}; };
  U.Emitter.prototype.on = function (ev, fn) { (this._h[ev] || (this._h[ev] = [])).push(fn); var self = this; return function () { self.off(ev, fn); }; };
  U.Emitter.prototype.off = function (ev, fn) { var a = this._h[ev]; if (!a) return; var i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); };
  U.Emitter.prototype.emit = function (ev) { var a = this._h[ev]; if (!a) return; var args = Array.prototype.slice.call(arguments, 1); a.slice().forEach(function (fn) { try { fn.apply(null, args); } catch (e) { console.error('[RS] handler for ' + ev + ' failed', e); } }); };

  // Persistent key-value (localStorage with a safe fallback)
  var mem = {};
  U.store = {
    get: function (k, d) { try { var v = globalThis.localStorage && localStorage.getItem('rs.' + k); return v == null ? (k in mem ? mem[k] : d) : JSON.parse(v); } catch (e) { return k in mem ? mem[k] : d; } },
    set: function (k, v) { mem[k] = v; try { globalThis.localStorage && localStorage.setItem('rs.' + k, JSON.stringify(v)); } catch (e) { /* storage full or blocked: keep in memory */ } },
    del: function (k) { delete mem[k]; try { globalThis.localStorage && localStorage.removeItem('rs.' + k); } catch (e) { /* ignore */ } }
  };

  // File download / upload (browser only)
  U.download = function (name, text, type) {
    if (typeof document === 'undefined') return;
    var blob = new Blob([text], { type: type || 'application/json' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  U.pickFile = function (accept, cb) {
    var inp = document.createElement('input'); inp.type = 'file'; if (accept) inp.accept = accept;
    inp.onchange = function () { var f = inp.files[0]; if (!f) return; var r = new FileReader(); r.onload = function () { cb(r.result, f.name); }; r.readAsText(f); };
    inp.click();
  };
  U.toCsv = function (rows) { return rows.map(function (r) { return r.map(function (v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\n'); };

  // DOM helper: h('div.cls#id', {attrs}, children...) ; children may be strings, nodes, arrays or null
  U.h = function (sel, attrs) {
    var m = /^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i.exec(sel || 'div'), el = document.createElement(m && m[1] || 'div');
    if (m && m[2]) m[2].match(/[.#][\w-]+/g).forEach(function (t) { if (t[0] === '.') el.classList.add(t.slice(1)); else el.id = t.slice(1); });
    var kids = Array.prototype.slice.call(arguments, 2);
    if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    });
    var add = function (c) { if (c == null || c === false) return; if (Array.isArray(c)) c.forEach(add); else if (c instanceof Node) el.appendChild(c); else el.appendChild(document.createTextNode(String(c))); };
    kids.forEach(add);
    return el;
  };
  U.svgIcon = function (path, size, color, sw) {
    var s = size || 20, ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'), p = document.createElementNS(ns, 'path');
    svg.setAttribute('width', s); svg.setAttribute('height', s); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    p.setAttribute('d', path); p.setAttribute('fill', 'none'); p.setAttribute('stroke', color || 'currentColor'); p.setAttribute('stroke-width', sw || 1.6); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(p); return svg;
  };
  U.empty = function (el) { while (el.firstChild) el.removeChild(el.firstChild); return el; };
  U.reducedMotion = function () { try { return globalThis.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  U.now = function () { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); };
})();
