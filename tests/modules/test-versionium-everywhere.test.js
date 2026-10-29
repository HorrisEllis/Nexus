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
  } finally { srv.close(); cfg.getPath = realGet; }

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
