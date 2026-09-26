'use strict';
// The self-registration convention (2026-07-25) — "the registry needs to be
// updated always. That way the system understands itself." Proves registerSelf
// produces valid components that flow through the projection chain and become
// RAID-resolvable, so a system announcing itself at boot is enough for RAID to
// route to it.
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
const { registerSelf } = require(path.join(ROOT, 'lib/self-register'));

// Fresh in-memory component registry per relevant test, to avoid cross-talk.
function freshRegistry() {
  delete require.cache[require.resolve(path.join(ROOT, 'lib/component-registry'))];
  const reg = require(path.join(ROOT, 'lib/component-registry'));
  const { jaaDB } = require(path.join(ROOT, 'cortex/memory/jaa-db'));
  reg.init(jaaDB, null);
  return reg;
}

test('T-001', 'registerSelf rejects a missing namespace', () => {
  const r = registerSelf('', [{ name: 'x' }]);
  assert.strictEqual(r.ok, false);
});

test('T-002', 'registerSelf rejects empty capabilities', () => {
  const r = registerSelf('intelligence', []);
  assert.strictEqual(r.ok, false);
});

test('T-003', 'registerSelf produces valid components (all 7 required fields)', () => {
  const reg = freshRegistry();
  const r = registerSelf('testfaculty', [
    { name: 'analyze', description: 'analyze a thing deeply', route: { method: 'POST', path: '/api/testfaculty/analyze' } },
  ], { componentRegistry: reg });
  assert.strictEqual(r.ok, true, JSON.stringify(r.results));
  assert.strictEqual(r.registered, 1);
});

test('T-004', 'a self-registered capability id is namespace.name', () => {
  const reg = freshRegistry();
  registerSelf('testfaculty', [{ name: 'predict', description: 'predict outcomes' }], { componentRegistry: reg });
  const row = reg.list().find(c => c.id === 'testfaculty.predict');
  assert.ok(row, 'component id must be namespace.name');
  assert.strictEqual(row.namespace, 'testfaculty');
});

test('T-005', 'a self-registered capability is available:true — or RAID cannot resolve it', () => {
  const reg = freshRegistry();
  registerSelf('testfaculty', [{ name: 'route', description: 'route a request somewhere' }], { componentRegistry: reg });
  const row = reg.list().find(c => c.id === 'testfaculty.route');
  assert.strictEqual(row.available, true);
});

test('T-006', 'CHAIN: a self-registered capability is RAID-resolvable by a grammar term', () => {
  const reg = freshRegistry();
  registerSelf('testfaculty', [
    { name: 'mastermind', description: 'strategic causal pattern analysis', route: { method: 'GET', path: '/api/testfaculty/mastermind' } },
  ], { componentRegistry: reg });
  delete require.cache[require.resolve(path.join(ROOT, 'lib/capability-registry'))];
  const capReg = require(path.join(ROOT, 'lib/capability-registry'));
  capReg.init(reg);
  const resolved = capReg.resolve('strategic');
  assert.strictEqual(resolved.found, true, 'RAID must resolve a self-registered capability by a grammar term');
  assert.ok(resolved.capabilities.some(c => c.name === 'testfaculty.mastermind'),
    'the resolved capability id must be the namespace.name RAID routes on');
});

test('T-007', 'grammar defaults from description when not given (never unresolvable, §1.2)', () => {
  const reg = freshRegistry();
  registerSelf('testfaculty', [{ name: 'reflect', description: 'reflect on constitutional changes' }], { componentRegistry: reg });
  const row = reg.list().find(c => c.id === 'testfaculty.reflect');
  assert.ok(Array.isArray(row.grammar) && row.grammar.length >= 1, 'grammar must default, never empty');
  assert.ok(row.grammar.includes('reflect'));
});

test('T-008', 'idempotent — re-registering the same capability updates, does not duplicate', () => {
  const reg = freshRegistry();
  registerSelf('testfaculty', [{ name: 'analyze', description: 'v1' }], { componentRegistry: reg });
  registerSelf('testfaculty', [{ name: 'analyze', description: 'v2 updated' }], { componentRegistry: reg });
  const rows = reg.list().filter(c => c.id === 'testfaculty.analyze');
  assert.strictEqual(rows.length, 1, 're-register must not duplicate');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
