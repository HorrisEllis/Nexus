'use strict';
/**
 * tests/modules/test-plan-pieces.test.js — PP1–PP4 (docs/2026-10-16-code-tab-rebuild-phasemap.spec addendum (e)), 0.60.123.
 * James, 2026-10-17: "look at the plan panel, can you integrate it with the rest of the new panels? like this should be
 * the plan panel (second image) each chunk/dependancy a piece of the progress indication. progress shows for each task
 * with a full run history, and log to make it explicit. like the panels should remain interconnected. so strip the
 * context from the plan panel since we have a dedicated one now."
 *
 *   PP-01  build-plan.js piecesOf / historyOf, pure: a piece per planned file with what it uses; a chunk replied → written,
 *          failed → failed with why, attempts and agent; a whole-phase attempt marks what it wrote and what it left out;
 *          a proven proof after the write → proven; a complete phase → done; an open run → running; no files → one
 *          '(whole phase)' piece; the history groups -review / -proof with their run, newest first, cut and said
 *   PP-02  the Plan panel, driven in Clear Glass on a real buildPlan: each task's bar is its pieces (a segment per piece,
 *          its state as a class, k/n proven); expanded, the pieces and every run with its log; no Context card
 *   PP-03  interconnected: a piece points the dock's Changes and Outputs at its file (said, cleared with "show all"); a
 *          run's context button opens the dock's Context on that run
 *   PP-04  the repo.plan command row (agents get the same view through nexus.command)
 * No engine on the machine: the browser part is SKIPPED, said, never passed.
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '../..');
const UI = path.join(ROOT, 'idearium', 'ui');

let passed = 0, failed = 0, skipped = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}
function done() { console.log(`\n  ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`); process.exit(failed ? 1 : 0); }

const T0 = Date.now() - 3600 * 1000;
const PLAN = { files: [{ path: 'src/a.js', imports: [] }, { path: 'src/b.js', imports: ['./a.js'] }, { path: 'src/c.js', imports: [] }] };
// one phase, two runs: run-1 wrote a, failed b, proved; run-2 (open) is on c
const ROWS = [
  { runId: 'run-1', map: 'm', phase: 'KE1', state: 'building', ts: T0 + 1 },
  { runId: 'run-1', map: 'm', phase: 'KE1', state: 'planned', ts: T0 + 2, plan: PLAN },
  { runId: 'run-1', map: 'm', phase: 'KE1', state: 'replied', ts: T0 + 3, file: 'src/a.js', provider: 'ollama', rung: 1, attempt: 1, injects: { injected: ['src/a.js'] } },
  { runId: 'run-1', map: 'm', phase: 'KE1', state: 'failed', ts: T0 + 4, file: 'src/b.js', provider: 'claude-code', error: 'missing export run' },
  { runId: 'run-1-review', map: 'm', phase: 'KE1', state: 'reviewed', ts: T0 + 5, reviewer: 'chatgpt' },
  { runId: 'run-1-proof', map: 'm', phase: 'KE1', state: 'proven', ts: T0 + 6 },
  { runId: 'run-2', map: 'm', phase: 'KE1', state: 'building', ts: T0 + 10, context: { parts: [{ id: 'request', label: 'phase request', tokens: 700, share: 1 }], used: 700, window: 8192, free: 7492, pct: 8.5, method: 'estimate-v1' } },
];

function harness(planJson) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-ui-'));
  const html = fs.readFileSync(path.join(UI, 'index.html'), 'utf8');
  const inline = (html.match(/<style>[\s\S]*?<\/style>/g) || []).join('\n');
  const css = ['work-surface.css', 'code-surface.css'].map(f => { try { return fs.readFileSync(path.join(UI, 'css', f), 'utf8'); } catch (_) { return ''; } }).join('\n');
  const src = (f) => pathToFileURL(path.join(UI, 'js', f)).href;
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style>${inline}</head><body>
<button class="repo-subtab-btn" id="sub-code">Code</button>
<div id="repo-subtab-code" style="height:600px"></div>
<script>
  const CALLS = [];
  const REPO = { uuid: 'r1', name: 'core', files: [{ path: 'src/a.js' }] };
  let API_REPOS = [REPO];
  let CURRENT_API_REPO = REPO, CURRENT_REPO_SUBTAB = 'code', ACTIVE_API_FILE = null, API_FILE_DIRTY = false;
  function setRepoSubtab(n) { CURRENT_REPO_SUBTAB = n; }
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  function toast() {}
  const PLAN = ${JSON.stringify(planJson)};
  async function api(p, opts) {
    CALLS.push(p);
    if (/\\/plan(\\?|$)/.test(p)) return PLAN;
    if (p.endsWith('/worksurface')) return { files: [
      { id: 'i1', path: 'src/a.js', op: 'write', status: 'proposed', added: 1, removed: 0, diff: '@@ -0,0 +1 @@\\n+a', actions: ['apply', 'reject'] },
      { id: 'i2', path: 'src/c.js', op: 'write', status: 'proposed', added: 1, removed: 0, diff: '@@ -0,0 +1 @@\\n+c', actions: ['apply', 'reject'] }], totals: {} };
    if (p.includes('/artifacts')) return { repoScoped: false, artifacts: [] };
    if (p.endsWith('/files/state')) return { states: { 'src/a.js': { state: 'modified' }, 'src/c.js': { state: 'new' } }, counts: { modified: 1, new: 1 }, version: 'v1' };
    if (p.includes('/changes')) return { changes: [{ id: 'i1', path: 'src/a.js', op: 'write', status: 'proposed', at: 2, agent: 'ollama', goal: 'a' }, { id: 'i2', path: 'src/c.js', op: 'write', status: 'proposed', at: 3, agent: 'ollama', goal: 'c' }] };
    if (p.includes('/injects?status=proposed')) return { injects: [] };
    if (p.endsWith('/surface')) return { open: null };
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
  const BP = await import(pathToFileURL(path.join(ROOT, 'idearium/repo/build-plan.js')).href);

  await test('PP-01', 'piecesOf / historyOf: a piece per planned file, its state, attempts, agent, uses; whole phase; history by run', async () => {
    const closed = ROWS.slice(0, 6);   // run-1 only: final (proven)
    const a = BP.piecesOf({ phase_key: 'KE1', status: 'active' }, closed);
    assert.strictEqual(a.from, 'the plan');
    assert.deepStrictEqual(a.pieces.map(p => [p.path, p.state]), [['src/a.js', 'proven'], ['src/b.js', 'failed'], ['src/c.js', 'pending']]);
    const b = a.pieces[1];
    assert.deepStrictEqual([b.attempts, b.agent, b.why], [1, 'claude-code', 'missing export run']);
    assert.deepStrictEqual(b.uses, ['src/a.js'], 'what it imports among the pieces');
    assert.strictEqual(a.open, false);
    // the open run: what has not landed is running (a failure from an earlier run is retried in it)
    const o = BP.piecesOf({ phase_key: 'KE1', status: 'active' }, ROWS);
    assert.strictEqual(o.open, true);
    assert.deepStrictEqual(o.pieces.map(p => p.state), ['proven', 'running', 'running']);
    // complete phase → done; a written-but-unproven piece stays written until then
    assert.ok(BP.piecesOf({ status: 'complete' }, closed).pieces.every(p => p.state === 'done' || p.state === 'proven'));
    const unproven = BP.piecesOf({ status: 'active' }, ROWS.slice(0, 4));
    assert.strictEqual(unproven.pieces[0].state, 'written');
    // a whole-phase attempt: what it wrote, what it left out
    const w = BP.piecesOf({ status: 'active', files: ['lib/x.js', 'lib/y.js (new)'] }, [
      { runId: 'r', state: 'replied', ts: 1, provider: 'chatgpt', injects: { injected: ['lib/x.js'] }, absent: ['lib/y.js'] }, { runId: 'r', state: 'proven', ts: 2 }]);
    assert.strictEqual(w.from, 'the phase\'s files');
    assert.deepStrictEqual(w.pieces.map(p => [p.path, p.state, p.attempts]), [['lib/x.js', 'written', 1], ['lib/y.js', 'failed', 1]]);
    // nothing named: one piece for the whole phase
    const z = BP.piecesOf({ status: 'active' }, [{ runId: 'r', state: 'replied', ts: 1, provider: 'ollama', injects: { injected: ['q.js'] } }, { runId: 'r', state: 'proven', ts: 2 }]);
    assert.deepStrictEqual([z.from, z.pieces.map(p => [p.path, p.state])], ['whole', [['(whole phase)', 'written']]]);
    assert.deepStrictEqual(BP.piecesOf({}, []).pieces.map(p => p.state), ['pending']);
    // the history
    const h = BP.historyOf(ROWS);
    assert.deepStrictEqual(h.runs.map(r => r.runId), ['run-2', 'run-1'], 'newest first; -review / -proof with their run');
    const r1 = h.runs[1];
    assert.deepStrictEqual([r1.end, r1.total, r1.agents], ['proven', 6, ['ollama', 'claude-code', 'chatgpt']]);
    assert.deepStrictEqual(r1.log.map(l => l.part), [null, null, null, null, 'review', 'proof']);
    assert.strictEqual(r1.log[2].note, 'wrote src/a.js');
    assert.strictEqual(r1.log[3].note, 'missing export run');
    const many = BP.historyOf(Array.from({ length: 5 }, (_, i) => ({ runId: `x${i}`, state: 'failed', ts: i })).concat(Array.from({ length: 4 }, (_, i) => ({ runId: 'x4', state: 'retrying', ts: 10 + i }))), { maxRuns: 3, maxRows: 2 });
    assert.deepStrictEqual([many.runs.length, many.more, many.runs[0].runId, many.runs[0].cut, many.runs[0].log.length], [3, 2, 'x4', 3, 2]);
    // buildPlan carries them on the step
    const plan = BP.buildPlan({ phases: [{ phase_key: 'KE1', map: 'm', title: 'KE1 io', status: 'active' }], runs: ROWS, rows: ROWS });
    const s = plan.steps[0];
    assert.deepStrictEqual([s.pieces.length, s.piecesFrom, s.open, s.history.runs.length], [3, 'the plan', true, 2]);
  });

  await test('PP-04', 'the repo.plan command row: agents read the pieces and the log through nexus.command', async () => {
    const RC = await import(pathToFileURL(path.join(ROOT, 'idearium/cli/route-commands.js')).href);
    const row = RC.SPEC.find(r => r.key === 'repo.plan');
    assert.ok(row, 'repo.plan is a row');
    assert.deepStrictEqual(row.req({ repo: { uuid: 'u1' }, args: [], flags: {} }), { method: 'GET', path: '/api/repos/u1/plan' });
    const plan = BP.buildPlan({ phases: [{ phase_key: 'KE1', map: 'm', title: 'KE1 io', status: 'active' }], runs: ROWS, rows: ROWS });
    const out = []; const l = console.log; console.log = (x) => out.push(String(x));
    const id = (x) => x;
    try { row.print(plan, { args: ['KE1'], flags: {} }, { c: { dim: id, mint: id, amber: id } }); } finally { console.log = l; }
    const t = out.join('\n');
    assert.ok(/KE1\s+✓◌◌\s+1\/3 pieces/.test(t), t);
    assert.ok(/src\/b\.js · running · 1 attempt\(s\) · claude-code · uses src\/a\.js · missing export run/.test(t), t);
    assert.ok(/run run-1 .* proven · ollama, claude-code, chatgpt/.test(t) && /proof proven/.test(t), t);
  });

  const glass = require('../../clear-glass/src/driver/glass.js');
  const eng = glass.engine();
  if (!eng) { console.log('  - PP-02, PP-03 SKIPPED: Clear Glass has no engine here (no Electron binary, no Chromium) — the browser checks did not run'); skipped += 2; return done(); }
  let browser;
  try { browser = await glass.chromium.launch(); }
  catch (e) { console.log(`  - PP-02, PP-03 SKIPPED: Clear Glass's engine (${eng.kind}) could not start (${e.message.split('\n')[0]})`); skipped += 2; return done(); }
  console.log(`  · driven by Clear Glass (clear-glass/src/driver/glass.js), engine: ${eng.kind}`);
  const plan = BP.buildPlan({ phases: [{ phase_key: 'KE1', map: 'm', title: 'KE1 io', status: 'active' }, { phase_key: 'KE2', map: 'm', title: 'KE2 next', status: 'not-started' }], runs: ROWS, rows: ROWS });
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(harness(plan)).href);
    await page.evaluate(() => { try { localStorage.clear(); } catch (_) {} DOCK.open.clear(); openPlanPanel(); });
    await page.waitForSelector('#pp-body .pp-pieces');

    await test('PP-02', 'each task\'s bar is its pieces; expanded: the pieces and every run with its log; no Context card', async () => {
      assert.deepStrictEqual(await page.$$eval('#pp-body > .pp-card', els => els.map(e => e.dataset.card)), ['progress', 'plan']);
      assert.deepStrictEqual(await page.$$eval('#pp-body .pp-pieces', els => els.map(e => e.children.length)), [3, 1], 'KE1 three pieces; KE2 the whole phase');
      const cls = await page.$$eval('#pp-body .pp-pieces', els => [...els[0].children].map(c => c.className));
      assert.deepStrictEqual(cls, ['pp-pc st-proven', 'pp-pc st-running', 'pp-pc st-running']);
      assert.strictEqual(await page.$eval('#pp-body .pp-pcount', e => e.textContent), '1/3');
      assert.ok(await page.$eval('#pp-body .pp-pieces', e => e.classList.contains('live')), 'an open run: the bar is live');
      assert.ok(/uses src\/a\.js/.test(await page.$eval('#pp-body .pp-pieces .pp-pc:nth-child(2)', e => e.title)));
      await page.evaluate(() => planToggle('m::KE1'));
      await page.waitForSelector('#pp-body .pp-pcrow');
      assert.strictEqual(await page.$$eval('#pp-body .pp-pcrow', e => e.length), 3);
      assert.deepStrictEqual(await page.$$eval('#pp-body .pp-run', els => els.map(e => e.open)), [true, false], 'the open run is unfolded');
      const logs = await page.$$eval('#pp-body .pp-run', els => els.map(e => e.querySelectorAll('.pp-log-r').length));
      assert.deepStrictEqual(logs, [1, 6]);
      const t = await page.$$eval('#pp-body .pp-run', els => els[1].textContent);
      assert.ok(/review · reviewed/.test(t) && /proof · proven/.test(t) && /missing export run/.test(t) && /ollama → claude-code → chatgpt/.test(t), t);
    });

    await test('PP-03', 'a piece points Changes and Outputs at its file; "show all" clears; a run\'s context opens the dock on it', async () => {
      await page.click('#pp-body .pp-pcrow:nth-child(3)');   // src/c.js
      await page.waitForSelector('#dock-col .dk-panel[data-dock="changes"] .dk-focus');
      await page.waitForSelector('#dock-col .dk-panel[data-dock="outputs"] .ws-card');
      assert.deepStrictEqual(await page.evaluate(() => DOCK.focus), { file: 'src/c.js', runId: null, phase: 'KE1' });
      const [pp, dc] = await page.evaluate(() => ['plan-panel', 'dock-col'].map(id => document.getElementById(id).getBoundingClientRect()).map(r => [r.left, r.right]));
      assert.ok(pp[1] <= dc[0], `the Plan panel sits beside the dock, not over it (plan ${pp}, dock ${dc})`);
      assert.deepStrictEqual(await page.$$eval('#dock-col [data-dock="outputs"] .ws-card', e => e.map(x => x.dataset.path)), ['src/c.js'], 'only its file');
      const ch = await page.textContent('#dock-col .dk-panel[data-dock="changes"]');
      assert.ok(/from the Plan: src\/c\.js · KE1/.test(ch) && !/src\/a\.js/.test(ch), ch);
      await page.click('#dock-col .dk-panel[data-dock="outputs"] .dk-focus a');
      assert.strictEqual(await page.evaluate(() => DOCK.focus), null);
      assert.deepStrictEqual(await page.$$eval('#dock-col [data-dock="outputs"] .ws-card', e => e.map(x => x.dataset.path)), ['src/a.js', 'src/c.js'], 'all again');
      await page.click('#pp-body .pp-run:first-of-type .pp-runctx');
      await page.waitForSelector('#dock-col .dk-panel[data-dock="context"] .pp-ctx-h');
      const cx = await page.textContent('#dock-col .dk-panel[data-dock="context"]');
      assert.ok(/from the Plan: run run-2/.test(cx) && /8\.5% used/.test(cx), cx);
      assert.ok(await page.$('#dock-col .dk-panel[data-dock="context"] .pp-runctx'), 'the way back: "in the Plan"');
      assert.deepStrictEqual(errors, [], 'no page errors');
    });
  } finally { await browser.close(); }
  done();
})();
