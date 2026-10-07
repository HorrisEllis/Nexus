'use strict';
/**
 * tests/modules/test-repo-activity.test.js — §0.39.366: a repo's background tasks.
 * James (with Claude Code's Background tasks panel): "the background tasks, i want that for each repo. any activity from
 * an agent wearing the hat."
 */
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const RAct = require(path.join(ROOT, 'lib', 'repo-activity.js'));

let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }

console.log('\ntest-repo-activity\n');
(async () => {
  RAct._reset();
  const sent = [];
  RAct.onChange((t) => sent.push(t));
  RAct.setHistorySource((uuid) => uuid === 'R' ? [{ uuid: 'x1', repoUuid: 'R', hatName: 'repo_r', message: 'You are the project agent for "r".\nadd a test', response: 'ok done', ok: true, backend: 'guardian', elapsedMs: 4000, ts: 1000 }] : []);

  // kinds and runs from session names (the shapes idearium uses)
  check('RA-01 kinds from session names', RAct.kindOf(null) === 'chat' && RAct.kindOf('phrun-muw64lqs-vm0w') === 'build' && RAct.kindOf('phrun-muw64lqs-vm0w-c2-r2t1') === 'build'
    && RAct.kindOf('phrun-muw64lqs-vm0w-review') === 'review' && RAct.kindOf('phrun-muw64lqs-vm0w-a2') === 'repair');
  check('RA-02 the run of an attempt', RAct.runOf('phrun-muw64lqs-vm0w-r2t1') === 'phrun-muw64lqs-vm0w' && RAct.runOf('phrun-muw64lqs-vm0w-c3') === 'phrun-muw64lqs-vm0w' && RAct.runOf('chat') === null);

  // history from the exchange log
  const l0 = RAct.list('R');
  check('RA-03 before any task, the compartment\'s exchange log is its history', l0.tasks.length === 1 && l0.tasks[0].fromLog && l0.tasks[0].status === 'done' && /add a test/.test(l0.tasks[0].title), JSON.stringify(l0.tasks[0] && l0.tasks[0].title));

  // a phase build: its first row makes the task; attempts are its children
  RAct.phaseRow({ uuid: 'phrun-a-b-started', runId: 'phrun-a-b', repoUuid: 'R', map: 'core', phase: 'BL15', state: 'building', ts: Date.now() });
  const out = await RAct.run({ repoUuid: 'R', hat: 'repo_r', session: 'phrun-a-b', message: 'build BL15', provider: 'ollama:qwen:3b' }, async () => {
    RAct.feed({ repoUuid: 'R', event: 'dispatched', session: 'repo-agent-R-phrun-a-b', provider: 'ollama · qwen:3b' });
    RAct.tool('R', { name: 'idearium.code_write.tool', state: 'running', session: 'repo-agent-R-phrun-a-b' });
    RAct.tool('R', { name: 'idearium.code_write.tool', state: 'failed', args: 'frontend/index.js', error: 'already exists', session: 'repo-agent-R-phrun-a-b' });
    RAct.feed({ repoUuid: 'R', event: 'chunk', fullLen: 900, session: 'repo-agent-R-phrun-a-b' });
    return { ok: false, error: 'ollama sent nothing for 45000 ms' };
  });
  check('RA-04 run() returns what the call returned', out && out.ok === false);
  RAct.phaseRow({ uuid: 'phrun-a-b-failed', runId: 'phrun-a-b', repoUuid: 'R', state: 'failed', provider: 'ollama:qwen:3b', rung: 1, rungs: 3, error: 'ollama sent nothing', ts: Date.now() });
  check('RA-04b a failed attempt on a ladder (it has a rung) does not end the phase', RAct.get('phrun-a-b').status === 'running');
  RAct.phaseRow({ uuid: 'phrun-a-b-r2t1-skipped', runId: 'phrun-a-b', repoUuid: 'R', state: 'skipped', memorySkip: true, provider: 'ollama:qwen:7b', error: 'not enough memory to load it now', ts: Date.now() });
  await RAct.run({ repoUuid: 'R', session: 'phrun-a-b-r3t1', message: 'build BL15', provider: 'chatgpt' }, async () => ({ ok: true, text: 'x'.repeat(500), injects: { injects: [{ path: 'src/a.js' }] }, toolCalls: [{ name: 'idearium.code_write.tool', ok: true }] }));
  let L = RAct.list('R');
  const ph = L.tasks.find(t => t.id === 'phrun-a-b');
  check('RA-05 the phase build is one top-level task holding its two attempts', ph && ph.kind === 'phase' && ph.children.length === 2 && ph.status === 'running', ph && `${ph.kind} ${ph.children.length} ${ph.status}`);
  const a1 = ph.children[0], a2 = ph.children[1];
  check('RA-06 the first attempt failed, with its reason', a1.status === 'failed' && /45000/.test(a1.result.error));
  check('RA-07 its steps: started, dispatched, the failed tool call with its file, the failure', a1.steps.some(s => /^started on ollama:qwen:3b/.test(s.text)) && a1.steps.some(s => s.text === 'dispatched')
    && a1.steps.some(s => /tool code_write frontend\/index\.js ✗ already exists/.test(s.text) && s.bad) && a1.steps.some(s => /^failed after/.test(s.text) && s.bad), JSON.stringify(a1.steps.map(s => s.text)));
  check('RA-08 a chunk is counted, not a step each', !a1.steps.some(s => /chunk/.test(s.text)));
  check('RA-09 the second attempt is done, with the file and the tool it used', a2.status === 'done' && a2.result.files[0] === 'src/a.js' && a2.result.tools[0].name === 'code_write' && a2.result.chars === 500);
  check('RA-10 the memory skip is a step on the phase, marked', ph.steps.some(s => /^skipped · ollama:qwen:7b — not enough memory/.test(s.text) && s.bad));
  RAct.phaseRow({ uuid: 'phrun-a-b-proof', runId: 'phrun-a-b-proof', buildRunId: 'phrun-a-b', repoUuid: 'R', state: 'proven', ts: Date.now() });
  L = RAct.list('R');
  check('RA-11 the proof ends the phase task: done', L.tasks.find(t => t.id === 'phrun-a-b').status === 'done');
  check('RA-12 nothing is running now', L.running === 0, String(L.running));
  RAct.phaseRow({ uuid: 'phrun-c-d-started', runId: 'phrun-c-d', repoUuid: 'R', state: 'building', ts: Date.now() });
  RAct.phaseRow({ uuid: 'phrun-c-d-failed', runId: 'phrun-c-d', repoUuid: 'R', state: 'failed', error: 'guardian unreachable', ts: Date.now() });
  check('RA-12b with no ladder, a failed attempt ends the phase: failed, with the reason', RAct.get('phrun-c-d').status === 'failed' && /guardian unreachable/.test(RAct.get('phrun-c-d').result.error));

  // a fallback hop inside a call is its child
  await RAct.run({ repoUuid: 'R', message: 'hello', provider: 'claude' }, async () => {
    await RAct.run({ repoUuid: 'R', message: 'hello', provider: 'chatgpt' }, async () => ({ ok: true, text: 'hi' }));
    return { ok: true, text: 'hi' };
  });
  L = RAct.list('R');
  const chat = L.tasks.find(t => t.kind === 'chat' && !t.fromLog);
  check('RA-13 a call made inside another (a fallback hop) is its child', chat && chat.children.length === 1 && chat.children[0].provider === 'chatgpt');

  // running first, then newest; a stale task says so
  const t = RAct.begin({ repoUuid: 'R', message: 'long one' });
  const t2 = RAct.begin({ repoUuid: 'R', message: 'old one' });
  t2.updatedAt = Date.now() - RAct.STALE_MS - 1000;
  L = RAct.list('R');
  check('RA-14 running tasks come first', L.tasks[0].status === 'running' || L.tasks[0].status === 'stale');
  check('RA-15 a task with nothing for 15 min reads stale, never live', L.tasks.find(x => x.id === t2.id).status === 'stale' && L.tasks.find(x => x.id === t.id).status === 'running');
  RAct.end(t, { ok: true, text: '' }); RAct.end(t2, { ok: true, text: '' });

  // every change is sent; other repos are separate; bounded
  check('RA-16 every change goes to onChange (to be broadcast)', sent.length > 10 && sent.every(x => x.repoUuid === 'R'));
  check('RA-17 another repo\'s list is its own', RAct.list('OTHER').tasks.length === 0);
  for (let i = 0; i < RAct.MAX_PER_REPO + 20; i++) RAct.end(RAct.begin({ repoUuid: 'B', message: `m${i}` }), { ok: true });
  const keep = RAct.begin({ repoUuid: 'B', message: 'still running' });
  for (let i = 0; i < 10; i++) RAct.end(RAct.begin({ repoUuid: 'B', message: `n${i}` }), { ok: true });
  const LB = RAct.list('B', { limit: 500 });
  check('RA-18 bounded per repo, and a running task is never dropped', LB.tasks.length <= RAct.MAX_PER_REPO && LB.tasks.some(x => x.id === keep.id));

  // wired where it acts
  const ra = fs.readFileSync(path.join(ROOT, 'lib/repo-agent.js'), 'utf8');
  check('RA-19 every repo-agent dispatch is a task (the one door)', /async function dispatch\(opts = \{\}\) \{[\s\S]{0,900}RAct\.run\(\{ repoUuid: o\.repo\.uuid, hat,/.test(ra) && /async function _dispatch\(\{ repo, repoDir, message/.test(ra));
  const idx = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
  check('RA-20 idearium: phase rows, the guardian feed, the Ollama stream and tool calls feed the tasks; changes broadcast', /_repoActivity\(\)\.phaseRow\(row\)/.test(idx) && /_repoActivity\(\)\.feed\(fp\)/.test(idx)
    && /_repoActivity\(\)\.feed\(\{ repoUuid: params\.uuid, event: body\.event/.test(idx) && /_repoActivity\(\)\.tool\(params\.uuid, ev\)/.test(idx) && /broadcast\('idearium\.repo\.task'/.test(idx));
  check('RA-21 GET /api/repos/:uuid/tasks', /\['api','repos',    ':uuid','tasks'\],  'repo\.tasks'\]/.test(idx) && /case 'repo\.tasks': \{/.test(idx) && /'repo\.tasks': CAPS\.READ_IDEAS/.test(idx));
  const app = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/app.js'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'idearium/ui/index.html'), 'utf8');
  check('RA-22 the page: the panel loaded, SSE idearium.repo.task to it, opening a repo tells it', /js\/repo-tasks\.js/.test(html) && /css\/repo-tasks\.css/.test(html) && /ev\.type === 'idearium\.repo\.task'.*rtIn/.test(app) && /rtRepoShown\(repo\)/.test(app));

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exitCode = fail ? 1 : 0;
})();
