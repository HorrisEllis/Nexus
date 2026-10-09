'use strict';
/**
 * tests/modules/test-guardian-retry-novelty-installs.js — §0.39.265
 *
 * James: "Can you have the run button menu prompt to install when it's not detected in the path? … Guardian needs
 * better retry logic. It got stuck earlier when I ran two jobs. Can reuse the same .jobs. The .jobs file in
 * guardian can link to the response. That way if it runs again can check for the response first. … Can we have
 * copilot create .jobs to chat gpt. With a semantic randomizer … force novelty each time … explain it like a
 * person … Maybe hook that in to ErosmancerOS"
 *
 * REAL: guardian's own job store (.job files on disk, in a temp dir), dispatcher, dispatch pool and pool bridge,
 * guardian/lib/job-retry.js, response-sink readNode, chat-transcripts matchJobs; lib/semantic-variant.js;
 * copilot/lib/reword.js with a model stand-in; lib/repo-prompt-blocks.js; cos/testenv/installer.js with a fake
 * package manager; and — where this host has Chromium + tsx — ErosmancerOS's real /api/human-type typing into a
 * real page shaped like a chat composer.
 * EMULATED: the provider tab (a fake NCP that is "still answering" the first job when the second arrives).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const cp = require('child_process');
const { EventEmitter } = require('events');
const ROOT = path.resolve(__dirname, '..', '..');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'g-retry-'));
process.env.GUARDIAN_JOBS_DIR = path.join(TMP, 'jobs');
process.env.GUARDIAN_RESPONSE_NODES_DIR = path.join(TMP, 'responses');
require('../../lib/test-sandbox.js').ensure();

let pass = 0, fail = 0, skipped = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }
function skip(n, why) { skipped++; console.log(`  - ${n} — SKIPPED: ${why}`); }
const wait = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 8000) { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await wait(25); } return false; }

async function main() {
  console.log('\ntest-guardian-retry-novelty-installs\n');
  const R = require(path.join(ROOT, 'guardian', 'lib', 'job-retry.js'));

  // ── classification ──
  const C = (g, e) => R.classify(g, e).kind;
  check('classify: "Input not found — no contenteditable" is retryable (input)', C('tab takes the job', 'handleJob: Input not found — no contenteditable') === 'input');
  check('classify: "the tab is still answering another job" is retryable (tab-busy)', C(null, 'the tab is still answering another job — wait for it') === 'tab-busy');
  check('classify: a send that never happened is retryable (submit)', C('submit', 'the prompt was typed into the page but never sent') === 'submit');
  check('classify: login, captcha, rate limits and usage caps are NOT retried (they need you)', ['please log in', 'verify you are human', 'rate limit reached', 'You have hit your usage cap'].every(e => C(null, e) === 'needs-you'));

  // ── the real job store + dispatcher + pool, and a tab that is busy when the second job arrives ──
  const { createJobStore } = require(path.join(ROOT, 'guardian', 'lib', 'jobs.js'));
  const { createDispatcher } = require(path.join(ROOT, 'guardian', 'lib', 'dispatcher.js'));
  const { pool } = require(path.join(ROOT, 'guardian', 'lib', 'dispatch-pool.js'));
  const bus = new EventEmitter(); bus.setMaxListeners(50);
  require(path.join(ROOT, 'guardian', 'lib', 'dispatch-pool-bridge.js'))(bus, pool);
  const store = createJobStore();
  const { jobs, createJob, updateJob } = store;
  const pushes = [];
  let answering = null;                       // the job the tab is answering right now
  let retryRef = null;
  const complete = (job, text, chatUrl, source) => {
    updateJob(job.id, { status: 'complete', responseText: text, completedAt: Date.now(), completedVia: source || 'tab' });
    bus.emit('guardian.job.complete', { jobId: job.id, provider: job.provider });
  };
  const ncp = {
    isConnected: () => true,
    push: () => 1,
    pushActive: (provider, payload) => {
      if (payload.type !== 'GUARDIAN_JOB') return 1;
      pushes.push(payload.jobId);
      if (answering) {                          // the composer is gone while a reply streams — the 0.39.264 failure
        setTimeout(() => { const r = retryRef.onError(payload.jobId, { gate: 'tab takes the job', error: 'handleJob: Input not found — no contenteditable (the tab is still answering another job)', provider }); if (!r.handled) { updateJob(payload.jobId, { status: 'error' }); bus.emit('guardian.job.error', { jobId: payload.jobId, provider }); } }, 20);
        return 1;
      }
      answering = payload.jobId;
      setTimeout(() => { const j = jobs.get(payload.jobId); answering = null; complete(j, `answer to: ${j.prompt.slice(0, 30)}`); }, 250);
      return 1;
    },
  };
  const dispatcher = createDispatcher({ updateJob, bus, ncp, pendingQueue: new Map(), cockpitBroadcast: () => {}, dispatchToMistral: async () => {}, dispatchToDeepseek: async () => {},
    pingTimeoutMs: 30, completionTimeoutMs: 60000,
    answerFirst: (job) => retryRef && retryRef.answerFirst(job), completeWith: complete,
    erosType: async (job) => ({ ok: true, typed: job.prompt.length, ms: 5 }) });
  // the real pool is shared: make chatgpt's cap 1 as in production
  const readNode = require(path.join(ROOT, 'guardian', 'lib', 'response-sink.js')).readNode;
  retryRef = R.createJobRetry({ jobs, updateJob, bus, pool, dispatchJob: dispatcher.dispatchJob, complete, readResponse: readNode, replyFor: () => null,
    erosAvailable: () => false, log: { log() {}, warn() {} }, delays: { default: [60, 120, 200], 'tab-busy': [300, 400, 500] } });

  // the pool holds one chatgpt job at a time; release the slot the moment the fake tab "finishes" early,
  // exactly as a too-early completion did live — so the second job reaches a busy tab
  const A = createJob({ command: 'ask', provider: 'chatgpt', prompt: 'first job: explain the dispatcher please' });
  dispatcher.dispatchJob(A);
  await until(() => pushes.includes(A.id));
  pool.release('chatgpt', A.id);             // the early release (0.39.264: userscript "completed" 0ch while streaming)
  const B = createJob({ command: 'ask', provider: 'chatgpt', prompt: 'second job: now explain the pool too' });
  dispatcher.dispatchJob(B);
  const bothDone = await until(() => jobs.get(A.id).status === 'complete' && jobs.get(B.id).status === 'complete', 10000);
  check('two jobs at once: the second hits a busy tab, is retried, and BOTH complete (nothing stuck)', bothDone, JSON.stringify({ a: jobs.get(A.id).status, b: jobs.get(B.id).status }));
  const bJob = jobs.get(B.id);
  check('the retry is on the .job: attempts[] with gate, error and kind', Array.isArray(bJob.attempts) && bJob.attempts.length === 1 && bJob.attempts[0].kind === 'tab-busy' && /Input not found/.test(bJob.attempts[0].error));
  const onDisk = fs.readFileSync(path.join(process.env.GUARDIAN_JOBS_DIR, `${B.id}.job`), 'utf8');
  check('…and on disk (the .job file is the record)', /tab-busy/.test(onDisk) && /attempts/.test(onDisk));
  check('the second job was sent twice (first refused by the busy tab, then taken)', pushes.filter(x => x === B.id).length === 2);

  // ── answer first: a re-send never happens when the answer already exists ──
  const D = createJob({ command: 'ask', provider: 'chatgpt', prompt: 'third job: the answer landed but the tab reported a failure' });
  const RS = require(path.join(ROOT, 'guardian', 'lib', 'response-sink.js'));
  RS.writeNode({ jobId: D.id, provider: 'chatgpt', status: 'complete', text: 'the answer, already on disk', source: 'test' });
  const pushesBefore = pushes.length;
  const rD = retryRef.onError(D.id, { gate: 'reply appears', error: 'no reply within 90s', provider: 'chatgpt' });
  check('answer first: a job whose .response already exists completes from it — not re-sent', rD.handled && rD.answered === 'response-node' && jobs.get(D.id).status === 'complete' && jobs.get(D.id).responseText === 'the answer, already on disk' && pushes.length === pushesBefore);
  const E = createJob({ command: 'ask', provider: 'chatgpt', prompt: 'fourth job: its reply is in the chat log' });
  const retry2 = R.createJobRetry({ jobs, updateJob, bus, pool, dispatchJob: dispatcher.dispatchJob, complete, readResponse: () => null,
    replyFor: (job) => { const { matchJobs } = require(path.join(ROOT, 'guardian', 'lib', 'chat-transcripts.js')); const m = matchJobs([{ role: 'user', text: job.prompt }, { role: 'assistant', text: 'from the transcript' }], [job])[0]; return m && m.reply ? { text: m.reply } : null; },
    log: { log() {}, warn() {} } });
  const rE = retry2.onError(E.id, { gate: 'submit', error: 'never sent' });
  check('answer first: …or from its chat transcript (the prompt as a user turn, answered next)', rE.answered === 'transcript' && jobs.get(E.id).responseText === 'from the transcript');

  // ── bounded, with every reason; final errors are not retried ──
  const F = createJob({ command: 'ask', provider: 'chatgpt', prompt: 'fifth job: the tab never has a composer' });
  const noDispatch = R.createJobRetry({ jobs, updateJob, bus, pool, dispatchJob: () => {}, complete, log: { log() {}, warn() {} }, maxAttempts: 3, setTimer: () => null });
  let last;
  for (let i = 0; i < 3; i++) { last = noDispatch.onError(F.id, { gate: 'tab takes the job', error: `Input not found #${i + 1}` }); if (last.handled) updateJob(F.id, { status: 'dispatched' }); }
  check('retries are bounded: the last attempt is not retried', last.handled === false && last.exhausted === true && jobs.get(F.id).attempts.length === 3);
  const msg = noDispatch.finalError(jobs.get(F.id), 'Input not found #3');
  check('…and the final error lists every attempt', /after 3 attempts: 1\) input .*2\) input .*3\) input/.test(msg), msg);
  const G = createJob({ command: 'ask', provider: 'chatgpt', prompt: 'sixth job: a captcha appeared' });
  const rG = noDispatch.onError(G.id, { error: 'Please verify you are human' });
  check('a captcha / login / cap is final at once (retrying would not help)', rG.handled === false && rG.kind === 'needs-you');

  // §HP11 0.55.1 — James: "look at the .response in clearglass." The page changed: never re-sent, the .response first, then ◎
  const ERR = 'no reply element found after 180s — findResponseEl() matched nothing on this page, so the reply could not be read';
  check('classify: a reply element the page no longer matches is not retried (pick-reply), a plain no-reply still is', C('reply appears', ERR) === 'pick-reply' && C('reply appears', 'no reply within 90s') === 'no-reply');
  const P1 = createJob({ command: 'ask', provider: 'claude', prompt: 'eighth job: claude answered, the selector missed it' });
  const sent = []; const withNode = R.createJobRetry({ jobs, updateJob, bus, pool, dispatchJob: (j) => sent.push(j.id), complete, readResponse: (id) => id === P1.id ? { status: 'complete', text: 'the answer, read from the .response' } : null, replyFor: () => null, log: { log() {}, warn() {} }, setTimer: () => null });
  const rP1 = withNode.onError(P1.id, { gate: 'reply appears', error: ERR, provider: 'claude' });
  check('pick-reply: the answer in the Clear Glass .response completes the job — not sent again', rP1.handled && rP1.answered && jobs.get(P1.id).status === 'complete' && sent.length === 0);
  const P2 = createJob({ command: 'ask', provider: 'claude', prompt: 'ninth job: no record anywhere' });
  const said = []; bus.on('guardian.job.progress', (e) => { if (e.jobId === P2.id) said.push(e); });
  const rP2 = withNode.onError(P2.id, { gate: 'reply appears', error: ERR, provider: 'claude' });
  check('pick-reply: nothing to read → not retried, the job asks for ◎, the prompt is never re-sent', rP2.handled === false && rP2.kind === 'pick-reply' && sent.length === 0 && /◎/.test(jobs.get(P2.id).needsYou || '') && said.some(e => e.stage === 'needs-you' && /◎/.test(e.how)));

  // ── ErosmancerOS as the fallback typist after two input failures ──
  const H = createJob({ command: 'ask', provider: 'chatgpt', prompt: 'seventh job: composer missing twice' });
  let timers = [];
  const viaEros = R.createJobRetry({ jobs, updateJob, bus, pool, dispatchJob: (j) => { viaEros._last = j; }, complete, erosAvailable: () => true, log: { log() {}, warn() {} }, setTimer: (fn) => { timers.push(fn); return null; } });
  viaEros.onError(H.id, { error: 'Input not found' }); timers.shift()();
  check('attempt 2 still goes through the tab\'s userscript', viaEros._last && viaEros._last.transport !== 'eros');
  updateJob(H.id, { status: 'delivered' });
  viaEros.onError(H.id, { error: 'Input not found' }); timers.shift()();
  check('attempt 3, after two input failures, is typed by ErosmancerOS', jobs.get(H.id).transport === 'eros');
  pool.release('chatgpt', H.id);
  const pushesE = pushes.length;
  updateJob(H.id, { status: 'pending' });
  dispatcher.dispatchJob(jobs.get(H.id));
  await until(() => jobs.get(H.id).status === 'delivered' && jobs.get(H.id).transport === 'eros');
  check('the dispatcher routes an eros job to the typist, not the tab', jobs.get(H.id).transport === 'eros' && pushes.length === pushesE && jobs.get(H.id).erosTyping && jobs.get(H.id).erosTyping.chars > 0);
  complete(jobs.get(H.id), 'typed via eros, answered in the tab');   // its reply lands → the chatgpt slot frees
  await until(() => pool.available('chatgpt'), 500);

  // ── "Can reuse the same .jobs": an identical in-flight job is joined, never sent twice ──
  const J1 = createJob({ command: 'ask', provider: 'chatgpt', prompt: 'identical question, asked twice quickly', agentId: 'repo-x' });
  const J2 = createJob({ command: 'ask', provider: 'chatgpt', prompt: 'identical question, asked twice quickly', agentId: 'repo-x' });
  check('an identical job while the first is in flight joins it (same .job)', J1.id === J2.id && jobs.get(J1.id).joinedBy === 1);
  const J3 = createJob({ command: 'ask', provider: 'chatgpt', prompt: 'Same question in NEW words (reworded)', canonical: 'identical question, asked twice quickly', agentId: 'repo-x' });
  check('a reworded variant with the same canonical meaning joins too', J3.id === J1.id);
  const K = createJob({ command: 'ask', provider: 'chatgpt', prompt: 'identical question, asked twice quickly', agentId: 'repo-other' });
  check('another agent asking the same words is its own job', K.id !== J1.id);
  let n0 = pushes.length;
  dispatcher.dispatchJob(J1); dispatcher.dispatchJob(J2);
  await until(() => jobs.get(J1.id).status === 'complete', 5000);
  check('dispatching a joined job twice sends it once', pushes.length - n0 === 1, String(pushes.length - n0));
  const J4 = createJob({ command: 'ask', provider: 'chatgpt', prompt: 'identical question, asked twice quickly', agentId: 'repo-x', reuse: 'complete' });
  check('reuse:"complete" answers from a finished twin\'s .job (opt-in)', J4.id === J1.id && J4.status === 'complete');
  const J5 = createJob({ command: 'ask', provider: 'chatgpt', prompt: 'identical question, asked twice quickly', agentId: 'repo-x' });
  check('without reuse, asking again after it finished is a new job (asking again is usually on purpose)', J5.id !== J1.id);

  // ── the semantic randomizer ──
  const SV = require(path.join(ROOT, 'lib', 'semantic-variant.js'));
  const q = 'Can you explain how guardian/lib/dispatcher.js retries a job? Also check `_requeueOrFail`, GUARDIAN_COMPLETION_TIMEOUT_MS (900000ms) and "tab takes the job" in v0.39.264.';
  const P = SV.protect(q);
  check('protect: code, paths, identifiers, numbers, versions and quotes are set aside', ['guardian/lib/dispatcher.js', '`_requeueOrFail`', 'GUARDIAN_COMPLETION_TIMEOUT_MS', '900000ms', '"tab takes the job"', 'v0.39.264'].every(t => P.tokens.includes(t)) && !/dispatcher\.js/.test(P.masked), JSON.stringify(P.tokens));
  let allValid = true, distinct = new Set();
  for (let i = 0; i < 40; i++) { const v = SV.jsVariant(q, 1000 + i); distinct.add(v); if (!SV.validate(q, v, P.tokens).ok) { allValid = false; break; } }
  check('the JS rewriter never touches a protected part (40 seeds)', allValid);
  check('…and produces many different wordings', distinct.size >= 10, String(distinct.size));
  check('validate rejects a variant that changed a path', !SV.validate(q, q.replace('dispatcher.js', 'dispatch.js') + ' ok', P.tokens).ok);
  const nov = new SV.NoveltyStore({ dir: path.join(TMP, 'novelty') });
  nov.record('agent-1', 'Could you walk me through the retry logic in the dispatcher?');
  check('novelty: the same wording again is NOT novel', !nov.check('agent-1', 'Could you walk me through the retry logic in the dispatcher?').novel);
  check('novelty: a genuinely different wording is', nov.check('agent-1', 'How does the dispatcher decide to try a job again after it fails?').novel);

  // ── copilot's reword: model first (validated), JS fallback, novelty recorded ──
  const RW = require(path.join(ROOT, 'copilot', 'lib', 'reword.js'));
  const store2 = new SV.NoveltyStore({ dir: path.join(TMP, 'novelty2') });
  // markers are numbered in protect()'s pass order, so the stand-in model looks each one up
  const M = (tok) => `⟦${P.tokens.indexOf(tok)}⟧`;
  const GOOD = `- How does ${M('guardian/lib/dispatcher.js')} go about retrying a job? While you are there, look at ${M('`_requeueOrFail`')}, ${M('GUARDIAN_COMPLETION_TIMEOUT_MS')} (${M('900000ms')}) and ${M('"tab takes the job"')} in ${M('v0.39.264')}.`;
  let asked = null;
  const r1 = await RW.reword({ text: q, key: 'repo-a', store: store2, guidance: 'the way a person would ask it again',
    callModel: async (prompt) => { asked = prompt; return [
      `- Walk me through how guardian/lib/dispatch.js retries a job, and look at ${M('`_requeueOrFail`')}, ${M('GUARDIAN_COMPLETION_TIMEOUT_MS')} (${M('900000ms')}) and ${M('"tab takes the job"')} in ${M('v0.39.264')}.`,   // changed a path → rejected
      GOOD,
    ].join('\n'); } });
  check('the model is asked with the protected parts as markers, plus the editable guidance', asked.includes(M('guardian/lib/dispatcher.js')) && !/dispatcher\.js/.test(asked) && /Guidance: the way a person/.test(asked));
  check('a model variant that changed a path is thrown out with the reason', r1.tried.some(t => !t.ok && /protected part|marker/.test((t.reasons || []).join(' '))));
  check('the valid model variant is used, protected parts restored exactly', r1.source === 'ollama' && r1.text.startsWith('How does guardian/lib/dispatcher.js go about retrying') && SV.validate(q, r1.text).ok, r1.text);
  const r2 = await RW.reword({ text: q, key: 'repo-a', store: store2, callModel: async () => GOOD });
  check('force novelty: the same model wording a second time loses to a new one', r2.text !== r1.text && r2.novel, JSON.stringify({ src: r2.source, novel: r2.novel }));
  const r3 = await RW.reword({ text: q, key: 'repo-b', store: store2, callModel: async () => null });
  check('model down → the built-in rewriter, still valid', r3.source === 'js' && SV.validate(q, r3.text).ok);
  const COP = fs.readFileSync(path.join(ROOT, 'copilot', 'server.js'), 'utf8');
  check('copilot serves POST /api/reword', /p === '\/api\/reword'/.test(COP) && /reword\.js/.test(COP));

  // ── editable voice + reword blocks ──
  const PB = require(path.join(ROOT, 'lib', 'repo-prompt-blocks.js'));
  const g = PB.render({ persona: 'P', blocks: PB.DEFAULT_BLOCKS, message: 'hello there, what is this repo?', backend: 'guardian' });
  const o = PB.render({ persona: 'P', blocks: PB.DEFAULT_BLOCKS, message: 'hello there, what is this repo?', backend: 'ollama' });
  check('voice ("explain it like a person, not a wall of text") is sent to browser agents, before the question', g.used.includes('voice') && g.text.indexOf('No walls of text') < g.text.indexOf('hello there'));
  check('…not to the local model, and the reword block is never sent', !o.used.includes('voice') && !g.used.includes('reword') && !/Same meaning, different words/.test(g.text));
  const RA = fs.readFileSync(path.join(ROOT, 'lib', 'repo-agent.js'), 'utf8');
  check('the repo agent rewords through copilot when the block is on, and sends the original as canonical', /\/api\/reword/.test(RA) && /payload\.canonical = compose\(/.test(RA));

  // ── installer: the Run menu's "install it?" ──
  const I = require(path.join(ROOT, 'cos', 'testenv', 'installer.js'));
  const pw = I.plan('python3', { platform: 'win32', _has: () => true });
  check('plan (Windows): winget, the exact id, unattended', pw.manager === 'winget' && pw.argv.includes('Python.Python.3.12') && pw.unattended);
  check('plan (macOS): brew', I.plan('qemu', { platform: 'darwin', _has: () => true }).command === 'brew install qemu');
  const pl = I.plan('ruby', { platform: 'linux', _has: (b) => b === 'apt-get' });
  check('plan (Linux, sudo needs a password): the exact command is handed over, nothing prompts in the background', !pl.unattended || (typeof process.getuid === 'function' && process.getuid() === 0) ? true : false);
  let foundAfter = false;
  const fakeSpawn = () => { const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); setTimeout(() => { c.stdout.emit('data', 'Successfully installed\n'); foundAfter = true; c.emit('exit', 0); }, 30); return c; };
  const st0 = I.install('go', { _spawn: fakeSpawn, _plan: () => ({ manager: 'winget', argv: ['winget', 'install', '--id', 'GoLang.Go'], command: 'winget install --id GoLang.Go', unattended: true }), _find: () => ({ found: foundAfter, bin: 'go', version: 'go1.23' }), _refresh: () => ({}) });
  check('install runs in the background', st0.state === 'running');
  await until(() => I.status('go').state !== 'running');
  check('…and succeeds only when the tool is FOUND afterwards (PATH refreshed)', I.status('go').state === 'done' && I.status('go').log.some(l => /Successfully installed/.test(l.msg)));
  const stN = I.install('php', { _plan: () => ({ manager: 'apt-get', argv: ['sudo', '-n', 'apt-get'], command: 'sudo apt-get install -y php-cli', unattended: false, note: 'this needs your password' }) });
  check('an install that needs a password is not attempted — the command is returned', stN.state === 'needs_you' && /sudo apt-get install -y php-cli/.test(stN.result.command));
  const needs = I.needsFor(['a.py', 'tests/test_b.py', 'c.js', 'x.rb'], { qemuMissing: true, _find: (t) => ({ found: t === 'ruby' }), _plan: (t) => ({ manager: 'm', command: `install ${t}`, unattended: true }) });
  check('the menu asks for what THIS repo needs: QEMU (VM) and Python (2 files), not Ruby (installed)', needs.map(n => n.tool).join() === 'qemu,python3' && needs[1].count === 2);
  const refreshed = (() => { const before = process.env.PATH; const r = I.refreshPath({ _reg: (k) => (/HKCU/.test(k) ? '/opt/newtool/bin' : '') }); const ok = r.changed && process.env.PATH.includes('/opt/newtool/bin'); process.env.PATH = before; return ok; })();
  check('refreshPath picks up a PATH the installer changed, without restarting Nexus', refreshed);
  const APP = fs.readFileSync(path.join(ROOT, 'idearium', 'ui', 'js', 'app.js'), 'utf8');
  check('Run menu: "NOT INSTALLED ON THIS COMPUTER — INSTALL NOW?" with Install / Not now', /INSTALL NOW\?/.test(APP) && /_installStart\(/.test(APP) && /Not now/.test(APP));
  const API = fs.readFileSync(path.join(ROOT, 'idearium', 'api', 'index.js'), 'utf8');
  check('Idearium routes POST /api/cos/install to the installer, and the menu carries installs[]', /case 'cos\.install'/.test(API) && /installs: opts\.installs/.test(API));

  // ── guardian's Eros typist (wire contract) ──
  const ET = require(path.join(ROOT, 'guardian', 'lib', 'eros-typist.js'));
  const calls = [];
  const typist = ET.createErosTypist({ selectorsFor: () => ({ input: '#my-map-input', send: '#my-send' }), _req: async (port, m, p, body) => {
    calls.push({ m, p, body });
    if (p === '/eros-supervisor') return { status: 200, body: { state: 'running' } };
    if (p === '/eros/health') return { status: 200, body: { state: 'connected' } };
    return { status: 200, body: { ok: true, typed: body.text.length, ms: 1200, url: 'https://chatgpt.com/c/1' } };
  } });
  await typist.check();
  check('the typist is available only when ErosmancerOS runs AND is connected to the browser', typist.available() === true);
  const t = await typist.type({ id: 'j1', provider: 'chatgpt', prompt: 'line one\nline two', chatUrl: 'https://chatgpt.com/c/1' });
  const sentBody = calls.find(c => c.p === '/eros/human-type').body;
  check('it types into the provider\'s own tab (host chatgpt.com, its chat), guardian\'s selectors first', t.ok && sentBody.host === 'chatgpt.com' && sentBody.chatUrl === 'https://chatgpt.com/c/1' && sentBody.inputSelectors[0] === '#my-map-input' && sentBody.inputSelectors.includes('#prompt-textarea'));

  // ── ErosmancerOS /api/human-type, for real ──
  const chrome = (() => { try { for (const d of fs.readdirSync('/opt/pw-browsers')) { const p = path.join('/opt/pw-browsers', d, 'chrome-linux', 'chrome'); if (/^chromium-\d+$/.test(d) && fs.existsSync(p)) return p; } } catch (_) {} return process.env.CHROME_BIN || null; })();
  let esbuildOk = false; try { require(require.resolve('esbuild', { paths: [ROOT] })).transformSync('let a: number = 1', { loader: 'ts' }); esbuildOk = true; } catch (_) {}
  const { ErosSupervisor, _tsxCli } = require(path.join(ROOT, 'clear-glass', 'src', 'eros', 'supervisor.js'));
  if (!chrome || !esbuildOk || !_tsxCli()) skip('ErosmancerOS human typing in a real browser', !chrome ? 'no Chromium' : 'tsx/esbuild not usable here');
  else {
    const page = `<!doctype html><body><div id="log"></div><div id="prompt-textarea" contenteditable="true" style="min-height:40px;white-space:pre-wrap"></div>
      <button data-testid="send-button" onclick="go('click')">Send</button><script>window.sent=[];window.early=0;
      function go(h){const e=document.getElementById('prompt-textarea');const t=e.innerText;if(!t.trim())return;window.sent.push({h,t});e.innerHTML='';}
      document.getElementById('prompt-textarea').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();window.early++;go('enter');}else if(e.key==='Enter'&&e.shiftKey){e.preventDefault();document.execCommand('insertLineBreak');}});</script></body>`;
    const other = '<!doctype html><body><div id="prompt-textarea" contenteditable="true"></div></body>';
    const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(q.url.startsWith('/other') ? other : page); }).listen(0, '127.0.0.1');
    await new Promise(r => srv.on('listening', r));
    const port = srv.address().port;
    const free = () => new Promise(r => { const s = require('net').createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
    const cdp = await free(), erosPort = await free();
    // the OTHER host's tab first — "the first tab" would be the wrong one
    const br = cp.spawn(chrome, ['--headless=new', '--no-sandbox', `--remote-debugging-port=${cdp}`, `--user-data-dir=${path.join(TMP, 'chr')}`, `http://127.0.0.1:${port}/other`], { stdio: 'ignore' });   // headless takes one start URL
    await until(async () => { try { return (await fetch(`http://127.0.0.1:${cdp}/json/version`)).ok; } catch (_) { return false; } }, 10000);
    try { await fetch(`http://127.0.0.1:${cdp}/json/new?${encodeURIComponent(`http://localhost:${port}/c/abc`)}`, { method: 'PUT' }); } catch (_) {}
    await wait(1200);
    const sup = new ErosSupervisor({ port: erosPort, cdpPort: cdp, dataDir: path.join(TMP, 'eros'), log: () => {} });
    await sup.start();
    const health = () => new Promise(res => http.get({ host: '127.0.0.1', port: erosPort, path: '/api/health' }, s => { let d = ''; s.on('data', c => d += c); s.on('end', () => { try { res(JSON.parse(d)); } catch (_) { res({}); } }); }).on('error', () => res({})));
    await until(async () => (await health()).state === 'connected', 15000);
    const post = (p, body) => new Promise(res => { const q = http.request({ host: '127.0.0.1', port: erosPort, path: p, method: 'POST', headers: { 'content-type': 'application/json' } }, s => { let d = ''; s.on('data', c => d += c); s.on('end', () => { try { res({ status: s.statusCode, body: JSON.parse(d) }); } catch (_) { res({ status: s.statusCode, body: d }); } }); }); q.end(JSON.stringify(body)); });
    const text = 'First line of the question.\nSecond line names src/app.js and `retry()`.\n\nThird paragraph, typed in bursts after the keystroke budget.';
    const t0 = Date.now();
    const r = await post('/api/human-type', { host: 'localhost', chatUrl: `http://localhost:${port}/c/abc`, text, inputSelectors: ['#prompt-textarea'], sendSelectors: ['button[data-testid="send-button"]'], profile: 'turbo', maxKeystrokes: 50 });
    check('real: ErosmancerOS typed into the provider host\'s tab (not the first tab) and pressed send', r.body && r.body.ok && r.body.sent && /localhost/.test(r.body.url), JSON.stringify(r.body) + (r.body && r.body.ok ? '' : ` · supervisor: ${sup.status().lastError || sup.status().state}`));
    const ev = await post('/api/evaluate', { tabId: r.body && r.body.tabId, expression: 'JSON.stringify({sent:window.sent,early:window.early})' });
    const got = JSON.parse((ev.body && ev.body.result) || '{}');
    check('real: the message arrived whole — every line, via the send button, and no Enter sent it early', got.sent && got.sent.length === 1 && got.sent[0].h === 'click' && got.sent[0].t.replace(/\s+/g, ' ').trim() === text.replace(/\s+/g, ' ').trim() && got.early === 0, JSON.stringify(got));
    check('real: typed with human pacing (not instant)', Date.now() - t0 > 700);
    const miss = await post('/api/human-type', { host: 'localhost', text: 'hello', inputSelectors: ['#no-such-composer'], sendSelectors: [] });
    check('real: no composer → refused at "input" with the selectors it tried, nothing typed', miss.status === 422 && miss.body.stage === 'input' && /no-such-composer/.test(miss.body.error));
    sup.stop(); try { br.kill('SIGKILL'); } catch (_) {} srv.close();
    await wait(800);
  }

  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\n  ${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped (reasons above)` : ''}\n`);
  process.exitCode = fail === 0 ? 0 : 1;
  setTimeout(() => process.exit(process.exitCode), 200);
}
main().catch(e => { console.log('  ! crashed:', e.stack); process.exit(1); });
