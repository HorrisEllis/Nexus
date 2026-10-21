'use strict';
/**
 * tests/modules/test-approval-chain.test.js — APV1–APV4 (0.60.190). Map: docs/2026-10-21-approval-chain-phasemap.spec.
 * Spec: docs/approval-chain.spec. James, 2026-10-21: "make sure it's all interconnected, changes are logged and the diff snapshotted in
 * versionium with a change log when approved. what about an api route or the pulse emission system"
 *
 * The real Idearium API (api._route) and versionium's own routes on a sandboxed store, as test-repo-versions does.
 *   APC-01  change-entry: an inject and its run → title, why, files ±, proposer, approver, run, phase, who started the run; unknown is null
 *   APC-02  approved: ONE commit whose message is the entry's title and whose provenance.changelog holds it (resolved from the real run row);
 *           the activity log's version.commit row says it
 *   APC-03  a failed commit keeps its entries; a gate approval's entries wait by system and go back if the sync commit fails
 *   APC-04  GET /api/repos/:uuid/changelog: the commit with its entry, newest first; `repo changelog` prints it
 *   APC-05  emitted on the orchestrator's ledger through postDurable: change.approved, then version.commit with the same inject; never
 *           awaited by the step; counted on GET /api/ledger/out (`ledger out`)
 *   APC-06  the drawer's Versions view shows each commit's change-log line (driven by Clear Glass)
 */
