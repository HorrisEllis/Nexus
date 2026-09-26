'use strict';

/**
 * tests/modules/mco15-component-boundary-check.test.js
 *
 * §MCO15 2026-09-13 — real tests for lib/component-boundary-check.js,
 * against a fake but structurally real component registry (get/list),
 * so this doesn't depend on what happens to be registered in the live
 * JAA store at test time.
 */

const assert = require('assert');
const path = require('path');
const { checkComponentBoundary } = require('../../lib/component-boundary-check.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n    ${e.message}`); }
}

function fakeRegistry(components) {
  const map = new Map(components.map(c => [c.id, c]));
  return { get: (id) => map.get(id) || null, list: () => [...map.values()] };
}

test('MCO15-001: unregistered component is refused, not guessed at', () => {
  const reg = fakeRegistry([]);
  const result = checkComponentBoundary('nothing.here', reg);
  assert.strictEqual(result.ok, false);
  assert.ok(result.reason.includes('no real component'));
});

test('MCO15-002: a registered component with no owns[] is refused', () => {
  const reg = fakeRegistry([{ id: 'a', owns: [] }]);
  const result = checkComponentBoundary('a', reg);
  assert.strictEqual(result.ok, false);
  assert.ok(result.reason.includes('no real owns'));
});

test('MCO15-003: a real, known cross-component reference is found and attributed', () => {
  // guardian/server.js (real, owns[]-tagged as guardian.health for this
  // test) really requires guardian/lib/ncp.js at module scope, confirmed
  // directly before writing this test (line 29: require('../guardian/lib/ncp')).
  const reg = fakeRegistry([
    { id: 'guardian.health', owns: ['guardian/server.js'] },
    { id: 'guardian.ncp', owns: ['guardian/lib/ncp.js'] },
  ]);
  const result = checkComponentBoundary('guardian.health', reg);
  assert.strictEqual(result.ok, true);
  const hit = result.crossings.find(c => c.ownedBy === 'guardian.ncp');
  assert.ok(hit, 'the real guardian/lib/ncp.js require must be found as a crossing');
  assert.ok(hit.target.endsWith(path.join('guardian', 'lib', 'ncp.js')));
});

test('MCO15-004: a require into an unregistered file is external, not a crossing', () => {
  const reg = fakeRegistry([{ id: 'guardian.health', owns: ['guardian/server.js'] }]);
  const result = checkComponentBoundary('guardian.health', reg);
  assert.strictEqual(result.ok, true);
  assert.ok(result.external.length > 0, 'guardian/server.js requires many real files owned by no registered component');
  assert.strictEqual(result.crossings.length, 0, 'with no other component registered, nothing can be a crossing');
});

test('MCO15-005: a require staying within the same component\'s own owns[] is internal, not a crossing', () => {
  // guardian/server.js requires ./lib/ncp-handler at module scope too —
  // if BOTH files were owned by the same component, that reference must
  // land in internal[], never crossings.
  const reg = fakeRegistry([{ id: 'guardian.core', owns: ['guardian/server.js', 'guardian/lib/ncp-handler.js'] }]);
  const result = checkComponentBoundary('guardian.core', reg);
  assert.strictEqual(result.ok, true);
  const inCrossings = result.crossings.some(c => c.target.endsWith('ncp-handler.js'));
  assert.ok(!inCrossings, 'a file owned by the SAME component must never be reported as a crossing');
});

console.log(`\n  mco15-component-boundary-check: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
