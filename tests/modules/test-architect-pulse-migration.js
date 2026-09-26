'use strict';
/**
 * tests/modules/test-architect-pulse-migration.js — PULSE_ALL_2026-09-06
 * Verifies architect/service.js's real fix: registerWithOrchestrator()
 * used to be a fully separate, hand-rolled http.request() call with no
 * ongoing heartbeat of any kind. Now uses nexus-connect.js's real
 * nc2.registerWithOrchestrator + nc2.startHeartbeat (which wraps the real
 * orchestrator/lib/pulse.js createPulse() internally — confirmed directly
 * in nexus-connect.js itself, not assumed).
 *
 * Structural verification against the real source (same pattern already
 * established this session for agent-mesh.js and the system registry),
 * since architect/service.js's own module-scope code opens real network
 * listeners and isn't safe to require() directly in a test process.
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
  const src = fs.readFileSync(path.join(__dirname, '../../architect/service.js'), 'utf8');

  test('AP-001', 'architect/service.js now requires nexus-connect.js', () => {
    assert.ok(/require\(['"]\.\.\/nexus\/nexus-connect['"]\)/.test(src), 'expected a real require of ../nexus/nexus-connect');
  });

  test('AP-002', 'the old hand-rolled duplicate registration call (raw http.request to /api/register) is gone from registerWithOrchestrator', () => {
    const fnStart = src.indexOf('function registerWithOrchestrator');
    const fnEnd = src.indexOf('\n}', fnStart) + 2;
    const fnBody = src.slice(fnStart, fnEnd);
    assert.ok(!/path:\s*['"]\/api\/register['"]/.test(fnBody), 'old duplicate /api/register raw HTTP call should be gone from this function');
  });

  test('AP-003', 'registerWithOrchestrator now calls the real nc2.registerWithOrchestrator', () => {
    const fnStart = src.indexOf('function registerWithOrchestrator');
    const fnEnd = src.indexOf('\n}', fnStart) + 2;
    const fnBody = src.slice(fnStart, fnEnd);
    assert.ok(/nc2\.registerWithOrchestrator\(/.test(fnBody));
  });

  test('AP-004', 'registerWithOrchestrator now calls nc2.startHeartbeat — the real gap (zero ongoing heartbeat) this fix closes', () => {
    const fnStart = src.indexOf('function registerWithOrchestrator');
    const fnEnd = src.indexOf('\n}', fnStart) + 2;
    const fnBody = src.slice(fnStart, fnEnd);
    assert.ok(/nc2\.startHeartbeat\(\s*['"]architect['"]/.test(fnBody), 'expected nc2.startHeartbeat(\'architect\', ...) in the fixed function');
  });

  test('AP-005', 'ORCH_PORT is genuinely gone — confirmed dead after the fix, not left as clutter', () => {
    assert.ok(!/ORCH_PORT/.test(src), 'ORCH_PORT should have been removed entirely once nothing referenced it');
  });

  test('AP-006', 'nexus-connect.js\'s real startHeartbeat genuinely uses createPulse() internally — the actual claim this whole fix rests on, checked directly rather than assumed', () => {
    const ncSrc = fs.readFileSync(path.join(__dirname, '../../nexus/nexus-connect.js'), 'utf8');
    const fnStart = ncSrc.indexOf('function startHeartbeat');
    assert.ok(fnStart !== -1, 'startHeartbeat function not found in nexus-connect.js');
    const fnEnd = ncSrc.indexOf('\n}', fnStart) + 2;
    const fnBody = ncSrc.slice(fnStart, fnEnd);
    assert.ok(/createPulse/.test(fnBody), 'startHeartbeat should genuinely use createPulse internally');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

run();
