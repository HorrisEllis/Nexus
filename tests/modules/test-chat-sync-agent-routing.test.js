'use strict';
/**
 * tests/modules/test-chat-sync-agent-routing.test.js
 *
 * §FIX 2026-09-22 — James: "the cli in clearglass to stream the dom to
 * the agent tabs of the repos." guardian/lib/chat-sync.js predates TR1/
 * TR2's agentId routing (its own header quotes an earlier version of
 * this same ask, 2026-09-17) and always called ncp.push(provider, ...)
 * — a BROADCAST to every connected tab for that provider, the same
 * shared-tab problem TR1 closed for job dispatch but never reached
 * here. requestSync() now accepts an optional agentId and uses
 * ncp.pushTab(provider, agentId, ...) instead — the SAME real routing
 * dispatcher.js already uses. chat-sync.js had zero test coverage
 * before this — checked directly, no tests/modules/*chat-sync* file
 * existed.
 */
const assert = require('assert');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.log(`  ✗ ${name}\n    ${e.message}`); failed++; }
}

function fakeBus() {
  const listeners = {};
  return {
    on: (event, fn) => { (listeners[event] ||= []).push(fn); },
    off: (event, fn) => { listeners[event] = (listeners[event] || []).filter(f => f !== fn); },
    emit: (event, data) => { for (const fn of (listeners[event] || [])) fn({ data }); },
  };
}

async function main() {
  const { createChatSync } = require(path.join(ROOT, 'guardian', 'lib', 'chat-sync.js'));

  await test('no agentId -> unchanged real broadcast behavior (ncp.push), every existing caller unaffected', async () => {
    const calls = [];
    const bus = fakeBus();
    const ncp = { push: (provider, data) => { calls.push({ fn: 'push', provider, data }); return 1; }, pushTab: () => { throw new Error('pushTab must NOT be called without an agentId'); } };
    const { requestSync } = createChatSync({ bus, ncp });
    const p = requestSync('claude', 1000, null);
    // resolve it so the promise doesn't hang the test process
    bus.emit('guardian.ncp.sync_result', { provider: 'claude', syncId: calls[0].data.syncId, chat: { messages: [] } });
    const r = await p;
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].fn, 'push');
    assert.strictEqual(r.ok, true);
  });

  await test('a real agentId routes through pushTab(provider, agentId, ...) — targeting one repo\'s own tab, not a broadcast', async () => {
    const calls = [];
    const bus = fakeBus();
    const ncp = {
      push: () => { throw new Error('push (broadcast) must NOT be called when an agentId is given'); },
      pushTab: (provider, agentId, data) => { calls.push({ fn: 'pushTab', provider, agentId, data }); return true; },
    };
    const { requestSync } = createChatSync({ bus, ncp });
    const p = requestSync('claude', 1000, 'repo-abc123');
    bus.emit('guardian.ncp.sync_result', { provider: 'claude', syncId: calls[0].data.syncId, chat: { messages: [{ text: 'hi' }] } });
    const r = await p;
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].agentId, 'repo-abc123');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.chat.messages.length, 1);
  });

  await test('a repo with no live tab (pushTab returns false) fails honestly, naming the real reason — not a silent hang or a false "not connected"', async () => {
    const bus = fakeBus();
    const ncp = { push: () => 1, pushTab: () => false };
    const { requestSync } = createChatSync({ bus, ncp });
    const r = await requestSync('claude', 200, 'repo-with-no-tab');
    assert.strictEqual(r.ok, false);
    assert.ok(/repo-with-no-tab/.test(r.reason), 'the failure reason must name the specific agentId, not a generic message');
    assert.ok(/ensureAgentTab/.test(r.reason), 'must cite the real, named gap (TR2\'s trigger not wired) rather than an unexplained failure');
  });

  await test('the broadcast path\'s existing zero-client short-circuit is unaffected by this change', async () => {
    const bus = fakeBus();
    const ncp = { push: () => 0, pushTab: () => { throw new Error('must not be called'); } };
    const { requestSync } = createChatSync({ bus, ncp });
    const r = await requestSync('claude', 200, null);
    assert.strictEqual(r.ok, false);
    assert.ok(/0 clients/.test(r.reason));
  });

  // ── the /sync route + guardian/cli.js structural wiring ──────────────
  const fs = require('fs');
  const SERVER = fs.readFileSync(path.join(ROOT, 'guardian', 'server.js'), 'utf8');
  const CLI = fs.readFileSync(path.join(ROOT, 'guardian', 'cli.js'), 'utf8');

  await test('the /sync route passes body.agentId through to requestSync', () => {
    const syncRoute = SERVER.slice(SERVER.indexOf("url.pathname==='/sync'"), SERVER.indexOf("url.pathname.startsWith('/stream/')"));
    assert.ok(/requestSync\(provider, body\.timeoutMs \|\| 15000, body\.agentId \|\| null\)/.test(syncRoute));
  });

  await test('guardian/cli.js\'s sync command parses --agent and sends it', () => {
    assert.ok(/agentFlagIdx = args\.indexOf\('--agent'\)/.test(CLI));
    assert.ok(/post\('\/sync', \{ provider, agentId \}\)/.test(CLI));
  });

  await test('guardian/cli.js\'s raw-command path (/code /ask /paste) strips --agent before building the prompt text, so it never corrupts what\'s actually sent', () => {
    assert.ok(/cmdArgs\.splice\(agentFlagIdx, 2\)/.test(CLI));
    assert.ok(/await sendCommand\(cmdArgs\.join\(' '\), agentId\)/.test(CLI));
  });

  await test('/command\'s createJob already reads agentId (guardian/lib/jobs.js) — confirming the CLI\'s new agentId actually reaches a real, already-listening field, not a no-op', () => {
    const JOBS = fs.readFileSync(path.join(ROOT, 'guardian', 'lib', 'jobs.js'), 'utf8');
    assert.ok(/agentId: agentId \|\| null/.test(JOBS));
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch(e => { console.error('  ! crashed:', e.stack); process.exit(1); });
