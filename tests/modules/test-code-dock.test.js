'use strict';
/**
 * tests/modules/test-code-dock.test.js — DK1 + DK2 (0.60.118): the dock and the repo's tools and procedures.
 * Map: docs/2026-10-16-code-tab-rebuild-phasemap.spec addendum_c.
 * James, 2026-10-17: "i want the panels completely seperate from each other, collapasable, organized and updated in real
 * time. maybe buttons for agent tools, for the repo, to execute. replayable proceedures? ... i want to eb able to open all
 * of them, or none of them."
 *
 *   DK-01  the routes, through idearium's real router against a stand-in copilot: a tool run as a person goes through
 *          copilot /api/tools/run with the repo's dir; a procedure saved, listed, replayed (each step through the same door),
 *          and archived; a replay that fails names the step
 *   DK-1x  the dock, driven in Clear Glass (the REAL work-surface.js, repo-tasks.js, plan-panel.js and code-dock.js against
 *          a stubbed api()):
 *          DK-10 the rail: the Plan's tab and one tab per panel; the Plan's own pull tab is hidden (one rail)
 *          DK-11 none open, then each opens alone; all opens every one; none closes every one
 *          DK-12 a panel folds and unfolds on its own; closing one leaves the others
 *          DK-13 outputs: the proposals as diff cards with Apply / Reject, and the artifacts, said as not repo-scoped
 *          DK-14 changes: the workspace files by state and the change records
 *          DK-15 tasks in real time: an idearium.repo.task event repaints the panel and the rail with no fetch
 *          DK-16 tools: a tool button opens its arguments; run sends it through the route; a procedure replays
 *          DK-17 an event for another repo changes nothing; an inject event reloads only the open panels it concerns
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
process.env.REPO_PROCEDURES_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-proc-'));

let passed = 0, failed = 0, skipped = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };

function harness() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-ui-'));
  const html = fs.readFileSync(path.join(UI, 'index.html'), 'utf8');
  const dockCss = html.split('\n').filter(l => /^#dock-|^\.dk-/.test(l)).join('\n');
  const css = ['work-surface.css'].map(f => { try { return fs.readFileSync(path.join(UI, 'css', f), 'utf8'); } catch (_) { return ''; } }).join('\n') + '\n' + dockCss;
  const src = (f) => pathToFileURL(path.join(UI, 'js', f)).href;
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
<button class="repo-subtab-btn" id="sub-code">Code</button>
<div id="repo-subtab-code" style="height:600px"></div>
<script>
  const CALLS = [];
  const REPO = { uuid: 'r1', name: 'daw', files: [{ path: 'src/a.js' }] };
  let CURRENT_API_REPO = REPO, CURRENT_REPO_SUBTAB = 'code';
  let PROCS = [{ id: 'proc-1', name: 'read the readme', steps: [{ tool: 'idearium.code_read.tool', args: { path: 'README.md' } }], runs: [], runCount: 0 }];
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  const TOASTS = []; function toast(m, k) { TOASTS.push([m, k]); }
  function themedPrompt() { return Promise.resolve('kept one'); }
  async function api(p, opts) {
    CALLS.push({ p, method: (opts && opts.method) || 'GET', body: opts && opts.body ? JSON.parse(opts.body) : null });
    if (p.endsWith('/worksurface')) return { files: [{ id: 'i1', path: 'src/a.js', op: 'write', status: 'proposed', added: 1, removed: 1, diff: '@@ -1,1 +1,1 @@\\n-a\\n+b', actions: ['apply', 'reject'] }, { id: 'i0', path: 'src/old.js', op: 'write', status: 'applied', added: 1, removed: 0, diff: '', actions: ['revert'] }], totals: {} };
    if (p.includes('/artifacts')) return { repoScoped: false, artifacts: [{ hash: 'abc123456', name: 'notes.js', lang: 'js', ts: 1, lines: 3, preview: 'const n = 1;' }] };
    if (p.endsWith('/files/state')) return { states: { 'src/a.js': { state: 'modified', pending: ['i1'] }, 'src/z.js': { state: 'new' }, 'src/k.js': { state: 'committed' } }, counts: { modified: 1, new: 1, committed: 1 }, version: 'v1abcdef12' };
    if (p.includes('/changes')) return { changes: [{ id: 'i1', path: 'src/a.js', op: 'write', status: 'proposed', at: 2, lines: { added: 1, removed: 1 }, agent: 'the_builder', goal: 'make a return b' }] };
    if (p.includes('/tasks')) return { tasks: [{ id: 't1', title: 'phase KE1 build', status: 'running', startedAt: 1, steps: [] }] };
    if (p.endsWith('/plan')) return { summary: { total: 2, complete: 1 }, steps: [{ key: 'KE1', title: 'KE1 io', current: true, ledger: [{ state: 'building', ts: 5, provider: 'ollama', context: { used: 1200, window: 8192, pct: 14.6, free: 6992, parts: [{ id: 'request', label: 'the request', tokens: 800, share: 0.66 }, { id: 'mapped', label: 'mapped files', tokens: 400, share: 0.34 }], method: 'estimate-v1' } }] }] };
    if (p.endsWith('/agent/tools')) return { scope: 'all', tools: [{ name: 'idearium.code_read.tool', group: 'code', groupTitle: 'Code', summary: 'read a file', params: ['path'], inScope: true }, { name: 'cos_run', group: 'cos', groupTitle: 'COS', summary: 'run in COS', params: [], inScope: false }] };
    if (p.includes('/runs')) return { runs: [{ runId: 'run-9', goal: 'look around', status: 'done', stepCount: 4 }] };
    if (/\\/procedures\\/proc-1\\/replay$/.test(p)) { PROCS[0].runCount = 1; PROCS[0].runs = [{ ok: true, results: [{ tool: 'idearium.code_read.tool', ok: true }] }]; return { ok: true, procedure: { id: 'proc-1', name: 'read the readme' }, run: { ok: true, results: [{ tool: 'idearium.code_read.tool', ok: true }] } }; }
    if (p.endsWith('/procedures') && opts && opts.method === 'POST') { const b = JSON.parse(opts.body); PROCS.push({ id: 'proc-2', name: b.name, steps: b.steps, runs: [], runCount: 0 }); return { ok: true, procedure: PROCS[1] }; }
    if (p.endsWith('/procedures')) return { procedures: PROCS };
    if (p.endsWith('/agent/tools/run')) return { name: 'idearium.code_read.tool', ms: 12, result: { ok: true, result: { content: '# hello' } } };
    return {};
  }
</script>
<script src="${src('work-surface.js')}"></script>
<script src="${src('repo-tasks.js')}"></script>
<script src="${src('plan-panel.js')}"></script>
<script src="${src('code-dock.js')}"></script>
</body></html>`);
  return path.join(dir, 'index.html');
}

(async () => {
  // ── DK-01 the routes, through idearium's real router, against a stand-in copilot ──
  const ran = [];
  const srv = http.createServer((q, s) => {
    let b = ''; q.on('data', d => b += d); q.on('end', () => {
      const body = b ? JSON.parse(b) : {};
      s.setHeader('content-type', 'application/json');
      if (q.url === '/api/tools/run') { ran.push(body); return s.end(JSON.stringify(body.name === 'bad.tool' ? { ok: false, error: 'path is required' } : { ok: true, name: body.name, result: { echoed: body.args } })); }
      s.statusCode = 404; s.end('{}');
    });
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  process.env.COPILOT_URL = `http://127.0.0.1:${srv.address().port}`;
  process.env.NEXUS_VERSIONIUM_URL = 'http://127.0.0.1:9';
  const api = await quiet(() => import(path.join(ROOT, 'idearium/api/index.js')));
  const L = api.getRepoLayer();
  let made = null;
  for (let i = 0; i < 20; i++) {
    made = await quiet(async () => L.ingest({ name: `dk-${Date.now()}`, source: 'test', compartmentId: 'c-dk', files: [{ path: 'README.md', content: '# hi\n' }] }));
    if (!(made && made.error && /no spec-engine/.test(made.error))) break;
    await new Promise(x => setTimeout(x, 250));
  }
  const u = made.repo.uuid;
  await test('DK-01', 'routes: a tool run as a person, and a procedure saved, listed, replayed through the same door, archived', async () => {
    const t = await quiet(() => api._route('POST', `/api/repos/${u}/agent/tools/run`, { name: 'idearium.code_read.tool', args: { path: 'README.md' } }));
    assert.strictEqual(t.status, 200, JSON.stringify(t.json));
    assert.deepStrictEqual(t.json.result.result, { echoed: { path: 'README.md' } });
    assert.strictEqual(ran[0].name, 'idearium.code_read.tool'); assert.ok(ran[0].context && ran[0].context.repoDir, 'the repo\'s dir goes with the call');
    const s = await quiet(() => api._route('POST', `/api/repos/${u}/procedures`, { name: 'two', steps: [{ tool: 'a.tool', args: { x: 1 } }, { tool: 'bad.tool', args: {} }, { tool: 'never.tool', args: {} }] }));
    assert.strictEqual(s.status, 200, JSON.stringify(s.json));
    const id = s.json.procedure.id;
    const l = await api._route('GET', `/api/repos/${u}/procedures`);
    assert.ok(l.json.procedures.some(p => p.id === id));
    const n0 = ran.length;
    const r = await quiet(() => api._route('POST', `/api/repos/${u}/procedures/${id}/replay`, {}));
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.ok, false); assert.strictEqual(r.json.run.stoppedAt, 2); assert.match(r.json.run.results[1].error, /path is required/);
    assert.deepStrictEqual(ran.slice(n0).map(x => x.name), ['a.tool', 'bad.tool'], 'stopped at the failure: the third never ran');
    const d = await api._route('DELETE', `/api/repos/${u}/procedures/${id}`);
    assert.ok(d.json.archived && fs.existsSync(d.json.archived));
    assert.strictEqual((await api._route('POST', `/api/repos/${u}/agent/tools/run`, {})).status, 400, 'no name: refused');
  });
  srv.close();

  // ── DK-1x the dock in Clear Glass ──
  const glass = require('../../clear-glass/src/driver/glass.js');
  const eng = glass.engine();
  if (!eng) { console.log('  - DK-10…DK-17 SKIPPED: Clear Glass has no engine here (no Electron binary, no Chromium) — the browser checks did not run'); skipped += 8; return done(); }
  let browser;
  try { browser = await glass.chromium.launch(); }
  catch (e) { console.log(`  - DK-10…DK-17 SKIPPED: Clear Glass's engine (${eng.kind}) could not start (${e.message.split('\n')[0]})`); skipped += 8; return done(); }
  console.log(`  · driven by Clear Glass (clear-glass/src/driver/glass.js), engine: ${eng.kind}`);
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(harness()).href);
    await page.evaluate(() => { try { localStorage.removeItem('idearium.dock.open'); localStorage.removeItem('idearium.dock.folded'); } catch (_) {} DOCK.open.clear(); DOCK.folded.clear(); planTabSync(); });
    await page.waitForSelector('#dock-rail .dk-tab[data-dock="outputs"]');
    const opened = () => page.$$eval('#dock-col .dk-panel', els => els.map(e => e.dataset.dock));

    await test('DK-10', 'the rail: the Plan\'s tab and one tab per panel; the Plan\'s own pull tab is hidden (one rail)', async () => {
      assert.deepStrictEqual(await page.$$eval('#dock-rail .dk-tab', els => els.map(e => e.dataset.dock)), ['plan', 'outputs', 'changes', 'tasks', 'context', 'tools']);
      assert.strictEqual(await page.evaluate(() => { const t = document.getElementById('plan-tab'); return !t || t.hidden; }), true);
      assert.strictEqual(await page.evaluate(() => document.getElementById('dock-col').hidden), true, 'none open: no column');
    });
    await test('DK-11', 'each panel opens alone; all opens every one; none closes every one', async () => {
      await page.click('#dock-rail .dk-tab[data-dock="changes"]');
      await page.waitForSelector('#dock-col .dk-panel[data-dock="changes"]');
      assert.deepStrictEqual(await opened(), ['changes']);
      await page.click('#dock-rail .dk-all:has-text("all")');
      await page.waitForSelector('#dock-col .dk-panel[data-dock="tools"]');
      assert.deepStrictEqual(await opened(), ['outputs', 'changes', 'tasks', 'context', 'tools']);
      assert.strictEqual(await page.$$eval('#dock-rail .dk-tab.on', e => e.length), 5);
      await page.click('#dock-rail .dk-all:has-text("none")');
      assert.deepStrictEqual(await opened(), []);
      assert.strictEqual(await page.evaluate(() => DOCK.open.size), 0);
      // remembered per browser where the page has storage (a file:// page in this engine may not keep any: then it is not asserted)
      const kept = await page.evaluate(() => { try { return localStorage.getItem('idearium.dock.open'); } catch (_) { return null; } });
      if (kept != null) assert.deepStrictEqual(JSON.parse(kept), []);
    });
    await test('DK-12', 'a panel folds and unfolds on its own; closing one leaves the others', async () => {
      await page.evaluate(() => { dockToggle('outputs', true); dockToggle('changes', true); dockToggle('context', true); });
      await page.waitForSelector('#dock-col .dk-panel[data-dock="context"] .pp-ctx-h');
      await page.click('#dock-col .dk-panel[data-dock="changes"] .dk-fold');
      assert.ok(await page.$eval('#dock-col .dk-panel[data-dock="changes"]', e => e.classList.contains('folded') && !e.querySelector('.dk-body')));
      assert.ok(await page.$('#dock-col .dk-panel[data-dock="outputs"] .dk-body'), 'the others stay open');
      await page.click('#dock-col .dk-panel[data-dock="changes"] .dk-fold');
      assert.ok(await page.$('#dock-col .dk-panel[data-dock="changes"] .dk-body'));
      await page.click('#dock-col .dk-panel[data-dock="context"] .dk-x[title="close this panel"]');
      assert.deepStrictEqual(await opened(), ['outputs', 'changes']);
    });
    await test('DK-13', 'outputs: the proposals as diff cards with Apply / Reject, and the artifacts, said as not repo-scoped', async () => {
      await page.waitForSelector('#dock-col .dk-panel[data-dock="outputs"] .ws-card');
      assert.deepStrictEqual(await page.$$eval('#dock-col [data-dock="outputs"] .ws-card', e => e.map(x => x.dataset.path)), ['src/a.js']);
      assert.strictEqual(await page.$$eval('#dock-col [data-dock="outputs"] .ws-head .ws-act-apply', e => e.length), 1);
      assert.strictEqual(await page.$$eval('#dock-col [data-dock="outputs"] .ws-head .ws-act-reject', e => e.length), 1);
      const t = await page.textContent('#dock-col .dk-panel[data-dock="outputs"]');
      assert.ok(/notes\.js/.test(t) && /not only this repo/.test(t) && /src\/old\.js/.test(t), t);
      assert.ok(/1/.test(await page.textContent('#dock-rail .dk-tab[data-dock="outputs"] .dk-n')), 'the rail counts what waits');
    });
    await test('DK-14', 'changes: the workspace files by state and the change records', async () => {
      const t = await page.textContent('#dock-col .dk-panel[data-dock="changes"]');
      assert.ok(/1 modified · 1 new/.test(t) && /v1abcdef12/.test(t), t);
      assert.ok(/src\/z\.js/.test(t) && !/src\/k\.js/.test(t), 'committed files are not changes');
      assert.ok(/make a return b/.test(t) && /the_builder/.test(t), 'the record says who and why');
    });
    await test('DK-15', 'tasks in real time: an idearium.repo.task event repaints the panel and the rail with no fetch', async () => {
      await page.evaluate(() => dockToggle('tasks', true));
      await page.waitForSelector('#dock-col .dk-panel[data-dock="tasks"] .rt-list');
      const n0 = await page.evaluate(() => CALLS.length);
      await page.evaluate(() => { const p = { repoUuid: 'r1', task: { id: 't2', title: 'review src/a.js', status: 'running', startedAt: 9, steps: [] } }; rtIn(p); dockTaskIn(p); });
      assert.ok(/review src\/a\.js/.test(await page.textContent('#dock-col .dk-panel[data-dock="tasks"]')));
      assert.strictEqual(await page.evaluate(() => CALLS.length), n0, 'nothing was fetched');
      assert.ok(await page.$('#dock-rail .dk-tab[data-dock="tasks"] .dk-dot'), 'the rail blinks while a task runs');
    });
    await test('DK-16', 'tools: a button opens its arguments; run goes through the route; a procedure replays; one call is kept', async () => {
      await page.evaluate(() => dockToggle('tools', true));
      await page.waitForSelector('#dock-col .dk-panel[data-dock="tools"] .dk-tool');
      assert.ok(await page.$eval('#dock-col .dk-tool.off', e => e.disabled), 'a tool outside the scope cannot be pressed');
      await page.click('#dock-col .dk-tool:has-text("code_read")');
      await page.waitForSelector('#dk-tool-args');
      assert.deepStrictEqual(JSON.parse(await page.$eval('#dk-tool-args', e => e.value)), { path: '' });
      await page.fill('#dk-tool-args', '{"path":"README.md"}');
      await page.click('#dock-col .dk-run .action-btn:has-text("run")');
      await page.waitForSelector('#dock-col .dk-out');
      assert.ok(/# hello/.test(await page.textContent('#dock-col .dk-out')));
      const sent = await page.evaluate(() => CALLS.filter(c => /\/agent\/tools\/run$/.test(c.p)).pop().body);
      assert.deepStrictEqual(sent, { name: 'idearium.code_read.tool', args: { path: 'README.md' } });
      await page.click('#dock-col .dk-proc .action-btn:has-text("replay")');
      await page.waitForFunction(() => /1 run\b/.test(document.querySelector('#dock-col .dk-proc').textContent));
      assert.ok(await page.evaluate(() => CALLS.some(c => /\/procedures\/proc-1\/replay$/.test(c.p) && c.method === 'POST')));
      await page.click('#dock-col .dk-run .action-btn:has-text("keep as procedure")');
      await page.waitForFunction(() => document.querySelectorAll('#dock-col .dk-proc').length === 2);
      const kept = await page.evaluate(() => CALLS.filter(c => /\/procedures$/.test(c.p) && c.method === 'POST').pop().body);
      assert.deepStrictEqual(kept, { name: 'kept one', steps: [{ tool: 'idearium.code_read.tool', args: { path: 'README.md' } }] });
    });
    await test('DK-17', 'an event for another repo changes nothing; an inject event reloads only the open panels it concerns', async () => {
      await page.evaluate(() => { dockToggle('context', false); });
      const before = await page.evaluate(() => CALLS.length);
      await page.evaluate(() => dockOnEvent({ type: 'idearium.repo.inject.proposed', payload: { repoUuid: 'other' } }));
      await page.waitForTimeout(800);
      assert.strictEqual(await page.evaluate(() => CALLS.length), before, 'another repo: no fetch');
      await page.evaluate(() => dockOnEvent({ type: 'idearium.repo.inject.proposed', payload: { repoUuid: 'r1' } }));
      await page.waitForTimeout(900);
      const paths = await page.evaluate((n) => CALLS.slice(n).map(c => c.p), before);
      assert.ok(paths.some(p => p.endsWith('/worksurface')) && paths.some(p => p.endsWith('/files/state')), paths.join(' '));
      assert.ok(!paths.some(p => p.endsWith('/plan')), 'context is closed: not read');
      assert.deepStrictEqual(errors, []);
    });
  } finally { await browser.close(); }
  done();
})();
function done() { console.log(`\n  ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`); process.exit(failed ? 1 : 0); }
