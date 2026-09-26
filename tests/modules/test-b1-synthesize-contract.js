'use strict';
/**
 * tests/modules/test-b1-synthesize-contract.js — cortex/core/raid/
 * contract-intake.js's synthesizeContract() (the B1 build-contract
 * schema's real, automated builder).
 * UUID: nexus-test-b1-synthesize-contract-v1-0000-2026-0903-001
 *
 * Same real-jaaDB isolation-gate pattern as test-hat-forge.js.
 */
const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');

const ROOT = path.join(__dirname, '../..');
const TMP  = fs.mkdtempSync(path.join(os.tmpdir(), 'b1-synthesize-test-'));
const PRIOR_DIR = process.env.JAA_DATA_DIR;
process.env.JAA_DATA_DIR = TMP;

let passed = 0, failed = 0;
async function test(id, name, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.log(`  ✗ ${id} ${name}\n    ${e.message}`); failed++; }
}

const { jaaDB } = require(path.join(ROOT, 'cortex/memory/jaa-db.js'));
jaaDB.insert('b1_isolation_probe', { id: 'probe', ts: Date.now() });
try { jaaDB._store().flushAll(); } catch (_) {}
if (!fs.existsSync(path.join(TMP, 'b1_isolation_probe.json'))) {
  console.log('  ✗ B1-000 ISOLATION — cortex/memory/jaa-db.js ignores JAA_DATA_DIR');
  console.log('  1 failed, 0 passed');
  process.exitCode = 1;
  return;
}

const _raidInputIsolated4 = fs.mkdtempSync(path.join(os.tmpdir(), 'raid-input-b1-'));
process.env.RAID_INPUT_DIR = _raidInputIsolated4;
process.on('exit', () => { try { fs.rmSync(_raidInputIsolated4, { recursive: true, force: true }); } catch (_) {} });
const ci = require(path.join(ROOT, 'cortex/core/raid/contract-intake.js'));

