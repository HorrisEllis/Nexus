'use strict';
// Real, isolated test for chunk dependency gating. James: "each chunk
// would be one component and dependencies... idea pipeline needs to be
// able to build any codebase like nexus using guardian." Real gap
// found before building: zero dependency tracking existed between
// chunks anywhere in spec-engine. Reused RAID's own, already-real
// dependsOn convention (cortex/core/raid/contract-intake.js) rather
// than inventing a second one.
//
// §ISOLATED — same real IDEARIUM_DATA_DIR/JAA_DATA_DIR convention this
// session already established.
const fs = require('fs');
const os = require('os');
const path = require('path');
const _isolatedData = fs.mkdtempSync(path.join(os.tmpdir(), 'idearium-chunk-deps-'));
const _isolatedJaa = fs.mkdtempSync(path.join(os.tmpdir(), 'idearium-chunk-deps-jaa-'));
process.env.IDEARIUM_DATA_DIR = _isolatedData;
process.env.JAA_DATA_DIR = _isolatedJaa;
process.on('exit', () => {
  try { fs.rmSync(_isolatedData, { recursive: true, force: true }); } catch (_) {}
  try { fs.rmSync(_isolatedJaa, { recursive: true, force: true }); } catch (_) {}
});

const assert = require('assert');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}

async function main() {
  const se = await import('../../idearium/spec-engine/index.js');

  test('T-001', 'a chunk with a real dependsOn is genuinely blocked from being the next pending chunk until its dependency completes', () => {
    const m = se.createSpec({ name: 'dep-test-1', type: 'component', dependsOn: { purpose: ['meta'] } });
    const first = se.nextPendingChunk(m.uuid);
    assert.strictEqual(first.sectionId, 'meta', 'meta has no real dependency and must be dispatched first');
    se.completeChunk(m.uuid, m.chunks.find(c => c.sectionId === 'meta').uuid, 'real content');
    const second = se.nextPendingChunk(m.uuid);
    assert.strictEqual(second.sectionId, 'purpose', 'purpose\'s real dependency (meta) is now complete — it must be the next real chunk');
  });

  test('T-002', 'a spec with no real dependsOn behaves exactly as before — purely additive, changes nothing for the default case', () => {
    const m = se.createSpec({ name: 'dep-test-2', type: 'component' });
    const first = se.nextPendingChunk(m.uuid);
    assert.strictEqual(first.sectionId, m.chunks[0].sectionId, 'with no real dependsOn set anywhere, chunk order must be unchanged from before this feature existed');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

main();
