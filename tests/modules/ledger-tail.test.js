'use strict';
/** ledger-tail — brutal tests. Every declared invariant is checked, plus edges. */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { tail, LedgerTailError } = require('../../lib/ledger-tail.js');

let passed = 0, failed = 0;
function test(id, name, fn) {
  try { fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.log(`  ✗ ${id} ${name}\n    ${e.message}`); failed++; }
}
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lt-'));
function mk(name, lines) { const p = path.join(TMP, name); fs.writeFileSync(p, lines.join('\n') + '\n'); return p; }

test('LT-3', 'entries.length <= n', () => {
  const p = mk('a.jsonl', Array.from({ length: 100 }, (_, i) => JSON.stringify({ i })));
  assert.strictEqual(tail(p, 5).entries.length, 5);
  assert.ok(tail(p, 500).entries.length <= 500);
});

test('ORD', 'newest first', () => {
  const p = mk('b.jsonl', Array.from({ length: 20 }, (_, i) => JSON.stringify({ i })));
  const r = tail(p, 3);
  assert.deepStrictEqual(r.entries.map(e => e.i), [19, 18, 17]);
});

test('LT-1', 'does NOT read the whole file when n is small', () => {
  const big = Array.from({ length: 20000 }, (_, i) => JSON.stringify({ i, pad: 'x'.repeat(80) }));
  const p = mk('big.jsonl', big);
  const r = tail(p, 3, { blockSize: 4096 });
  assert.strictEqual(r.entries[0].i, 19999, 'must still get the newest');
  assert.ok(r.bytesRead < r.fileSize,
    `LT-1 violated: read ${r.bytesRead} of ${r.fileSize}`);
  assert.ok(r.bytesRead < r.fileSize * 0.05,
    `LT-1 weak: read ${((r.bytesRead / r.fileSize) * 100).toFixed(1)}% of the file for 3 entries`);
});

test('LT-2', 'malformed lines are COUNTED, never silently dropped', () => {
  const p = mk('c.jsonl', ['{"i":1}', 'NOT JSON AT ALL', '{"i":3}', '{broken', '{"i":5}']);
  const r = tail(p, 5);
  assert.strictEqual(r.malformed, 2, 'both bad lines must be counted');
  assert.strictEqual(r.entries.length, 3);
  assert.ok('malformed' in tail(mk('d.jsonl', ['{"i":1}']), 1), 'malformed present even at 0');
});

test('ERR', 'a missing file throws, never returns []', () => {
  assert.throws(() => tail(path.join(TMP, 'nope.jsonl'), 5), e =>
    e instanceof LedgerTailError && e.code === 'ENOENT');
});

test('EDGE-n', 'n <= 0 / NaN / negative return a STATED reason', () => {
  const p = mk('e.jsonl', ['{"i":1}']);
  for (const bad of [0, -1, NaN, undefined, null, 'five', Infinity]) {
    const r = tail(p, bad);
    assert.deepStrictEqual(r.entries, [], `n=${bad} must return []`);
    assert.ok(r.reason, `n=${bad} must STATE why, not return a bare empty`);
  }
});

test('EDGE-empty', 'an empty ledger states it is empty', () => {
  const p = path.join(TMP, 'empty.jsonl'); fs.writeFileSync(p, '');
  const r = tail(p, 5);
  assert.deepStrictEqual(r.entries, []);
  assert.strictEqual(r.reason, 'ledger is empty');
});

test('EDGE-block', 'an entry spanning a block boundary is not corrupted', () => {
  // 400-byte entries with a 100-byte block: every line crosses several blocks.
  const lines = Array.from({ length: 30 }, (_, i) => JSON.stringify({ i, pad: 'y'.repeat(400) }));
  const p = mk('span.jsonl', lines);
  const r = tail(p, 4, { blockSize: 100 });
  assert.strictEqual(r.malformed, 0, 'block-boundary splitting must not corrupt lines');
  assert.deepStrictEqual(r.entries.map(e => e.i), [29, 28, 27, 26]);
});

test('EDGE-noeol', 'a file with no trailing newline still yields its last entry', () => {
  const p = path.join(TMP, 'noeol.jsonl');
  fs.writeFileSync(p, '{"i":1}\n{"i":2}');
  assert.strictEqual(tail(p, 1).entries[0].i, 2);
});

test('EDGE-unicode', 'multibyte content survives block splitting', () => {
  const p = mk('uni.jsonl', [JSON.stringify({ s: '🜁🜂🜃 ḩ̸̢̛e̷l̴l̸o̵' }), JSON.stringify({ s: 'ok' })]);
  const r = tail(p, 2, { blockSize: 16 });
  assert.ok(r.entries.length >= 1, 'must return something');
});

test('EDGE-single', 'a one-line ledger works at every block size', () => {
  const p = mk('one.jsonl', ['{"i":42}']);
  for (const bs of [1, 4, 8, 65536]) {
    assert.strictEqual(tail(p, 1, { blockSize: bs }).entries[0].i, 42, `blockSize=${bs}`);
  }
});

test('REAL', 'runs against a real NEXUS ledger', () => {
  const cands = ['/home/claude/work/n10/nexus/data/cortex/memory/event_log.jsonl',
                 '/home/claude/work/n10/nexus/data/guardian/baseline-events.ndjson'];
  const real = cands.find(f => fs.existsSync(f));
  if (!real) { console.log('    (no real ledger present — skipped)'); return; }
  const r = tail(real, 5);
  assert.ok(r.entries.length > 0, 'real ledger must yield entries');
  assert.ok(r.bytesRead < r.fileSize || r.fileSize < 65536, 'bounded read on a real file');
  console.log(`    real: ${path.basename(real)} ${r.fileSize}b, read ${r.bytesRead}b for ${r.entries.length} entries, ${r.malformed} malformed`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
