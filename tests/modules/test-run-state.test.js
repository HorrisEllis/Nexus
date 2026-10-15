'use strict';
/**
 * tests/modules/test-run-state.test.js — 0.60.50, CE1–CE5 + CE10 of docs/2026-10-15-code-tab-run-state-phasemap.spec
 *
 * James, 2026-10-15: "use nexus for the workload, instead of relying on the agents to remember." · "i want it to start exactly
 * where it left off if it restarts." · "need the full pipeline working."
 *   RS-0x  the run state: a node, kept after every call, resumed when the same goal is sent again
 *   RS-1x  the task header: an editable block, filled from the run, bounded
 *   RS-2x  the reply-on-task gate and the reply kind
 *   RS-3x  the pipeline: copilot's tool loop sends the header with every follow-up round and re-prompts an off-task reply once
 *   RS-4x  the response: kind and run tags; a lost job is a class that always falls back
 */
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'run-state-test-'));
process.env.RUN_STATE_DIR = path.join(TMP, 'run-state');
process.env.GUARDIAN_RESPONSE_NODES_DIR = path.join(TMP, 'nodes');

let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }

// the live reply from James's BL30 build, 2026-10-15 (job c2e60104)
const OFF_TASK = "I've got the NEXUS README excerpt.\n\nWhat would you like me to do with this material?\n\nReview the architecture — identify strengths.\n\nContinue reading the atlas — work through lines 81–376.";
const CALL = (name, args) => `tool\n\`\`\`\n${JSON.stringify({ name, arguments: args })}\n\`\`\``;

