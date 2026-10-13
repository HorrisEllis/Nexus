'use strict';
/**
 * tests/modules/test-phase-mapping.test.js — 0.60.29 PM — every phase mapped to its files and dependencies.
 * James (2026-10-13): "All the phases need to be mapped to files and dependencies. With nexus and all projects."
 *   PMF-* lib/phase-files.js on its own · PMJ-* the job (idearium/repo/phase-mapping.js) with a stand-in agent ·
 *   PMR-* the real route on a real project repo (only the model is stood in)
 */
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '../..');
const PF = require(path.join(ROOT, 'lib/phase-files.js'));
let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };

const MAP = `phasemap:
  name: notes
  phases:
    N1_store:
      status: done
      files: [lib/notes.js]
      does: keep notes in memory, mirroring lib/list.js
    N2_list:
      status: planned
      does: >-
        add list() to lib/notes.js, the way lib/list.js already sorts
    N3_cli:
      status: planned
      does: a command for notes in cli/notes.js; checked against docs/x.md
    N4_inline: { status: planned, does: "one line" }
    N5_idea:
      status: planned
      depends_on: [N1_store]
      does: think about notes
`;
const tree = new Set(['lib/notes.js', 'lib/list.js', 'docs/x.md']);
const dirs = new Set(['lib', 'cli', 'docs']);
const exists = (p) => tree.has(p), dirExists = (p) => dirs.has(p);

