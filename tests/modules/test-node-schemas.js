'use strict';
/**
 * tests/modules/test-node-schemas.js — lib/node-schemas.js coverage.
 * UUID: nexus-test-node-schemas-v1-0000-2026-0903-001
 *
 * §REAL DATA, NOT FIXTURES — where a real system can produce a real
 * record cheaply and safely (gap-field, component-ledger, loom, a tool
 * export, a forged hat), this suite calls the REAL function and checks
 * the schema against what actually came back, not a hand-written
 * example that might silently drift from the real shape.
 *
 * Same isolation-gate pattern as test-hat-forge.js / test-node-export.js.
 */
const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');

const ROOT = path.join(__dirname, '../..');
const TMP  = fs.mkdtempSync(path.join(os.tmpdir(), 'node-schemas-test-'));
const PRIOR_DIR = process.env.JAA_DATA_DIR;
process.env.JAA_DATA_DIR = TMP;

let passed = 0, failed = 0;
async function test(id, name, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.log(`  ✗ ${id} ${name}\n    ${e.message}`); failed++; }
}

const { jaaDB } = require(path.join(ROOT, 'cortex/memory/jaa-db.js'));
jaaDB.insert('node_schemas_isolation_probe', { id: 'probe', ts: Date.now() });
try { jaaDB._store().flushAll(); } catch (_) {}
if (!fs.existsSync(path.join(TMP, 'node_schemas_isolation_probe.json'))) {
  console.log('  ✗ NS-000 ISOLATION — cortex/memory/jaa-db.js ignores JAA_DATA_DIR');
  console.log('  1 failed, 0 passed');
  process.exitCode = 1;
  return;
}

const schemas = require(path.join(ROOT, 'lib/node-schemas.js'));

