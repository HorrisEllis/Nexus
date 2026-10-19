'use strict';
const os = require('os');
const fs = require('fs');
const path = require('path');
// §CR1 — isolate the component store to a temp dir BEFORE requiring it (storeDir reads NEXUS_COMPONENTS_DIR)
process.env.NEXUS_COMPONENTS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cr1-store-'));
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-project-registry.test.js — CR1 (0.60.164).
 * James, 2026-10-19: "the component registry is vital for each project becuase its the spine that makes components dumb."
 * The contract build path never joined the component store; a contract-built project had no registry/spine. wireBuilt puts
 * every built file into the project's store WITH its resolved require edges — so a small local model's dumb component
 * composes against the spine.
 *
 *   CR-01  wireBuilt stores every built file; a file that requires a sibling resolves to a real dependency EDGE
 *   CR-02  the dependency order matters: a consumer stored after its dependency gets the edge
 *   CR-03  an unresolved import (a sibling not built) is counted unresolved, not a false edge
 *   CR-04  a non-leaf file with no edge and no consumer is reported as standalone (rule 3: an isolated dot); a leaf is not
 *   CR-05  read() returning '' skips the file; a store failure of one file never throws
 */
const assert = require('assert');
const PR = require('../../lib/project-registry.js');
const CS = require('../../lib/component-store.js');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e.message}`); failed++; }
}

// a tiny two-file project: lib/b.js requires ./a.js  → an edge b→a
const FILES = {
  'lib/a.js': "function a(){ return 1; }\nmodule.exports = { a };\n",
  'lib/b.js': "const { a } = require('./a.js');\nfunction b(){ return a() + 1; }\nmodule.exports = { b };\n",
  'lib/loner.js': "function loner(){ return 'alone'; }\nmodule.exports = { loner };\n",   // nothing requires it, requires nothing
  'index.js': "module.exports = require('./lib/b.js');\n",
};
const read = (f) => FILES[f] || '';

test('CR-01', 'wireBuilt stores every built file; b→a is a real resolved edge', () => {
  const r = PR.wireBuilt({ project: 'demo-cr1', repoUuid: 'r1', phase: 'P0', files: ['lib/a.js', 'lib/b.js'], read });
  assert.strictEqual(r.stored, 2, `stored ${r.stored}`);
  assert.ok(r.resolved >= 1, `expected >=1 resolved edge, got ${r.resolved}`);
  // b's manifest lists a as a dependency
  const bId = CS.list().find(c => c.path === 'lib/b.js').id;
  const m = CS.manifest(bId);
  const deps = Object.keys(m.dependencies || {});
  assert.ok(deps.some(d => /lib.a$/.test(d) || /_a$/.test(d)), `b's deps do not include a: ${JSON.stringify(deps)}`);
});

test('CR-02', 'dependency order: a stored before b, so the edge resolves (not unresolved)', () => {
  const r = PR.wireBuilt({ project: 'demo-cr2', repoUuid: 'r1', phase: 'P0', files: ['lib/a.js', 'lib/b.js'], read });
  assert.strictEqual(r.unresolved, 0, `expected 0 unresolved when a precedes b, got ${r.unresolved}`);
  assert.ok(r.resolved >= 1);
});

test('CR-03', 'b before a: a is not in the store yet, so b.require(./a) is unresolved, not a false edge', () => {
  const r = PR.wireBuilt({ project: 'demo-cr3', repoUuid: 'r1', phase: 'P0', files: ['lib/b.js'], read });   // only b
  assert.strictEqual(r.stored, 1);
  assert.ok(r.unresolved >= 1, `b alone should have an unresolved import, got ${r.unresolved}`);
  assert.strictEqual(r.resolved, 0, 'no false edge to an unbuilt file');
});

test('CR-04', 'a non-leaf loner is reported standalone; a leaf (index.js) is not', () => {
  const r = PR.wireBuilt({ project: 'demo-cr4', repoUuid: 'r1', phase: 'P0', files: ['lib/a.js', 'lib/b.js', 'lib/loner.js', 'index.js'], read });
  assert.ok(r.standalone.includes('lib/loner.js'), `loner should be standalone: ${JSON.stringify(r.standalone)}`);
  assert.ok(!r.standalone.includes('index.js'), 'index.js is a leaf, not flagged');
  assert.ok(!r.standalone.includes('lib/a.js'), 'a is consumed by b, not standalone');
});

test('CR-05', "read()='' skips the file; nothing throws", () => {
  const r = PR.wireBuilt({ project: 'demo-cr5', repoUuid: 'r1', phase: 'P0', files: ['lib/a.js', 'does/not/exist.js'], read });
  assert.strictEqual(r.stored, 1, 'only the file with content is stored');
});

console.log(`\n  ${passed} passed, ${failed} failed`);
try { fs.rmSync(process.env.NEXUS_COMPONENTS_DIR, { recursive: true, force: true }); } catch (_) {}
process.exit(failed ? 1 : 0);
