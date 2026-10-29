'use strict';
/**
 * tests/modules/test-versionium-everywhere.test.js — every change and every version in Versionium, in full (§17.12, VE0–VE5, 0.60.278)
 * James, 2026-10-29: "can you add that to claude. full changes, and versions have to be pushed to versionium? enforce it everywhere that
 * you'd find it. maybe the axioms"
 *
 *   VE-01  record() commits to Versionium through its contract: branch, system, the running version, the change
 *   VE-02  Versionium down → the record waits (buffered, pending says it); it answers → drainBuffer delivers it; nothing dropped
 *   VE-03  a nexus-self apply and its rollback are each recorded with the whole change: each path's text before and after
 *   VE-04  wired: nexus-update records every row; the release sync defaults to every release's commits; tree snapshots name the version;
 *          versions.every_change no longer turns recording off; the route, the command and the Releases line; the law and CLAUDE.md
 *   VE-05  (0.60.279) Clear Glass settings: a burst of saves is one record of the keys that changed, secrets redacted; macros and node files wired
 *   VE-06  (0.60.279) the COS app: an install and a switch recorded through its own recorder; Versionium down → its outbox, then replayed in order
 *   VE-07  (0.60.279) a test process never writes into a real Versionium unless it opts in, and says so
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 've-'));
process.env.NEXUS_SELF_DIR = path.join(TMP, 'self');
process.env.NEXUS_VERSIONIUM_RECORD_IN_TESTS = '1';   // 0.60.279 — this test records into its own stand-in Versionium (below), never a real one

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 6).join('\n    ')}`); failed++; } }

(async () => {
  console.log('\n⬡  Every change and every version in Versionium\n');
  // a stand-in Versionium: POST /api/versionium/commit, as the real route answers it
  const got = [];
  const srv = http.createServer((req, res) => { let b = ''; req.on('data', c => b += c); req.on('end', () => {
    if (req.url === '/api/versionium/commit' && req.method === 'POST') { const body = JSON.parse(b); got.push(body); res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ ok: true, commit: { commitId: `c${got.length}`, branch: body.branch } })); }
    res.writeHead(404); res.end('{}'); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const cfg = require(path.join(ROOT, 'lib/nexus-config'));
  const realGet = cfg.getPath.bind(cfg);
  let versioniumPort = port;
  cfg.getPath = (k, d) => (k === 'ports' ? { ...(realGet('ports', {}) || {}), versionium: versioniumPort } : realGet(k, d));
  const VR = require(path.join(ROOT, 'lib/versionium-record.js'));
  const NC = require(path.join(ROOT, 'lib/nexus-client.js'));
  const V = require(path.join(ROOT, 'lib/version.js')).system;

  try {
    await test('VE-01', 'record() commits through Versionium\'s contract: branch, system, the running version, the change', async () => {
      const r = await VR.record({ kind: 'nexus-self.apply', system: 'guardian', message: 'applied a-1', change: { applyId: 'a-1' }, by: 'james' });
      assert.deepStrictEqual([r.ok, r.buffered, r.commitId], [true, false, 'c1'], JSON.stringify(r));
      const b = got[0];
      assert.deepStrictEqual([b.branch, b.system, b.causedBy, b.state.kind, b.state.version, b.state.by, b.state.change.applyId], ['nexus.nexus-self', 'nexus.guardian', 'nexus-self.apply', 'nexus-self.apply', V, 'james', 'a-1']);
      assert.deepStrictEqual(await VR.record({ kind: 'x' }), { ok: false, error: 'record needs kind and message' });
    });

    await test('VE-02', 'Versionium down → buffered and said by pending(); it answers → drained; nothing dropped', async () => {
      const before = VR.pending().count;
      versioniumPort = 1;   // nothing listens there
      const r = await VR.record({ kind: 'nexus.update.update', message: 'Nexus updated 0.60.277 → 0.60.278', change: { files: [] } });
      assert.deepStrictEqual([r.ok, r.buffered], [true, true], JSON.stringify(r));
      const p = VR.pending();
      assert.strictEqual(p.count, before + 1);
      assert.ok(p.items.some(i => i.path === '/api/versionium/commit' && /0\.60\.277 → 0\.60\.278/.test(i.what)), JSON.stringify(p.items));
      versioniumPort = port;
      const n = got.length;
      const d = await NC.drainBuffer();
      assert.ok(d.drained >= 1, JSON.stringify(d));
      assert.ok(got.slice(n).some(b => b.message === 'Nexus updated 0.60.277 → 0.60.278'), 'delivered once it answered');
      assert.strictEqual(VR.pending().count, 0, 'nothing left waiting');
    });

    await test('VE-03', 'a nexus-self apply and its rollback, each with the whole change: every path\'s text before and after', async () => {
      const live = path.join(TMP, 'live'); fs.mkdirSync(path.join(live, 'guardian'), { recursive: true });
      fs.writeFileSync(path.join(live, 'guardian/server.js'), 'module.exports = 1;\n');
      const store = require(path.join(ROOT, 'lib/nexus-self/store.js')), AP = require(path.join(ROOT, 'lib/nexus-self/apply.js'));
      const snap = store.snapshot({ liveRoot: live });
      const n = got.length;
      const a = AP.apply({ system: 'guardian', base: snap.hash, changes: [{ path: 'guardian/server.js', content: 'module.exports = 2;\n' }, { path: 'guardian/NEW.md', content: 'new\n' }], reason: 'a test change', by: 'james', liveRoot: live });
      assert.ok(a.ok, JSON.stringify(a));
      assert.ok(!('versionium' in JSON.parse(JSON.stringify(a))), 'the promise never rides into JSON');
      const ra = await a.versionium;
      assert.ok(ra.ok && !ra.buffered, JSON.stringify(ra));
      const b = got[n];
      assert.strictEqual(b.state.kind, 'nexus-self.apply'); assert.match(b.message, /applied apply-.* · guardian: a test change/);
      const byPath = Object.fromEntries(b.state.change.paths.map(p => [p.path, p]));
      assert.deepStrictEqual([byPath['guardian/server.js'].beforeText, byPath['guardian/server.js'].afterText], ['module.exports = 1;\n', 'module.exports = 2;\n']);
      assert.deepStrictEqual([byPath['guardian/NEW.md'].beforeText, byPath['guardian/NEW.md'].afterText], [null, 'new\n']);
      const rb = AP.rollback(a.applyId, { liveRoot: live });
      assert.ok(rb.ok, JSON.stringify(rb)); await rb.versionium;
      const c = got[got.length - 1];
      assert.strictEqual(c.state.kind, 'nexus-self.rollback');
      const back = Object.fromEntries(c.state.change.paths.map(p => [p.path, p]));
      assert.deepStrictEqual([back['guardian/server.js'].beforeText, back['guardian/server.js'].afterText], ['module.exports = 2;\n', 'module.exports = 1;\n']);
      assert.deepStrictEqual([back['guardian/NEW.md'].afterText, back['guardian/NEW.md'].op], [null, 'delete']);
      // past the cap: hashes and where the bytes are, said
      const big = VR.fullChange([{ path: 'x.bin', before: 'aa', after: 'bb' }], { readBlob: (s) => (s === 'aa' ? Buffer.alloc(10, 0) : Buffer.from('x'.repeat(300 * 1024))) });
      assert.match(big[0].note, /before binary; after 307200 bytes, over the 262144-byte cap/);
    });

    await test('VE-05', 'Clear Glass settings: one record per burst, only the keys that changed, secrets redacted; macros and node files wired', async () => {
      const n = got.length;
      const rec = VR.settingsRecorder({ kind: 'clear-glass.settings', system: 'clear-glass', label: 'Clear Glass settings', wait: 80 });
      rec({ theme: 'dark', apiKey: 'sk-old', accounts: { a: { label: 'Fiverr', password: 'p1' } } }, { theme: 'light', apiKey: 'sk-old', accounts: { a: { label: 'Fiverr', password: 'p1' } } });
      rec({ theme: 'light', apiKey: 'sk-old' }, { theme: 'light', apiKey: 'sk-new', accounts: { a: { label: 'Fiverr', password: 'p2' } } });
      await new Promise(r => setTimeout(r, 250));
      assert.strictEqual(got.length - n, 1, 'one record for the burst');
      const b = got[n]; assert.strictEqual(b.state.kind, 'clear-glass.settings'); assert.strictEqual(b.system, 'nexus.clear-glass');
      const keys = Object.fromEntries(b.state.change.keys.map(k => [k.key, k]));
      assert.deepStrictEqual([keys.theme.before, keys.theme.after], ['dark', 'light']);
      assert.deepStrictEqual([keys.apiKey.before, keys.apiKey.after, keys.apiKey.note], ['[redacted]', '[redacted]', 'secrets redacted']);
      assert.ok(keys.accounts.after.a.password === '[redacted]' && keys.accounts.after.a.label === 'Fiverr', JSON.stringify(keys.accounts));
      assert.ok(!JSON.stringify(b).includes('sk-new') && !JSON.stringify(b).includes('p2'), 'no secret leaves the machine');
      const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
      for (const f of ['clear-glass/src/options/store.js', 'clear-glass/src/site-settings/store.js']) assert.ok(/settingsRecorder\(/.test(rd(f)) && /this\._toVersionium\(this\._lastSaved, this\.data\)/.test(rd(f)), f);
      assert.ok(/_toVersionium\('create', a\.name, null, row\)/.test(rd('lib/agent-tools/tools/clear-glass/macro.js')) && /_toVersionium\('delete', a\.name, row, null\)/.test(rd('lib/agent-tools/tools/clear-glass/macro.js')));
      assert.ok(/kind: 'clear-glass\.node\.save'/.test(rd('lib/automation-nodes.js')));
    });

    await test('VE-06', 'the COS app: install and switch recorded by its own recorder; down → its outbox, replayed in order', async () => {
      process.env.VERSIONIUM_PORT = String(port);
      const CV = require(path.join(ROOT, 'cos/app/versionium.js'));
      const root = path.join(TMP, 'cos'); fs.mkdirSync(root, { recursive: true });
      const n = got.length;
      const r = await CV.record(root, { op: 'install', project: 'nexus', version: '0.60.279', sha256: 'abc', outcome: 'ok' });
      assert.ok(r.ok && r.commitId, JSON.stringify(r));
      assert.deepStrictEqual([got[n].branch, got[n].state.kind, got[n].message], ['cos.app', 'cos.app.install', 'COS: installed nexus 0.60.279']);
      process.env.VERSIONIUM_PORT = '1';
      const q1 = await CV.record(root, { op: 'switch', project: 'nexus', from: '0.60.278', to: '0.60.279' });
      const q2 = await CV.record(root, { op: 'rollback', project: 'nexus', from: '0.60.279', to: '0.60.278', reason: 'did not come up' });
      assert.ok(q1.queued && q2.queued && CV.pending(root).count === 2, JSON.stringify([q1, q2, CV.pending(root)]));
      process.env.VERSIONIUM_PORT = String(port);
      const m = got.length;
      const d = await CV.drain(root);
      assert.deepStrictEqual([d.sent, d.left, CV.pending(root).count], [2, 0, 0]);
      assert.deepStrictEqual(got.slice(m).map(b => b.state.kind), ['cos.app.switch', 'cos.app.rollback'], 'replayed in order');
      const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
      assert.ok(/importZip: importZipRecorded/.test(rd('cos/app/store.js')) && /remove: removeRecorded/.test(rd('cos/app/store.js')) && /importZipRecorded\(root, f, opts\)/.test(rd('cos/app/store.js')));
      assert.ok(/switchTo: switchToRecorded, rollback: rollbackRecorded/.test(rd('cos/app/switch.js')) && /V\.drain\(root\)/.test(rd('cos/app/controller.js')));
      assert.ok(/'cos\/app\/versionium\.js'/.test(rd('scripts/build-cos-app.js')), 'shipped in the exe');
    });
  } finally { srv.close(); cfg.getPath = realGet; }

  await test('VE-07', 'a test process never writes into a real Versionium unless it opts in, and says so', async () => {
    delete process.env.NEXUS_VERSIONIUM_RECORD_IN_TESTS;
    const r = await VR.record({ kind: 'x.y', message: 'would have gone to the real one' });
    assert.deepStrictEqual(r, { ok: true, skipped: 'a test process: not sent to a real Versionium' });
    const c = await require(path.join(ROOT, 'cos/app/versionium.js')).record(TMP, { op: 'install', project: 'nexus', version: '9.9.9' });
    assert.deepStrictEqual(c, { ok: true, skipped: 'a test process: not sent to a real Versionium' });
    process.env.NEXUS_VERSIONIUM_RECORD_IN_TESTS = '1';
  });

  await test('VE-04', 'wired everywhere it was found', async () => {
    const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
    const upd = rd('lib/nexus-update.js');
    assert.ok(/fs\.appendFileSync\(f, JSON\.stringify[\s\S]{0,200}_toVersionium\(root, row\);/.test(upd) && /kind: `nexus\.update\.\$\{row\.kind \|\| 'update'\}`/.test(upd), 'every update row');
    assert.ok(/commits: b\.recent \? 'recent' : \(b\.commits === false \? null : 'all'\)/.test(rd('versionium/routes/nexus-releases.js')), 'every release\'s commits by default');
    const api = rd('idearium/api/index.js');
    assert.ok(/ · Nexus \$\{nexusVersion\}/.test(api), 'tree snapshots name the version');
    assert.ok(!/if \(!on\) return \{ ok: true, commitId: null, skipped/.test(api) && /every change is recorded \(§17\.12\)/.test(api), 'versions.every_change no longer skips');
    assert.ok(/\['GET',\s+\['api','versionium','pending'\],\s+'versionium\.pending'\]/.test(api) && /case 'versionium\.pending'/.test(api));
    const { SPEC } = require(path.join(ROOT, 'idearium/cli/route-commands.js'));
    assert.strictEqual(SPEC.find(r => r.key === 'versionium.pending').req({ args: [], flags: {} }).path, '/api/versionium/pending');
    assert.ok(/waiting for Versionium/.test(rd('idearium/ui/js/repo-releases.js')) && /\/api\/versionium\/pending/.test(rd('idearium/ui/js/repo-releases.js')));
    assert.ok(/\*\*§17\.12 Every Change and Every Version Is Recorded in Versionium, in Full\*\*/.test(rd('docs/AXIOMS-v3.1.md')) && /^§17\.12 /m.test(rd('docs/AXIOMS-v3.1.md')));
    assert.ok(/§17\.12/.test(rd('CLAUDE.md')) && /lib\/versionium-record\.js/.test(rd('docs/CLAUDE.md')));
  });

  // VE-02's buffer lives in the sandbox (lib/test-sandbox.js maps NEXUS_DATA_ROOT); the temp tree goes
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exitCode = failed ? 1 : 0;
})();