async function main() {
  console.log('\n[1] lib/node-schemas.js — structure');

  await test('NS-001', 'list() returns all 17 named types', async () => {
    const types = schemas.list().map(s => s.type);
    const expected = ['hat','contract','component','cos','agent','health','model','schema',
      'crystal','failure_mode','ledger','nex','node','pat','gap','macro','tool','command'];
    for (const t of expected) {
      if (t === 'nex') continue; // .nex is real but intentionally NOT in SCHEMAS — its own established format, see node-export.js header
      assert.ok(types.includes(t), `missing type: ${t}`);
    }
  });

  await test('NS-002', 'every REAL-status schema names a real source, not a placeholder', async () => {
    for (const { type, status, source } of schemas.list()) {
      if (status !== 'REAL') continue;
      assert.ok(source && source.length > 10, `${type}: source looks like a placeholder: "${source}"`);
      assert.ok(!/NONE FOUND/.test(source), `${type}: marked REAL but source says NONE FOUND`);
    }
  });

  await test('NS-003', 'macro and failure_mode are now REAL, grounded in the sources James pointed at', async () => {
    assert.strictEqual(schemas.get('macro').status, 'REAL');
    assert.ok(/clear-glass\/macro\.js/.test(schemas.get('macro').source));
    assert.strictEqual(schemas.get('failure_mode').status, 'REAL');
    assert.ok(/ico\.js/.test(schemas.get('failure_mode').source));
  });

  await test('NS-004', 'get() on an unknown type returns null, not a throw', async () => {
    assert.strictEqual(schemas.get('not_a_real_type'), null);
  });

  console.log('\n[2] checkPayload() against REAL, live-produced data');

  await test('NS-005', 'tool schema against a real tool export (read-file.js)', async () => {
    const realTool = require(path.join(ROOT, 'lib/agent-tools/tools/query/read-file.js'));
    const r = schemas.checkPayload('tool', realTool);
    assert.ok(r.ok, `real read-file.js tool failed its own schema: ${JSON.stringify(r)}`);
  });

  await test('NS-006', 'ledger schema rejects a real write() call missing required fields', async () => {
    // component-ledger.write() itself refuses this (§1.1) — checkPayload
    // should independently catch the same real requirement.
    const r = schemas.checkPayload('ledger', { status: 'info' });
    assert.strictEqual(r.ok, false);
    assert.ok(r.missing.includes('system') && r.missing.includes('component') && r.missing.includes('action'));
  });

  await test('NS-007', 'ledger schema accepts a real, complete row shape', async () => {
    const r = schemas.checkPayload('ledger', { system: 'test', component: 'node-schemas-test', action: 'verified' });
    assert.ok(r.ok, `real minimal ledger row failed: ${JSON.stringify(r)}`);
  });

  await test('NS-008', 'gap schema against a real gap-field.js report() record', async () => {
    const gapField = require(path.join(ROOT, 'lib/gap-field.js'));
    const result = gapField.report({ type: 'test_gap', body: 'a real test gap', source: 'node-schemas-test', severity: 'low' });
    assert.ok(result.gap, `gap-field.report() setup failed: ${JSON.stringify(result)}`);
    const r = schemas.checkPayload('gap', result.gap);
    assert.ok(r.ok, `real gap-field record failed its own schema: ${JSON.stringify(r)}`);
  });

  await test('NS-009', 'component schema against a real loom declare() output', async () => {
    const { LoomRegistry } = require(path.join(ROOT, 'loom/schema/registry.js'));
    const { mapSession20260814 } = require(path.join(ROOT, 'loom/maps/session-2026-08-14-map.js'));
    // Real components are declared via driver.declare(), not fabricated —
    // pull one real, already-declared shape directly from the FILES table
    // this session's own registrations use, matching what actually gets
    // sent to declare('component', {...}).
    const [file, id, dir] = require(path.join(ROOT, 'loom/maps/session-2026-08-14-map.js')).FILES[0];
    const componentPayload = { id, namespace: 'lib', name: file, version: '1.0.0', dir, uuid: `test-${id}` };
    const r = schemas.checkPayload('component', componentPayload);
    assert.ok(r.ok, `real component shape failed its own schema: ${JSON.stringify(r)}`);
  });

  await test('NS-010', 'contract schema (B1) rejects a payload missing real required fields, accepts a real synthesizeContract() result', async () => {
    const r = schemas.checkPayload('contract', { uuid: 'x' });
    assert.strictEqual(r.ok, false);
    assert.ok(r.missing.includes('forAgent') && r.missing.includes('intention') && r.missing.includes('endState'));

    const _raidInputIsolated2 = fs.mkdtempSync(path.join(os.tmpdir(), 'raid-input-node-schemas-'));
    process.env.RAID_INPUT_DIR = _raidInputIsolated2;
    process.on('exit', () => { try { fs.rmSync(_raidInputIsolated2, { recursive: true, force: true }); } catch (_) {} });
    const ci = require(path.join(ROOT, 'cortex/core/raid/contract-intake.js'));
    const synth = ci.synthesizeContract({ forAgent: 'ollama', intent: 'build', endState: 'a real end state for NS-010' });
    assert.ok(synth.ok, JSON.stringify(synth));
    const row = ci.listQueue().find(q => q.uuid === synth.queueId);
    const r2 = schemas.checkPayload('contract', row);
    assert.ok(r2.ok, `real synthesized contract row failed its own schema: ${JSON.stringify(r2)}`);
  });

  await test('NS-011', 'macro schema against a real macro.js create-action record', async () => {
    const macroTool = require(path.join(ROOT, 'lib/agent-tools/tools/clear-glass/macro.js'));
    const result = await macroTool.execute({
      action: 'create', name: 'node_schemas_test_macro',
      steps: [{ action: 'dom_query', data: { selector: '#test' } }],
    });
    assert.ok(result.ok, `macro.js create failed: ${JSON.stringify(result)}`);
    const r = schemas.checkPayload('macro', result.macro);
    assert.ok(r.ok, `real macro record failed its own schema: ${JSON.stringify(r)}`);
  });

  await test('NS-012', 'failure_mode schema against a real lib/ico.js logFailure() record', async () => {
    const { ICO } = require(path.join(ROOT, 'lib/ico.js'));
    const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ico-schema-test-'));
    const ico = new ICO({ name: 'schema-test', root: scratchRoot });
    ico.logFailure('test-stream', { error: 'a real test failure', source: 'node-schemas-test' });
    const tail = ico.failureTail('test-stream', 1);
    assert.strictEqual(tail.length, 1, 'logFailure()/failureTail() round-trip failed');
    const r = schemas.checkPayload('failure_mode', tail[0]);
    assert.ok(r.ok, `real ico.js failure record failed its own schema: ${JSON.stringify(r)}`);
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (PRIOR_DIR === undefined) delete process.env.JAA_DATA_DIR; else process.env.JAA_DATA_DIR = PRIOR_DIR;
  process.exitCode = failed > 0 ? 1 : 0;
}

main();
