'use strict';
// §P5 — the dynamic grammar engine wired into co-pilot. Natural language resolves
// to real capabilities via the registry trie; low-confidence falls through.
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; } }
const ROOT = path.join(__dirname, '../..');

function withMockEngine(mock) {
  const p = require.resolve(path.join(ROOT, 'lib/grammar-engine'));
  require.cache[p] = { id: p, exports: mock, loaded: true };
  const gp = require.resolve(path.join(ROOT, 'copilot/lib/grammar-router'));
  delete require.cache[gp];
  return require(path.join(ROOT, 'copilot/lib/grammar-router'));
}

(async () => {
  await test('T-001', 'high-confidence match resolves to the real capability', async () => {
    const gr = withMockEngine({ _ready: true, resolve: () => ({ componentId: 'cortex.health', confidence: 0.95, matched: 'cortex health', params: [] }) });
    const r = await gr.route('cortex health', { confidenceFloor: 0.6 });
    assert.ok(r && r.routed, 'routed'); assert.strictEqual(r.componentId, 'cortex.health');
  });
  await test('T-002', 'low-confidence match falls through (does NOT mis-fire)', async () => {
    const gr = withMockEngine({ _ready: true, resolve: () => ({ componentId: 'x.y', confidence: 0.4, matched: 'x', params: [] }) });
    const r = await gr.route('something vague', { confidenceFloor: 0.6 });
    assert.ok(!r || !r.routed, 'must not route below the floor');
  });
  await test('T-003', 'no match returns null (falls through to LLM)', async () => {
    const gr = withMockEngine({ _ready: true, resolve: () => null });
    const r = await gr.route('write me a poem', {});
    assert.strictEqual(r, null);
  });
  await test('T-004', 'engine not ready and unreachable → null, never hangs', async () => {
    const gr = withMockEngine({ _ready: false, resolve: () => null, load: async () => { throw new Error('registry down'); } });
    const r = await gr.route('cortex health', {});
    assert.strictEqual(r, null, 'unreachable registry falls through, not hang');
  });
  await test('T-005', 'describeGrammar reports the engine state', async () => {
    const gr = withMockEngine({ _ready: true, resolve: () => null, status: () => ({ trie: 'built' }), getAliases: () => ({ diag: 'x', gaps: 'y' }) });
    const d = gr.describeGrammar();
    assert.ok(d.ready); assert.strictEqual(d.aliases, 2);
  });
  await test('T-006', 'a throwing engine never throws to the caller (§1.2)', async () => {
    const gr = withMockEngine({ _ready: true, resolve: () => { throw new Error('boom'); } });
    let r; await assert.doesNotReject(async () => { r = await gr.route('x', {}); });
    assert.strictEqual(r, null);
  });
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
