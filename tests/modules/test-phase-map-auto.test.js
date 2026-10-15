'use strict';
/**
 * tests/modules/test-phase-map-auto.test.js — MP1 + MP2 (docs/2026-10-15-warp-builds-and-spec-framework-phasemap.spec)
 * James, 2026-10-15: "It doesn't know how to map. Nexus needs to generate dependancies for each phase, with files. The
 * agent keeps having to find context, with tools. Need them all mapped. Need that be automatic for every new phase from
 * any project."
 * A fixture project on disk (not Nexus) proves "any project"; MA-08 runs on Nexus's own tree.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const AM = require(path.join(ROOT, 'lib/phase-map-auto.js'));
const PF = require(path.join(ROOT, 'lib/phase-files.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-map-auto-'));
const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(TMP, rel)), { recursive: true }); fs.writeFileSync(path.join(TMP, rel), text); };
w('src/ledger-store.js', "const util = require('./util');\nfunction appendEntry(x) { return util.clean(x); }\nmodule.exports = { appendEntry };\n");
w('src/util.js', "function clean(x) { return x; }\nmodule.exports = { clean };\n");
w('src/api.js', "const L = require('./ledger-store.js');\nmodule.exports = (r) => L.appendEntry(r);\n");
w('src/listener.js', "module.exports = 1;\n");
const MAP = `phases:
  A1_declared:
    status: OPEN
    files: [src/api.js]
  A2_named_path:
    status: OPEN
    does: "teach src/ledger-store.js to keep a cursor"
  A3_code_name:
    status: OPEN
    does: "make \`appendEntry()\` refuse an empty record"
  A4_module_name:
    status: OPEN
    does: "the ledger-store gains a second index; the listener is not touched"
  A5_nothing:
    status: OPEN
    does: "think about naming"
  A6_after_a2:
    status: OPEN
    does: "src/ledger-store.js compaction"
`;
w('docs/app-phasemap.spec', MAP);
const env = AM.envFromTree(TMP);
const phases = PF.phasesOf(MAP, 'docs/app-phasemap.spec');
const res = AM.mapPhases(phases, env);
const by = (id) => res.find(r => r.id === id);
const paths = (r) => r.files.map(f => f.path);

(async () => {
  await test('MA-01', 'a phase\'s declared files are kept as declared', async () => {
    assert.strictEqual(by('A1_declared').source, 'declared');
    assert.deepStrictEqual(paths(by('A1_declared')), ['src/api.js']);
  });
  await test('MA-02', 'a real path in the phase\'s words is mapped, with what it requires and who requires it', async () => {
    const r = by('A2_named_path');
    assert.strictEqual(r.source, 'evidence');
    assert.deepStrictEqual(paths(r), ['src/ledger-store.js']);
    assert.strictEqual(r.files[0].why, 'named in the phase');
    assert.deepStrictEqual(r.requires.map(x => x.path), ['src/util.js']);
    assert.deepStrictEqual(r.consumers.map(x => x.path), ['src/api.js']);
  });
  await test('MA-03', 'a code name the phase mentions resolves to the file that defines it', async () => {
    const r = by('A3_code_name');
    assert.deepStrictEqual(paths(r), ['src/ledger-store.js']);
    assert.strictEqual(r.files[0].why, 'defines appendEntry');
  });
  await test('MA-04', 'a hyphenated module name maps; a plain word ("listener") does not', async () => {
    const r = by('A4_module_name');
    assert.deepStrictEqual(paths(r), ['src/ledger-store.js']);
    assert.ok(!paths(r).includes('src/listener.js'));
  });
  await test('MA-05', 'a phase with no evidence is "none" — the only case left for a model', async () => {
    assert.strictEqual(by('A5_nothing').source, 'none');
    assert.deepStrictEqual(paths(by('A5_nothing')), []);
  });
  await test('MA-06', 'a phase waits on the earlier phase that changes the same file (inferred, not written)', async () => {
    const d = by('A6_after_a2').dependsOnInferred;
    assert.ok(d.some(x => x.on === 'A4_module_name' && x.file === 'src/ledger-store.js'), JSON.stringify(d));
  });
  await test('MA-07', 'automatic in any project: the Phases view carries the mapping, and a phase added later is announced as new', async () => {
    const PH = await import(path.join(ROOT, 'idearium/repo/phases.js'));
    const repo = { uuid: 'fixture', name: 'fixture', files: [{ path: 'docs/app-phasemap.spec' }] };
    const seenFile = path.join(TMP, 'seen.json');
    const v1 = PH.managerView({ repo, repoDir: TMP, seenFile });
    assert.ok(!v1.mapping.error, v1.mapping.error);
    assert.strictEqual(v1.mapping.evidence, 4); assert.strictEqual(v1.mapping.none, 1); assert.strictEqual(v1.mapping.declared, 1);
    assert.deepStrictEqual(v1.mapping.newPhases, [], 'the first read is the baseline');
    const n = v1.phases.find(p => p.phase_key === 'A3_code_name');
    assert.strictEqual(n.mapped.files[0].path, 'src/ledger-store.js');
    w('docs/app-phasemap.spec', MAP + '  A7_new:\n    status: OPEN\n    does: "src/util.js gains trim"\n');
    const v2 = PH.managerView({ repo, repoDir: TMP, seenFile });
    assert.deepStrictEqual(v2.mapping.newPhases, ['docs/app-phasemap.spec::A7_new']);
    assert.deepStrictEqual(v2.phases.find(p => p.phase_key === 'A7_new').mapped.files.map(f => f.path), ['src/util.js']);
  });
  await test('MA-08', 'Nexus\'s own tree: every phasemap maps in seconds, most open phases with evidence', async () => {
    const t0 = Date.now();
    const maps = fs.readdirSync(path.join(ROOT, 'docs')).filter(f => /phase-?map.*\.spec$/.test(f)).map(f => ({ path: `docs/${f}`, text: fs.readFileSync(path.join(ROOT, 'docs', f), 'utf8') }));
    const r = AM.forMaps({ root: ROOT, maps, specsOf: AM.specsOfNexus(ROOT) });
    const open = [...r.byKey.values()].filter(m => m.source !== 'declared');
    const none = open.filter(m => m.source === 'none').length;
    assert.ok(Date.now() - t0 < 15000, `took ${Date.now() - t0} ms`);
    assert.ok(none < open.length / 2, `${none} of ${open.length} undeclared phases have no evidence`);
    const wb1 = r.byKey.get('docs/2026-10-15-warp-builds-and-spec-framework-phasemap.spec::WB1_warp_at_the_rung');
    assert.ok(wb1 && wb1.consumers.length, 'WB1 names who requires its files');
  });

  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
