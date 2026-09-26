'use strict';
// Real, structural test — Electron-only files. James: "make sure the
// guardian plugin / element picker is wired in fully and works end to
// end." Real, confirmed gap: guardian-picker.js's captureCookies()
// showed a real, successful "🍪 cookies captured" toast, but
// ipc/bridge.js had zero handler for guardian.cookies.capture at all
// — silently, completely lost, while the UI claimed success.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const BRIDGE_SRC = fs.readFileSync(path.join(__dirname, '../../clear-glass/src/ipc/bridge.js'), 'utf8');
const PICKER_SRC = fs.readFileSync(path.join(__dirname, '../../clear-glass/renderer/guardian-picker.js'), 'utf8');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

test('CGC-001', 'ipc/bridge.js now has a real handler for guardian.cookies.capture', () => {
  assert.ok(BRIDGE_SRC.includes("d.type === 'guardian.cookies.capture'"), 'the real handler branch is missing');
});

test('CGC-002', 'the real toast in guardian-picker.js no longer claims full success it cannot back up', () => {
  assert.ok(!PICKER_SRC.includes("showToast('🍪 cookies captured')"), 'the old, overclaiming toast text is still present');
  assert.ok(PICKER_SRC.includes('logged — real storage not yet built'), 'the real, honest toast text is missing');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
