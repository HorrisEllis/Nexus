'use strict';
/**
 * tests/modules/test-evidence-close.test.js — SL2: an open phase closes by evidence, its own tests passing (0.60.224)
 * Spec: docs/self-building-loop.spec MOD-SL-EVIDENCE-CLOSE. Map: docs/2026-10-23-self-building-loop-phasemap.spec SL2.
 * James, 2026-10-23: "next" (after SL1 merged; the map's order: SL2 closes the stale backlog).
 *
 *   EC-01  which tests may judge a phase: its own test file; a test specific to one of its files (named for it, or one of few that
 *          reach it); never a test of a file most open phases share; none → open, said; a missing file → open, named
 *   EC-02  the dry run over a fixture tree with real tests: one closes (its test passes), one stays (its test fails), one stays (no
 *          test), one stays (a file missing); nothing is written
 *   EC-03  apply: the closing one is written through the writer ("DONE … by evidence — …"); a refusing writer keeps it open, said
 *   EC-04  the real API on a repo: dry run lists it, apply closes it in the repo's map and keeps the record; every door
 *   EC-05  in Clear Glass: the rail's "done by evidence?" runs the dry run and lists what would close
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');
const PC = require(path.join(ROOT, 'lib/phase-close.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn, e = console.error; console.log = () => {}; console.warn = () => {}; console.error = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; console.error = e; } };

// a fixture tree: lib/good.js (its test passes), lib/bad.js (its test fails), lib/lonely.js (no test), lib/hot.js (shared by 4 phases)
const TREE = {
  'lib/good.js': "module.exports = () => 2;\n",
  'lib/bad.js': "module.exports = () => 3;\n",
  'lib/lonely.js': "module.exports = 1;\n",
  'lib/hot.js': "module.exports = 0;\n",
  'tests/good.test.js': "const g = require('../lib/good.js'); process.exit(g() === 2 ? 0 : 1);\n",
  'tests/bad.test.js': "const b = require('../lib/bad.js'); process.exit(b() === 2 ? 0 : 1);\n",
  'tests/hot.test.js': "require('../lib/hot.js'); process.exit(0);\n",
  'tests/own-check.test.js': "process.exit(0);\n",
};
const PHASES = [
  { key: 'm::E1_good', map: 'm', id: 'E1_good', files: ['lib/good.js'] },
  { key: 'm::E2_bad', map: 'm', id: 'E2_bad', files: ['lib/bad.js'] },
  { key: 'm::E3_lonely', map: 'm', id: 'E3_lonely', files: ['lib/lonely.js'] },
  { key: 'm::E4_missing', map: 'm', id: 'E4_missing', files: ['lib/good.js', 'lib/gone.js'] },
  ...['E5', 'E6', 'E7', 'E8'].map(k => ({ key: `m::${k}_hot`, map: 'm', id: `${k}_hot`, files: ['lib/hot.js'] })),
  { key: 'm::E9_own', map: 'm', id: 'E9_own', files: ['lib/hot.js', 'tests/own-check.test.js'] },
];
function tree() { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ec-')); for (const [p, c] of Object.entries(TREE)) { fs.mkdirSync(path.dirname(path.join(d, p)), { recursive: true }); fs.writeFileSync(path.join(d, p), c); } return d; }

(async () => {
  console.log('\n  test-evidence-close — SL2 done by evidence\n');
  const dir = tree();

  await test('EC-01', 'which tests may judge a phase: its own, a specific one; never a hot shared file\'s; none or a missing file → open, said', () => {
    const j = Object.fromEntries(PC.evidenceTests(PHASES, { root: dir }).map(p => [p.id, p]));
    assert.deepStrictEqual(j.E1_good.tests, [{ file: 'tests/good.test.js', how: 'linked:lib/good.js' }]);
    assert.deepStrictEqual(j.E3_lonely.tests, []); assert.match(j.E3_lonely.why, /no test can check it/);
    assert.deepStrictEqual(j.E4_missing.missing, ['lib/gone.js']); assert.match(j.E4_missing.why, /do not exist: lib\/gone\.js/);
    assert.deepStrictEqual(j.E5_hot.tests, [], 'lib/hot.js is named by 5 open phases: its test is not evidence for any one');
    assert.deepStrictEqual(j.E9_own.tests, [{ file: 'tests/own-check.test.js', how: 'own' }], 'a test the phase names itself counts');
  });

  await test('EC-02', 'the dry run with real tests: E1 and E9 would close; E2 (fails), E3 (no test), E4 (missing) stay; nothing written', async () => {
    let wrote = 0;
    const r = await PC.byEvidence({ phases: PHASES, root: dir, setStatus: async () => { wrote++; return { ok: true }; } });
    assert.ok(r.dryRun); assert.strictEqual(wrote, 0, 'a dry run writes nothing');
    assert.deepStrictEqual(r.wouldClose.map(c => c.phase).sort(), ['E1_good', 'E9_own']);
    const o = Object.fromEntries(r.open.map(x => [x.id, x]));
    assert.match(o.E2_bad.why, /1 of its 1 test\(s\) failed: tests\/bad\.test\.js/); assert.deepStrictEqual(o.E2_bad.failed, ['tests/bad.test.js']);
    assert.ok(o.E3_lonely && o.E4_missing && o.E5_hot);
    assert.strictEqual(r.ran.length, 3, 'each distinct test once');
    assert.match(r.wouldClose.find(c => c.phase === 'E1_good').note, /^by evidence — good\.test\.js \(linked\)$/);
  });

  await test('EC-03', 'apply: written through the writer; a refusal keeps it open, said', async () => {
    const { setPhaseStatus } = await import(pathToFileURL(path.join(ROOT, 'idearium/repo/roadmap.js')).href);
    let text = 'phases:\n  E1_good:\n    status: OPEN\n    depends_on: []\n    files: [lib/good.js]\n';
    const writer = async (repo, { phase, status, note }) => { text = setPhaseStatus({ text, mapName: 'm', phaseId: phase, status, note }).text; return { ok: true }; };
    const r = await PC.byEvidence({ phases: PHASES.slice(0, 1), root: dir, dryRun: false, setStatus: writer });
    assert.deepStrictEqual(r.closed.map(c => [c.kind, c.phase]), [['evidence', 'E1_good']]);
    assert.match(text, /status: "DONE \d{4}-\d\d-\d\d\. by evidence — good\.test\.js \(linked\)"/);
    const no = await PC.byEvidence({ phases: PHASES.slice(0, 1), root: dir, dryRun: false, setStatus: async () => ({ ok: false, error: 'DEPS_INCOMPLETE x' }) });
    assert.deepStrictEqual(no.closed, []); assert.match(no.open[0].why, /the status writer refused: DEPS_INCOMPLETE/);
  });

  { const l = console.log; console.log = (...a) => { if (!/^\[[\w./-]+\]/.test(String(a[0]))) l(...a); }; }   // the API's background logs would miscount the runner
  const api = await quiet(() => import(pathToFileURL(path.join(ROOT, 'idearium/api/index.js')).href));
  const R = (m, p, b) => quiet(() => api._route(m, p, b));
  await test('EC-04', 'the real API on a repo: the dry run lists it; apply closes it in the map and keeps the record; every door', async () => {
    const uuid = await quiet(async () => {
      const w = (await R('POST', '/api/workshop', { from: { kind: 'blank' }, title: `Evidence EC ${Date.now().toString(36)}` })).json.workshop;
      await R('POST', `/api/workshop/${w.uuid}`, { sections: [{ id: 'purpose', body: 'A phase that is already built.' }] });
      return (await R('POST', `/api/workshop/${w.uuid}/save`, {})).json.repoUuid;
    });
    const MP = 'docs/e-phasemap.spec';
    for (const [p, c] of [[MP, 'phases:\n  E1_good:\n    status: OPEN\n    depends_on: []\n    files: [lib/good.js]\n'], ['lib/good.js', TREE['lib/good.js']], ['tests/good.test.js', TREE['tests/good.test.js']]])
      assert.ok(!(await R('POST', `/api/repos/${uuid}/file`, { path: p, content: c })).json.error);
    const dry = await R('POST', `/api/repos/${uuid}/phases/evidence`, {});
    assert.strictEqual(dry.status, 200, JSON.stringify(dry.json).slice(0, 300));
    assert.ok(dry.json.dryRun && dry.json.wouldClose.map(c => c.phase).join() === 'E1_good', JSON.stringify(dry.json).slice(0, 600));
    const ap = (await R('POST', `/api/repos/${uuid}/phases/evidence`, { apply: true })).json;
    assert.deepStrictEqual(ap.closed.map(c => c.phase), ['E1_good']);
    const f = (await R('GET', `/api/repos/${uuid}/file?path=${encodeURIComponent(MP)}`)).json;
    assert.match(JSON.stringify(f), /DONE \d{4}-\d\d-\d\d\. by evidence/);
    const cl = (await R('GET', `/api/repos/${uuid}/phases/closes`)).json;
    assert.strictEqual(cl.closes[0].kind, 'evidence');
    const again = (await R('POST', `/api/repos/${uuid}/phases/evidence`, {})).json;
    assert.strictEqual(again.checked, 0, 'closed now: nothing left to check');
    const C = require(path.join(ROOT, 'idearium/cli/route-commands.js'));
    const rows = (Array.isArray(C) ? C : C.SPEC || Object.values(C).find(Array.isArray));
    assert.deepStrictEqual(rows.find(r => r.key === 'repo.evidence').req({ args: [], flags: { apply: true, limit: '5' }, repo: { uuid: 'u1' } }), { method: 'POST', path: '/api/repos/u1/phases/evidence', body: { apply: true, limit: 5 } });
    assert.ok(/function _phEvidenceRail/.test(fs.readFileSync(path.join(ROOT, 'idearium/ui/js/phases.js'), 'utf8')));
  });

  await test('EC-05', 'in Clear Glass: the rail runs the dry run and lists what would close; close asks first', async () => {
    const glass = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
    if (!glass.engine()) { console.log('    - SKIPPED: Clear Glass has no engine here — the browser check did not run'); return; }
    const UI = path.join(ROOT, 'idearium/ui');
    const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'ec-ui-'));
    const M = 'docs/e-phasemap.spec';
    const DATA = { scope: { label: 'e', source: 'repo' }, editVia: 'repo-layer', warnings: [], maps: [{ path: M, meta: { name: 'e' }, summary: { total: 1 } }],
      phases: [{ uuid: 'p1', phase_key: 'E1_good', title: 'E1 good', status: 'planned', map: M, line: 2, order: 0, layer: 0, depends_on: [], blocked_by: [], ready: true, runs: 0, lastRun: null, closes: [], files: ['lib/good.js'], systems: [], blocks: [], mine: true }],
      summary: { total: 1, complete: 0, active: 0, planned: 1, ready: 1, blocked: 0, maps: 1, runs: 0 } };
    const NEXT = { counts: { open: 1, queue: 1, byGroup: {} }, queue: [], blocked: [] };
    const EV = { dryRun: true, checked: 2, closed: [], wouldClose: [{ phase: 'E1_good', why: 'every file exists and 1 test(s) passed', tests: [{ file: 'tests/good.test.js' }] }], open: [{ id: 'E2_bad', failed: ['tests/bad.test.js'], why: 'failed' }], ran: [] };
    fs.writeFileSync(path.join(d2, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"></head><body>
<div id="repo-subtab-phases" style="height:900px"></div>
<script>
  const CALLS = [], TOASTS = []; let ASKED = 0;
  const REPO = { uuid: 'er', name: 'e', files: [] };
  let CURRENT_API_REPO = REPO, CURRENT_REPO_SUBTAB = 'phases';
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  function toast(m, k) { TOASTS.push([m, k]); } function setRepoSubtab() {}
  window.confirm = () => { ASKED++; return false; };
  async function api(p, opts) {
    CALLS.push({ p, method: (opts && opts.method) || 'GET', body: opts && opts.body ? JSON.parse(opts.body) : null });
    if (p.endsWith('/phases')) return ${JSON.stringify(DATA)};
    if (p.includes('/phases/next')) return ${JSON.stringify(NEXT)};
    if (p.endsWith('/phases/evidence')) return ${JSON.stringify(EV)};
    if (p.endsWith('/phases/closes')) return { closes: [] };
    if (p.endsWith('/thread')) return { specs: [] };
    if (p.endsWith('/roadmaps')) return { roadmaps: [] };
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
      await page.goto(pathToFileURL(path.join(d2, 'index.html')).href);
      await page.evaluate(() => renderRepoPhases(REPO));
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => /done by evidence\?/.test(b.textContent)));
      await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /done by evidence\?/.test(b.textContent)).click());
      await page.waitForFunction(() => /1 would close of 2 checked/.test(document.getElementById('repo-subtab-phases').innerText));
      const call = await page.evaluate(() => CALLS.find(c => c.p.endsWith('/phases/evidence')));
      assert.deepStrictEqual([call.method, call.body.apply], ['POST', false], 'the first run is a dry run');
      const text = await page.evaluate(() => document.getElementById('repo-subtab-phases').innerText);
      assert.ok(/E1_good/.test(text) && /good\.test\.js/.test(text) && /1 stay open: a test failed \(E2_bad\)/.test(text), text.slice(0, 600));
      await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /^close 1$/.test(b.textContent.trim())).click());
      assert.strictEqual(await page.evaluate(() => ASKED), 1, 'close asks first');
      assert.strictEqual(await page.evaluate(() => CALLS.filter(c => c.p.endsWith('/phases/evidence')).length), 1, 'declined: nothing more was sent');
      assert.deepStrictEqual(errors, []);
    } finally { await browser.close(); }
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
