'use strict';

/**
 * tests/modules/mco19-clearglass-dispatch.test.js
 *
 * §MCO19 2026-09-13 — real tests for the ClearGlass-as-RAID-destination
 * dispatch decision and honest-degrade path. No real ClearGlass Electron
 * process runs in this environment — the "unreachable" tests below
 * exercise the REAL condition of this sandbox, not a simulated one:
 * _dispatchToClearGlass really does try a real HTTP call to 127.0.0.1:7702
 * and really does get connection-refused, exactly like a real deployment
 * with ClearGlass not running would. What's NOT tested here (stated,
 * not hidden): a live ClearGlass instance actually receiving and
 * acknowledging the dispatch — that needs a real Electron process, the
 * same limitation already stated for every other Electron-dependent
 * file this session (archaeology.js, preload/index.js).
 */

const assert = require('assert');
const intake = require('../../cortex/core/raid/contract-intake.js');

let pass = 0, fail = 0;
function test(name, fn) {
  return (async () => {
    try { await fn(); pass++; console.log(`  ✓ ${name}`); }
    catch (e) { fail++; console.log(`  ✗ ${name}\n    ${e.message}`); }
  })();
}

async function run() {
  await test('MCO19-001: real browser-driven providers are exactly the confirmed set — no local/API-only providers included', () => {
    assert.ok(intake.BROWSER_PROVIDERS.has('claude'));
    assert.ok(intake.BROWSER_PROVIDERS.has('chatgpt'));
    assert.ok(intake.BROWSER_PROVIDERS.has('gemini'));
    assert.ok(intake.BROWSER_PROVIDERS.has('perplexity'));
    assert.ok(intake.BROWSER_PROVIDERS.has('deepseek'));
    assert.ok(!intake.BROWSER_PROVIDERS.has('ollama'), 'ollama is local/API-only, must not route to a browser');
    assert.ok(!intake.BROWSER_PROVIDERS.has('mistral'), 'mistral is local/API-only, must not route to a browser');
  });

  await test('MCO19-002: dispatch to an unreachable ClearGlass fails honestly, does not throw', async () => {
    const result = await intake._dispatchToClearGlass(
      { uuid: 'test-uuid-1', content: 'test prompt', forAgent: 'claude' },
      'test-compartment-1'
    );
    assert.strictEqual(result.ok, false);
    assert.ok(result.reason.includes('unreachable'), `expected an honest unreachable reason, got: ${result.reason}`);
  });

  await test('MCO19-003: dispatch result never fabricates success when nothing acknowledged it', async () => {
    const result = await intake._dispatchToClearGlass(
      { uuid: 'test-uuid-2', content: 'another test', forAgent: 'chatgpt' },
      'test-compartment-2'
    );
    assert.notStrictEqual(result.ok, true, 'an unreachable ClearGlass must never be reported as a successful dispatch');
  });

  console.log(`\n  mco19-clearglass-dispatch: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
}

run();
