'use strict';
/**
 * tests/modules/test-change-record.test.js — FR1 (docs/2026-10-16-repo-carve-phasemap.spec), 0.60.114
 * James, 2026-10-16: "next" — the flight recorder's first piece: one record per change an agent makes.
 *   CR-01  propose() inside a task keeps the task (the forward fix); outside one, null
 *   CR-02  the record joins it all: lines, who, why (run by the task's session), checked, landed, timeline, undo
 *   CR-03  an inject from before tasks were kept: its run matched by path and time, SAID as matched; no run → a hole
 *   CR-04  applied with no version naming it, no evidence: each missing link is a hole, named; a reverted one cannot be undone again
 *   CR-05  GET /api/repos/:uuid/changes and /changes/:id through the real router; the command row (repo record); command keys unique
 *   CR-07  FR2: where it was tested, old evidence from Nexus's tree a hole, the batch line
 *   CR-06  the Code tab's changes panel in Clear Glass against a stubbed api(); no engine → SKIPPED, said
 */
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const _data = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-'));
const _jaa = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-jaa-'));
process.env.IDEARIUM_DATA_DIR = _data;
process.env.JAA_DATA_DIR = _jaa;
process.env.NEXUS_EVIDENCE = 'off';
process.on('exit', () => { for (const d of [_data, _jaa]) try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
const assert = require('assert');
const ROOT = path.join(__dirname, '../..');
const CR = require(path.join(ROOT, 'lib/change-record.js'));
const RI = require(path.join(ROOT, 'lib/repo-inject.js'));
const RA = require(path.join(ROOT, 'lib/repo-activity.js'));
const quiet = async (f) => { const l = console.log, w = console.warn; console.log = console.warn = () => {}; try { return await f(); } finally { console.log = l; console.warn = w; } };

let passed = 0, failed = 0, skipped = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}

const layer = { files: { 'lib/a.js': 'const a = 1;\nmodule.exports = a;\n' }, readFile(u, p) { return this.files[p] != null ? { content: this.files[p] } : { error: 'no' }; } };
const repo = { uuid: 'cr-repo' }, hat = { name: 'the_builder', uuid: 'h1' };
const NEW = 'const a = 2;\nconst b = 3;\nmodule.exports = { a, b };\n';

(async () => {
  let inTask = null;
  await test('CR-01', 'an inject proposed inside a task keeps the task; one outside a task has none', async () => {
    await quiet(() => RA.run({ repoUuid: repo.uuid, hat: hat.name, session: 'sess-1', message: 'make b', provider: 'ollama', model: 'qwen' }, async () => {
      inTask = RI.propose({ layer, repo, hat, path: 'lib/a.js', content: NEW, source: { kind: 'agent' } });
    }));
    const n = RI.get(inTask.inject ? inTask.inject.uuid : inTask.uuid || inTask.id);
    assert.ok(n && n.task, JSON.stringify(inTask).slice(0, 200));
    assert.deepStrictEqual([n.task.hat, n.task.provider, n.task.model, n.task.session], ['the_builder', 'ollama', 'qwen', 'sess-1']);
    const out = await quiet(() => RI.propose({ layer, repo, path: 'lib/c.js', content: 'module.exports = 3;\n' }));
    assert.strictEqual(RI.get(out.inject ? out.inject.uuid : out.uuid).task, null);
  });

  const base = { uuid: 'i-1', repoUuid: 'r1', path: 'lib/a.js', op: 'write', status: 'applied', hatName: 'the_builder', agentId: 'h1', source: { kind: 'agent' },
    content: NEW, before: 'const a = 1;\nmodule.exports = a;\n', creates: false, approvedBy: 'james', createdAt: 1000, appliedAt: 2000,
    task: { id: 'task-1', hat: 'the_builder', provider: 'ollama', model: 'qwen', session: 'sess-1', runId: null, title: 'make b' },
    evidence: { root: 'repo', tests: { ran: 2, linked: 2 }, regressions: 0, at: 1500 },
    history: [{ at: 1000, event: 'proposed' }, { at: 1500, event: 'evidence — 2/2 linked tests run, 0 regressed' }, { at: 2000, event: 'applied' }] };
  const runs = [{ runId: 'r1__sess-1', repoUuid: 'r1', goal: 'add b to a', attempt: 2, provider: 'ollama', status: 'done', filesChanged: ['lib/a.js'], startedAt: 500, updatedAt: 2500 }];
  const activity = [
    { kind: 'inject.applied', status: 'applied', actor: 'james', ref: 'i-1', ts: 2000 },
    { kind: 'version.commit', status: 'ok', actor: 'james', ref: 'c-77', ts: 2100, title: 'commit c-77', detail: { labels: [{ kind: 'agent', inject: 'i-1' }], refs: ['inject:i-1'] } },
    { kind: 'version.commit', status: 'ok', actor: 'x', ref: 'c-other', ts: 2200, detail: { labels: [{ inject: 'i-9' }] } },
  ];

  await test('CR-02', 'one record: lines changed, who, why (its run, by the task\'s session), checked, landed, timeline, undo', async () => {
    const r = CR.record(base, { activity, runs });
    assert.deepStrictEqual(r.what.lines, { added: 3, removed: 2 });
    assert.deepStrictEqual([r.who.agent, r.who.provider, r.who.model, r.who.approvedBy], ['the_builder', 'ollama', 'qwen', 'james']);
    assert.deepStrictEqual([r.why.run.runId, r.why.run.goal, r.why.run.attempt, r.why.run.how], ['r1__sess-1', 'add b to a', 2, 'task']);
    assert.deepStrictEqual(r.checked, { testsRan: 2, testsLinked: 2, regressions: 0, at: 1500, where: 'repo' });
    assert.deepStrictEqual(r.landed.map(c => [c.commitId, c.kind]), [['c-77', 'agent']], 'only the commit that names it');
    assert.deepStrictEqual(r.timeline.map(t => t.what), ['proposed', 'evidence — 2/2 linked tests run, 0 regressed', 'applied', 'version c-77']);
    assert.strictEqual(r.undo.possible, true); assert.match(r.undo.how, /writes back the content it replaced/); assert.match(r.undo.route, /injects\/i-1\/revert$/);
    assert.deepStrictEqual(r.holes, []);
    const L = CR.lines(r);
    assert.ok(L.some(l => /^why: add b to a — run r1__sess-1, attempt 2 \(task\)/.test(l)) && L.some(l => /^landed: version c-77/.test(l)), L.join('\n'));
  });

  await test('CR-03', 'no task kept: the run is matched by path and time and says so; nothing matching is a hole', async () => {
    const old = { ...base, task: null };
    const r = CR.record(old, { activity, runs });
    assert.strictEqual(r.why.run.how, 'matched by path and time');
    assert.deepStrictEqual(r.holes.map(h => h.what), ['task']);
    const far = CR.record({ ...old, createdAt: 10 * 60000 }, { activity, runs });
    assert.strictEqual(far.why.run, null);
    assert.deepStrictEqual(far.holes.map(h => h.what), ['task', 'run']);
  });

  await test('CR-04', 'applied with no version naming it and no evidence: each named; reverted cannot be undone again; proposed is rejected', async () => {
    const r = CR.record({ ...base, evidence: null }, { activity: [], runs });
    assert.deepStrictEqual(r.holes.map(h => h.what).sort(), ['checked', 'version']);
    assert.deepStrictEqual(CR.record({ ...base, status: 'reverted' }, { activity, runs }).undo, { possible: false, how: 'already undone' });
    const p = CR.record({ ...base, status: 'proposed', before: null }, { activity: [], runs, base: 'const a = 1;\nmodule.exports = a;\n' });
    assert.match(p.undo.how, /reject it/); assert.deepStrictEqual(p.what.lines, { added: 3, removed: 2 }, 'a proposal is counted against the file as it is');
    assert.ok(CR.record({ ...base, status: 'proposed', before: null }, { runs }).holes.some(h => h.what === 'lines'), 'no base given: the lines are a hole');
  });

  await test('CR-07', 'FR2: evidence from before 0.60.114 (tested in Nexus\'s tree) is a hole for a repo\'s change; a batch test is shown', async () => {
    const old = CR.record({ ...base, evidence: { tests: { ran: 2, linked: 2 }, regressions: 0 } }, { activity, runs });
    assert.strictEqual(old.checked.where, 'nexus');
    assert.ok(old.holes.some(h => h.what === 'checked' && /Nexus's tree, not this repo's/.test(h.why)));
    assert.ok(!CR.record({ ...base, target: { live: true }, evidence: { tests: { ran: 1, linked: 1 }, regressions: 0 } }, { activity, runs }).holes.length, 'a Nexus change tested in Nexus is right');
    const b = CR.record({ ...base, batch: { files: 3, linked: 4, ran: 4, regressions: 0, fixed: 1, root: 'repo' } }, { activity, runs });
    assert.ok(CR.lines(b).some(l => /^batch: tested with 3 file\(s\) together, 4\/4 linked tests, 0 regressed/.test(l)));
    const none = CR.record({ ...base, evidence: { root: null, tests: { ran: 0, linked: 0, skipped: 'not tested: this repo has no folder on disk to test the change in' }, regressions: 0 } }, { activity, runs });
    assert.ok(CR.lines(none).some(l => /^checked: not tested: this repo has no folder/.test(l)));
  });

  const api = await import('../../idearium/api/index.js');
  await test('CR-05', 'GET /api/repos/:uuid/changes and /changes/:id answer through the real router; the command row', async () => {
    await import('../../idearium/spec-engine/index.js');
    let made = null;
    for (let i = 0; i < 40; i++) { made = await api._route('POST', '/api/repos', { name: 'cr-fixture', bare: true, source: 'create' }); if (made.json && made.json.repo) break; await new Promise(r => setTimeout(r, 100)); }
    const uuid = made.json.repo.uuid;
    const p = await api._route('POST', `/api/repos/${uuid}/injects`, { path: 'src/x.js', content: 'module.exports = 1;\n' });
    assert.ok(p.status === 200 || p.status === 201, JSON.stringify(p.json).slice(0, 200));
    const list = await api._route('GET', `/api/repos/${uuid}/changes`);
    assert.strictEqual(list.status, 200, JSON.stringify(list.json).slice(0, 200));
    const d = list.json.data || list.json;
    assert.strictEqual(d.changes.length, 1); assert.strictEqual(d.changes[0].path, 'src/x.js'); assert.strictEqual(d.changes[0].status, 'proposed');
    const one = await api._route('GET', `/api/repos/${uuid}/changes/${d.changes[0].id}`);
    const o = one.json.data || one.json;
    assert.strictEqual(o.change.id, d.changes[0].id); assert.match(o.change.undo.how, /reject it/);
    assert.deepStrictEqual(o.change.what.lines, { added: 1, removed: 0 }, 'a new file: every line added');
    assert.ok(Array.isArray(o.lines) && o.lines.length);
    assert.strictEqual((await api._route('GET', `/api/repos/${uuid}/changes/nope`)).status, 404);
    const rc = require(path.join(ROOT, 'idearium/cli/route-commands.js'));
    const rows = rc.SPEC || rc.ROWS || rc; const row = rows.find(x => x.key === 'repo.record');
    // found building this: 'repo.changes' was taken (the proposals row) and the second was silently shadowed — keys are unique
    const seen = new Map(), dup = []; for (const x of rows) { if (seen.has(x.key)) dup.push(x.key); seen.set(x.key, 1); }
    assert.deepStrictEqual(dup, [], 'no two command rows share a key');
    assert.deepStrictEqual(row.req({ repo: { uuid: 'u' }, args: [], flags: { status: 'applied', limit: 5 } }), { method: 'GET', path: '/api/repos/u/changes?limit=5&status=applied' });
    assert.deepStrictEqual(row.req({ repo: { uuid: 'u' }, args: ['abc'], flags: {} }), { method: 'GET', path: '/api/repos/u/changes/abc' });
  });

  // CR-06 — the panel in Clear Glass (AXIOMS §4.1)
  const glass = require('../../clear-glass/src/driver/glass.js');
  const eng = glass.engine();
  if (!eng) { console.log('  - CR-06 SKIPPED: Clear Glass has no engine here — the browser check did not run'); skipped++; }
  else {
    let browser = null;
    try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - CR-06 SKIPPED: Clear Glass's engine (${eng.kind}) could not start (${e.message.split('\n')[0]})`); skipped++; }
    if (browser) {
      const UI = path.join(ROOT, 'idearium', 'ui');
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-ui-'));
      fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="panel"></div><script>
  const CALLS = []; const CURRENT_API_REPO = { uuid: 'r1' };
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  async function api(p) { CALLS.push(p);
    if (p.startsWith('/api/repos/r1/changes?')) return { changes: [{ id: 'i-1', path: 'lib/a.js', op: 'write', status: 'applied', lines: { added: 3, removed: 2 }, agent: 'the_builder', provider: 'ollama', goal: 'add b to a', runHow: 'task', checked: { testsRan: 2, testsLinked: 2, regressions: 0, where: 'repo' }, batch: { files: 2, ran: 2, linked: 2, regressions: 0 }, landed: ['c-77'], undo: true, holes: [] },
      { id: 'i-2', path: 'lib/old.js', op: 'write', status: 'applied', lines: null, agent: 'old_hat', goal: 'old goal', runHow: 'matched by path and time', checked: null, landed: [], undo: true, holes: ['task', 'version'] }] };
    if (p === '/api/repos/r1/changes/i-2') return { change: { id: 'i-2' }, lines: ['i-2 write lib/old.js — applied', 'missing version: it was applied but no version commit names it'] };
    throw new Error('unexpected ' + p); }
</script><script src="${pathToFileURL(path.join(UI, 'js', 'code-tab-panels.js')).href}"></script>
<script>CX.panel = 'changes'; function _cxPaintPanel() { document.getElementById('panel').innerHTML = _cxChanges(); }</script></body></html>`);
      try {
        const page = await browser.newPage();
        const errors = []; page.on('pageerror', e => errors.push(e.message));
        await page.goto(pathToFileURL(path.join(dir, 'index.html')).href);
        await test('CR-06', 'the changes panel: one row per change (what, who, why, checked, landed, undo), missing links in red; a row opens its record', async () => {
          await page.evaluate(() => cxChangesLoad(CURRENT_API_REPO));
          await page.waitForSelector('.cx-change[data-id="i-2"]');
          const rows = await page.$$eval('.cx-change', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
          assert.ok(/applied lib\/a\.js \+3 −2 the_builder/.test(rows[0]) && /add b to a/.test(rows[0]) && /checked 2\/2, 0 regressed in the repo's tree · batch of 2: 2\/2, 0 regressed · version c-77 · can be undone/.test(rows[0]), rows[0]);
          assert.ok(/\(matched by path and time\)/.test(rows[1]) && /missing task, version/.test(rows[1]), rows[1]);
          await page.click('.cx-change[data-id="i-2"]');
          await page.waitForFunction(() => /no version commit names it/.test((document.querySelector('.cx-change-detail') || {}).textContent || ''));
          assert.ok(await page.evaluate(() => CALLS.includes('/api/repos/r1/changes/i-2')));
          assert.deepStrictEqual(errors, []);
        });
      } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
    }
  }

  console.log(`\n  ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`);
  process.exit(failed ? 1 : 0);
})();