process.env.NEXUS_VERSION_SETTLE_MS = '150';
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };
const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('\n⬡  APV — the approval chain\n');
  const CE = require(path.join(ROOT, 'lib/change-entry.js'));

  await test('APC-01', 'change-entry: title, why, files ±, proposer, approver, run, phase, starter; unknown is null', () => {
    const n = { uuid: 'inj-1', path: 'src/a.js', op: 'write', status: 'applied', before: 'a\nb\nc\n', content: 'a\nB\nc\nd\n', approvedBy: 'james',
      hatName: 'repo-agent', source: { kind: 'agent', runId: 'run-9', goal: 'make b loud' }, appliedAt: 5 };
    const e = CE.entry(n, { run: { phase: 'SH1_storage', map: 'docs/shop-phasemap.spec', startedBy: { who: 'agent:listener', whence: 'declared' } } });
    assert.deepStrictEqual(e.files, [{ path: 'src/a.js', op: 'write', added: 2, removed: 1 }]);
    assert.deepStrictEqual([e.approvedBy, e.proposedBy, e.run, e.phase, e.startedBy.who, e.why, e.status], ['james', 'repo-agent', 'run-9', 'SH1_storage', 'agent:listener', 'make b loud', 'applied']);
    assert.strictEqual(e.title, 'SH1_storage · src/a.js: make b loud (+2 −1) — approved by james');
    const bare = CE.entry({ uuid: 'inj-2', path: 'x.md', op: 'write', status: 'applied', before: null, content: 'x\n', approvedBy: 'idearium', source: { kind: 'person' } });
    assert.deepStrictEqual([bare.run, bare.phase, bare.startedBy, bare.why, bare.approvedBy, bare.files[0].added], [null, null, null, null, 'person', 1], 'never guessed');
  });

  const routes = [require(path.join(ROOT, 'versionium/routes/versionium.js')), require(path.join(ROOT, 'versionium/routes/files.js'))];
  const port = require(path.join(ROOT, 'lib/nexus-config.js')).getPath('ports', {}).versionium;
  let up = null;
  const startV = () => new Promise((res, rej) => { const sv = http.createServer(async (req, rs) => {
    const url = new URL(req.url, 'http://x'); const ctx = { method: req.method, url, pathname: url.pathname };
    for (const r of routes) { try { if (await r.handle(req, rs, ctx)) return; } catch (e) { rs.writeHead(500); rs.end(JSON.stringify({ ok: false, error: e.message })); return; } }
    rs.writeHead(404); rs.end('{}'); });
    sv.once('error', rej); sv.listen(port, '127.0.0.1', () => { up = sv; res(); }); });
  const stopV = () => new Promise(r => { up.close(() => r()); up = null; });
  await startV().catch(e => { console.error(`  ✗ versionium's port ${port} is taken (${e.code}) — cannot run`); process.exit(1); });

  // the pulse/event spine, captured where Idearium hands it over (the client every system uses), never a live orchestrator
  const NC = require(path.join(ROOT, 'lib/nexus-client.js'));
  const sent = []; const realPD = NC.postDurable;
  NC.postDurable = async (system, p, body) => { sent.push({ system, path: p, body }); return { ok: true, buffered: false }; };

  const api = await quiet(() => import(pathToFileURL(path.join(ROOT, 'idearium/api/index.js')).href));
  const R = (m, p, b) => quiet(() => api._route(m, p, b));
  const RV = require(path.join(ROOT, 'lib/repo-versions.js'));
  const RI = require(path.join(ROOT, 'lib/repo-inject.js'));
  const AL = require(path.join(ROOT, 'lib/activity-log/compartment.js'));
  const DB = await import(pathToFileURL(path.join(ROOT, 'idearium/lib/db.js')).href);
  const repoUuid = await quiet(async () => {
    const w = (await R('POST', '/api/workshop', { from: { kind: 'blank' }, title: 'Approval Grove' })).json.workshop;
    await R('POST', `/api/workshop/${w.uuid}`, { sections: [{ id: 'purpose', body: 'A grove of approvals.' }] });
    return (await R('POST', `/api/workshop/${w.uuid}/save`, {})).json.repoUuid;
  });
  await quiet(async () => { await R('POST', `/api/repos/${repoUuid}/file`, { path: 'src/a.js', content: 'a\nb\nc\n' }); await RV.flush(repoUuid); });
  const record = async (id) => ((await R('GET', `/api/repos/${repoUuid}/snapshots/${id}`)).json.record || {});

  let approvedInject = null, approvedCommit = null;
  await test('APC-02', 'approved: one commit, its message the entry, provenance.changelog resolved from the real run row; the log says it', async () => {
    DB.appendRow('idearium_phase_runs', { uuid: 'run-apc-building', runId: 'run-apc', repoUuid, map: 'docs/grove-phasemap.spec', phase: 'GR1_loud_b', title: 'loud b', state: 'building', startedBy: { who: 'agent:listener', whence: 'declared' }, ts: Date.now() });
    const p = RI.propose({ layer: api.getRepoLayer(), repo: api.getRepoLayer().get(repoUuid), path: 'src/a.js', content: 'a\nB\nc\nd\n', source: { kind: 'agent', runId: 'run-apc', goal: 'make b loud' } });
    assert.ok(p.ok, JSON.stringify(p.errors));
    approvedInject = p.inject.uuid;
    sent.length = 0;
    const a = await R('POST', `/api/repos/${repoUuid}/injects/${approvedInject}/apply`, { approvedBy: 'james' });
    assert.ok(a.json && !a.json.error, JSON.stringify(a.json).slice(0, 300));
    const r = await quiet(() => RV.flush(repoUuid));
    assert.ok(r && r.ok && r.commitId, JSON.stringify(r));
    approvedCommit = r.commitId;
    const want = 'GR1_loud_b · src/a.js: make b loud (+2 −1) — approved by james';
    const rec = await record(r.commitId);
    assert.deepStrictEqual((rec.provenance.changelog || []).map(e => [e.title, e.run, e.startedBy && e.startedBy.who, e.inject]), [[want, 'run-apc', 'agent:listener', approvedInject]]);
    const row = AL.list(repoUuid, { kind: 'version', limit: 20 }).rows.find(x => x.ref === r.commitId);
    assert.ok(row && row.title === `commit ${r.commitId} — ${want}`, row && row.title);
  });

  await test('APC-03', 'a failed commit keeps its entries; gate entries wait by system and go back on a failed sync commit', async () => {
    await stopV();
    const p = RI.propose({ layer: api.getRepoLayer(), repo: api.getRepoLayer().get(repoUuid), path: 'src/b.js', content: 'b\n', source: { kind: 'person' } });
    await R('POST', `/api/repos/${repoUuid}/injects/${p.inject.uuid}/apply`, { approvedBy: 'james' });
    const bad = await quiet(() => RV.flush(repoUuid));
    assert.ok(bad && !bad.ok, 'versionium is down');
    await startV();
    const good = await quiet(() => RV.flush(repoUuid));
    assert.ok(good && good.ok, JSON.stringify(good));
    assert.deepStrictEqual(((await record(good.commitId)).provenance.changelog || []).map(e => e.inject), [p.inject.uuid], 'the entry survived the outage');
    RI.returnGateEntries('guardian', [{ inject: 'g1', title: 't1' }]); RI.returnGateEntries('guardian', [{ inject: 'g0', title: 't0' }]);
    const took = RI.takeGateEntries('guardian');
    assert.deepStrictEqual(took.map(e => e.inject), ['g0', 'g1']);
    assert.deepStrictEqual(RI.takeGateEntries('guardian'), [], 'taken once');
    RI.returnGateEntries('guardian', took);
    assert.deepStrictEqual(RI.takeGateEntries('guardian').map(e => e.inject), ['g0', 'g1'], 'back when the sync commit fails');
    const src = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    assert.ok(/const changes = RIq\.takeGateEntries\(system\);/.test(src) && /if \(!r\.ok\) \{ RIq\.returnGateEntries\(system, changes\);/.test(src), 'the sync commit takes and returns them');
  });

  await test('APC-04', 'GET …/changelog: each commit with its entries, newest first; `repo changelog` prints it', async () => {
    const j = (await R('GET', `/api/repos/${repoUuid}/changelog`)).json;
    assert.ok(j.rows.length >= 2 && j.rows.every(r => r.entries.length), JSON.stringify(j).slice(0, 300));
    const mine = j.rows.find(r => r.commitId === approvedCommit);
    assert.ok(mine && mine.entries[0].inject === approvedInject && mine.entries[0].phase === 'GR1_loud_b');
    assert.ok(j.rows[0].ts >= j.rows[j.rows.length - 1].ts, 'newest first');
    const all = (await R('GET', `/api/repos/${repoUuid}/changelog?all=1`)).json;
    assert.ok(all.rows.some(r => !r.entries.length), '--all keeps the plain commits');
    const { SPEC } = require(path.join(ROOT, 'idearium/cli/route-commands.js'));
    const row = SPEC.find(r => r.key === 'repo.changelog');
    const out = []; const l = console.log; console.log = (s) => out.push(String(s));
    const id = (s) => s; try { row.print(j, { repo: { name: 'grove' }, flags: {} }, { c: { amber: id, dim: id, gray: id, mint: id, coral: id } }); } finally { console.log = l; }
    assert.ok(out.some(s => s.includes('GR1_loud_b · src/a.js: make b loud (+2 −1) — approved by james') && s.includes('by agent:listener')), out.join('\n'));
  });

  await test('APC-05', 'on the orchestrator\'s ledger: change.approved then version.commit, same inject; counted on /api/ledger/out', async () => {
    await wait(50);
    // APC-02's approval, as it went out (sent was cleared just before it)
    const types = sent.filter(s => s.system === 'orchestrator' && s.path === '/api/ledger').map(s => s.body.type);
    const ia = types.indexOf('idearium.change.approved'), ic = types.indexOf('idearium.version.commit');
    assert.ok(ia >= 0 && ic > ia, JSON.stringify(types));
    const ap = sent[ia].body, vc = sent[ic].body;
    assert.strictEqual(ap.system, 'idearium');
    assert.strictEqual(ap.payload.entry.inject, approvedInject);
    assert.deepStrictEqual(vc.payload.changelog.map(e => e.inject), [approvedInject]);
    assert.strictEqual(vc.payload.commitId, approvedCommit);
    const o = (await R('GET', '/api/ledger/out')).json;
    assert.ok(o.sent >= 2 && o.failed === 0, JSON.stringify(o));
    const src = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    assert.ok(!/await _emitLedger\(/.test(src), 'never awaited by the step it reports');
    assert.ok(/_emitLedger\('idearium\.phase\.run\.started', \{ runId, repoUuid: repo\.uuid, map, phase, title: node\.title \|\| null, startedBy: base\.startedBy/.test(src), 'a run says who started it on the ledger too');
  });
  NC.postDurable = realPD;
  await stopV();

  await test('APC-06', 'the drawer\'s Versions view: each commit\'s change-log line, approved and reverted (Clear Glass)', async () => {
    const glass = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apc-ui-'));
    const css = fs.readFileSync(path.join(ROOT, 'idearium/ui/css/repo-tasks.css'), 'utf8');
    const snaps = { snapshots: [
      { commitId: 'c2', ts: 2, message: 'GR1_loud_b · src/a.js: make b loud (+2 −1) — approved by james', provenance: { files: [{ path: 'src/a.js', op: 'write' }], changelog: [
        { title: 'GR1_loud_b · src/a.js: make b loud (+2 −1) — approved by james', status: 'applied', run: 'run-apc', startedBy: { who: 'agent:listener' }, inject: 'i1' }] } },
      { commitId: 'c1', ts: 1, message: '1 file: notes.md — by person', provenance: { files: [{ path: 'notes.md', op: 'write' }], changelog: [
        { title: 'src/b.js (+0 −1) — reverted by person', status: 'reverted', run: null, inject: 'i0' }] } }] };
    fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
<div id="plan-panel"><div class="pp-log"><div id="rt-filters"></div><div id="rt-list"></div></div></div>
<script>
  let RT_VIEW = 'versions';
  const _rtEl = (id) => document.getElementById(id), _rtCurrent = () => 'r1', _rtDrawerOpen = () => true;
  const _rtEsc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  async function api(p) { return p.endsWith('/snapshots') ? ${JSON.stringify(snaps)} : {}; }
</script>
<script src="${pathToFileURL(path.join(ROOT, 'idearium/ui/js/repo-drawer-views.js')).href}"></script>
</body></html>`);
    const browser = await glass.chromium.launch();
    try {
      const page = await browser.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(pathToFileURL(path.join(dir, 'index.html')).href);
      await page.evaluate(() => rtVersionsLoad());
      await page.waitForSelector('#rt-list .rt-cl');
      const lines = await page.$$eval('#rt-list .rt-cl', els => els.map(e => [e.textContent.trim(), e.classList.contains('rv')]));
      assert.deepStrictEqual(lines, [['✓ GR1_loud_b · src/a.js: make b loud (+2 −1) — approved by james · run run-apc by agent:listener', false], ['↺ src/b.js (+0 −1) — reverted by person', true]]);
      assert.deepStrictEqual(errors, []);
    } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
