'use strict';
/**
 * tests/modules/test-phase-groom.test.js — SL3 (0.60.227): the dependency graph made whole.
 * James, 2026-10-23: "need to do something about the dependancy graph."
 *
 *   GR-01  a depends_on item is read as its phase id: a note after the id is not a phase; prose is prose (said), never dangling;
 *          an apostrophe inside prose is a letter, not a quote
 *   GR-02  MP1's inferred { on, file } edges join the DAG (they were String()ed to '[object Object]'); one that would close a cycle
 *          is left out and listed
 *   GR-03  DG1 checks every phase: one under spec:/phases_added_…, and one in a map that is not strict YAML (read as the DAG reads it)
 *   GR-04  groom: files from a phase's own words, depends_on from a shared file, a same-file order; cycles/dangling/prose for a
 *          person; apply adds only keys a phase lacks and keeps the phase count
 *   GR-05  Nexus's own maps: no cycle, at most the 2 real dangling references, every open phase checked by DG1
 *   GR-06  the real router: POST …/phases/groom is a dry run, apply writes through the map writer; the command row and the rail
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
process.env.NEXUS_VERSIONIUM_URL = 'http://127.0.0.1:9';
const PD = require(path.join(ROOT, 'lib/phase-dag.js'));
const DG = require(path.join(ROOT, 'lib/phase-deps-gate.js'));
const G = require(path.join(ROOT, 'lib/phase-groom.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn, er = console.error; console.log = () => {}; console.warn = () => {}; console.error = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; console.error = er; } };

const A = `spec:
  meta:
    name: a
  phases:
    A0_base:
      status: DONE
      depends_on: []
      files: [lib/base.js]
    A1_note:
      status: OPEN
      depends_on: ["A0_base (the base, first)", each phase's code landing]
      files: [lib/one.js]
    A2_words:
      status: OPEN
      does: extends lib/one.js and lib/two.js with a reader
    A3_same:
      status: OPEN
      files: [lib/one.js]
    A4_ghost:
      status: OPEN
      depends_on: [ZZ9_nowhere]
      files: [lib/four.js]
`;

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'groom-'));
  for (const f of ['lib/base.js', 'lib/one.js', 'lib/two.js', 'lib/four.js']) { fs.mkdirSync(path.join(tmp, path.dirname(f)), { recursive: true }); fs.writeFileSync(path.join(tmp, f), 'module.exports = 1;\n'); }
  const maps = [{ path: 'docs/a-phasemap.spec', text: A }];

  await test('GR-01', 'a note after an id is not a phase; prose is said, not dangling; an apostrophe is a letter', () => {
    const d = PD.build(maps);
    const a1 = d.nodes['docs/a-phasemap.spec::A1_note'];
    assert.deepStrictEqual(a1.deps, ['docs/a-phasemap.spec::A0_base']);
    assert.deepStrictEqual(d.prose.map(x => x.text), ["each phase's code landing"]);
    assert.deepStrictEqual(d.dangling.map(x => x.ref), ['ZZ9_nowhere']);
    assert.strictEqual(PD.refKey('SN0_one_branch (snapshot-compartments)'), 'SN0_one_branch');
    assert.strictEqual(PD.refKey('staging S0'), 'S0');
    assert.strictEqual(PD.refKey('each phase'), null);
  });

  await test('GR-02', "MP1's { on, file } edges join the DAG; one closing a cycle is left out and listed", () => {
    const mapped = { 'docs/a-phasemap.spec::A3_same': { files: [{ path: 'lib/one.js', exists: true }], dependsOnInferred: [{ on: 'A1_note', file: 'lib/one.js' }] } };
    const d = PD.build(maps, { mapped });
    assert.ok(d.edges.some(e => e.kind === 'inferred' && e.from.endsWith('A1_note') && e.to.endsWith('A3_same')), JSON.stringify(d.edges));
    const loop = { 'docs/a-phasemap.spec::A0_base': { files: [], dependsOnInferred: [{ on: 'A1_note', file: 'lib/one.js' }] } };
    const d2 = PD.build(maps, { mapped: loop });
    assert.strictEqual(d2.cycles.length, 0);
    assert.strictEqual(d2.inferredSkipped.length, 1);
  });

  await test('GR-03', 'DG1 checks a phase under spec:, under phases_added_…, and in a map that is not strict YAML', () => {
    const g = DG.openDeps({ phase: 'A1_note', mapText: A });
    assert.strictEqual(g.checked, true); assert.deepStrictEqual(g.open, []); assert.deepStrictEqual(g.prose, ["each phase's code landing"]);
    const added = `phases:\n  B0_x:\n    status: OPEN\nphases_added_2026_10_23:\n  B1_y:\n    status: OPEN\n    depends_on: [B0_x]\n`;
    const g2 = DG.openDeps({ phase: 'B1_y', mapText: added });
    assert.strictEqual(g2.checked, true); assert.deepStrictEqual(g2.open.map(o => o.key), ['B0_x']); assert.strictEqual(g2.via, 'loom');
    const notYaml = `phases:\n  C0_x:\n    status: OPEN\n    does: "a: b: c"  bad\n  C1_y:\n    status: OPEN\n    depends_on: [C0_x]\n`;
    const g3 = DG.openDeps({ phase: 'C1_y', mapText: notYaml });
    assert.strictEqual(g3.checked, true); assert.deepStrictEqual(g3.open.map(o => o.key), ['C0_x']);
  });

  await test('GR-04', 'groom proposes files, a depends_on and an order; asks a person what needs a choice; apply adds only missing keys', () => {
    const r = G.groom({ maps, root: tmp });
    const a2 = r.proposals.find(x => x.phase === 'A2_words');
    assert.ok(a2 && a2.files && a2.files.map(f => f.path).sort().join() === 'lib/one.js,lib/two.js', JSON.stringify(r.proposals));
    const a3 = r.proposals.find(x => x.phase === 'A3_same');
    assert.ok(a3 && a3.dependsOn && a3.dependsOn.length, `A3 shares lib/one.js with A1 and has no depends_on: ${JSON.stringify(r.proposals)}`);
    assert.ok(r.forAPerson.some(x => x.kind === 'dangling' && /ZZ9_nowhere/.test(x.why)));
    assert.ok(r.forAPerson.some(x => x.kind === 'prose'));
    const ap = G.apply({ maps, proposals: r.proposals });
    assert.strictEqual(ap.changes.length, 1); assert.deepStrictEqual(ap.refused, []);
    const after = ap.changes[0].content;
    assert.ok(/A2_words:[\s\S]*files: \[lib\/one\.js, lib\/two\.js\]/.test(after), after);
    assert.ok(/A3_same:[\s\S]*depends_on: \[A1_note/.test(after) || /A3_same:[\s\S]*depends_on: \[A2_words/.test(after), after);
    assert.strictEqual(require(path.join(ROOT, 'lib/phase-files.js')).phasesOf(after, 'x').length, 5);
    assert.ok(/A1_note:\n      status: OPEN\n      depends_on: \["A0_base/.test(after), 'nothing a phase has is changed');
    const again = G.groom({ maps: [{ path: maps[0].path, text: after }], root: tmp });
    assert.ok(!again.proposals.some(x => x.phase === 'A2_words' && x.files), 'groomed once, nothing to add again for its files');
  });

  await test('GR-05', "Nexus's maps: no cycle, at most 2 dangling (both real), every open phase checked by DG1", () => {
    const docs = path.join(ROOT, 'docs');
    const all = fs.readdirSync(docs).filter(f => f.endsWith('-phasemap.spec')).map(f => ({ path: `docs/${f}`, text: fs.readFileSync(path.join(docs, f), 'utf8') }));
    const d = PD.build(all);
    assert.strictEqual(d.cycles.length, 0, JSON.stringify(d.cycles));
    assert.ok(d.dangling.length <= 2, JSON.stringify(d.dangling));
    let unchecked = 0;
    for (const m of all) for (const n of Object.values(d.nodes).filter(x => x.map === m.path && !x.done && !x.decision && !x.finding)) if (!DG.openDeps({ phase: n.id, mapText: m.text }).checked) unchecked++;
    assert.strictEqual(unchecked, 0);
  });

  await test('GR-06', 'the real router: a dry run, then apply through the map writer; the command row and the rail', async () => {
    const api = await quiet(() => import(path.join(ROOT, 'idearium/api/index.js')));
    const L = api.getRepoLayer();
    let made = null;
    for (let i = 0; i < 20; i++) {
      made = await quiet(async () => L.ingest({ name: `groom-${Date.now()}`, source: 'test', compartmentId: 'c-groom', files: [{ path: 'docs/a-phasemap.spec', content: A }, ...['lib/base.js', 'lib/one.js', 'lib/two.js', 'lib/four.js'].map(p => ({ path: p, content: 'module.exports = 1;\n' }))] }));
      if (!(made && made.error && /no spec-engine/.test(made.error))) break;
      await new Promise(x => setTimeout(x, 250));
    }
    assert.ok(made && made.repo, JSON.stringify(made).slice(0, 200));
    const u = made.repo.uuid;
    const dry = await quiet(() => api._route('POST', `/api/repos/${u}/phases/groom`, {}));
    assert.strictEqual(dry.status, 200, JSON.stringify(dry.json).slice(0, 300));
    const d = dry.json.data || dry.json;
    assert.strictEqual(d.dryRun, true); assert.ok(d.stats.proposals >= 2); assert.strictEqual(d.pending.maps, 1);
    const w = await quiet(() => api._route('POST', `/api/repos/${u}/phases/groom`, { apply: true }));
    const wd = w.json.data || w.json;
    assert.strictEqual(w.status, 200, JSON.stringify(w.json).slice(0, 300));
    assert.ok(wd.written && wd.written.files >= 1, JSON.stringify(wd).slice(0, 300));
    const again = await quiet(() => api._route('POST', `/api/repos/${u}/phases/groom`, {}));
    const ad = again.json.data || again.json;
    assert.ok(!ad.proposals.some(x => x.phase === 'A2_words' && x.files), 'written: the map now says it');
    const { pathToFileURL } = require('url');
    const RC = await import(pathToFileURL(path.join(ROOT, 'idearium/cli/route-commands.js')).href);
    const row = RC.SPEC.find(r => r.key === 'repo.groom');
    assert.ok(row && row.req({ repo: { uuid: 'u' }, args: [], flags: { apply: true } }).body.apply === true);
    assert.ok(/function phGroom[\s\S]{0,600}phases\/groom/.test(fs.readFileSync(path.join(ROOT, 'idearium/ui/js/phases.js'), 'utf8')));
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
