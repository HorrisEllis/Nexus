'use strict';
/**
 * tests/modules/test-agent-live.test.js — 0.39.356 LS1–LS4 (docs/2026-10-05-cli-data-code-phasemap.spec)
 * James: "also the dom mutator/node anchor, or ollama or cpilot stream live into the worksurface panel and code tab."
 *   LS-01  the bridge: callOllamaRaw hands each streamed token to onDelta; a job keeps what is written so far (job.partial)
 *   LS-02  copilot: the poll (verbatim from copilot/server.js) sends each new part of job.partial, in order, then the end;
 *          the stream sink is loopback only; the repo agent sends streamUrl
 *   LS-03  idearium: POST …/agent/stream goes out as idearium.repo.agent.feed in the guardian feed's shape, SSE only
 *   LS-04  Clear Glass: the REAL code-surface.js and plan-panel.js with the Agent tab's feed code (verbatim from app.js):
 *          an Ollama model's text streams into the Code tab and the Plan's work surface; a guardian frame shows its
 *          node anchor and mutation count; a slot scrolled up stays put
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const http = require('http');
const path = require('path');
const vm = require('vm');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');
const UI = path.join(ROOT, 'idearium', 'ui');

let passed = 0, failed = 0, skipped = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };
function done() { console.log(`\n  agent-live: ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`); process.exit(failed ? 1 : 0); }

(async () => {
  // ── LS-01 the bridge ──
  const ol = http.createServer((q, s) => {
    let b = ''; q.on('data', d => b += d); q.on('end', async () => {
      s.writeHead(200, { 'content-type': 'application/x-ndjson' });
      for (const t of ['func', 'tion a', '() {}']) { s.write(JSON.stringify({ response: t, done: false }) + '\n'); await new Promise(r => setTimeout(r, 30)); }
      s.end(JSON.stringify({ response: '', done: true, done_reason: 'stop' }) + '\n');
    });
  });
  await new Promise(r => ol.listen(0, '127.0.0.1', r));
  process.env.OLLAMA_HOST = `http://127.0.0.1:${ol.address().port}`;

  await test('LS-01', 'the bridge: each streamed token reaches onDelta; a job keeps what is written so far', async () => {
    const OC = require(path.join(ROOT, 'ollama/lib/ollama-client.js'));
    const seen = [];
    const text = await quiet(() => OC.callOllamaRaw('m:3b', 'write a', 100, 5000, 'test', { onDelta: (d, k) => seen.push([d, k]) }));
    assert.strictEqual(text, 'function a() {}');
    assert.deepStrictEqual(seen, [['func', 'text'], ['tion a', 'text'], ['() {}', 'text']], 'token by token, as they came');
    const D = await quiet(() => require(path.join(ROOT, 'ollama/lib/dispatch.js')));
    const job = { uuid: 'j1' };
    D._grow(job, 'func', 'text'); assert.strictEqual(job.partial, 'func');
    D._grow(job, 'tion', 'text'); D._grow(job, 'hmm', 'thinking');
    assert.strictEqual(job.partial, 'function'); assert.strictEqual(job.partialThinking, 'hmm'); assert.ok(job.partialAt);
    const big = { uuid: 'j2' }; D._grow(big, 'x'.repeat(200005), 'text');
    assert.strictEqual(big.partial.length, 200000); assert.strictEqual(big.partialDropped, 5, 'capped, what was dropped counted');
    const src = fs.readFileSync(path.join(ROOT, 'ollama/lib/dispatch.js'), 'utf8');
    assert.match(src, /\{ onDelta: \(d, kind\) => _grow\(job, d, kind\) \}/, 'the bridge job is wired');
    assert.match(src, /job\.partial = ''; job\.partialThinking = '';/);
  });
  ol.close();

  // ── LS-02 copilot ──
  await test('LS-02', 'copilot: each new part of job.partial goes to the sink in order, then the end; loopback only; the repo agent sends streamUrl', async () => {
    const S = fs.readFileSync(path.join(ROOT, 'copilot/server.js'), 'utf8');
    const a = S.indexOf('// §0.39.356 LS2 — opts.onPartial'), b = S.indexOf('async function _streamOllamaJob(');
    assert.ok(a > 0 && b > a, 'the poll and the streaming poll, verbatim');
    const parts = ['def', 'def foo', 'def foo():', 'def foo():'];   // the third poll sees nothing new
    let n = 0;
    const ctx = { OL_URL: 'http://x', OLLAMA_JOB_MAX_WAIT_S: 5, setTimeout: (f) => setImmediate(f), console,
      _fetch: async () => { const i = Math.min(n++, parts.length); return i < parts.length ? { job: { status: 'running', model: 'q:7b', partial: parts[i] } } : { job: { status: 'complete', model: 'q:7b', result: 'def foo():', partial: 'def foo():' } }; } };
    vm.createContext(ctx);
    vm.runInContext(S.slice(a, b) + '\nthis._streamingPoll = _streamingPoll;', ctx);
    const got = [];
    const r = await ctx._streamingPoll((ev) => got.push(ev))({ jobId: 'job-9' });
    assert.strictEqual(r.text, 'def foo():');
    assert.deepStrictEqual(got.map(e => e.event), ['dispatched', 'chunk', 'chunk', 'chunk', 'complete']);
    assert.strictEqual(got.filter(e => e.event === 'chunk').map(e => e.text).join(''), 'def foo():', 'the deltas make the text, nothing twice');
    assert.deepStrictEqual(got.filter(e => e.event === 'chunk').map(e => e.fullLen), [3, 7, 10]);
    assert.strictEqual(got[4].generating, false); assert.strictEqual(got[4].model, 'q:7b'); assert.strictEqual(got[4].chars, 10);
    const TR = require(path.join(ROOT, 'copilot/tool-runtime.js'));
    assert.strictEqual(TR.streamSink('http://example.com/x'), null, 'not loopback: refused');
    assert.strictEqual(TR.streamSink('https://127.0.0.1/x'), null);
    const posted = [];
    TR.streamSink('http://127.0.0.1:4800/api/repos/r/agent/stream', { repoUuid: 'r' }, (u, d) => posted.push([u.pathname, JSON.parse(d)]))({ event: 'chunk', jobId: 'j', text: 'hi', fullLen: 2 });
    assert.strictEqual(posted[0][0], '/api/repos/r/agent/stream');
    assert.strictEqual(posted[0][1].repoUuid, 'r'); assert.strictEqual(posted[0][1].text, 'hi');
    assert.match(S, /pollJob: onStream \? _streamingPoll\(onStream\) : _pollOllamaJobHeadless/, 'the tool loop streams when the caller gave a sink');
    assert.match(S, /const onStream = body\.backend === 'guardian' \? null : toolRuntime\.streamSink\(T\.streamUrl/);
    assert.match(fs.readFileSync(path.join(ROOT, 'lib/repo-agent.js'), 'utf8'), /streamUrl: `\$\{_toolSink\}\/api\/repos\/\$\{encodeURIComponent\(repo\.uuid\)\}\/agent\/stream`/);
  });

  // ── LS-03 idearium ──
  process.env.COPILOT_URL = 'http://127.0.0.1:9';
  process.env.NEXUS_VERSIONIUM_URL = 'http://127.0.0.1:9';
  const api = await quiet(() => import(path.join(ROOT, 'idearium/api/index.js')));
  const { getIdeaOS } = await import(path.join(ROOT, 'idearium/core/index.js'));
  await test('LS-03', 'POST …/agent/stream goes out as idearium.repo.agent.feed in the guardian shape, SSE only', async () => {
    const L = api.getRepoLayer();
    let made = null;
    for (let i = 0; i < 20; i++) {
      made = await quiet(async () => L.ingest({ name: `ls-${Date.now()}`, source: 'test', compartmentId: 'c-ls', files: [{ path: 'src/a.js', content: 'module.exports = 1;\n' }] }));
      if (!(made && made.error && /no spec-engine/.test(made.error))) break;
      await new Promise(x => setTimeout(x, 250));
    }
    const u = made.repo.uuid;
    const frames = [];
    const res = { write: (d) => { for (const l of String(d).split('\n')) if (l.startsWith('data: ')) frames.push(JSON.parse(l.slice(6))); }, on: () => {} };
    getIdeaOS().addSSEClient(res);
    const r = await api._route('POST', `/api/repos/${u}/agent/stream`, { event: 'chunk', jobId: 'job-1', model: 'q:7b', text: 'function', fullLen: 8, generating: true, session: 's1' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const f = frames.find(x => x.type === 'idearium.repo.agent.feed');
    assert.ok(f, 'broadcast');
    assert.strictEqual(f.ephemeral, true, 'SSE only, not ledgered');
    assert.deepStrictEqual({ ...f.payload }, { repoUuid: u, event: 'chunk', jobId: 'job-1', source: 'ollama', provider: 'ollama · q:7b', model: 'q:7b', session: 's1', text: 'function', fullLen: 8, generating: true });
    assert.strictEqual((await api._route('POST', `/api/repos/${u}/agent/stream`, { event: 'nope', jobId: 'j' })).status, 400);
    assert.strictEqual((await api._route('POST', `/api/repos/${u}/agent/stream`, { event: 'chunk' })).status, 400, 'a job is required');
    assert.strictEqual((await api._route('POST', '/api/repos/nope-ls/agent/stream', { event: 'chunk', jobId: 'j' })).status, 404);
    const C = JSON.parse(fs.readFileSync(path.join(ROOT, 'idearium/interaction-contract.json'), 'utf8'));
    assert.ok(JSON.stringify(C).includes('"/api/repos/:uuid/agent/stream"'), 'in the contract');
  });

  // ── LS-04 the page, in Clear Glass ──
  const APP = fs.readFileSync(path.join(UI, 'js', 'app.js'), 'utf8');
  const fa = APP.indexOf('const AGENT_FEED = new Map();'), fb = APP.indexOf('function _agentTranscript(uuid) {');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ls-ui-'));
  const css = fs.readFileSync(path.join(UI, 'css', 'code-surface.css'), 'utf8') + fs.readFileSync(path.join(UI, 'css', 'work-surface.css'), 'utf8');
  const src = (f) => pathToFileURL(path.join(UI, 'js', f)).href;
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><style>${css}
#plan-panel{display:none}#plan-panel.open{display:block;position:fixed;right:0;top:0;width:520px;height:100%;overflow:auto}</style></head><body>
<button class="repo-subtab-btn">Code</button>
<div id="repo-subtab-code" style="height:700px"></div>
<script>
  const REPO = { uuid: 'r1', name: 'daw', files: [{ path: 'src/a.js' }] };
  let CURRENT_API_REPO = REPO, CURRENT_REPO_SUBTAB = 'code';
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  function toast() {} function renderApiRepoPanel() {}
  async function api(p) {
    if (p.endsWith('/plan')) return { summary: { total: 2, complete: 1, building: 1 }, steps: [{ key: 'BL8', map: 'docs/b.spec', title: 'BL8 docs consolidation', current: true, status: 'building', gates: [], ledger: [] }], maps: [] };
    if (p.endsWith('/phases/runs')) return { runs: [] };
    if (p.endsWith('/worksurface')) return { files: [], totals: { files: 0, added: 0, removed: 0, pending: 0 }, tools: { scope: 'harness', listed: [], calls: [] } };
    if (p.includes('/code/overview')) return { files: 1, chunks: 1, lines: 1, languages: ['js'], repo: { writeMode: 'propose', pendingProposals: 0 } };
    if (p.endsWith('/agent/route')) return { ok: true, route: [{ provider: 'ollama:q:7b', backend: 'ollama', model: 'q:7b' }], pinned: null };
    if (p.endsWith('/tool-events')) return { events: [] };
    return {};
  }
  ${APP.slice(fa, fb)}
</script>
<script src="${src('work-surface.js')}"></script>
<script src="${src('code-surface.js')}"></script>
<script src="${src('plan-panel.js')}"></script>
</body></html>`);
  const glass = require('../../clear-glass/src/driver/glass.js');
  const eng = glass.engine();
  if (!eng) { console.log('  - LS-04 SKIPPED: Clear Glass has no engine here (no Electron binary, no Chromium) — the browser checks did not run'); skipped++; return done(); }
  let browser;
  try { browser = await glass.chromium.launch(); }
  catch (e) { console.log(`  - LS-04 SKIPPED: Clear Glass's engine (${eng.kind}) could not start (${e.message.split('\n')[0]})`); skipped++; return done(); }
  console.log(`  · driven by Clear Glass (clear-glass/src/driver/glass.js), engine: ${eng.kind}`);
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(path.join(dir, 'index.html')).href);
    await page.evaluate(() => renderRepoCode(REPO));
    await page.waitForSelector('.cs-live[data-al="r1"] .al-head');
    await test('LS-04', 'Clear Glass: the model writing streams into the Code tab and the Plan\'s work surface; a guardian frame shows its anchor', async () => {
      assert.match(await page.textContent('.cs-live'), /the agent is not writing/, 'idle says so');
      await page.evaluate(() => { openPlanPanel(); });
      await page.waitForSelector('#plan-panel .pp-live[data-al="r1"]');
      // an Ollama turn, as copilot → idearium → SSE delivers it
      await page.evaluate(() => {
        _agentFeedIn({ repoUuid: 'r1', event: 'dispatched', jobId: 'job-1', source: 'ollama', provider: 'ollama', generating: true });
        _agentFeedIn({ repoUuid: 'r1', event: 'chunk', jobId: 'job-1', source: 'ollama', provider: 'ollama · q:7b', model: 'q:7b', text: 'mv docs/', fullLen: 8, generating: true });
        _agentFeedIn({ repoUuid: 'r1', event: 'chunk', jobId: 'job-1', source: 'ollama', provider: 'ollama · q:7b', model: 'q:7b', text: '/', fullLen: 9, generating: true });
      });
      for (const sel of ['.cs-live', '#plan-panel .pp-live']) {
        assert.strictEqual(await page.textContent(`${sel} .al-text`), 'mv docs//', `${sel}: every delta, a repeated character kept`);
        assert.match(await page.textContent(`${sel} .al-head`), /writing[\s\S]*ollama · q:7b[\s\S]*job job-1[\s\S]*9ch/);
        assert.ok(await page.$(`${sel} .al-dot.on`), `${sel}: the dot blinks while it writes`);
      }
      assert.ok(!(await page.textContent('.cs-live .al-head')).includes('chunk'), 'a chunk is not a log row');
      await page.evaluate(() => _agentFeedIn({ repoUuid: 'r1', event: 'complete', jobId: 'job-1', source: 'ollama', provider: 'ollama · q:7b', chars: 9, generating: false }));
      assert.match(await page.textContent('.cs-live .al-head'), /idle[\s\S]*complete/);
      assert.ok(!(await page.$('.cs-live .al-dot.on')));
      // the Code tab repaints itself (a plan event): the slot is drawn again from the one state
      await page.evaluate(() => csPaint());
      assert.strictEqual(await page.textContent('.cs-live .al-text'), 'mv docs//');
      // a browser agent through guardian: DOM mutations and the node anchor
      await page.evaluate(() => {
        _agentFeedIn({ repoUuid: 'r1', event: 'dispatched', jobId: 'g-2', provider: 'claude' });
        _agentFeedIn({ repoUuid: 'r1', event: 'progress', stage: 'dom', jobId: 'g-2', mutations: 42, generating: true, anchor: { path: 'main > div.font-claude-message', tag: 'div', attrs: { 'data-is-streaming': 'true' }, children: 3, textLen: 120 } });
        _agentFeedIn({ repoUuid: 'r1', event: 'chunk', jobId: 'g-2', text: 'Moving the specs', fullLen: 16 });
      });
      const h = await page.textContent('#plan-panel .pp-live .al-head');
      assert.match(h, /claude[\s\S]*mutations 42[\s\S]*⌖ main > div\.font-claude-message/);
      assert.strictEqual(await page.getAttribute('#plan-panel .pp-live .al-anchor', 'title'), 'data-is-streaming=true');
      assert.strictEqual(await page.textContent('.cs-live .al-text'), 'Moving the specs', 'a new job starts its own text');
      // a slot scrolled up stays where he is; one at the bottom follows the newest line
      await page.evaluate(() => { for (let i = 0; i < 80; i++) _agentFeedIn({ repoUuid: 'r1', event: 'chunk', jobId: 'g-2', text: `\nline ${i}`, fullLen: 0 }); });
      const atBottom = await page.$eval('.cs-live .al-text', t => t.scrollTop + t.clientHeight >= t.scrollHeight - 2);
      assert.ok(atBottom, 'follows the newest line');
      await page.$eval('.cs-live .al-text', t => { t.scrollTop = 10; });
      await page.evaluate(() => _agentFeedIn({ repoUuid: 'r1', event: 'chunk', jobId: 'g-2', text: '\nmore', fullLen: 0 }));
      assert.strictEqual(await page.$eval('.cs-live .al-text', t => t.scrollTop), 10, 'scrolled up: stays put');
      // another repo's frame paints nothing here
      await page.evaluate(() => _agentFeedIn({ repoUuid: 'r2', event: 'chunk', jobId: 'x', source: 'ollama', text: 'OTHER', fullLen: 5 }));
      assert.ok(!(await page.textContent('.cs-live')).includes('OTHER'));
      assert.deepStrictEqual(errors, [], 'nothing threw');
    });
  } finally { await browser.close(); }
  done();
})().catch(e => { console.error(e); process.exit(1); });
