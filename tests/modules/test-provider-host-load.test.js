'use strict';
/**
 * tests/modules/test-provider-host-load.test.js — §0.39.364
 * James's console, 2026-10-06:
 *   [ProviderHost] claude loadURL failed: ERR_FAILED (-2) loading 'https://claude.ai'
 *   [ProviderHost] claude window spawned → https://claude.ai
 *   [guardian] queued 4ef2d1b4… — waiting for claude userscript        (forever)
 *
 * Runs the REAL ProviderHost; only 'electron' is replaced. Pins: a failed load is retried (the second time after
 * clearing service workers + cache storage, cookies kept); ERR_ABORTED is a redirect, not a failure; a load that keeps
 * failing closes the window, says why (did-fail-load's URL and reason) and is not left 'already-running'.
 */
const assert = require('assert');
const Module = require('module');
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..', '..');

let plan = [];            // what each loadURL does, in order: 'ok' | 'fail' | 'abort'
const cleared = [];
const created = [];
class FakeWin {
  constructor(opts) {
    this.opts = opts; this.h = {}; this.wh = {}; this._d = false;
    const self = this;
    this.webContents = { on: (e, f) => { (self.wh[e] = self.wh[e] || []).push(f); }, removeListener: (e, f) => { self.wh[e] = (self.wh[e] || []).filter(x => x !== f); },
      getURL: () => 'https://claude.ai/new', executeJavaScript: async () => true, setWindowOpenHandler() {}, once() {}, send() {}, session: {} };
    created.push(this);
  }
  on(e, f) { this.h[e] = f; } once(e, f) { this.h[e] = f; }
  isDestroyed() { return this._d; }
  destroy() { if (this._d) return; this._d = true; this.h.closed && this.h.closed(); }
  loadURL(url) {
    const step = plan.shift() || 'ok';
    if (step === 'ok') return Promise.resolve();
    if (step === 'abort') return Promise.reject(new Error(`ERR_ABORTED (-3) loading '${url}'`));
    for (const f of this.wh['did-fail-load'] || []) f({}, -2, 'ERR_FAILED', 'https://claude.ai/login?returnTo=%2Fnew', true);
    return Promise.reject(new Error(`ERR_FAILED (-2) loading '${url}'`));
  }
  show() {} hide() {} isVisible() { return false; } setTitle() {}
}
const fakeSession = { webRequest: { onHeadersReceived() {}, onBeforeSendHeaders() {} }, on() {}, removeListener() {}, setPermissionRequestHandler() {}, setUserAgent() {}, getUserAgent: () => 'ua',
  clearStorageData: async (o) => { cleared.push(o); } };
const electron = { BrowserWindow: FakeWin, session: { fromPartition: () => fakeSession, defaultSession: fakeSession }, app: { getPath: () => require('os').tmpdir(), on() {} } };
const _ml = Module._load;
Module._load = function (req, ...a) { return req === 'electron' ? electron : _ml.call(this, req, ...a); };
// the retry waits (2 s, 6 s) run at once; the 30 s still-loading cap and the 5 s restarts never fire in this test
const _st = global.setTimeout;
global.setTimeout = (fn, ms, ...a) => (ms === 2000 || ms === 6000 ? _st(fn, 0, ...a) : ms >= 5000 ? { unref() {}, ref() {} } : _st(fn, ms, ...a));
const _ct = global.clearTimeout;
global.clearTimeout = (t) => { if (t && typeof t === 'object' && !t.hasRef) return; _ct(t); };

const ProviderHost = require(path.join(ROOT, 'clear-glass/src/providers/host.js'));
const events = [];
const newHost = () => { created.length = 0; cleared.length = 0; events.length = 0; const h = new ProviderHost({ guardianDir: path.join(ROOT, 'guardian'), postEvent: (t, d) => events.push({ t, d }) }); h._inject = async () => {}; return h; };
const warn = console.warn; const log = console.log;

let passed = 0, failed = 0;
async function test(id, d, fn) { console.warn = () => {}; console.log = () => {}; let err = null; try { await fn(); } catch (e) { err = e; } console.warn = warn; console.log = log; if (!err) { console.log(`  ✓ ${id} ${d}`); passed++; } else { console.error(`  ✗ ${id} ${d}\n    ${err.message}`); failed++; } }

(async () => {
  console.log('\n⬡  PROVIDER HOST — a tab that does not load is retried, then said so\n');

  await test('PL-01', 'one ERR_FAILED, then a load: started, after clearing service workers + cache (cookies kept)', async () => {
    const h = newHost(); plan = ['fail', 'ok'];
    const r = await h.start('claude', { show: false });
    assert.strictEqual(r.status, 'started');
    assert.strictEqual(cleared.length, 1);
    assert.deepStrictEqual(cleared[0].storages.sort(), ['cachestorage', 'serviceworkers']);
    assert.ok(h.windows.has('claude'));
  });

  await test('PL-02', 'ERR_ABORTED (a redirect replacing the first navigation) is not a failure', async () => {
    const h = newHost(); plan = ['abort'];
    const r = await h.start('claude', { show: false });
    assert.strictEqual(r.status, 'started'); assert.strictEqual(cleared.length, 0);
  });

  await test('PL-03', 'three failures: failed, with did-fail-load\'s URL and reason; the window is closed, not left to say already-running', async () => {
    const h = newHost(); plan = ['fail', 'fail', 'fail'];
    const r = await h.start('claude', { show: false });
    assert.strictEqual(r.ok, false); assert.strictEqual(r.status, 'failed');
    assert.ok(/ERR_FAILED \(-2\) at https:\/\/claude\.ai\/login/.test(r.error), r.error);
    assert.strictEqual(r.failures.length, 3);
    assert.ok(!h.windows.has('claude'), 'the dead window must not stay in the map');
    assert.ok(created[0].isDestroyed());
    assert.ok(events.some(e => e.t === 'provider.host.load_failed'), 'the failure is posted as an event');
    plan = ['ok'];
    const again = await h.start('claude', { show: false });
    assert.strictEqual(again.status, 'started', 'the next start begins clean, not already-running');
  });

  await test('PL-04', 'an agent tab that fails to load is removed from the agent tabs', async () => {
    const h = newHost(); plan = ['fail', 'fail', 'fail'];
    const r = await h.start('claude', { show: false, agentId: 'repo-x' });
    assert.strictEqual(r.status, 'failed'); assert.ok(!h.agentTabs.has('claude::repo-x'));
  });

  await test('PL-05', 'guardian reads the start answer and fails the jobs queued for a tab that did not load', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'guardian/lib/dispatcher.js'), 'utf8');
    assert.ok(/d\.status !== 'failed'/.test(src) && /pendingQueue\.get\(job\.provider\) \|\| \[\]\)\.splice\(0\)/.test(src) && /tabLoadFailed: true/.test(src));
    assert.ok(/timeout: 90000/.test(src), 'the start request waits long enough for the retries');
  });

  console.log(`\n  ${passed} passed · ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
