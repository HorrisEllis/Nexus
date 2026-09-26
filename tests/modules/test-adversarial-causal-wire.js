'use strict';
// Pins the causal wire in copilot/adversarial.js (2026-07-25). The emit path is
// live HTTP (_writeToCortex POSTs to cortex), so a clean in-process mock would
// be brittle; this asserts the wire at the source, the same durable approach
// used for jaa selective-load. If someone removes the causedBy link, this fails.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const src = fs.readFileSync(path.join(__dirname, '../../copilot/adversarial.js'), 'utf8');

test('T-001', '_writeToCortex accepts a causedBy parameter and writes it to the row', () => {
  assert.ok(/_writeToCortex\(type,\s*payload,\s*causedBy\s*=\s*null\)/.test(src),
    '_writeToCortex must accept causedBy');
  assert.ok(/uuid:\s*crypto\.randomUUID\(\),\s*type,\s*source:\s*'copilot\.adversarial',\s*\n?\s*payload,\s*causedBy,/.test(src.replace(/\s+/g, ' ')) ||
            /payload,\s*causedBy,\s*ts/.test(src),
    'the event row must include causedBy');
});

test('T-002', 'CAUSAL WIRE: adversarial.violation.detected passes runId as causedBy', () => {
  // the run is the causal parent of any violation it detects
  const violationCall = src.match(/adversarial\.violation\.detected'[^)]*\)/s);
  assert.ok(violationCall, 'violation emit must exist');
  assert.ok(/,\s*runId\s*\)/.test(violationCall[0]),
    'violation event must pass runId as its causedBy (run → violation chain)');
});

test('T-003', 'run.complete is NOT given a false causedBy (it is the root of the chain)', () => {
  const runCall = src.match(/adversarial\.run\.complete'[\s\S]*?\}\);/);
  assert.ok(runCall, 'run.complete emit must exist');
  // it takes no third arg — the run has no parent, and inventing one would be a false edge (§1.2)
  assert.ok(!/adversarial\.run\.complete'[\s\S]*?\},\s*[a-zA-Z]/.test(runCall[0]),
    'run.complete must not fabricate a causedBy — it is the causal root');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
