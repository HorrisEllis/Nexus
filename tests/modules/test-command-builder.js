'use strict';
// §CA6 — self-building commands: "make me a command for X to Y", stored in tool-index, runnable via CA3.
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; } }
const cb = require(path.join(__dirname, '../..', 'lib/command-builder'));

(async () => {
  await test('T-001', 'parseRequest extracts component + ability from natural language', async () => {
    const r = cb.parseRequest('make me a command for loom to check the graph');
    assert.deepStrictEqual(r, { component: 'loom', ability: 'check the graph' });
  });

  await test('T-002', 'parseRequest returns null for text with no "for X to Y" shape', async () => {
    const r = cb.parseRequest('do something useful please');
    assert.strictEqual(r, null);
  });

  await test('T-003', 'resolveCapability finds a real capability against the live registry (loom.health)', async () => {
    const cap = cb.resolveCapability('loom', 'health check');
    assert.ok(cap, 'expected a match for "health check" in loom\'s real capabilities');
    assert.strictEqual(cap.id, 'loom.health');
  });

  await test('T-004', 'resolveCapability finds the wire graph capability', async () => {
    const cap = cb.resolveCapability('loom', 'the wire graph');
    assert.ok(cap);
    assert.strictEqual(cap.id, 'loom.graph');
  });

  await test('T-005', 'resolveCapability returns null when nothing scores (no fabricated match)', async () => {
    const cap = cb.resolveCapability('loom', 'teleport to mars');
    assert.strictEqual(cap, null);
  });

  await test('T-006', 'buildCommand refuses when the request cannot be parsed', async () => {
    const r = await cb.buildCommand({ request: 'nonsense with no shape' });
    assert.strictEqual(r.ok, false);
  });

  await test('T-007', 'buildCommand refuses when no capability matches (does not fabricate a command)', async () => {
    const r = await cb.buildCommand({ component: 'loom', ability: 'teleport to mars' });
    assert.strictEqual(r.ok, false);
    assert.ok(r.reason.includes('no verified capability'));
  });

  let builtName;
  await test('T-008', 'buildCommand builds + stores a real command end to end, via natural language', async () => {
    const r = await cb.buildCommand({ request: 'make me a command for loom to check the graph', name: `unit-test-cmd-${Date.now()}` });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.capability.id, 'loom.graph');
    builtName = r.name;
    const fetched = cb.getCommand(builtName);
    assert.ok(fetched, 'getCommand must find the just-built command');
    assert.strictEqual(fetched.capabilityId, 'loom.graph');
  });

  await test('T-009', 'listCommands includes the just-built command', async () => {
    const list = cb.listCommands();
    assert.ok(list.some(c => c.name === builtName));
  });

  await test('T-010', 'the built command is registered in tool-index (loom\'s already-registered model)', async () => {
    const ti = require(path.join(__dirname, '../..', 'lib/tool-index'));
    const entry = ti.get(`command.${builtName}`);
    assert.ok(entry, 'the command must be a real tool-index row');
    assert.strictEqual(entry.kind, 'self-built-command');
  });

  await test('T-011', 'runCommand on an unknown name fails honestly', async () => {
    const r = await cb.runCommand('no-such-command-xyz');
    assert.strictEqual(r.ok, false);
  });

  await test('T-012', 'runCommand executes the built command via chains.js and returns a real result', async () => {
    const r = await cb.runCommand(builtName, { foo: 'bar' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.results[0].kind, 'system');
    assert.strictEqual(r.results[0].output.delivered, 'loom.graph');
  });

  await test('T-013', 'a denied build (RAID gate) does not store anything', async () => {
    const sm = require(path.join(__dirname, '../..', 'copilot/lib/self-model'));
    const orig = sm.governAction;
    sm.governAction = () => ({ allowed: false, reason: 'test-deny' });
    const r = await cb.buildCommand({ component: 'loom', ability: 'health check', name: 'should-not-exist' });
    sm.governAction = orig;
    assert.strictEqual(r.ok, false);
    assert.strictEqual(cb.getCommand('should-not-exist'), null, 'a denied build must not persist a command');
  });

  await test('T-014', 'a denied run (RAID gate, checked separately from build) does not execute', async () => {
    const sm = require(path.join(__dirname, '../..', 'copilot/lib/self-model'));
    const orig = sm.governAction;
    sm.governAction = () => ({ allowed: false, reason: 'test-deny' });
    const r = await cb.runCommand(builtName, {});
    sm.governAction = orig;
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, 'test-deny');
  });

  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
