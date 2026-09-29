'use strict';
/**
 * tests/modules/test-agent-feed.test.js — v0.39.244
 * James, with a screenshot: the Agent tab's "hello" → "agent — failed · guardian
 * unavailable or returned no real response", at once. And: "the cli in the agents tab
 * needs to have a live feed of the dom mutation/node anchor".
 *
 * Part 1 — the instant failure. A repo job (agentId set) goes to that repo's OWN tab,
 * which guardian's dispatcher opens itself; copilot and guardian both refused it first
 * because the SHARED provider tab wasn't connected, and copilot threw the reason away.
 * Part 2 — the feed. userscript (anchor, mutations) → guardian /events (payload + agentId)
 * → idearium guardian-stream onFeed → the Agent tab's feed state.
 * Real modules; stub HTTP servers stand in for the processes at the other end.
 */
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..');
require(path.join(ROOT, 'lib', 'test-sandbox.js')).ensure();

let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${e.stack.split('\n').slice(0, 2).join('\n    ')}`); failed++; } }
const listen = (handler) => new Promise(r => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => r(s)); });
const until = async (fn, ms = 3000) => { const t = Date.now() + ms; while (!fn()) { if (Date.now() > t) throw new Error('timed out'); await new Promise(r => setTimeout(r, 10)); } };

(async () => {
  // A stub guardian: /providers says chatgpt is NOT connected; /api/copilot/prompt records what arrives.
  const seen = { providers: 0, prompts: [] };
  let promptReply = { ok: true, text: 'answered from the repo tab', jobId: 'job-1' };
  const gd = await listen((req, res) => {
    let b = ''; req.on('data', c => (b += c)); req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/providers') { seen.providers++; return res.end(JSON.stringify({ providers: { chatgpt: 'null' } })); }
      if (req.url === '/api/copilot/prompt') { seen.prompts.push(JSON.parse(b || '{}')); return res.end(JSON.stringify(promptReply)); }
      res.statusCode = 404; res.end('{}');
    });
  });
  process.env.GUARDIAN_URL = `http://127.0.0.1:${gd.address().port}`;
  const lifeline = require(path.join(ROOT, 'copilot/lifeline.js'));

  console.log('\n⬡  THE INSTANT FAILURE\n');
  await test('AF-01', 'a repo job (agentId) is NOT refused because the shared tab is down — it reaches guardian', async () => {
    const r = await lifeline.dispatchToNcpAgent('hello', { provider: 'chatgpt', agentId: 'repo-x', tools: [] });
    assert.strictEqual(seen.providers, 0, 'the shared-tab pre-check ran for an agentId job');
    assert.strictEqual(seen.prompts.length, 1); assert.strictEqual(seen.prompts[0].agentId, 'repo-x');
    assert.strictEqual(r.ok, true); assert.strictEqual(r.text, 'answered from the repo tab');
  });
  await test('AF-02', 'without agentId the pre-check still refuses — and now SAYS why (was a bare null → generic text)', async () => {
    const r = await lifeline.dispatchToNcpAgent('hello', { provider: 'chatgpt', tools: [] });
    assert.strictEqual(seen.prompts.length, 1, 'dispatched despite real evidence of not-connected');
    assert.strictEqual(r.ok, false); assert.ok(/no chatgpt tab connected/.test(r.error), r.error);
  });
  await test('AF-03', 'guardian’s own failure reason and jobId travel up instead of being dropped', async () => {
    promptReply = { ok: false, error: 'repo-x’s own tab is not coming (not connected within 60000ms)', jobId: 'job-2' };
    const r = await lifeline.dispatchToNcpAgent('hello', { provider: 'chatgpt', agentId: 'repo-x', tools: [] });
    assert.strictEqual(r.ok, false); assert.strictEqual(r.jobId, 'job-2'); assert.ok(/own tab is not coming/.test(r.error), r.error);
  });
  await test('AF-04', 'copilot’s 502 carries the jobId (so idearium knows a job exists and a late reply can come)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'copilot/server.js'), 'utf8');
    assert.ok(/json\(res, 502, \{ ok: false, error: result\?\.error \|\| `\$\{body\.backend\} unavailable or returned no real response`, jobId: result\?\.jobId \|\| null, requestId \}\)/.test(src));
  });
  await test('AF-05', 'guardian askSync: an agentId job is created even when the shared provider is not connected', async () => {
    const { askSync } = require(path.join(ROOT, 'guardian/ask.js'));
    const created = [];
    const deps = { createJob: (j) => { const job = { id: 'j-' + created.length, status: 'pending', ...j }; created.push(job); return job; },
      dispatchJob: () => {}, getJob: (id) => ({ ...created.find(c => c.id === id), status: 'complete', response: 'ok' }), isProviderConnected: () => false };
    const shared = await askSync('hi', { provider: 'chatgpt', timeoutMs: 500 }, deps);
    assert.strictEqual(shared.ok, false); assert.ok(/no provider connected/.test(shared.error)); assert.strictEqual(created.length, 0);
    await askSync('hi', { provider: 'chatgpt', agentId: 'repo-x', timeoutMs: 500 }, deps);
    assert.strictEqual(created.length, 1, 'the repo job was refused'); assert.strictEqual(created[0].agentId, 'repo-x');
  });
  gd.close();

  console.log('\n⬡  THE LIVE FEED\n');
  // guardian: _feedFrame, extracted verbatim from server.js and run against a jobs Map.
  const SRV = fs.readFileSync(path.join(ROOT, 'guardian/server.js'), 'utf8');
  const fa = SRV.indexOf('const _FEED_KEYS'), fb = SRV.indexOf('class SISOStream {');
  const gctx = { jobs: new Map([['job-9', { id: 'job-9', agentId: 'repo-abc' }]]) }; vm.createContext(gctx);
  vm.runInContext(SRV.slice(fa, fb) + '\nthis._feedFrame = _feedFrame;', gctx);
  await test('AF-06', 'guardian /events frames now carry a payload, with the job’s agentId looked up', () => {
    const f = gctx._feedFrame({ seq: 1, type: 'guardian.job.dispatched', ts: 5 }, 'guardian.job.dispatched', { jobId: 'job-9', provider: 'chatgpt' });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(f.data)), { jobId: 'job-9', provider: 'chatgpt', agentId: 'repo-abc' });
    assert.ok(SRV.includes('cockpitBroadcast(_feedFrame({ seq, type, ts, claimed }, type, data));'));
  });
  await test('AF-07', 'a chunk frame carries the delta, the running length and the anchor — never the whole reply again', () => {
    const full = 'x'.repeat(50000);
    const f = gctx._feedFrame({ type: 'guardian.job.chunk' }, 'guardian.job.chunk', { jobId: 'job-9', text: 'abc', full, anchor: { path: 'main > article' }, mutations: 7 });
    assert.strictEqual(f.data.text, 'abc'); assert.strictEqual(f.data.fullLen, 50000); assert.strictEqual(f.data.full, undefined);
    assert.strictEqual(f.data.anchor.path, 'main > article'); assert.strictEqual(f.data.mutations, 7);
  });
  await test('AF-08', 'non-job events are untouched (no payload leaks onto the whole bus)', () => {
    const f = gctx._feedFrame({ seq: 2, type: 'cfr.tick' }, 'cfr.tick', { secret: 1 });
    assert.strictEqual(f.data, undefined);
  });
  await test('AF-09', 'ncp-handler passes the page’s anchor/mutations/generating through progress and chunk', () => {
    const src = fs.readFileSync(path.join(ROOT, 'guardian/lib/ncp-handler.js'), 'utf8');
    // §0.39.282 — was one exact line; 0.39.280 added provider to the event and the pin broke. It now requires the
    // fields this test is about, on the progress emit that relays the page's message.
    const prog = (src.match(/bus\.emit\('guardian\.job\.progress', \{ jobId: msg\.jobId[^\n]*/) || [''])[0];
    for (const f of ['stage: msg.stage', 'how: msg.how', 'chatUrl: msg.chatUrl', 'anchor: msg.anchor || null', 'mutations: msg.mutations ?? null', 'generating: msg.generating ?? null']) assert.ok(prog.includes(f), `progress carries ${f}`);
    // 0.39.256 — the chunk also carries generating, reset and source (the 500 ms transcript streamer)
    assert.ok(/bus\.emit\('guardian\.job\.chunk', \{ jobId, text, full, provider, anchor: msg\.anchor \|\| null, mutations: msg\.mutations \?\? null, generating: msg\.generating \?\? null, reset: !!msg\.reset, source: msg\.source \|\| null \}\)/.test(src));
  });

  // idearium: guardian-stream against a stub guardian /events.
  let sseRes = null;
  const ev = await listen((req, res) => { if (req.url === '/events') { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); sseRes = res; } else { res.end('{"jobs":[]}'); } });
  process.env.GUARDIAN_PORT = String(ev.address().port);
  delete require.cache[require.resolve(path.join(ROOT, 'idearium/lib/guardian-stream.cjs'))];
  const GS = require(path.join(ROOT, 'idearium/lib/guardian-stream.cjs'));
  const fed = [];
  GS.connectGuardianStream({ listSpecs: () => [], getSpec: () => null }, { onFeed: (e) => fed.push(e) });
  await until(() => sseRes);
  const send = (o) => sseRes.write(`data: ${JSON.stringify(o)}\n\n`);
  send({ seq: 1, type: 'guardian.job.progress', ts: 1, data: { jobId: 'j', agentId: 'repo-abc', stage: 'dom', mutations: 12, anchor: { path: 'main > div' } } });
  send({ seq: 2, type: 'guardian.job.chunk', ts: 2, data: { jobId: 'j', agentId: 'someone-else', text: 'no' } });
  send({ seq: 3, type: 'cfr.tick', ts: 3 });
  send({ seq: 4, type: 'guardian.job.chunk', ts: 4, data: { jobId: 'j', agentId: 'repo-abc', text: 'Hel', fullLen: 3 } });
  await test('AF-10', 'idearium relays exactly the repo agents’ guardian.job.* frames (not other agents, not other events)', async () => {
    await until(() => fed.length >= 2);
    await new Promise(r => setTimeout(r, 50));
    assert.deepStrictEqual(fed.map(e => e.seq), [1, 4]);
  });
  await test('AF-11', 'idearium wires onFeed to os.broadcast (SSE only, not the ledger) as idearium.repo.agent.feed', () => {
    const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    assert.ok(/connectGuardianStream\(se, \{ onFeed: \(ev\) => os\.broadcast\('idearium\.repo\.agent\.feed'/.test(api));
    const core = fs.readFileSync(path.join(ROOT, 'idearium/index.js'), 'utf8');
    const b = core.slice(core.indexOf('  broadcast(type, payload = {}) {'), core.indexOf('  addSSEClient(res) {'));
    assert.ok(/this\._broadcast\(ev\)/.test(b) && !/_evLedger|this\.stream\.emit/.test(b));
  });
  ev.close(); try { sseRes.destroy(); } catch (_) {}

  // The Agent tab: its feed code, extracted verbatim from app.js.
  const APP = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/app.js'), 'utf8');
  const ua = APP.indexOf('const AGENT_FEED = new Map();'), ub = APP.indexOf('function _agentTranscript(uuid) {');
  let painted = 0;
  const uctx = { CURRENT_API_REPO: { uuid: 'abc' }, escapeHtml: (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
    document: { getElementById: () => ({ dataset: { repo: 'abc' }, set innerHTML(v) { painted++; this._h = v; }, get innerHTML() { return this._h; }, querySelector: () => null }) } };
  vm.createContext(uctx);
  vm.runInContext(APP.slice(ua, ub) + '\nthis._agentFeedIn = _agentFeedIn; this._agentFeedHtml = _agentFeedHtml; this.AGENT_FEED = AGENT_FEED;', uctx);
  await test('AF-12', 'the tab keeps the anchor and mutation count from dom pulses without a log row per pulse', () => {
    uctx._agentFeedIn({ repoUuid: 'abc', event: 'dispatched', jobId: 'job-1', provider: 'chatgpt' });
    for (let i = 1; i <= 5; i++) uctx._agentFeedIn({ repoUuid: 'abc', event: 'progress', stage: 'dom', jobId: 'job-1', mutations: i * 10, generating: true, anchor: { path: 'main > article:nth-of-type(4)', tag: 'article', attrs: { 'data-message-author-role': 'assistant' }, children: 3, textLen: 40 } });
    const st = uctx.AGENT_FEED.get('abc');
    assert.strictEqual(st.mutations, 50); assert.strictEqual(st.rows.length, 1, 'a dom pulse wrote a log row');
    const html = uctx._agentFeedHtml('abc');
    assert.ok(html.includes('main &gt; article:nth-of-type(4)') && html.includes('data-message-author-role=assistant') && html.includes('mutations 50') && html.includes('● generating'));
    assert.ok(painted >= 6, 'the feed was not painted in place');
  });
  await test('AF-13', 'chunks stream the reply text in; a new job starts clean', () => {
    uctx._agentFeedIn({ repoUuid: 'abc', event: 'chunk', jobId: 'job-1', text: 'Hello, ', fullLen: 7 });
    uctx._agentFeedIn({ repoUuid: 'abc', event: 'chunk', jobId: 'job-1', text: 'James.', fullLen: 13 });
    assert.strictEqual(uctx.AGENT_FEED.get('abc').text, 'Hello, James.');
    assert.ok(uctx._agentFeedHtml('abc').includes('reply 13ch'));
    uctx._agentFeedIn({ repoUuid: 'abc', event: 'queued', jobId: 'job-2', reason: 'awaiting_agent_tab' });
    const st = uctx.AGENT_FEED.get('abc'); assert.strictEqual(st.text, ''); assert.strictEqual(st.anchor, null); assert.strictEqual(st.jobId, 'job-2');
  });
  await test('AF-14', 'feed frames skip the global event log (they arrive several a second)', () => {
    assert.ok(/if \(ev && ev\.type === 'idearium\.repo\.agent\.feed'\) \{ _agentFeedIn\(ev\.payload \|\| \{\}\); return; \}/.test(APP));
  });

  // The userscripts: the anchor helper, run against a real DOM (jsdom), from each of the five.
  let JSDOM; try { ({ JSDOM } = require('jsdom')); } catch (_) {}
  for (const prov of ['chatgpt', 'claude', 'gemini', 'perplexity', 'deepseek']) {
    await test(`AF-15-${prov}`, `userscript-${prov}: _nexusAnchor describes the reply node; chunks, reply-started and a 1/s dom pulse carry it`, () => {
      const src = fs.readFileSync(path.join(ROOT, `guardian/userscript-${prov}.js`), 'utf8');
      assert.ok(/anchor:_nexusAnchor\(el\), mutations:_nexusMutations, ts:Date\.now\(\) \}\);/.test(src), 'chunk carries no anchor');
      assert.ok(/stage:'reply-started', how:`\$\{text\.length\}ch`, chatUrl:location\.href, anchor:_nexusAnchor\(el\)/.test(src));
      assert.ok(/_now - _nexusPulseAt >= 1000 && _nexusMutations !== _nexusPulseSeen/.test(src) && /stage:'dom'/.test(src));
      assert.ok(/_watchStart = Date\.now\(\); _nexusMutations = 0;/.test(src), 'mutation count not reset per job');
      if (!JSDOM) return;
      const a = src.indexOf('function _nexusAnchor(el) {'); let d = 0, i = src.indexOf('{', a);
      for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}' && --d === 0) break; }
      const dom = new JSDOM('<body><main id="m"><div class="thread x"><article class="turn"></article><article class="turn"><div data-message-author-role="assistant" data-message-id="msg-7" class="markdown prose">Hi <b>there</b></div></article></div></main></body>', { runScripts: 'outside-only' });
      dom.window.eval(src.slice(a, i + 1) + '; window._nexusAnchor = _nexusAnchor;');
      const r = dom.window._nexusAnchor(dom.window.document.querySelector('[data-message-id]'));
      assert.strictEqual(r.path, 'main#m > div.thread.x > article.turn:nth-of-type(2) > div.markdown.prose');
      assert.deepStrictEqual(JSON.parse(JSON.stringify(r.attrs)), { 'data-message-id': 'msg-7', 'data-message-author-role': 'assistant' });
      assert.strictEqual(r.children, 1); assert.strictEqual(dom.window._nexusAnchor(null), null);
    });
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
