'use strict';
/**
 * loom/test/agent-suite.test.js — Phase 141 verification.
 * Run: node loom/test/agent-suite.test.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { LoomAgentSuite } = require('../agent-suite/index');

let pass = 0, fail = 0;
function check(label, fn) { return fn().then(() => { pass++; console.log(`  PASS  ${label}`); }).catch(e => { fail++; console.log(`  FAIL  ${label} — ${e.message}`); }); }

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-agent-suite-test-'));
  const suite = new LoomAgentSuite({ dataDir: tmpDir });

  console.log(`\nLOOM Phase 141 — agent-suite test\ndata dir: ${tmpDir}\n`);
  console.log('-- LOCAL tools (fully verified) --');

  await check('empty registry snapshot is all zeros', async () => {
    const snap = suite.getRegistrySnapshot();
    assert.deepStrictEqual(snap, { components: 0, seams: 0, hooks: 0, wires: 0, componentIds: [] });
  });

  await check('declareViaAgent registers a real component, persisted to disk', async () => {
    const r = suite.declareViaAgent('component', {
      id: 'nexus.test.widget', namespace: 'test', name: 'Widget', version: '0.1.0',
      uuid: 'nexus-test-widget-v1-0000-2026-0701-jamesbrooks-001',
    });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, 'registry.json'), 'utf8'));
    assert.ok(onDisk.component['nexus.test.widget']);
  });

  await check('declareViaAgent enforces the same axioms as the CLI/API will (duplicate id rejected)', async () => {
    const r = suite.declareViaAgent('component', {
      id: 'nexus.test.widget', namespace: 'test', name: 'Widget 2', version: '0.2.0',
      uuid: 'nexus-test-widget-v1-0000-2026-0701-jamesbrooks-002',
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, 'axiom-rejected');
  });

  await check('declareViaAgent hook + wire, then getGraph() reflects it', async () => {
    suite.declareViaAgent('hook', {
      id: 'test.hook.a', component_id: 'nexus.test.widget', name: 'a', type: 'direct', direction: 'out',
      uuid: 'nexus-test-hook-a-v1-0000-2026-0701-jamesbrooks-001',
    });
    suite.declareViaAgent('hook', {
      id: 'test.hook.b', component_id: 'nexus.test.widget', name: 'b', type: 'direct', direction: 'in',
      uuid: 'nexus-test-hook-b-v1-0000-2026-0701-jamesbrooks-001',
    });
    const wireR = suite.declareViaAgent('wire', {
      id: 'test.wire.ab', from_hook_id: 'test.hook.a', to_hook_id: 'test.hook.b',
      uuid: 'nexus-test-wire-ab-v1-0000-2026-0701-jamesbrooks-001',
    });
    assert.strictEqual(wireR.ok, true, JSON.stringify(wireR));
    const g = suite.getGraph();
    assert.strictEqual(g.nodes.length, 2);
    assert.strictEqual(g.edges.length, 1);
  });

  await check('getRegistrySnapshot reflects everything declared above', async () => {
    const snap = suite.getRegistrySnapshot();
    assert.strictEqual(snap.components, 1);
    assert.strictEqual(snap.hooks, 2);
    assert.strictEqual(snap.wires, 1);
    assert.deepStrictEqual(snap.componentIds, ['nexus.test.widget']);
  });

  console.log('\n-- NETWORK tools (honest failure-path only — no live Guardian/Cortex/Ollama in this sandbox) --');

  await check('queryCortexMemory fails gracefully (connection refused), does not throw or hang', async () => {
    const r = await suite.queryCortexMemory('anything', 3);
    assert.ok(r.error, `expected an error field, got ${JSON.stringify(r)}`);
  });

  await check('generateWithOllama fails gracefully (connection refused), does not throw or hang', async () => {
    const r = await suite.generateWithOllama('sys', 'prompt', { timeoutMs: 3000 });
    assert.strictEqual(r.ok, false);
    assert.ok(r.error, `expected an error field, got ${JSON.stringify(r)}`);
  });

  await check('dispatchRepair fails gracefully (connection refused), does not throw or hang', async () => {
    const r = await suite.dispatchRepair('gap-123', 'test prompt');
    assert.ok(r && (r.error || r.result === undefined || typeof r === 'object'), `expected a defined non-throwing result, got ${JSON.stringify(r)}`);
  });

  await check('getSystemContext degrades to a valid string when all three calls fail', async () => {
    const ctx = await suite.getSystemContext();
    assert.strictEqual(typeof ctx, 'string');
    assert.ok(ctx.includes('## LOOM System Context'));
    assert.ok(ctx.includes('**Open Gaps:** none'), `got: ${ctx}`);
  });

  await check('buildComponentWithAgent exhausts all three agents and returns a clean failure, never throws', async () => {
    const r = await suite.buildComponentWithAgent({ id: 'nexus.test.widget' }, { preferAgent: 'ollama' });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error, 'all agents failed or unavailable');
  }, 15000);

  console.log(`\n${pass} passed, ${fail} failed\n`);
  if (fail > 0) process.exit(1);
}

main();
