'use strict';

/**
 * tests/modules/mco11-contract-repo-provision.test.js
 *
 * §MCO11 2026-09-13 — real tests for lib/contract-repo-provision.js's
 * buildRepoIngestBody(). The actual cross-process HTTP call lives in
 * contract-intake.js and needs a real idearium process to exercise end
 * to end (not available in this environment) — this file tests the pure
 * decision of what to send, same discipline as MCO10's ledger tests.
 */

const assert = require('assert');
const { buildRepoIngestBody } = require('../../lib/contract-repo-provision.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n    ${e.message}`); }
}

test('MCO11-001: a real contract with content produces a real, non-fabricated CONTRACT.md body', () => {
  const queued = { uuid: 'q-abc', content: 'implement the thing, for real' };
  const result = buildRepoIngestBody(queued, 'comp-123');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.body.name, 'raid-contract-q-abc');
  assert.strictEqual(result.body.compartmentId, 'comp-123');
  assert.strictEqual(result.body.source, 'raid-contract');
  assert.strictEqual(result.body.files.length, 1);
  assert.strictEqual(result.body.files[0].path, 'CONTRACT.md');
  assert.strictEqual(result.body.files[0].content, 'implement the thing, for real');
});

test('MCO11-002: a contract with no content field gets an honest placeholder, not fabricated content', () => {
  const queued = { uuid: 'q-nocontent' };
  const result = buildRepoIngestBody(queued, 'comp-1');
  assert.strictEqual(result.ok, true);
  assert.ok(result.body.files[0].content.includes('q-nocontent'));
  assert.ok(result.body.files[0].content.includes('no content field'));
});

test('MCO11-003: no compartmentId is refused, not silently linked to nothing', () => {
  const result = buildRepoIngestBody({ uuid: 'q-1', content: 'x' }, null);
  assert.strictEqual(result.ok, false);
  assert.ok(result.reason.includes('compartmentId'));
});

test('MCO11-004: no real contract row is refused', () => {
  const result = buildRepoIngestBody(null, 'comp-1');
  assert.strictEqual(result.ok, false);
});

test('MCO11-005: two different real contracts get two different, non-colliding repo names', () => {
  const a = buildRepoIngestBody({ uuid: 'q-a', content: 'x' }, 'c-1');
  const b = buildRepoIngestBody({ uuid: 'q-b', content: 'y' }, 'c-1');
  assert.notStrictEqual(a.body.name, b.body.name);
});

console.log(`\n  mco11-contract-repo-provision: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
