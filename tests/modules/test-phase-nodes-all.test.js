'use strict';
/**
 * tests/modules/test-phase-nodes-all.test.js — SL9 (0.60.229): every phase a node, with its graph, beside the system that owns it.
 * James, 2026-10-23: "can you decompose the phases into .phase with the dependancy graph per phase node. then move them into the
 * repsective systems, or sort them at least."
 *
 *   PN-01  writeAll over a fixture tree: one .phase and one .graph per phase, owned by its files' system; a phase with no files goes to
 *          its map's system; decisions and findings are not written; a repeated id is one phase (the first)
 *   PN-02  the .phase keeps what the map authors (declared depends_on); the .graph's slice names every edge's kind, and an agent
 *          mapping (SL8) places a phase nothing else could, said as agent:<by>
 *   PN-03  deterministic: a second pass writes nothing; adding a phase changes it and only the phases whose slice it enters; checkAll is clean; an old copy at another
 *          place is archived, not deleted; INDEX.md per owner
 *   PN-04  Nexus's own tree: every phase of every map has its .phase; drift (code moved on under a graph) is counted and said
 *   PN-05  GET /api/repos/:uuid/phases/nodes reads what is written, through lib (no idearium → emerge crossing); `repo nodes`; the rail
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const P = require(path.join(ROOT, 'lib', 'emerge', 'compiler', 'phase-specs.js'));
const NE = require(path.join(ROOT, 'lib/node-export.js'));

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}
const quiet = (fn) => { const l = console.log; console.log = () => {}; try { return fn(); } finally { console.log = l; } };

// a fixture tree shaped like Nexus: docs/ maps, a guardian/ system and lib/ (core)
const tree = fs.mkdtempSync(path.join(os.tmpdir(), 'pn-'));
const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(tree, rel)), { recursive: true }); fs.writeFileSync(path.join(tree, rel), text); };
put('guardian/server.js', "require('./lib/jobs.js');\n");
put('guardian/lib/jobs.js', 'module.exports = {};\n');
put('lib/base.js', 'module.exports = 1;\n');
const MAP = `spec:
  meta:
    name: t
  root_findings:
    RF1_a_fact:
      evidence: the store was shared
  decisions:
    D1_which:
      status: OPEN
  phases:
    G1_jobs:
      status: OPEN
      depends_on: []
      files: [guardian/lib/jobs.js]
    G2_more_jobs:
      status: OPEN
      depends_on: [G1_jobs]
      files: [guardian/server.js]
    G3_vague:
      status: OPEN
      depends_on: []
      does: something nobody can place
    L1_base:
      status: DONE
      depends_on: []
      files: [lib/base.js]
  changes_here:
    G1_jobs:
      note: a later dictionary key, not a phase
`;
put('docs/t-phasemap.spec', MAP);
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pn-out-'));
const opts = { root: tree, out, mapsDir: path.join(tree, 'docs'), mappings: { 'docs/t-phasemap.spec::G3_vague': { files: [{ path: 'guardian/lib/vague.js', exists: false }], dependsOn: ['docs/t-phasemap.spec::G1_jobs'], by: 'agent:scripted', at: 1 } } };
const read = (rel) => NE.fromYaml(fs.readFileSync(path.join(out, rel), 'utf8')).payload;

test('PN-01', 'one .phase + .graph per phase, under its owner; decisions, findings and a repeated id are not phases', () => {
  const r = quiet(() => P.writeAll(opts));
  assert.strictEqual(r.written, 4, JSON.stringify(r.rows.map(x => x.phaseFile)));
  const files = r.rows.map(x => x.phaseFile).sort();
  assert.deepStrictEqual(files, ['guardian/phases/t/G1_jobs.phase', 'guardian/phases/t/G2_more_jobs.phase', 'guardian/phases/t/G3_vague.phase', 'lib/phases/t/L1_base.phase']);
  assert.ok(!fs.existsSync(path.join(out, 'guardian/phases/t/RF1_a_fact.phase')) && !fs.existsSync(path.join(out, 'guardian/phases/t/D1_which.phase')));
  assert.strictEqual(read('guardian/phases/t/G1_jobs.phase').status, 'OPEN', 'the phase, not the dictionary key under changes_here:');
});

test('PN-02', 'the .phase is what the map authors; the .graph names every edge\'s kind; an agent mapping places the vague one', () => {
  assert.deepStrictEqual(read('guardian/phases/t/G2_more_jobs.phase').depends_on, ['G1_jobs']);
  assert.deepStrictEqual(read('guardian/phases/t/G3_vague.phase').depends_on, [], 'an agent edge is not authored');
  const g3 = fs.readdirSync(path.join(out, 'guardian/phases/t/graph')).find(f => f.startsWith('G3_vague-'));
  const gp = read(`guardian/phases/t/graph/${g3}`);
  assert.strictEqual(gp.ready, true); assert.strictEqual(gp.mappedBy, 'agent:scripted');
  assert.deepStrictEqual(gp.dag.edges, [{ from: 'docs/t-phasemap.spec::G1_jobs', kind: 'agent:scripted' }]);
  const g2 = fs.readdirSync(path.join(out, 'guardian/phases/t/graph')).find(f => f.startsWith('G2_more_jobs-'));
  assert.deepStrictEqual(read(`guardian/phases/t/graph/${g2}`).dag.edges, [{ from: 'docs/t-phasemap.spec::G1_jobs', kind: 'declared' }]);
});

test('PN-03', 'a second pass writes nothing; one added phase changes one; an old copy elsewhere is archived; INDEX.md per owner', () => {
  assert.strictEqual(quiet(() => P.writeAll(opts)).changed, 0);
  put('docs/t-phasemap.spec', MAP.replace('  changes_here:', '    G4_new:\n      status: OPEN\n      depends_on: [G2_more_jobs]\n      files: [guardian/lib/four.js]\n  changes_here:'));
  const r = quiet(() => P.writeAll(opts));
  // the new phase, and only the phases whose slice it enters (G4 depends on G2, which depends on G1: their downstream lists name it)
  assert.deepStrictEqual(r.rows.filter(x => x.changed).map(x => x.phase).sort(), ['G1_jobs', 'G2_more_jobs', 'G4_new']);
  assert.deepStrictEqual(quiet(() => P.checkAll(opts)).filter(x => x.drift.length), []);
  // an old copy of L1 placed by an older pass under guardian/ moves to _archive/phases-moved
  fs.copyFileSync(path.join(out, 'lib/phases/t/L1_base.phase'), path.join(out, 'guardian/phases/t/L1_base.phase'));
  const r2 = quiet(() => P.writeAll(opts));
  assert.deepStrictEqual(r2.moved.map(m => m.from), ['guardian/phases/t/L1_base.phase']);
  assert.ok(fs.existsSync(path.join(out, '_archive/phases-moved/guardian/phases/t/L1_base.phase')));
  const idx = fs.readFileSync(path.join(out, 'guardian/phases/INDEX.md'), 'utf8');
  assert.ok(/\| \[G3_vague\]\(t\/G3_vague\.phase\) \| pending \| \d+ \| agent-mapped \|/.test(idx), idx);
});

test('PN-04', "Nexus's tree: every phase of every map has its .phase; drift (a graph whose files' code moved on) is counted, said", () => {
  const c = quiet(() => P.checkAll({}));
  assert.ok(c.length > 1500, `${c.length} phases`);
  const none = c.filter(x => x.drift.includes('no .phase written'));
  assert.deepStrictEqual(none.slice(0, 5).map(x => x.key), [], `${none.length} phase(s) with no node — run node emerge/compiler/phase-specs.js --all`);
  const drift = c.filter(x => x.drift.length).length;
  if (drift) console.log(`    (${drift} node(s) drifted from the code their graph names — refreshed by phase-specs.js --all at release)`);
});

(async () => {
  process.env.NEXUS_VERSIONIUM_URL = 'http://127.0.0.1:9';
  try {
    const l = console.log, w = console.warn, er = console.error; console.log = () => {}; console.warn = () => {}; console.error = () => {};
    let api, made;
    try {
      api = await import(path.join(ROOT, 'idearium/api/index.js'));
      for (let i = 0; i < 20; i++) { made = await api.getRepoLayer().ingest({ name: `pn-${Date.now()}`, source: 'test', compartmentId: 'c-pn', files: [{ path: 'docs/t-phasemap.spec', content: MAP }, { path: 'lib/base.js', content: 'module.exports = 1;\n' }] }); if (!(made && made.error && /no spec-engine/.test(made.error))) break; await new Promise(x => setTimeout(x, 250)); }
    } finally { console.log = l; console.warn = w; console.error = er; }
    const r = await api._route('GET', `/api/repos/${made.repo.uuid}/phases/nodes`);
    const d = r.json.data || r.json;
    assert.strictEqual(r.status, 200, JSON.stringify(r.json).slice(0, 300));
    assert.deepStrictEqual([d.phases, d.nodes, d.missingCount], [4, 0, 4]); assert.ok(/phase-specs\.js --all/.test(d.remedy));
    const { pathToFileURL } = require('url');
    const RC = await import(pathToFileURL(path.join(ROOT, 'idearium/cli/route-commands.js')).href);
    assert.strictEqual(RC.SPEC.find(x => x.key === 'repo.nodes').req({ repo: { uuid: 'u' }, args: [], flags: {} }).path, '/api/repos/u/phases/nodes');
    assert.ok(/function phNodes[\s\S]{0,300}phases\/nodes/.test(fs.readFileSync(path.join(ROOT, 'idearium/ui/js/phases.js'), 'utf8')));
    console.log('  ✓ PN-05 the route reads what is written (no emerge require): nodes, phases without one, the remedy; the command row and the rail'); passed++;
  } catch (e) { console.error(`  ✗ PN-05 the route, the command and the rail\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
