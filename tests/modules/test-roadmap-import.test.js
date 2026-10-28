'use strict';
/**
 * tests/modules/test-roadmap-import.test.js — a project's own roadmap imported as a Nexus phasemap, so it continues (0.60.199, SD17)
 * Map: docs/2026-10-10-idearium-solid-phasemap.spec (SD17_an_imported_project_continues).
 * James, 2026-10-21, uploading MASTERMIND-v0_1_50: "so i can import a project and have it continue? Like the one uploaded" · "yes."
 * The fixture has MASTERMIND's shape (phasemap/phases.json + PHASEMAP.md), cut down; the full roadmap's run is in CHANGELOG-0.60.199.md.
 *
 *   RI-01  phases.json + PHASEMAP.md → one phasemap: ids kept (P3-UI → P3u, source_id kept), state → status, percent kept, blocks
 *          and critical-path chains as depends_on each naming its file, an "unblocked" line given no edge, exit → proof, the files
 *          a section names (never the roadmap itself, never a slash-list) as named_in_source for the mapper (0.60.200); loom
 *          reads it back and the DAG has no problem; the next phase is the one most wait on
 *   RI-02  what cannot be an edge is said, never dropped silently: a block naming no phase, a cycle in the source
 *   RI-03  through the real API: listed as not imported → imported (written into the repo) → the Phases route reads its phases →
 *          listed as imported; again → 409 EXISTS; replace:true → imported again
 *   RI-04  every door: the two command rows reach the routes; the Phases tab offers it (empty state and rail)
 *   RI-05  in Clear Glass: the real phases.js on a just-imported project with no phases shows "this project brought its own
 *          roadmap" and the rail's "roadmap not imported yet"; the button posts the import for that folder
 *   RI-06..08  0.60.221 SD17b — James, 2026-10-23: "some work for my mentor. need a way to real the data. the phases, convert md to
 *          spec." A phased SPEC.md (worker_clean's shape) and an ISSUES.md (core13's shape), cut down: phases with their goal,
 *          changelog files, numbering as order, the Completed table and the README status table done, done by evidence; issues as
 *          open items with their group, other projects' items not imported and said; the real API with the repo's files
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
  '| `schemas/node.schema.json` — provenance required | **done** |', '| the event log, one per `EXPR/POSTURE` stream | not started |', '| see `phasemap/phases.json` | |', '',
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


// §SD17b — worker_clean's SPEC.md shape (cut down) and its README's status table; core13's ISSUES.md shape (cut down)
const PHASED_SPEC = [
  '# GameMaster — Phased Development Specification', '',
  '## Completed Phases (baseline for this spec)', '', '| Phase | Summary |', '|-------|---------|',
  '| 1 | SISO core framework — events, gates, stream |', '| 2 | AI integration — AIGenerateGate |', '', '---', '',
  '## Phase 3 — Frontend Restructure', '', '**Goal:** Split the monolithic `index.html` into a proper PHP/CSS/JS file structure.  ',
  'Fix the inventory bug.', '', '### What to build', '- `index.php` — PHP entry point', '', '### Changelog.3', '```',
  '[ADDED]   public/js/app.js', '[ADDED]   index.php', '[CHANGED] run_tests.php — registered', '[REMOVED] index.html (replaced)', '```', '',
  '## Phase 4 — Inventory Panel', '', '**Goal:** Make the game UI richer.', '', '### Changelog.4', '```',
  '[ADDED]   public/js/ui/inventory.js', '[CHANGED] index.php — two-column layout', '```', '',
  '## Phase 5 — Save Slots', '', '**Goal:** Multiple named save slots.', '', '### Changelog.5', '```', '[ADDED]   src/Gates/SaveSlotGate.php', '```', '',
  '## Cross-cutting rules (apply to every phase)', '', '1. Gates never throw.', '',
].join('\n');
const PHASED_README = ['# AI Game Master', '', '| Phase | Summary |', '|---|---|', '| 1 | SISO framework |', '| 2 | AI integration |',
  '| 3.1 | Port to SISO core v10.0 — pure gates |', '| **3.2** | **SISO core 13.1.0** — the client rebuilt |', '', 'Text after.'].join('\n');
const ISSUES_MD = [
  '# Open issues', '', 'Open items only.', '', '## Kit (minor)', '',
  '- A per-gate test is code: it can still print a correct-looking', '  "register:" line. Probably not worth it.',
  '- lua/code/kit/census.lua reads the register line from the first', '  run only. Fix: check both.', '',
  '## For consumers moving to core 13.0.0 (cross-project, not this project\'s work)', '', '- 13.1.0 moves the Lua reference: vendor `lua/code/core/`.', '',
  '## Deception by trusted code (named, not fixed)', '', '- R3: rawset past a frozen table.', '',
  '## Deferred', '', '- Dev notes §1 stays deferred.', '',
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
    assert.ok(by.P10.evidence[0].startsWith('PHASEMAP.md critical path'), by.P10.evidence[0]);
    assert.ok(by.P1.evidence[0] === 'phases.json: P0 blocks P1');
    // 0.60.200 — the only paths in a phase are the files its section names: never the roadmap itself, never a slash-list
    const PF = require(path.join(ROOT, 'lib/phase-files.js'));
    const named = Object.fromEntries(L.parsePhasemapText(r.text, 'roadmap-phasemap').map(ph => [ph.id.split('_')[0], PF.candidates(r.text.split('\n').slice(ph.line, ph.bodyEnd).join('\n')).map(c => c.path)]));
    assert.deepStrictEqual(named.P1, ['schemas/node.schema.json'], JSON.stringify(named));
    assert.ok(Object.entries(named).every(([k, v]) => k === 'P1' ? true : !v.length), JSON.stringify(named));
    assert.ok(/IMPORTED .* from phasemap\/phases\.json \+ phasemap\/PHASEMAP\.md/.test(r.text), 'the full paths, once, in meta');
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


  await test('RI-06', 'a phased SPEC.md: each phase with its goal and changelog files, the numbering as order, the tables done, done by evidence', () => {
    const M = RIm.parsePhasedSpecMd(PHASED_SPEC, { statusTables: [{ path: 'README.md', text: PHASED_README }] });
    assert.deepStrictEqual(M.items.map(i => i.srcId), ['P1', 'P2', 'P3', 'P3-1', 'P3-2', 'P4', 'P5'], 'the README\'s 3.1 and 3.2 join in their place');
    const p3 = M.items.find(i => i.srcId === 'P3');
    assert.match(p3.goal, /^Split the monolithic `index.html`.*Fix the inventory bug\.$/);
    assert.deepStrictEqual(p3.paths, ['index.php', 'public/js/app.js', 'run_tests.php'], 'build list then changelog; [REMOVED] is not a file to build');
    assert.deepStrictEqual(p3.added, ['public/js/app.js', 'index.php']);
    const have = new Set(['public/js/app.js', 'index.php', 'run_tests.php', 'public/js/ui/inventory.js']);
    const im = RIm.importRoadmap({ md: PHASED_SPEC, name: 'roadmap-phasemap', source: { md: 'SPEC.md' }, exists: p => have.has(p), statusTables: [{ path: 'README.md', text: PHASED_README }] });
    const st = Object.fromEntries(im.phases.map(p => [p.srcId, p.status]));
    assert.deepStrictEqual(st, { P1: 'done', P2: 'done', P3: 'done', 'P3-1': 'done', 'P3-2': 'done', P4: 'done', P5: 'pending' }, 'P3 and P4 by their files, 3.x by the README');
    assert.deepStrictEqual(im.next.map(n => n.srcId), ['P5']);
    const p5 = im.phases.find(p => p.srcId === 'P5');
    assert.deepStrictEqual(p5.dependsOn, [im.phases.find(p => p.srcId === 'P4').id]);
    assert.match(p5.evidence[0], /SPEC\.md the phases are numbered in order: P4 → P5/);
    assert.match(im.text, /named_in_source: \[src\/Gates\/SaveSlotGate\.php\]/);
    assert.match(im.text, /source_shape: phased-spec/);
    const back = L.parsePhasemapText(im.text, 'roadmap-phasemap');
    assert.strictEqual(back.length, 7, 'loom reads it back');
    const dag = DAG.build([{ path: 'roadmap-phasemap.spec', text: im.text }], {});
    assert.deepStrictEqual([dag.cycles.length, dag.dangling.length], [0, 0]);
  });

  await test('RI-07', 'an ISSUES.md: each bullet an open item with its group; other projects\' items not imported and said; its own map', () => {
    const M = RIm.parseIssuesMd(ISSUES_MD);
    assert.deepStrictEqual(M.items.map(i => [i.srcId, i.subtitle, i.stateText]), [['IS1', 'Kit (minor)', 'open'], ['IS2', 'Kit (minor)', 'open'],
      ['IS3', 'Deception by trusted code (named, not fixed)', 'named, not fixed (an accepted risk)'], ['IS4', 'Deferred', 'deferred']]);
    assert.deepStrictEqual(M.items[1].paths, ['lua/code/kit/census.lua']);
    assert.match(M.items[1].goal, /reads the register line from the first run only\. Fix: check both\.$/, 'continuation lines join the bullet');
    assert.strictEqual(M.skipped.length, 1);
    const im = RIm.importRoadmap({ md: ISSUES_MD, name: 'issues-phasemap', source: { md: 'doc/ISSUES.md' } });
    assert.ok(im.said.some(w => /other projects' work: 1 item/.test(w)), im.said.join(' | '));
    assert.strictEqual(L.parsePhasemapText(im.text, 'issues-phasemap').length, 4);
    const found = RIm.findRoadmaps(['doc/SPEC.md', 'doc/ISSUES.md', 'SPEC.md', 'README.md', 'vendor/x/ROADMAP.md']);
    assert.deepStrictEqual(found.map(f => [f.md, f.target, f.kind || null]), [['SPEC.md', 'roadmap-phasemap.spec', 'spec'], ['doc/ISSUES.md', 'doc/issues-phasemap.spec', 'issues'], ['doc/SPEC.md', 'doc/roadmap-phasemap.spec', 'spec']]);
    const rk = RIm.rankRoadmaps(found.filter(f => f.dir === 'doc'), p => (p === 'doc/ISSUES.md' ? ISSUES_MD : '# core\n\n## Identity\n\nA contract spec, no phases.\n'));
    assert.deepStrictEqual([rk.roadmaps.map(r => r.md), rk.ignored.map(i => i.files[0])], [['doc/ISSUES.md'], ['doc/SPEC.md']], 'a contract SPEC.md names no phase: left out, said');
  });

  await test('RI-08', 'through the API: a repo with a phased SPEC.md and its README imports with its own files as evidence', async () => {
    const uuid = await quiet(async () => {
      const w = (await R('POST', '/api/workshop', { from: { kind: 'blank' }, title: `GameMaster RI ${Date.now().toString(36)}` })).json.workshop;
      await R('POST', `/api/workshop/${w.uuid}`, { sections: [{ id: 'purpose', body: 'A phased SPEC.md project.' }] });
      return (await R('POST', `/api/workshop/${w.uuid}/save`, {})).json.repoUuid;
    });
    for (const [p, c] of [['SPEC.md', PHASED_SPEC], ['README.md', PHASED_README], ['public/js/app.js', '// app\n'], ['index.php', '<?php\n']]) {
      const w = await R('POST', `/api/repos/${uuid}/file`, { path: p, content: c });
      assert.ok(w.json && !w.json.error, JSON.stringify(w.json));
    }
    const im = (await R('POST', `/api/repos/${uuid}/roadmaps/import`, {})).json;
    assert.ok(im && im.phases === 7, JSON.stringify(im).slice(0, 300));
    assert.strictEqual(im.done, 5, 'P1, P2 (table), P3 (its added files exist), 3.1, 3.2 (README); P4 lacks inventory.js');
    assert.strictEqual(im.next[0].srcId, 'P4');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
