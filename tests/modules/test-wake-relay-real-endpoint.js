'use strict';
/**
 * tests/modules/test-wake-relay-real-endpoint.js
 * James, from a live log: "[wake-relay] no answer available for chatgpt
 * (guardian and mesh both failed/unavailable)" — the exact old symptom.
 * wake-relay.js had regressed to the old, removed guardian:7820/
 * copilot/prompt route (a real fix from earlier this session that never
 * made it into either real git lineage — it was only ever delivered as
 * standalone files). Verifies the real, current, correct target.
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
  const wakeRelay = fs.readFileSync(path.join(ROOT, 'clear-glass/src/copilot/wake-relay.js'), 'utf8');
  const mainIndex = fs.readFileSync(path.join(ROOT, 'clear-glass/src/main/index.js'), 'utf8');

  test('WR-001', 'wake-relay.js targets the real, current copilot /bridge/deliver endpoint', () => {
    assert.ok(/path: '\/bridge\/deliver'/.test(wakeRelay));
  });

  test('WR-002', 'the old, removed guardian:7820/copilot/prompt route is genuinely gone', () => {
    assert.ok(!/path: '\/copilot\/prompt'/.test(wakeRelay));
  });

  test('WR-003', 'the real request body matches /bridge/deliver\'s actual expected shape ({request:{uuid,payload}})', () => {
    assert.ok(/request:\s*{\s*uuid:.*payload:\s*{\s*prompt:/s.test(wakeRelay) || /request: \{ uuid:/.test(wakeRelay));
  });

  test('WR-004', 'main/index.js passes mesh into startWakeRelay — the real fallback path is genuinely wired, not silently dropped', () => {
    assert.ok(/startWakeRelay\(providerHost, \{[\s\S]{0,40}mesh,/.test(mainIndex));
  });

  // §BUILT 2026-09-11 — James: "wake word needs to create a job using
  // guardian to simulate input from user into the provider chat...
  // create a job in guardian so nexus can respond to the provider."
  test('WR-005', 'wake-relay.js dispatches the real answer to guardian\'s real /command job endpoint', () => {
    assert.ok(/path: '\/command'/.test(wakeRelay));
  });

  test('WR-006', 'the guardian dispatch uses a registered RAID contract source (copilot), not an unregistered one that would 403', () => {
    assert.ok(/source: 'copilot'/.test(wakeRelay));
  });

  test('WR-007', 'main/index.js wires the real, shared NEXUS_PORTS.guardian into wake-relay instead of a second hardcoded default', () => {
    assert.ok(/guardianPort:\s*NEXUS_PORTS\.guardian/.test(mainIndex));
  });

  test('WR-008', 'the old overlay-only injectAnswer path is now a fallback, not the primary answer path', () => {
    assert.ok(/dispatchToGuardian\(d\.agent, text(?:, \{[^)]*\})?\)/.test(wakeRelay) && /fallback/i.test(wakeRelay));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

run();
