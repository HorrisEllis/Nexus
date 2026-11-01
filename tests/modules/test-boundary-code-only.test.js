'use strict';
/**
 * tests/modules/test-boundary-code-only.test.js — genesis's sovereignty check reads code, not text (EAS1a, 2026-10-31).
 * Map: docs/2026-10-31-emerge-as-a-system-phasemap.spec · Spec: docs/emerge-system.spec MOD-EAS-BOUNDARY-TEXT
 *
 * Found laying Emerge out as a system: emerge-codegen-v2.js writes "require('../siso')" into the files it generates, and
 * cos/archetype/nexus-system/lib/boundary.js reported it as Emerge leaving its folder.
 *
 *   BC-01  a require inside template text is not code; a require in ${...} is
 *   BC-02  comments, strings with escapes, and regex literals (with quotes and backticks in them) do not confuse it
 *   BC-03  blanking keeps every offset and newline
 *   BC-04  anything unterminated → null, so outside() scans the raw source and nothing is hidden
 *   BC-05  outside(): a generator's text is not reported; a real require leaving the folder still is
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { codeOnly, outside } = require('../../cos/archetype/nexus-system/lib/boundary.js');

let passed = 0, failed = 0;
function test(id, desc, fn) { try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; } }
const reqs = (src) => [...(codeOnly(src) ?? src).matchAll(/require\(\s*'([^']+)'\s*\)/g)].map(m => m[1]);

console.log('\ntest-boundary-code-only — the sovereignty check reads code, not text');

test('BC-01', 'template text is not code; ${...} is', () => {
  assert.deepStrictEqual(reqs("out.push(`const x = require('../siso');`);"), []);
  assert.deepStrictEqual(reqs("const s = `${require('../y')}`;"), ['../y']);
  assert.deepStrictEqual(reqs("const t = `a ${b ? `x${require('../n')}` : ''} c`; require('../m');"), ['../n', '../m']);
  assert.deepStrictEqual(reqs("const o = `${ {a: 1}.a }`; require('../after');"), ['../after']);
});

test('BC-02', 'comments, escaped strings and regex literals', () => {
  assert.deepStrictEqual(reqs("// require('../c')\nconst z = 1;"), []);
  assert.deepStrictEqual(reqs("/* require('../c') */ const q = require('./ok');"), ['./ok']);
  assert.deepStrictEqual(reqs("const re = /`/; const w = require('../w');"), ['../w']);
  assert.deepStrictEqual(reqs("const re = /['\"]x/g; const v = require('../v');"), ['../v']);
  assert.deepStrictEqual(reqs("x = 'it\\'s `'; require('../e');"), ['../e']);
  assert.deepStrictEqual(reqs("const r = a / b / c; require('../div');"), ['../div']);
  assert.deepStrictEqual(reqs("function f() { return /`/.test(s); }\nrequire('../ret');"), ['../ret']);
});

test('BC-03', 'offsets and newlines are kept', () => {
  const src = "a`x\ny`b // c\nd";
  const c = codeOnly(src);
  assert.strictEqual(c.length, src.length);
  assert.strictEqual(c.split('\n').length, src.split('\n').length);
  assert.strictEqual(c[0], 'a'); assert.strictEqual(c[src.indexOf('b')], 'b');
});

test('BC-04', 'unterminated → null (scanned raw)', () => {
  for (const src of ['const u = `never ends', '/* open', "const s = 'open\n", 'x = `${ a ']) assert.strictEqual(codeOnly(src), null, JSON.stringify(src));
  assert.deepStrictEqual(reqs("require('../raw'); const u = `open"), ['../raw']);
});

test('BC-05', 'outside(): generated text not reported, a real crossing is', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'boundary-'));
  try {
    fs.writeFileSync(path.join(root, 'gen.js'), "const out = [];\nout.push(`const s = require('../siso');`);\nmodule.exports = out;\n");
    fs.writeFileSync(path.join(root, 'in.js'), "const g = require('./gen.js');\n");
    assert.deepStrictEqual(outside(root), []);
    fs.writeFileSync(path.join(root, 'leak.js'), "const x = require('../elsewhere/x.js');\n");
    assert.deepStrictEqual(outside(root), [{ file: 'leak.js', requires: '../elsewhere/x.js' }]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
