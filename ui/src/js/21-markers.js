/* Ring Studio · hand markers (spec 8b): five professional styles, no literal hand. Focus lock is the default. */
var RS = globalThis.RS || (globalThis.RS = {});
(function () {
  'use strict';
  var U = RS.util, rgba = U.rgba;
  RS.MARKERS = [
    { id: 'focus', name: 'Focus lock', why: 'Camera-style corner brackets close in as the hand settles and snap on latch.' },
    { id: 'reticle', name: 'Precision reticle', why: 'A fine targeting ring with guide lines and a live millimetre readout.' },
    { id: 'droplet', name: 'Glass droplet', why: 'A lit water droplet that grows as it locks and ripples while water runs.' },
    { id: 'bloom', name: 'Presence bloom', why: 'A soft radar return with contour rings, like a heat signature.' },
    { id: 'range', name: 'Radar range', why: 'An arc from each sensor at its measured distance, crossing at the hand.' }
  ];
  // o: {x, y, col, settle 0..1, active bool, time s, k scale, bounds {x0,x1,y0,y1}, label, A {x,y,c}, B {x,y,c}, mm (px per mm), latchAge s}
  RS.drawMarker = function (ctx, st, o) {
    var x = o.x, y = o.y, c = o.col, s = o.settle || 0, a = !!o.active, t = o.time || 0, k = o.k || 1, i, I;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (st === 'reticle') {
      if (o.bounds) { ctx.setLineDash([2, 6]); ctx.strokeStyle = rgba(c, 0.2); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(o.bounds.x0, y); ctx.lineTo(x - 48 * k, y); ctx.moveTo(x + 48 * k, y); ctx.lineTo(o.bounds.x1, y); ctx.moveTo(x, o.bounds.y0); ctx.lineTo(x, y - 48 * k); ctx.moveTo(x, y + 48 * k); ctx.lineTo(x, o.bounds.y1); ctx.stroke(); ctx.setLineDash([]); }
      ctx.shadowColor = rgba(c, 0.8); ctx.shadowBlur = a ? 18 : 8;
      ctx.strokeStyle = rgba(c, 0.95); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(x, y, 28 * k, 0, 7); ctx.stroke();
      if (a) { ctx.fillStyle = rgba(c, 0.12); ctx.fill(); }
      for (i = 0; i < 4; i++) { var an = i * Math.PI / 2 + (a ? 0 : Math.PI / 4 * (1 - s)); ctx.beginPath(); ctx.moveTo(x + Math.cos(an) * (28 * k + 4), y + Math.sin(an) * (28 * k + 4)); ctx.lineTo(x + Math.cos(an) * (28 * k + 12), y + Math.sin(an) * (28 * k + 12)); ctx.stroke(); }
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, 7); ctx.fill();
      if (!a && s > 0) { ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, 38 * k, -Math.PI / 2, -Math.PI / 2 + 6.283 * s); ctx.stroke(); }
      if (o.label) { ctx.shadowBlur = 0; ctx.font = '500 11px "Geist Mono", ui-monospace, monospace'; ctx.fillStyle = 'rgba(255,255,255,0.62)'; ctx.fillText(o.label, x + 46 * k, y - 34 * k); }
    } else if (st === 'droplet') {
      I = a ? 1 : 0.3 + 0.7 * s;
      var r = 22 * k * (a ? 1 + 0.04 * Math.sin(t * 3) : 0.82 + 0.18 * s);
      ctx.globalCompositeOperation = 'lighter';
      var hg = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 3); hg.addColorStop(0, rgba(c, 0.3 * I)); hg.addColorStop(1, rgba(c, 0)); ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(x, y, r * 3, 0, 7); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      if (a) for (i = 0; i < 3; i++) { var ph = ((t * 36 + i * 22) % 66) / 66; ctx.strokeStyle = rgba(c, 0.35 * (1 - ph)); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(x, y, r + ph * 60 * k, (r + ph * 60 * k) * 0.86, 0, 0, 7); ctx.stroke(); }
      var bg = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r); bg.addColorStop(0, 'rgba(255,255,255,0.42)'); bg.addColorStop(0.55, rgba(c, 0.32)); bg.addColorStop(1, rgba(c, 0.85));
      ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.ellipse(x - r * 0.36, y - r * 0.42, r * 0.34, r * 0.18, -0.6, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(x, y, r * 0.72, 0.3, 1.2); ctx.stroke();
    } else if (st === 'bloom') {
      I = a ? 1 : 0.35 + 0.65 * s;
      ctx.globalCompositeOperation = 'lighter';
      [[70, 0.10], [46, 0.2], [22, 0.5]].forEach(function (Lr, j) { var ox = Math.sin(t * 1.3 + j * 2) * 4 * k, oy = Math.cos(t * 1.1 + j) * 4 * k, g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, Lr[0] * k); g.addColorStop(0, rgba(c, Lr[1] * I)); g.addColorStop(1, rgba(c, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x + ox, y + oy, Lr[0] * k, 0, 7); ctx.fill(); });
      ctx.fillStyle = 'rgba(255,255,255,' + (0.55 * I) + ')'; ctx.beginPath(); ctx.arc(x, y, 4 * k, 0, 7); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      for (var j2 = 0; j2 < 3; j2++) { var R = (30 + 16 * j2) * k; ctx.strokeStyle = rgba(c, 0.2 * I); ctx.lineWidth = 1; ctx.beginPath(); for (i = 0; i <= 60; i++) { var ang = i / 60 * 6.2832, rr2 = R * (1 + 0.05 * Math.sin(ang * 3 + t * 2 + j2)); if (i === 0) ctx.moveTo(x + Math.cos(ang) * rr2, y + Math.sin(ang) * rr2); else ctx.lineTo(x + Math.cos(ang) * rr2, y + Math.sin(ang) * rr2); } ctx.stroke(); }
    } else if (st === 'range' && o.A && o.B) {
      [o.A, o.B].forEach(function (Sn) {
        var d = Math.hypot(x - Sn.x, y - Sn.y), ang = Math.atan2(y - Sn.y, x - Sn.x);
        ctx.setLineDash([2, 6]); ctx.strokeStyle = rgba(Sn.c, 0.18); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(Sn.x, Sn.y, d, ang - 0.55, ang + 0.55); ctx.stroke(); ctx.setLineDash([]);
        ctx.shadowColor = rgba(Sn.c, 0.9); ctx.shadowBlur = 12; ctx.strokeStyle = rgba(Sn.c, 0.9); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(Sn.x, Sn.y, d, ang - 0.16, ang + 0.16); ctx.stroke(); ctx.shadowBlur = 0;
        if (o.mm) { var lx = Sn.x + Math.cos(ang + 0.2) * d, ly = Sn.y + Math.sin(ang + 0.2) * d; ctx.font = '500 11px "Geist Mono", ui-monospace, monospace'; ctx.fillStyle = rgba(Sn.c, 0.85); ctx.fillText(Math.round(d / o.mm) + ' mm', lx + 6, ly); }
      });
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.shadowColor = rgba(c, 0.9); ctx.shadowBlur = a ? 16 : 6;
      if (a) { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(-5 * k, -5 * k, 10 * k, 10 * k); } else { ctx.strokeStyle = c; ctx.lineWidth = 1.8; ctx.strokeRect(-5 * k, -5 * k, 10 * k, 10 * k); }
      ctx.restore();
      if (!a && s > 0) { ctx.strokeStyle = rgba(c, 0.9); ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(x, y, 18 * k, -Math.PI / 2, -Math.PI / 2 + 6.283 * s); ctx.stroke(); }
    } else { // focus (default)
      var half;
      if (a) { var age = o.latchAge == null ? 1 : o.latchAge; half = 22 * k * (1 + 0.16 * Math.exp(-age * 8) * Math.cos(age * 30)); } else half = (34 - 12 * s) * k;
      var L2 = 12 * k, cr = 6 * k;
      if (a) { ctx.fillStyle = rgba(c, 0.09); ctx.beginPath(); ctx.moveTo(x - half + cr, y - half); ctx.arcTo(x + half, y - half, x + half, y + half, cr); ctx.arcTo(x + half, y + half, x - half, y + half, cr); ctx.arcTo(x - half, y + half, x - half, y - half, cr); ctx.arcTo(x - half, y - half, x + half, y - half, cr); ctx.fill(); }
      ctx.shadowColor = rgba(c, 0.9); ctx.shadowBlur = a ? 16 : 6; ctx.strokeStyle = a ? c : rgba(c, 0.6 + 0.4 * s); ctx.lineWidth = 2.2;
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) {
        var cx = x + q[0] * half, cy = y + q[1] * half;
        ctx.beginPath(); ctx.moveTo(cx, cy - q[1] * L2); ctx.lineTo(cx, cy - q[1] * cr); ctx.arcTo(cx, cy, cx - q[0] * cr, cy, cr); ctx.lineTo(cx - q[0] * L2, cy); ctx.stroke();
      });
      ctx.shadowBlur = 0; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, 2.2, 0, 7); ctx.fill();
    }
    ctx.restore();
  };
})();
