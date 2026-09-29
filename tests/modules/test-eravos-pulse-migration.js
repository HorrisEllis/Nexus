'use strict';
/**
 * tests/modules/test-eravos-pulse-migration.js — PULSE_ALL_2026-09-06
 * Verifies eravos/server.js's real fix: register() used to be a
 * hand-rolled http.request() with retry-on-failure only, never an
 * ongoing heartbeat after a successful register. Now uses nexus-
 * connect.js's real nc2.registerWithOrchestrator + nc2.startHeartbeat.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

function run() {
  const src = fs.readFileSync(path.join(__dirname, '../../eravos/server.js'), 'utf8');

  test('ER-001', 'eravos/server.js now requires nexus-connect.js', () => {
    assert.ok(/require\(['"]\.\.\/(nexus\/)?nexus-connect['"]\)/.test(src));   // §0.39.282 nexus-connect.js lives in nexus/ now
  });

  test('ER-002', 'the old hand-rolled register() body (raw http.request to /api/register, retry-on-error-only) is gone', () => {
    const fnStart = src.indexOf('function register()');
    const fnEnd = src.indexOf('\n}', fnStart) + 2;
    const fnBody = src.slice(fnStart, fnEnd);
    assert.ok(!/path:\s*u\.pathname/.test(fnBody) && !/setTimeout\(register, 5000\)/.test(fnBody));
  });

  test('ER-003', 'register() now calls the real nc2.registerWithOrchestrator with the real SYSTEM_ID/PORT', () => {
    const fnStart = src.indexOf('function register()');
    const fnEnd = src.indexOf('\n}', fnStart) + 2;
    const fnBody = src.slice(fnStart, fnEnd);
    assert.ok(/nc2\.registerWithOrchestrator\(\s*SYSTEM_ID,\s*PORT/.test(fnBody));
  });

  test('ER-004', 'register() now calls nc2.startHeartbeat — the real ongoing-heartbeat gap this fix closes', () => {
    const fnStart = src.indexOf('function register()');
    const fnEnd = src.indexOf('\n}', fnStart) + 2;
    const fnBody = src.slice(fnStart, fnEnd);
    assert.ok(/nc2\.startHeartbeat\(\s*SYSTEM_ID,\s*PORT\s*\)/.test(fnBody));
  });

  test('ER-005', 'ORCH_URL is genuinely gone — confirmed dead after the fix', () => {
    assert.ok(!/ORCH_URL/.test(src));
  });

  test('ER-006', 'the real http module is still required — still genuinely used by eravos\'s own real server.createServer, not accidentally left as clutter', () => {
    assert.ok(/http\.createServer/.test(src));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

run();
