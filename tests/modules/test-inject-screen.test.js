'use strict';
// IS-01..09 (0.60.74): every proposal passes one screen at the door, whoever makes it.
// James, 2026-10-16: "what about generating the tests first" — after an agent's lib/hat-seed.js proposal (-281 +20, did not parse) reached Apply.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
process.env.NEXUS_INJECT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'is-'));
const q = console.log; console.log = () => {};
const RI = require('../../lib/repo-inject.js');
console.log = q;
let passed = 0, failed = 0;
const test = (n, f) => { try { f(); console.log('  ok ' + n); passed++; } catch (e) { console.log('  FAIL ' + n + '\n    ' + String(e.message).split('\n')[0]); failed++; } };
const big = Array.from({ length: 290 }, (_, i) => `const v${i} = ${i};`).join('\n') + '\nmodule.exports = {};\n';
const layer = { files: { 'lib/big.js': big }, readFile(u, p) { return this.files[p] != null ? { content: this.files[p] } : { error: 'no' }; } };
const repo = { uuid: 'r1' }, hat = { name: 'the_builder', uuid: 'h1' };
// the real proposal James was shown (outer function never closed)
const unclosed = "'use strict';\nfunction seedHats(opts = {}) {\n  const a = 1;\n  return { a };\nfunction seedHats() {\n}\nmodule.exports = { seedHats };\n";
const quiet = f => { const l = console.log, w = console.warn; console.log = console.warn = () => {}; try { return f(); } finally { console.log = l; console.warn = w; } };

test('IS-01 an agent proposal that does not parse is refused at propose(), with the parse error', () => {
  const r = quiet(() => RI.propose({ layer, repo, hat, path: 'lib/x.js', content: unclosed }));
  assert.strictEqual(r.ok, false); assert.match(r.errors[0], /does not parse as js/); assert.strictEqual(r.screened, true);
});
test('IS-02 so is a person\'s (the screen is the door, not a rule about agents)', () => {
  assert.strictEqual(quiet(() => RI.propose({ layer, repo, path: 'lib/x.js', content: unclosed })).ok, false);
});
test('IS-03 an agent cutting a 290-line file to 29 lines is refused, naming both numbers', () => {
  const r = quiet(() => RI.propose({ layer, repo, hat, path: 'lib/big.js', content: Array.from({ length: 29 }, (_, i) => `const w${i} = 1;`).join('\n') + '\n' }));
  assert.strictEqual(r.ok, false); assert.match(r.errors[0], /from 29\d lines to 30/);
});
test('IS-04 a person may shrink the same file (it is a deliberate act)', () => {
  const r = quiet(() => RI.propose({ layer, repo, path: 'lib/big.js', content: Array.from({ length: 60 }, (_, i) => `const w${i} = 1;`).join('\n') + '\n' }));
  assert.strictEqual(r.ok, true);
});
test('IS-05 an agent edit that keeps most of the file is accepted', () => {
  const r = quiet(() => RI.propose({ layer, repo, hat, path: 'lib/big.js', content: big.replace('v1 = 1', 'v1 = 100') }));
  assert.strictEqual(r.ok, true);
});
test('IS-06 stacking: edit() of an agent proposal into broken code is refused, the proposal keeps its last good text', () => {
  const p = quiet(() => RI.propose({ layer, repo, hat, path: 'lib/y.js', content: 'const a = 1;\n' }));
  assert.strictEqual(p.ok, true);
  const e = quiet(() => RI.edit(p.inject.uuid, unclosed)); assert.strictEqual(e.ok, false);
  assert.strictEqual(RI.get(p.inject.uuid).content, 'const a = 1;\n');
});
test('IS-07 a person\'s editor save of unfinished code still works (edit is the person\'s notepad)', () => {
  const p = quiet(() => RI.propose({ layer, repo, path: 'lib/z.js', content: 'const a = 1;\n' }));
  assert.strictEqual(quiet(() => RI.edit(p.inject.uuid, 'const a = {')).ok, true);
});
test('IS-08 a new file, JSON and a non-checkable language pass; an empty file does not', () => {
  assert.strictEqual(quiet(() => RI.propose({ layer, repo, hat, path: 'a.json', content: '{"a":1}\n' })).ok, true);
  assert.strictEqual(quiet(() => RI.propose({ layer, repo, hat, path: 'a.md', content: '# hi\n' })).ok, true);
  assert.strictEqual(quiet(() => RI.propose({ layer, repo, hat, path: 'a.js', content: '' })).ok, false);
});
test('IS-09 the real proposal from the screenshot (the proposed lib/hat-seed.js) is refused', () => {
  const f = path.join(__dirname, 'fixtures', 'hat-seed-proposed-0.60.73.js');
  const content = fs.readFileSync(f, 'utf8');
  const r = quiet(() => RI.propose({ layer, repo, hat, path: 'lib/hat-seed.js', content }));
  assert.strictEqual(r.ok, false); assert.match(r.errors[0], /does not parse/);
});
console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