async function run() {
  console.log('\ntest-run-state\n');
  const RS = require(path.join(ROOT, 'lib', 'run-state.js'));
  const PB = require(path.join(ROOT, 'lib', 'repo-prompt-blocks.js'));
  const SG = require(path.join(ROOT, 'lib', 'step-gate.js'));
  const RK = require(path.join(ROOT, 'lib', 'reply-kind.js'));
  const nx = require(path.join(ROOT, 'lib', 'node-export.js'));
  const bus = require(path.join(ROOT, 'nexus', 'nexus-bus.js'));
  const seen = []; for (const t of ['run.started', 'run.resumed', 'run.step', 'run.finished', 'run.failed', 'run.off-task', 'run.lost', 'run.fallback']) bus.on(t, e => seen.push(t));

  // ── RS-0x the run state ──
  const r1 = RS.begin({ repoUuid: 'repo-a', session: 'phrun-1', goal: 'Audit the registries (BL30)', provider: 'chatgpt' });
  check('RS-01 a run is a node: a .run file of type run, tagged repo, session, status, attempt', fs.existsSync(path.join(RS.dir(), `${r1.runId}.run`))
    && nx.importFromFile(path.join(RS.dir(), `${r1.runId}.run`)).type === 'run' && nx.importFromFile(path.join(RS.dir(), `${r1.runId}.run`)).tags.includes('attempt:1')
    && nx.KNOWN_TYPES.includes('run') && fs.existsSync(path.join(ROOT, 'lib/node-schemas/schema.run')));
  RS.step(r1.runId, { name: 'idearium.code_map.tool', arguments: { repoUuid: 'x' }, ok: true });
  RS.step(r1.runId, { name: 'idearium.code_read.tool', arguments: { path: 'README.md' }, ok: true });
  RS.step(r1.runId, { name: 'idearium.code_read.tool', arguments: { path: 'clear-glass/registry-components.js' }, ok: true });
  RS.step(r1.runId, { name: 'idearium.code_edit.tool', arguments: { path: 'a.js' }, ok: true });
  RS.step(r1.runId, { name: 'idearium.code_read.tool', arguments: { path: 'nope.js' }, ok: false, error: 'no such file' });
  const s = RS.load(r1.runId);
  const goal1 = r1.runId;
  check('RS-02 every call is written: 5 steps; reads and changes kept as paths; a failed read is not counted as read', s.stepCount === 5 && s.filesRead.join() === 'README.md,clear-glass/registry-components.js' && s.filesChanged.join() === 'a.js');
  const r2 = RS.begin({ repoUuid: 'repo-a', session: 'phrun-1', goal: 'Audit  the registries (BL30)', provider: 'gemini' });
  check('RS-03 the same goal again RESUMES (whitespace aside): attempt 2, the 5 steps kept, the provider updated', r2.attempt === 2 && r2.resumed === true && r2.stepCount === 5 && r2.provider === 'gemini');
  const r3 = RS.begin({ repoUuid: 'repo-a', session: 'phrun-1', goal: 'A different task', provider: 'gemini' });
  check('RS-04 a different goal in that session is a new run', r3.attempt === 1 && r3.stepCount === 0 && r3.goal === 'A different task');
  RS.finish(r3.runId, 'done');
  const r4 = RS.begin({ repoUuid: 'repo-a', session: 'phrun-1', goal: 'A different task', provider: 'gemini' });
  check('RS-05 a FINISHED (done) run is not resumed: the same goal sent again starts over', r4.attempt === 1 && r4.status === 'running');
  RS.finish(r4.runId, 'failed', 'x');
  check('RS-06 a failed run is resumable', RS.begin({ repoUuid: 'repo-a', session: 'phrun-1', goal: 'A different task' }).attempt === 2);
  check('RS-07 forSession finds the session\'s run; list filters by repo', RS.forSession('phrun-1') && RS.forSession('phrun-1').session === 'phrun-1' && RS.list({ repoUuid: 'repo-a' }).length === 1 && RS.list({ repoUuid: 'nobody' }).length === 0);
  check('RS-08 the run emitted run.started / run.step / run.resumed / run.finished on the bus', ['run.started', 'run.step', 'run.resumed', 'run.finished'].every(t => seen.includes(t)));
  // a crash mid-write never leaves half a file: the write is a rename
  check('RS-09 writes are atomic: no .tmp left behind', !fs.readdirSync(RS.dir()).some(f => f.endsWith('.tmp')));

  // a separate run for the header and loop checks (a run id is repo + session, so the runs above share one)
  const r5 = RS.begin({ repoUuid: 'repo-a', session: 'phrun-2', goal: 'Audit the registries (BL30)', provider: 'chatgpt' });
  RS.step(r5.runId, { name: 'idearium.code_map.tool', arguments: { repoUuid: 'x' }, ok: true });
  RS.step(r5.runId, { name: 'idearium.code_read.tool', arguments: { path: 'README.md' }, ok: true });
  RS.step(r5.runId, { name: 'idearium.code_read.tool', arguments: { path: 'clear-glass/registry-components.js' }, ok: true });
  RS.step(r5.runId, { name: 'idearium.code_edit.tool', arguments: { path: 'a.js' }, ok: true });
  RS.step(r5.runId, { name: 'idearium.code_read.tool', arguments: { path: 'nope.js' }, ok: false, error: 'no such file' });
  r1.runId = r5.runId;

  // ── RS-1x the task header ──
  const blk = PB.getBlocks(null).find(b => b.id === 'task-header');
  check('RS-10 task-header is a prompt block he can edit (on by default, placeholders declared), never rendered into the first prompt', !!blk && blk.enabled && blk.when === 'tools' && PB.PLACEHOLDERS['task-header'].includes('{goal}')
    && !PB.render({ persona: 'P', blocks: PB.getBlocks(null), message: 'Q', backend: 'guardian' }).used.includes('task-header'));
  const tpl = PB.taskHeaderTemplate(PB.getBlocks(null));
  const h = RS.header(r5.runId, tpl);
  check('RS-11 the header says the goal, the step to take, what is done and the last call', /Audit the registries/.test(h) && /step 6/i.test(h) && /read 2/.test(h) && /changed 1/.test(h) && /code_read/.test(h), h);
  check('RS-12 a line whose placeholders are all empty is dropped ("Next:" with no next); the header is bounded', !/Next:/.test(h) && RS.fill(tpl, { ...RS.load(r5.runId), goal: 'x'.repeat(5000) }).length <= 700);
  check('RS-13 the block off (null template) means no header; no run means none', PB.taskHeaderTemplate(PB.getBlocks(null).map(b => b.id === 'task-header' ? { ...b, enabled: false } : b)) === null && RS.header('no-such-run', tpl) === null);

  // ── RS-2x the gate and the kind ──
  const g = SG.check('reply.on_task', { text: OFF_TASK });
  check('RS-20 the live reply (job c2e60104) is blocked as off-task by the gate node', !g.ok && g.onBlock === 'reprompt' && /off-task/.test(g.reasons[0].reason));
  check('RS-21 a tool call, code, or an answer passes the gate', SG.check('reply.on_task', { text: CALL('idearium.code_map.tool', {}) }).ok && SG.check('reply.on_task', { text: 'The drift is in X.' }).ok
    && SG.check('reply.on_task', { text: 'What would you like me to do?\n```js a.js\nconst a = 1;\n```' }).ok);
  check('RS-22 reply kinds: tool-call · code · plan · off-task · prose · empty', RK.classify(CALL('a.tool', {})) === 'tool-call' && RK.classify('```js\nconst a=1\n```') === 'code' && RK.classify('{"plan":[{"id":1}]}') === 'plan'
    && RK.classify(OFF_TASK) === 'off-task' && RK.classify('The drift is in X.') === 'prose' && RK.classify('  ') === 'empty');

  // ── RS-3x copilot's tool loop ──
  const TR = require(path.join(ROOT, 'copilot', 'tool-runtime.js'));
  const sent = [];
  const replies = [CALL('idearium.code_read.tool', { path: 'a.js' }), OFF_TASK, CALL('idearium.code_read.tool', { path: 'b.js' })];
  const dispatchToAgent = async (prompt) => { sent.push(prompt); return { ok: true, text: replies.shift() }; };
  const cm = TR.makeNcpCallModel(dispatchToAgent, { composed: true, resultTemplate: '[tool result — {name}] {result}', toolScope: ['idearium.code_read.tool'], provider: 'chatgpt', runId: r5.runId, headerTemplate: tpl, runAttempt: 1 });
  const schemas = [{ function: { name: 'idearium.code_read.tool' } }];
  const SYS = { role: 'system', content: '' };
  const m = [SYS, { role: 'user', content: 'FIRST PROMPT' }];
  const a1 = await cm(m, schemas);
  check('RS-30 round 1 (attempt 1) is the prompt exactly as composed: no header added', sent[0] === 'FIRST PROMPT' && a1.toolCalls && a1.toolCalls.length === 1);
  m.push({ role: 'assistant', content: '' }, { role: 'tool', name: 'idearium.code_read.tool', content: '{"file":"a.js"}' });
  const a2 = await cm(m, schemas);
  check('RS-31 a follow-up round starts with the task header, then the tool result', /^Your task \(step 6, attempt 1\): Audit the registries/.test(sent[1]) && /\[tool result — idearium\.code_read\.tool\] \{"file":"a\.js"\}$/.test(sent[1]));
  check('RS-32 the off-task reply was blocked at the step and the round re-sent ONCE with the header; the retry\'s tool call is what comes back', sent.length === 3 && /^Your task/.test(sent[2]) && a2.reprompted === true && a2.toolCalls && a2.toolCalls[0].arguments.path === 'b.js');
  check('RS-33 the block is an event (step.blocked) and a note on the run (off-task)', RS.load(r5.runId).offTask === 1 && seen.includes('run.off-task'));
  const sent2 = []; const cm2 = TR.makeNcpCallModel(async (p) => { sent2.push(p); return { ok: true, text: OFF_TASK }; }, { composed: true, toolScope: [], provider: 'chatgpt', runId: r5.runId, headerTemplate: tpl, runAttempt: 1 });
  const mm = [SYS, { role: 'user', content: 'P' }]; await cm2(mm, schemas); mm.push({ role: 'assistant', content: '' }, { role: 'tool', name: 'x.tool', content: '{}' }); const b2 = await cm2(mm, schemas);
  check('RS-34 one re-prompt only: a second off-task reply stands as the answer (no loop)', sent2.length === 3 && b2.text === OFF_TASK && !b2.toolCalls);
  RS.begin({ repoUuid: 'repo-a', session: 'phrun-2', goal: 'Audit the registries (BL30)', provider: 'gemini' });   // the retry: begin() resumes the run, attempt 2
  const sent3 = []; const cm3 = TR.makeNcpCallModel(async (p) => { sent3.push(p); return { ok: true, text: CALL('a.tool', {}) }; }, { composed: true, toolScope: [], provider: 'chatgpt', runId: r5.runId, headerTemplate: tpl, runAttempt: 2 });
  await cm3([SYS, { role: 'user', content: 'RESUMED PROMPT' }], schemas);
  check('RS-35 a RESUMED run (attempt 2) opens with the header too: the retry knows where it stood', /^Your task \(step 6, attempt 2\)/.test(sent3[0]) && /RESUMED PROMPT$/.test(sent3[0]));
  const sent4 = []; const cm4 = TR.makeNcpCallModel(async (p) => { sent4.push(p); return { ok: true, text: CALL('a.tool', {}) }; }, { composed: true, toolScope: [], provider: 'chatgpt' });
  const m4 = [SYS, { role: 'user', content: 'P' }, { role: 'assistant', content: '' }, { role: 'tool', name: 'x.tool', content: '{}' }]; await cm4(m4.slice(0, 2), schemas); await cm4(m4, schemas);
  check('RS-36 with no run (or the block off) a round is exactly as before: nothing added', sent4[1] === '{}');

  // ── RS-4x the response and the lost job ──
  const sink = require(path.join(ROOT, 'guardian', 'lib', 'response-sink.js'));
  const w = sink.writeNode({ jobId: 'job-rs-1', provider: 'chatgpt', agentId: 'repo-repo-a', sessionId: 'phrun-1', status: 'complete', text: OFF_TASK, source: 'ncp' });
  const node = nx.importFromFile(w.detail);
  check('RS-40 a response node carries its kind and its run: tags kind, repo, session, run, step, attempt', node.tags.includes('kind:off-task') && node.tags.includes('repo:repo-a') && node.tags.includes('session:phrun-1')
    && node.tags.some(t => t.startsWith('run:repo-a__')) && node.tags.some(t => /^step:\d+$/.test(t)) && node.tags.some(t => /^attempt:\d+$/.test(t)) && node.payload.kind === 'off-task');
  const w2 = sink.writeNode({ jobId: 'job-rs-2', provider: 'gemini', agentId: null, status: 'complete', text: CALL('a.tool', {}), source: 'ncp' });
  check('RS-41 a response with no run still gets its kind (tool-call), and no run tags', nx.importFromFile(w2.detail).tags.includes('kind:tool-call') && !nx.importFromFile(w2.detail).tags.some(t => t.startsWith('run:')));
  const PR = require(path.join(ROOT, 'lib', 'pipeline-routing.js'));
  const LOST = 'the chatgpt tab was handed the job and did nothing with it for 90 s — the prompt was not typed, so it is not sent there again';
  check('RS-42 James\'s log line classifies as lost, and a lost job falls back even under a stored policy that predates it', PR.classify({ ok: false, error: LOST }) === 'lost' && PR.shouldFallback('lost', { fallbackOn: ['timeout'] }) && PR.CLASSES.includes('lost') && !PR.shouldFallback('login', PR.DEFAULTS));
  const idx = require(path.join(ROOT, 'clear-glass', 'src', 'downloads', 'artifact-chat-index.js'));
  const root = path.join(TMP, 'cg-index');
  const rec = idx.recordResponse(root, { kind: 'chat', provider: 'chatgpt', chatId: 'repo-repo-a', agentId: 'repo-repo-a', jobId: 'job-rs-3', raw: { jobId: 'job-rs-3', agentId: 'repo-repo-a', sessionId: 'phrun-2', response: OFF_TASK, prompt: 'p' } });
  const row = idx.queryItems(root, { agentId: 'repo-repo-a' })[0];
  check('RS-43 the Library\'s index row carries reply_kind, run_id, step, attempt, repo_uuid and can be queried by run and kind', row && row.reply_kind === 'off-task' && /^repo-a__/.test(row.run_id) && row.repo_uuid === 'repo-a' && row.step === 5
    && idx.queryItems(root, { runId: row.run_id }).length === 1 && idx.queryItems(root, { replyKind: 'code' }).length === 0);

  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(1); });
