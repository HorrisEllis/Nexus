'use strict';

// §SANDBOX 2026-09-25 — this test starts real NEXUS processes; they inherit a throwaway data root from here (lib/test-sandbox.js).
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/mco15-component-exec-test.test.js
 *
 * §MCO15 2026-09-13 — real tests for lib/component-exec-test.js.
 * Includes a genuine test against guardian/server.js's real
 * module-scope server.listen() (bounded, safe — spawnSync's own timeout
 * guarantees the child is terminated) since that's the exact real case
 * this module exists to handle honestly rather than force-hide.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execTestFile, execTestComponent } = require('../../lib/component-exec-test.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n    ${e.message}`); }
}

test('MCO15-006: a real, side-effect-free file loads cleanly', () => {
  const r = execTestFile(path.resolve(__dirname, '../../lib/contract-repo-provision.js'));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.loadedThenHung, false);
});

test('MCO15-007: a real syntax error is caught, not a keyword-presence guess', () => {
  const tmp = '/tmp/mco15-broken.js';
  fs.writeFileSync(tmp, 'this is not valid { js (');
  try {
    const r = execTestFile(tmp);
    assert.strictEqual(r.ok, false);
    assert.ok(r.error.length > 0, 'a real error message must be captured');
  } finally { fs.unlinkSync(tmp); }
});

test('MCO15-008: a real missing dependency is caught — no text-pattern check could find this', () => {
  const tmp = '/tmp/mco15-missing-dep.js';
  fs.writeFileSync(tmp, "require('./this-genuinely-does-not-exist.js');");
  try {
    const r = execTestFile(tmp);
    assert.strictEqual(r.ok, false);
    assert.ok(r.error.includes('Cannot find module'));
  } finally { fs.unlinkSync(tmp); }
});

test('MCO15-009: guardian/server.js — a real file with a real module-scope listener — is correctly reported as loadedThenHung, not a plain failure', () => {
  const r = execTestFile(path.resolve(__dirname, '../../guardian/server.js'), 3000);
  assert.strictEqual(r.ok, true, 'a hang is not a failure — the require itself never threw');
  assert.strictEqual(r.loadedThenHung, true, 'a real listener must be observed, not masked by a forced early exit');
});

test('MCO15-010: execTestComponent runs every real owned file', () => {
  const reg = {
    get: (id) => id === 'test.multi' ? { owns: ['lib/contract-repo-provision.js', 'lib/require-graph.js'] } : null,
  };
  const r = execTestComponent('test.multi', reg);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.results.length, 2);
});

console.log(`\n  mco15-component-exec-test: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
