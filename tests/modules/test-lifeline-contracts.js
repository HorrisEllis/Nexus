'use strict';
// §lifeline-contracts — per-intent response validation, real gap-field reporting on violation.
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; } }
const lc = require(path.join(__dirname, '../..', 'copilot/lib/lifeline-contracts'));
const gapField = require(path.join(__dirname, '../..', 'lib/gap-field'));

(async () => {
  await test('T-001', 'an "ask" intent accepts any non-empty prose', async () => {
    const r = lc.validateResponse('ask', 'Paris is the capital of France.');
    assert.strictEqual(r.valid, true);
  });

  await test('T-002', 'an "ask" intent rejects an empty response', async () => {
    const r = lc.validateResponse('ask', '');
    assert.strictEqual(r.valid, false);
    assert.strictEqual(r.reason, 'empty response');
  });

  await test('T-003', 'a "build" intent requires actual code-shaped content, not just prose', async () => {
    const bad = lc.validateResponse('build', 'I think that sounds like a good idea overall.');
    assert.strictEqual(bad.valid, false);
    const good = lc.validateResponse('build', 'function add(a, b) { return a + b; }');
    assert.strictEqual(good.valid, true);
  });

  await test('T-004', 'a "yes_no" intent requires an actual yes/no signal', async () => {
    const bad = lc.validateResponse('yes_no', 'That is an interesting question to consider.');
    assert.strictEqual(bad.valid, false);
    const good = lc.validateResponse('yes_no', 'Yes, that should work fine.');
    assert.strictEqual(good.valid, true);
  });

  await test('T-005', 'a "json" intent validates real JSON structure, not just curly braces in prose', async () => {
    const bad = lc.validateResponse('json', 'The config looks like { something broken');
    assert.strictEqual(bad.valid, false);
    const good = lc.validateResponse('json', '{"key": "value", "n": 1}');
    assert.strictEqual(good.valid, true);
  });

  await test('T-006', 'an unrecognized intent falls back to the loosest check, not automatic failure', async () => {
    const r = lc.getContract('totally-made-up-intent-xyz');
    assert.ok(r.expects.includes('unrecognized'));
    const validated = lc.validateResponse('totally-made-up-intent-xyz', 'some real text here');
    assert.strictEqual(validated.valid, true, 'an unknown intent with real content must not be auto-rejected');
  });

  await test('T-007', 'a contract violation reports a REAL gap via gap-field, not just a return value', async () => {
    const before = gapField.openGaps({ domain: 'system' }).filter(g => g.type === 'lifeline.contract-violation').length;
    lc.validateResponse('json', 'definitely not json at all', { provider: 'test-provider-' + Date.now(), requestId: 'test-req' });
    const after = gapField.openGaps({ domain: 'system' }).filter(g => g.type === 'lifeline.contract-violation');
    assert.ok(after.length > before, 'a contract violation must produce a real, findable gap');
  });

  await test('T-008', 'every real intent used elsewhere in copilot has an actual contract, not silently falling to the loose default', async () => {
    const realIntents = ['ask', 'build', 'action', 'navigate', 'note', 'diagnose', 'status', 'general', 'greeting', 'lookup'];
    for (const intent of realIntents) {
      assert.ok(lc.CONTRACTS[intent], `intent "${intent}" (used elsewhere in copilot's real code) has no explicit contract`);
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
