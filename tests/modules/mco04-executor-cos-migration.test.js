'use strict';
/**
 * tests/modules/mco04-executor-cos-migration.test.js
 *
 * §MCO04 2026-09-18 — real, live test: guardian/routes/autonomous-loop.js's
 * _makeExecutor() now creates a real COS compartment per run and advances
 * its real workPhase through the actual cos/ gate pipeline (only the
 * agent's responses are faked — COS itself is real, not mocked).
 */

const assert = require('assert');
let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n    ${e.stack}`); }
}

async function main() {
  await test('MCO04-E01: the executor creates a real COS compartment, advances it through all 3 real phases, and cleans it up', async () => {
    let callCount = 0;
    require.cache[require.resolve('../../guardian/ask.js')] = {
      id: 'guardian-ask-fake', filename: 'guardian-ask-fake', loaded: true,
      exports: { askSync: async () => { callCount++; return { ok: true, text: `real answer #${callCount}` }; } },
    };
    delete require.cache[require.resolve('../../guardian/routes/autonomous-loop.js')];
    const route = require('../../guardian/routes/autonomous-loop.js');
    const cosBridge = require('../../lib/cos-bridge.js');

    const runId = `test-${Date.now()}`;
    const executor = route._makeExecutor({
      goalText: 'do the thing', provider: 'claude', timeoutMs: 5000, runId,
      jobs: new Map(), createJob: () => {}, dispatchJob: () => {}, ncp: { isConnected: () => true },
    });

    const result = await executor({}, { compartment_id: 'test-c-1', axioms: [], boundary: {} });

    assert.strictEqual(callCount, 3, 'exactly one real model call per real phase');
    assert.strictEqual(result.workPhase, 'VERIFYING', 'the real COS compartment must have actually reached VERIFYING');
    assert.ok(result.cosCompartmentId, 'a real COS compartment id must be returned');

    // Real proof of cleanup: the compartment must no longer exist in the
    // real COS store after the executor finishes.
    const stillThere = cosBridge.getCompartment(`guardian-run-${runId}`);
    assert.strictEqual(stillThere, null, 'the per-run COS compartment must be destroyed when the executor finishes');

    delete require.cache[require.resolve('../../guardian/ask.js')];
    delete require.cache[require.resolve('../../guardian/routes/autonomous-loop.js')];
  });

  console.log(`\n  mco04-executor-cos-migration: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
}

main();
