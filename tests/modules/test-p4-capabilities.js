'use strict';
// §P4 slice — co-pilot answers "what can you do?" with its REAL toolbox from loom.
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
function test(id, desc, fn) { try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; } }
const cap = require(path.join(__dirname, '../..', 'copilot/lib/capabilities'));

test('T-001', 'whatCanIDo returns real capabilities grouped by system', () => {
  const r = cap.whatCanIDo();
  assert.ok(r.total > 50, `expected many capabilities, got ${r.total}`);
  assert.ok(r.systemCount >= 5, 'multiple systems');
  assert.ok(r.text.includes('capabilities'), 'has a human summary');
});
test('T-002', 'only served capabilities are advertised (§1.1 — no phantom tools)', () => {
  const all = cap.whatCanIDo({ servedOnly: true });
  const withUnserved = cap.whatCanIDo({ servedOnly: false });
  assert.ok(all.total <= withUnserved.total, 'served-only is a subset');
});
test('T-003', 'capabilitiesForSystem returns one system\'s toolbox', () => {
  const r = cap.capabilitiesForSystem('cortex');
  assert.ok(r.count > 0, 'cortex has capabilities');
  assert.ok(r.text.includes('cortex'));
});
test('T-004', 'unknown system degrades honestly', () => {
  const r = cap.capabilitiesForSystem('nonexistent-xyz');
  assert.strictEqual(r.count, 0);
  assert.ok(r.text.includes('No verified'));
});
console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
