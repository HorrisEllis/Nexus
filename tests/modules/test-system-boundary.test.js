'use strict';
// SB-01..06 (0.60.126 DB1): every require() that crosses a system boundary, counted, and a ratchet that only shrinks.
// James, 2026-10-17: "the component registry for each system be the interaction contract and event bus, with handshake
// verification ... the drawbridge for each compartment for each system, the only way to interact between systems."
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const SB = require('../../lib/system-boundary.js');
let passed = 0, failed = 0; const tests = [];
const test = (n, f) => tests.push([n, f]);
const REPO = path.resolve(__dirname, '..', '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-root-'));
const put = (rel, txt) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), txt); };
put('lib/atom.js', "module.exports = 1;\n");
put('lib/up.js', "require('../alpha/a.js');\n");
put('alpha/a.js', "const x = require('../lib/atom.js'); const y = require('./own.js');\n");
put('alpha/own.js', "module.exports = 2;\n");
put('beta/b.js', "import a from '../alpha/a.js';\nconst z = require('../alpha/a.js');\n");
put('tests/t.js', "require('../alpha/a.js');\n");
put('docs/d.js', "require('../alpha/a.js');\n");
put('hooks/beta.hooks.js', "module.exports = {};\n");

test('SB-01 a system is a top-level folder; tests, docs and data are not systems', () => {
  assert.deepStrictEqual(SB.systems(root), ['alpha', 'beta', 'hooks', 'lib']);
});
test('SB-02 each crossing is found once per file pair and named by kind: system, upward (lib/ into a system), kernel (a system using lib/)', () => {
  const s = SB.scan({ root });
  assert.deepStrictEqual(s.crossings.map(c => [c.from, c.to, c.kind]), [
    ['alpha/a.js', 'lib/atom.js', 'kernel'],
    ['beta/b.js', 'alpha/a.js', 'system'],
    ['lib/up.js', 'alpha/a.js', 'upward'],
  ]);
  const c = SB.census({ root });
  assert.deepStrictEqual(c.byKind, { system: 1, upward: 1, kernel: 1, language: 0 });
});
test('SB-03 the ratchet: the baseline holds system and upward edges only (kernel is allowed while DB0a is open)', () => {
  const b = SB.baseline({ root });
  assert.deepStrictEqual(b.edges, ['beta/b.js -> alpha/a.js', 'lib/up.js -> alpha/a.js']);
  assert.ok(SB.check({ root, baseline: b }).ok);
});
test('SB-04 a new crossing fails the ratchet and is named; a closed one is counted as progress', () => {
  const b = SB.baseline({ root });
  put('alpha/new.js', "require('../beta/b.js');\n");
  fs.writeFileSync(path.join(root, 'lib/up.js'), "module.exports = 0;\n");
  const r = SB.check({ root, baseline: b });
  assert.strictEqual(r.ok, false);
  assert.deepStrictEqual(r.added.map(x => [x.edge, x.kind]), [['alpha/new.js -> beta/b.js', 'system']]);
  assert.deepStrictEqual(r.closed, ['lib/up.js -> alpha/a.js']);
});
test('SB-05 no baseline is said, not passed', () => {
  const r = SB.check({ root: fs.mkdtempSync(path.join(os.tmpdir(), 'sb-empty-')) });
  assert.strictEqual(r.ok, false); assert.ok(/no baseline/.test(r.why));
});
test('SB-06 Nexus itself: no crossing between systems beyond contracts/drawbridge-baseline.json (move one to the drawbridge: remove its line)', () => {
  const r = SB.check({ root: REPO });
  assert.ok(!r.why, r.why);
  assert.ok(r.ok, `new crossings outside the drawbridge:\n${r.added.map(x => '  ' + x.edge).join('\n')}`);
});
test('SB-07 the route, its access, and the command row are all there', () => {
  const api = fs.readFileSync(path.join(REPO, 'idearium/api/index.js'), 'utf8');
  assert.ok(/\['api','system','drawbridge'\], 'system\.drawbridge'/.test(api));
  assert.ok(/'system\.drawbridge': CAPS\.READ_IDEAS/.test(api));
  assert.ok(/case 'system\.drawbridge':/.test(api));
  const rc = require('../../idearium/cli/route-commands.js');
  const rows = rc.SPEC || rc.ROWS || rc;
  const row = (Array.isArray(rows) ? rows : []).find(r => r.key === 'system.drawbridge');
  assert.ok(row, 'command row');
  assert.strictEqual(row.req({ args: [], flags: { new: true } }).path, '/api/system/drawbridge?new=1');
});
test('SB-09 a lazy _require(...) is a crossing too (idearium reaches other systems that way)', () => {
  put('beta/lazy.js', "const _require = require('module').createRequire(__filename); function f() { return _require('../alpha/own.js'); }\n");
  assert.ok(SB.scan({ root }).crossings.some(c => c.from === 'beta/lazy.js' && c.to === 'alpha/own.js'));
  fs.unlinkSync(path.join(root, 'beta/lazy.js'));
});
test('SB-10 homes: a lib/ file used only by one system belongs to it; hooks/<system>.hooks.js belongs to its system; a kernel file used by two does not', () => {
  put('lib/only-alpha.js', "module.exports = 3;\n");
  put('alpha/uses.js', "require('../lib/only-alpha.js'); require('../lib/atom.js');\n");
  put('beta/uses.js', "require('../lib/atom.js');\n");
  const h = SB.homes({ root });
  const of = (f) => (h.list.find(x => x.file === f) || {}).home || null;
  assert.strictEqual(of('lib/only-alpha.js'), 'alpha');
  assert.strictEqual(of('hooks/beta.hooks.js'), 'beta');
  assert.strictEqual(of('lib/atom.js'), null);
});
test('SB-08 the route is served: GET /api/system/drawbridge answers with the census and the ratchet', async () => {
  const keep = { log: console.log, warn: console.warn, info: console.info, error: console.error };
  console.log = console.warn = console.info = console.error = () => {};
  let g; try { const api = await import(path.join(REPO, 'idearium/api/index.js')); g = await api._route('GET', '/api/system/drawbridge'); var hm = await api._route('GET', '/api/system/homes?system=idearium'); } finally { Object.assign(console, keep); }
  const d = g.json.data || g.json;
  assert.strictEqual(g.status, 200, JSON.stringify(g.json).slice(0, 300));
  assert.ok(d.census.total > 0 && d.census.byKind.system > 0, JSON.stringify(d.census).slice(0, 200));
  assert.strictEqual(d.check.ok, true);
  const hd = hm.json.data || hm.json;
  assert.strictEqual(hm.status, 200); assert.ok(hd.moves > 0 && hd.list.every(x => x.home === 'idearium'), JSON.stringify(hd).slice(0, 200));
});

(async () => {
  for (const [n, f] of tests) { try { await f(); passed++; console.log(`  ✓ ${n}`); } catch (e) { failed++; console.log(`  ✗ ${n}\n    ${e.message}`); } }
  fs.rmSync(root, { recursive: true, force: true });
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
