'use strict';
// Lifeline ask-first (James: "have co-pilot ask me if I want to use lifeline").
// When askBeforeEscalate is set, a low-confidence Ollama answer returns an OFFER
// (offer_lifeline) rather than auto-escalating to Guardian — the user decides
// (§0.4 in control). The auto path is preserved when the flag is off.
const assert = require('assert');
const path = require('path');
const fs = require('fs');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
const SRC = fs.readFileSync(path.join(ROOT, 'copilot/lifeline.js'), 'utf8');

test('T-001', 'an askBeforeEscalate branch exists in route()', () => {
  assert.ok(/opts\.askBeforeEscalate/.test(SRC), 'route must check askBeforeEscalate');
});

test('T-002', 'ask-first returns an offer flag (offer_lifeline) instead of escalating', () => {
  assert.ok(/offer_lifeline: true/.test(SRC), 'must return offer_lifeline when asking');
  // the offer branch must return BEFORE the auto _tryGuardian escalation
  const offerIdx = SRC.indexOf('offer_lifeline: true');
  const autoIdx = SRC.indexOf('auto-escalate to Guardian');
  assert.ok(offerIdx < autoIdx, 'the offer must return before the auto-escalation runs');
});

test('T-003', 'the offer explains WHY (confidence below threshold) — legible (§16.2)', () => {
  assert.ok(/offer_reason/.test(SRC), 'must include an offer_reason');
  assert.ok(/below/.test(SRC), 'the reason states the confidence is below threshold');
});

test('T-004', 'the AUTO escalation path is preserved (nothing breaks when the flag is off, §0.4)', () => {
  assert.ok(/auto-escalate to Guardian/.test(SRC), 'the auto path must still exist');
  // both the offer branch and the auto _tryGuardian call are present
  assert.ok(/_tryGuardian\(prompt, \{ \.\.\.opts, requestId \}\)/.test(SRC), 'auto-escalate still calls guardian');
});

test('T-005', 'the offered result is persisted with its own reason tag (auditable, §17.6)', () => {
  assert.ok(/'lifeline_offered'/.test(SRC), 'the offer must be persisted distinctly');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
