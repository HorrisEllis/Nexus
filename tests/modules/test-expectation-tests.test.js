'use strict';
// EX-01..07 (0.60.119 TF1): a file's expectation test, written from the plan before the code, with no model.
// James, 2026-10-17: "the code it's outputting is terrible, and it needs to learn. ... Tests need to be first."
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const EXT = require('../../lib/expectation-tests.js');
let passed = 0, failed = 0; const tests = [];
const test = (n, f) => tests.push([n, f]);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ex-root-'));
fs.mkdirSync(path.join(root, 'lib'), { recursive: true });
fs.writeFileSync(path.join(root, 'lib', 'helper.js'), "module.exports = { twice: (x) => x * 2 };\n");
const plan = { order: ['lib/notes.js', 'tests/notes.test.js'], files: [
  { path: 'lib/notes.js', layer: 'engine', exports: [{ name: 'add', signature: 'add(text: string, opts?: object) -> object' }, { name: 'list', signature: 'list() -> string[]' }, { name: 'VERSION', signature: null }] },
  { path: 'tests/notes.test.js', layer: 'test', exports: [] }] };

test('EX-01 a planned JS file with exports gets an expectation; a test file and a file with no exports do not', async () => {
  const e = EXT.forFile(plan, 'lib/notes.js');
  assert.ok(e && /No model wrote it/.test(e.test));
  assert.deepStrictEqual(e.checks.map(c => [c.name, c.fn, c.maxArgs]), [['add', true, 2], ['list', true, 0], ['VERSION', false, null]]);
  assert.strictEqual(EXT.forFile(plan, 'tests/notes.test.js'), null);
  assert.strictEqual(EXT.forFile({ files: [{ path: 'a.md', exports: [{ name: 'x' }] }] }, 'a.md'), null);
});
test('EX-02 signatures: optional, defaulted, destructured and rest parameters are counted right', async () => {
  assert.deepStrictEqual(EXT._arity('f(a, b = 1, { c, d }, e?)'), { total: 4, required: 2 });
  assert.strictEqual(EXT._arity('g(...xs)').total, Infinity);
  assert.strictEqual(EXT._arity('no parens'), null);
});
test('EX-03 good code passes, run in a shadow with the proposal overlaid; the real tree is not touched', async () => {
  const code = "const h = require('./helper.js');\nfunction add(text, opts) { return { text, n: h.twice(1) }; }\nfunction list() { return []; }\nmodule.exports = { add, list, VERSION: '1' };\n";
  const r = await EXT.run({ root, plan, path: 'lib/notes.js', overlays: { 'lib/notes.js': code } });
  assert.ok(r.ran && r.ok, JSON.stringify(r));
  assert.ok(!fs.existsSync(path.join(root, 'lib', 'notes.js')) && !fs.existsSync(path.join(root, '.nexus-expect')), 'nothing written to the repo');
});
test('EX-04 the export under a function\'s name that is not a function fails, and says what the plan expected', async () => {
  const r = await EXT.run({ root, plan, path: 'lib/notes.js', overlays: { 'lib/notes.js': "module.exports = { add: 'add', list() { return []; }, VERSION: 1 };\n" } });
  assert.strictEqual(r.ok, false);
  assert.ok(r.failed.some(l => /add is a string, not a function/.test(l)), r.failed.join('\n'));
  assert.match(EXT.feedback(r, 'lib/notes.js'), /failed its expectation test/);
});
test('EX-05 a file that does not load (a missing require) fails at load, naming why — the regex check would pass it', async () => {
  const code = "const x = require('./does-not-exist.js');\nfunction add(t) { return x; }\nfunction list() { return []; }\nconst VERSION = 1;\nmodule.exports = { add, list, VERSION };\n";
  const r = await EXT.run({ root, plan, path: 'lib/notes.js', overlays: { 'lib/notes.js': code } });
  assert.strictEqual(r.ok, false);
  assert.ok(r.failed.some(l => /does not load: Cannot find module/.test(l)), r.failed.join('\n'));
  const PP = require('../../lib/phase-plan.js');
  assert.ok(PP.checkChunk(code, plan, 'lib/notes.js').ok, 'the old name check alone would have passed it');
});
test('EX-06 a function needing more arguments than its signature fails; a missing export fails', async () => {
  const r = await EXT.run({ root, plan, path: 'lib/notes.js', overlays: { 'lib/notes.js': "module.exports = { add(a, b, c) {}, VERSION: 1 };\n" } });
  assert.ok(r.failed.some(l => /add requires 3 arguments/.test(l)) && r.failed.some(l => /exports list — it is missing/.test(l)), r.failed.join('\n'));
});
test('EX-07 baseline: an existing file is checked as it is (seen failing first, or passing already)', async () => {
  fs.writeFileSync(path.join(root, 'lib', 'notes.js'), "module.exports = { add() {} };\n");
  const b = await EXT.baseline({ root, plan, path: 'lib/notes.js' });
  assert.ok(b.ran && !b.ok && /fails before the build/.test(b.seen));
  fs.unlinkSync(path.join(root, 'lib', 'notes.js'));
});
(async () => {
  for (const [n, f] of tests) { try { await f(); console.log('  ✓ ' + n); passed++; } catch (e) { console.log('  ✗ ' + n + '\n    ' + String(e.message).split('\n').slice(0, 3).join('\n    ')); failed++; } }
  console.log(`\n  ${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
