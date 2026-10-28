'use strict';
/**
 * tests/modules/test-phase-close.test.js — SL1: a proven, landed phase closes itself; undoing its change reopens it (0.60.223)
 * Spec: docs/self-building-loop.spec MOD-SL-CLOSE. Map: docs/2026-10-23-self-building-loop-phasemap.spec SL1.
 * James, 2026-10-23: "whats the most important? can you help me build, invent, innovate, ways for idearium to build phases, all of
 * them, we need this to work so it can start building itself." · "contiue getting idearium building phases"
 *
 *   PC-01  landed(): not proven → no; proven with a change still proposed → waits, naming it; a rejected change → no; all applied → yes;
 *          proven with no change → yes (said: the phase was already true on disk)
 *   PC-02  closeIfLanded() through the real writer (roadmap.js setPhaseStatus): the map says DONE with the version and run; loom reads
 *          it done, so the phase that depends on it is ready in the DAG; twice is a no-op; a refusing writer → not closed, said
 *   PC-03  reopenIfUndone(): a reverted change of the closing run reopens it (IN PROGRESS, which change); any other revert does nothing
 *   PC-04  the real path: a repo, a proven run row, its change proposed (nothing closes: proven against a proposal), then applied
 *          (the hook closes the map's phase: DONE … proven by run), the closes route lists it, the change reverted (reopened)
 *   PC-05  every door: the two routes, the two command rows, the phase panel's row
 *   PC-07  0.60.226 his looking-glass SP5: proven on one file check that promised a test → not closed, not landed, the report says
 *          READY ON FILES ONLY and names the promise (James, 2026-10-24: "does this help. A project that had auto built 5 phases")
 *   PC-06  in Clear Glass: the phase panel's "closed by" (run, version, date) and "reopened" (which change was undone)
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
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
const until = async (fn, ms = 5000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) return v; await new Promise(r => setTimeout(r, 50)); } };

const MAP = `phases:
  X1_first:
    status: OPEN
    depends_on: []
    files: [lib/x.js]
  X2_after:
    status: OPEN
    depends_on: [X1_first]
    files: [lib/y.js]
`;
const inj = (status, p = 'lib/x.js', runId = 'phrun-a') => ({ uuid: `i-${status}-${p}`, path: p, status, source: { runId } });

(async () => {
  console.log('\n  test-phase-close — SL1 a proven phase closes itself\n');
  const { setPhaseStatus } = await import(pathToFileURL(path.join(ROOT, 'idearium/repo/roadmap.js')).href);
  const store = { text: MAP };
  const writer = async (repo, { map, phase, status, note }) => { try { store.text = setPhaseStatus({ text: store.text, mapName: 'x-phasemap', phaseId: phase, status, note }).text; return { ok: true, data: { change: { via: 'test', before: 'planned' } } }; } catch (e) { return { ok: false, error: e.message }; } };
  const run = { runId: 'phrun-a', map: 'docs/x-phasemap.spec', phase: 'X1_first', proven: true, snapshot: 'abcdef1234567890' };

  await test('PC-01', 'landed: unproven no; a proposal waits and is named; rejected no; all applied yes; no change yes, said', () => {
    assert.match(PC.landed({ ...run, proven: false, state: 'unproven' }, { injects: [] }).why, /not proven \(unproven\)/);
    const w = PC.landed(run, { injects: [inj('applied', 'lib/a.js'), inj('proposed'), inj('applied', 'lib/z.js', 'phrun-other')] });
    assert.ok(!w.landed && w.proven); assert.deepStrictEqual(w.waiting, ['lib/x.js']); assert.match(w.why, /proven against proposals/);
    assert.match(PC.landed(run, { injects: [inj('rejected')] }).why, /did not land: lib\/x\.js rejected/);
    const y = PC.landed(run, { injects: [inj('applied'), { ...inj('applied', 'lib/b.js'), source: { runId: 'phrun-a-review' } }] });
    assert.ok(y.landed); assert.strictEqual(y.applied.length, 2, 'the -review id is the same run');
    assert.match(PC.landed(run, { injects: [] }).why, /changed nothing/);
  });

  await test('PC-02', 'closeIfLanded through the real writer: DONE with version and run; the next phase is ready; twice a no-op; a refusal said', async () => {
    const r = await PC.closeIfLanded({ repo: { uuid: 'r1' }, run, injects: [inj('applied')], setStatus: writer, version: '0.60.223', closes: [] });
    assert.ok(r.closed, r.why);
    assert.match(store.text, /status: "DONE \d{4}-\d\d-\d\d\. 0\.60\.223 — proven by run phrun-a, on snapshot abcdef123456"/);
    const DAG = require(path.join(ROOT, 'lib/phase-dag.js'));
    const g = DAG.build([{ path: 'docs/x-phasemap.spec', text: store.text }]);
    assert.ok(g.nodes['docs/x-phasemap.spec::X1_first'].done && g.ready.includes('docs/x-phasemap.spec::X2_after'), 'DG1 lets X2 build now');
    assert.deepStrictEqual([r.record.runId, r.record.phase, r.record.version, r.record.injects], ['phrun-a', 'X1_first', '0.60.223', ['i-applied-lib/x.js']]);
    const again = await PC.closeIfLanded({ repo: { uuid: 'r1' }, run, injects: [inj('applied')], setStatus: writer, version: '0.60.223', closes: [r.record] });
    assert.ok(!again.closed && again.already, 'closing twice is a no-op');
    const no = await PC.closeIfLanded({ repo: { uuid: 'r1' }, run: { ...run, runId: 'phrun-b' }, injects: [], setStatus: async () => ({ ok: false, error: 'ROUNDTRIP_FAILED x' }), closes: [] });
    assert.ok(!no.closed); assert.match(no.why, /the status writer refused: ROUNDTRIP_FAILED/);
    store.close = r.record;
  });

  await test('PC-03', 'reopenIfUndone: the closing run\'s change reverted → IN PROGRESS, naming it; another revert does nothing', async () => {
    const other = await PC.reopenIfUndone({ repo: { uuid: 'r1' }, inject: inj('reverted', 'lib/q.js', 'phrun-zzz'), setStatus: writer, closes: [store.close] });
    assert.ok(!other.reopened); assert.match(other.why, /closed no phase/);
    const r = await PC.reopenIfUndone({ repo: { uuid: 'r1' }, inject: inj('reverted'), setStatus: writer, closes: [store.close] });
    assert.ok(r.reopened, r.why);
    assert.match(store.text, /status: "IN PROGRESS \d{4}-\d\d-\d\d\. reopened: lib\/x\.js of run phrun-a was undone"/);
    const after = await PC.closeIfLanded({ repo: { uuid: 'r1' }, run, injects: [inj('applied')], setStatus: writer, closes: [store.close, r.record] });
    assert.ok(after.closed, 'a reopen is a newer row: the run is not "already closed" any more');
  });

  { const l = console.log; console.log = (...a) => { if (!/^\[[\w./-]+\]/.test(String(a[0]))) l(...a); }; }   // the API's own background logs ([idearium.spec-engine] …) would miscount the runner
  const api = await quiet(() => import(pathToFileURL(path.join(ROOT, 'idearium/api/index.js')).href));
  const R = (m, p, b) => quiet(() => api._route(m, p, b));
  await test('PC-04', 'the real path: proposed → nothing closes; applied → the hook closes it; the closes route lists it; reverted → reopened', async () => {
    const uuid = await quiet(async () => {
      const w = (await R('POST', '/api/workshop', { from: { kind: 'blank' }, title: `Close PC ${Date.now().toString(36)}` })).json.workshop;
      await R('POST', `/api/workshop/${w.uuid}`, { sections: [{ id: 'purpose', body: 'A phase that closes itself.' }] });
      return (await R('POST', `/api/workshop/${w.uuid}/save`, {})).json.repoUuid;
    });
    assert.ok(uuid, 'a repo');
    const MP = 'docs/x-phasemap.spec';
    assert.ok(!(await R('POST', `/api/repos/${uuid}/file`, { path: MP, content: MAP })).json.error);
    const { appendRow } = await import(pathToFileURL(path.join(ROOT, 'idearium/lib/db.js')).href);
    const runId = `phrun-pc-${Date.now().toString(36)}`;
    appendRow('idearium_phase_runs', { uuid: `${runId}-start`, runId, repoUuid: uuid, map: MP, phase: 'X1_first', state: 'started', ts: Date.now() - 2000 });
    appendRow('idearium_phase_runs', { uuid: `${runId}-proven`, runId: `${runId}-proof`, buildRunId: runId, repoUuid: uuid, map: MP, phase: 'X1_first', state: 'proven', snapshot: 'snap0123456789', ts: Date.now() - 1000 });
    const RI = require(path.join(ROOT, 'lib/repo-inject.js'));
    const layer = api.getRepoLayer(); const repo = layer.get(uuid);
    const p = await quiet(() => RI.propose({ layer, repo, path: 'lib/x.js', content: "'use strict';\nmodule.exports = 1;\n", source: { kind: 'agent', runId } }));
    assert.ok(p.ok, JSON.stringify(p));
    const waits = (await R('POST', `/api/repos/${uuid}/phases/close`, { runId })).json;
    assert.ok(!waits.closed && waits.waiting.includes('lib/x.js'), JSON.stringify(waits));
    const readMap = async () => (await R('GET', `/api/repos/${uuid}/file?path=${encodeURIComponent(MP)}`)).json;
    const a = await quiet(() => RI.apply(p.inject.uuid, { layer, approvedBy: 'idearium' }));
    assert.ok(a.ok, JSON.stringify(a.errors));
    const closed = await until(async () => { const f = await readMap(); return f && /DONE .*proven by run/.test(JSON.stringify(f)) ? f : null; });
    assert.ok(closed, 'the hook closed X1_first in the repo\'s map');
    assert.ok(new RegExp(`proven by run ${runId}, on snapshot snap01234567`).test(JSON.stringify(closed)));
    const list = (await R('GET', `/api/repos/${uuid}/phases/closes`)).json;
    assert.strictEqual(list.open, 1); assert.deepStrictEqual([list.closes[0].phase, list.closes[0].runId], ['X1_first', runId]);
    const again = (await R('POST', `/api/repos/${uuid}/phases/close`, { runId })).json;
    assert.ok(!again.closed && again.already, 'asked again: already closed');
    const v = await quiet(() => RI.revert(p.inject.uuid, { layer }));
    assert.ok(v.ok, JSON.stringify(v.errors));
    const re = await until(async () => { const f = await readMap(); return f && /IN PROGRESS .*reopened: lib\/x\.js/.test(JSON.stringify(f)) ? f : null; });
    assert.ok(re, 'the revert reopened it');
    const l2 = (await R('GET', `/api/repos/${uuid}/phases/closes`)).json;
    assert.deepStrictEqual([l2.open, l2.reopened], [0, 1]);
    assert.strictEqual((await R('POST', `/api/repos/${uuid}/phases/close`, { runId: 'phrun-nope' })).status, 404);
  });

  await test('PC-05', 'every door: two routes, two command rows, the phase panel', () => {
    const src = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    assert.ok(/'phases','closes'\],\s*'repo\.phases\.closes'/.test(src) && /'phases','close'\],\s*'repo\.phases\.close'/.test(src));
    assert.ok(/setOnSettled\(/.test(src) && /_closeRun\(base\.runId, \{ trigger: 'proven' \}\)/.test(src), 'both triggers wired');
    const C = require(path.join(ROOT, 'idearium/cli/route-commands.js'));
    const rows = (Array.isArray(C) ? C : C.SPEC || Object.values(C).find(Array.isArray));
    const a = { args: ['phrun-1'], flags: {}, repo: { uuid: 'u1' } };
    assert.deepStrictEqual(rows.find(r => r.key === 'repo.close').req(a), { method: 'POST', path: '/api/repos/u1/phases/close', body: { runId: 'phrun-1' } });
    assert.deepStrictEqual(rows.find(r => r.key === 'repo.closes').req(a), { method: 'GET', path: '/api/repos/u1/phases/closes' });
    const ui = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/phases.js'), 'utf8');
    assert.ok(/\/phases\/closes`/.test(ui) && /function _phCloseRow/.test(ui) && /closed by/.test(ui));
  });

  await test('PC-07', "his looking-glass SP5 (2026-10-19): READY on one file check that promised a test — not closed, said; the report says files only", async () => {
    const PR = await import(pathToFileURL(path.join(ROOT, 'idearium/repo/proof-run.js')).href);
    // the condition exactly as his bundle's .nexus/proof-runs/latest.json kept it
    const results = [{ id: 'a-test', says: 'A test that proves title as the spec states it, against the real code (no mock): §1.1, §12.1.', check: { kind: 'file', path: 'lib/title.js' }, met: true, evidence: 'lib/title.js is there' }];
    const st = PR.proofStrength(results);
    assert.deepStrictEqual([st.ran, st.files, st.filesOnly, st.untested.length], [0, 1, true, 1]);
    const l = PC.landed({ ...run, strength: st }, { injects: [] });
    assert.ok(!l.landed && l.filesOnly); assert.match(l.why, /proven on file checks only: nothing ran/);
    const T = require(path.join(ROOT, 'lib/trust-rule.js'));
    assert.match(T.allows({ repo: { uuid: 'p' }, change: { path: 'lib/title.js', status: 'proposed' }, run: { proven: true, strength: st } }).why, /file checks only/);
    const text = PR.reportText({ subject: 'looking-glass', startedAt: Date.now(), finishedAt: Date.now(), verdict: 'ready', met: 1, total: 1, results, strength: st });
    assert.match(text, /\*\*READY ON FILES ONLY\.\*\*/); assert.match(text, /## Promised a test, checked only a file/);
    assert.match(text, /nothing was run, so this does not show that the code works/); assert.doesNotMatch(text, /checked by running it/);
    const strong = PR.proofStrength([{ says: 'tests/sp1.test.js passes', check: { kind: 'tests' }, met: true }, ...results]);
    assert.ok(!strong.filesOnly && strong.ran === 1, 'a proof where its test ran is not files-only');
  });

  await test('PC-06', 'in Clear Glass: the phase panel says which run closed it, and a reopened one which change was undone', async () => {
    const os = require('os');
    const glass = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
    if (!glass.engine()) { console.log('    - SKIPPED: Clear Glass has no engine here — the browser check did not run'); return; }
    const UI = path.join(ROOT, 'idearium/ui');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-ui-'));
    const M = 'docs/x-phasemap.spec';
    const ph = (o) => ({ map: M, line: 2, order: 0, layer: 0, depends_on: [], blocked_by: [], ready: false, runs: 0, lastRun: null, closes: [], files: [], systems: [], blocks: [], mine: true, ...o });
    const DATA = { scope: { label: 'x', source: 'repo' }, editVia: 'repo-layer', warnings: [], maps: [{ path: M, meta: { name: 'x' }, summary: { total: 2 } }],
      phases: [ph({ uuid: 'p1', phase_key: 'X1_first', title: 'X1 first', status: 'complete' }), ph({ uuid: 'p2', phase_key: 'X2_after', title: 'X2 after', status: 'active', order: 1 })],
      summary: { total: 2, complete: 1, active: 1, planned: 0, ready: 0, blocked: 0, maps: 1, runs: 0 } };
    const CLOSES = { open: 1, reopened: 1, closes: [
      { runId: 'phrun-7', map: M, phase: 'X1_first', at: Date.parse('2026-10-23T10:00:00Z'), version: '0.60.223', why: 'proven, and its 1 change(s) are applied' },
      { runId: 'phrun-8', map: M, phase: 'X2_after', at: 1, reopenedAt: 2, reopenNote: 'reopened: lib/y.js of run phrun-8 was undone' }] };
    fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"></head><body>
<div id="repo-subtab-phases" style="height:900px"></div>
<script>
  const REPO = { uuid: 'xr', name: 'x', files: [] };
  let CURRENT_API_REPO = REPO, CURRENT_REPO_SUBTAB = 'phases';
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  function toast() {} function setRepoSubtab() {}
  async function api(p) {
    if (p.endsWith('/phases')) return ${JSON.stringify(DATA)};
    if (p.endsWith('/phases/closes')) return ${JSON.stringify(CLOSES)};
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
      await page.goto(pathToFileURL(path.join(dir, 'index.html')).href);
      await page.evaluate(() => renderRepoPhases(REPO));
      await page.waitForFunction(() => /X2 after/.test(document.getElementById('repo-subtab-phases').innerText));   // keys show short (X2); a complete phase is folded
      await page.evaluate(() => phasesOpen('p1'));
      await page.waitForFunction(() => /closed by/.test(document.getElementById('repo-subtab-phases').innerText));
      const t1 = await page.evaluate(() => document.getElementById('repo-subtab-phases').innerText);
      const i1 = t1.indexOf('closed by'); assert.ok(/closed by\s*run phrun-7 · 0\.60\.223 · 2026-10-23/.test(t1), JSON.stringify(t1.slice(i1, i1 + 120)));
      await page.evaluate(() => phasesOpen('p2'));
      await page.waitForFunction(() => /reopened: lib\/y\.js/.test(document.getElementById('repo-subtab-phases').innerText));
      assert.deepStrictEqual(errors, []);
    } finally { await browser.close(); }
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
