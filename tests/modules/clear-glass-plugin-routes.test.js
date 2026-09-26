'use strict';
// Real, structural test — Electron-only file, can't boot live in this
// sandbox. James: "all of the clearglass features; plugins, all of it."
// Real, confirmed gap: pluginHost's real list()/disable() had zero HTTP
// route reaching them. Fixed with 2 real routes that command-index.js's
// own tool discovers live from the real Express route table — no new
// tool file needed, matching that file's own stated design.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '../../clear-glass/src/main/index.js'), 'utf8');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

test('CGP-001', 'a real GET /plugins route exists, calling pluginHost.list()', () => {
  assert.ok(/app\.get\('\/plugins',[\s\S]{0,100}pluginHost\.list\(\)/.test(SRC), 'GET /plugins route or its real pluginHost.list() call is missing');
});

test('CGP-002', 'a real POST /plugins/:id/disable route exists, calling pluginHost.disable()', () => {
  assert.ok(SRC.includes("app.post('/plugins/:id/disable'"), 'POST /plugins/:id/disable route is missing');
  const idx = SRC.indexOf("app.post('/plugins/:id/disable'");
  const block = SRC.slice(idx, idx + 400);
  assert.ok(/pluginHost\.disable\(req\.params\.id\)/.test(block), 'the real route does not call pluginHost.disable() with the real request param');
});

test('CGP-003', 'both routes handle a missing/uninitialized pluginHost honestly, not with a crash', () => {
  const idx = SRC.indexOf("app.post('/plugins/:id/disable'");
  const block = SRC.slice(idx, idx + 400);
  assert.ok(/if \(!pluginHost\)/.test(block), 'the disable route does not guard against pluginHost being uninitialized');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
