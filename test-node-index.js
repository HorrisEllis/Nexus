'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const jaaTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'node-index-jaa-'));
process.env.JAA_DATA_DIR = jaaTmp;

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  \u2713 ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  \u2717 ${id} ${desc}\n    ${e.stack}`); failed++; }
}

const nodeExport = require('./lib/node-export.js');
const registry = require('./guardian/lib/node-registry.js');
const nodeIndex = require('./lib/node-index.js');

function makeTmpNodesDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'node-index-nodes-'));
}

(async () => {

await test('NI-001', 'a file drop indexes into a real, live jaaDB table (nodes_intent)', () => {
  const nodesTmp = makeTmpNodesDir();
  registry.start({ nodesDir: nodesTmp });
  const filePath = nodeExport.exportToFile('intent', 'ask', { name: 'ask', command: 'ask', description: 'general Q&A', system: 'guardian' }, {}, path.join(nodesTmp, 'intent'));
  registry._processFile('intent', filePath);

  const live = registry.queryLive('intent', (r) => r.id === 'ask');
  assert.strictEqual(live.length, 1);
  assert.strictEqual(live[0].payload.command, 'ask');
  registry.stop();
});

await test('NI-002', 'an edit logs a real "changed" ledger entry, not a second "added"', () => {
  const nodesTmp = makeTmpNodesDir();
  registry.start({ nodesDir: nodesTmp });
  const filePath = nodeExport.exportToFile('intent', 'ask-2', { name: 'ask', command: 'ask', description: 'v1', system: 'guardian' }, {}, path.join(nodesTmp, 'intent'));
  registry._processFile('intent', filePath);
  nodeExport.exportToFile('intent', 'ask-2', { name: 'ask', command: 'ask', description: 'v2 — edited', system: 'guardian' }, {}, path.join(nodesTmp, 'intent'));
  registry._processFile('intent', filePath);

  const hist = registry.nodeHistory('intent', 'ask-2');
  assert.strictEqual(hist.filter((h) => h.action === 'added').length, 1);
  assert.strictEqual(hist.filter((h) => h.action === 'changed').length, 1);

  const live = registry.queryLive('intent', (r) => r.id === 'ask-2');
  assert.strictEqual(live.length, 1); // upsert, not a second row
  assert.strictEqual(live[0].payload.description, 'v2 — edited');
  registry.stop();
});

await test('NI-003', 'deleting the real file soft-deletes the live index row and logs "deleted"', () => {
  const nodesTmp = makeTmpNodesDir();
  registry.start({ nodesDir: nodesTmp });
  const filePath = nodeExport.exportToFile('intent', 'temp', { name: 'temp', command: 'temp', description: 'x', system: 'guardian' }, {}, path.join(nodesTmp, 'intent'));
  registry._processFile('intent', filePath);
  assert.strictEqual(registry.queryLive('intent', (r) => r.id === 'temp').length, 1);

  fs.unlinkSync(filePath);
  registry._processFile('intent', filePath);

  assert.strictEqual(registry.queryLive('intent', (r) => r.id === 'temp').length, 0); // soft-deleted, filtered out
  const hist = registry.nodeHistory('intent', 'temp');
  assert.ok(hist.find((h) => h.action === 'deleted'));
  registry.stop();
});

await test('NI-004', 'the live index survives a real module reload — the in-memory registry does not, the jaaDB table does', () => {
  const nodesTmp = makeTmpNodesDir();
  registry.start({ nodesDir: nodesTmp });
  const filePath = nodeExport.exportToFile('tool', 'demo', { name: 'demo', description: 'x', parameters: {}, execute: 'n/a' }, {}, path.join(nodesTmp, 'tool'));
  registry._processFile('tool', filePath);
  registry.stop();

  // A real module reload — delete node-registry.js from require's cache and
  // require it fresh, the way a real process restart would. Its in-memory
  // _registry Map is module-scoped and gone; a genuinely fresh module has
  // never scanned this nodesDir at all.
  delete require.cache[require.resolve('./guardian/lib/node-registry.js')];
  const freshRegistry = require('./guardian/lib/node-registry.js');

  assert.strictEqual(freshRegistry.list('tool').length, 0, 'a genuinely fresh module instance has no in-memory record of this node at all');
  const live = freshRegistry.queryLive('tool', (r) => r.id === 'demo');
  assert.strictEqual(live.length, 1, 'the live jaaDB index still has it — it never depended on the in-memory Map');
});

await test('NI-005', 'a schema-invalid file is never indexed into the live jaaDB table', () => {
  const nodesTmp = makeTmpNodesDir();
  registry.start({ nodesDir: nodesTmp });
  const filePath = nodeExport.exportToFile('intent', 'broken', { name: 'broken' }, {}, path.join(nodesTmp, 'intent')); // missing command+description
  registry._processFile('intent', filePath);

  assert.strictEqual(registry.queryLive('intent', (r) => r.id === 'broken').length, 0);
  registry.stop();
});

})().then(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  fs.rmSync(jaaTmp, { recursive: true, force: true });
  process.exitCode = failed ? 1 : 0;
});
