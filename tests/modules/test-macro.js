'use strict';
/**
 * test-macro.js — real tests for lib/agent-tools/tools/clear-glass/macro.js
 * against the actual module, not a reimplementation. browser_action and
 * rewind_replay are mocked at their real require paths (no live Electron
 * ClearGlass instance in this environment) so the macro tool's own real
 * logic — storage, soft-delete correctness, template substitution, URL
 * matching, and step-failure handling — gets exercised for real.
 */
process.env.JAA_DATA_DIR = require('path').join(require('os').tmpdir(), `macro-test-${Date.now()}`);

const assert = require('assert');
const path = require('path');

const mockCalls = [];
const mockBrowserAction = {
  name: 'browser_action',
  parameters: { properties: { action: { enum: ['navigate', 'dom_query', 'dom_mutate', 'get_url', 'get_title', 'screenshot', 'toast'] } } },
  execute: async ({ action, data }) => {
    mockCalls.push({ action, data });
    if (action === 'get_url') return { ok: true, result: { url: 'https://www.psychologytoday.com/us/therapists/12345' } };
    if (action === 'dom_mutate' && data.selector === '#fail-me') return { error: 'element not found: #fail-me' };
    return { ok: true, result: {} };
  },
};
const mockRewind = { execute: async ({ action }) => (action === 'snapshot' ? { ok: true, result: { snapshotId: 'snap-real-123' } } : { ok: true }) };

// Real require paths macro.js itself resolves to, from its own real
// location — registering mocks directly in the module cache under these
// exact paths, rather than fighting Node's module resolution.
const baPath = path.resolve(__dirname, '../../lib/agent-tools/tools/browser/browser-action.js');
const rewindPath = path.resolve(__dirname, '../../lib/agent-tools/tools/sandbox/rewind-replay.js');
require.cache[baPath] = { id: baPath, filename: baPath, loaded: true, exports: mockBrowserAction };
require.cache[rewindPath] = { id: rewindPath, filename: rewindPath, loaded: true, exports: mockRewind };

