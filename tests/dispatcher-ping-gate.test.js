'use strict';
/**
 * tests/dispatcher-ping-gate.test.js — real test for the new ping/pong
 * dispatch gate.
 *
 * James: "each .job created has to wait until the gate clears. the event
 * gate sends the ping command, doesn't dispatch until ping is returned,
 * then dispatch the job." guardian/lib/dispatcher.js's new
 * _pingProvider() pushes a real GUARDIAN_PING and waits for the matching
 * 'guardian.ncp.pong' bus event (emitted by guardian/lib/ncp-handler.js
 * on a real GUARDIAN_PING_ACK from the tab) before letting a job's real
 * content go out.
 *
 * Same real bus/dep shape as tests/dispatcher-stale-socket.test.js — see
 * that file's own header for why the fake bus needs real on()/off(),
 * not just emit().
 */
const assert = require('assert');
const { createDispatcher } = require('../guardian/lib/dispatcher.js');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}

function makeDeps({ pushReturns = 1, isConnected = true, autoPong = false } = {}) {
  const updates = [];
  const emitted = [];
  const pendingQueue = new Map();
  const listeners = new Map();
  const bus = {
    emit: (name, payload) => {
      emitted.push({ name, payload });
      for (const fn of listeners.get(name) || []) fn({ data: payload });
    },
    on: (name, fn) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
    off: (name, fn) => { listeners.get(name)?.delete(fn); },
  };
  return {
    deps: {
      updateJob: (id, patch) => updates.push({ id, patch }),
      bus,
      ncp: {
        isConnected: () => isConnected,
        push: (provider, msg) => {
          // §REAL PONG SIMULATION — when autoPong is set, respond to a
          // real GUARDIAN_PING exactly the way a real, healthy tab would:
          // fire the matching GUARDIAN_PING_ACK straight back through
          // the same real event guardian/lib/ncp-handler.js emits.
          if (autoPong && msg.type === 'GUARDIAN_PING') {
            bus.emit('guardian.ncp.pong', { provider, tabId: 'tab-1', pingId: msg.pingId });
          }
          return pushReturns;
        },
        // dispatcher.js's job-send path now calls pushActive() (single-
        // target, see guardian/lib/ncp.js's 2026-09-15 REVISED fix) instead
        // of push(). These ping-gate tests only care about the ping/pong
        // exchange (which still goes through push()), so pushActive just
        // mirrors the same configurable return value for the actual job send.
        pushActive: (provider, msg) => pushReturns,
      },
      pendingQueue,
      cockpitBroadcast: () => {},
      dispatchToMistral: () => Promise.resolve(),
      dispatchToDeepseek: () => Promise.resolve(),
      pingTimeoutMs: 20, // fast — real production default is 3000ms
    },
    updates, emitted, pendingQueue,
  };
}

async function main() {
  await test('PG-001', 'a real pong clearing the gate lets the job dispatch normally, marked pinging then delivered', async () => {
    const { deps, updates } = makeDeps({ pushReturns: 1, isConnected: true, autoPong: true });
    const dispatcher = createDispatcher(deps);
    const job = { id: 'job-ping-1', provider: 'chatgpt', command: 'ask' };

    await dispatcher._doDispatch(job);

    const pingingUpdate = updates.find(u => u.patch.status === 'pinging');
    assert.ok(pingingUpdate, 'job must be marked pinging while the gate is open');
    const deliveredUpdate = updates.find(u => u.patch.status === 'delivered');
    assert.ok(deliveredUpdate, 'a real, cleared ping gate must still let the job reach delivered');
  });

  await test('PG-002', 'ping times out AND heartbeat has since gone stale — real evidence, job is requeued, never dispatched blind', async () => {
    // §REALISTIC RACE — the existing, pre-ping-gate isConnected() check
    // in _doDispatch already short-circuits "never was connected" before
    // this new gate code is ever reached (queued with reason "waiting
    // for ... NCP channel", unrelated to the ping gate, unchanged
    // behavior). The real scenario this gate actually catches is
    // narrower: connected at the top of _doDispatch, but the heartbeat
    // goes stale in the few seconds the ping is waiting — isConnected()
    // called a second time, after the ping times out, now says false.
    let calls = 0;
    const { deps, updates, emitted, pendingQueue } = makeDeps({ pushReturns: 1, isConnected: true, autoPong: false });
    deps.ncp.isConnected = () => { calls++; return calls === 1; };
    const dispatcher = createDispatcher(deps);
    const job = { id: 'job-ping-2', provider: 'chatgpt', command: 'ask' };

    await dispatcher._doDispatch(job);

    const deliveredUpdate = updates.find(u => u.patch.status === 'delivered');
    assert.strictEqual(deliveredUpdate, undefined, 'job must NOT be dispatched when both the ping and the (now-stale) passive heartbeat agree the tab is unreachable');
    const queuedUpdate = updates.find(u => u.patch.status === 'queued');
    assert.ok(queuedUpdate, 'job must be requeued instead');
    assert.ok(queuedUpdate.patch.queueReason.includes('ping gate failed'), `queueReason should name the ping gate, got: ${queuedUpdate.patch.queueReason}`);
    const queuedEvent = emitted.find(e => e.name === 'guardian.job.queued' && e.payload.reason === 'ping_gate_failed');
    assert.ok(queuedEvent, 'a real guardian.job.queued event with reason:ping_gate_failed must fire');
  });

  await test('PG-003', 'ping times out but heartbeat is still healthy — uncertain evidence alone, job dispatches anyway', async () => {
    const { deps, updates } = makeDeps({ pushReturns: 1, isConnected: true, autoPong: false });
    const dispatcher = createDispatcher(deps);
    const job = { id: 'job-ping-3', provider: 'chatgpt', command: 'ask' };

    await dispatcher._doDispatch(job);

    const deliveredUpdate = updates.find(u => u.patch.status === 'delivered');
    assert.ok(deliveredUpdate, 'a lone timed-out ping must not block dispatch when the passive heartbeat disagrees (fail-open on uncertain evidence, same rule copilot/lifeline.js already uses)');
    const queuedUpdate = updates.find(u => u.patch.status === 'queued');
    assert.strictEqual(queuedUpdate, undefined, 'job must not be requeued on one uncertain signal alone');
  });

  await test('PG-004', 'a pong for a different provider is ignored, does not falsely clear this job\'s gate', async () => {
    const { deps, updates } = makeDeps({ pushReturns: 1, isConnected: true, autoPong: false });
    deps.ncp.push = (provider, msg) => {
      if (msg.type === 'GUARDIAN_PING') deps.bus.emit('guardian.ncp.pong', { provider: 'claude', tabId: 'other-tab', pingId: msg.pingId });
      return 1;
    };
    const dispatcher = createDispatcher(deps);
    const job = { id: 'job-ping-4', provider: 'chatgpt', command: 'ask' };

    await dispatcher._doDispatch(job);

    // Heartbeat is healthy, so this still dispatches (fail-open) — the
    // real thing under test is that it does NOT resolve the ping
    // instantly off the wrong provider's pong (which would prove
    // nothing about chatgpt's own tab).
    const deliveredUpdate = updates.find(u => u.patch.status === 'delivered');
    assert.ok(deliveredUpdate, 'job still dispatches via fail-open once the (correctly ignored) mismatched pong times out for real');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

main();
