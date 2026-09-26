'use strict';
const assert = require('assert');
let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}
(async () => {
  const { executeTool, getToolSchemas } = require('../../lib/agent-tools/index.js');

  await test('T-001', 'run_command registered, schema carries the real contract vocabulary', () => {
    const schemas = getToolSchemas();
    const rc = schemas.find(s => (s.function?.name || s.name) === 'run_command');
    assert.ok(rc, 'run_command not in schemas');
    const desc = rc.function?.description || rc.description;
    assert.ok(desc.includes('forge pipeline list'), 'contract vocabulary not in description');
  });

  await test('T-002', 'forge help executes through the real ForgeCLI', async () => {
    const r = await executeTool('run_command', { command: 'forge help' });
    assert.strictEqual(r.type, 'help');
    assert.ok(r.commands.length > 5);
  });

  await test('T-003', 'full real lifecycle: create → list → arm a pipeline, persisted through real jaa rows', async () => {
    const created = await executeTool('run_command', { command: 'forge pipeline create Autonomy Test Pipeline' });
    assert.strictEqual(created.type, 'created');
    const listed = await executeTool('run_command', { command: 'forge pipeline list' });
    assert.ok(listed.items.some(p => p.name === 'Autonomy Test Pipeline'), 'created pipeline not in list');
    const armed = await executeTool('run_command', { command: `forge pipeline arm ${created.pipeline.id}` });
    assert.strictEqual(armed.type, 'armed');
    // persistence: real rows written
    const { jaaDB } = require('../../cortex/memory/jaa-db');
    const rows = jaaDB.query('pipelines', r => r.json?.name === 'Autonomy Test Pipeline', 5);
    assert.ok(rows.length >= 1, 'no persisted row for created pipeline');
  });

  await test('T-004', 'unknown namespace refused honestly, not silently swallowed', async () => {
    const r = await executeTool('run_command', { command: 'rm -rf /' });
    assert.ok(r.error && r.error.includes('unrecognized command namespace'));
  });

  console.log(`\n  run-command-tool: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
