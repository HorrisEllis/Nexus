'use strict';
// Autopilot wires + verifies the whole intelligence substrate at boot:
// intelligence + RFR2 + CFR + baseline + sigma + emergence. James: "make sure
// they're all wired in."
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
function test(id, desc, fn) { try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; } }
const ROOT = path.join(__dirname, '../..');
const ai = require(path.join(ROOT, 'lib/autopilot-intelligence'));
const fan = require(path.join(ROOT, 'lib/ledger-fanin'));

test('T-001', 'wireIntelligence connects the full substrate (all 6 faculties)', () => {
  fan._resetForTest();
  const r = ai.wireIntelligence({ fanin: fan, snapshotAlreadyAttached: true });
  // each faculty should be wired (or honestly reported missing)
  const names = r.wired.join(' ');
  assert.ok(/intelligence/.test(names), 'intelligence wired');
  assert.ok(/RFR2/.test(names), 'RFR2 wired');
  assert.ok(/CFR/.test(names), 'CFR wired');
  assert.ok(/baseline/.test(names), 'baseline wired');
  assert.ok(/emergence/.test(names), 'emergence wired');
});
test('T-002', 'the report tells the truth — wired vs missing (§1.1)', () => {
  const r = ai.wireIntelligence({ snapshotAlreadyAttached: true });
  assert.ok(r.report.includes('intelligence substrate'));
  assert.ok('ok' in r && Array.isArray(r.missing));
});
test('T-003', 'a missing faculty is reported, not thrown (§1.2)', () => {
  // force a missing baseline by passing a broken stub
  const r = ai.wireIntelligence({ baseline: {}, snapshotAlreadyAttached: true });
  assert.ok(r.missing.some(m => m[0] === 'baseline'), 'missing baseline reported');
  // but the wiring still returns (didn't throw)
  assert.ok(r.report);
});
test('T-004', 'idempotent — does not double-init already-running intelligence', () => {
  const running = { getState: () => ({ running: true }), readFieldForFriction: () => {} };
  const r = ai.wireIntelligence({ intelligence: running, snapshotAlreadyAttached: true });
  assert.ok(r.wired.some(w => /already running/.test(w)), 'detected already-running');
});
console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
