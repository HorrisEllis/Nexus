'use strict';
/**
 * loom/test/contracts.test.js — Phase 156 verification.
 * Run: node loom/test/contracts.test.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { LoomContracts } = require('../contracts/index');
const { LoomDriver } = require('../schema/index');

let pass = 0, fail = 0;
function check(label, fn) {
  try { fn(); pass++; console.log(`  PASS  ${label}`); }
  catch (e) { fail++; console.log(`  FAIL  ${label} — ${e.message}`); }
}

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-contracts-test-'));
const contracts = new LoomContracts({ dataDir });
const driver = new LoomDriver({ dataDir }); // same underlying registry file

console.log('\nLOOM Phase 156 — contracts test\n');

check('cannot open a contract for a component that was never declared', () => {
  assert.throws(() => contracts.openContract({ component_id: 'nexus.ghost', compartmentId: 'comp-1' }),
    /no such component in the registry/);
});

// register the two components this whole test proves get "pieced back together"
driver.declare('component', { id: 'nexus.parser', namespace: 'demo', name: 'Parser', version: '0.1.0', uuid: 'demo-parser-uuid-001' });
driver.declare('component', { id: 'nexus.renderer', namespace: 'demo', name: 'Renderer', version: '0.1.0', uuid: 'demo-renderer-uuid-001' });

let c1, c2;

check('openContract succeeds once the component is declared', () => {
  c1 = contracts.openContract({ component_id: 'nexus.parser', compartmentId: 'cos-compartment-aaa' });
  assert.strictEqual(c1.status, 'open');
  assert.strictEqual(c1.handoffs.length, 0);
});

check('handoffs append in order, timestamped, nothing lost', () => {
  contracts.recordHandoff(c1.id, { system: 'idearium', note: 'chunk verified' });
  contracts.recordHandoff(c1.id, { system: 'guardian', note: 'dispatched to mistral' });
  const updated = contracts.registry.get(c1.id);
  assert.strictEqual(updated.handoffs.length, 2);
  assert.strictEqual(updated.handoffs[0].system, 'idearium');
  assert.strictEqual(updated.handoffs[1].system, 'guardian');
  assert.ok(updated.handoffs[0].ts <= updated.handoffs[1].ts);
});

check('recording a handoff on a closed contract is refused, not silently accepted', () => {
  const closed = contracts.openContract({ component_id: 'nexus.parser', compartmentId: 'cos-compartment-throwaway' });
  contracts.closeContract(closed.id, { outcome: 'fail' });
  assert.throws(() => contracts.recordHandoff(closed.id, { system: 'guardian' }), /cannot record a handoff on a failed contract/);
});

check('closeContract(fail) writes nothing to the shared registry', () => {
  const before = Object.keys(driver.registry.all('hook')).length;
  const c = contracts.openContract({ component_id: 'nexus.parser', compartmentId: 'cos-compartment-bbb' });
  const r = contracts.closeContract(c.id, { outcome: 'fail' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.contract.status, 'failed');
  assert.strictEqual(contracts.registry.get(c.id).status, 'failed');
  const after = Object.keys(driver.registry.all('hook')).length;
  assert.strictEqual(after, before, 'a failed contract must never register hooks');
});

check('closeContract(pass) actually registers hooks into the SHARED registry, not a private copy', () => {
  const r = contracts.closeContract(c1.id, {
    outcome: 'pass',
    producedHooks: [
      { id: 'nexus.parser.hook.tokens-out', name: 'tokens-out', type: 'direct', direction: 'out', uuid: 'demo-parser-hook-out-uuid-001' },
    ],
  });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.strictEqual(r.contract.status, 'passed');
  const inSharedRegistry = driver.registry.get('hook', 'nexus.parser.hook.tokens-out');
  assert.ok(inSharedRegistry, 'hook did not actually land in the shared LOOM registry');
});

check('a passed contract that produces a hook violating registry axioms (duplicate id) is NOT counted as a pass', () => {
  const c = contracts.openContract({ component_id: 'nexus.parser', compartmentId: 'cos-compartment-ccc' });
  const r = contracts.closeContract(c.id, {
    outcome: 'pass',
    producedHooks: [
      { id: 'nexus.parser.hook.tokens-out', name: 'dup', type: 'direct', direction: 'out', uuid: 'demo-parser-hook-out-uuid-002' }, // same id as above — duplicate
    ],
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.contract.status, 'failed');
  assert.ok(r.contract.outcome.reason.includes('hook registration failed'));
});

check('THE ACTUAL CLAIM: second component passes independently, then the registry wires them together', () => {
  c2 = contracts.openContract({ component_id: 'nexus.renderer', compartmentId: 'cos-compartment-ddd' });
  const r = contracts.closeContract(c2.id, {
    outcome: 'pass',
    producedHooks: [
      { id: 'nexus.renderer.hook.tokens-in', name: 'tokens-in', type: 'direct', direction: 'in', uuid: 'demo-renderer-hook-in-uuid-001' },
    ],
  });
  assert.strictEqual(r.ok, true, JSON.stringify(r));

  // Neither compartment ever knew about the other. Now the registry —
  // and only the registry — pieces them together, exactly the claim
  // from this session's design discussion. This reuses the exact
  // Phase-131 wire-declare path, nothing new invented here.
  const wireResult = driver.declare('wire', {
    id: 'wire.parser-to-renderer', from_hook_id: 'nexus.parser.hook.tokens-out',
    to_hook_id: 'nexus.renderer.hook.tokens-in', uuid: 'demo-wire-uuid-001',
  });
  assert.strictEqual(wireResult.ok, true, JSON.stringify(wireResult));
  const graph = driver.graph();
  assert.strictEqual(graph.edges.length, 1);
  assert.strictEqual(graph.edges[0].from, 'nexus.parser.hook.tokens-out');
  assert.strictEqual(graph.edges[0].to, 'nexus.renderer.hook.tokens-in');
});

check('retryContract closes the old one, opens a fresh one for the SAME component, linked by parentId', () => {
  const original = contracts.openContract({ component_id: 'nexus.renderer', compartmentId: 'cos-compartment-eee' });
  const retried = contracts.retryContract(original.id, { compartmentId: 'cos-compartment-fff' });
  assert.strictEqual(contracts.registry.get(original.id).status, 'failed');
  assert.strictEqual(retried.parentId, original.id);
  assert.strictEqual(retried.component_id, original.component_id);
  assert.notStrictEqual(retried.compartmentId, original.compartmentId);
});

check('chain() returns full retry lineage, oldest first', () => {
  const a = contracts.openContract({ component_id: 'nexus.renderer', compartmentId: 'cos-1' });
  const b = contracts.retryContract(a.id, { compartmentId: 'cos-2' });
  const c = contracts.retryContract(b.id, { compartmentId: 'cos-3' });
  const chain = contracts.chain(c.id);
  assert.strictEqual(chain.length, 3);
  assert.strictEqual(chain[0].id, a.id);
  assert.strictEqual(chain[2].id, c.id);
});

check('contracts persisted to disk, disk-first, survives a fresh instance', () => {
  const reopened = new LoomContracts({ dataDir });
  const all = reopened.registry.all();
  assert.ok(Object.keys(all).length >= 8, `expected at least 8 contracts on disk, got ${Object.keys(all).length}`);
});

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
