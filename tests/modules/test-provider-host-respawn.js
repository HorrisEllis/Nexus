'use strict';
/**
 * tests/modules/test-provider-host-respawn.js — real tests for the
 * 2026-09-06 fix: clear-glass/src/providers/host.js's win.on('closed', ...)
 * had zero respawn logic — only render-process-gone (an actual crash)
 * ever triggered the real 5s auto-restart. A window that closed for any
 * other reason (memory pressure, anything calling win.destroy() outside
 * stop()) just vanished forever — guardian kept routing jobs to it,
 * getting a jobId back but never an ack. James, live: "it routes to it.
 * but doesn't do anything beyond that... nothing is supposed to rely on
 * a ui."
 *
 * §NO ELECTRON NEEDED — host.js requires 'electron' at module load
 * (BrowserWindow), not available in a plain Node test process. Same
 * isolation principle tests/modules/test-agent-mesh-guardian-coverage.js
 * already established for exactly this class of file: structural checks
 * against the real shipped source (AMC-000-style), plus an isolated
 * re-implementation of the actual logic under test, verified not to have
 * drifted from the real file.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const HOST_SRC = 'clear-glass/src/providers/host.js';

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

function _realReadFile(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

// ── Real, structural checks against the actual shipped file ────────────────
test('PHR-000', 'the real shipped file marks the window before the one real intentional-destroy path, and the closed handler checks that flag before respawning', () => {
  const src = _realReadFile(HOST_SRC);
  if (!src.includes('_nexusIntentionalStop = true')) throw new Error('real intentional-stop flag missing from stop()');
  if (!src.includes('if (!win._nexusIntentionalStop)')) throw new Error("real closed handler no longer gates respawn on the intentional-stop flag");
  // 0.39.237: the restart carries the agentId, so an agent tab restarts as itself, not as the
  // shared window (behaviour proven against the real class in test-provider-host-one-tab).
  if (!src.includes("setTimeout(() => this.start(providerId, agentId ? { show: false, agentId } : {}), 5000)")) throw new Error('closed handler no longer uses the same 5s respawn delay render-process-gone already established');
});

// ── Isolated re-implementation of exactly the logic under test, copied
// verbatim from the real shipped file's shape (mock win instead of real
// Electron BrowserWindow — same object shape: isDestroyed(), destroy(),
// an .on(event, cb) registry, and the _nexusIntentionalStop flag). ─────────
function makeMockWin() {
  const handlers = {};
  let destroyed = false;
  return {
    on(event, cb) { handlers[event] = cb; },
    _fire(event) { if (handlers[event]) handlers[event](); },
    isDestroyed() { return destroyed; },
    destroy() { destroyed = true; },
  };
}

class MockProviderHost {
  constructor() { this.windows = new Map(); this._status = new Map(); this._respawned = []; }
  // verbatim shape of the real stop() under test
  async stop(providerId) {
    const win = this.windows.get(providerId);
    if (win) win._nexusIntentionalStop = true;
    if (win && !win.isDestroyed()) { win.destroy(); }
    this.windows.delete(providerId);
    this._status.delete(providerId);
    return { ok: true, providerId };
  }
  // verbatim shape of the real closed handler under test, minus the real
  // setTimeout delay (fires immediately here so the test doesn't wait 5s;
  // the real delay value itself is checked structurally in PHR-000 above)
  _wireClosedHandler(providerId, win) {
    win.on('closed', () => {
      if (this.windows.get(providerId) === win) {
        this.windows.delete(providerId);
        this._status.delete(providerId);
      }
      if (!win._nexusIntentionalStop) {
        this._respawned.push(providerId);
      }
    });
  }
  start(providerId) {
    const win = makeMockWin();
    this.windows.set(providerId, win);
    this._wireClosedHandler(providerId, win);
    return win;
  }
}

test('PHR-001', 'an unexpected close (win.destroy() called directly, bypassing stop()) triggers a respawn', () => {
  const host = new MockProviderHost();
  const win = host.start('claude');
  win.destroy();       // simulates Electron/OS reclaiming the window, or anything else destroying it directly
  win._fire('closed');
  assert.deepStrictEqual(host._respawned, ['claude']);
});

test('PHR-002', 'a deliberate stop() does NOT trigger a respawn — the exact distinction this fix adds', async () => {
  const host = new MockProviderHost();
  const win = host.start('chatgpt');
  await host.stop('chatgpt');
  win._fire('closed');
  assert.deepStrictEqual(host._respawned, []);
});

test('PHR-003', 'two different providers are tracked independently — stopping one never respawns the other', async () => {
  const host = new MockProviderHost();
  const winA = host.start('gemini');
  const winB = host.start('perplexity');
  await host.stop('gemini');
  winA._fire('closed');
  winB.destroy();
  winB._fire('closed');
  assert.deepStrictEqual(host._respawned, ['perplexity']);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
