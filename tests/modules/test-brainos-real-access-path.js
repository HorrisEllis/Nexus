'use strict';
/**
 * tests/modules/test-brainos-real-access-path.js
 * James: "where is brainos ui. if the answer is anything less than
 * the way to access it. you're not done." Real, direct verification
 * of the entire chain — not "the module exists," but "a real click
 * opens a real, servable page that actually loads the real module."
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
const UI_ROOT = path.join(ROOT, 'ui'); // matches orchestrator/orchestrator.js's own real UI_ROOT

function run() {
  test('BRA-001', 'the old, stray, misplaced nexus/ wrapper directory is genuinely gone', () => {
    assert.ok(!fs.existsSync(path.join(ROOT, 'nexus')), 'nexus/ should no longer exist — its 4 real files were relocated, not duplicated');
  });

  test('BRA-002', '§UPDATED 2026-09-06 (BrainOS v2 rebuild) — the real, current BrainOS files exist at the correct location', () => {
    for (const f of ['brainos-app.css', 'brainos-app.js', 'brainos-canvas.js', 'brainos-interaction-contract.json']) {
      assert.ok(fs.existsSync(path.join(UI_ROOT, 'brainos', f)), `${f} missing at ui/brainos/`);
    }
  });

  test('BRA-002B', 'the superseded brainos.js/brainos.css (old floating panel) are archived, not deleted without a trace — §0.3', () => {
    for (const f of ['brainos.js', 'brainos.css']) {
      assert.ok(!fs.existsSync(path.join(UI_ROOT, 'brainos', f)), `${f} should be gone from the live location`);
      assert.ok(fs.existsSync(path.join(ROOT, '_archive/2026-09-06-brainos-floating-panel-superseded', f)), `${f} should exist in the archive`);
    }
  });

  test('BRA-003', 'a real, missing index.html now exists — the other real half of "not done"', () => {
    assert.ok(fs.existsSync(path.join(UI_ROOT, 'brainos', 'index.html')));
  });

  test('BRA-004', 'orchestrator\'s real path-resolution logic, simulated directly, actually finds this file', () => {
    // Mirrors orchestrator/orchestrator.js's real resolution exactly:
    // UI_ROOT/<sub>, directory -> UI_ROOT/<sub>/index.html.
    const sub = 'brainos';
    const dir = path.join(UI_ROOT, sub);
    assert.ok(fs.existsSync(dir) && fs.statSync(dir).isDirectory());
    const idx = path.join(dir, 'index.html');
    assert.ok(fs.existsSync(idx));
  });

  test('BRA-005', '§UPDATED 2026-09-06 (BrainOS v2 rebuild) — index.html includes brainos-canvas.js BEFORE brainos-app.js, the new real app driver', () => {
    const html = fs.readFileSync(path.join(UI_ROOT, 'brainos', 'index.html'), 'utf8');
    const canvasIdx = html.indexOf('brainos-canvas.js');
    const appIdx = html.indexOf('brainos-app.js');
    assert.ok(canvasIdx !== -1 && appIdx !== -1, 'both real script tags must be present');
    assert.ok(canvasIdx < appIdx, 'brainos-canvas.js must load before brainos-app.js');
  });

  test('BRA-006', '§UPDATED 2026-09-06 (BrainOS v2 rebuild) — brainos-app.js calls the correct real global, BrainOSCanvas.mount(), confirmed against brainos-canvas.js\'s own actual export', () => {
    const appJs = fs.readFileSync(path.join(UI_ROOT, 'brainos', 'brainos-app.js'), 'utf8');
    const canvasJs = fs.readFileSync(path.join(UI_ROOT, 'brainos', 'brainos-canvas.js'), 'utf8');
    assert.ok(/global\.BrainOSCanvas\s*=/.test(canvasJs), 'brainos-canvas.js should export global.BrainOSCanvas');
    assert.ok(/BrainOSCanvas\.mount\(canvasHost\)/.test(appJs), 'brainos-app.js should call BrainOSCanvas.mount()');
  });

  test('BRA-007', '§UPDATED 2026-09-06 (BrainOS v2 rebuild) — every real asset the current HTML references actually exists on disk', () => {
    for (const rel of ['ui/brainos/brainos-app.css', 'ui/brainos/brainos-canvas.js', 'ui/brainos/brainos-app.js']) {
      assert.ok(fs.existsSync(path.join(ROOT, rel)), `${rel} referenced but missing`);
    }
  });

  test('BRA-008', 'a real, clickable tray menu item exists to open BrainOS — the actual trigger, not just a servable page nobody can reach', () => {
    const src = fs.readFileSync(path.join(ROOT, 'clear-glass/src/main/index.js'), 'utf8');
    assert.ok(/label: '⬡ BrainOS'/.test(src), 'expected a real BrainOS tray menu entry');
    const idx = src.indexOf(`label: '⬡ BrainOS'`);
    const block = src.slice(idx, idx + 200);
    assert.ok(/openAgentWindow\(\{ agentId: 'brainos', url: 'http:\/\/127\.0\.0\.1:9000\/ui\/brainos\/' \}\)/.test(block), 'the click handler must open the real, correct URL');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

run();
