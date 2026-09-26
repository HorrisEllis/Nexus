'use strict';
/**
 * tests/modules/test-node-export.js — lib/node-export.js's generic
 * envelope + lib/hat-forge.js's real exportHat()/importHat() wiring.
 * UUID: nexus-test-node-export-v1-0000-2026-0903-001
 *
 * Same isolation-gate pattern as test-hat-forge.js — this suite writes
 * real hat rows and real export files, and refuses to run against the
 * production jaaDB store.
 */
const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');

const ROOT = path.join(__dirname, '../..');
const TMP  = fs.mkdtempSync(path.join(os.tmpdir(), 'node-export-test-'));
const PRIOR_DIR = process.env.JAA_DATA_DIR;
process.env.JAA_DATA_DIR = TMP;

let passed = 0, failed = 0;
async function test(id, name, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.log(`  ✗ ${id} ${name}\n    ${e.message}`); failed++; }
}

const { jaaDB } = require(path.join(ROOT, 'cortex/memory/jaa-db.js'));
jaaDB.insert('node_export_isolation_probe', { id: 'probe', ts: Date.now() });
try { jaaDB._store().flushAll(); } catch (_) {}
const isolated = fs.existsSync(path.join(TMP, 'node_export_isolation_probe.json'));
if (!isolated) {
  console.log('  ✗ NEX-000 ISOLATION — cortex/memory/jaa-db.js ignores JAA_DATA_DIR');
  console.log('  1 failed, 0 passed');
  process.exitCode = 1;
  return;
}

const nodeExport = require(path.join(ROOT, 'lib/node-export.js'));
const hf = require(path.join(ROOT, 'lib/hat-forge.js'));
const EXPORT_DIR = path.join(TMP, 'exports');

async function main() {
  console.log('\n[1] lib/node-export.js — generic envelope');

  await test('NEX-001', 'wrap() rejects an unknown type', async () => {
    assert.throws(() => nodeExport.wrap('bogus_type', 'id1', {}), /unknown type/);
  });

  await test('NEX-002', 'wrap() rejects a missing id', async () => {
    assert.throws(() => nodeExport.wrap('hat', null, {}), /id is required/);
  });

  await test('NEX-003', 'wrap()/toYaml()/fromYaml() round-trips a payload exactly', async () => {
    const env = nodeExport.wrap('tool', 'tool-abc', { name: 'read_file', description: 'x' }, {
      context: 'ctx', intent: 'diagnose', summary: 'a summary', system: 'nexus.lib.test',
    });
    const text = nodeExport.toYaml(env);
    assert.ok(text.includes('type: tool'), 'YAML text missing type field');
    const back = nodeExport.fromYaml(text);
    assert.strictEqual(back.payload.name, 'read_file');
    assert.strictEqual(back.context, 'ctx');
    assert.strictEqual(back.intent, 'diagnose');
  });

  await test('NEX-004', 'validate() rejects a wrong envelope version', async () => {
    assert.throws(() => nodeExport.validate({ envelope: 999, type: 'hat', id: 'x', payload: {} }), /envelope version/);
  });

  await test('NEX-005', 'exportToFile() writes a real .{type} file readable back via importFromFile()', async () => {
    const filePath = nodeExport.exportToFile('gap', 'gap-123', { description: 'a real gap' }, { summary: 'test gap' }, EXPORT_DIR);
    assert.ok(filePath.endsWith('.gap'), `expected a .gap file, got ${filePath}`);
    assert.ok(fs.existsSync(filePath));
    const back = nodeExport.importFromFile(filePath);
    assert.strictEqual(back.payload.description, 'a real gap');
  });

  console.log('\n[2] lib/hat-forge.js — real exportHat()/importHat() wiring');

  const forged = hf.forge({ name: 'export_test_hat', baseAgent: 'ollama', toolScope: ['read_file'], model: 'llama3' });
  assert.ok(forged.ok, `setup: forge() failed: ${JSON.stringify(forged.errors)}`);

  await test('NEX-006', 'exportHat() writes a real .hat file for a real forged hat', async () => {
    const result = hf.exportHat('export_test_hat', {}, EXPORT_DIR);
    assert.ok(result.ok, `exportHat failed: ${result.reason}`);
    assert.ok(fs.existsSync(result.filePath));
    assert.ok(result.filePath.endsWith('.hat'));
  });

  await test('NEX-007', 'exportHat() envelope carries the real hat fields, not a re-derived copy', async () => {
    const result = hf.exportHat('export_test_hat', {}, EXPORT_DIR);
    const env = nodeExport.importFromFile(result.filePath);
    assert.strictEqual(env.payload.baseAgent, 'ollama');
    assert.strictEqual(env.payload.model, 'llama3');
    assert.deepStrictEqual(env.payload.toolScope, ['read_file']);
    assert.strictEqual(env.type, 'hat');
  });

  await test('NEX-008', 'exportHat() on a hat that does not exist fails honestly, writes nothing', async () => {
    const result = hf.exportHat('no_such_hat', {}, EXPORT_DIR);
    assert.strictEqual(result.ok, false);
  });

  await test('NEX-009', 'importHat() re-forges as a NEW hat with a real, different uuid', async () => {
    const exp = hf.exportHat('export_test_hat', {}, EXPORT_DIR);
    const original = hf.get('export_test_hat');
    const imported = hf.importHat(exp.filePath, { name: 'export_test_hat_imported' });
    assert.ok(imported.ok, `importHat failed: ${JSON.stringify(imported.errors)}`);
    assert.notStrictEqual(imported.hat.uuid, original.uuid, 'import must not silently reuse the original uuid');
    assert.strictEqual(imported.hat.baseAgent, 'ollama');
    assert.strictEqual(imported.hat.model, 'llama3');
  });

  await test('NEX-010', 'importHat() on a non-hat envelope fails honestly', async () => {
    const gapFile = nodeExport.exportToFile('gap', 'gap-999', {}, {}, EXPORT_DIR);
    const result = hf.importHat(gapFile);
    assert.strictEqual(result.ok, false);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (PRIOR_DIR === undefined) delete process.env.JAA_DATA_DIR; else process.env.JAA_DATA_DIR = PRIOR_DIR;
  process.exitCode = failed > 0 ? 1 : 0;
}

main();
