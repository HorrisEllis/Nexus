'use strict';
/**
 * tests/modules/test-table-materializer.js — real tests for
 * cortex/tools/table-materializer.js, using a real, isolated temp
 * directory tree per test (not mocked), same discipline as every other
 * scanner/tool test in this folder. Redirects gap-field's writes to a
 * real, isolated jaaDB the same way test-node-index.js redirects
 * JAA_DATA_DIR, so this never touches the live gaps table.
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const jaaTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'table-mat-jaa-'));
process.env.JAA_DATA_DIR = jaaTmp;

const { materializeTable } = require(path.join(ROOT, 'cortex/tools/table-materializer.js'));
const nodeExport = require(path.join(ROOT, 'lib/node-export.js'));

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}

function tmpNodesRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'table-mat-nodes-'));
}

(() => {
  test('TM-001', 'dryRun (default) reports counts but writes nothing', () => {
    const nodesRoot = tmpNodesRoot();
    const rows = [
      { uuid: 'guardian.health', route: { method: 'GET', path: '/health' }, served: true },
    ];
    const summary = materializeTable({
      table: 'components',
      nodeType: 'component',
      rows,
      toPayload: (r) => ({ id: r.uuid, uuid: r.uuid, namespace: 'guardian', name: 'health', version: '1.0.0' }),
      fingerprint: (r) => `${r.route.method} ${r.route.path}`,
      ownerOf: () => 'guardian',
      destRootFor: (system) => path.join(nodesRoot, system, 'data', 'nodes'),
    });
    assert.strictEqual(summary.created, 1);
    assert.strictEqual(summary.dryRun, true);
    assert.ok(!fs.existsSync(path.join(nodesRoot, 'guardian', 'data', 'nodes', 'component')), 'dryRun must not create any real file');
  });

  test('TM-002', 'a proven, novel row becomes a real new node file in its owner\'s directory', () => {
    const nodesRoot = tmpNodesRoot();
    const rows = [
      { uuid: 'guardian.health', route: { method: 'GET', path: '/health' } },
    ];
    const summary = materializeTable({
      table: 'components', nodeType: 'component', rows, dryRun: false,
      toPayload: (r) => ({ id: r.uuid, uuid: r.uuid, namespace: 'guardian', name: 'health', version: '1.0.0' }),
      fingerprint: (r) => `${r.route.method} ${r.route.path}`,
      ownerOf: () => 'guardian',
      destRootFor: (system) => path.join(nodesRoot, system, 'data', 'nodes'),
    });
    assert.strictEqual(summary.created, 1);
    const file = path.join(nodesRoot, 'guardian', 'data', 'nodes', 'component', 'guardian.health.component');
    assert.ok(fs.existsSync(file), 'real node file must exist at the owner-routed path');
    const doc = nodeExport.importFromFile(file);
    assert.strictEqual(doc.occurrences, 1);
    assert.strictEqual(doc.fingerprint, 'GET /health');
  });

  test('TM-003', 'a second row with the same fingerprint bumps occurrences on the existing node, creates no new file', () => {
    const nodesRoot = tmpNodesRoot();
    const common = {
      table: 'components', nodeType: 'component', dryRun: false,
      toPayload: (r) => ({ id: r.uuid, uuid: r.uuid, namespace: 'guardian', name: 'health', version: '1.0.0' }),
      fingerprint: (r) => `${r.route.method} ${r.route.path}`,
      ownerOf: () => 'guardian',
      destRootFor: (system) => path.join(nodesRoot, system, 'data', 'nodes'),
    };
    materializeTable({ ...common, rows: [{ uuid: 'guardian.health', route: { method: 'GET', path: '/health' } }] });
    const summary2 = materializeTable({ ...common, rows: [{ uuid: 'guardian.health.dup', route: { method: 'GET', path: '/health' } }] });
    assert.strictEqual(summary2.created, 0, 'must not create a second file for the same real fingerprint');
    assert.strictEqual(summary2.bumped, 1);
    const dir = path.join(nodesRoot, 'guardian', 'data', 'nodes', 'component');
    assert.strictEqual(fs.readdirSync(dir).length, 1, 'exactly one real file, not two');
    const doc = nodeExport.importFromFile(path.join(dir, 'guardian.health.component'));
    assert.strictEqual(doc.occurrences, 2, 'occurrences must be bumped on the ORIGINAL node');
  });

  test('TM-004', 'GATE: a row that fails proofCheck becomes a gap, never a node file', () => {
    const nodesRoot = tmpNodesRoot();
    const rows = [
      { uuid: 'guardian.ghost', route: { method: 'GET', path: '/ghost' } }, // declared, nothing real serves it
    ];
    const summary = materializeTable({
      table: 'components', nodeType: 'component', rows, dryRun: false,
      toPayload: (r) => ({ id: r.uuid, uuid: r.uuid, namespace: 'guardian', name: 'ghost', version: '1.0.0' }),
      fingerprint: (r) => `${r.route.method} ${r.route.path}`,
      ownerOf: () => 'guardian',
      proofCheck: () => ({ ok: false, reason: 'no real route serves this declaration' }),
      destRootFor: (system) => path.join(nodesRoot, system, 'data', 'nodes'),
    });
    assert.strictEqual(summary.created, 0);
    assert.strictEqual(summary.skippedUnproven, 1);
    assert.ok(!fs.existsSync(path.join(nodesRoot, 'guardian', 'data', 'nodes', 'component', 'guardian.ghost.component')), 'an unproven row must never become a node file');
    assert.strictEqual(summary.gapsReported.length, 1, 'the unproven row must be reported as a real gap, not silently dropped');
  });

  test('TM-005', 'a row whose owner cannot be determined stays under cortex, never guessed into a system', () => {
    const nodesRoot = tmpNodesRoot();
    const rows = [{ uuid: 'mystery.thing', route: { method: 'GET', path: '/mystery' } }];
    const summary = materializeTable({
      table: 'components', nodeType: 'component', rows, dryRun: false,
      toPayload: (r) => ({ id: r.uuid, uuid: r.uuid, namespace: 'unknown', name: 'mystery', version: '1.0.0' }),
      fingerprint: (r) => `${r.route.method} ${r.route.path}`,
      ownerOf: () => null, // real, honest "cannot determine"
      destRootFor: (system) => path.join(nodesRoot, system, 'data', 'nodes'),
    });
    assert.strictEqual(summary.created, 1);
    assert.ok(fs.existsSync(path.join(nodesRoot, 'cortex', 'data', 'nodes', 'component', 'mystery.thing.component')), 'undeterminable ownership must fall back to cortex, not a guess');
  });

  test('TM-006', 'a row whose payload fails schema validation is skipped, not silently written', () => {
    const nodesRoot = tmpNodesRoot();
    const rows = [{ uuid: 'guardian.broken' }];
    const summary = materializeTable({
      table: 'components', nodeType: 'component', rows, dryRun: false,
      toPayload: () => ({ id: 'guardian.broken' }), // missing required namespace/name/version
      fingerprint: (r) => r.uuid,
      ownerOf: () => 'guardian',
      destRootFor: (system) => path.join(nodesRoot, system, 'data', 'nodes'),
    });
    assert.strictEqual(summary.created, 0);
    assert.strictEqual(summary.skippedInvalid, 1);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
})();