(async () => {
  console.log('\ntest-phase-mapping\n');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-pm-'));
  try {
    const ps = PF.phasesOf(MAP, 'docs/notes-phasemap.spec');
    const by = Object.fromEntries(ps.map(p => [p.id, p]));
    check('PMF-01 phases read with their files:, depends_on and one-line form', by.N1_store.files.join() === 'lib/notes.js' && !by.N2_list.hasFiles && by.N5_idea.hasDeps && by.N4_inline.inline, JSON.stringify(ps.map(p => [p.id, p.files, p.hasDeps, p.inline])));
    const c = PF.candidates(by.N3_cli.body, { exists, dirExists });
    const b = PF.brief([{ ...by.N1_store, candidates: [] }, { ...by.N3_cli, candidates: c }], { repoName: 'notes' });
    check('PMF-02 the brief: each candidate with its facts; a scored phase\'s files: hidden; reference vs target is the model\'s to say',
      c.find(x => x.path === 'cli/notes.js').folder && !c.find(x => x.path === 'cli/notes.js').exists && c.find(x => x.path === 'docs/x.md').exists
      && !/files: \[lib\/notes\.js\]/.test(b) && /NOT one of its files/.test(b) && /cli\/notes\.js \(new — its folder exists\)/.test(b), b.slice(0, 400));
    const ans = PF.parseAnswer('```json\n{"phases":[{"id":"N2_list","files":[{"path":"lib/notes.js"},{"path":"../etc/passwd"},{"path":"nowhere/x.js"}]},{"id":"N3_cli","files":["cli/notes.js"]}]}\n```', [by.N2_list, by.N3_cli, by.N5_idea], { exists, dirExists });
    check('PMF-03 an answer is checked by code: unsafe paths and paths with no folder are refused; new vs existing from the tree; a phase left out says so',
      ans.N2_list.files.map(f => f.path).join() === 'lib/notes.js' && ans.N2_list.problems.length === 2 && ans.N3_cli.files[0].new === true && /not in the answer/.test(ans.N5_idea.problems[0]), JSON.stringify(ans));
    const ev = PF.evaluate([PF.score(['a', 'b'], ['a']), PF.score(['c'], ['c', 'd'])]);
    check('PMF-04 scoring: precision and recall over phases with known files', ev.tp === 2 && ev.fp === 1 && ev.fn === 1 && Math.abs(ev.precision - 2 / 3) < 1e-9 && Math.abs(ev.recall - 2 / 3) < 1e-9);
    const deps = PF.depsFor([{ id: 'A', files: ['x'] }, { id: 'B', files: ['y'] }, { id: 'C', files: ['x', 'y'] }, { id: 'D', files: ['x'], dependsOn: ['C'] }]);
    check('PMF-05 dependencies from the files: the nearest earlier phase changing the same file; one already listed is not repeated',
      JSON.stringify(deps.C) === JSON.stringify([{ on: 'A', file: 'x' }, { on: 'B', file: 'y' }]) && !deps.D && !deps.A, JSON.stringify(deps));
    const many = Array.from({ length: 10 }, (_, i) => ({ id: `H${i}`, files: ['api/index.js', ...(i === 3 ? ['lib/a.js'] : i === 7 ? ['lib/a.js'] : [])] }));
    const hubs = PF.hubsOf(many), dh = PF.depsFor(many, { hubs });
    check('PMF-07 a hub file (named by ≥ 8 phases) is not evidence of order — sharing it adds no depends_on; a file only two share still does',
      hubs.has('api/index.js') && !hubs.has('lib/a.js') && Object.keys(dh).join() === 'H7' && dh.H7[0].on === 'H3', JSON.stringify(dh));
    const a1 = PF.applyTo(MAP, by.N2_list, { files: ['lib/notes.js'], deps: [{ on: 'N1_store', file: 'lib/notes.js' }], note: 'mapped by test' });
    const a2 = PF.applyTo(MAP, by.N5_idea, { files: ['lib/idea.js'], deps: [{ on: 'N2_list', file: 'x' }] });
    const a3 = PF.applyTo(MAP, by.N4_inline, { files: ['x.js'] });
    const y = require('js-yaml'); const parsed = y.load(a1.text);
    check('PMF-06 the block gains only the keys it lacks (an existing depends_on is never changed); a one-line phase is refused; the map still parses',
      a1.added === 2 && JSON.stringify(parsed.phasemap.phases.N2_list.files) === '["lib/notes.js"]' && JSON.stringify(parsed.phasemap.phases.N2_list.depends_on) === '["N1_store"]'
      && a2.added === 1 && /depends_on: \[N1_store\]/.test(a2.text) && !/depends_on: \[N2_list\]/.test(a2.text) && /one line/.test(a3.error), JSON.stringify({ a1: a1.added, a2: a2.added, a3 }));

    // the job, with a stand-in agent
    const PMx = await import(path.join(ROOT, 'idearium/repo/phase-mapping.js'));
    const stateFile = path.join(tmp, 'state.json');
    let asks = 0, mode = 'good';
    const ask = async (prompt) => {
      asks++;
      const ids = [...prompt.matchAll(/^### (\S+)/gm)].map(m => m[1]);
      const files = { N1_store: ['lib/notes.js'], N2_list: ['lib/notes.js'], N3_cli: ['cli/notes.js'], N5_idea: [] };
      if (mode === 'bad') files.N1_store = ['lib/list.js'];   // takes the reference for the target
      return { ok: true, by: 'ollama:test', text: JSON.stringify({ phases: ids.map(id => ({ id, files: (files[id] || []).map(p => ({ path: p })) })) }) };
    };
    let written = null;
    const write = async (changes) => { written = changes; return { ok: true, via: 'test' }; };
    mode = 'bad';
    const r0 = await PMx.runMapping({ repoName: 'notes', maps: [{ path: 'docs/notes-phasemap.spec', text: MAP }], stateFile: path.join(tmp, 'bad.json'), ask, write, exists, dirExists, opts: { apply: true, minScored: 1 } });
    check('PMJ-01 the gate: an agent that takes a reference for a target scores 0 on the known phase — its files are kept as proposals, not written',
      !r0.trusted && r0.scored.precision === 0 && r0.mapped === 2 && !(written && written.some(c => /files: \[cli/.test(c.content))) && /kept as proposals/.test(r0.line), r0.line);
    mode = 'good'; written = null; asks = 0;
    const r1 = await PMx.runMapping({ repoName: 'notes', maps: [{ path: 'docs/notes-phasemap.spec', text: MAP }], stateFile, ask, write, exists, dirExists, opts: { apply: true, minScored: 1 } });
    const out = written && written[0] && written[0].content;
    check('PMJ-02 a trusted agent: open phases with no files are mapped and written (with who mapped them and the measured precision); the dependency from a shared file is added; a phase it could not map stays unmapped; a one-line phase is not sent, and said',
      r1.trusted && r1.scored.precision === 1 && /N2_list:\n\s+files: \[lib\/notes\.js\]   # mapped by ollama:test, 1 precision on 1 known phases/.test(out) && /depends_on: \[N1_store\]/.test(out)
      && /files: \[cli\/notes\.js\]/.test(out) && r1.empty === 1 && r1.oneLine === 1 && /N4_inline/.test(r1.skipped[0]) && r1.applied.files === 2, `${r1.line}\n${out}`);
    const before = asks;
    const r2 = await PMx.runMapping({ repoName: 'notes', maps: [{ path: 'docs/notes-phasemap.spec', text: MAP }], stateFile, ask, write, exists, dirExists, opts: { apply: false, minScored: 1 } });
    check('PMJ-03 resumable: a second run asks nothing again for phases already mapped (only the scoring)', asks - before === 1 && r2.mapped === 2, `${asks - before} asks`);
  } catch (e) { fail++; console.log(`  ✗ threw: ${e.stack}`); }

  // the real route on a real project repo, the model stood in
  try {
    const api = await import(path.join(ROOT, 'idearium/api/index.js'));
    const R = (m, p, b) => quiet(() => api._route(m, p, b));
    let made = null;
    for (let i = 0; i < 20; i++) { made = await R('POST', '/api/spec-engine/specs', { name: `map-probe-${Date.now()}`, type: 'system', description: 'a probe' }); if (made.status !== 503) break; await new Promise(r => setTimeout(r, 250)); }
    const repoUuid = (made.json.data || made.json).repoUuid;
    const layer = api.getRepoLayer();
    for (const [p, t] of [['docs/notes-phasemap.spec', MAP], ['lib/notes.js', 'module.exports = {};\n'], ['lib/list.js', 'module.exports = {};\n'], ['docs/x.md', '# x\n'], ['cli/.keep', '']]) layer.writeTextFile(repoUuid, p, t);
    api._setAgentAsk(async (prompt) => {
      const ids = [...prompt.matchAll(/^### (\S+)/gm)].map(m => m[1]);
      const f = { N1_store: ['lib/notes.js'], N2_list: ['lib/notes.js'], N3_cli: ['cli/notes.js'] };
      return { ok: true, by: 'stand-in', text: JSON.stringify({ phases: ids.map(id => ({ id, files: (f[id] || []).map(p => ({ path: p })) })) }) };
    });
    await R('POST', '/api/config', { key: 'repos.map_min_scored', value: 1 });
    const st = await R('POST', `/api/repos/${repoUuid}/phases/map`, {});
    let g = null;
    for (let i = 0; i < 80; i++) { g = await R('GET', `/api/repos/${repoUuid}/phases/map`); if (!(g.json.data || g.json).running) break; await new Promise(r => setTimeout(r, 100)); }
    const d = g.json.data || g.json;
    const txt = (layer.readTextFile(repoUuid, 'docs/notes-phasemap.spec') || {}).content || '';
    check('PMR-01 the route on a real project: started, ran in the background, scored, and wrote files: and depends_on into the repo\'s phasemap',
      st.status === 200 && !d.running && d.report && d.report.trusted && d.report.applied.files === 2 && /N2_list:\n\s+files: \[lib\/notes\.js\]/.test(txt) && /depends_on: \[N1_store\]/.test(txt), JSON.stringify({ st: st.status, d: d.report && d.report.line, err: d.error, txt: txt.slice(0, 500) }));
    const CMD = fs.readFileSync(path.join(ROOT, 'idearium/cli/route-commands.js'), 'utf8'), UI = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/phases.js'), 'utf8');
    check('PMR-02 every agent has it (repo map-phases) and the Phases tab has the button and its progress line', CMD.includes("key: 'repo.map-phases'") && /phasesMapRun\(\)/.test(UI) && /phasesMapLoad/.test(UI));
    api._setAgentAsk(null);
  } catch (e) { fail++; console.log(`  ✗ route threw: ${e.stack}`); }
  finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} }
  console.log(`\n${pass} passed, ${fail} failed`);
  setTimeout(() => process.exit(fail ? 1 : 0), 200);
})();
