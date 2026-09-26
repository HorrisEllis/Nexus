'use strict';
const assert = require('assert');
process.env.COPILOT_PORT = '0';

const { _resolveIntuitionResponse } = require('../../copilot/server.js');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

test('T-001', 'no adversarial verdict (unreachable/failed): plain intuition text, unchanged behavior', () => {
  const r = _resolveIntuitionResponse({ text: 'There are 2 open gaps.' }, null);
  assert.strictEqual(r.text, 'There are 2 open gaps.');
  assert.strictEqual(r.source, 'cortex.intuition');
});

test('T-002', 'agreement verdict: plain intuition text, unchanged', () => {
  const r = _resolveIntuitionResponse(
    { text: 'No open gaps.' },
    { adversarial: { verdict: 'agreement', contradiction_score: 0.1 } }
  );
  assert.strictEqual(r.text, 'No open gaps.');
  assert.strictEqual(r.source, 'cortex.intuition');
});

test('T-003', 'contradiction verdict: appends the discrepancy note, does not hide it', () => {
  const r = _resolveIntuitionResponse(
    { text: 'There are 2 open gaps.' },
    { adversarial: { verdict: 'contradiction', contradiction_score: 0.6, reasons: ["mastermind's own gap query does not"] } }
  );
  assert.ok(r.text.includes('There are 2 open gaps.'));
  assert.ok(r.text.includes('discrepancy'));
  assert.ok(r.text.includes("mastermind's own gap query does not"));
  assert.strictEqual(r.source, 'cortex.intuition+adversarial');
});

test('T-004', 'reconciled verdict: uses the richer synthesized hypothesis, not the bare intuition text', () => {
  const r = _resolveIntuitionResponse(
    { text: 'There are 1 open gaps.' },
    { adversarial: { verdict: 'reconciled', reconciled_hypothesis: 'Confirmed issue, traced cause available: ollama.offline → gap.' } }
  );
  assert.strictEqual(r.text, 'Confirmed issue, traced cause available: ollama.offline → gap.');
  assert.strictEqual(r.source, 'cortex.intuition+mastermind.reconciled');
});

test('T-005', 'reconciled verdict with no hypothesis string: falls back to intuition text, never crashes', () => {
  const r = _resolveIntuitionResponse(
    { text: 'There are 1 open gaps.' },
    { adversarial: { verdict: 'reconciled' } }
  );
  assert.strictEqual(r.text, 'There are 1 open gaps.');
});

test('T-006', 'not-comparable verdict: treated same as agreement, plain text', () => {
  const r = _resolveIntuitionResponse(
    { text: 'x connects to y.' },
    { adversarial: { comparable: false, reason: 'unrelated intent' } }
  );
  assert.strictEqual(r.text, 'x connects to y.');
});

console.log(`\n  copilot-adversarial-wire: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
