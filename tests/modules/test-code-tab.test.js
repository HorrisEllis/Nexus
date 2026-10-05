'use strict';
/**
 * tests/modules/test-code-tab.test.js — CT3 (docs/2026-10-05-code-tab-and-one-router-phasemap.spec), 0.39.349.
 * James: "the code tab the agent tab, work surface, like full activity, enterprise grade?" · "its just the code tab is
 *        meaningless. what about uncommited changes?"
 *
 *   CT-01  GET /api/repos/:uuid/agent/route (idearium's real router): the hops copilot's door would choose for this
 *          repo's agent, each with its backend and model; a provider set in Settings is said as pinned
 *   CT-02  POST …/agent/prompt with a picked hop: its backend and model reach copilot as sent
 *   CT-1x  the tab, driven in Clear Glass (the REAL file-manage.js, work-surface.js and code-surface.js against a stubbed
 *          api() that answers like idearium's routes):
 *          CT-10 the files: uncommitted greyed / marked as in the Files tab, a waiting diff dotted; "changed only" filters
 *          CT-11 no file open: every change the agent made, as diff cards with Apply / Reject
 *          CT-12 a file open: its lines, its chunks marked where they start, its diff above; a chunk → its card
 *          CT-13 Apply writes it (POST …/injects/:id/apply) and the tree follows
 *          CT-14 the docked agent names the model copilot chose; another hop picked is sent with its backend and model,
 *                the open file and picked lines as context; the reply says which model answered
 *          CT-15 activity folds open; nothing threw
 *   CT-03  §CT5 POST …/manage with a picked hop: its backend and model reach copilot (an explain, which takes no snapshot)
 *   CT-2x  §CT5 hooked into the Plan (the REAL plan-panel.js too):
 *          CT-20 the plan strip: the current step with its gates, the runs on the open file; a run opens the Plan panel on itself
 *          CT-21 "change it" is a Manage edit (file, picked lines, his words, the picked model); the Plan panel opens on the run
 *          CT-22 a Plan event repaints the Code tab (a new change shows without a click)
 *          CT-23 a work-surface card in the Plan panel opens its file in the Code tab; so does a file in a run's ledger
 *   CT-3x  §CT7 / §CT8 0.39.352:
 *          CT-30 the Plan shows current work: complete steps fold into one line with their count; show / hide toggles them
 *          CT-31 the agent working, live: a call blinks while it runs (in activity and on its file in the tree), ✓ when it
 *                ends, without a reload; the agent box keeps what was typed
 *   CT-40  §CT9 0.39.353 the Plan's pull tab: on the right edge while the panel is closed, with its count; a click opens
 *          the panel and hides it; off the repo view there is none
 * No engine on the machine: the browser part is SKIPPED, said, never passed.
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const http = require('http');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '../..');
const UI = path.join(ROOT, 'idearium', 'ui');

let passed = 0, failed = 0, skipped = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };

function harness() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct3-ui-'));
  const css = ['work-surface.css', 'code-surface.css'].map(f => fs.readFileSync(path.join(UI, 'css', f), 'utf8')).join('\n')
    + (fs.readFileSync(path.join(UI, 'index.html'), 'utf8').match(/#plan-panel\{[^\n]*\n#plan-panel\.open[\s\S]*?#plan-tab \.pp-tab-dot\{[^\n]*\n/) || [''])[0];   // §CT9 — the page's own Plan styles
  const src = (f) => pathToFileURL(path.join(UI, 'js', f)).href;
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
<button class="repo-subtab-btn" id="sub-code">Code</button>
<div id="repo-subtab-code" style="height:800px"></div>
<script>
  const CALLS = [];
  const REPO = { uuid: 'r1', name: 'daw', compartmentId: 'c1', files: [{ path: 'src/a.js' }, { path: 'src/b.js' }, { path: 'README.md' }] };
  let CURRENT_API_REPO = REPO, CURRENT_REPO_SUBTAB = 'code';
  let APPLIED = false, EXTRA = false;
  function setRepoSubtab(n) { CURRENT_REPO_SUBTAB = n; if (n === 'code') renderRepoCode(CURRENT_API_REPO); }
  const RUNS = [{ runId: 'phase-1', phase: 'KE0_core', map: 'docs/k-phasemap.spec', state: 'building', ts: 1 }, { runId: 'phase-1', phase: 'KE0_core', map: 'docs/k-phasemap.spec', state: 'replied', ts: 2, injects: { injected: ['src/a.js'] } },
    { runId: 'manage-x', phase: 'DEBUG', map: 'file:src/a.js', state: 'failed', title: 'debug src/a.js', error: 'no reply', ts: 3 }, { runId: 'other', phase: 'X', map: 'file:src/b.js', state: 'replied', ts: 4 }];
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  function toast() {} function renderApiRepoPanel() {}
  const DIFF = '--- a/src/a.js\\n+++ b/src/a.js\\n@@ -1,3 +1,3 @@\\n function a() {\\n-  return 2;\\n+  return 3;\\n }';
  async function api(p, opts) {
    CALLS.push({ p, method: (opts && opts.method) || 'GET', body: opts && opts.body ? JSON.parse(opts.body) : null });
    if (p.endsWith('/files/state')) return APPLIED ? { states: { 'src/new.js': { state: 'pending', pending: ['i2'] } }, counts: { pending: 1 } }
      : { states: { 'src/a.js': { state: 'modified' }, 'src/new.js': { state: 'pending', pending: ['i2'] } }, counts: { modified: 1, pending: 1 } };
    if (p.endsWith('/plan')) return { summary: { total: 3, complete: 1, building: 1 }, steps: [{ key: 'KE0_core', map: 'docs/k-phasemap.spec', title: 'KE0 core', status: 'complete', gates: [{ gate: 'mapped', passed: true }], ledger: [{ ts: 2, state: 'replied', injected: ['src/a.js'] }] },
      { key: 'KE1_io', map: 'docs/k-phasemap.spec', title: 'KE1 io', current: true, gate: 'replied', run: { runId: 'phase-2' }, gates: [{ gate: 'mapped', passed: true }, { gate: 'snapshot', passed: true }, { gate: 'replied', passed: false }], ledger: [] }] };
    if (p.endsWith('/phases/runs')) return { runs: RUNS };
    if (p.endsWith('/manage')) return { runId: 'manage-new', title: 'edit src/a.js lines 2–2 (of 5)', state: 'building', snapshot: 'abc123def456789' };
    if (p.endsWith('/worksurface')) return { files: [...(EXTRA ? [{ id: 'i9', path: 'src/b.js', op: 'write', status: 'proposed', added: 2, removed: 0, diff: '@@ -1,0 +1,2 @@\\n+a\\n+b', actions: ['apply', 'reject'] }] : []),
        { id: 'i1', path: 'src/a.js', op: 'write', status: APPLIED ? 'applied' : 'proposed', added: 1, removed: 1, diff: DIFF, actions: APPLIED ? ['revert'] : ['apply', 'reject'], by: 'ollama:big:7b' },
        { id: 'i2', path: 'src/new.js', op: 'write', creates: true, status: 'proposed', added: 1, removed: 0, diff: '@@ -0,0 +1,1 @@\\n+export const n = 1;', actions: ['apply', 'reject'] }],
      totals: { files: 2, added: 2, removed: 1, pending: APPLIED ? 1 : 2 }, tools: { scope: 'harness', listed: ['idearium.code_read.tool'], calls: [{ name: 'idearium.code_read.tool', ok: true, args: '{"path":"src/a.js"}' }, { name: 'idearium.code_write.tool', ok: false, error: 'outside the repo' }] } };
    if (p.includes('/code/overview')) return { files: 3, chunks: 4, lines: 20, languages: ['js'], repo: { writeMode: 'propose', pendingProposals: APPLIED ? 1 : 2 } };
    if (p.endsWith('/agent/route')) return { ok: true, route: [{ provider: 'ollama:big:7b', backend: 'ollama', agent: null, model: 'big:7b', why: 'learned for agent:chat: 9/10 ok' }, { provider: 'gemini', backend: 'guardian', agent: 'gemini', model: null, why: 'chain' }], pinned: null };
    if (p.includes('/file?path=src%2Fa.js')) return { content: 'function a() {\\n  return 2;\\n}\\nmodule.exports = a;\\n' };
    if (p.includes('/code/outline')) return { file: 'src/a.js', chunks: [{ id: 'c-a', lines: '1-3', kind: 'function', name: 'a', summary: 'returns two' }] };
    if (p.includes('/code/chunk')) return { card: { id: 'c-a', kind: 'function', name: 'a', file: 'src/a.js', lines: '1-3', summary: 'returns two', uses: [], usedBy: [{ chunkId: 'c-x', name: 'main', basis: 'require' }], tests: ['tests/a.test.js'] }, around: {} };
    if (/\\/injects\\/i1\\/apply$/.test(p)) { APPLIED = true; return { ok: true }; }
    if (p.endsWith('/agent/prompt')) return { ok: true, text: 'changed it', viaCopilot: null, providerUsed: 'gemini', elapsedMs: 1200 };
    return {};
  }
</script>
<script src="${src('file-manage.js')}"></script>
<script src="${src('work-surface.js')}"></script>
<script src="${src('code-surface.js')}"></script>
<script src="${src('plan-panel.js')}"></script>
</body></html>`);
  return path.join(dir, 'index.html');
}

(async () => {
  // ── CT-01 / CT-02 the routes, through idearium's real router, against a stand-in copilot ──
  const MD = require(path.join(ROOT, 'lib/model-door.js'));
  const PR = require(path.join(ROOT, 'lib/pipeline-routing.js'));
  const resolve = (p) => (p === 'ollama' ? { backend: 'ollama', agent: null } : { backend: 'guardian', agent: p });
  const policy = PR.policyFrom({ mode: 'learned', chain: 'ollama,gemini', ollama_models: 'small:3b,big:7b', learn_min_records: 1000 });
  const prompts = [];
  const srv = http.createServer((q, s) => {
    let b = ''; q.on('data', d => b += d); q.on('end', () => {
      const body = b ? JSON.parse(b) : {};
      s.setHeader('content-type', 'application/json');
      if (q.url === '/api/route') return s.end(JSON.stringify(MD.route({ ...body, policy, records: [] }, { resolve })));
      if (q.url === '/api/route/outcome') return s.end('{"ok":true}');
      if (q.url === '/api/prompt') { prompts.push(body); return s.end(JSON.stringify({ ok: true, text: `answer from ${body.model || body.agent}` })); }
      s.statusCode = 404; s.end('{}');
    });
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  process.env.COPILOT_URL = `http://127.0.0.1:${srv.address().port}`;
  process.env.NEXUS_VERSIONIUM_URL = 'http://127.0.0.1:9';
  const api = await quiet(() => import(path.join(ROOT, 'idearium/api/index.js')));
  const RA = require(path.join(ROOT, 'lib/repo-agent.js'));
  const L = api.getRepoLayer();
  let made = null;
  for (let i = 0; i < 20; i++) {
    made = await quiet(async () => L.ingest({ name: `ct3-${Date.now()}`, source: 'test', compartmentId: 'c-ct3', files: [{ path: 'src/a.js', content: 'module.exports = 1;\n' }] }));
    if (!(made && made.error && /no spec-engine/.test(made.error))) break;
    await new Promise(x => setTimeout(x, 250));
  }
  const u = made.repo.uuid;

  await test('CT-01', 'GET …/agent/route: the hops copilot\'s door would choose, each with backend and model; a set provider is pinned', async () => {
    RA.setProvider(u, 'auto');
    const r = await api._route('GET', `/api/repos/${u}/agent/route`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.deepStrictEqual(r.json.route.map(h => [h.provider, h.backend, h.model]), [['ollama:small:3b', 'ollama', 'small:3b'], ['ollama:big:7b', 'ollama', 'big:7b'], ['gemini', 'guardian', null]]);
    assert.strictEqual(r.json.pinned, null);
    RA.setProvider(u, 'ollama');
    assert.strictEqual((await api._route('GET', `/api/repos/${u}/agent/route`)).json.pinned, 'ollama');
    RA.setProvider(u, 'auto');
    assert.strictEqual((await api._route('GET', '/api/repos/nope-ct3/agent/route')).status, 404);
  });

  await test('CT-02', 'POST …/agent/prompt with a picked hop: its backend and model reach copilot as sent', async () => {
    const r = await quiet(() => api._route('POST', `/api/repos/${u}/agent/prompt`, { message: 'hello', backend: 'ollama', model: 'big:7b', noContext: true }));
    assert.strictEqual(r.json.ok, true, JSON.stringify(r.json).slice(0, 400));
    const last = prompts[prompts.length - 1];
    assert.deepStrictEqual([last.backend, last.model], ['ollama', 'big:7b']);
  });
  await test('CT-03', '§CT5 POST …/manage with a picked hop: its backend and model reach copilot', async () => {
    const n = prompts.length;
    const r = await quiet(() => api._route('POST', `/api/repos/${u}/manage`, { path: 'src/a.js', action: 'explain', backend: 'ollama', model: 'big:7b', note: 'what is it' }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.json).slice(0, 300));
    assert.ok(/^manage-/.test(r.json.runId));
    for (let i = 0; i < 50 && prompts.length === n; i++) await new Promise(x => setTimeout(x, 100));
    const last = prompts[prompts.length - 1];
    assert.deepStrictEqual([last.backend, last.model], ['ollama', 'big:7b']);
  });
  srv.close();

  // ── CT-1x the tab in Clear Glass ──
  const glass = require('../../clear-glass/src/driver/glass.js');
  const eng = glass.engine();
  if (!eng) { console.log('  - CT-10…CT-15 SKIPPED: Clear Glass has no engine here (no Electron binary, no Chromium) — the browser checks did not run'); skipped += 6; return done(); }
  let browser;
  try { browser = await glass.chromium.launch(); }
  catch (e) { console.log(`  - CT-10…CT-15 SKIPPED: Clear Glass's engine (${eng.kind}) could not start (${e.message.split('\n')[0]})`); skipped += 6; return done(); }
  console.log(`  · driven by Clear Glass (clear-glass/src/driver/glass.js), engine: ${eng.kind}`);
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(harness()).href);
    await page.evaluate(() => renderRepoCode(REPO));
    await page.waitForSelector('.cs-file[data-path="src/a.js"] .fs-tag');
    await page.waitForSelector('.cs-who b');

    await test('CT-10', 'the files: uncommitted marked, proposal-only greyed, a waiting diff dotted; "changed only" filters', async () => {
      const rows = await page.$$eval('.cs-file', els => els.map(e => [e.dataset.path, e.className.includes('fs-row-modified'), e.className.includes('fs-row-pending'), !!e.querySelector('.cs-diffdot')]));
      const by = Object.fromEntries(rows.map(r => [r[0], r.slice(1)]));
      assert.deepStrictEqual(by['src/a.js'], [true, false, true], JSON.stringify(rows));
      assert.deepStrictEqual(by['src/new.js'], [false, true, true]);
      assert.deepStrictEqual(by['src/b.js'], [false, false, false]);
      const op = await page.$eval('.cs-file[data-path="src/new.js"]', e => getComputedStyle(e).opacity);
      assert.ok(+op < 0.6, `greyed (opacity ${op})`);
      await page.click('button:has-text("changed only")');
      assert.deepStrictEqual(await page.$$eval('.cs-file', els => els.map(e => e.dataset.path).sort()), ['src/a.js', 'src/new.js']);
      await page.click('button:has-text("changed only")');
    });

    await test('CT-11', 'no file open: the agent\'s changes as diff cards with Apply / Reject', async () => {
      assert.ok(/the agent's changes/.test(await page.textContent('.cs-mid')));
      assert.deepStrictEqual(await page.$$eval('.cs-mid .ws-card', els => els.map(e => e.dataset.path)), ['src/a.js', 'src/new.js']);
      assert.strictEqual(await page.$$eval('.cs-mid .ws-head .ws-act-apply', e => e.length), 2);
      assert.strictEqual(await page.$$eval('.cs-mid .ws-head .ws-act-reject', e => e.length), 2);
    });

    await test('CT-12', 'a file open: its lines, its chunk marked where it starts, its diff above; the chunk → its card', async () => {
      await page.click('.cs-file[data-path="src/a.js"]');
      await page.waitForSelector('#cs-code .cs-ln');
      assert.strictEqual(await page.$$eval('#cs-code .cs-ln', e => e.length), 5);
      assert.ok(/function\s*a\s*1-3/.test(await page.textContent('#cs-code .cs-chunk')));
      assert.deepStrictEqual(await page.$$eval('.cs-mid .ws-card', els => els.map(e => e.dataset.path)), ['src/a.js'], 'only this file\'s diff');
      assert.ok(await page.$$eval('.cs-mid .ws-add', e => e.length) >= 1);
      await page.click('#cs-code .cs-chunk');
      await page.waitForSelector('.cs-card .cs-dl');
      const card = await page.textContent('.cs-card');
      assert.ok(/returns two/.test(card) && /main/.test(card) && /tests\/a\.test\.js/.test(card), card);
      assert.strictEqual(await page.$$eval('#cs-code .cs-ln.pick', e => e.length), 3, 'the chunk\'s lines are marked');
    });

    await test('CT-13', 'Apply writes it and the tree follows', async () => {
      await page.click('.cs-mid .ws-head .ws-act-apply');
      await page.waitForFunction(() => !document.querySelector('.cs-file[data-path="src/a.js"]').className.includes('fs-row-modified'));
      assert.ok(await page.evaluate(() => CALLS.some(c => c.method === 'POST' && /\/injects\/i1\/apply$/.test(c.p))));
      assert.strictEqual(await page.$$eval('.cs-file[data-path="src/a.js"] .cs-diffdot', e => e.length), 0);
      assert.ok(/applied/.test(await page.textContent('.cs-mid .ws-card')));
    });

    await test('CT-14', 'the docked agent: copilot\'s model named; another hop picked goes with its backend and model, and the file as context', async () => {
      assert.strictEqual(await page.textContent('.cs-who b'), 'ollama:big:7b');
      assert.ok(/learned for agent:chat/.test(await page.textContent('.cs-who')));
      await page.click('#cs-code .cs-ln[data-ln="2"] .cs-g');
      await page.selectOption('#cs-pick', '1');
      await page.fill('#cs-ask', 'make it return 4');
      await page.evaluate(() => document.getElementById('cs-ask').dispatchEvent(new Event('input')));
      await page.click('.cs-send');
      await page.waitForFunction(() => /changed it/.test(document.querySelector('#cs-talk').textContent));
      const sent = await page.evaluate(() => CALLS.filter(c => /\/agent\/prompt$/.test(c.p)).pop().body);
      assert.deepStrictEqual([sent.backend, sent.agent, sent.model], ['guardian', 'gemini', null]);
      assert.ok(/^\[Code tab — about src\/a\.js lines 2-2 \(chunk a\)\]\nmake it return 4$/.test(sent.message), sent.message);
      assert.ok(/picked gemini/.test(await page.textContent('#cs-talk')), 'the reply says which model answered');
    });

    await test('CT-15', 'activity folds open with the tool calls; nothing threw', async () => {
      await page.click('.cs-act-head');
      const t = await page.textContent('.cs-act-body');
      assert.ok(/idearium\.code_read\.tool/.test(t) && /outside the repo/.test(t), t);
      assert.deepStrictEqual(errors, []);
    });

    // ── §CT5 hooked into the Plan ──
    await test('CT-20', 'the plan strip: the current step with its gates, the runs on the open file; a run opens the Plan on itself', async () => {
      await page.waitForSelector('.cs-plan .cs-cur');
      const strip = await page.textContent('.cs-plan');
      assert.ok(/1\/3 done · 1 building/.test(strip) && /KE1 io/.test(strip), strip);
      assert.strictEqual(await page.$$eval('.cs-plan .pp-g', e => e.length), 3, 'the step\'s gates, as in the Plan panel');
      assert.deepStrictEqual(await page.$$eval('.cs-plan .cs-run', e => e.map(x => x.textContent)), ['debug · failed', 'ke0_core · replied'], 'the runs on src/a.js, not on b.js');
      await page.click('.cs-plan .cs-run');
      await page.waitForSelector('#plan-panel.open');
      assert.strictEqual(await page.evaluate(() => PLANP.uuid), 'r1');
    });

    await test('CT-21', '"change it" is a Manage edit — file, lines, words, model — and the Plan opens on the run', async () => {
      await page.evaluate(() => closePlanPanel());
      await page.click('#cs-code .cs-ln[data-ln="3"] .cs-g');   // line 2 is still picked from CT-14: a click on another line picks that one
      await page.selectOption('#cs-pick', '0');
      await page.fill('#cs-ask', 'return 4');
      await page.evaluate(() => document.getElementById('cs-ask').dispatchEvent(new Event('input')));
      await page.click('.cs-send-change');
      await page.waitForFunction(() => /a run on the Plan/.test(document.querySelector('#cs-talk').textContent));
      const sent = await page.evaluate(() => CALLS.filter(c => /\/manage$/.test(c.p)).pop().body);
      assert.deepStrictEqual([sent.path, sent.action, sent.from, sent.to, sent.note, sent.backend, sent.model], ['src/a.js', 'edit', 3, 3, 'return 4', 'ollama', 'big:7b']);
      assert.strictEqual(sent.refs[0].name, 'a', 'the chunk on its card goes as related code');
      assert.ok(await page.evaluate(() => document.getElementById('plan-panel').classList.contains('open')));
      assert.ok(await page.evaluate(() => CALLS.some(c => /\/plan$/.test(c.p))), 'the panel read the plan');
      assert.ok(/snapshot abc123def456/.test(await page.textContent('#cs-talk')));
    });

    await test('CT-22', 'a Plan event repaints the Code tab: a new change shows without a click', async () => {
      await page.evaluate(() => { closePlanPanel(); CS.open = null; csPaint(); EXTRA = true; codeSurfaceOnEvent({ type: 'idearium.repo.inject.proposed', payload: { repoUuid: 'r1' } }); });
      await page.waitForSelector('.cs-mid .ws-card[data-path="src/b.js"]', { timeout: 4000 });
      assert.strictEqual(await page.$$eval('.cs-file[data-path="src/b.js"] .cs-diffdot', e => e.length), 1);
      await page.evaluate(() => { EXTRA = false; codeSurfaceOnEvent({ type: 'idearium.repo.phase.run', payload: { repoUuid: 'other-repo' } }); });
      await page.waitForTimeout(700);
      assert.strictEqual(await page.$$eval('.cs-mid .ws-card[data-path="src/b.js"]', e => e.length), 1, 'another repo\'s event is not this one\'s');
    });

    await test('CT-23', 'a card in the Plan panel opens its file in the Code tab; so does a file in a run\'s ledger', async () => {
      await page.evaluate(() => { EXTRA = true; CURRENT_REPO_SUBTAB = 'files'; openPlanPanel(); });
      await page.waitForSelector('#pp-ws .ws-card[data-path="src/b.js"] .ws-act-code');
      await page.click('#pp-ws .ws-card[data-path="src/b.js"] .ws-act-code');
      await page.waitForFunction(() => CURRENT_REPO_SUBTAB === 'code' && CS.open === 'src/b.js');
      await page.evaluate(() => { PLANP.showDone = true; PLANP.open.add('docs/k-phasemap.spec::KE0_core'); _planPaint(); });   // KE0 is complete: shown (CT7 folds it by default)
      await page.click('#pp-body .pp-file');
      await page.waitForFunction(() => CS.open === 'src/a.js');
      assert.deepStrictEqual(errors, []);
    });

    await test('CT-30', 'the Plan shows current work: complete steps fold into one line; show / hide toggles them', async () => {
      await page.evaluate(() => { try { localStorage.removeItem('idearium.plan.showDone'); } catch (_) {} PLANP.showDone = false; PLANP.open = new Set(); openPlanPanel(); });
      await page.waitForSelector('#pp-body .pp-donefold');
      assert.deepStrictEqual(await page.$$eval('#pp-body .pp-task .pp-name', e => e.map(x => x.textContent)), ['KE1 io'], 'only what is not complete');
      assert.ok(/✓ 1 step complete — show/.test(await page.textContent('#pp-body .pp-donefold')));
      await page.click('#pp-body .pp-donefold');
      assert.deepStrictEqual(await page.$$eval('#pp-body .pp-task .pp-name', e => e.map(x => x.textContent)), ['KE1 io', 'KE0 core']);
      assert.ok(/— hide/.test(await page.textContent('#pp-body .pp-donefold')));
      await page.click('#pp-body .pp-donefold');
      assert.strictEqual(await page.$$eval('#pp-body .pp-task', e => e.length), 1);
      await page.evaluate(() => closePlanPanel());
    });

    await test('CT-31', 'the agent working, live: blinking while a call runs, ✓ when it ends, no reload; the agent box keeps its text', async () => {
      await page.evaluate(() => { CURRENT_REPO_SUBTAB = 'code'; csPaint(); });
      await page.fill('#cs-ask', 'half typed');
      await page.evaluate(() => document.getElementById('cs-ask').dispatchEvent(new Event('input')));
      const n0 = await page.evaluate(() => CALLS.length);
      await page.evaluate(() => codeSurfaceOnEvent({ type: 'idearium.repo.agent.tool', payload: { repoUuid: 'r1', session: 'phrun-2', name: 'idearium.code_read.tool', state: 'running', args: '{"path":"src/b.js"}', iteration: 1, at: Date.now() } }));
      await page.waitForSelector('.cs-act-head .cs-now .cs-livedot');
      assert.ok(/code_read/.test(await page.textContent('.cs-act-head .cs-now')));
      assert.strictEqual(await page.$$eval('.cs-file[data-path="src/b.js"] .cs-livedot', e => e.length), 1, 'the file it is on blinks');
      assert.strictEqual(await page.$$eval('.cs-file[data-path="src/a.js"] .cs-livedot', e => e.length), 0);
      const anim = await page.$eval('.cs-act-head .cs-livedot', e => getComputedStyle(e).animationName);
      assert.strictEqual(anim, 'cs-blink');
      assert.strictEqual(await page.evaluate(() => document.getElementById('cs-ask').value), 'half typed', 'the agent box was not repainted');
      await page.evaluate(() => codeSurfaceOnEvent({ type: 'idearium.repo.agent.tool', payload: { repoUuid: 'r1', session: 'phrun-2', name: 'idearium.code_read.tool', state: 'ok', args: '{"path":"src/b.js"}', iteration: 1, at: Date.now() } }));
      await page.waitForFunction(() => !document.querySelector('.cs-act-head .cs-now'));
      assert.strictEqual(await page.$$eval('.cs-file .cs-livedot', e => e.length), 0);
      await page.evaluate(() => codeSurfaceOnEvent({ type: 'idearium.repo.agent.tool', payload: { repoUuid: 'r1', session: 'phrun-2', name: 'idearium.code_edit.tool', state: 'failed', args: '{"changes":[]}', error: 'edits is required', iteration: 2, at: Date.now() } }));
      await page.evaluate(() => { CS.activity = true; _csPaintLive(); });   // (CT-15 left it open or closed; open it)
      const body = await page.textContent('.cs-act-body');
      assert.ok(/LIVE|live/.test(body) && /✗ idearium\.code_edit\.tool/.test(body) && /✓ idearium\.code_read\.tool/.test(body), body);
      assert.strictEqual(await page.evaluate(() => CALLS.length), n0, 'live calls arrive by event: nothing was fetched');
      await page.evaluate(() => codeSurfaceOnEvent({ type: 'idearium.repo.agent.tool', payload: { repoUuid: 'other', name: 'x', state: 'running', at: Date.now() } }));
      assert.strictEqual(await page.evaluate(() => CS.live.length), 2, 'another repo\'s calls are not this one\'s');
      assert.deepStrictEqual(errors, []);
    });

    await test('CT-40', 'the Plan\'s pull tab: on the right edge when closed, with its count; a click opens the panel; none off the repo view', async () => {
      await page.evaluate(() => { openPlanPanel(); });
      await page.waitForFunction(() => PLANP.data);
      assert.ok(await page.evaluate(() => { const t = document.getElementById('plan-tab'); return !t || t.hidden; }), 'no tab while the panel is open');
      await page.evaluate(() => closePlanPanel());
      const tab = await page.evaluate(() => { const t = document.getElementById('plan-tab'); const r = t.getBoundingClientRect(); return { hidden: t.hidden, right: Math.round(r.right), w: document.documentElement.clientWidth, mid: Math.round(r.top + r.height / 2), h: innerHeight, text: t.textContent, dot: !!t.querySelector('.pp-tab-dot') }; });
      assert.strictEqual(tab.hidden, false);
      assert.strictEqual(tab.right, tab.w, `flush with the right edge (${tab.right} of ${tab.w})`);
      assert.ok(Math.abs(tab.mid - tab.h / 2) < 3, 'middle height');
      assert.ok(/Plan/.test(tab.text) && /1\/3/.test(tab.text) && tab.dot, JSON.stringify(tab));
      await page.click('#plan-tab');
      await page.waitForSelector('#plan-panel.open');
      assert.ok(await page.evaluate(() => document.getElementById('plan-tab').hidden), 'opening hides it');
      await page.evaluate(() => { closePlanPanel(); document.getElementById('sub-code').style.display = 'none'; planTabSync(); });
      assert.ok(await page.evaluate(() => document.getElementById('plan-tab').hidden), 'off the repo view: no tab');
      await page.evaluate(() => { document.getElementById('sub-code').style.display = ''; planTabSync(); });
      assert.strictEqual(await page.evaluate(() => document.getElementById('plan-tab').hidden), false);
      assert.deepStrictEqual(errors, []);
    });
  } finally { await browser.close(); }
  done();
})();
function done() { console.log(`\n  ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`); process.exit(failed ? 1 : 0); }
