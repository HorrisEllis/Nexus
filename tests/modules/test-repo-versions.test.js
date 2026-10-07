'use strict';
/**
 * tests/modules/test-repo-versions.test.js — §0.40.0 VR1: every change to a repo's files is a versionium commit.
 * James: "needs to snapshot every accept, every change, diff, write, only the changes. like github."
 * The real Idearium API (api._route); versionium's own routes (versionium/routes/*.js) served on versionium's configured
 * port, as its server serves them, on a sandboxed store.
 */
process.env.NEXUS_VERSION_SETTLE_MS = '150';
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };
const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('\n⬡  VR1 — every change a commit\n');
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

  const api = await quiet(() => import(pathToFileURL(path.join(ROOT, 'idearium/api/index.js')).href));
  const R = (m, p, b) => quiet(() => api._route(m, p, b));
  const RV = require(path.join(ROOT, 'lib/repo-versions.js'));
  const RAct = require(path.join(ROOT, 'lib/repo-activity.js'));
  const AL = require(path.join(ROOT, 'lib/activity-log/compartment.js'));
  const repoUuid = await quiet(async () => {
    const w = (await R('POST', '/api/workshop', { from: { kind: 'blank' }, title: 'Ledger Grove' })).json.workshop;
    await R('POST', `/api/workshop/${w.uuid}`, { sections: [{ id: 'purpose', body: 'A grove of versions.' }] });
    return (await R('POST', `/api/workshop/${w.uuid}/save`, {})).json.repoUuid;
  });
  await quiet(() => RV.flush(repoUuid));                      // the workshop's own spec write: its first commit
  const commits = async () => (await R('GET', `/api/repos/${repoUuid}/snapshots`)).json;
  const list = async () => { const j = await commits(); return j.snapshots || j.commits || j.data || []; };
  const provOf = async (c) => {
    const id = c.commitId || c.uuid;
    const s = (await R('GET', `/api/repos/${repoUuid}/snapshots/${id}`)).json;
    return { id, provenance: (s.record && s.record.provenance) || null, files: (s.record && s.record.files) || null };
  };
  const vrows = () => AL.list(repoUuid, { kind: 'version', limit: 50 }).rows || AL.list(repoUuid, { kind: 'version', limit: 50 });

  await test('VR-01', "a person's write is one commit, with only the changed file sent", async () => {
    const before = (await list()).length;
    const w = await R('POST', `/api/repos/${repoUuid}/file`, { path: 'notes.md', content: '# notes\n' });
    assert.ok(w.json && !w.json.error, JSON.stringify(w.json));
    const r = await quiet(() => RV.flush(repoUuid));
    assert.ok(r && r.ok && r.commitId, JSON.stringify(r));
    const after = await list();
    assert.strictEqual(after.length, before + 1, JSON.stringify(after.map(c => c.message)));
    const p = await provOf(after.find(c => (c.commitId || c.uuid) === r.commitId) || after[0]);
    assert.deepStrictEqual(p.provenance.files, [{ path: 'notes.md', op: 'write' }]);
    assert.ok(p.files && p.files.changedFiles === 1, JSON.stringify(p.files));
  });

  await test('VR-02', 'six writes by an agent wearing the hat settle into ONE commit, named for the agent and its task', async () => {
    const before = (await list()).length;
    let taskId;
    await RAct.run({ repoUuid, hat: 'grove-agent', kind: 'chat', message: 'write six files' }, async () => {
      taskId = RAct.current().id;
      for (let i = 1; i <= 6; i++) await R('POST', `/api/repos/${repoUuid}/file`, { path: `src/f${i}.js`, content: `module.exports = ${i};\n` });
      return { ok: true };
    });
    await wait(400); await quiet(() => RV.flush(repoUuid));
    const after = await list();
    assert.strictEqual(after.length, before + 1);
    const row = vrows().find(x => x.kind === 'version.commit' && /6 files/.test(x.title));
    assert.ok(row && row.actor === 'grove-agent' && row.detail.refs.includes(taskId), JSON.stringify(row));
  });

  await test('VR-03', 'a proposal is not a commit; accepting it is — by the approver, with the proposal named', async () => {
    const before = (await list()).length;
    const c = await R('POST', `/api/repos/${repoUuid}/injects`, { path: 'src/f1.js', content: 'module.exports = "one";\n' });
    const inj = c.json.inject || c.json;
    await wait(300); await quiet(() => RV.flush(repoUuid));
    assert.strictEqual((await list()).length, before, 'proposing committed something');
    const a = await R('POST', `/api/repos/${repoUuid}/injects/${inj.uuid}/apply`, { approvedBy: 'james' });
    assert.ok(a.json && !a.json.error, JSON.stringify(a.json).slice(0, 300));
    const r = await quiet(() => RV.flush(repoUuid));
    assert.ok(r && r.ok, JSON.stringify(r));
    const row = vrows().find(x => x.ref === r.commitId);
    assert.ok(row && /james/.test(row.actor) && row.detail.refs.includes(`inject:${inj.uuid}`), JSON.stringify(row));
  });

  await test('VR-04', 'versionium down: nothing lost — said once, kept, committed when it is back', async () => {
    await stopV();
    await R('POST', `/api/repos/${repoUuid}/file`, { path: 'later.md', content: 'after the outage\n' });
    const r = await quiet(() => RV.flush(repoUuid));
    assert.ok(r && !r.ok);
    assert.deepStrictEqual(RV.pending(repoUuid).files, ['later.md']);
    assert.ok(vrows().some(x => x.kind === 'version.failed' && /later\.md/.test(x.title)));
    await startV();
    const r2 = await quiet(() => RV.flush(repoUuid));
    assert.ok(r2 && r2.ok && !RV.pending(repoUuid), JSON.stringify(r2));
  });

  await test('VR-05', 'a delete is a commit too; the hook is the repo layer itself (one door)', async () => {
    const d = await R('DELETE', `/api/repos/${repoUuid}/file?path=notes.md`, {});
    assert.ok(d.json && !d.json.error, JSON.stringify(d.json));
    const r = await quiet(() => RV.flush(repoUuid));
    const row = vrows().find(x => x.ref === r.commitId);
    assert.ok(row && row.detail.files.some(f => f.path === 'notes.md' && f.op === 'delete'), JSON.stringify(row));
    const src = fs.readFileSync(path.join(ROOT, 'idearium/repo/index.js'), 'utf8');
    assert.strictEqual((src.match(/_touched\(repoUuid/g) || []).length, 3);
  });

  if (up) await stopV();
  console.log(`\n  ${passed} passed · ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
