// Loads the plain-script core (00..05) into one sandbox and returns RS. Used by node tests.
const fs = require('fs'), path = require('path'), vm = require('vm');
module.exports = function load(extra) {
  const dir = path.join(__dirname, '..', 'src', 'js');
  const files = fs.readdirSync(dir).filter(f => /^0\d-.*\.js$/.test(f)).sort().concat(extra || []);
  const ctx = { console, performance: { now: () => Number(process.hrtime.bigint() / 1000000n) }, Math, JSON, Date };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
  return ctx.RS;
};
