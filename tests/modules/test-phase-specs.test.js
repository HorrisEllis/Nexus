'use strict';
/**
 * tests/modules/test-phase-specs.test.js — PS1 (docs/substrate.spec MOD-PHASE-SPECS): every phase specced again, with its DAG and
 * related files, beside its owner system.
 * James, 2026-10-20: "specs, then phases then specced again with dag and related files for it, look at the handoff"
 *
 *   PS-01  derive() on the belief-loop map: every phase's blocks resolve in docs/belief-loop.spec, its graph is ready and carries
 *          the DAG slice (deps, upstream, lines), its owner resolves to a folder
 *   PS-02  write() into a temp folder gives <owner>/phases/<map-id>/<phase>.phase and graph/<phase>-<hash>.graph; check() on that
 *          folder reports no drift; a phase file edited by hand is reported as drift
 *   PS-03  pipeline-nodes graphNode keeps graph.dag (it dropped it before 2026-10-20)
 *   PS-04  the committed per-phase nodes of both 2026-10-20 maps exist for every phase (written, not only derivable)
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const PS = require(path.join(ROOT, 'lib', 'emerge', 'compiler', 'phase-specs.js'));

let passed = 0, failed = 0;
function test(id, desc, fn) { try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack.split('\n').slice(0, 5).join('\n    ')}`); failed++; } }
const quiet = (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = l; console.warn = w; } };
const MAP = 'docs/2026-10-20-belief-loop-phasemap.spec';

console.log('\ntest-phase-specs — each phase specced again with its DAG and related files');
const derived = quiet(() => PS.derive({ map: MAP }));

test('PS-01', 'derive: blocks resolve, graphs ready with the DAG slice, owners resolved', () => {
  assert.strictEqual(derived.length, 16);
  for (const d of derived) {
    assert.deepStrictEqual(d.blocks.missing, [], `${d.phase}: ${d.blocks.missing}`);
    assert.ok(d.ready, `${d.phase} graph not ready`);
    const dag = d.graphEnv.payload.dag;
    // 0.60.229 SL9: the whole DAG's hash is no longer stored per phase (every node changed on any edit anywhere); the slice is
    assert.ok(dag && !('dagHash' in dag) && 'layer' in dag && Array.isArray(dag.upstream) && Array.isArray(dag.edges) && dag.lines.length, `${d.phase} has no dag slice`);
    assert.ok(/^(lib|[a-z-]+)\/phases\/2026-10-20-belief-loop$/.test(d.dir.split(path.sep).join('/')), d.dir);
  }
  const cf = derived.find(d => d.phase === 'CF1_confidence_from_evidence');
  assert.deepStrictEqual(cf.phaseEnv.payload.blocks, ['MOD-CONFIDENCE']);
  assert.deepStrictEqual(cf.phaseEnv.payload.depends_on, ['EW1_evidence_record_and_weights']);
});

test('PS-02', 'write to a temp folder, check finds no drift; a hand edit is drift', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ps1-'));
  try {
    const rows = quiet(() => PS.write({ map: MAP, out }));
    for (const r of rows) {
      assert.ok(fs.existsSync(path.join(out, r.phaseFile)) && r.phaseFile.endsWith(`/${r.phase}.phase`), r.phaseFile);
      assert.ok(fs.existsSync(path.join(out, r.graphFile)) && r.graphFile.endsWith(`/graph/${r.phase}-${r.graphHash}.graph`), r.graphFile);
    }
    const clean = quiet(() => PS.check({ map: MAP, out }));
    assert.deepStrictEqual(clean.filter(c => c.drift.length).map(c => [c.phase, c.drift]), []);
    const f = path.join(out, rows[0].phaseFile);
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/status: OPEN/, 'status: done'));
    const dirty = quiet(() => PS.check({ map: MAP, out })).find(c => c.phase === rows[0].phase);
    assert.ok(dirty.drift.some(x => /differs/.test(x)), JSON.stringify(dirty));
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});

test('PS-03', 'graphNode keeps the dag slice', () => {
  const PN = require(path.join(ROOT, 'lib/pipeline-nodes.js'));
  const env = PN.graphNode({ phase: 'X1', hash: 'abc', nodes: [], dag: { dagHash: 'h', upstream: ['a'] } }, { kind: 'phase' });
  assert.deepStrictEqual(env.payload.dag, { dagHash: 'h', upstream: ['a'] });
  assert.strictEqual(PN.graphNode({ phase: 'X1', hash: 'abc', nodes: [] }, { kind: 'phase' }).payload.dag, undefined, 'no dag, no field');
});

test('PS-04', 'the committed per-phase nodes exist for every phase of both maps', () => {
  for (const map of [MAP, 'docs/2026-10-20-substrate-graph-traversal-chunking-gating-phasemap.spec']) {
    const ds = map === MAP ? derived : quiet(() => PS.derive({ map }));
    for (const d of ds) assert.ok(fs.existsSync(path.join(ROOT, d.dir, `${d.phase}.phase`)), `${d.dir}/${d.phase}.phase not committed`);
  }
});

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
