'use strict';
/**
 * tests/modules/test-phase-census.test.js — CNS1 (0.60.188), lib/phase-census.js
 * Map: docs/2026-10-21-brainos-into-idearium-phasemap.spec (CNS1). Spec: docs/brainos-in-idearium.spec MOD-BX-PHASE-CENSUS.
 * James, 2026-10-21: "It built 5 phases in a row. I think I see what you mean but there are way more idearium phases than that." · "go ahead
 * with the census"
 *
 *   PCN-01  verdicts on fixture maps: built-undeclared (a naming commit touched its code, its proof test has its id), partly (the map says
 *           so), deferred (LATER), no-files, done, not-built
 *   PCN-02  a short id is never evidence alone: "UI1" never names I1, and an id two maps declare needs its own map named in the record
 *   PCN-03  mapping is not building: a "Map …" commit and a release line citing the map are not evidence (the 35a44a9951 SB8–SB14 case)
 *   PCN-04  "built, not marked done" is only said of a phase whose map says no more than "open"; the open phases come bottom-up by layer
 *   PCN-05  markdown: the quote, every verdict section with its evidence, the bottom-up list
 *   PCN-06  on the real tree: the census runs over the full history, its counts add up, and the row and the route reach it
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const PC = require(path.join(ROOT, 'lib/phase-census.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}

const MAP_A = `# fixture A
phases:
  AA1_built:
    status: OPEN
    depends_on: []
    files: [lib/fx-a.js]
    proof: test-fx PFX-1
  AA2_mapped_only:
    status: OPEN
    depends_on: [AA1_built]
    files: [lib/fx-b.js]
  AA3_partly_said:
    status: PARTLY BUILT 0.1 — the half that reads
    depends_on: []
    files: [lib/fx-a.js]
  AA4_later:
    status: LATER — off the path
    depends_on: []
  AA5_nofiles:
    status: OPEN
    depends_on: []
  AA6_done:
    status: DONE
    depends_on: []
    files: [lib/fx-a.js]
  AA7_open_with_a_note:
    status: OPEN — the page is built; left here: the menu
    depends_on: []
    files: [lib/fx-a.js]
  I1_reader:
    status: OPEN
    depends_on: []
    files: [lib/fx-c.js]
`;
const MAP_B = `# fixture B
phases:
  I1_writer:
    status: OPEN
    depends_on: []
    files: [lib/fx-d.js]
`;

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pcn-'));
  for (const f of ['lib/fx-a.js', 'lib/fx-b.js', 'lib/fx-c.js', 'lib/fx-d.js']) { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), '//\n'); }
  fs.mkdirSync(path.join(root, 'tests/modules'), { recursive: true });
  fs.writeFileSync(path.join(root, 'tests/modules/test-fx.test.js'), "test('PFX-1', 'x')\n");
  const maps = [{ path: 'docs/fx-a-phasemap.spec', text: MAP_A }, { path: 'docs/fx-b-phasemap.spec', text: MAP_B }];
  const commits = [
    { sha: 'a'.repeat(40), msg: 'AA1_built: the reader, lib/fx-a.js\n', files: ['lib/fx-a.js', 'tests/modules/test-fx.test.js'] },
    { sha: 'b'.repeat(40), msg: 'AA7 the page (fx-a) built\n', files: ['lib/fx-a.js'] },
    { sha: 'c'.repeat(40), msg: 'Map the fixture pipeline (AA1–AA2), fx-a\n', files: ['docs/fx-a-phasemap.spec', 'lib/fx-b.js'] },
    { sha: 'd'.repeat(40), msg: '0.1 UI1: the drawer\nMapped next: fx-a AA2\n', files: ['lib/fx-c.js', 'lib/fx-b.js'] },
    { sha: 'e'.repeat(40), msg: 'I1 written (lib/fx-d.js)\n', files: ['lib/fx-d.js'] },
  ];
  const rels = [{ ref: 'CHANGELOG-0.1.md', text: '# 0.1\n| `docs/fx-a-phasemap.spec` | AA2 the next one; AA5 too |\n' }];
  return { root, run: (system = null) => PC.census({ root, system, maps, git: { commits, shallow: false }, rels }) };
}
const V = (c, id, map) => c.phases.find(p => p.id === id && (!map || p.map.includes(map)));

(async () => {
  console.log('\nphase census (CNS1)\n');
  const fx = fixture();
  const c = fx.run();

  await test('PCN-01', 'verdicts: built-undeclared, partly, deferred, no-files, done, not-built', () => {
    const got = Object.fromEntries(['AA1_built', 'AA3_partly_said', 'AA4_later', 'AA5_nofiles', 'AA6_done', 'AA2_mapped_only'].map(id => [id, V(c, id).verdict]));
    assert.deepStrictEqual(got, { AA1_built: 'built-undeclared', AA3_partly_said: 'partly', AA4_later: 'deferred', AA5_nofiles: 'no-files', AA6_done: 'done', AA2_mapped_only: 'not-built' });
    const e = V(c, 'AA1_built').evidence;
    assert.deepStrictEqual([e.commits, e.files, e.proof.idsFound], [['aaaaaaaaaa'], { declared: 1, present: 1 }, ['PFX-1']]);
  });

  await test('PCN-02', 'a short id alone is never evidence: "UI1" never names I1; an id two maps declare needs its map named', () => {
    assert.strictEqual(V(c, 'I1_reader').verdict, 'not-built', 'the UI1 commit touched fx-c.js but does not name I1');
    assert.strictEqual(V(c, 'I1_writer').verdict, 'not-built', 'I1 is the short id of a phase in two maps; a commit that does not name fx-b is not its evidence');
    const named = PC.census({ root: fx.root, system: null, maps: [{ path: 'docs/fx-b-phasemap.spec', text: MAP_B }], git: { commits: [{ sha: 'f'.repeat(40), msg: 'I1 written (lib/fx-d.js)\n', files: ['lib/fx-d.js'] }], shallow: false }, rels: [] });
    assert.strictEqual(named.phases[0].verdict, 'built-undeclared', 'once the id is unambiguous, the same commit is evidence');
  });

  await test('PCN-03', 'a mapping commit and a release line citing the map are not build evidence', () => {
    const e = V(c, 'AA2_mapped_only').evidence;
    assert.deepStrictEqual([e.namingCommits, e.releases], [0, []], 'the "Map …" commit, the "Mapped next" line and the changelog table are all mapping');
    assert.strictEqual(V(c, 'AA5_nofiles').verdict, 'no-files', 'a release line with no code file beside the id does not make it "mentioned"');
  });

  await test('PCN-04', 'built-undeclared only when the map says no more than "open"; the open phases come bottom-up', () => {
    const p = V(c, 'AA7_open_with_a_note');
    assert.strictEqual(p.evidence.commits.length, 1, 'a commit names it and touched its code');
    assert.strictEqual(p.verdict, 'partly', 'the map says what is left, so the census does not overrule it');
    const ix = (id) => c.order.findIndex(k => k.endsWith('::' + id));
    assert.ok(ix('AA5_nofiles') >= 0 && ix('AA2_mapped_only') > ix('AA5_nofiles'), 'layer 0 before layer 1');
    assert.ok(!c.order.some(k => /AA1_built|AA4_later|AA6_done/.test(k)), 'built, deferred and done phases are not open work');
  });

  await test('PCN-05', 'markdown: his quote, each verdict section with its evidence, the bottom-up list', () => {
    const md = PC.markdown(c, { quote: 'James: "go ahead with the census"', date: '2026-10-21' });
    for (const s of ['James: "go ahead with the census"', '## Built, not marked done', '## Partly built', '## Not built', '## No files named', '## Deferred by a decision', '## Open, bottom-up', 'commits aaaaaaaaaa', 'proof 1/1 test file(s), ids 1/1'])
      assert.ok(md.includes(s), `missing: ${s}`);
  });

  await test('PCN-06', 'the real tree: full history, counts add up, the command row and the route reach it', () => {
    const r = PC.census({ root: ROOT, system: 'idearium' });
    assert.ok(r.total > 300, `${r.total} phases`);
    assert.strictEqual(Object.values(r.counts).reduce((a, b) => a + b, 0), r.total);
    assert.ok(r.shallow === false || r.shallow === true || r.gitError, 'the history is said to be shallow or not, never assumed');
    const rows = require(path.join(ROOT, 'idearium/cli/route-commands.js'));
    const row = (rows.SPEC || rows.ROWS || rows).find ? (rows.SPEC || rows.ROWS || rows).find(x => x.key === 'phases.census') : null;
    assert.ok(row && row.req({ flags: {}, args: [] }).path === '/api/phases/census?system=idearium', 'the command row');
    const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    assert.ok(/\['GET', +\['api','phases','census'\], +'phases\.census'\]/.test(api) && /case 'phases\.census':/.test(api) && /'phases\.census': CAPS\.READ_IDEAS/.test(api), 'the route, its case and its capability');
  });

  fs.rmSync(fx.root, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
