'use strict';
// Minimal, real, structural test — token-conscious pass. James: real
// external page title/url (browsing history) reached innerHTML
// unescaped in clear-glass/renderer/browser.js, same real class of bug
// already proven in BrainOS this session.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '../../clear-glass/renderer/browser.js'), 'utf8');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}
test('CGB-001', 'the real history-item render escapes title/url/label before innerHTML', () => {
  const idx = SRC.indexOf('class="ri-title"');
  const around = SRC.slice(Math.max(0, idx - 400), idx + 100);
  assert.ok(/_eh\(s\.title \|\| s\.url\)/.test(around), 'title/url interpolation is no longer escaped');
});
const MESH_SRC = fs.readFileSync(path.join(__dirname, '../../clear-glass/renderer/mesh-picker.js'), 'utf8');
test('CGB-002', 'the real mesh-picker node render escapes label/status/kind before innerHTML', () => {
  assert.ok(/title="\$\{_eh\(n\.label\)\}"/.test(MESH_SRC), 'mesh-picker\'s title attribute interpolation is no longer escaped');
  assert.ok(/\$\{_eh\(n\.status\)\}/.test(MESH_SRC), 'mesh-picker\'s status class interpolation is no longer escaped');
});
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
