'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}
async function testAsync(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

// §REAL, NOT MOCKED — this exercises the real write-through path
// (lib/cortex-write.js's buffer fallback, since no live cortex server runs
// in a test process) rather than mocking it away, because the fallback
// IS real, documented, production behavior for this module, not a test
// convenience — verifying it is the point. Buffer file cleaned up after.
// §0.39.282 — lib/cortex-write.js writes under NEXUS_DATA_ROOT (the test sandbox) now, not the real data/.
require('../../lib/test-sandbox.js').ensure();
const BUFFER_FILE = path.join(process.env.NEXUS_DATA_ROOT || path.join(__dirname, '../../data'), 'lattice/relationship_lattice.buffer.jsonl');
try { fs.unlinkSync(BUFFER_FILE); } catch (_) {}

const lattice = require('../../intelligence/lattice/associative-lattice.js');

(async () => {
  await testAsync('L-001', 'updateEdge returns a row matching the spec storage shape exactly', async () => {
    const row = await lattice.updateEdge('test-a', 'test-b', 'system:health:degraded', 0.6);
    assert.strictEqual(row.from, 'test-a');
    assert.strictEqual(row.to, 'test-b');
    assert.ok(row.field && typeof row.field.coherence === 'number');
    assert.ok(typeof row.sigma === 'number' && row.sigma >= 0 && row.sigma <= 1);
    assert.ok(typeof row.regime === 'string');
    assert.ok(typeof row.updated_at === 'number');
    assert.deepStrictEqual(row.fractal, { detected: false, period_ms: null, occurrences: 0 });
  });

  await testAsync('L-002', 'getEdge is a true read — matches the last write exactly, does not itself mutate state', async () => {
    const written = await lattice.updateEdge('test-c', 'test-d', 'system:health:degraded', 0.5);
    const read1 = lattice.getEdge('test-c', 'test-d');
    const read2 = lattice.getEdge('test-c', 'test-d'); // a second read must not change anything either
    assert.deepStrictEqual(read1.field, written.field);
    assert.deepStrictEqual(read2.field, written.field);
    assert.strictEqual(read1.regime, written.regime);
    assert.strictEqual(read1.sigma, written.sigma);
  });

  test('L-003', 'getEdge on a pair with no events yet returns null, not a default field', () => {
    assert.strictEqual(lattice.getEdge('test-never-touched-x', 'test-never-touched-y'), null);
  });

  await testAsync('L-004', 'repeated real events genuinely move the field — not a static/fabricated number', async () => {
    const row1 = await lattice.updateEdge('test-e', 'test-f', 'system:health:degraded', 0.8);
    const row2 = await lattice.updateEdge('test-e', 'test-f', 'system:health:degraded', 0.8);
    assert.notDeepStrictEqual(row1.field, row2.field, 'field should evolve across repeated events, not freeze');
  });

  await testAsync('L-005', 'directed pairs are kept separate — a->b is not the same edge as b->a', async () => {
    await lattice.updateEdge('test-g', 'test-h', 'system:health:degraded', 0.9);
    const forward = lattice.getEdge('test-g', 'test-h');
    const reverse = lattice.getEdge('test-h', 'test-g');
    assert.ok(forward !== null);
    assert.strictEqual(reverse, null, 'reverse direction should have no events of its own yet');
  });

  await testAsync('L-006', 'real write-through: the buffer file on disk actually contains what was written', async () => {
    await lattice.updateEdge('test-i', 'test-j', 'system:health:degraded', 0.4);
    const lines = fs.readFileSync(BUFFER_FILE, 'utf8').trim().split('\n');
    const rows = lines.map(l => JSON.parse(l));
    const found = rows.find(r => r.from === 'test-i' && r.to === 'test-j');
    assert.ok(found, 'the exact row updateEdge returned should be present in the real buffer file on disk');
  });

  await testAsync('L-007', 'updateEdge rejects missing from/to rather than writing a malformed row', async () => {
    await assert.rejects(() => lattice.updateEdge('', 'test-k'));
  });

  console.log(`\n  associative-lattice: ${passed} passed, ${failed} failed\n`);
  try { fs.unlinkSync(BUFFER_FILE); } catch (_) {} // test data, not real — cleaned up same as the manual verification pass was
  process.exitCode = failed > 0 ? 1 : 0;
})();
