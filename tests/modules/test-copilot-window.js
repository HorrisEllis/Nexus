'use strict';
// cli/copilot-window.js — open the co-pilot CLI in a new terminal window,
// connected to every system through co-pilot. §8.6 built outward from
// cli/boot-systems.js's cross-platform new-window spawn.
const assert = require('assert');
const path = require('path');
const fs = require('fs');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
const mod = require(path.join(ROOT, 'cli/copilot-window'));

test('T-001', 'exposes openCopilotWindow', () => {
  assert.strictEqual(typeof mod.openCopilotWindow, 'function');
});

test('T-002', 'targets the CONSOLIDATED co-pilot CLI (copilot/cli.js)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'cli/copilot-window.js'), 'utf8');
  assert.ok(/copilot['"]?\s*,\s*['"]cli\.js|copilot\/cli\.js|'copilot', 'cli\.js'/.test(src), 'must launch copilot/cli.js');
  assert.ok(fs.existsSync(path.join(ROOT, 'copilot/cli.js')), 'the target CLI must exist');
});

test('T-003', 'handles all three platforms (win/mac/linux)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'cli/copilot-window.js'), 'utf8');
  assert.ok(/win32/.test(src) && /powershell/.test(src), 'Windows path');
  assert.ok(/darwin/.test(src) && /osascript/.test(src), 'macOS path');
  assert.ok(/x-terminal-emulator|gnome-terminal|xterm/.test(src), 'Linux path');
});

test('T-004', 'falls back loudly to inline, never silently fails (§1.2)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'cli/copilot-window.js'), 'utf8');
  assert.ok(/_runInline/.test(src), 'must have an inline fallback');
  assert.ok(/no terminal|running inline|running the co-pilot CLI in this window/i.test(src), 'must warn on fallback');
});

test('T-005', '/window and /w are wired into the unified nexus dispatcher', () => {
  const nx = fs.readFileSync(path.join(ROOT, 'cli/nexus.js'), 'utf8');
  assert.ok(/cmd === '\/window' \|\| cmd === '\/w'/.test(nx), '/window + /w must be dispatched');
  assert.ok(/openCopilotWindow/.test(nx), 'the dispatcher must call the launcher');
});

test('T-006', 'the co-pilot CLI is consolidated — it IS the /copilot dispatcher entry (one CLI, not many)', () => {
  const nx = fs.readFileSync(path.join(ROOT, 'cli/nexus.js'), 'utf8');
  assert.ok(/'\/copilot':\s*path\.join\(ROOT, 'copilot\/cli\.js'\)/.test(nx), '/copilot must map to copilot/cli.js');
  assert.ok(/'\/cp':/.test(nx), '/cp alias must exist');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
