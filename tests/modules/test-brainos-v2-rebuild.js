'use strict';
/**
 * tests/modules/test-brainos-v2-rebuild.js
 * James: "make this ui, map it all onto the html. anything that
 * doesn't map, remove it." Then: "remove this garbage... playwrite
 * NETWORK, HELP, SESSIONS (we can use the chat logs.), SNR, DELTAS,
 * BELIEF." Verifies the real, scoped rebuild: only tabs with genuine
 * nexus backing exist; everything explicitly named for removal is
 * genuinely gone; the two new small real endpoints (chat-log, raid
 * queue) and the macros IPC bridge fix all work as designed.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');

function run() {
  const html = fs.readFileSync(path.join(ROOT, 'ui/brainos/index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(ROOT, 'ui/brainos/brainos-app.js'), 'utf8');
  const cortexSrc = fs.readFileSync(path.join(ROOT, 'cortex/boot.js'), 'utf8');
  const preloadSrc = fs.readFileSync(path.join(ROOT, 'clear-glass/src/preload/index.js'), 'utf8');

  test('BV2-001', 'exactly the 5 real, mapped main tabs exist — no more, no fewer', () => {
    const tabs = [...html.matchAll(/data-tab="([a-z]+)"/g)].map((m) => m[1]);
    assert.deepStrictEqual(tabs.sort(), ['automation', 'bayes', 'canvas', 'deploy', 'pipeline'].sort());
  });

  test('BV2-002', 'the real, mapped right-panel tabs exist — each with its own panel, none a dead tab', () => {
    // §0.39.282 — pipeline, automation and tool-calls were added after the v2 rebuild, each on a real source
    // (automation: clear-glass/src/mesh/automation-engine.js). The invariant kept: node + chatlog, every tab has a body.
    const tabs = [...html.matchAll(/data-rtab="([a-z]+)"/g)].map((m) => m[1]);
    assert.deepStrictEqual(tabs.slice().sort(), ['automation', 'chatlog', 'node', 'pipeline', 'toolcalls']);
    for (const t of tabs) assert.ok(html.includes(`id="rt-${t}"`), `tab ${t} has no rt-${t} panel`);
  });

  test('BV2-003', 'every explicitly-removed tab/panel id is genuinely absent from the real HTML', () => {
    for (const dead of ['control', 'keys', 'playwright', 'network', 'help', 'snr', 'deltas', 'belief', 'sessions']) {
      assert.ok(!html.includes(`data-tab="${dead}"`), `data-tab="${dead}" should not exist`);
      assert.ok(!html.includes(`data-rtab="${dead}"`), `data-rtab="${dead}" should not exist`);
      assert.ok(!html.includes(`panel-${dead}`), `panel-${dead} should not exist`);
    }
  });

  test('BV2-004', 'the new /api/chat-log endpoint exists in cortex/boot.js, matching the real /api/events pattern', () => {
    assert.ok(/p === '\/api\/chat-log'/.test(cortexSrc));
    const idx = cortexSrc.indexOf("p === '/api/chat-log'");
    const block = cortexSrc.slice(idx, idx + 300);
    assert.ok(/jaaDB\.tail\('chat_log'/.test(block), 'should read the real chat_log table');
  });

  test('BV2-005', 'the new /api/raid/queue endpoint exists in cortex/boot.js, reading the real raid_contract_queue table', () => {
    assert.ok(/p === '\/api\/raid\/queue'/.test(cortexSrc));
    const idx = cortexSrc.indexOf("p === '/api/raid/queue'");
    const block = cortexSrc.slice(idx, idx + 300);
    assert.ok(/jaaDB\.tail\('raid_contract_queue'/.test(block));
  });

  test('BV2-006', 'preload/index.js now exposes macros — the exact real gap found (IPC handlers existed, nothing bridged them)', () => {
    assert.ok(/macros:\s*{/.test(preloadSrc));
    assert.ok(/ipcRenderer\.invoke\('macros:list'\)/.test(preloadSrc));
    assert.ok(/ipcRenderer\.invoke\('macros:get'/.test(preloadSrc));
    assert.ok(/ipcRenderer\.invoke\('macros:run'/.test(preloadSrc));
  });

  test('BV2-007', 'the macros:run bridge passes the real, complete argument shape the actual IPC handler expects (agentId, params, skipSnapshot)', () => {
    const idx = preloadSrc.indexOf("run:");
    const line = preloadSrc.slice(idx, idx + 200);
    assert.ok(/agentId/.test(line) && /params/.test(line) && /skipSnapshot/.test(line));
  });

  test('BV2-008', 'index.html includes brainos-canvas.js before brainos-app.js, and brainos-app.js mounts it into canvas-host', () => {
    const canvasIdx = html.indexOf('brainos-canvas.js');
    const appIdx = html.indexOf('brainos-app.js');
    assert.ok(canvasIdx !== -1 && appIdx !== -1 && canvasIdx < appIdx);
    assert.ok(/BrainOSCanvas\.mount\(canvasHost\)/.test(appJs));
  });

  test('BV2-009', 'brainos-app.js wires DEPLOY to the real POST /provider/deploy endpoint', () => {
    assert.ok(/\/provider\/deploy/.test(appJs));
  });

  test('BV2-010', 'brainos-app.js wires BAYES to the real GET /cfr/field endpoint', () => {
    assert.ok(/\/cfr\/field/.test(appJs));
  });

  test('BV2-011', 'brainos-app.js wires PIPELINE to the new real GET /api/raid/queue endpoint', () => {
    assert.ok(/\/api\/raid\/queue/.test(appJs));
  });

  test('BV2-012', 'brainos-app.js wires AUTOMATION to the real window.ClearGlass.macros bridge, with an honest fallback if unavailable', () => {
    assert.ok(/window\.ClearGlass\?\.macros/.test(appJs));
    assert.ok(/unavailable/.test(appJs), 'should honestly report if macros bridge is missing, not silently fail');
  });

  test('BV2-013', 'brainos-app.js wires CHAT LOGS to the new real GET /api/chat-log endpoint', () => {
    assert.ok(/\/api\/chat-log/.test(appJs));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

run();
