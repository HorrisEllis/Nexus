'use strict';
/**
 * tests/modules/test-phases-tab.test.js — RS10 (docs/2026-10-05-spec-workshop-rebuild-phasemap.spec), 0.50.0.
 * James: "okay now the phases with the spec workshop. needs to be rebuilt, enterprise grade. interconnected"
 *
 * Driven in Clear Glass: the REAL phases.js, plan-panel.js (the gate bar, the ledger, the Plan) and work-surface.js
 * (open in Code) against a stubbed api() that answers like idearium's routes.
 *   PT-01  the specs on the left (and the maps not from a spec); lanes by build order; current work first — complete
 *          folded into one line
 *   PT-02  a spec picked: only its phases; a moved block said, its phase's card stale (↻ on the block); the card shows its
 *          last run's model and rung and the Plan's gates; a block with no phase is named; a phase with no block says so
 *   PT-03  a phase opened: its block's own words from the spec, moved since planned; its files and the change waiting; its
 *          runs as the Plan's ledger; "open in the Plan" opens it on that run
 *   PT-04  a file opens in the Code tab; ▶ builds (POST …/phases/build); the fold shows the complete ones; nothing threw
 * No engine on the machine: the browser part is SKIPPED, said, never passed.
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');
const UI = path.join(ROOT, 'idearium', 'ui');

let passed = 0, failed = 0, skipped = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e.message}`); failed++; }
}

function harness() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-ui-'));
  const idx = fs.readFileSync(path.join(UI, 'index.html'), 'utf8');
  const css = idx.split('\n').filter(l => /^\s*(\.ph-|\.pp-|#plan-panel)/.test(l)).join('\n') + '\n' + fs.readFileSync(path.join(UI, 'css', 'phases.css'), 'utf8');
  const src = (f) => pathToFileURL(path.join(UI, 'js', f)).href;
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
<button class="repo-subtab-btn">Phases</button>
<div id="repo-subtab-phases" style="height:900px"></div>
<script>
  const CALLS = [], OPENED = [];
  const REPO = { uuid: 'r1', name: 'shop', files: [{ path: 'spec/shop.spec' }, { path: 'spec/later.spec' }] };
  let CURRENT_API_REPO = REPO, CURRENT_REPO_SUBTAB = 'phases';
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  function toast() {}
  function setRepoSubtab(n) { OPENED.push(['subtab', n]); CURRENT_REPO_SUBTAB = n; }
  function csOpen(p) { OPENED.push(['code', p]); }
  const M = 'docs/shop-phasemap.spec', R = 'docs/roadmap-phasemap.spec';
  const ph = (o) => ({ map: M, line: 10, order: 0, layer: 0, depends_on: [], blocked_by: [], ready: false, runs: 0, lastRun: null, closes: [], files: [], systems: [], blocks: [], mine: true, ...o });
  const PHASES_DATA = { scope: { label: 'shop', source: 'repo' }, editVia: 'repo-layer', warnings: [],
    maps: [{ path: M, meta: { name: 'shop' }, summary: { total: 3 } }, { path: R, meta: { name: 'roadmap' }, summary: { total: 1 } }],
    phases: [
      ph({ uuid: 'u0', phase_key: 'SH0_schema', title: 'SH0 schema', name: 'the record', status: 'complete', layer: 0, order: 0, blocks: ['schema'] }),
      ph({ uuid: 'u1', phase_key: 'SH1_storage', title: 'SH1 storage', name: 'orders in JAA', status: 'active', layer: 1, order: 1, depends_on: ['u0'], blocks: ['storage'], files: ['lib/store.js'], runs: 2,
        lastRun: { runId: 'phrun-9', state: 'escalating', provider: 'ollama:q:7b', rung: 2, rungs: 3, ts: Date.now() } }),
      ph({ uuid: 'u2', phase_key: 'SH2_routes', title: 'SH2 routes', name: 'the routes', status: 'planned', layer: 2, order: 2, depends_on: ['u1'], blocked_by: ['u1'], blocks: [] }),
      ph({ uuid: 'u3', phase_key: 'R0_later', title: 'R0 later', name: 'something later', status: 'planned', map: R, layer: 0, order: 0, ready: true }),
    ],
    summary: { total: 4, complete: 1, active: 1, planned: 2, ready: 1, blocked: 1, maps: 2, runs: 2 } };
  const THREAD = { spec: { path: 'spec/shop.spec', format: 'yaml', blocks: [
      { id: 'meta', label: 'meta', line: 2, bookkeeping: true, planned: false, text: '  meta:\\n    name: shop\\n' },
      { id: 'schema', label: 'schema', line: 4, planned: true, stale: false, text: '  schema:\\n    record: an order\\n' },
      { id: 'storage', label: 'storage', line: 6, planned: true, stale: true, text: '  storage:\\n    store: orders in JAA, indexed by customer\\n' },
      { id: 'api', label: 'api', line: 8, planned: false, stale: false, text: '  api:\\n    routes: GET /orders\\n' }] },
    phases: [{ key: 'SH0_schema', map: M, stale: [], specMoved: false, files: [], changes: [] },
      { key: 'SH1_storage', map: M, stale: ['storage'], specMoved: false, files: ['lib/store.js'], changes: [{ inject: 'i1', path: 'lib/store.js', status: 'proposed', op: 'write' }] },
      { key: 'SH2_routes', map: M, stale: [], specMoved: false, files: [], changes: [] }],
    summary: { blocks: 3, planned: 2, unplanned: 1, staleBlocks: 1, phases: 3, linked: 2, unlinked: 1, broken: 0, stalePhases: 1, maps: 1 } };
  const PLAN = { summary: { total: 3, complete: 1, building: 1 }, steps: [{ map: M, key: 'SH1_storage', title: 'SH1 storage', current: true, gate: 'replied',
    gates: [{ gate: 'mapped', passed: true }, { gate: 'snapshot', passed: true }, { gate: 'dispatched', passed: true }, { gate: 'replied', passed: false }],
    ledger: [{ ts: Date.now() - 5000, state: 'failed', provider: 'ollama:q:3b', rung: 1, rungs: 3, toolErrors: true, error: '3 tool calls failed in a row' }, { ts: Date.now(), state: 'escalating', provider: 'ollama:q:7b', rung: 2, rungs: 3 }] }] };
  async function api(p, opts) {
    CALLS.push({ p, method: (opts && opts.method) || 'GET', body: opts && opts.body ? JSON.parse(opts.body) : null });
    if (p.endsWith('/phases')) return PHASES_DATA;
    if (p.endsWith('/thread')) return { specs: [{ path: 'spec/shop.spec', maps: [M] }, { path: 'spec/later.spec', maps: [] }] };
    if (p.includes('/thread?spec=')) return THREAD;
    if (p.endsWith('/plan')) return PLAN;
    if (p.includes('/phases/runs')) return { runs: [] };
    if (p.endsWith('/phases/build')) return { runId: 'phrun-10', snapshot: 'abc', targetName: 'shop' };
    if (p.endsWith('/worksurface')) return { files: [], totals: {} };
    return {};
  }
</script>
<script src="${src('plan-panel.js')}"></script>
<script src="${src('work-surface.js')}"></script>
<script src="${src('phases.js')}"></script>
</body></html>`);
  return path.join(dir, 'index.html');
}

(async () => {
  const glass = require('../../clear-glass/src/driver/glass.js');
  const eng = glass.engine();
  if (!eng) { console.log('  - PT-01…PT-04 SKIPPED: Clear Glass has no engine here — the browser checks did not run'); skipped += 4; return done(); }
  let browser;
  try { browser = await glass.chromium.launch(); }
  catch (e) { console.log(`  - PT-01…PT-04 SKIPPED: Clear Glass's engine (${eng.kind}) could not start (${e.message.split('\n')[0]})`); skipped += 4; return done(); }
  console.log(`  · driven by Clear Glass (clear-glass/src/driver/glass.js), engine: ${eng.kind}`);
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(harness()).href);
    await page.evaluate(() => { try { localStorage.removeItem('idearium.phases.showDone'); } catch (_) {} PHASES.showDone = false; return renderRepoPhases(REPO); });
    await page.waitForSelector('.ph2-lanes');

    await test('PT-01', 'specs on the left; lanes by build order; complete folded', async () => {
      const rail = await page.textContent('.ph2-rail');
      assert.ok(/every phasemap/.test(rail) && /shop\.spec/.test(rail) && /1\/3/.test(rail), rail);
      assert.ok(/specs not planned yet/.test(rail) && /later\.spec/.test(rail) && /⚡ plan/.test(rail), 'a spec with no map offers to plan it');
      assert.ok(/maps not from a spec/.test(rail) && /roadmap/.test(rail));
      const lanes = await page.$$eval('.ph2-lane', els => els.map(e => [e.querySelector('.ph2-lane-head').textContent, [...e.querySelectorAll('.ph2-card')].map(c => c.dataset.key)]));
      assert.deepStrictEqual(lanes.map(l => l[1]), [['R0_later'], ['SH1_storage'], ['SH2_routes']], JSON.stringify(lanes));
      assert.ok(/layer 0/.test(lanes[0][0]) && /layer 1/.test(lanes[1][0]));
      assert.ok(/✓ 1 complete — show/.test(await page.textContent('.ph2-fold')));
    });

    await test('PT-02', 'a spec picked: its phases only; the moved block on its card; model and rung; gates; unplanned and unlinked said', async () => {
      await page.click('.ph2-spec[title="spec/shop.spec"]');
      await page.waitForSelector('.ph2-note.warn');
      assert.deepStrictEqual(await page.$$eval('.ph2-card', e => e.map(x => x.dataset.key)), ['SH1_storage', 'SH2_routes']);
      assert.ok(/1 block moved since planned — 1 phase stale/.test(await page.textContent('.ph2-note.warn')));
      assert.ok(/blocks with no phase yet: api/.test(await page.textContent('.ph2-mid')));
      const sh1 = await page.$eval('.ph2-card[data-key="SH1_storage"]', e => ({ cls: e.className, text: e.textContent, gates: e.querySelectorAll('.pp-g').length, stale: !!e.querySelector('.ph2-block.stale') }));
      assert.ok(/stale/.test(sh1.cls) && sh1.stale && /↻ storage/.test(sh1.text), JSON.stringify(sh1));
      assert.ok(/escalating · ollama:q:7b \(2\/3\)/.test(sh1.text), sh1.text);
      assert.strictEqual(sh1.gates, 4, 'the Plan\'s gate bar on the card');
      assert.ok(/no link to its spec/.test(await page.textContent('.ph2-card[data-key="SH2_routes"]')));
      assert.ok(/3 blocks · 2 planned · 1 unplanned · 1 moved/.test(await page.textContent('.ph2-spec.on')));
    });

    await test('PT-03', 'a phase opened: its block\'s own words, moved; files and the change waiting; the Plan\'s ledger; open in the Plan', async () => {
      await page.click('.ph2-card[data-key="SH1_storage"] .ph-card-title');
      await page.waitForSelector('#ph-detail .ph2-blocktext');
      const d = await page.textContent('#ph-detail');
      assert.ok(/orders in JAA, indexed by customer/.test(d), 'the block\'s own text from the spec');
      assert.ok(/↻ moved since planned/.test(d));
      assert.ok(/from spec\/shop\.spec/.test(d));
      assert.ok(/lib\/store\.js/.test(d) && /write lib\/store\.js — proposed/.test(d), 'its file and the change waiting');
      assert.ok(/3 tool calls failed in a row/.test(d) && /escalating/.test(d), 'the Plan\'s ledger: the climb');
      assert.ok(/the ladder \(Settings → Routing\)/.test(d), 'no agent picked: it climbs the ladder');
      await page.click('#ph-detail button:has-text("open in the Plan")');
      await page.waitForSelector('#plan-panel.open');
      assert.strictEqual(await page.evaluate(() => PLANP.focus || 'focused-and-cleared'), 'focused-and-cleared');
      await page.evaluate(() => closePlanPanel());
    });

    await test('PT-04', 'a file opens in Code; ▶ builds; the fold shows the complete; nothing threw', async () => {
      await page.click('#ph-detail .ph2-file');
      await page.waitForFunction(() => OPENED.some(o => o[0] === 'code'));
      assert.deepStrictEqual(await page.evaluate(() => OPENED.slice(0, 2)), [['subtab', 'code'], ['code', 'lib/store.js']]);
      await page.evaluate(() => { CURRENT_REPO_SUBTAB = 'phases'; });
      await page.click('.ph2-card[data-key="SH1_storage"] .ph-quick');
      await page.waitForFunction(() => CALLS.some(c => /\/phases\/build$/.test(c.p)));
      assert.deepStrictEqual(await page.evaluate(() => CALLS.find(c => /\/phases\/build$/.test(c.p)).body), { map: 'docs/shop-phasemap.spec', phase: 'SH1_storage' });
      await page.evaluate(() => { CURRENT_REPO_SUBTAB = 'phases'; closePlanPanel(); _phPaint(); });
      await page.click('.ph2-fold');
      assert.ok(await page.$$eval('.ph2-card[data-key="SH0_schema"]', e => e.length) === 1, 'the complete one shown');
      assert.deepStrictEqual(errors, []);
    });
  } finally { await browser.close(); }
  done();
})();
function done() { console.log(`\n  ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`); process.exit(failed ? 1 : 0); }
