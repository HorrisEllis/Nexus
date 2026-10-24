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
 *   PS-05  0.60.227 a later key with a phase id already defined (a note) never replaces the phase
 *   PS-06  0.60.227 PS2 every phase of every map has its .phase, and its .graph carries its DAG slice
 *   PS-07  0.60.228 PS3 the bundle: one uuid on the .phase and its .graph; the spec link (declared, or one module owning a non-hub file)
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const PS = require(path.join(ROOT, 'idearium/spec-compiler/compiler/phase-specs.js'));

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
    const dag = d.phaseEnv.payload.graph.dag;   // PS4: inside the .phase
    assert.ok(dag && dag.dagHash && Array.isArray(dag.upstream) && dag.lines.length, `${d.phase} has no dag slice`);
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
      // 0.60.238 PS4 (James: ".phase/.graph should be one file i feel like?"): the graph is inside the .phase, and no .graph is written
      const p = require(path.join(ROOT, 'lib/node-export.js')).fromYaml(fs.readFileSync(path.join(out, r.phaseFile), 'utf8'));
      assert.ok(p.payload.graph && p.payload.graph.hash === r.graphHash && Array.isArray(p.payload.graph.nodes), 'the graph, inside');
      assert.ok(!fs.existsSync(path.join(out, path.dirname(r.phaseFile), 'graph')), 'no graph/ folder');
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

// PS-05 / PS-06 — 0.60.227 PS2. James, 2026-10-24: "spec per component/capability/etc its in the specs. deocmpose all of the phases into
// .phase nodes including dag per phase."
test('PS-05', 'a later key with a phase id already defined is a note about it: the first definition is the phase (DAG and .phase)', () => {
  const PD = require(path.join(ROOT, 'lib/phase-dag.js'));
  const text = 'phases:\n  X1_real:\n    status: DONE 2026-10-01\n    depends_on: []\n    files: [lib/x.js]\nnotes:\n  changes:\n    X1_real: "a note that names it"\n';
  const n = PD.build([{ path: 'docs/x-phasemap.spec', text }]).nodes['docs/x-phasemap.spec::X1_real'];
  assert.deepStrictEqual([n.line, n.done, n.files], [1, true, ['lib/x.js']], 'the note did not replace it');
  const real = PD.build([{ path: 'docs/2026-10-15-clear-glass-network-posture-phasemap.spec', text: fs.readFileSync(path.join(ROOT, 'docs/2026-10-15-clear-glass-network-posture-phasemap.spec'), 'utf8') }]).nodes['docs/2026-10-15-clear-glass-network-posture-phasemap.spec::NP4_webrtc'];
  assert.strictEqual(real.line, 83, 'his NP4_webrtc is the phase at line 83, not the note at 336');
});

test('PS-06', "every phase of every map has its .phase, and its .graph carries its slice of the whole DAG", () => {
  const PF = require(path.join(ROOT, 'lib/phase-files.js'));
  const NE = require(path.join(ROOT, 'lib/node-export.js'));
  const maps = fs.readdirSync(path.join(ROOT, 'docs')).filter(f => f.endsWith('-phasemap.spec'));
  const have = new Map();
  for (const f of require('child_process').execSync('find . -name "*.phase" -not -path "*/node_modules/*"', { cwd: ROOT }).toString().trim().split('\n')) have.set(f.split('/phases/')[1], f);
  let n = 0; const missing = [];
  for (const f of maps) {
    const id = f.replace(/-phasemap\.spec$/, ''); const seen = new Set();
    for (const p of PF.phasesOf(fs.readFileSync(path.join(ROOT, 'docs', f), 'utf8'), `docs/${f}`)) { if (seen.has(p.id)) continue; seen.add(p.id); n++; if (!have.has(`${id}/${p.id}.phase`)) missing.push(`${id}/${p.id}`); }
  }
  assert.ok(n > 2000, `${n} phases`);
  assert.deepStrictEqual(missing.slice(0, 5), [], `${missing.length} phases have no .phase`);
  const one = NE.fromYaml(fs.readFileSync(path.join(ROOT, have.get('2026-09-28-graph-build-context-settings-memory/G0.phase')), 'utf8')).payload;
  assert.ok(one.graph && one.graph.hash, 'its graph, inside it (PS4)');
  const dag = one.graph.dag;
  assert.ok(dag && dag.dagHash && Array.isArray(dag.downstream), 'the graph carries its DAG slice');
});

// PS-07 — 0.60.228 PS3. James, 2026-10-24: "then we could have each .spec bundled with each .phase with each .dag. all with a id or uuid
// that matches them."
test('PS-07', 'one uuid per phase (its graph is inside it, PS4); a declared spec link carries its modules\' uuids; a hub file links nothing', () => {
  const NE = require(path.join(ROOT, 'lib/node-export.js'));
  assert.strictEqual(PS.bundleUuid('docs/a-phasemap.spec', 'X1'), PS.bundleUuid('docs/a-phasemap.spec', 'X1'), 'stable');
  assert.notStrictEqual(PS.bundleUuid('docs/a-phasemap.spec', 'X1'), PS.bundleUuid('docs/b-phasemap.spec', 'X1'));
  assert.match(PS.bundleUuid('m', 'p'), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const dir = path.join(ROOT, 'idearium/phases/2026-10-23-self-building-loop');
  const ph = NE.fromYaml(fs.readFileSync(path.join(dir, 'SL4_the_loop.phase'), 'utf8')).payload;
  assert.strictEqual(ph.uuid, PS.bundleUuid('docs/2026-10-23-self-building-loop-phasemap.spec', 'SL4_the_loop'));
  assert.ok(ph.graph && ph.graph.hash && !fs.existsSync(path.join(dir, 'graph')), 'one file: the graph inside, no graph/ folder');
  assert.strictEqual(NE.fromYaml(fs.readFileSync(path.join(dir, 'SL4_the_loop.phase'), 'utf8')).system, 'idearium', 'its owner is its system (PS4)');
  assert.deepStrictEqual([ph.specLink.how, ph.specLink.spec, ph.specLink.modules[0].id, ph.specLink.modules[0].uuid], ['declared', 'docs/self-building-loop.spec', 'MOD-SL-LOOP', 'nexus-sl-autobuild-loop-v1-0000-2026-1023-001']);
  const idx = PS.moduleIndex();
  assert.strictEqual(PS.specLinkOf({ spec: null, blocks: [], files: ['idearium/api/index.js'], idx, uses: new Map([['idearium/api/index.js', 171]]) }), null, 'declared by 7 modules, named by 171 phases: identifies nothing');
});

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
