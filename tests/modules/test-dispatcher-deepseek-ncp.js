'use strict';
// Real test for dispatcher.js's deepseek branch. James: "deepseek as a ncp
// provider." Before this fix, job.provider === 'deepseek' unconditionally
// routed to ollama-bridge, even with a real, connected chat.deepseek.com
// NCP tab — the generic NCP dispatch path below it could never be reached.

const assert = require('assert');
const { createDispatcher } = require('../../guardian/lib/dispatcher.js');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}

// §UPDATED 2026-09-13 — real bus needs on()/off() now too, see
// tests/dispatcher-stale-socket.test.js's header for the full trace
// (guardian/lib/dispatcher.js's new real ping/pong gate).
function makeDeps({ deepseekConnected }) {
  const updates = [];
  let deepseekCalled = false, ncpPushed = false;
  const listeners = new Map();
  const bus = {
    emit: (name, payload) => { for (const fn of listeners.get(name) || []) fn({ data: payload }); },
    on: (name, fn) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
    off: (name, fn) => { listeners.get(name)?.delete(fn); },
  };
  return {
    deps: {
      updateJob: (id, patch) => updates.push({ id, patch }),
      bus,
      ncp: {
        isConnected: (p) => p === 'deepseek' ? deepseekConnected : false,
        push: () => { ncpPushed = true; return 1; },
        // dispatcher.js's job-send path now calls pushActive() (single-
        // target, see guardian/lib/ncp.js's 2026-09-15 REVISED fix)
        // instead of push() — same "did the real NCP path get reached"
        // signal this test checks for.
        pushActive: () => { ncpPushed = true; return 1; },
      },
      pendingQueue: new Map(),
      cockpitBroadcast: () => {},
      dispatchToMistral: () => Promise.resolve(),
      dispatchToDeepseek: () => { deepseekCalled = true; return Promise.resolve(); },
      pingTimeoutMs: 20, // fast — real production default is 3000ms; no real pong is emitted here
    },
    updates,
    calls: () => ({ deepseekCalled, ncpPushed }),
  };
}

async function main() {
  await test('DSK-001', 'no connected deepseek NCP tab falls back to the real, still-legitimate ollama-bridge path', async () => {
    const { deps, calls } = makeDeps({ deepseekConnected: false });
    const dispatcher = createDispatcher(deps);
    await dispatcher._doDispatch({ id: 'job-1', provider: 'deepseek', command: 'ping' });
    assert.strictEqual(calls().deepseekCalled, true, 'ollama-bridge dispatch must still run when no NCP tab is connected');
    assert.strictEqual(calls().ncpPushed, false, 'ncp.push must not fire when there is no real tab to push to');
  });

  await test('DSK-002', 'a real, connected deepseek NCP tab is used directly, no longer shadowed by the unconditional ollama-bridge branch', async () => {
    const { deps, calls } = makeDeps({ deepseekConnected: true });
    const dispatcher = createDispatcher(deps);
    await dispatcher._doDispatch({ id: 'job-2', provider: 'deepseek', command: 'ping' });
    assert.strictEqual(calls().deepseekCalled, false, 'ollama-bridge must NOT be called when a real NCP tab is connected');
    assert.strictEqual(calls().ncpPushed, true, 'the real NCP push path must be reached instead');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

main();
