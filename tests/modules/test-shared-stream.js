'use strict';
// P7 — shared stream digest (docs/copilot-omniscience-phasemap.spec). The
// continuous-stream normalizer moved from copilot/ to lib/ so EVERY system reads
// the same digest from one source — "expanded to all systems". copilot/ now
// re-exports it (§10.3 — one stream, many readers, not N copies).
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');

test('T-001', 'lib/stream-digest.js is the shared home (normalizeEvent, normalizeStream, StreamDigest)', () => {
  const lib = require(path.join(ROOT, 'lib/stream-digest'));
  for (const x of ['normalizeEvent', 'normalizeStream', 'StreamDigest']) {
    assert.ok(lib[x], `lib/stream-digest must export ${x}`);
  }
});

test('T-002', 'copilot/stream-digest re-exports lib — ONE source, not a copy', () => {
  const lib = require(path.join(ROOT, 'lib/stream-digest'));
  const cp = require(path.join(ROOT, 'copilot/stream-digest'));
  assert.strictEqual(cp.normalizeStream, lib.normalizeStream, 'copilot must re-export the SAME function object, not a duplicate');
  assert.strictEqual(cp.StreamDigest, lib.StreamDigest);
});

test('T-003', 'the shared normalizer produces readable text from real events (any system can use it)', () => {
  const { normalizeStream } = require(path.join(ROOT, 'lib/stream-digest'));
  const digest = normalizeStream([
    { type: 'cortex.gap.found', system: 'cortex', payload: {}, ts: Date.now() - 2000 },
    { type: 'guardian.job.complete', system: 'guardian', payload: {}, ts: Date.now() },
  ], 30);
  assert.ok(digest && /guardian/i.test(digest), 'must render real events readably');
});

test('T-004', 'the copilot re-export is a thin shim (no duplicated normalizer logic)', () => {
  const src = require('fs').readFileSync(path.join(ROOT, 'copilot/stream-digest.js'), 'utf8');
  assert.ok(/require\('\.\.\/lib\/stream-digest'\)/.test(src), 'copilot must require the lib version');
  assert.ok(!/function normalizeEvent/.test(src), 'copilot must NOT redefine the normalizer (no copy)');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
