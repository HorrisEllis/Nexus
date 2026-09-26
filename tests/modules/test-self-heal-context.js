'use strict';
// tests/modules/test-self-heal-context.js — §CONTEXT-WIRE 2026-09-02
// Covers the new _formatFailureContext (pure, easy to test directly) and
// _gatherFailureContext's honest-degradation path (gapField unavailable ->
// no throw, no fabricated data, error surfaced in ctx.gatherError).

const assert = require('assert');
let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.log(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}

const selfHeal = require('../../cortex/self-heal/index.js');

(async () => {
  await test('CTX-001', '_formatFailureContext includes system/file/expected/detail even when mostly empty', () => {
    const out = selfHeal._formatFailureContext({
      gapType: 'timeout', gapUuid: 'g1', root: null, conditions: [],
      siblingDanglingHooks: [], file: null, dir: null, system: null,
      detail: null, expected: null,
    });
    assert.ok(out.includes('SYSTEM:'));
    assert.ok(out.includes('FILE/DIR:'));
    assert.ok(out.includes('SUPPOSED TO DO:'));
    assert.ok(out.includes('DOING INSTEAD:'));
    assert.ok(out.includes('EVENTS LEADING UP TO IT: none available'), 'must say plainly when no causal chain was traced, not omit the section');
  });

  await test('CTX-002', '_formatFailureContext renders real root/conditions and sibling dangling hooks when present', () => {
    const out = selfHeal._formatFailureContext({
      gapType: 'timeout', gapUuid: 'g1', root: { event: 'ledger.guardian.updated' },
      conditions: [{ event: 'nexus.resource.pressure' }], siblingDanglingHooks: [
        { hookId: 'guardian.foo.export', direction: 'out', detail: 'no listener' },
      ], file: 'guardian/server.js', dir: 'guardian', system: 'guardian',
      detail: 'HTTP timeout on /forge/health', expected: 'NCP channel server',
    });
    assert.ok(out.includes('guardian/server.js'));
    assert.ok(out.includes('ledger.guardian.updated'));
    assert.ok(out.includes('nexus.resource.pressure'));
    assert.ok(out.includes('guardian.foo.export'));
    assert.ok(out.includes('NCP channel server'));
  });

  await test('CTX-003', '_gatherFailureContext never throws even if gap-field/gap row is missing (honest degradation, §1.2)', async () => {
    const ctx = await selfHeal._gatherFailureContext('nonexistent_fault_class', 'nonexistent-gap-uuid-xyz');
    assert.strictEqual(ctx.gapType, 'nonexistent_fault_class');
    assert.strictEqual(ctx.gapUuid, 'nonexistent-gap-uuid-xyz');
    // no gap row found -> system/file/detail stay null, not fabricated
    assert.strictEqual(ctx.file, null);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
