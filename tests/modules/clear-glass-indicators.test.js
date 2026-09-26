'use strict';
/**
 * tests/modules/clear-glass-indicators.test.js
 * Tests for two stubs found and fixed 2026-06-30 while auditing the
 * Clear Glass status bar (Health/Cookies indicators that never updated):
 *   1. cookies:count IPC handler logic (ipc/bridge.js)
 *   2. health percentage calculation (browser.html's nexus.status handler)
 *
 * Both were silently broken — Health hardcoded at 100, Cookies showing
 * the page URL instead of a count. These tests prove the REPLACEMENT
 * logic actually computes correct values under real and edge conditions,
 * not just that the functions exist.
 */

const assert = require('assert');
let passed = 0, failed = 0;

function test(desc, fn) {
  try { fn(); console.log(`  ✓ ${desc}`); passed++; }
  catch(e) { console.error(`  ✗ ${desc}\n    ${e.message}`); failed++; }
}

// ── Health percentage — extracted verbatim from browser.html's fix ────────
function computeHealth(d) {
  const checks = ['orchestrator', 'cortex', 'guardian', 'bridge'];
  const upCount = checks.filter(k => d[k]).length;
  const pct = Math.round((upCount / checks.length) * 100);
  const color = pct === 100 ? 'default' : pct >= 50 ? 'amber' : 'red';
  return { pct, color };
}

test('CGI-01 all four systems up — 100%, default color', () => {
  const r = computeHealth({ orchestrator: true, cortex: true, guardian: true, bridge: true });
  assert.strictEqual(r.pct, 100);
  assert.strictEqual(r.color, 'default');
});

test('CGI-02 all four down — 0%, red', () => {
  const r = computeHealth({ orchestrator: false, cortex: false, guardian: false, bridge: false });
  assert.strictEqual(r.pct, 0);
  assert.strictEqual(r.color, 'red');
});

test('CGI-03 two of four up — 50%, amber (boundary case)', () => {
  const r = computeHealth({ orchestrator: true, cortex: true, guardian: false, bridge: false });
  assert.strictEqual(r.pct, 50);
  assert.strictEqual(r.color, 'amber');
});

test('CGI-04 one of four up — 25%, red (below 50% threshold)', () => {
  const r = computeHealth({ orchestrator: true, cortex: false, guardian: false, bridge: false });
  assert.strictEqual(r.pct, 25);
  assert.strictEqual(r.color, 'red');
});

test('CGI-05 three of four up — 75%, amber (not 100, not <50)', () => {
  const r = computeHealth({ orchestrator: true, cortex: true, guardian: true, bridge: false });
  assert.strictEqual(r.pct, 75);
  assert.strictEqual(r.color, 'amber');
});

test('CGI-06 missing keys treated as down, not crash', () => {
  const r = computeHealth({ orchestrator: true }); // cortex/guardian/bridge undefined
  assert.strictEqual(r.pct, 25);
});

test('CGI-07 empty object — 0%, no throw', () => {
  const r = computeHealth({});
  assert.strictEqual(r.pct, 0);
});

// ── cookies:count handler logic — extracted from ipc/bridge.js's fix ──────
async function cookiesCountHandler({ url, agentId } = {}, mockSession) {
  try {
    if (!url) return { ok: false, error: 'url required', count: 0 };
    const partition = `persist:ncp-${agentId || 'default'}`;
    const ses = mockSession.fromPartition(partition);
    const cookies = await ses.cookies.get({ url });
    return { ok: true, count: cookies.length };
  } catch (err) {
    return { ok: false, error: err.message, count: 0 };
  }
}

function makeMockSession(cookieList, shouldThrow = false) {
  return {
    fromPartition: (partition) => ({
      cookies: {
        get: async () => {
          if (shouldThrow) throw new Error('session API unavailable');
          return cookieList;
        },
      },
      _partition: partition,
    }),
  };
}

(async () => {
  await (async () => {
    const ses = makeMockSession([{name:'a'},{name:'b'},{name:'c'}]);
    const r = await cookiesCountHandler({ url: 'https://chatgpt.com', agentId: 'default' }, ses);
    test('CGI-08 real cookies returns correct count', () => {
      assert.strictEqual(r.ok, true);
      assert.strictEqual(r.count, 3);
    });
  })();

  await (async () => {
    const r = await cookiesCountHandler({ agentId: 'default' }, makeMockSession([]));
    test('CGI-09 missing url rejects cleanly, not a crash', () => {
      assert.strictEqual(r.ok, false);
      assert.strictEqual(r.error, 'url required');
      assert.strictEqual(r.count, 0); // never undefined — UI can always read .count safely
    });
  })();

  await (async () => {
    const r = await cookiesCountHandler({ url: 'https://x.com' }, makeMockSession([], true));
    test('CGI-10 session API failure returns ok:false with count:0, not throw', () => {
      assert.strictEqual(r.ok, false);
      assert.strictEqual(r.count, 0);
      assert.ok(r.error.includes('unavailable'));
    });
  })();

  await (async () => {
    const r = await cookiesCountHandler({ url: 'https://x.com' }, makeMockSession([]));
    test('CGI-11 zero cookies is a valid success, not an error', () => {
      assert.strictEqual(r.ok, true);
      assert.strictEqual(r.count, 0);
    });
  })();

  await (async () => {
    let capturedPartition;
    const ses = {
      fromPartition: (p) => { capturedPartition = p; return { cookies: { get: async () => [] } }; },
    };
    await cookiesCountHandler({ url: 'https://x.com', agentId: 'claude-tab-7' }, ses);
    test('CGI-12 agentId correctly scopes the partition — not cross-agent leakage', () => {
      assert.strictEqual(capturedPartition, 'persist:ncp-claude-tab-7');
    });
  })();

  await (async () => {
    let capturedPartition;
    const ses = {
      fromPartition: (p) => { capturedPartition = p; return { cookies: { get: async () => [] } }; },
    };
    await cookiesCountHandler({ url: 'https://x.com' }, ses); // no agentId
    test('CGI-13 missing agentId falls back to "default" partition, not undefined', () => {
      assert.strictEqual(capturedPartition, 'persist:ncp-default');
    });
  })();

  console.log(`\n  clear-glass-indicators: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
