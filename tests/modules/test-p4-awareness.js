'use strict';
// §P4 completion — co-pilot answers NEXUS-state questions from REAL state.
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; } }
const na = require(path.join(__dirname, '../..', 'copilot/lib/nexus-awareness'));

(async () => {
  await test('T-001', 'systemRundown reports real capabilities + versions + self-model', () => {
    na._clearCache();
    const r = na.systemRundown();
    assert.ok(r.capabilities.total > 50, 'real capability count');
    assert.ok(Object.keys(r.versions).length > 5, 'real versions');
    assert.ok(r.text.includes('NEXUS rundown'));
  });
  await test('T-002', '"what is wrong" routes to the diagnostic kernel', async () => {
    const r = await na.answerAbout('what is wrong with nexus');
    assert.ok(r, 'answered'); assert.ok('withTracedConditions' in r || 'error' in r, 'used diagnoseDeep');
  });
  await test('T-003', '"system rundown" routes to real state', async () => {
    const r = await na.answerAbout('give me a system rundown');
    assert.ok(r && r.text.includes('NEXUS'));
  });
  await test('T-004', 'a non-NEXUS question falls through (returns null)', async () => {
    const r = await na.answerAbout('write me a haiku about the sea');
    assert.strictEqual(r, null, 'must not hijack normal prompts');
  });
  await test('T-005', 'versions question lists real per-system versions', async () => {
    const r = await na.answerAbout('what versions are running');
    assert.ok(r && /\d+\.\d+/.test(r.text), 'has version numbers');
  });
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