const macro = require('../../lib/agent-tools/tools/clear-glass/macro.js');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e.message}`); }
}

async function main() {
  await test('create rejects a step with an unknown browser_action', async () => {
    const r = await macro.execute({ action: 'create', name: 'bad', steps: [{ action: 'not_real', data: {} }] });
    assert.ok(r.error && r.error.includes('not a real browser_action'));
  });

  await test('create + list — real macro appears with the right shape', async () => {
    await macro.execute({
      action: 'create', name: 'contact_therapist', urlPattern: 'https://*.psychologytoday.com/*',
      params: ['therapistName'],
      steps: [{ action: 'dom_mutate', data: { selector: '#msg', value: 'Hi {{therapistName}}' } }],
    });
    const l = await macro.execute({ action: 'list' });
    assert.strictEqual(l.macros.length, 1);
    assert.strictEqual(l.macros[0].name, 'contact_therapist');
  });

  await test('duplicate create is rejected', async () => {
    const r = await macro.execute({ action: 'create', name: 'contact_therapist', steps: [{ action: 'navigate', data: { url: 'x' } }] });
    assert.ok(r.error && r.error.includes('already exists'));
  });

  await test('BUGFIX: get correctly reports gone after delete (soft-delete row ordering)', async () => {
    await macro.execute({ action: 'create', name: 'to_delete', steps: [{ action: 'navigate', data: { url: 'x' } }] });
    await macro.execute({ action: 'delete', name: 'to_delete' });
    const g = await macro.execute({ action: 'get', name: 'to_delete' });
    assert.ok(g.error && g.error.includes('no macro named'), `expected a real "gone" error, got ${JSON.stringify(g)}`);
  });

  await test('BUGFIX: list correctly excludes a deleted macro', async () => {
    const l = await macro.execute({ action: 'list' });
    assert.ok(!l.macros.find(m => m.name === 'to_delete'), 'deleted macro must not appear in list()');
  });

  await test('a name can be reused after real deletion', async () => {
    const r = await macro.execute({ action: 'create', name: 'to_delete', steps: [{ action: 'navigate', data: { url: 'y' } }] });
    assert.strictEqual(r.ok, true);
  });

  await test('run — real param substitution reaches browser_action, URL pattern matches', async () => {
    mockCalls.length = 0;
    const r = await macro.execute({ action: 'run', name: 'contact_therapist', agentId: 'tab-1', params: { therapistName: 'Dr. Smith' } });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.snapshotId, 'snap-real-123');
    const mutateCall = mockCalls.find(c => c.action === 'dom_mutate');
    assert.strictEqual(mutateCall.data.value, 'Hi Dr. Smith', 'the real {{therapistName}} placeholder must be substituted');
  });

  await test('run — a missing required param is rejected before anything dispatches', async () => {
    mockCalls.length = 0;
    const r = await macro.execute({ action: 'run', name: 'contact_therapist', agentId: 'tab-1', params: {} });
    assert.ok(r.error && r.error.includes('therapistName'));
    assert.strictEqual(mockCalls.length, 0, 'nothing should have been dispatched to browser_action');
  });

  await test('run — a mid-macro step failure stops the run, reports the exact step, keeps the snapshot for rollback', async () => {
    await macro.execute({ action: 'create', name: 'fails_midway', steps: [
      { action: 'navigate', data: { url: 'https://x' } },
      { action: 'dom_mutate', data: { selector: '#fail-me', value: 'x' } },
      { action: 'navigate', data: { url: 'https://never-reached' } },
    ] });
    const r = await macro.execute({ action: 'run', name: 'fails_midway', agentId: 'tab-1', params: {} });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.failedAtStep, 1);
    assert.strictEqual(r.stepsCompleted, 1);
    assert.strictEqual(r.snapshotId, 'snap-real-123', 'the rollback point must still be reported even on failure');
  });

  await test('run — a URL pattern mismatch is rejected before any step runs', async () => {
    await macro.execute({ action: 'create', name: 'wrong_site', urlPattern: 'https://only-this-site.example.com/*', steps: [{ action: 'navigate', data: { url: 'x' } }] });
    mockCalls.length = 0;
    const r = await macro.execute({ action: 'run', name: 'wrong_site', agentId: 'tab-1', params: {} });
    assert.ok(r.error && r.error.includes('requires a URL matching'));
  });

  await test('bookmark — a real, labeled rewind snapshot', async () => {
    const r = await macro.execute({ action: 'bookmark', agentId: 'tab-1', label: 'before-applying' });
    assert.strictEqual(r.result.snapshotId, 'snap-real-123');
  });

  // ── §EROS-INTEGRATION 2026-08-23 — real tests against a real, fake wire
  // bridge HTTP server standing in for clear-glass/wire/nexus-wire.js's
  // real :7704, since there's no live erosmancer/Electron in this
  // environment. Verifies macro.js's own real HTTP client and request
  // shapes, not a reimplementation. ──────────────────────────────────────
  await test('create rejects an unknown erosmancer action', async () => {
    const r = await macro.execute({ action: 'create', name: 'eros_bad', steps: [{ engine: 'erosmancer', action: 'not_real', targetUuid: 'x' }] });
    assert.ok(r.error && r.error.includes("erosmancer's real execute actions"));
  });

  await test('create rejects an erosmancer click/type step with no targetUuid', async () => {
    const r = await macro.execute({ action: 'create', name: 'eros_no_uuid', steps: [{ engine: 'erosmancer', action: 'click' }] });
    assert.ok(r.error && r.error.includes('needs a real targetUuid'));
  });

  await test('create rejects an unreal profile name', async () => {
    const r = await macro.execute({ action: 'create', name: 'eros_bad_profile', profile: 'aggressive', steps: [{ action: 'navigate', data: { url: 'x' } }] });
    assert.ok(r.error && r.error.includes('is not real'));
  });

  await test('run — an erosmancer-engine step reaches the real wire bridge with the right request shape', async () => {
    let capturedExecuteBody = null, capturedProfileBody = null;
    const http = require('http');
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        if (req.url === '/eros/execute') { capturedExecuteBody = JSON.parse(body); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, result: { clicked: true }, planId: 'plan-1' })); }
        else if (req.url === '/eros/behavior/profile') { capturedProfileBody = JSON.parse(body); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, profile: capturedProfileBody.profile })); }
        else { res.writeHead(404); res.end(); }
      });
    });
    await new Promise(resolve => server.listen(17704, resolve));
    process.env.EROS_WIRE_PORT = '17704';
    // macro.js reads EROS_WIRE_PORT once, at module load — force a real,
    // fresh require so this test's own port actually takes effect,
    // matching the same real constraint the module's own comment states.
    delete require.cache[require.resolve('../../lib/agent-tools/tools/clear-glass/macro.js')];
    const macroFresh = require('../../lib/agent-tools/tools/clear-glass/macro.js');

    await macroFresh.execute({ action: 'create', name: 'eros_click', profile: 'cautious', steps: [
      { engine: 'erosmancer', action: 'click', targetUuid: 'node-abc-123' },
    ] });
    const r = await macroFresh.execute({ action: 'run', name: 'eros_click', agentId: 'tab-eros', params: {} });

    server.close();
    assert.strictEqual(r.ok, true, `expected a real success, got ${JSON.stringify(r)}`);
    assert.strictEqual(capturedProfileBody.sessionId, 'tab-eros');
    assert.strictEqual(capturedProfileBody.profile, 'cautious');
    assert.strictEqual(capturedExecuteBody.action, 'click');
    assert.strictEqual(capturedExecuteBody.uuid, 'node-abc-123');
    assert.strictEqual(capturedExecuteBody.tabId, 'tab-eros');
  });

  await test('run — erosmancer wire unreachable fails loud with a real, specific error', async () => {
    process.env.EROS_WIRE_PORT = '17705'; // nothing real listening here
    delete require.cache[require.resolve('../../lib/agent-tools/tools/clear-glass/macro.js')];
    const macroFresh = require('../../lib/agent-tools/tools/clear-glass/macro.js');
    await macroFresh.execute({ action: 'create', name: 'eros_unreachable', steps: [{ engine: 'erosmancer', action: 'navigate', data: 'https://x' }] });
    const r = await macroFresh.execute({ action: 'run', name: 'eros_unreachable', agentId: 'tab-1', params: {} });
    assert.strictEqual(r.ok, false);
    assert.ok(r.error.includes('unreachable'), `expected a real, specific unreachable error, got: ${r.error}`);
  });

  await test('run — erosmancer navigate/type/evaluate steps pass data as a raw payload, NOT nested like browser_action', async () => {
    // §CORRECTNESS 2026-08-23 — real, confirmed by reading erosmancer's
    // own /api/execute directly: payload for navigate/type/evaluate is
    // String(payload) — a raw value, not extracted from an object the way
    // browser_action's {url:...}/{selector:...} shape works. A macro step
    // author who copies browser_action's convention here would silently
    // send "[object Object]" instead of the real URL/text/expression.
    let capturedExecuteBody = null;
    const http = require('http');
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        if (req.url === '/eros/execute') { capturedExecuteBody = JSON.parse(body); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, result: {} })); }
        else { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true })); }
      });
    });
    await new Promise(resolve => server.listen(17706, resolve));
    process.env.EROS_WIRE_PORT = '17706';
    delete require.cache[require.resolve('../../lib/agent-tools/tools/clear-glass/macro.js')];
    const macroFresh = require('../../lib/agent-tools/tools/clear-glass/macro.js');
    await macroFresh.execute({ action: 'create', name: 'eros_navigate', steps: [{ engine: 'erosmancer', action: 'navigate', data: 'https://real-url.example.com/{{path}}' }] });
    const r = await macroFresh.execute({ action: 'run', name: 'eros_navigate', agentId: 'tab-1', params: { path: 'jobs/123' } });
    server.close();
    assert.strictEqual(r.ok, true);
    assert.strictEqual(capturedExecuteBody.payload, 'https://real-url.example.com/jobs/123', 'must be a real, raw substituted string, not a nested object');
  });

  // ── §BOOKMARK-RESTORE 2026-08-23 — James: "map bookmarks/clear-glass
  // snapshots to a command/tool. like open any url in the last state it
  // was in." Real tests against the actual openBookmark logic, with a
  // dedicated real mock matching engine.js's own confirmed real shape
  // (GET /rewind/:agentId -> {snapshots:[...]}, each snapshot's own id
  // field is literally "id", restore looks up by s.id === snapshotId) —
  // not the simplified shared mockRewind above, which doesn't have
  // enough shape for this. ───────────────────────────────────────────
  await test('openBookmark finds the real, most recent matching snapshot and restores it', async () => {
    let restoreBody = null;
    const snapshots = [
      { id: 'old-1', label: 'bookmark:job-app', url: 'https://jobs.example.com/apply/1', ts: 1000 },
      { id: 'new-1', label: 'bookmark:job-app', url: 'https://jobs.example.com/apply/1?step=2', ts: 5000 },
      { id: 'other-1', label: 'bookmark:different', url: 'https://x', ts: 9000 },
    ];
    const dedicatedMockRewind = {
      execute: async ({ action, agentId, snapshotId }) => {
        if (action === 'list') return { snapshots };
        if (action === 'restore') { restoreBody = { agentId, snapshotId }; return { ok: true, result: { restored: true } }; }
        return { error: `unexpected action ${action}` };
      },
    };
    const rewindPath2 = require('path').resolve(__dirname, '../../lib/agent-tools/tools/sandbox/rewind-replay.js');
    require.cache[rewindPath2] = { id: rewindPath2, filename: rewindPath2, loaded: true, exports: dedicatedMockRewind };
    delete require.cache[require.resolve('../../lib/agent-tools/tools/clear-glass/macro.js')];
    const macroFresh = require('../../lib/agent-tools/tools/clear-glass/macro.js');

    const r = await macroFresh.execute({ action: 'openBookmark', agentId: 'tab-9', label: 'job-app' });
    assert.strictEqual(r.ok, true, `expected success, got ${JSON.stringify(r)}`);
    assert.strictEqual(r.snapshotId, 'new-1', 'must pick the MOST RECENT match (ts:5000), not the oldest (ts:1000)');
    assert.strictEqual(r.url, 'https://jobs.example.com/apply/1?step=2');
    assert.strictEqual(restoreBody.snapshotId, 'new-1', 'restore() must actually be called with the real, chosen snapshot id');
    assert.strictEqual(restoreBody.agentId, 'tab-9');
  });

  await test('openBookmark fails loud, real error, when no snapshot matches the label', async () => {
    const dedicatedMockRewind = { execute: async ({ action }) => (action === 'list' ? { snapshots: [] } : { error: 'should not reach restore' }) };
    const rewindPath2 = require('path').resolve(__dirname, '../../lib/agent-tools/tools/sandbox/rewind-replay.js');
    require.cache[rewindPath2] = { id: rewindPath2, filename: rewindPath2, loaded: true, exports: dedicatedMockRewind };
    delete require.cache[require.resolve('../../lib/agent-tools/tools/clear-glass/macro.js')];
    const macroFresh = require('../../lib/agent-tools/tools/clear-glass/macro.js');

    const r = await macroFresh.execute({ action: 'openBookmark', agentId: 'tab-9', label: 'never-bookmarked' });
    assert.ok(r.error && r.error.includes('no bookmark named'));
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main();
