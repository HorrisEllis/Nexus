'use strict';
/**
 * tests/modules/test-starved-machine.test.js — a starved machine does not spin (0.60.203)
 * Map: docs/2026-10-10-idearium-solid-phasemap.spec (SD20_a_starved_machine_does_not_spin).
 * James, 2026-10-22: "yes" — to the three fixes after his SP5 run at 1-9 % free memory: stop the officiator's loop; a pinned
 * local model that won't fit goes to the browser agents and says why; a build step never auto-applies a file it wasn't asked for.
 *
 *   SM-01  pinnedLadder: the pin first, then the chain's agents; critical memory moves it last; the fit check leaves it off
 *   SM-02  _phaseBuild reads the pin when there is no ladder, and the route says so
 *   SM-03  land() in inject mode 'auto': the phase's own file is applied; spec/title.spec during a code phase is held, proposed,
 *          with why; with no phase building, both apply as before
 *   SM-04  code-edit commit (the agent's tool path) holds the same file; a person's change is never held
 *   SM-05  the officiator: the same goal is not queued twice; its own failing streak stops it synthesizing; unpark clears it
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}
const quietSync = (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = l; console.warn = w; } };
const quiet = async (fn) => { const l = console.log, w = console.warn, e = console.error; console.log = () => {}; console.warn = () => {}; console.error = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; console.error = e; } };

(async () => {
  console.log('\n⬡  a starved machine does not spin\n');
  const PRt = require(path.join(ROOT, 'lib/pipeline-routing.js'));

  await test('SM-01', 'the pin first, then the chain\'s agents; critical memory moves it last; a model that will not fit is left off', async () => {
    const policy = { ...PRt.DEFAULTS, chain: ['ollama', 'gemini', 'chatgpt', 'claude'] };
    const ok = PRt.pinnedLadder(policy, { model: 'qwen2.5-coder:7b', memoryLevel: 'ok' });
    assert.deepStrictEqual(ok.rungs.map(r => r.provider), ['ollama:qwen2.5-coder:7b', 'gemini', 'chatgpt', 'claude']);
    assert.ok(/Settings pins ollama:qwen2\.5-coder:7b/.test(ok.from) && !ok.moved.length, ok.from);
    const crit = PRt.pinnedLadder(policy, { model: 'qwen2.5-coder:7b', memoryLevel: 'critical' });
    assert.deepStrictEqual(crit.rungs.map(r => r.provider), ['gemini', 'chatgpt', 'claude', 'ollama:qwen2.5-coder:7b']);
    assert.ok(/critical/.test(crit.moved[0].why));
    // his GTX 1650: the 7b does not fit — the same fit check the ladder uses leaves it off, and the agents remain
    const bf = PRt.byFit(ok.rungs, { fits: (m) => ({ fits: false, why: `${m} needs more than free memory` }) });
    assert.deepStrictEqual(bf.rungs.map(r => r.provider), ['gemini', 'chatgpt', 'claude']);
    assert.ok(/qwen2\.5-coder:7b/.test(bf.skipped[0].why));
    // the pin is his choice: no model floor drops it (the derived ladder's minBuildB does not apply)
    assert.strictEqual(PRt.pinnedLadder({ ...policy, minBuildB: 7 }, { model: 'qwen2.5-coder:3b' }).rungs[0].provider, 'ollama:qwen2.5-coder:3b');
  });

  await test('SM-02', '_phaseBuild reads the pin when there is no ladder, through present and the fit check, said on the route', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    const at = src.indexOf('PRt.pinnedLadder(');
    assert.ok(at > 0, 'the build calls pinnedLadder');
    const block = src.slice(src.lastIndexOf('if (!rungs.length && !backend && !agent && !provider)', at), at + 900);
    assert.ok(/RA\.getProvider\(target\.uuid\)/.test(block) && /pin === 'ollama'/.test(block), 'only when Settings pins Ollama');
    assert.ok(/PRt\.present\(rungs/.test(block) && /ladderFrom =/.test(block), 'missing model left off, said on the route');
    assert.ok(src.indexOf('PRt.pinnedLadder(') < src.indexOf('const bf = PRt.byFit(rungs'), 'before the fit check, so a model that will not load is left off');
  });

  const api = await quiet(() => import(pathToFileURL(path.join(ROOT, 'idearium/api/index.js')).href));
  const R = (m, p, b) => quiet(() => api._route(m, p, b));
  const RI = require(path.join(ROOT, 'lib/repo-inject.js'));
  const repoUuid = await quiet(async () => {
    const w = (await R('POST', '/api/workshop', { from: { kind: 'blank' }, title: `Looking Glass SM ${Date.now().toString(36)}` })).json.workshop;
    await R('POST', `/api/workshop/${w.uuid}`, { sections: [{ id: 'purpose', body: 'Titles.' }] });
    return (await R('POST', `/api/workshop/${w.uuid}/save`, {})).json.repoUuid;
  });
  const layer = api.getRepoLayer();
  const repo = () => layer.get(repoUuid);
  RI.setMode(repoUuid, 'auto');
  const TITLE = "'use strict';\nfunction title(s) { return String(s).trim(); }\nmodule.exports = { title };\n";
  const SPEC = 'title:\n  input: string\n  output: string\n';
  const landOne = (p, content, phase) => { const out = { injects: [], refused: [] }; quietSync(() => RI.land({ layer, repo: repo(), hat: { name: 'ollama' }, path: p, content, mode: 'auto', out, source: { kind: 'agent', ...(phase ? { phase } : {}) } })); return out; };

  await test('SM-03', 'mode auto: the phase\'s file applies; spec/title.spec during a code phase is held as a proposal with why; no phase → as before', async () => {
    const release = RI.expectPhase(repoUuid, { phase: 'SPEC.spec::SP5_title', files: ['lib/title.js'] });
    try {
      const a = landOne('lib/title.js', TITLE, 'SPEC.spec::SP5_title');
      assert.strictEqual(a.injects[0].status, 'applied', JSON.stringify(a));
      const b = landOne('spec/title.spec', SPEC, 'SPEC.spec::SP5_title');
      assert.strictEqual(b.injects[0].status, 'proposed', JSON.stringify(b));
      assert.ok(/held for review: spec\/title\.spec is not code/.test(b.injects[0].held), b.injects[0].held);
      assert.ok(/held for review/.test(JSON.stringify(RI.get(b.injects[0].uuid).source || {})), 'the reason is on the proposal he sees');
      const c = landOne('lib/other.js', TITLE, 'SPEC.spec::SP5_title');
      assert.ok(c.injects[0].status === 'proposed' && /not one of the phase's files/.test(c.injects[0].held), JSON.stringify(c));
      assert.strictEqual(landOne('lib/x.js', TITLE, 'OTHER.spec::P9').injects[0].status, 'applied', 'another phase\'s write is judged by its own build');
    } finally { release(); }
    assert.strictEqual(landOne('spec/after.spec', SPEC, 'SPEC.spec::SP5_title').injects[0].status, 'applied', 'the build ended: nothing is held');
  });

  await test('SM-04', 'code-edit commit (the tool path) holds the same file for an agent; a person\'s change applies', async () => {
    const CE = require(path.join(ROOT, 'lib/code-edit.js'));
    const release = RI.expectPhase(repoUuid, { phase: 'SPEC.spec::SP5_title', files: ['lib/title.js'] });
    try {
      const r = await quiet(() => CE.commit({ layer, RI, repo: repo(), hat: { name: 'ollama' }, mode: 'auto', changes: [{ path: 'lib/title.js', content: TITLE + '// two\n' }, { path: 'docs/title.md', content: '# title\n' }] }));
      assert.ok(r.ok, JSON.stringify(r));
      const byPath = Object.fromEntries(r.files.map(f => [f.path, f]));
      assert.strictEqual(byPath['lib/title.js'].status, 'applied');
      assert.ok(byPath['docs/title.md'].status === 'proposed' && /held for review/.test(byPath['docs/title.md'].held), JSON.stringify(byPath['docs/title.md']));
      const p = await quiet(() => CE.commit({ layer, RI, repo: repo(), hat: null, mode: 'auto', changes: [{ path: 'docs/his.md', content: '# his\n' }] }));
      assert.strictEqual(p.files[0].status, 'applied', 'a person\'s own change is never held');
    } finally { release(); }
  });

  await test('SM-05', 'officiator: one goal is queued once; its own failing streak stops synthesis; unpark clears it', async () => {
    const O = require(path.join(ROOT, 'cortex/core/raid/officiator.js'));
    const now = Date.now();
    const goal = 'Build phase SP5_title by ensuring lib/title.js correctly implements the title function';
    const row = (status, ago, extra = {}) => ({ uuid: `q-${Math.random().toString(36).slice(2)}`, source: 'officiator', intention: goal, status, createdAt: now - ago, updatedAt: now - ago, contract: { fileDirectory: 'lib', fileName: 'title.js' }, ...extra });
    const where = { fileDirectory: 'lib', fileName: 'title.js' };
    assert.ok(O.sameGoal(goal, where, [row('blocked', 30e3)], now), 'blocked 30 s ago: the same goal is not queued again');
    assert.ok(O.sameGoal(goal.toUpperCase() + '  ', where, [row('queued', 5e3)], now), 'the wording\'s case and spacing do not make a new goal');
    assert.strictEqual(O.sameGoal(goal, where, [row('fail', 2 * 3600e3)], now), null, 'failed hours ago: it may be tried again');
    assert.strictEqual(O.sameGoal(goal, { fileDirectory: 'lib', fileName: 'other.js' }, [row('queued', 5e3)], now), null, 'another file is another goal');
    assert.strictEqual(O.sameGoal('build', {}, [{ ...row('queued', 5e3), intention: 'build', contract: {} }], now), null, 'a bare verb with no file is never a goal to dedup');
    const st = O.failStreak([row('blocked', 10e3), row('fail', 40e3), row('blocked', 70e3), row('pass', 3600e3)], { now });
    assert.ok(st.held && st.n === 3 && st.until > now, JSON.stringify(st));
    assert.strictEqual(O.failStreak([row('blocked', 10e3), row('pass', 20e3), row('blocked', 70e3)], { now }).held, false, 'a pass breaks the streak');
    assert.strictEqual(O.failStreak([row('blocked', 10e3), row('fail', 40e3), row('blocked', 70e3)], { now, clearedAt: now - 5e3 }).held, false, 'unpark clears it: only later contracts count');
    // the loop guard is read in officiate() and tick(), and the worker waits on memory like the officiator
    const src = fs.readFileSync(path.join(ROOT, 'cortex/core/raid/officiator.js'), 'utf8');
    assert.ok(/const prior = sameGoal\(/.test(src) && /duplicateOf: prior\.uuid/.test(src) && /failStreak\(_officiatorRows\(\)/.test(src));
    assert.ok(/heavyAllowedHere\('raid-worker'\)/.test(fs.readFileSync(path.join(ROOT, 'cortex/core/raid/worker.js'), 'utf8')));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
