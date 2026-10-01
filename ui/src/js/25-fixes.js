/* Ring Studio · guided fixes (C14): renders a troubleshooting code from docs/09 as a panel with causes, numbered
   steps and a Test again button; plus the symptom finder. Data comes from js/data/fixes.js (generated). */
var RS = globalThis.RS || (globalThis.RS = {});
(function () {
  'use strict';
  var U = RS.util, h = U.h;

  // Tiny markdown → DOM: paragraphs, **bold**, `code`, numbered and bulleted lists, ```blocks```, "**Label:** text" lines.
  RS.md = function (text) {
    var root = h('div.md'), lines = String(text || '').replace(/\r/g, '').split('\n'), i = 0, list = null, listType = null, para = [];
    var inline = function (s) {
      var frag = document.createDocumentFragment(), re = /(\*\*[^*]+\*\*|`[^`]+`)/g, last = 0, m;
      while ((m = re.exec(s))) {
        if (m.index > last) frag.appendChild(document.createTextNode(s.slice(last, m.index)));
        var t = m[0];
        if (t[0] === '*') frag.appendChild(h('strong', t.slice(2, -2))); else frag.appendChild(h('code.kbd', t.slice(1, -1)));
        last = m.index + t.length;
      }
      if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
      // fix codes become clickable
      return frag;
    };
    var flushPara = function () { if (para.length) { root.appendChild(h('p', { style: { margin: '6px 0' } }, inline(para.join(' ')))); para = []; } };
    var flushList = function () { list = null; listType = null; };
    while (i < lines.length) {
      var ln = lines[i];
      if (/^```/.test(ln)) { flushPara(); flushList(); var code = []; i++; while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]); root.appendChild(h('div.code', code.join('\n'))); i++; continue; }
      var mo = /^\s*(\d+)\.\s+(.*)$/.exec(ln), mb = /^\s*[-*]\s+(.*)$/.exec(ln);
      if (mo || mb) {
        flushPara(); var type = mo ? 'ol' : 'ul', txt = mo ? mo[2] : mb[1], indent = /^\s+/.test(ln);
        if (!list || listType !== type) { list = h(type + (type === 'ol' ? '.steps' : '.plain')); listType = type; root.appendChild(list); }
        var li = h('li', inline(txt)); if (indent) li.style.marginLeft = '14px'; list.appendChild(li); i++; continue;
      }
      if (!ln.trim()) { flushPara(); flushList(); i++; continue; }
      flushList(); para.push(ln.trim()); i++;
    }
    flushPara();
    return root;
  };

  RS.fixInfo = function (code) { return (RS.FIXES || {})[code] || null; };
  // Panel element for a code. opts: {onTest(), compact, detail}
  RS.fixPanel = function (code, opts) {
    opts = opts || {}; var fx = RS.fixInfo(code);
    if (!fx) return h('div.callout.warn', h('div.row', h('span.fixcode', code), h('strong', 'No guide entry for ' + code)), h('div.sub.mt-s', 'docs/09-troubleshooting.md does not have this code yet.'));
    var head = h('div.row.between.wrap', h('div.row', h('span.fixcode.bad', fx.code), h('strong', fx.title)), h('span.tiny.dim', fx.kind + (fx.detect ? ' · ' + fx.detect : '')));
    var body = h('div', { style: { fontSize: '13px' } }, RS.md(fx.body));
    var panel = h('div.callout.bad', head, opts.detail ? h('div.sub.mt-s', opts.detail) : null, h('div.mt-s', body));
    if (opts.onTest) panel.appendChild(h('div.row.end.mt', h('button.btn.sm.primary', { onclick: opts.onTest }, 'Test again')));
    return panel;
  };
  // Modal with a code (and the family's neighbours)
  RS.showFix = function (code, onTest) {
    RS.app.modal(function (box, close) {
      box.appendChild(h('div.row.between', h('h2', { style: { margin: 0 } }, 'Guided fix'), h('button.btn.sm.ghost', { onclick: close }, 'Close')));
      box.appendChild(h('div.mt', RS.fixPanel(code, { onTest: onTest ? function () { close(); onTest(); } : null })));
      box.appendChild(h('div.small.faint.mt', 'The full guide is docs/09-troubleshooting.md. If a fix does not work, section 13 of that guide says what to send.'));
    }, { wide: true });
  };
  // Symptom finder: search box over the symptom table and every code title
  RS.symptomFinder = function (host) {
    var inp = h('input', { type: 'search', placeholder: 'What do you see? e.g. "water won\'t turn off", "PWR light", "fit error"' }), out = h('div.col.gap-s.mt');
    var render = function () {
      var q = inp.value.trim().toLowerCase(); U.empty(out);
      var rows = (RS.SYMPTOMS || []).filter(function (s) { return !q || s.see.toLowerCase().indexOf(q) >= 0 || s.codes.join(' ').toLowerCase().indexOf(q) >= 0; });
      var codes = Object.keys(RS.FIXES || {}).filter(function (c) { return q && (c.toLowerCase() === q || RS.FIXES[c].title.toLowerCase().indexOf(q) >= 0); });
      if (!rows.length && !codes.length) out.appendChild(h('div.sub', 'Nothing matches. Try another word, or send me a description (guide section 13).'));
      rows.slice(0, 40).forEach(function (s) { out.appendChild(h('div.row.between.check', h('span', s.see + (s.note ? '  ·  ' : ''), s.note ? h('strong', s.note) : null), h('span.row.gap-s', s.codes.map(function (c) { return h('span.fixcode', { onclick: function () { RS.showFix(c); } }, c); })))); });
      codes.forEach(function (c) { out.appendChild(h('div.row.between.check', h('span', RS.FIXES[c].title), h('span.fixcode', { onclick: function () { RS.showFix(c); } }, c))); });
    };
    inp.addEventListener('input', render); render();
    host.appendChild(h('div.field', h('label', 'Symptom finder'), h('div.in', inp))); host.appendChild(out);
    return { render: render };
  };
})();
