'use strict';
/**
 * tests/modules/test-plan-sidebar.test.js — PS1–PS3 (docs/2026-10-16-plan-sidebar-phasemap.spec), 0.60.107.
 * James: "Can you make something like the sidebar, for contexT? can you strip the plan panel to just the plan with
 * context, and progress? make the rest theyre own panel? and remove what is creating clutter"
 *
 *   PS-01  lib/economy/tokens.js breakdown: each part's tokens and share, used, free, % of the window; no window → null
 *          (said, not guessed); empty parts left out
 *   PS-02  the build records it: _phaseBuild puts `context` on the 'building' row; buildPlan passes it to the step's ledger
 *   PS-03  the Plan panel, driven in Clear Glass: two cards (Progress, Plan) — 0.60.123 PP4, James: "strip the context
 *          from the plan panel since we have a dedicated one now" (it was three, with Context, at 0.60.107); the context
 *          card's content is still checked, as the dock's Context panel draws it (_ppContext): "x% used", a bar and one
 *          row per part, for the phase building now; the proposals are one line; no work surface, no activity section,
 *          no charter editor, no jobs, no agents in the panel; a fold is remembered
 *   PS-04  what left is its own panel: charter, agents (with the repo's lessons) and jobs in the Code tab's bottom bar;
 *          the activity views open there (rtToggleDrawer)
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

function harness() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-ui-'));
  const html = fs.readFileSync(path.join(UI, 'index.html'), 'utf8');
  const inline = (html.match(/<style>[\s\S]*?<\/style>/g) || []).join('\n');   // the panel's own CSS lives in index.html
  const css = ['work-surface.css', 'code-surface.css'].map(f => fs.readFileSync(path.join(UI, 'css', f), 'utf8')).join('\n');
  const src = (f) => pathToFileURL(path.join(UI, 'js', f)).href;
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style>${inline}</head><body>
<div id="repo-subtab-code" style="height:600px"></div>
<script>
  const CALLS = [];
  const REPO = { uuid: 'r1', name: 'core', files: [{ path: 'src/a.js' }] };
  let API_REPOS = [REPO];
  let CURRENT_API_REPO = REPO, CURRENT_REPO_SUBTAB = 'phases', ACTIVE_API_FILE = null, API_FILE_DIRTY = false;
  function setRepoSubtab(n) { CURRENT_REPO_SUBTAB = n; }
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  function toast() {}
  const NOW = Date.now();
  const CTX = { parts: [{ id: 'request', label: 'phase request', tokens: 1200, share: 0.4 }, { id: 'mapped', label: 'mapped files', tokens: 900, share: 0.3 },
    { id: 'charter', label: 'charter', tokens: 300, share: 0.1 }, { id: 'lessons', label: 'lessons (went wrong before)', tokens: 600, share: 0.2 }], used: 3000, window: 16384, free: 13384, pct: 18.3, method: 'estimate-v1' };
  const PLAN = { summary: { total: 3, complete: 1, building: 1, failed: 0, progress: 0.33 },
    charter: { axioms: ['nothing lost'], endState: ['the hats route'], latest: { met: 1, total: 2, ts: NOW - 60000, results: [] } },
    steps: [
      { key: 'IH0', map: 'docs/ih-phasemap.spec', title: 'IH0 schema', status: 'complete', gates: [], runs: 1, ledger: [{ ts: NOW - 900000, state: 'proven', context: { ...CTX, used: 10, pct: 0.1, parts: [{ id: 'request', label: 'phase request', tokens: 10, share: 1 }] } }] },
      { key: 'IH1', map: 'docs/ih-phasemap.spec', title: 'IH1 intent nodes point at hats', status: 'active', current: true, gates: [], runs: 1, run: { runId: 'run-1' }, ledger: [{ ts: NOW - 5000, state: 'building', provider: 'ollama', context: CTX }] },
      { key: 'IH2', map: 'docs/ih-phasemap.spec', title: 'IH2 next', status: 'not-started', gates: [], runs: 0, ledger: [] },
    ] };
  async function api(p, opts) {
    CALLS.push(p);
    if (/\\/plan(\\?|$)/.test(p)) return PLAN;
    if (p.endsWith('/phases/runs')) return { runs: [{ runId: 'f1', phase: 'DEBUG', map: 'file:src/a.js', state: 'replied', ts: NOW - 5000, title: 'debug src/a.js' }] };
    if (p.includes('/injects?status=proposed')) return { injects: [{ uuid: 'i1' }, { uuid: 'i2' }, { uuid: 'i3' }] };
    if (p === '/api/routing/agents') return { providers: { ollama: { provider: 'ollama', score: 0.7, attempts: 4, landed: 3, proven: 2, undone: 1, failed: 1, byClass: {} } }, unassigned: [], learn: true };
    if (p.includes('/lessons')) return { faults: [{ ts: NOW - 1000, mode: 'gutted', phase: 'IH1', meta: { path: 'lib/hat-seed.js', why: '290 → 29 lines, losing 6 declaration(s)', diagnosis: 'I sent only the part I changed' } }] };
    if (p.endsWith('/surface')) return { open: null };
    if (p.endsWith('/worksurface')) return { files: [], totals: {} };
    if (p.includes('/code/overview')) return { files: 1, chunks: 1, lines: 3, languages: ['js'], repo: { writeMode: 'propose', pendingProposals: 3 } };
    return {};
  }
</script>
<script src="${src('work-surface.js')}"></script>
<script src="${src('code-surface.js')}"></script>
<script src="${src('code-tab-panels.js')}"></script>
<script src="${src('repo-tasks.js')}"></script>
<script src="${src('plan-panel.js')}"></script>
</body></html>`);
  return path.join(dir, 'index.html');
}

(async () => {
  const T = require(path.join(ROOT, 'lib/economy/tokens.js'));
  await test('PS-01', 'tokens.breakdown: tokens and share per part, used, free, % of the window; no window → null; empty parts out', async () => {
    const b = T.breakdown([{ id: 'request', label: 'phase request', text: 'build the router' }, { id: 'lessons', tokens: 30 }, { id: 'note', text: '' }], 1000);
    assert.deepStrictEqual(b.parts.map(p => p.id), ['request', 'lessons'], 'an empty part is left out');
    assert.strictEqual(b.used, b.parts[0].tokens + 30);
    assert.deepStrictEqual([b.window, b.free, b.pct], [1000, 1000 - b.used, Math.round((b.used / 1000) * 1000) / 10]);
    assert.ok(Math.abs(b.parts.reduce((a, p) => a + p.share, 0) - 1) < 0.01);
    const n = T.breakdown([{ id: 'a', tokens: 5 }]);
    assert.deepStrictEqual([n.window, n.free, n.pct], [null, null, null], 'no window: said as unknown');
  });

  await test('PS-02', 'the build records it: context on the building row; buildPlan passes it to the step ledger', async () => {
    const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    assert.ok(/state: 'building', snapshot: commitId, statusNote, promptChars: message\.length,\s*context: _contextOf\(rungs\[0\] && rungs\[0\]\.base\)/.test(api));
    assert.ok(/id: 'request'[\s\S]{0,200}id: 'mapped'[\s\S]{0,200}id: 'charter'[\s\S]{0,200}id: 'lessons'[\s\S]{0,200}id: 'note'/.test(api), 'the five parts, as sent');
    const BP = await import(pathToFileURL(path.join(ROOT, 'idearium/repo/build-plan.js')).href);
    const ctx = { parts: [{ id: 'request', label: 'phase request', tokens: 9, share: 1 }], used: 9, window: null, free: null, pct: null };
    const plan = BP.buildPlan({ phases: [{ phase_key: 'P1', map: 'm', title: 'one', status: 'active' }], runs: [{ map: 'm', phase: 'P1', runId: 'r', state: 'building', ts: Date.now(), context: ctx }] });
    assert.deepStrictEqual(plan.steps[0].ledger[0].context, ctx);
  });

  const glass = require('../../clear-glass/src/driver/glass.js');
  const eng = glass.engine();
  if (!eng) { console.log('  - PS-03, PS-04 SKIPPED: Clear Glass has no engine here (no Electron binary, no Chromium) — the browser checks did not run'); skipped += 2; return done(); }
  let browser;
  try { browser = await glass.chromium.launch(); }
  catch (e) { console.log(`  - PS-03, PS-04 SKIPPED: Clear Glass's engine (${eng.kind}) could not start (${e.message.split('\n')[0]})`); skipped += 2; return done(); }
  console.log(`  · driven by Clear Glass (clear-glass/src/driver/glass.js), engine: ${eng.kind}`);
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(harness()).href);
    // §0.60.158 — the page reads its saved state at load (before 0.60.158 Clear Glass's host shared one profile across runs, so
    // another test's state arrived here; each launch has its own now). Kept as a guard: what the page restored is reset with the clear
    await page.evaluate(() => { try { localStorage.clear(); } catch (_) {} if (typeof RT_VIEW !== 'undefined') RT_VIEW = 'tasks'; if (typeof CX !== 'undefined') CX.panel = 'activity'; openPlanPanel(); });
    await page.waitForSelector('#pp-body .pp-card[data-card="plan"]');
    // the Context card's content, as the dock's Context panel draws it (0.60.123 PP4: not in the Plan panel any more)
    await page.evaluate(() => { const d = document.createElement('div'); d.id = 'ctx-probe'; d.innerHTML = _ppContext(PLAN.steps); document.body.appendChild(d); });

    await test('PS-03', 'two cards (Progress, Plan) — the Context card is the dock\'s now (0.60.123 PP4); its content still like the sidebar; the rest gone from the panel; folds remembered', async () => {
      assert.deepStrictEqual(await page.$$eval('#pp-body > .pp-card', els => els.map(e => e.dataset.card)), ['progress', 'plan']);
      assert.strictEqual(await page.$('#pp-body .pp-ctx-row'), null, 'no context rows in the Plan panel');
      const ctx = await page.$eval('#ctx-probe', e => e.textContent);
      assert.ok(/18\.3% used/.test(ctx) && /3\.0k \/ 16k/.test(ctx), ctx);
      assert.deepStrictEqual(await page.$$eval('#ctx-probe .pp-ctx-l', els => els.map(e => e.textContent)), ['phase request', 'mapped files', 'charter', 'lessons (went wrong before)', 'free']);
      assert.strictEqual(await page.$$eval('#ctx-probe .pp-ctx-bar span', els => els.length), 4);
      assert.ok(/building now · IH1 intent nodes point at hats · ollama/.test(ctx), 'the phase building now, not the last finished one');
      const prog = await page.$eval('.pp-card[data-card="progress"]', e => e.textContent);
      assert.ok(/1\/3 phases done/.test(prog) && /3 proposals waiting — open in Code › changes/.test(prog) && /end state 1\/2/.test(prog), prog);
      assert.ok(/IH1 intent nodes point at hats/.test(await page.$eval('.pp-card[data-card="plan"]', e => e.textContent)));
      for (const sel of ['#pp-ws', '#pp-log', '#pp-charter-text', '.pp-agents']) assert.strictEqual(await page.$(`#plan-panel ${sel}`), null, `${sel} is out of the Plan panel`);
      assert.ok(!/plans and file jobs/.test(await page.$eval('#pp-body', e => e.textContent)));
      await page.evaluate(() => ppFold('plan'));
      assert.ok(await page.$('.pp-card[data-card="plan"].folded'));
      await page.evaluate(() => _planPaint());
      assert.ok(await page.$('.pp-card[data-card="plan"].folded'), 'the fold survives a repaint');
      await page.evaluate(() => ppOpenChanges());
      assert.deepStrictEqual(await page.evaluate(() => [CURRENT_REPO_SUBTAB, CS.view]), ['code', 'changes']);
    });

    await test('PS-04', 'charter, agents (with lessons) and jobs are their own panels in the Code tab; activity opens there', async () => {
      await page.evaluate(() => { renderRepoCode(REPO); });
      await page.evaluate(() => cxPanel('charter'));
      await page.waitForFunction(() => !!document.querySelector('#cx-panel-body #pp-charter-text'));   // inside the folded charter <details>: present, not shown
      assert.ok(/end state 1\/2/.test(await page.$eval('#cx-panel-body', e => e.textContent)));
      await page.evaluate(() => cxPanel('jobs'));
      await page.waitForFunction(() => /debug src\/a\.js/.test((document.getElementById('cx-panel-body') || {}).textContent || ''));
      await page.evaluate(() => cxPanel('agents'));
      await page.waitForFunction(() => /gutted/.test((document.getElementById('cx-panel-body') || {}).textContent || ''));
      const ag = await page.$eval('#cx-panel-body', e => e.textContent);
      assert.ok(/ollama/.test(ag) && /it said: I sent only the part I changed/.test(ag), ag);
      await page.evaluate(() => { CURRENT_REPO_SUBTAB = 'phases'; rtToggleDrawer(true); });
      assert.deepStrictEqual(await page.evaluate(() => [CURRENT_REPO_SUBTAB, CX.panel]), ['code', 'tasks']);
      assert.deepStrictEqual(errors, [], 'no page errors');
    });
  } finally { await browser.close(); }
  done();
})();
