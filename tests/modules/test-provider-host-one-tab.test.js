'use strict';
/**
 * tests/modules/test-provider-host-one-tab.test.js — v0.39.237
 * James, against his 2026-09-25 log: "it shouldn't be opening two instances."
 *
 * Runs the REAL clear-glass/src/providers/host.js ProviderHost class. Only
 * 'electron' is replaced (a Node test process has no BrowserWindow); every
 * line of ProviderHost itself is the shipped code. The 5 s restart timers
 * are captured and fired by hand, so what the handler restarts is observed,
 * not assumed.
 *
 * What it pins:
 *   - an agent tab that crashes or closes unexpectedly restarts as THAT
 *     agent's tab — before 0.39.237 it started the shared provider window
 *   - an agent tab closed on purpose (idle sweep, LRU cap, closeAgentTab)
 *     restarts nothing — before 0.39.237 it started the shared window 5 s later
 *   - shared windows behave as before: unexpected close restarts, stop() doesn't
 */
const assert = require('assert');
const Module = require('module');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

// ── fake electron (the only substitution) ──────────────────────────────────
const created = [];
class FakeWin {
  constructor(opts) {
    this.opts = opts; this.h = {}; this.wh = {}; this._d = false; this._visible = !!opts.show;
    this.webContents = { on: (e, f) => { this.wh[e] = f; }, getURL: () => 'https://chatgpt.com/', executeJavaScript: async () => true,
      setWindowOpenHandler() {}, once() {}, send() {}, session: {} };
    created.push(this);
  }
  on(e, f) { this.h[e] = f; } once(e, f) { this.h[e] = f; }
  isDestroyed() { return this._d; }
  destroy() { if (this._d) return; this._d = true; this.h.closed && this.h.closed(); }
  crash() { this.wh['render-process-gone'] && this.wh['render-process-gone']({}, { reason: 'crashed (simulated)' }); }
  loadURL() { return Promise.resolve(); } show() { this._visible = true; } hide() { this._visible = false; }
  isVisible() { return this._visible; } setTitle() {}
}
const fakeSession = { webRequest: { onHeadersReceived() {}, onBeforeSendHeaders() {} }, on() {}, setPermissionRequestHandler() {}, setUserAgent() {}, getUserAgent: () => 'ua' };
const electron = { BrowserWindow: FakeWin, session: { fromPartition: () => fakeSession, defaultSession: fakeSession }, app: { getPath: () => require('os').tmpdir(), on() {} } };
const _load = Module._load;
Module._load = function (req, ...a) { return req === 'electron' ? electron : _load.call(this, req, ...a); };

// ── capture ProviderHost's 5 s restart timers ──────────────────────────────
const restarts = [];
const _setTimeout = global.setTimeout;
global.setTimeout = (fn, ms, ...a) => (ms === 5000 ? (restarts.push(fn), { unref() {} }) : _setTimeout(fn, ms, ...a));
async function fireRestarts() { const fns = restarts.splice(0); for (const fn of fns) await fn(); await new Promise(r => _setTimeout(r, 5)); }

const ProviderHost = require(path.join(ROOT, 'clear-glass/src/providers/host.js'));
const newHost = () => { created.length = 0; restarts.length = 0; return new ProviderHost({ guardianDir: path.join(ROOT, 'guardian') }); };
const tabWin = (h, agentId) => h.agentTabs.get(`chatgpt::${agentId}`).win;

let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  \u2713 ${id} ${d}`); passed++; } catch (e) { console.error(`  \u2717 ${id} ${d}\n    ${e.message}`); failed++; } }

(async () => {
  console.log('\n\u2B21  PROVIDER HOST — one tab per job, no stray instances\n');

  await test('OT-01', 'an agent tab that crashes restarts as the same agent tab, not the shared window', async () => {
    const h = newHost();
    await h.start('chatgpt', { show: false, agentId: 'repo-a' });
    tabWin(h, 'repo-a').crash();
    await fireRestarts();
    assert.strictEqual(h.windows.size, 0, `a shared chatgpt window was started (windows: ${h.windows.size}) — that is the second instance`);
    assert.ok(h.agentTabs.has('chatgpt::repo-a'), 'the crashed repo tab must come back under its own agentId');
    assert.strictEqual(created.filter(w => w.opts.show).length, 0, 'nothing may be shown');
  });

  await test('OT-02', 'an agent tab that closes unexpectedly restarts as the same agent tab, not the shared window', async () => {
    const h = newHost();
    await h.start('chatgpt', { show: false, agentId: 'repo-b' });
    tabWin(h, 'repo-b').destroy();                 // not via closeAgentTab/stop — unexpected
    await fireRestarts();
    assert.strictEqual(h.windows.size, 0, 'a shared chatgpt window was started');
    assert.ok(h.agentTabs.has('chatgpt::repo-b'), 'the repo tab must be restarted');
  });

  await test('OT-03', 'closeAgentTab restarts nothing (it is intentional)', async () => {
    const h = newHost();
    await h.start('chatgpt', { show: false, agentId: 'repo-c' });
    const before = created.length;
    h.closeAgentTab('chatgpt', 'repo-c');
    await fireRestarts();
    assert.strictEqual(created.length, before, `${created.length - before} window(s) opened after an intentional close`);
    assert.strictEqual(h.windows.size, 0); assert.strictEqual(h.agentTabs.size, 0);
  });

  await test('OT-04', 'the idle sweep closes an idle agent tab and opens nothing', async () => {
    const h = newHost();
    await h.start('chatgpt', { show: false, agentId: 'repo-d' });
    const before = created.length;
    h._sweepIdleAgentTabs(Date.now() + h.AGENT_IDLE_MS + 1);
    await fireRestarts();
    assert.strictEqual(h.agentTabs.size, 0, 'the idle tab must be closed');
    assert.strictEqual(created.length, before, 'no window may open after an idle close');
  });

  await test('OT-05', 'the LRU cap evicts the oldest agent tab and opens nothing in its place', async () => {
    const h = newHost();
    h.AGENT_TAB_MAX = 2;
    for (const id of ['repo-e1', 'repo-e2', 'repo-e3']) { await h.start('chatgpt', { show: false, agentId: id }); h.agentTabs.get(`chatgpt::${id}`).lastUsed = Date.now() - (id === 'repo-e1' ? 99999 : 0); }
    const before = created.length;
    h._enforceAgentTabCap();
    await fireRestarts();
    assert.strictEqual(h.agentTabs.size, 2);
    assert.ok(!h.agentTabs.has('chatgpt::repo-e1'), 'the least-recently-used tab is the one evicted');
    assert.strictEqual(created.length, before, 'eviction must not reopen anything');
  });

  await test('OT-06', 'unchanged: a shared window that closes unexpectedly still restarts as the shared window', async () => {
    const h = newHost();
    await h.start('chatgpt', {});
    h.windows.get('chatgpt').destroy();
    await fireRestarts();
    assert.strictEqual(h.windows.size, 1, 'the shared window must be restarted');
    assert.strictEqual(h.agentTabs.size, 0, 'and no agent tab invented');
  });

  await test('OT-07', 'unchanged: stop() on the shared window restarts nothing', async () => {
    const h = newHost();
    await h.start('chatgpt', {});
    const before = created.length;
    h.stop('chatgpt');
    await fireRestarts();
    assert.strictEqual(created.length, before);
  });

  console.log(`\n  ${passed} passed \u00B7 ${failed} failed\n`);
  process.exit(failed ? 1 : 0);   // ProviderHost's re-injection interval keeps the loop alive by design
})();
