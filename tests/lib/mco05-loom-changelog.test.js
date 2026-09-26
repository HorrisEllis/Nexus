'use strict';
/**
 * tests/lib/mco05-loom-changelog.test.js
 *
 * §MCO05 2026-09-18 — real tests for loom/lib/changelog.js: a durable,
 * append-only, per-version changelog.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n    ${e.message}`); }
}

process.env.JAA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mco05-jaa-'));
const changelog = require('../../loom/lib/changelog.js');

test('MCO05-001: recordVersion refuses a missing version', () => {
  const r = changelog.recordVersion({ changes: ['x'] });
  assert.strictEqual(r.ok, false);
});

test('MCO05-002: recordVersion refuses an empty changes array', () => {
  const r = changelog.recordVersion({ version: '1.0.0', changes: [] });
  assert.strictEqual(r.ok, false);
});

test('MCO05-003: a real version records successfully and is retrievable', () => {
  const r = changelog.recordVersion({ version: '9.9.1-test', changes: ['did a real thing'] });
  assert.strictEqual(r.ok, true);
  const got = changelog.getVersion('9.9.1-test');
  assert.strictEqual(got.version, '9.9.1-test');
  assert.deepStrictEqual(got.changes, ['did a real thing']);
});

test('MCO05-004: recordVersion refuses a duplicate version — append-only, not editable', () => {
  changelog.recordVersion({ version: '9.9.2-test', changes: ['first'] });
  const r = changelog.recordVersion({ version: '9.9.2-test', changes: ['second, different'] });
  assert.strictEqual(r.ok, false);
  assert.ok(r.reason.includes('already recorded'));
  const got = changelog.getVersion('9.9.2-test');
  assert.deepStrictEqual(got.changes, ['first'], 'the original entry must be untouched');
});

test('MCO05-005: getChangelog returns entries newest-first', () => {
  changelog.recordVersion({ version: '9.9.3-test', changes: ['a'], releasedAt: 1000 });
  changelog.recordVersion({ version: '9.9.4-test', changes: ['b'], releasedAt: 2000 });
  const list = changelog.getChangelog();
  const idxA = list.findIndex(e => e.version === '9.9.3-test');
  const idxB = list.findIndex(e => e.version === '9.9.4-test');
  assert.ok(idxB < idxA, 'the newer release (higher releasedAt) must come first');
});

console.log(`\n  mco05-loom-changelog: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
