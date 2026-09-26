'use strict';
// §nerve-gap-bridge (R8 part 1) — real gap reporting on genuine CFR field stress.
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; } }
const bridge = require(path.join(__dirname, '../..', 'lib/nerve-gap-bridge'));

function stubNerve() {
  let handler = null;
  return {
    onChange: (fn) => { handler = fn; return () => { handler = null; }; },
    fire: (snapshot) => handler && handler(snapshot),
  };
}
function stubGapField() {
  const reported = [];
  return { report: (g) => { reported.push(g); return { created: true }; }, _reported: reported };
}

(async () => {
  await test('T-001', 'a snapshot with real stresses reports a real gap', async () => {
    bridge._resetForTest();
    const nerve = stubNerve(); const gapField = stubGapField();
    bridge.wireNerveToGapField({ nerve, gapField });
    nerve.fire({ nodes: [{ system: 'guardian' }], stresses: [{ strength: 350, life: 1 }], ts: Date.now() });
    assert.strictEqual(gapField._reported.length, 1);
    assert.strictEqual(gapField._reported[0].type, 'nerve.field-stress');
  });

  await test('T-002', 'a snapshot with NO stresses reports nothing', async () => {
    bridge._resetForTest();
    const nerve = stubNerve(); const gapField = stubGapField();
    bridge.wireNerveToGapField({ nerve, gapField });
    nerve.fire({ nodes: [{ system: 'guardian' }], stresses: [], ts: Date.now() });
    assert.strictEqual(gapField._reported.length, 0);
  });

  await test('T-003', 'a second stressed snapshot within the rate-limit window does not double-report', async () => {
    bridge._resetForTest();
    const nerve = stubNerve(); const gapField = stubGapField();
    bridge.wireNerveToGapField({ nerve, gapField });
    nerve.fire({ nodes: [{ system: 'guardian' }], stresses: [{ strength: 300, life: 1 }], ts: Date.now() });
    nerve.fire({ nodes: [{ system: 'guardian' }], stresses: [{ strength: 500, life: 1 }], ts: Date.now() });
    assert.strictEqual(gapField._reported.length, 1, 'persistent stress should not spam a gap on every tick');
  });

  await test('T-004', 'severity scales with the real strongest stress strength', async () => {
    bridge._resetForTest();
    const nerve = stubNerve(); const gapField = stubGapField();
    bridge.wireNerveToGapField({ nerve, gapField });
    nerve.fire({ nodes: [{ system: 'x' }], stresses: [{ strength: 450, life: 1 }], ts: Date.now() });
    assert.strictEqual(gapField._reported[0].severity, 'high');
  });

  await test('T-005', 'systemsInvolved reflects the real, deduplicated node systems from the snapshot', async () => {
    bridge._resetForTest();
    const nerve = stubNerve(); const gapField = stubGapField();
    bridge.wireNerveToGapField({ nerve, gapField });
    nerve.fire({ nodes: [{ system: 'guardian' }, { system: 'guardian' }, { system: 'cortex' }], stresses: [{ strength: 300, life: 1 }], ts: Date.now() });
    assert.deepStrictEqual(gapField._reported[0].systemsInvolved, ['guardian', 'cortex']);
  });

  await test('T-006', 'a gap-field failure never breaks nerve\'s own callback (§1.2)', async () => {
    bridge._resetForTest();
    const nerve = stubNerve();
    const throwingGapField = { report: () => { throw new Error('simulated failure'); } };
    bridge.wireNerveToGapField({ nerve, gapField: throwingGapField });
    assert.doesNotThrow(() => nerve.fire({ nodes: [{ system: 'x' }], stresses: [{ strength: 300, life: 1 }], ts: Date.now() }));
  });

  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
