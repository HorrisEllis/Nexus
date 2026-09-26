'use strict';
/**
 * tests/modules/grammar-misfire-tracker.test.js — Phase 31 remaining gap
 * UUID: test-grammar-misfire-tracker-v1-0000-3100-0000-000000000001
 *
 * Covers: streak counting per (componentId, matched) pattern, escalation
 * fires exactly at the 3rd consecutive misfire (not before, not after),
 * streak resets post-escalation so a 4th/5th/6th misfire doesn't
 * re-escalate immediately, different matched strings against the same
 * componentId are tracked as separate streaks, and persistence survives
 * a fresh require (simulating a restart) by reading from the mock JAA
 * store rather than module-level memory.
 */

const assert = require('assert');
let passed = 0, failed = 0;

async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack || e.message}`); failed++; }
}

// ── Mock JAA — in-memory, mirrors the real .query/.insert/.update shape ──────
function makeMockJaa() {
  const store = { grammar_misfire_streaks: [], event_log: [] };
  return {
    store,
    insert(table, record) {
      if (!store[table]) store[table] = [];
      store[table].push(record);
      return record;
    },
    update(table, uuid, patch) {
      const rows = store[table] || [];
      const idx = rows.findIndex(r => r.uuid === uuid);
      if (idx === -1) throw new Error(`update: no row ${uuid} in ${table}`);
      rows[idx] = { ...rows[idx], ...patch };
      return rows[idx];
    },
    query(table, pred = () => true, limit = 500) {
      return (store[table] || []).filter(pred).slice(0, limit);
    },
  };
}

// ── Mock fetch — captures escalation calls instead of hitting real idearium ──
function makeMockFetch() {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) });
    return { ok: true, json: async () => ({ idea: { uuid: 'mock-idea-uuid' } }) };
  };
  fn.calls = calls;
  return fn;
}

async function run() {
  // Fresh module instance per test group — require.cache bust so each
  // group gets its own module-level _jaa/_ideariumUrl, same pattern
  // case-library.test.js already uses for jaa-db.
  function freshTracker() {
    delete require.cache[require.resolve('../../orchestrator/lib/grammar-misfire-tracker')];
    return require('../../orchestrator/lib/grammar-misfire-tracker');
  }

  await test('MFT-01', 'first two misfires on same pattern do not escalate', async () => {
    const tracker = freshTracker();
    const jaa = makeMockJaa();
    const mockFetch = makeMockFetch();
    globalThis.fetch = mockFetch;
    tracker.init(jaa);

    const r1 = await tracker.recordMisfire({ componentId: 'cortex.gaps.list', matched: 'gap', requestId: 'r1' });
    const r2 = await tracker.recordMisfire({ componentId: 'cortex.gaps.list', matched: 'gap', requestId: 'r2' });

    assert.strictEqual(r1.count, 1);
    assert.strictEqual(r1.escalated, false);
    assert.strictEqual(r2.count, 2);
    assert.strictEqual(r2.escalated, false);
    assert.strictEqual(mockFetch.calls.length, 0);
  });

  await test('MFT-02', 'third consecutive misfire on same pattern escalates exactly once', async () => {
    const tracker = freshTracker();
    const jaa = makeMockJaa();
    const mockFetch = makeMockFetch();
    globalThis.fetch = mockFetch;
    tracker.init(jaa);

    await tracker.recordMisfire({ componentId: 'cortex.gaps.list', matched: 'gap', requestId: 'r1' });
    await tracker.recordMisfire({ componentId: 'cortex.gaps.list', matched: 'gap', requestId: 'r2' });
    const r3 = await tracker.recordMisfire({ componentId: 'cortex.gaps.list', matched: 'gap', requestId: 'r3' });

    assert.strictEqual(r3.count, 3);
    assert.strictEqual(r3.escalated, true);
    assert.strictEqual(mockFetch.calls.length, 1);
    assert.strictEqual(mockFetch.calls[0].url, 'http://127.0.0.1:4800/api/ideas');
    assert.ok(mockFetch.calls[0].body.text.includes('cortex.gaps.list'));
    assert.ok(mockFetch.calls[0].body.tags.includes('grammar-misfire'));

    const escalationEvent = jaa.store.event_log.find(e => e.type === 'grammar.misfire_escalated');
    assert.ok(escalationEvent, 'expected grammar.misfire_escalated event in event_log');
    assert.strictEqual(escalationEvent.payload.count, 3);
  });

  await test('MFT-03', 'streak resets after escalation — 4th misfire does not immediately re-escalate', async () => {
    const tracker = freshTracker();
    const jaa = makeMockJaa();
    const mockFetch = makeMockFetch();
    globalThis.fetch = mockFetch;
    tracker.init(jaa);

    await tracker.recordMisfire({ componentId: 'cortex.gaps.list', matched: 'gap', requestId: 'r1' });
    await tracker.recordMisfire({ componentId: 'cortex.gaps.list', matched: 'gap', requestId: 'r2' });
    await tracker.recordMisfire({ componentId: 'cortex.gaps.list', matched: 'gap', requestId: 'r3' });
    const r4 = await tracker.recordMisfire({ componentId: 'cortex.gaps.list', matched: 'gap', requestId: 'r4' });

    assert.strictEqual(r4.count, 1, 'streak should have reset to 0 then incremented to 1');
    assert.strictEqual(r4.escalated, false);
    assert.strictEqual(mockFetch.calls.length, 1, 'still only the one escalation from the first streak');
  });

  await test('MFT-04', 'different matched strings against the same componentId track separately', async () => {
    const tracker = freshTracker();
    const jaa = makeMockJaa();
    const mockFetch = makeMockFetch();
    globalThis.fetch = mockFetch;
    tracker.init(jaa);

    await tracker.recordMisfire({ componentId: 'cortex.gaps.list', matched: 'gap', requestId: 'r1' });
    await tracker.recordMisfire({ componentId: 'cortex.gaps.list', matched: 'gap', requestId: 'r2' });
    const rDifferentPattern = await tracker.recordMisfire({ componentId: 'cortex.gaps.list', matched: 'show gaps', requestId: 'r3' });

    assert.strictEqual(rDifferentPattern.count, 1, 'a different matched string is a different streak, not a continuation');
  });

  await test('MFT-05', 'persistence: streak state lives in JAA, not module memory — survives a fresh require', async () => {
    const jaa = makeMockJaa();
    const mockFetch = makeMockFetch();
    globalThis.fetch = mockFetch;

    const trackerA = freshTracker();
    trackerA.init(jaa);
    await trackerA.recordMisfire({ componentId: 'idearium.ideas.create', matched: 'new idea', requestId: 'r1' });
    await trackerA.recordMisfire({ componentId: 'idearium.ideas.create', matched: 'new idea', requestId: 'r2' });

    // Simulate a restart: fresh module instance, same underlying JAA store
    const trackerB = freshTracker();
    trackerB.init(jaa);
    const r3 = await trackerB.recordMisfire({ componentId: 'idearium.ideas.create', matched: 'new idea', requestId: 'r3' });

    assert.strictEqual(r3.count, 3, 'streak count must come from JAA, not be lost on module reload');
    assert.strictEqual(r3.escalated, true);
  });

  await test('MFT-06', 'missing componentId or matched is a loud error, not a silent no-op', async () => {
    const tracker = freshTracker();
    const jaa = makeMockJaa();
    tracker.init(jaa);
    const r = await tracker.recordMisfire({ componentId: null, matched: 'gap', requestId: 'r1' });
    assert.strictEqual(r.ok, false);
    assert.ok(r.error);
  });

  console.log(`\n  grammar-misfire-tracker: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

run();
