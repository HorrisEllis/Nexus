'use strict';
/**
 * tests/modules/test-self-building-loop.test.js — SL4 the loop and SL5 his rule for what lands (0.60.225)
 * Spec: docs/self-building-loop.spec MOD-SL-LOOP, MOD-SL-TRUST. Map: docs/2026-10-23-self-building-loop-phasemap.spec SL4, SL5.
 * James, 2026-10-24: "yes do it." (to: B, the 2 closes, and start SL4)
 *
 *   LP-01  his rule: the recorded default is B with his words; A asks; B lands a proven project change, asks in a Nexus repo, asks
 *          for a regressed change; C asks for a kept file; setting a rule without his words is refused
 *   LP-02  the loop over a fixture map with the real queue (SL0) and the real writer: three chained phases build, prove, land and close
 *          in order, started once; one waiting on his decision is never built and is named when the loop stops; never two loops
 *   LP-03  the limits: the budget stops it; three phases in a row that do not close stop it, each skipped with why
 *   LP-04  the real API: start on a repo with nothing buildable stops at once, said; the trust route reads B and refuses a set with no
 *          words; every door
 *   LP-05  in Clear Glass: the rail shows the loop and his rule; start asks first
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');
const T = require(path.join(ROOT, 'lib/trust-rule.js'));
const BQ = require(path.join(ROOT, 'lib/build-queue.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn, e = console.error; console.log = () => {}; console.warn = () => {}; console.error = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; console.error = e; } };

const MAP = `phases:
  L1_first:
    status: OPEN
    depends_on: []
    files: [lib/one.js]
  L2_second:
    status: OPEN
    depends_on: [L1_first]
    files: [lib/two.js]
  L3_third:
    status: OPEN
    depends_on: [L2_second]
    files: [lib/three.js]
  L4_needs_him:
    status: OPEN
    depends_on: [D1_his_call]
    files: [lib/four.js]
decisions:
  D1_his_call:
    status: OPEN
`;

(async () => {
  console.log('\n  test-self-building-loop — SL4 the loop, SL5 his rule\n');
  const AB = await import(pathToFileURL(path.join(ROOT, 'idearium/lib/autobuild.js')).href);
  const { setPhaseStatus } = await import(pathToFileURL(path.join(ROOT, 'idearium/repo/roadmap.js')).href);

  await test('LP-01', 'his rule: default B with his words; A asks; B lands a project change, asks in Nexus and on a regression; C keeps; no words refused', () => {
    const d = T.get('any'); assert.deepStrictEqual([d.rule, d.words, d.by], ['B', 'yes do it.', 'james']); assert.match(d.context, /to confirm/);
    const ch = { path: 'lib/a.js', status: 'proposed' }, run = { proven: true };
    assert.ok(T.allows({ repo: { uuid: 'p' }, change: ch, run }).lands);
    assert.match(T.allows({ repo: { uuid: 'n', nexusSelf: true }, change: ch, run }).why, /Nexus repo stays review under B/);
    assert.match(T.allows({ repo: { uuid: 'p' }, change: { ...ch, evidence: { regressions: 2 } }, run }).why, /2 regressed/);
    assert.match(T.allows({ repo: { uuid: 'p' }, change: ch, run: { proven: false } }).why, /not proven/);
    assert.match(T.allows({ repo: { uuid: 'p' }, change: ch, run, rule: { rule: 'A' } }).why, /every change asks/);
    assert.ok(T.allows({ repo: { uuid: 'n', nexusSelf: true }, change: ch, run, rule: { rule: 'C', kept: [] } }).lands);
    assert.match(T.allows({ repo: { uuid: 'n', nexusSelf: true }, change: ch, run, rule: { rule: 'C', kept: ['lib/a.js'] } }).why, /a file he keeps/);
    assert.throws(() => T.set({ rule: 'C' }), /his words are required/);
    const rows = []; T.setStore({ load: () => rows, append: (r) => rows.push(r) });
    T.set({ repo: 'r9', rule: 'A', words: 'not this one' });
    assert.strictEqual(T.get('r9').rule, 'A'); assert.strictEqual(T.get('other').rule, 'B', 'a repo rule does not move the others');
  });

  // a fake world over the real queue and the real writer: each build "proves" at once; land and close write the map
  function world({ fail = new Set() } = {}) {
    const st = { text: MAP, rows: [], runs: new Map(), built: [], t: 1000 };
    const deps = {
      load: () => st.rows, save: (l) => st.rows.push(l), now: () => st.t,
      queue: async () => BQ.queue({ maps: [{ path: 'docs/l-phasemap.spec', text: st.text }] }),
      build: async (repo, e) => { const runId = `run-${e.id}`; st.built.push(e.id); st.runs.set(runId, { phase: e.id, ok: !fail.has(e.id) }); return { ok: true, runId }; },
      runState: async (runId) => { const r = st.runs.get(runId); return { final: true, state: r.ok ? 'proven' : 'unproven', proven: r.ok }; },
      land: async () => ({ landed: 1, asked: 0 }),
      close: async (runId) => { const r = st.runs.get(runId); if (!r.ok) return { closed: false, why: 'not proven' }; st.text = setPhaseStatus({ text: st.text, mapName: 'l-phasemap', phaseId: r.phase, status: 'complete', note: `proven by run ${runId}` }).text; return { closed: true, why: 'proven, and its 1 change(s) are applied' }; },
      emit: () => {},
    };
    return { st, deps };
  }
  const drive = async (deps, repo, n = 20) => { const out = []; for (let i = 0; i < n; i++) { const l = AB.status(repo.uuid, { deps }); if (!l || l.state !== 'running') break; out.push(await AB.step(l, deps)); } return out; };

  await test('LP-02', 'three chained phases build, close and advance in order, started once; the one waiting on his decision is never built, and named', async () => {
    const { st, deps } = world();
    const repo = { uuid: 'r1', name: 'fixture' };
    AB.start({ repo, budget: { phases: 10 }, by: 'test', deps });
    assert.throws(() => AB.start({ repo, deps }), /already running/, 'never two loops on one repo');
    const steps = await drive(deps, repo);
    assert.deepStrictEqual(st.built, ['L1_first', 'L2_second', 'L3_third'], 'in order: each one only after the one before closed');
    assert.deepStrictEqual(steps.map(s => s.outcome), ['built', 'closed', 'built', 'closed', 'built', 'closed', 'stopped']);
    const l = AB.status('r1', { deps });
    assert.strictEqual(l.state, 'stopped'); assert.match(l.stopWhy, /nothing left to build now \(1 phase\(s\) wait on his decisions\)/);
    assert.strictEqual(l.closed.length, 3);
    for (const id of ['L1_first', 'L2_second', 'L3_third']) assert.match(st.text, new RegExp(`${id}:\\n(?:.*\\n){0,2}\\s+status: "DONE [^"]*proven by run run-${id}`));
    assert.match(st.text, /L4_needs_him:\n\s+status: OPEN/, 'never built');
  });

  await test('LP-03', 'the budget stops it; three misses in a row stop it, each skipped with why', async () => {
    const a = world(); const r1 = { uuid: 'r2' };
    AB.start({ repo: r1, budget: { phases: 1 }, deps: a.deps });
    await drive(a.deps, r1);
    const l1 = AB.status('r2', { deps: a.deps });
    assert.deepStrictEqual([a.st.built, l1.state], [['L1_first'], 'stopped']); assert.match(l1.stopWhy, /the budget: 1 phase\(s\) built/);
    const MAP3 = 'phases:\n' + ['M1', 'M2', 'M3', 'M4'].map(k => `  ${k}_x:\n    status: OPEN\n    depends_on: []\n    files: [lib/${k}.js]\n`).join('');
    const b = world({ fail: new Set(['M1_x', 'M2_x', 'M3_x', 'M4_x']) }); b.st.text = MAP3; const r2 = { uuid: 'r3' };
    AB.start({ repo: r2, budget: { phases: 10 }, deps: b.deps });
    await drive(b.deps, r2);
    const l2 = AB.status('r3', { deps: b.deps });
    assert.strictEqual(l2.skipped.length, 3); assert.strictEqual(b.st.built.length, 3, 'the fourth is never built');
    assert.match(l2.stopWhy, /3 phases in a row did not close/); assert.match(l2.skipped[0].why, /ended unproven/);
    const t = world(); const r3 = { uuid: 'r4' };
    AB.start({ repo: r3, budget: { phases: 10, minutes: 5 }, deps: t.deps }); t.st.t += 6 * 60000;
    await drive(t.deps, r3);
    assert.match(AB.status('r4', { deps: t.deps }).stopWhy, /the budget: 5 minutes/);
  });

  { const l = console.log; console.log = (...a) => { if (!/^\[[\w./-]+\]/.test(String(a[0]))) l(...a); }; }
  const api = await quiet(() => import(pathToFileURL(path.join(ROOT, 'idearium/api/index.js')).href));
  const R = (m, p, b) => quiet(() => api._route(m, p, b));
  await test('LP-04', 'the real API: start with nothing buildable stops at once, said; the trust route reads B, refuses no words; every door', async () => {
    const uuid = await quiet(async () => {
      const w = (await R('POST', '/api/workshop', { from: { kind: 'blank' }, title: `Loop LP ${Date.now().toString(36)}` })).json.workshop;
      await R('POST', `/api/workshop/${w.uuid}`, { sections: [{ id: 'purpose', body: 'A repo with nothing to build.' }] });
      return (await R('POST', `/api/workshop/${w.uuid}/save`, {})).json.repoUuid;
    });
    assert.strictEqual((await R('GET', `/api/repos/${uuid}/loop`)).json.loop, null);
    const s = (await R('POST', `/api/repos/${uuid}/loop/start`, { budget: { phases: 2 } })).json;
    assert.strictEqual(s.first.outcome, 'stopped', JSON.stringify(s).slice(0, 300)); assert.match(s.first.why, /nothing left to build now/);
    assert.strictEqual(s.trust.rule, 'B');
    const g = (await R('GET', `/api/repos/${uuid}/loop`)).json;
    assert.deepStrictEqual([g.loop.state, g.loop.budget.phases], ['stopped', 2]);
    assert.strictEqual((await R('GET', '/api/trust-rule')).json.rule.words, 'yes do it.');
    assert.strictEqual((await R('POST', '/api/trust-rule', { rule: 'C' })).status, 400);
    const C = require(path.join(ROOT, 'idearium/cli/route-commands.js'));
    const rows = (Array.isArray(C) ? C : C.SPEC || Object.values(C).find(Array.isArray));
    const a = { args: ['start'], flags: { phases: '3' }, repo: { uuid: 'u1' } };
    assert.deepStrictEqual(rows.find(r => r.key === 'repo.loop').req(a), { method: 'POST', path: '/api/repos/u1/loop/start', body: { budget: { phases: 3, minutes: undefined } } });
    assert.deepStrictEqual(rows.find(r => r.key === 'repo.loop').req({ ...a, args: [] }), { method: 'GET', path: '/api/repos/u1/loop' });
    assert.deepStrictEqual(rows.find(r => r.key === 'trust').req({ args: [], flags: { set: 'b', words: 'ok' } }), { method: 'POST', path: '/api/trust-rule', body: { rule: 'B', words: 'ok', repo: '*', kept: [] } });
    const src = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    assert.ok(/_loopTick\(\)/.test(src) && /_landByRule\(base\.runId\)\.then/.test(src) && /'repos\.stall_minutes', 20/.test(src));
  });

  await test('LP-05', 'in Clear Glass: the rail shows the loop and his rule; start asks first', async () => {
    const glass = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
    if (!glass.engine()) { console.log('    - SKIPPED: Clear Glass has no engine here — the browser check did not run'); return; }
    const UI = path.join(ROOT, 'idearium/ui');
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-ui-'));
    const M = 'docs/l-phasemap.spec';
    const DATA = { scope: { label: 'l', source: 'repo' }, editVia: 'repo-layer', warnings: [], maps: [{ path: M, meta: { name: 'l' }, summary: { total: 1 } }],
      phases: [{ uuid: 'p1', phase_key: 'L1_first', title: 'L1 first', status: 'planned', map: M, line: 2, order: 0, layer: 0, depends_on: [], blocked_by: [], ready: true, runs: 0, lastRun: null, closes: [], files: ['lib/one.js'], systems: [], blocks: [], mine: true }],
      summary: { total: 1, complete: 0, active: 0, planned: 1, ready: 1, blocked: 0, maps: 1, runs: 0 } };
    const LOOP = { loop: { loopId: 'loop-1', state: 'stopped', stopWhy: 'the budget: 2 phase(s) built', budget: { phases: 2 }, built: ['m::L1', 'm::L2'], closed: [{ key: 'm::L1' }], skipped: [{ key: 'm::L2_second', why: 'ended unproven' }], current: null },
      trust: { rule: 'B', words: 'yes do it.', context: 'read as B' } };
    fs.writeFileSync(path.join(d, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"></head><body>
<div id="repo-subtab-phases" style="height:900px"></div>
<script>
  const CALLS = []; let ASKED = 0;
  const REPO = { uuid: 'lr', name: 'l', files: [] };
  let CURRENT_API_REPO = REPO, CURRENT_REPO_SUBTAB = 'phases';
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  function toast() {} function setRepoSubtab() {}
  window.confirm = () => { ASKED++; return false; };
  async function api(p, opts) {
    CALLS.push({ p, method: (opts && opts.method) || 'GET' });
    if (p.endsWith('/phases')) return ${JSON.stringify(DATA)};
    if (p.endsWith('/loop')) return ${JSON.stringify(LOOP)};
    if (p.includes('/phases/next')) return { counts: { open: 1, queue: 1, byGroup: {} }, queue: [], blocked: [] };
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
      await page.goto(pathToFileURL(path.join(d, 'index.html')).href);
      await page.evaluate(() => renderRepoPhases(REPO));
      await page.waitForFunction(() => /self-building loop/.test(document.getElementById('repo-subtab-phases').innerText));
      const text = await page.evaluate(() => document.getElementById('repo-subtab-phases').innerText);
      assert.ok(/built 2\/2 · closed 1 · skipped 1/.test(text) && /stopped: the budget: 2 phase\(s\) built/.test(text), text.slice(0, 800));
      assert.ok(/lands by itself: rule B — his words: "yes do it\."/.test(text), 'his rule, in his words');
      await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /start the loop/.test(b.textContent)).click());
      assert.strictEqual(await page.evaluate(() => ASKED), 1, 'start asks first');
      assert.strictEqual(await page.evaluate(() => CALLS.filter(c => /loop\/start/.test(c.p)).length), 0, 'declined: nothing started');
      assert.deepStrictEqual(errors, []);
    } finally { await browser.close(); }
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
