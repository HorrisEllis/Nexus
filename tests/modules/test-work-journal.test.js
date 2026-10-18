'use strict';
/**
 * tests/modules/test-work-journal.test.js — TL1b (0.60.143): an agent's reply kept on disk as it streams.
 * Map: docs/2026-10-16-durable-work-timeline-phasemap.spec addendum (d).
 * James, 2026-10-18: "We need persistent data look at the last commit."
 *
 *   WJ-01  lib/work-journal.js: thinking before the reply, the reply as it grows (a restated reply replaces, a repeated tail
 *          is dropped, Ollama's deltas append), a dom pulse writes nothing new; on disk as a .response node and a timeline;
 *          after a restart (cache dropped) the reply and thinking come back byte-identical; a late chunk never reopens an
 *          ended job; a job with no frame for 15 min reads stale
 *   WJ-02  through idearium's real router: Ollama frames (POST agent/stream) land in the journal; GET agent/feed lists the
 *          newest, ?job= gives one with its timeline, an unknown job 404s; guardian's feed door journals too; the command
 *   WJ-04  per gate (0.60.144 TL1c — James: "You got it persistent per gate"): a phase build's task carries its contract gate
 *          (<map>::<phase>::<gate>); every frame of its reply is filed under that gate, through the real router; two attempts
 *          at one gate come back in order, after a restart; a phase prefix finds every gate of it; a chat stays ungated, said
 *   WJ-05  one record (0.60.146 — James: "okay only one record. maybe use it as a contract ledger for each contract."): a gate's
 *          jobs are in its contract's ledger; a browser agent's reply linked to its Clear Glass chat ledger turn is never copied and
 *          is read back from there after a restart; a turn the chat ledger lacks is written once; a job whose gate becomes known
 *          moves into its contract's ledger; a 0.60.143 job folder is still read; guardian's /events and ncp-handler pass the
 *          thinking, chatId and turn on (the thinking had been dropped at /events since 0.60.142)
 *   WJ-03  Clear Glass: a page opened after the reply was written shows it again ("restored from disk"), its thinking too;
 *          a live frame after that wins
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '../..');
const UI = path.join(ROOT, 'idearium/ui');
process.env.NEXUS_VERSIONIUM_URL = 'http://127.0.0.1:9';

let passed = 0, failed = 0, skipped = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn, er = console.error; console.log = () => {}; console.warn = () => {}; console.error = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; console.error = er; } };
function done() { console.log(`\n  ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`); process.exit(failed ? 1 : 0); }

(async () => {
  process.env.WORK_JOURNAL_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'wj-'));
  process.env.CG_LEDGER_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'wj-cg-'));   // Clear Glass's chat ledger, sandboxed
  process.env.WORK_JOURNAL_VERIFY_MS = '120';
  const WJ = require(path.join(ROOT, 'lib/work-journal.js'));

  await test('WJ-01', 'thinking, then the reply as it grows; on disk; back after a restart; ended stays ended; stale said', () => {
    const f = { repoUuid: 'r1', jobId: 'g-1', provider: 'gemini', source: 'transcript' };
    WJ.record({ ...f, event: 'dispatched' });
    WJ.record({ ...f, event: 'chunk', text: '', thinking: 'Reading the phase.', thinkingLen: 18, generating: true });
    let v = WJ.record({ ...f, event: 'chunk', text: 'Here it is', fullLen: 10, thinking: 'Reading the phase. Done.', generating: true });
    assert.deepStrictEqual([v.status, v.text, v.thinking], ['responding', 'Here it is', 'Reading the phase. Done.']);
    v = WJ.record({ ...f, event: 'chunk', text: 'Here it is:\nconst a = 1;' });   // restates and continues
    assert.strictEqual(v.text, 'Here it is:\nconst a = 1;');
    v = WJ.record({ ...f, event: 'chunk', text: 'const a = 1;' });                // a repeat of the tail
    assert.strictEqual(v.text, 'Here it is:\nconst a = 1;');
    // §0.60.146 — one append-only ledger: a job with no gate is in the repo's agent ledger
    const lf = path.join(WJ.dir(), 'r1', 'agent.ledger.jsonl');
    const n0 = fs.readFileSync(lf, 'utf8').split('\n').filter(Boolean).length;
    WJ.record({ ...f, event: 'progress', stage: 'dom', mutations: 40 });
    assert.strictEqual(fs.readFileSync(lf, 'utf8').split('\n').filter(Boolean).length, n0, 'a dom pulse writes nothing new');
    WJ.record({ ...f, event: 'gate', label: 'reply read', state: 'passed' });
    WJ.record({ ...f, event: 'complete', chars: 24 });
    WJ.record({ ...f, event: 'chunk', text: 'late' });
    const lines = fs.readFileSync(lf, 'utf8').trim().split('\n').map(JSON.parse);
    assert.deepStrictEqual(lines.filter(l => l.t === 'frame').map(l => l.event), ['dispatched', 'chunk', 'chunk', 'chunk', 'chunk', 'gate', 'complete', 'chunk'], 'one frame per event, no dom pulse');
    assert.ok(!lines.some(l => l.t === 'frame' && 'text' in l), 'no text in a frame');
    assert.ok(lines.some(l => l.t === 'text' && l.add === ':\nconst a = 1;' && l.at === 10), 'the reply as deltas (no chat ledger holds it: this tab is not linked)');
    WJ._reset();   // a restart: nothing in memory
    const back = WJ.get('r1', 'g-1', { timeline: true });
    assert.strictEqual(back.status, 'complete', 'a late chunk never reopens an ended job');
    assert.strictEqual(back.text, 'Here it is:\nconst a = 1;', 'byte-identical, and a late frame is kept off the reply');
    assert.strictEqual(back.thinking, 'Reading the phase. Done.');
    assert.strictEqual(back.timeline.length, 8);
    // Ollama: exact deltas, appended
    WJ.record({ repoUuid: 'r1', jobId: 'o-1', source: 'ollama', event: 'chunk', text: 'mv docs/', fullLen: 8 });
    assert.strictEqual(WJ.record({ repoUuid: 'r1', jobId: 'o-1', source: 'ollama', event: 'chunk', text: '/', fullLen: 9 }).text, 'mv docs//');
    // stale: open, nothing for 15 minutes
    const o = WJ.get('r1', 'o-1');
    assert.strictEqual(WJ.view({ ...o }, o.updatedAt + 16 * 60 * 1000).status, 'stale');
    assert.deepStrictEqual(WJ.list('r1').jobs.map(j => j.jobId), ['o-1', 'g-1'], 'newest first');
    assert.strictEqual(WJ.record({ event: 'chunk', text: 'x' }), null, 'no repo or job: nothing');
  });

  let listed = null, one = null, RU = null, RAPI = null, gated = null;
  await test('WJ-02', 'the real router: Ollama frames journaled; GET agent/feed lists and reads one; guardian\'s door; the command', async () => {
    const api = await quiet(() => import(path.join(ROOT, 'idearium/api/index.js')));
    const L = api.getRepoLayer();
    let made = null;
    for (let i = 0; i < 20; i++) {
      made = await quiet(async () => L.ingest({ name: `wj-${Date.now()}`, source: 'test', compartmentId: 'c-wj', files: [{ path: 'lib/a.js', content: 'module.exports = 1;\n' }] }));
      if (!(made && made.error && /no spec-engine/.test(made.error))) break;
      await new Promise(x => setTimeout(x, 250));
    }
    assert.ok(made && made.repo, JSON.stringify(made).slice(0, 200));
    const u = made.repo.uuid;
    for (const b of [{ event: 'dispatched', jobId: 'oj-1', model: 'q:7b' }, { event: 'chunk', jobId: 'oj-1', model: 'q:7b', text: 'function census', fullLen: 15, generating: true }, { event: 'chunk', jobId: 'oj-1', model: 'q:7b', text: '() {}', fullLen: 20 }]) {
      const r = await quiet(() => api._route('POST', `/api/repos/${u}/agent/stream`, b));
      assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    }
    const l = await quiet(() => api._route('GET', `/api/repos/${u}/agent/feed?limit=5`));
    assert.strictEqual(l.status, 200, JSON.stringify(l.json).slice(0, 200));
    assert.deepStrictEqual(l.json.jobs.map(j => [j.jobId, j.text, j.provider]), [['oj-1', 'function census() {}', 'ollama · q:7b']]);
    const g = await quiet(() => api._route('GET', `/api/repos/${u}/agent/feed?job=oj-1`));
    assert.strictEqual(g.status, 200); assert.strictEqual(g.json.job.timeline.length, 3);
    assert.strictEqual((await quiet(() => api._route('GET', `/api/repos/${u}/agent/feed?job=nope`))).status, 404);
    listed = l.json; one = g.json;
    const src = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    assert.ok(/task = _repoActivity\(\)\.feed\(fp\);[^\n]*\n\s*_journal\(fp, task\);/.test(src), 'guardian\'s feed door (lib/guardian-stream.cjs onFeed) journals each frame, with its task');
    RU = u; RAPI = api;
    const RC = await import(pathToFileURL(path.join(ROOT, 'idearium/cli/route-commands.js')).href);
    const row = RC.SPEC.find(r => r.key === 'repo.feed');
    assert.strictEqual(row.req({ repo: { uuid: 'u' }, args: ['oj-1'], flags: {} }).path, '/api/repos/u/agent/feed?job=oj-1');
    assert.strictEqual(RC.SPEC.filter(r => r.key === 'repo.feed').length, 1, 'one row');
  });

  await test('WJ-04', 'per gate: each attempt\'s reply filed under its contract gate, in order, after a restart; a chat stays ungated', async () => {
    assert.ok(RU, 'WJ-02 made the repo');
    const RAct = require(path.join(ROOT, 'lib/repo-activity.js'));
    const brick = 'docs/m-phasemap.spec::P1_census::b1.census.js';
    const attempt = async (n, session, text, ok) => {
      const t = RAct.begin({ repoUuid: RU, session, message: `Build phase P1_census (try ${n})`, provider: 'ollama', brick });
      for (const b of [{ event: 'dispatched', jobId: `gj-${n}`, session }, { event: 'chunk', jobId: `gj-${n}`, session, text, fullLen: text.length }, { event: ok ? 'complete' : 'error', jobId: `gj-${n}`, session }]) {
        const r = await quiet(() => RAPI._route('POST', `/api/repos/${RU}/agent/stream`, b)); assert.strictEqual(r.status, 200);
      }
      RAct.end(t, { ok, text });
    };
    await attempt(1, 'phrun-wj1-aa11-c1', 'const census = (', false);
    await attempt(2, 'phrun-wj1-aa11-c1-r1t2', 'const census = () => 1;', true);
    WJ._reset();   // a restart
    const g = await quiet(() => RAPI._route('GET', `/api/repos/${RU}/agent/feed?gate=${encodeURIComponent(brick)}`));
    assert.strictEqual(g.status, 200, JSON.stringify(g.json).slice(0, 200));
    assert.strictEqual(g.json.gates.length, 1);
    const gt = g.json.gates[0];
    assert.strictEqual(gt.brick, brick);
    assert.deepStrictEqual(gt.attempts.map(a => [a.attempt, a.jobId, a.status, a.runId]), [[1, 'gj-1', 'error', 'phrun-wj1-aa11'], [2, 'gj-2', 'complete', 'phrun-wj1-aa11']]);
    assert.strictEqual(WJ.get(RU, 'gj-1').text, 'const census = (', 'the failed attempt\'s reply is kept too');
    // §0.60.145 TL2a — one gate's route also says what its next attempt is told, and what it would reuse
    assert.match(g.json.note, /THIS GATE BEFORE[\s\S]*2 attempt\(s\)/);
    assert.strictEqual(g.json.reusable, null, 'these replies are Ollama\'s: not in the Responses index, so never reused (said in the map)');
    const ph = await quiet(() => RAPI._route('GET', `/api/repos/${RU}/agent/feed?gate=${encodeURIComponent('docs/m-phasemap.spec::P1_census')}`));
    assert.strictEqual(ph.json.gates.length, 1, 'a phase prefix finds its gates');
    // §0.60.146 — the contract's own ledger through the route
    const cl = await quiet(() => RAPI._route('GET', `/api/repos/${RU}/agent/feed?contract=${encodeURIComponent('docs/m-phasemap.spec::P1_census')}`));
    assert.strictEqual(cl.status, 200, JSON.stringify(cl.json).slice(0, 200));
    assert.deepStrictEqual(cl.json.ledger.jobs.map(j => j.jobId), ['gj-1', 'gj-2']);
    assert.strictEqual((await quiet(() => RAPI._route('GET', `/api/repos/${RU}/agent/feed?contract=nope::P`))).status, 404);
    assert.ok(g.json.ungated >= 1, 'the chat job (oj-1) has no gate, and is counted apart');
    assert.deepStrictEqual(WJ.list(RU, { brick }).jobs.map(j => j.jobId), ['gj-2', 'gj-1'], 'list by gate, newest first');
    // two gates at once, guardian frames (a job, no session): each job stays with the task that took it
    const tA = RAct.begin({ repoUuid: RU, session: 'phrun-wj2-bb22-c1', message: 'gate A', brick: 'm::P2::b1.a.js' });
    assert.strictEqual(RAct.feed({ repoUuid: RU, event: 'dispatched', jobId: 'gA' }).id, tA.id);
    const tB = RAct.begin({ repoUuid: RU, session: 'phrun-wj2-bb22-c2', message: 'gate B', brick: 'm::P2::b2.b.js' });
    assert.strictEqual(RAct.feed({ repoUuid: RU, event: 'dispatched', jobId: 'gB' }).id, tB.id, 'a new job goes to the task with none');
    assert.strictEqual(RAct.feed({ repoUuid: RU, event: 'chunk', jobId: 'gA', text: 'a' }).brick, 'm::P2::b1.a.js', 'a later frame of job A is still gate A');
    RAct.end(tA, { ok: true }); RAct.end(tB, { ok: true });
    gated = { job: { ...WJ.get(RU, 'gj-2', { timeline: true }), thinking: 'The census needs a command row.', thinkingLen: 31 }, gates: g.json };
    const RC = await import(pathToFileURL(path.join(ROOT, 'idearium/cli/route-commands.js')).href);
    assert.strictEqual(RC.SPEC.find(r => r.key === 'repo.feed').req({ repo: { uuid: 'u' }, args: [], flags: { gate: brick } }).path, `/api/repos/u/agent/feed?gate=${encodeURIComponent(brick)}`);
  });

  await test('WJ-05', 'one record: the contract ledger, the chat ledger as the text\'s home, moves, old folders, guardian passes it on', async () => {
    const CL = require(path.join(ROOT, 'clear-glass/src/downloads/chat-ledger.js'));
    // Clear Glass's own route, served from its real chat ledger (clear-glass/src/ipc/bridge.js GET /cli/downloads/ledgers/:chatKey):
    // the journal reads another system's ledger through its route only (the drawbridge)
    const http = require('http');
    const cg = http.createServer((req, res) => {
      const m = req.url.match(/^\/cli\/downloads\/ledgers\/([^?]+)/);
      const c = m ? CL.readChat({ chatKey: decodeURIComponent(m[1]) }) : null;
      res.writeHead(c ? 200 : 404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(c ? { ok: true, chat: c } : { ok: false }));
    });
    await new Promise(r => cg.listen(0, '127.0.0.1', r));
    process.env.CLEAR_GLASS_URL = `http://127.0.0.1:${cg.address().port}`;
    const repo = 'r5', brick = 'docs/x-phasemap.spec::P5_one::b1.one.js';
    CL.applyDelta({ provider: 'gemini', chatId: 'c5', agentId: `repo-${repo}`, seq: 1, generating: true, turns: [{ i: 0, role: 'user', text: 'Build phase P5_one' }, { i: 1, role: 'assistant', text: 'Here', thinking: 'Reading' }] });
    const base = { repoUuid: repo, jobId: 'k-1', provider: 'gemini', source: 'transcript', brick, chatId: 'c5', turn: 1 };
    WJ.record({ ...base, event: 'dispatched' });
    WJ.record({ ...base, event: 'chunk', text: 'Here', fullLen: 4, thinking: 'Reading' });
    CL.applyDelta({ provider: 'gemini', chatId: 'c5', seq: 2, generating: false, settled: true, turns: [{ i: 1, role: 'assistant', text: 'Here it is: one()', thinking: 'Reading the phase' }] });
    WJ.record({ ...base, event: 'chunk', text: 'Here it is: one()', fullLen: 17, thinking: 'Reading the phase' });
    WJ.record({ ...base, event: 'complete' });
    const cf = fs.readdirSync(path.join(WJ.dir(), repo)).find(n => n.endsWith('.ledger.jsonl') && n.includes('P5_one'));
    assert.ok(cf, 'one ledger for the contract');
    const ls = fs.readFileSync(path.join(WJ.dir(), repo, cf), 'utf8').trim().split('\n').map(JSON.parse);
    assert.ok(ls.some(l => l.t === 'link' && l.chatKey === 'gemini:c5' && l.turn === 1), 'linked to its chat ledger turn');
    assert.ok(!ls.some(l => l.t === 'text' || l.t === 'think'), 'no copy of the reply or the thinking: the chat ledger holds them');
    await new Promise(x => setTimeout(x, 300));
    assert.ok(!fs.readFileSync(path.join(WJ.dir(), repo, cf), 'utf8').includes('"t":"text"'), 'the turn was there: nothing written after the check');
    WJ._reset();   // a restart
    const kept = WJ.get(repo, 'k-1');
    assert.deepStrictEqual([kept.text, kept.textFrom], ['', 'chat-ledger (not read)'], 'this ledger holds no copy');
    const back = await WJ.read(repo, 'k-1');
    assert.deepStrictEqual([back.status, back.text, back.thinking, back.textFrom], ['complete', 'Here it is: one()', 'Reading the phase', 'chat-ledger']);
    const src0 = fs.readFileSync(path.join(ROOT, 'lib/work-journal.js'), 'utf8');
    assert.ok(!/require\([^)]*clear-glass/.test(src0), 'no require of Clear Glass\'s code: its route only');
    // a turn the chat ledger does not have (a tab outside Clear Glass): written once, here
    WJ.record({ ...base, jobId: 'k-2', turn: 3, event: 'chunk', text: 'outside reply', fullLen: 13 });
    WJ.record({ ...base, jobId: 'k-2', turn: 3, event: 'complete' });
    await new Promise(x => setTimeout(x, 400));
    const t2 = fs.readFileSync(path.join(WJ.dir(), repo, cf), 'utf8').trim().split('\n').map(JSON.parse).filter(l => l.t === 'text' && l.jobId === 'k-2');
    assert.strictEqual(t2.length, 1); assert.strictEqual(t2[0].set, 'outside reply'); assert.match(t2[0].why, /does not hold this turn/);
    WJ._reset();
    assert.strictEqual((await WJ.read(repo, 'k-2')).text, 'outside reply');
    // Clear Glass not reachable: said, never filled
    process.env.CLEAR_GLASS_URL = 'http://127.0.0.1:9'; WJ._reset();
    const down = await WJ.read(repo, 'k-1');
    assert.deepStrictEqual([down.text, down.textFrom], ['', 'chat-ledger (Clear Glass not reachable)']);
    process.env.CLEAR_GLASS_URL = `http://127.0.0.1:${cg.address().port}`;
    // a job whose gate becomes known moves into its contract's ledger
    WJ.record({ repoUuid: repo, jobId: 'k-3', source: 'ollama', provider: 'ollama', event: 'chunk', text: 'abc', fullLen: 3 });
    WJ.record({ repoUuid: repo, jobId: 'k-3', source: 'ollama', provider: 'ollama', event: 'chunk', text: 'def', fullLen: 6, brick });
    const agentL = fs.readFileSync(path.join(WJ.dir(), repo, 'agent.ledger.jsonl'), 'utf8');
    assert.ok(/"t":"moved","ts":\d+,"jobId":"k-3"/.test(agentL), 'the agent ledger says where it went');
    WJ._reset();
    const k3 = WJ.get(repo, 'k-3', { timeline: true });
    assert.deepStrictEqual([k3.text, k3.brick, k3.timeline.length], ['abcdef', brick, 2]);
    const led = WJ.ledger(repo, brick);
    assert.deepStrictEqual(led.jobs.map(j => j.jobId), ['k-1', 'k-2', 'k-3'], 'the contract\'s ledger, replayed: its jobs in order');
    assert.strictEqual(WJ.gates(repo, { brick }).gates[0].attempts.length, 3);
    // a job folder written by 0.60.143 is still read (§0.3)
    const nx = require(path.join(ROOT, 'lib/node-export.js'));
    const old = path.join(WJ.dir(), repo, 'old-1'); fs.mkdirSync(old, { recursive: true });
    fs.writeFileSync(path.join(old, 'reply.response'), nx.toYaml(nx.wrap('response', 'old-1', { jobId: 'old-1', repoUuid: repo, status: 'complete', text: 'kept from before', textLen: 16, startedAt: 1, updatedAt: 1 })));
    WJ._reset();
    assert.strictEqual(WJ.get(repo, 'old-1').text, 'kept from before');
    assert.ok(WJ.list(repo, { limit: 50 }).jobs.some(j => j.jobId === 'old-1'));
    // guardian passes the thinking, the chat id and the turn on (/events dropped the thinking since 0.60.142)
    const src = fs.readFileSync(path.join(ROOT, 'guardian/server.js'), 'utf8');
    const fa = src.indexOf('const _FEED_KEYS'), fb = src.indexOf('class SISOStream');
    const ctx = { jobs: { get: () => ({ agentId: 'repo-r5' }) } }; require('vm').createContext(ctx);
    require('vm').runInContext(`${src.slice(fa, fb)}\nthis._feedFrame = _feedFrame;`, ctx);
    const fr = ctx._feedFrame({ seq: 1 }, 'guardian.job.chunk', { jobId: 'k-9', text: '', thinking: 'thinking…', thinkingLen: 9, chatId: 'c5', turn: 1, chatUrl: 'https://gemini.google.com/app/c5' });
    assert.deepStrictEqual([fr.data.thinking, fr.data.thinkingLen, fr.data.chatId, fr.data.turn, fr.data.agentId], ['thinking…', 9, 'c5', 1, 'repo-r5']);
    const { createNCPMessageHandler } = require(path.join(ROOT, 'guardian/lib/ncp-handler.js'));
    const { EventEmitter } = require('events'); const bus = new EventEmitter(); const jobs = new Map([['k-9', { id: 'k-9', provider: 'gemini', status: 'delivered' }]]);
    const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {};
    try {
      const h = createNCPMessageHandler({ nc: null, ncp: { updateClient() {}, push() {}, pushTab() { return true; }, handleHeartbeat() {} }, bus, jaa: { insert() {}, query: () => [] }, jobs,
        updateJob: (id, p) => Object.assign(jobs.get(id), p), cockpitBroadcast() {}, physQueue: { logConversation() {} }, baseline: { observe() {} }, evLedger: null, activeQueues: new Map(),
        extractCodeBlocks: () => [], extractToolCallsFromDOM: () => [], findActiveSeamCompartment: () => null });
      const seen = []; bus.on('guardian.job.chunk', d => seen.push(d));
      h({ type: 'GUARDIAN_CHUNK', jobId: 'k-9', text: 'Hi', full: 'Hi', chatId: 'c5', turn: 1, chatUrl: 'u', source: 'transcript' });
      assert.deepStrictEqual([seen[0].chatId, seen[0].turn], ['c5', 1]);
    } finally { console.log = l; console.warn = w; }
    cg.close();
    for (const f of ['chatgpt', 'claude', 'deepseek', 'gemini', 'perplexity']) assert.ok(/chatId: \(chat && chat\.chatId\) \|\| null, turn: _txLastTurn/.test(fs.readFileSync(path.join(ROOT, `guardian/userscript-${f}.js`), 'utf8')), `${f} sends its chat id and turn`);
  });

  // ── WJ-03 the page, in Clear Glass ──
  const APP = fs.readFileSync(path.join(UI, 'js', 'app.js'), 'utf8');
  const fa = APP.indexOf('const AGENT_FEED = new Map();'), fb = APP.indexOf('function _agentTranscript(uuid) {');
  const css = fs.readFileSync(path.join(UI, 'css', 'code-surface.css'), 'utf8');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wj-ui-'));
  const job = gated ? gated.job : { ...(one && one.job), thinking: 'The census needs a command row.', thinkingLen: 31 };
  const top = { jobs: [job] }, GATES = gated ? gated.gates : { gates: [] };
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
<div class="cs-live" data-al="r1"></div>
<script>
  let CURRENT_API_REPO = { uuid: 'r1' };
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  const LISTED = ${JSON.stringify(top)}, ONE = ${JSON.stringify({ job })}, GATES = ${JSON.stringify(GATES)};
  async function api(p) { return p.includes('gate=') ? GATES : p.includes('job=') ? ONE : LISTED; }
  ${APP.slice(fa, fb)}
</script></body></html>`);
  const glass = require('../../clear-glass/src/driver/glass.js');
  const eng = glass.engine();
  if (!eng) { console.log('  - WJ-03 SKIPPED: Clear Glass has no engine here (no Electron binary, no Chromium) — the browser check did not run'); skipped++; return done(); }
  let browser;
  try { browser = await glass.chromium.launch(); }
  catch (e) { console.log(`  - WJ-03 SKIPPED: Clear Glass's engine (${eng.kind}) could not start (${e.message.split('\n')[0]})`); skipped++; return done(); }
  console.log(`  · driven by Clear Glass (clear-glass/src/driver/glass.js), engine: ${eng.kind}`);
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(path.join(dir, 'index.html')).href);
    await test('WJ-03', 'Clear Glass: a page opened after the reply shows it again, restored from disk, with its gate and attempt; a live frame then wins', async () => {
      await page.evaluate(() => agentLivePaint('r1'));
      await page.waitForSelector('.cs-live [data-restored]');
      const t = await page.textContent('.cs-live');
      assert.match(t, /restored from disk · complete/);
      assert.match(t, /const census = \(\) => 1;/, 'the reply');
      assert.match(t, /gate P1_census · b1\.census\.js · attempt 2 of 2/, 'its gate, and which attempt');
      assert.match(t, /its thinking · 31ch/, 'its thinking, folded');
      await page.evaluate(() => _agentFeedIn({ repoUuid: 'r1', event: 'chunk', jobId: 'oj-2', source: 'ollama', provider: 'ollama', text: 'NEW', fullLen: 3, generating: true }));
      const t2 = await page.textContent('.cs-live');
      assert.ok(/NEW/.test(t2) && !/restored from disk/.test(t2), 'the live job replaces the restored one');
      assert.deepStrictEqual(errors, []);
    });
  } finally { await browser.close(); }
  done();
})();
