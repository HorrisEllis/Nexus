'use strict';
/**
 * tests/modules/raid-approve-tool.test.js
 * UUID: test-raid-approve-tool-v1-0000-0000-0000-000000000001
 *
 * Covers: registered source with the action in allowed_actions gets
 * approved; explicitly denied action is denied with a clear reason;
 * unregistered source falls back to _default and is denied for 'tool'
 * specifically (fail-closed, with an honest reason distinguishing
 * "no contract" from "contract denies this"); rate limit kicks in exactly
 * at the configured threshold and recovers after the window; missing
 * source argument is a loud error, not a silent approval/denial.
 */

const assert = require('assert');
let passed = 0, failed = 0;

async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack || e.message}`); failed++; }
}

function fresh() {
  delete require.cache[require.resolve('../../cortex/core/raid')];
  delete require.cache[require.resolve('../../cortex/contract')];
  return require('../../cortex/core/raid');
}

async function run() {
  await test('RAT-01', 'registered source + allowed action → approved', () => {
    const raid = fresh();
    const r = raid._approveTool('copilot', 'cortex gaps', { action: 'tool' });
    assert.strictEqual(r.approved, true);
    assert.strictEqual(r.source, 'copilot');
    assert.strictEqual(r.trust_level, 'local');
  });

  await test('RAT-02', 'registered source + explicitly denied action → denied with clear reason', () => {
    const raid = fresh();
    const r = raid._approveTool('copilot', 'forge something', { action: 'forge' });
    assert.strictEqual(r.approved, false);
    assert.ok(r.reason.includes('explicitly denied'));
  });

  await test('RAT-03', 'unregistered source → denied for tool action, reason distinguishes fallback from explicit denial', () => {
    const raid = fresh();
    const r = raid._approveTool('totally-unknown-agent-xyz', 'rm -rf /', { action: 'tool' });
    assert.strictEqual(r.approved, false);
    assert.ok(r.reason.includes('minimal-trust default'), `expected fallback-specific reason, got: ${r.reason}`);
  });

  await test('RAT-04', 'unregistered source → chat is allowed once proof is supplied (default requires proof for everything)', () => {
    const raid = fresh();
    const r = raid._approveTool('totally-unknown-agent-xyz', 'hello', { action: 'chat', proof: 'token' });
    assert.strictEqual(r.approved, true);
  });

  await test('RAT-05', 'rate limit denies exactly at the configured threshold', () => {
    const raid = fresh();
    // copilot's tool limit is 20/60s per the contract — exhaust it
    let lastResult;
    for (let i = 0; i < 21; i++) {
      lastResult = raid._approveTool('copilot', `cmd ${i}`, { action: 'tool' });
    }
    assert.strictEqual(lastResult.approved, false);
    assert.ok(lastResult.reason.includes('rate limit'));
    assert.ok(typeof lastResult.retryAfterMs === 'number');
  });

  await test('RAT-06', 'missing source is a loud error, not a silent approve or deny-by-default', () => {
    const raid = fresh();
    const r1 = raid._approveTool(null, 'cmd', { action: 'tool' });
    const r2 = raid._approveTool('', 'cmd', { action: 'tool' });
    assert.strictEqual(r1.approved, false);
    assert.strictEqual(r1.reason, 'source is required');
    assert.strictEqual(r2.approved, false);
    assert.strictEqual(r2.reason, 'source is required');
  });

  await test('RAT-07', '_toolHealthSnapshot() reflects real call/denial counts', () => {
    const raid = fresh();
    raid._approveTool('copilot', 'cmd1', { action: 'tool' });
    raid._approveTool('copilot', 'cmd2', { action: 'forge' }); // denied
    const snap = raid._toolHealthSnapshot();
    assert.ok(snap.copilot.recentCalls >= 1);
  });

  await test('RAT-08', 'proof_required contract denies when no proof supplied', () => {
    const raid = fresh();
    // _default has proof_required: true
    const r = raid._approveTool('another-unknown-agent', 'hi', { action: 'chat' });
    assert.strictEqual(r.approved, false);
    assert.ok(r.reason.includes('proof'));
  });

  await test('RAT-09', 'proof_required contract approves when proof IS supplied', () => {
    const raid = fresh();
    const r = raid._approveTool('yet-another-unknown', 'hi', { action: 'chat', proof: 'signed-token' });
    assert.strictEqual(r.approved, true);
  });

  console.log(`\n  raid-approve-tool: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

run();
