'use strict';
/**
 * tests/modules/test-build-queue.test.js — SL0: what can be built now, and why every other open phase cannot (0.60.222)
 * Spec: docs/self-building-loop.spec MOD-SL-QUEUE. Map: docs/2026-10-23-self-building-loop-phasemap.spec SL0.
 * James, 2026-10-23: "whats the most important? can you help me build, invent, innovate, ways for idearium to build phases, all of
 * them, we need this to work so it can start building itself." · "contiue getting idearium building phases"
 *
 *   BQ-01  a fixture with one phase per group: each lands in its group with its reason; the ready ones are queued by layer, then
 *          how many wait on them; open = queue + blocked (nothing lost, nothing counted twice)
 *   BQ-02  a held phase (three flights that did not land) and the done-by-evidence rule; no census → the rule is skipped, said
 *   BQ-03  over Nexus's own maps: every open phase in exactly one place
 *   BQ-04  every door: the routes, the two command rows, the Phases rail
 *   BQ-05  in Clear Glass: the real phases.js shows "can be built now" and its build button posts the build for that phase
 *   BQ-06  through the real API: the route over Nexus's maps, the census run, ?group= filtering
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');
const BQ = require(path.join(ROOT, 'lib/build-queue.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}

const MAP = `phases:
  A0_base:
    status: DONE
    depends_on: []
    files: [lib/a.js]
  A1_ready_first:
    status: OPEN
    depends_on: [A0_base]
    files: [lib/b.js]
  A2_waits_on_a1:
    status: OPEN
    depends_on: [A1_ready_first]
    files: [lib/c.js]
  A3_same_file_as_a1:
    status: OPEN
    depends_on: []
    files: [lib/b.js]
  A4_no_files:
    status: OPEN
    depends_on: []
  A5_dangling:
    status: OPEN
    depends_on: [NOPE_nothing]
    files: [lib/d.js]
  A6_cycle_x:
    status: OPEN
    depends_on: [A7_cycle_y]
    files: [lib/e.js]
  A7_cycle_y:
    status: OPEN
    depends_on: [A6_cycle_x]
    files: [lib/f.js]
  A8_waits_on_decision:
    status: OPEN
    depends_on: [D1_his_call]
    files: [lib/g.js]
  A9_built_already:
    status: OPEN
    depends_on: []
    files: [lib/h.js]
  A10_held:
    status: OPEN
    depends_on: []
    files: [lib/i.js]
  A11_ready_too:
    status: OPEN
    depends_on: []
    files: [lib/j.js]
decisions:
  D1_his_call:
    status: OPEN
    question: which
`;
const MAPS = [{ path: 'docs/x-phasemap.spec', text: MAP }];
const K = (id) => `docs/x-phasemap.spec::${id}`;
const CENSUS = { phases: [{ id: 'A9_built_already', map: 'docs/x-phasemap.spec', verdict: 'done' }] };
const FLIGHTS = [1, 2, 3].map(i => ({ key: K('A10_held'), verdict: 'timeout', landed: false, ended: i }));

(async () => {
  console.log('\n  test-build-queue — SL0 what can be built now\n');

  await test('BQ-01', 'one phase per group, each with its reason; the ready ones queued by layer, then unlocks; nothing lost', () => {
    const r = BQ.queue({ maps: MAPS, census: CENSUS, flights: FLIGHTS });
    const g = Object.fromEntries(r.blocked.map(b => [b.id, b.group]));
    assert.strictEqual(g.A2_waits_on_a1, 'deps-open');
    assert.strictEqual(g.A4_no_files, 'no-files');
    assert.strictEqual(g.A5_dangling, 'dangling');
    assert.ok(['cycle', 'deps-open'].includes(g.A6_cycle_x) && ['cycle', 'deps-open'].includes(g.A7_cycle_y), 'a cycle\'s members wait on each other');
    assert.strictEqual(g.A8_waits_on_decision, 'decision');
    assert.match(r.blocked.find(b => b.id === 'A8_waits_on_decision').why, /D1_his_call/);
    assert.strictEqual(g.A9_built_already, 'done-by-evidence');
    assert.strictEqual(g.A10_held, 'held');
    assert.strictEqual(g.A1_ready_first, 'conflict', 'A1 and A3 change lib/b.js with no order: the one on the lower layer (A3, layer 0) goes first');
    assert.match(r.blocked.find(b => b.id === 'A1_ready_first').why, /A3_same_file_as_a1.*lib\/b\.js/);
    assert.deepStrictEqual(r.queue.map(q => q.id), ['A11_ready_too', 'A3_same_file_as_a1'], 'layer 0, then key');
    for (const b of r.blocked) assert.ok(b.why && b.unblock, `${b.id} says why and what unblocks it`);
    assert.strictEqual(r.counts.open, r.queue.length + r.blocked.length);
    assert.strictEqual(new Set([...r.queue, ...r.blocked].map(x => x.key)).size, r.counts.open, 'each in exactly one place');
    assert.ok(!r.said, 'a census was given');
    const L = BQ.lines(r).join('\n');
    assert.match(L, /can be built now/); assert.match(L, /no-files/);
  });

  await test('BQ-02', 'without a census the done-by-evidence rule is skipped and said; fewer than three failures does not hold', () => {
    const r = BQ.queue({ maps: MAPS, flights: FLIGHTS.slice(0, 2) });
    assert.ok(r.queue.some(q => q.id === 'A9_built_already') && r.queue.some(q => q.id === 'A10_held'));
    assert.deepStrictEqual(r.said, ['no census given: the done-by-evidence rule was not applied']);
    const landed = BQ.queue({ maps: MAPS, census: CENSUS, flights: [...FLIGHTS.slice(0, 2), { key: K('A10_held'), verdict: 'proven', landed: true, ended: 9 }] });
    assert.ok(landed.queue.some(q => q.id === 'A10_held'), 'the last of three landed: not held');
  });

  await test('BQ-03', "over Nexus's own maps: every open phase in exactly one place", () => {
    const dir = path.join(ROOT, 'docs');
    const maps = fs.readdirSync(dir).filter(f => f.endsWith('-phasemap.spec')).map(f => ({ path: `docs/${f}`, text: fs.readFileSync(path.join(dir, f), 'utf8') }));
    const r = BQ.queue({ maps });
    assert.ok(r.counts.maps > 100 && r.counts.open > 0);
    assert.strictEqual(r.counts.open, r.queue.length + r.blocked.length);
    assert.strictEqual(new Set([...r.queue, ...r.blocked].map(x => x.key)).size, r.counts.open);
    assert.strictEqual(Object.values(r.counts.byGroup).reduce((a, b) => a + b, 0), r.blocked.length);
  });

  await test('BQ-04', 'every door: two routes, two command rows, the Phases rail', () => {
    const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    assert.ok(/\['api','phases','next'\],\s*'phases\.next'/.test(api) && /\['api','repos',':uuid','phases','next'\],\s*'repo\.phases\.next'/.test(api));
    assert.ok(/'phases\.next': CAPS\.READ_IDEAS/.test(api));
    const C = require(path.join(ROOT, 'idearium/cli/route-commands.js'));
    const rows = (Array.isArray(C) ? C : C.SPEC || Object.values(C).find(Array.isArray));
    assert.deepStrictEqual(rows.find(r => r.key === 'phases.next').req({ args: [], flags: { limit: '5', group: 'no-files' } }), { method: 'GET', path: '/api/phases/next?limit=5&group=no-files' });
    assert.deepStrictEqual(rows.find(r => r.key === 'repo.next').req({ args: [], flags: {}, repo: { uuid: 'u1' } }), { method: 'GET', path: '/api/repos/u1/phases/next?limit=20' });
    const ui = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/phases.js'), 'utf8');
    assert.ok(/\/phases\/next\?limit=8/.test(ui) && /can be built now/.test(ui) && /function _phNextRail/.test(ui));
  });

  const quiet = async (fn) => { const l = console.log, w = console.warn, e = console.error; console.log = () => {}; console.warn = () => {}; console.error = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; console.error = e; } };
  await test('BQ-06', "through the real API: GET /api/phases/next over Nexus's maps, with the census; ?group= filters", async () => {
    { const l = console.log; console.log = (...a) => { if (!/^\[[\w./-]+\]/.test(String(a[0]))) l(...a); }; }   // the API's own background logs ([idearium.spec-engine] …) would miscount the runner
    const api = await quiet(() => import(pathToFileURL(path.join(ROOT, 'idearium/api/index.js')).href));
    const r = await quiet(() => api._route('GET', '/api/phases/next?limit=5'));
    assert.strictEqual(r.status, 200, JSON.stringify(r.json).slice(0, 300));
    assert.ok(r.json.queue.length <= 5 && r.json.counts.open > 0 && Array.isArray(r.json.lines));
    assert.ok(!(r.json.said || []).some(x => /census failed/.test(x)), 'the census ran: ' + JSON.stringify(r.json.said));
    const g = await quiet(() => api._route('GET', '/api/phases/next?group=no-files'));
    assert.ok(g.json.blocked.length && g.json.blocked.every(b => b.group === 'no-files'));
    assert.strictEqual(g.json.blocked.length, g.json.counts.byGroup['no-files']);
  });

  await test('BQ-05', 'in Clear Glass: the rail lists what can be built now; its button builds that phase', async () => {
    const os = require('os');
    const glass = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
    if (!glass.engine()) { console.log('    - SKIPPED: Clear Glass has no engine here — the browser check did not run'); return; }
    const UI = path.join(ROOT, 'idearium/ui');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bq-ui-'));
    const NEXT = { counts: { open: 4, queue: 1, byGroup: { 'no-files': 2, 'deps-open': 1 } }, queue: [{ key: 'docs/x-phasemap.spec::A1_ready_first', map: 'docs/x-phasemap.spec', id: 'A1_ready_first', layer: 1, unlocks: 3, files: ['lib/b.js'], why: 'ready' }], blocked: [] };
    fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"></head><body>
<div id="repo-subtab-phases" style="height:900px"></div>
<script>
  const CALLS = [], TOASTS = [];
  const REPO = { uuid: 'mm', name: 'mastermind', files: [] };
  let CURRENT_API_REPO = REPO, CURRENT_REPO_SUBTAB = 'phases';
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  function toast(m, k) { TOASTS.push([m, k]); }
  function setRepoSubtab() {}
  function confirm() { return true; }
  async function api(p, opts) {
    CALLS.push({ p, method: (opts && opts.method) || 'GET', body: opts && opts.body ? JSON.parse(opts.body) : null });
    if (p.endsWith('/phases')) return { scope: { label: 'mastermind', source: 'repo' }, editVia: 'repo-layer', warnings: [], maps: [{ path: 'docs/x-phasemap.spec', meta: { name: 'x' }, summary: { total: 1 } }], phases: [{ uuid: 'p1', phase_key: 'A1_ready_first', title: 'A1 ready', name: 'ready', status: 'planned', map: 'docs/x-phasemap.spec', line: 10, order: 0, layer: 0, depends_on: [], blocked_by: [], ready: true, runs: 0, lastRun: null, closes: [], files: ['lib/b.js'], systems: [], blocks: [], mine: true }], summary: { total: 1, complete: 0, active: 0, planned: 1, ready: 1, blocked: 0, maps: 1, runs: 0 } };
    if (p.endsWith('/thread')) return { specs: [] };
    if (p.endsWith('/roadmaps')) return { roadmaps: [] };
    if (p.includes('/phases/next')) return ${JSON.stringify(NEXT)};
    return {};
  }
</script>
<script src="${pathToFileURL(path.join(UI, 'js', 'plan-panel.js')).href}"></script>
<script src="${pathToFileURL(path.join(UI, 'js', 'work-surface.js')).href}"></script>
<script src="${pathToFileURL(path.join(UI, 'js', 'phases.js')).href}"></script>
</body></html>`);
    const browser = await glass.chromium.launch();
    try {
      const page = await browser.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(pathToFileURL(path.join(dir, 'index.html')).href);
      await page.evaluate(() => renderRepoPhases(REPO));
      await page.waitForFunction(() => /can be built now/.test(document.getElementById('repo-subtab-phases').innerText));
      const text = await page.evaluate(() => document.getElementById('repo-subtab-phases').innerText);
      assert.ok(/can be built now · 1 of 4 open/i.test(text), text.slice(0, 400));
      assert.ok(/A1_ready_first/.test(text) && /unlocks 3/.test(text) && /waiting: 2 no-files · 1 deps-open/.test(text), text.slice(0, 600));
      await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /▶ build/.test(b.textContent)).click());
      await page.waitForFunction(() => CALLS.some(c => c.method === 'POST' && /build/.test(c.p)), null, { timeout: 5000 });
      const call = await page.evaluate(() => CALLS.find(c => c.method === 'POST' && /build/.test(c.p)));
      assert.ok(/A1_ready_first/.test(JSON.stringify(call)), JSON.stringify(call));
      assert.deepStrictEqual(errors, []);
    } finally { await browser.close(); }
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