async function main() {
  console.log('\n[1] synthesizeContract() — real validation');

  await test('B1-001', 'refuses a missing forAgent', async () => {
    const r = ci.synthesizeContract({ intent: 'build', endState: 'x' });
    assert.strictEqual(r.ok, false);
    assert.ok(r.errors.some(e => e.includes('forAgent')));
  });

  await test('B1-002', 'refuses a missing intent', async () => {
    const r = ci.synthesizeContract({ forAgent: 'ollama', endState: 'x' });
    assert.strictEqual(r.ok, false);
    assert.ok(r.errors.some(e => e.includes('intent')));
  });

  await test('B1-003', 'refuses a fake intent verb against the real VALID_VERBS set', async () => {
    const r = ci.synthesizeContract({ forAgent: 'ollama', intent: 'fly_to_moon', endState: 'x' });
    assert.strictEqual(r.ok, false);
    assert.ok(r.errors.some(e => e.includes('not a real verb')));
  });

  await test('B1-004', 'accepts every real verb from intent-classifier.js', async () => {
    const { VALID_VERBS } = require(path.join(ROOT, 'lib/intent-classifier.js'));
    for (const verb of VALID_VERBS) {
      const r = ci.synthesizeContract({ forAgent: 'ollama', intent: verb, endState: `real end state for ${verb}` });
      assert.ok(r.ok, `real verb "${verb}" was refused: ${JSON.stringify(r.errors)}`);
    }
  });

  await test('B1-005', 'refuses a missing endState', async () => {
    const r = ci.synthesizeContract({ forAgent: 'ollama', intent: 'build' });
    assert.strictEqual(r.ok, false);
    assert.ok(r.errors.some(e => e.includes('endState')));
  });

  await test('B1-006', 'refuses a fake warpPrimitive against the real 5', async () => {
    const r = ci.synthesizeContract({ forAgent: 'ollama', intent: 'build', endState: 'x', warpPrimitives: ['Teleporter'] });
    assert.strictEqual(r.ok, false);
    assert.ok(r.errors.some(e => e.includes('WARP primitives')));
  });

  await test('B1-007', 'accepts all 5 real warp primitives', async () => {
    const r = ci.synthesizeContract({
      forAgent: 'ollama', intent: 'build', endState: 'x',
      warpPrimitives: ['Event', 'Gate', 'Axiom', 'Stream', 'StreamLog'],
    });
    assert.ok(r.ok, JSON.stringify(r.errors));
  });

  await test('B1-008', 'refuses a fake axiom ref not in the real AXIOMS-v3.1.md file', async () => {
    const r = ci.synthesizeContract({ forAgent: 'ollama', intent: 'build', endState: 'x', axioms: ['§99.99'] });
    assert.strictEqual(r.ok, false);
    assert.ok(r.errors.some(e => e.includes('AXIOMS-v3.1.md')));
  });

  await test('B1-009', 'accepts a real axiom ref that exists in the live file', async () => {
    const r = ci.synthesizeContract({ forAgent: 'ollama', intent: 'build', endState: 'x', axioms: ['§0.0'] });
    assert.ok(r.ok, JSON.stringify(r.errors));
  });

  await test('B1-010', 'refuses conditions that are not a real object', async () => {
    const r = ci.synthesizeContract({ forAgent: 'ollama', intent: 'build', endState: 'x', conditions: ['not', 'an', 'object'] });
    assert.strictEqual(r.ok, false);
    assert.ok(r.errors.some(e => e.includes('conditions')));
  });

  console.log('\n[2] synthesizeContract() — real end-to-end persistence');

  await test('B1-011', 'a valid synthesis produces a real queueId and persists every B1 field', async () => {
    const r = ci.synthesizeContract({
      forAgent: 'ollama', intent: 'build', system: 'guardian',
      endState: 'guardian/lib/foo.js exports a real bar() function',
      conditions: { pre: ['guardian boots'], post: ['bar() returns a real value'] },
      warpPrimitives: ['Event', 'Gate'],
      axioms: ['§0.0', '§1.1'],
      fileDirectory: 'guardian/lib', fileName: 'foo.js',
    });
    assert.ok(r.ok === true, JSON.stringify(r));
    assert.ok(r.queueId, 'no real queueId returned');

    const row = ci.listQueue().find(q => q.uuid === r.queueId);
    assert.ok(row, 'contract never actually reached the real queue');
    assert.strictEqual(row.endState, 'guardian/lib/foo.js exports a real bar() function');
    assert.deepStrictEqual(row.conditions, { pre: ['guardian boots'], post: ['bar() returns a real value'] });
    assert.deepStrictEqual(row.warpPrimitives, ['Event', 'Gate']);
    assert.deepStrictEqual(row.axioms, ['§0.0', '§1.1']);
    assert.strictEqual(row.fileName, 'foo.js');
    assert.strictEqual(row.dir, 'guardian/lib');
    assert.strictEqual(row.intention, 'build');
  });

  await test('B1-012', 'tools defaults from a real forged hat\'s toolScope when omitted', async () => {
    const hatForge = require(path.join(ROOT, 'lib/hat-forge.js'));
    const forged = hatForge.forge({ name: 'b1_test_hat', baseAgent: 'ollama', toolScope: ['read_file', 'search_files'] });
    assert.ok(forged.ok, JSON.stringify(forged.errors));

    const r = ci.synthesizeContract({ forAgent: 'b1_test_hat', intent: 'build', endState: 'x' });
    assert.ok(r.ok === true, JSON.stringify(r));
    assert.deepStrictEqual(r.tools, ['read_file', 'search_files'], 'tools should default from the real hat\'s toolScope');
  });

  await test('B1-013', 'an explicit tools list overrides the hat default', async () => {
    const r = ci.synthesizeContract({ forAgent: 'b1_test_hat', intent: 'build', endState: 'x', tools: ['run_command'] });
    assert.deepStrictEqual(r.tools, ['run_command']);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (PRIOR_DIR === undefined) delete process.env.JAA_DATA_DIR; else process.env.JAA_DATA_DIR = PRIOR_DIR;
  process.exitCode = failed > 0 ? 1 : 0;
}

main();
