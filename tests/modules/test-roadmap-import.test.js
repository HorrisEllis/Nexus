'use strict';
/**
 * tests/modules/test-roadmap-import.test.js — a project's own roadmap imported as a Nexus phasemap, so it continues (0.60.199, SD17)
 * Map: docs/2026-10-10-idearium-solid-phasemap.spec (SD17_an_imported_project_continues).
 * James, 2026-10-21, uploading MASTERMIND-v0_1_50: "so i can import a project and have it continue? Like the one uploaded" · "yes."
 * The fixture has MASTERMIND's shape (phasemap/phases.json + PHASEMAP.md), cut down; the full roadmap's run is in CHANGELOG-0.60.199.md.
 *
 *   RI-01  phases.json + PHASEMAP.md → one phasemap: ids kept (P3-UI → P3u, source_id kept), state → status, percent kept, blocks
 *          and critical-path chains as depends_on each naming its file, an "unblocked" line given no edge, exit → proof; loom
 *          reads it back and the DAG has no problem; the next phase is the one most wait on
 *   RI-02  what cannot be an edge is said, never dropped silently: a block naming no phase, a cycle in the source
 *   RI-03  through the real API: listed as not imported → imported (written into the repo) → the Phases route reads its phases →
 *          listed as imported; again → 409 EXISTS; replace:true → imported again
 *   RI-04  every door: the two command rows reach the routes; the Phases tab offers it (empty state and rail)
 *   RI-05  in Clear Glass: the real phases.js on a just-imported project with no phases shows "this project brought its own
 *          roadmap" and the rail's "roadmap not imported yet"; the button posts the import for that folder
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn, e = console.error; console.log = () => {}; console.warn = () => {}; console.error = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; console.error = e; } };

const PHASES_JSON = JSON.stringify({ version: 3, updated: '2026-08-17', thesis: 'Reduce cognitive load. Reduce overwhelm.', phases: [
  { id: 'P0', name: 'Ground — durability and truth', state: 'open', pct: 99, note: 'One clean hardware cycle.', blocks: ['P1'] },
  { id: 'P1', name: 'Substrate — node envelope + event log', state: 'partial', pct: 40, note: 'The event log is not built.', blocks: ['P2', 'P11'] },
  { id: 'P2', name: 'Module contract — decoupling', state: 'partial', pct: 20, note: 'One manifest written.', blocks: ['P8'] },
  { id: 'P3-UI', name: 'The lattice interface', state: 'done', pct: 100, note: 'Done.', blocks: [] },
  { id: 'P8', name: 'The bridge — cross-module flow', state: 'planned', pct: 0, note: 'Planned.' },
  { id: 'P10', name: 'Ideation — spatial void', state: 'planned', pct: 0, note: 'Planned.' },
  { id: 'P11', name: 'Compartments — epistemics', state: 'planned', pct: 15, note: 'Planned.' },
] }, null, 2);
const PHASEMAP_MD = [
  '# PHASEMAP — v3', '',
  '## P1 — SUBSTRATE · the node envelope and the event log · **schemas done, storage not**', '',
  '> **P1 exit:** a node of every registered type round-trips through the vault', '> with provenance intact.', '',
  '## P3-UI — THE LATTICE INTERFACE · **done**', '',
  '## Critical path', '', '```',
  'P0 one clean hardware cycle',
  ' └─ P1 event log                    ← everything waits here',
  '     ├─ P2 contract ── P8 bridge ── P10 ideation',
  '     ├─ P3-UI lattice interface     ← highest value, unblocked by anything',
  '     └─ P11 compartments',
  '```', '',
].join('\n');

(async () => {
  console.log('\n⬡  roadmap import — a project continues from where it is\n');
  const RIm = await import(pathToFileURL(path.join(ROOT, 'idearium/repo/roadmap-import.js')).href);
  const L = require(path.join(ROOT, 'loom/scanners/phasemap-map.js'));
  const DAG = require(path.join(ROOT, 'lib/phase-dag.js'));

  await test('RI-01', 'one phasemap from both files: ids, states, percent, edges with their file, unblocked kept free, exit → proof; it reads back', () => {
    const r = RIm.importRoadmap({ json: PHASES_JSON, md: PHASEMAP_MD, name: 'roadmap-phasemap', source: { json: 'phasemap/phases.json', md: 'phasemap/PHASEMAP.md' } });
    const by = Object.fromEntries(r.phases.map(p => [p.srcId, p]));
    assert.deepStrictEqual(r.phases.map(p => p.id.split('_')[0]), ['P0', 'P1', 'P2', 'P3u', 'P8', 'P10', 'P11']);
    assert.ok(/source_id: "P3-UI"/.test(r.text), 'the project\'s own id kept');
    assert.deepStrictEqual(['P0', 'P1', 'P3-UI', 'P8'].map(k => by[k].status), ['in-progress', 'in-progress', 'done', 'pending']);
    assert.ok(/progress: 99/.test(r.text) && /source_state: "partial · schemas done, storage not"/.test(r.text), 'percent and the source\'s own state words');
    assert.deepStrictEqual(by.P10.dependsOn, [by.P8.id], 'P8 → P10 comes only from the critical path');
    assert.ok(by.P10.evidence[0].startsWith('phasemap/PHASEMAP.md critical path'), by.P10.evidence[0]);
    assert.ok(by.P1.evidence[0] === 'phasemap/phases.json: P0 blocks P1');
    assert.deepStrictEqual(by['P3-UI'].dependsOn, [], 'the tree puts it under P1, its line says unblocked: no edge');
    assert.ok(/proof: "a node of every registered type round-trips through the vault with provenance intact\."/.test(r.text), 'exit criterion, both lines');
    assert.strictEqual(L.parsePhasemapText(r.text, 'roadmap-phasemap').length, 7);
    const g = DAG.build([{ path: 'phasemap/roadmap-phasemap.spec', text: r.text }]);
    for (const k of Object.keys(g.nodes)) assert.deepStrictEqual(DAG.problems(g, k), [], k);
    assert.strictEqual(r.next[0].srcId, 'P0', 'P0 is not done and everything waits on it');
  });

  await test('RI-02', 'what cannot be an edge is said: a block naming no phase, a cycle', () => {
    const j = JSON.stringify({ phases: [{ id: 'A1', name: 'a', blocks: ['B1', 'Z9'] }, { id: 'B1', name: 'b', blocks: ['A1'] }, { name: 'no id' }] });
    const r = RIm.importRoadmap({ json: j, source: { json: 'roadmap.json' } });
    assert.ok(r.said.some(s => /A1 blocks Z9, which is not a phase/.test(s)), r.said.join(' | '));
    assert.ok(r.said.some(s => /^cycle in the source/.test(s)), 'the cycle is said');
    assert.ok(r.said.some(s => /1 item\(s\) without an id/.test(s)));
    const g = DAG.build([{ path: 'roadmap-phasemap.spec', text: r.text }]);
    for (const k of Object.keys(g.nodes)) assert.ok(!DAG.problems(g, k).some(p => /cycle/.test(p)), 'no cycle left in what was written');
    assert.throws(() => RIm.importRoadmap({ json: '{"phases": []}' }), /neither file names a phase/);
  });

  const api = await quiet(() => import(pathToFileURL(path.join(ROOT, 'idearium/api/index.js')).href));
  const R = (m, p, b) => quiet(() => api._route(m, p, b));
  await test('RI-03', 'through the API: found → imported into the repo → its phases read → imported; again 409; replace imports again', async () => {
    const uuid = await quiet(async () => {
      const w = (await R('POST', '/api/workshop', { from: { kind: 'blank' }, title: `Mastermind RI ${Date.now().toString(36)}` })).json.workshop;
      await R('POST', `/api/workshop/${w.uuid}`, { sections: [{ id: 'purpose', body: 'A project brought with its own roadmap.' }] });
      return (await R('POST', `/api/workshop/${w.uuid}/save`, {})).json.repoUuid;
    });
    assert.ok(uuid, 'a repo');
    for (const [p, c] of [['phasemap/phases.json', PHASES_JSON], ['phasemap/PHASEMAP.md', PHASEMAP_MD], ['main.js', "'use strict';\n"]]) {
      const w = await R('POST', `/api/repos/${uuid}/file`, { path: p, content: c });
      assert.ok(w.json && !w.json.error, JSON.stringify(w.json));
    }
    const before = (await R('GET', `/api/repos/${uuid}/roadmaps`)).json.roadmaps;
    assert.deepStrictEqual(before.map(r => [r.dir, r.json, r.md, r.target, r.imported]), [['phasemap', 'phasemap/phases.json', 'phasemap/PHASEMAP.md', 'phasemap/roadmap-phasemap.spec', false]]);
    const im = (await R('POST', `/api/repos/${uuid}/roadmaps/import`, {})).json;
    assert.ok(im && im.phases === 7 && im.done === 1 && im.next[0].srcId === 'P0', JSON.stringify(im).slice(0, 400));
    const ph = (await R('GET', `/api/repos/${uuid}/phases`)).json;
    const keys = (ph.phases || []).map(p => p.phase_key || p.id || p.phase).join(' ');
    assert.ok((ph.phases || []).length === 7 && /P1_substrate/.test(keys), `${(ph.phases || []).length}: ${keys.slice(0, 200)}`);
    assert.strictEqual((await R('GET', `/api/repos/${uuid}/roadmaps`)).json.roadmaps[0].imported, true);
    const again = await R('POST', `/api/repos/${uuid}/roadmaps/import`, {});
    assert.ok(again.status === 409 && again.json.detail.code === 'EXISTS', JSON.stringify(again.json));
    const re = (await R('POST', `/api/repos/${uuid}/roadmaps/import`, { replace: true })).json;
    assert.strictEqual(re.phases, 7);
  });

  await test('RI-04', 'every door: two command rows reach the routes; the Phases tab offers it', () => {
    const C = require(path.join(ROOT, 'idearium/cli/route-commands.js'));
    const rows = (Array.isArray(C) ? C : C.SPEC || Object.values(C).find(Array.isArray));
    const a = { args: [], flags: {}, repo: { uuid: 'u1', name: 'mm' } };
    assert.deepStrictEqual(rows.find(r => r.key === 'repo.roadmaps').req(a), { method: 'GET', path: '/api/repos/u1/roadmaps' });
    assert.deepStrictEqual(rows.find(r => r.key === 'repo.roadmap-import').req({ ...a, args: ['phasemap'], flags: { replace: true } }), { method: 'POST', path: '/api/repos/u1/roadmaps/import', body: { dir: 'phasemap', replace: true } });
    const ui = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/phases.js'), 'utf8');
    assert.ok(/api\(`\/api\/repos\/\$\{forUuid\}\/roadmaps`/.test(ui) && /roadmap not imported yet/.test(ui) && /this project brought its own roadmap/.test(ui) && /async function phImportRoadmap/.test(ui));
  });

  await test('RI-05', 'in Clear Glass: the empty Phases tab offers the roadmap; the button imports it', async () => {
    const os = require('os');
    const glass = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
    if (!glass.engine()) { console.log('    - SKIPPED: Clear Glass has no engine here — the browser check did not run'); return; }
    const UI = path.join(ROOT, 'idearium/ui');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-ui-'));
    fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"></head><body>
<div id="repo-subtab-phases" style="height:900px"></div>
<script>
  const CALLS = [], TOASTS = [];
  const REPO = { uuid: 'mm', name: 'mastermind', files: [{ path: 'phasemap/phases.json' }] };
  let CURRENT_API_REPO = REPO, CURRENT_REPO_SUBTAB = 'phases';
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  function toast(m, k) { TOASTS.push([m, k]); }
  function setRepoSubtab() {}
  async function api(p, opts) {
    CALLS.push({ p, method: (opts && opts.method) || 'GET', body: opts && opts.body ? JSON.parse(opts.body) : null });
    if (p.endsWith('/phases')) return { scope: { label: 'mastermind', source: 'repo' }, editVia: 'repo-layer', warnings: [], maps: [], phases: [], summary: { total: 0 } };
    if (p.endsWith('/thread')) return { specs: [] };
    if (p.endsWith('/roadmaps')) return { roadmaps: [{ dir: 'phasemap', json: 'phasemap/phases.json', md: 'phasemap/PHASEMAP.md', target: 'phasemap/roadmap-phasemap.spec', imported: false }] };
    if (p.endsWith('/roadmaps/import')) return { map: 'phasemap/roadmap-phasemap.spec', phases: 16, done: 4, next: [{ id: 'P0_ground', waiting: 10 }], said: [] };
    return {};
  }
</script>
<script src="${pathToFileURL(path.join(UI, 'js', 'plan-panel.js')).href}"></script>
<script src="${pathToFileURL(path.join(UI, 'js', 'work-surface.js')).href}"></script>
<script src="${pathToFileURL(path.join(UI, 'js', 'phases.js')).href}"></script>
</body></html>`);
    const browser = await glass.chromium.launch();
    try {
      const page = await browser.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(pathToFileURL(path.join(dir, 'index.html')).href);
      await page.evaluate(() => renderRepoPhases(REPO));
      await page.waitForSelector('#repo-subtab-phases .ds');
      const text = await page.evaluate(() => document.getElementById('repo-subtab-phases').innerText);
      assert.ok(/this project brought its own roadmap/i.test(text) && /phasemap\/phases\.json \+ phasemap\/PHASEMAP\.md/.test(text), text.slice(0, 400));
      assert.ok(/roadmap not imported yet/i.test(text), 'the rail says it too');
      await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /import its roadmap/.test(b.textContent)).click());
      await page.waitForFunction(() => CALLS.some(c => c.p.endsWith('/roadmaps/import')));
      const call = await page.evaluate(() => CALLS.find(c => c.p.endsWith('/roadmaps/import')));
      assert.deepStrictEqual([call.method, call.body], ['POST', { dir: 'phasemap' }]);
      await page.waitForFunction(() => TOASTS.length > 0);
      const t0 = await page.evaluate(() => TOASTS[0]);
      assert.ok(/16 phases, 4 done · next P0 \(10 wait on it\)/.test(t0[0]) && t0[1] === 'ok', JSON.stringify(t0));
      assert.deepStrictEqual(errors, []);
    } finally { await browser.close(); }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
