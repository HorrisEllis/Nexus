'use strict';
// Real, adversarial test for clear-glass/src/mesh/agent-mesh.js's
// route(). James: "find every problem you can... hostile attacked and
// verified." Found by direct, hostile construction, not inspection
// alone: a real agent state that exists, isn't in error, but has
// health < 50 matched neither of route()'s two branches — not "healthy,
// use it," and not "spawn fresh" (which only ever checked !state, never
// low health). send() and spawn() were both confirmed never called;
// route() threw "All agents unavailable" with a real, just-unhealthy
// agent sitting right there the whole time.

const assert = require('assert');
const AgentMesh = require('../../clear-glass/src/mesh/agent-mesh.js');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

function makeMesh() {
  return new AgentMesh({
    ctxMgr: { create: () => ({ id: 'ctx1' }) }, driver: {}, sse: { emit: () => {} },
    seam: {}, vault: {}, accounts: {}, rewind: {},
  });
}

(async () => {

await test('AM-HOSTILE-001', 'a real, existing, non-error agent state with health < 50 gets a fresh spawn attempt, not silently skipped', async () => {
  const mesh = makeMesh();
  mesh.agents.set('claude:acc1', { key: 'claude', accountId: 'acc1', health: 20, status: 'ok', contextId: 'ctx1' });
  let spawnCalled = false, sendCalled = false;
  mesh.spawn = async () => { spawnCalled = true; return { contextId: 'new-ctx' }; };
  mesh.send = async (args) => { sendCalled = true; assert.strictEqual(args.contextId, 'new-ctx', 'must use the freshly spawned context, not the unhealthy old one'); return { text: 'ok' }; };
  const result = await mesh.route({ prompt: 'hi', fallbackOrder: ['claude'] });
  assert.strictEqual(spawnCalled, true, 'spawn() must be called for a real, low-health agent');
  assert.strictEqual(sendCalled, true, 'send() must be called with the freshly spawned context');
  assert.strictEqual(result.text, 'ok');
});

await test('AM-HOSTILE-002', 'a genuinely healthy agent (health >= 50) is still used directly, no unnecessary respawn — the fix does not break the working case', async () => {
  const mesh = makeMesh();
  mesh.agents.set('claude:acc1', { key: 'claude', accountId: 'acc1', health: 80, status: 'ok', contextId: 'ctx1' });
  let spawnCalled = false;
  mesh.spawn = async () => { spawnCalled = true; return { contextId: 'new' }; };
  mesh.send = async (args) => { assert.strictEqual(args.contextId, 'ctx1', 'a healthy agent must use its own existing context'); return { text: 'ok' }; };
  await mesh.route({ prompt: 'hi', fallbackOrder: ['claude'] });
  assert.strictEqual(spawnCalled, false, 'a genuinely healthy agent must not trigger an unnecessary respawn');
});

await test('AM-HOSTILE-003', 'an agent whose only state is in error status still gets a fresh spawn attempt (the already-correct path, re-verified)', async () => {
  const mesh = makeMesh();
  mesh.agents.set('claude:acc1', { key: 'claude', accountId: 'acc1', health: 100, status: 'error', contextId: 'ctx1' });
  let spawnCalled = false;
  mesh.spawn = async () => { spawnCalled = true; return { contextId: 'new' }; };
  mesh.send = async () => ({ text: 'ok' });
  await mesh.route({ prompt: 'hi', fallbackOrder: ['claude'] });
  assert.strictEqual(spawnCalled, true, 'an errored agent state must still get a fresh spawn attempt');
});

await test('AM-HOSTILE-004', 'a low-health agent whose respawn also fails correctly falls through to the next agent in order, not a silent dead end', async () => {
  const mesh = makeMesh();
  mesh.agents.set('claude:acc1', { key: 'claude', accountId: 'acc1', health: 10, status: 'ok', contextId: 'ctx1' });
  mesh.spawn = async (key) => { if (key === 'claude') throw new Error('spawn failed'); return { contextId: 'new' }; };
  mesh.send = async (args) => { assert.strictEqual(args.agentKey, 'chatgpt'); return { text: 'fallback ok' }; };
  const result = await mesh.route({ prompt: 'hi', fallbackOrder: ['claude', 'chatgpt'] });
  assert.strictEqual(result.text, 'fallback ok');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
})();
