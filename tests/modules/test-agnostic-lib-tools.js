'use strict';
// James: "make any of those lib tools if they can be used across systems." The
// generic capabilities (tree, line-addressing) promoted OUT of Gemini-specific
// modules into agnostic lib/ tools any system can use.
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
function test(id, desc, fn) { try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; } }
const ROOT = path.join(__dirname, '../..');
const tree = require(path.join(ROOT, 'lib/fs-tree'));
const le = require(path.join(ROOT, 'lib/line-edit'));

test('T-001', 'lib/fs-tree is agnostic — renders any dir tree', () => {
  const t = tree.tree('lib', { maxDepth: 1 });
  assert.ok(t.entries > 0 && t.text.includes('├──'));
});
test('T-002', 'lib/fs-tree refuses data/** (bare + nested)', () => {
  assert.throws(() => tree.tree('data'), /data/);
  assert.throws(() => tree.tree('data/cortex'), /data/);
});
test('T-003', 'lib/line-edit numberFile + readRange work standalone', () => {
  const n = le.numberFile('lib/version.js');
  assert.ok(n.lineCount > 0 && n.checksum);
  const r = le.readRange('lib/version.js', 1, 1);
  assert.strictEqual(r.startLine, 1);
});
test('T-004', 'lib/line-edit verifyEdit rejects a mis-anchor (§1.1)', () => {
  assert.strictEqual(le.verifyEdit({ file: 'lib/version.js', anchor: { startLine: 1, endLine: 1 }, expect: 'WRONG' }).ok, false);
});
test('T-005', 'lib/line-edit applyEdits is all-or-nothing (§2.1)', () => {
  const r = le.readRange('lib/version.js', 1, 1);
  const out = le.applyEdits('lib/version.js', [
    { file: 'lib/version.js', anchor: { startLine: 1, endLine: 1 }, expect: r.text, replacement: 'x' },
    { file: 'lib/version.js', anchor: { startLine: 2, endLine: 2 }, expect: 'WRONG', replacement: 'y' },
  ]);
  assert.strictEqual(out.ok, false, 'one bad edit aborts the set');
});
test('T-006', 'the Gemini toolbox re-exports the SAME line-edit (one source of truth §10.3)', () => {
  const gt = require(path.join(ROOT, 'lib/gemini-toolbox'));
  assert.strictEqual(gt.verifyEdit, le.verifyEdit, 'gemini-toolbox.verifyEdit IS lib/line-edit.verifyEdit');
});
console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
