'use strict';
// CA4 (docs/copilot-awareness-routing-phasemap.spec, CHUNK B) — "no is not an
// answer". When no tool AND no agent can fulfill a request, co-pilot files a
// capability-extension gap (routed toward module_builder/forge) instead of
// refusing. §8.6 files through the existing gaps engine; §1.2 loud, not a dead end.
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
const { extendCapability, shouldExtend } = require(path.join(ROOT, 'copilot/capability-extend'));

(async () => {
  await test('T-001', 'shouldExtend is FALSE when a tool succeeded (tool fulfilled it)', () => {
    assert.strictEqual(shouldExtend({ content: 'file text' }, { ok: false }), false);
  });

  await test('T-002', 'shouldExtend is FALSE when an agent answered (agent fulfilled it)', () => {
    assert.strictEqual(shouldExtend({ error: 'no tool' }, { ok: true, text: 'here you go' }), false);
  });

  await test('T-003', 'shouldExtend is TRUE only when BOTH tool and agent failed (the extend point)', () => {
    assert.strictEqual(shouldExtend({ error: 'no tool' }, { ok: false }), true);
    assert.strictEqual(shouldExtend(null, null), true);
  });

  await test('T-004', 'extendCapability returns a "not yet / tracked" message, NOT a bare refusal (§1.2)', async () => {
    const r = await extendCapability('integrate with a Notion database', { source: 'test' });
    assert.ok(/not yet|tracked|capability|build/i.test(r.message), 'must frame it as trackable work');
    assert.ok(!/^no\.?$|^i can'?t\.?$/i.test(r.message.trim()), 'must not be a bare refusal');
  });

  await test('T-005', 'the filed gap is a capability_extension routed toward module_builder (CA4→forge)', async () => {
    const r = await extendCapability('do quantum teleportation', { source: 'test' });
    assert.strictEqual(r.gap.kind, 'capability_extension');
    assert.strictEqual(r.gap.proposedPath, 'module_builder');
    assert.ok(r.gap.detail.includes('quantum'), 'the gap carries the original request');
  });

  await test('T-006', 'extendCapability is non-fatal when cortex is unreachable (still gives "not yet")', async () => {
    // in-sandbox cortex is down; the call must still resolve with a message.
    const r = await extendCapability('some unmet request', {});
    assert.ok(r.message && r.message.length > 0, 'must always return a user-facing message');
    assert.ok('filed' in r, 'must report whether it was filed');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
