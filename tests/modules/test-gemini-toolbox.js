'use strict';
// The Gemini coding toolbox — the shared line-addressing scheme so NEXUS and
// Gemini agree on where code goes. Parse files to numbered plain text; anchor
// fixes to exact lines; verify against reality before applying (§1.1); refuse
// data/**; all-or-nothing apply (§2.1).
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}
const ROOT = path.join(__dirname, '../..');
const gt = require(path.join(ROOT, 'lib/gemini-toolbox'));

test('T-001', 'numberFile produces a synchronized line gutter + checksum', () => {
  const n = gt.numberFile('lib/version.js');
  assert.ok(n.lineCount > 0 && n.checksum, 'must have line count + checksum');
  assert.ok(/^\s*1\| /.test(n.numbered), 'first line is numbered "1| "');
});

test('T-002', 'readRange returns the exact current text at a line range', () => {
  const r = gt.readRange('lib/version.js', 1, 1);
  assert.strictEqual(r.startLine, 1);
  assert.ok(typeof r.text === 'string');
});

test('T-003', 'parseForGemini carries the contract (framework/axioms Gemini operates under)', () => {
  const p = gt.parseForGemini('lib/version.js');
  assert.ok(p.contract && p.contract.axioms.length >= 3, 'contract with axioms');
  assert.ok(p.contract.framework.includes('AXIOMS'), 'framework named');
});

test('T-004', 'large files chunk with GLOBAL line offsets preserved (anchors mean the same thing)', () => {
  const p = gt.parseForGemini('lib/version.js', { maxLinesPerChunk: 100 });
  if (p.chunks) {
    assert.ok(p.chunks.length >= 2, 'chunked');
    assert.strictEqual(p.chunks[1].startLine, 101, 'chunk 2 starts at global line 101');
    assert.ok(/^\s*101\| /.test(p.chunks[1].numbered), 'chunk 2 first line numbered 101, not 1');
  }
});

test('T-005', 'a correctly-anchored edit VERIFIES against the current file', () => {
  const r = gt.readRange('lib/version.js', 1, 1);
  const v = gt.verifyEdit({ file: 'lib/version.js', anchor: { startLine: 1, endLine: 1 }, expect: r.text, replacement: '// x' });
  assert.strictEqual(v.ok, true, 'matching expect must verify');
});

test('T-006', 'a MIS-anchored edit is REJECTED (§1.1 — never apply a guess)', () => {
  const v = gt.verifyEdit({ file: 'lib/version.js', anchor: { startLine: 1, endLine: 1 }, expect: 'not the real text', replacement: 'x' });
  assert.strictEqual(v.ok, false, 'wrong expect must be rejected');
  assert.ok(/mismatch/.test(v.reason));
});

test('T-007', 'applyEdits applies verified edits in memory (not to disk — RAID applies)', () => {
  const r = gt.readRange('lib/version.js', 1, 1);
  const out = gt.applyEdits('lib/version.js', [{ file: 'lib/version.js', anchor: { startLine: 1, endLine: 1 }, expect: r.text, replacement: 'CHANGED' }]);
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.content.split('\n')[0], 'CHANGED');
});

test('T-008', 'all-or-nothing: one bad edit aborts the whole set (§2.1 no half-applied file)', () => {
  const r = gt.readRange('lib/version.js', 1, 1);
  const out = gt.applyEdits('lib/version.js', [
    { file: 'lib/version.js', anchor: { startLine: 1, endLine: 1 }, expect: r.text, replacement: 'x' },
    { file: 'lib/version.js', anchor: { startLine: 2, endLine: 2 }, expect: 'WRONG', replacement: 'y' },
  ]);
  assert.strictEqual(out.ok, false, 'a bad edit must abort the set');
});

test('T-009', 'data/** is refused — state, not code (§contract)', () => {
  assert.throws(() => gt.numberFile('data/cortex/memory/gaps.json'), /data/, 'must refuse data/**');
});

test('T-010', 'path escaping the repo root is refused', () => {
  assert.throws(() => gt.numberFile('../../../etc/passwd'), /escapes/, 'must refuse path traversal');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
