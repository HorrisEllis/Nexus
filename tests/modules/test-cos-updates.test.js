'use strict';
// run-all: timeout 180000
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-cos-updates.test.js — CE2 + CE4, 0.60.376 (docs/2026-11-02-cos-enterprise-phasemap.spec).
 * James, 2026-11-02: "i want toasts in cos ui for gibhub updates with a update tool. so i can update nexus automatically. per system"
 * Real git repos in a temp folder (an origin with a newer release that changes guardian/ and clear-glass/), COS's updates over a stand-in supervisor.
 *   CU-01  check: what GitHub has, per system — guardian restarts by itself, clear-glass waits for him; the git work runs in its own process
 *   CU-02  no backup, no update: refused, nothing moved, nothing restarted
 *   CU-03  update: a backup first (the stand-in answers), the fast-forward, guardian restarted by itself, clear-glass never; each step an event
 *   CU-04  keep mine and update: a diverged install's local commit kept on local/<date>, the folder at GitHub's commit, guardian restarted
 *   CU-05  one at a time: a second update while one runs is refused, said
 *   CU-06  wired: COS's contract declares the routes and the event, the shell loads the popup as the tool, the server answers both routes
 *   CU-07  the tool in Clear Glass: the card names the systems, Update now asks once more, then posts the update and shows what restarted,
 *          with a Restart button for what waits for him; a diverged folder offers Keep mine and update
 */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
if (!process.env.GLASS_CHROMIUM) { const c = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'; if (fs.existsSync(c) && !fs.existsSync(path.join(ROOT, 'node_modules/electron/dist/electron'))) process.env.GLASS_CHROMIUM = c; }
const { createUpdates } = require(path.join(ROOT, 'cos/manager/updates.js'));

let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 4).join('\n    ')}`); failed++; } }
const G = (cwd, ...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'init.defaultBranch=main', ...a], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const W = (d, f, s) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), s); };
const vjs = (v, q) => `const VERSION = {\n  system: '${v}',   // [${v}: James, 2026-11-02: "${q}" built it.]\n};\nmodule.exports = VERSION;\n`;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-updates-'));
const origin = path.join(tmp, 'origin.git'), seed = path.join(tmp, 'seed');
function setup() {
  G(tmp, 'init', '--bare', '-q', origin);
  fs.mkdirSync(seed); G(seed, 'init', '-q'); G(seed, 'remote', 'add', 'origin', origin);
  W(seed, 'VERSION', '0.1.0\n'); W(seed, 'lib/version.js', vjs('0.1.0', 'first')); W(seed, 'guardian/a.js', 'one\n'); W(seed, 'clear-glass/b.js', 'one\n'); W(seed, 'cortex/c.js', 'one\n');
  G(seed, 'add', '-A'); G(seed, 'commit', '-q', '-m', '0.1.0'); G(seed, 'push', '-q', 'origin', 'HEAD:main');
  for (const n of ['i1', 'i2', 'i3']) G(tmp, 'clone', '-q', '--branch', 'main', origin, path.join(tmp, n));
  W(seed, 'VERSION', '0.1.1\n'); W(seed, 'lib/version.js', vjs('0.1.1', 'per system')); W(seed, 'guardian/a.js', 'two\n'); W(seed, 'clear-glass/b.js', 'two\n');
  G(seed, 'add', '-A'); G(seed, 'commit', '-q', '-m', '0.1.1'); G(seed, 'push', '-q', 'origin', 'HEAD:main');
}
// a stand-in supervisor: three systems, each restart recorded
const supOf = () => { const restarted = []; return { restarted, list: () => ['guardian', 'clear-glass', 'cortex'].map(name => ({ name })), restart: (name) => { restarted.push(name); return { name, state: 'restarting' }; } }; };

(async () => {
  console.log('\n⬡  COS updates, per system (CE2, CE4)\n');
  setup();
  // the stand-in backup (Idearium's POST /api/nexus-self/backup)
  const bk = http.createServer((req, res) => { let b = ''; req.on('data', c => { b += c; }); req.on('end', () => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ok: true, snapshot: 'test-backup-cu', created: true })); }); });
  await new Promise(r => bk.listen(0, '127.0.0.1', r));
  const BK_URL = `http://127.0.0.1:${bk.address().port}/api/nexus-self/backup`;

  await test('CU-01', 'check: per system — guardian restarts by itself, clear-glass waits for him', async () => {
    const s = supOf(); const up = createUpdates(s, { root: path.join(tmp, 'i1') });
    const c = await up.check({ fetch: true });
    assert.ok(c.ok, c.error); assert.deepStrictEqual([c.current, c.latest, c.behind], ['0.1.0', '0.1.1', 1]);
    assert.deepStrictEqual(c.systems, ['clear-glass', 'guardian', 'lib']);
    // lib changed (version.js), so every supervised system restarts — except Clear Glass, which never restarts under him
    assert.deepStrictEqual([c.perSystem.restart.sort(), c.perSystem.waitForHim, c.perSystem.kernelChanged], [['cortex', 'guardian'], ['clear-glass'], true]);
    assert.strictEqual(s.restarted.length, 0, 'a check restarts nothing');
  });

  await test('CU-02', 'no backup, no update: refused, nothing moved, nothing restarted', async () => {
    const d = path.join(tmp, 'i1'), head = G(d, 'rev-parse', 'HEAD'); const s = supOf(); const ev = [];
    const prev = process.env.COS_UPDATE_BACKUP_URL; process.env.COS_UPDATE_BACKUP_URL = 'http://127.0.0.1:9/none';
    try {
      const up = createUpdates(s, { root: d, emit: (e, x) => ev.push(x) });
      const r = await up.apply({ mode: 'update', by: 'person' });
      assert.strictEqual(r.ok, false); assert.match(r.error, /no backup of Nexus was taken: the backup at .* did not answer/);
      assert.strictEqual(G(d, 'rev-parse', 'HEAD'), head); assert.deepStrictEqual(s.restarted, []);
      assert.deepStrictEqual(ev.map(x => x.phase), ['started', 'refused']);
    } finally { if (prev === undefined) delete process.env.COS_UPDATE_BACKUP_URL; else process.env.COS_UPDATE_BACKUP_URL = prev; }
  });

  process.env.COS_UPDATE_BACKUP_URL = BK_URL;
  await test('CU-03', 'update: backed up, fast-forwarded, each changed system restarted by itself, clear-glass never', async () => {
    const d = path.join(tmp, 'i1'); const s = supOf(); const ev = [];
    const up = createUpdates(s, { root: d, emit: (e, x) => ev.push([e, x.phase]) });
    const r = await up.apply({ mode: 'update', by: 'person' });
    assert.ok(r.ok, r.error); assert.deepStrictEqual([r.from.version, r.to.version], ['0.1.0', '0.1.1']);
    assert.strictEqual(r.backup.snapshot, 'test-backup-cu', 'the backup is on the row');
    assert.strictEqual(G(d, 'rev-parse', 'HEAD'), G(d, 'rev-parse', 'origin/main'));
    assert.deepStrictEqual(s.restarted.sort(), ['cortex', 'guardian']); assert.ok(!s.restarted.includes('clear-glass'));
    assert.ok(r.said.some(x => /clear-glass changed too: restart it when you are not using it/.test(x)));
    assert.deepStrictEqual(ev.map(x => x[1]), ['started', 'restarted', 'restarted', 'updated']); assert.ok(ev.every(x => x[0] === 'cos.update'));
  });

  await test('CU-04', 'keep mine and update: the local commit on local/<date>, the folder at GitHub\'s commit', async () => {
    const d = path.join(tmp, 'i2'); W(d, 'guardian/mine.js', 'his\n'); G(d, 'add', '-A'); G(d, 'commit', '-q', '-m', 'his local work'); const mine = G(d, 'rev-parse', 'HEAD');
    const s = supOf(); const up = createUpdates(s, { root: d });
    const c = await up.check({ fetch: true });
    assert.strictEqual(c.ahead, 1); assert.match(c.can, /keep-local/);
    const r = await up.apply({ mode: 'keep-local', by: 'person' });
    assert.ok(r.ok, r.error); assert.match(r.keptOn, /^local\//);
    assert.strictEqual(G(d, 'rev-parse', 'HEAD'), G(d, 'rev-parse', 'origin/main')); assert.strictEqual(G(d, 'rev-parse', r.keptOn), mine, 'nothing lost');
    assert.ok(s.restarted.includes('guardian'));
  });

  await test('CU-05', 'one at a time: a second update while one runs is refused, said', async () => {
    const d = path.join(tmp, 'i3'); const s = supOf(); const up = createUpdates(s, { root: d });
    const first = up.apply({ mode: 'update', by: 'person' }); const second = await up.apply({ mode: 'update', by: 'person' });
    assert.strictEqual(second.ok, false); assert.match(second.error, /an update is already running \(update/);
    const r = await first; assert.ok(r.ok, r.error); assert.strictEqual(up.busy(), null, 'free again');
  });

  await test('CU-06', 'wired: the contract, the shell, the server', () => {
    const C = JSON.parse(fs.readFileSync(path.join(ROOT, 'cos/manager/contract.json'), 'utf8'));
    for (const p of ['/api/cos/update', '/api/cos/update/apply']) assert.ok(C.routes.some(r => r.path === p), p);
    assert.ok(C.events['cos.update']);
    const shell = C.pages.find(p => p.id === 'shell'); for (const r of ['GET /api/cos/update', 'POST /api/cos/update/apply']) assert.ok(shell.routes.includes(r), r);
    assert.match(fs.readFileSync(path.join(ROOT, 'cos/ui/shell/index.html'), 'utf8'), /update-popup\.js" data-api="\/api\/cos\/update\/notice" data-tool="cos"/);
    const src = fs.readFileSync(path.join(ROOT, 'cos/manager/server.js'), 'utf8');
    assert.ok(/p === '\/api\/cos\/update'\) return send\(res, 200, await updates\.check/.test(src) && /p === '\/api\/cos\/update\/apply'\) \{ if \(!needBy\(\)\) return; const r = await updates\.apply/.test(src));
  });
  delete process.env.COS_UPDATE_BACKUP_URL;

  // CU-07 — the tool on the card, in Clear Glass, over stand-in routes
  let D = { ok: true, current: '0.1.0', latest: '0.1.1', behind: 3, ahead: 0, releases: [{ version: '0.1.1', quote: 'per system' }], perSystem: { restart: ['guardian', 'cortex'], waitForHim: ['clear-glass'], kernelChanged: false, cosChanged: false }, plan: { blocks: [] } };
  const posts = [];
  const N = { ok: true, show: true, kind: 'available', title: 'Nexus 0.1.1 is available', text: '', current: '0.1.0', latest: '0.1.1', at: new Date().toISOString() };
  const PAGE = '<!doctype html><html><body><script src="/update-popup.js" data-api="/api/cos/update/notice" data-tool="cos"></script></body></html>';
  const srv = http.createServer((req, res) => {
    const u = req.url; let b = ''; req.on('data', c => { b += c; }); req.on('end', () => {
      const j = (x) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(x)); };
      if (u === '/update-popup.js') { res.setHeader('Content-Type', 'application/javascript; charset=utf-8'); return res.end(fs.readFileSync(path.join(ROOT, 'lib/ui/update-popup/update-popup.js'))); }
      if (u.startsWith('/api/cos/update/notice')) return j(N);
      if (u.startsWith('/api/cos/update/apply')) { posts.push(['apply', JSON.parse(b)]); return j({ ok: true, action: 'updated', from: { version: '0.1.0' }, to: { version: '0.1.1' }, perSystem: D.perSystem, restarted: [{ name: 'guardian', ok: true }, { name: 'cortex', ok: true }], said: ['clear-glass changed too: restart it when you are not using it (never restarted under you)'], keptOn: JSON.parse(b).mode === 'keep-local' ? 'local/2026-11-02-10-00-00' : null }); }
      if (u.startsWith('/api/cos/update')) return j(D);
      if (/^\/api\/cos\/systems\/[^/]+\/restart/.test(u)) { posts.push(['restart', u.split('/')[4], JSON.parse(b)]); return j({ ok: true, system: { state: 'restarting' } }); }
      res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(PAGE);
    });
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const glass = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
  let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - CU-07 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); }
  if (browser) {
    await test('CU-07', 'the tool: systems named, Update now asks once more, then posts and shows what restarted; Keep mine when diverged', async () => {
      const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
      await page.goto(`http://127.0.0.1:${srv.address().port}/`);
      await page.waitForSelector('.nx-upd [data-a="go"]');
      const t = await page.evaluate(() => document.querySelector('.nx-upd').textContent);
      assert.ok(/Nexus 0\.1\.1 is on GitHub/.test(t) && /per system/.test(t) && /guardianrestarts by itself/.test(t) && /cortexrestarts by itself/.test(t) && /clear-glasswaits for you/.test(t) && /Update now/.test(t), t);
      if (process.env.UP_SHOTS) await page.screenshot({ path: path.join(process.env.UP_SHOTS, 'cos-update-tool.png') });
      await page.evaluate(() => document.querySelector('.nx-upd [data-a="go"]').click());
      assert.match(await page.evaluate(() => document.querySelector('.nx-upd [data-a="go"]').textContent), /Confirm: update and restart 2/);
      assert.strictEqual(posts.length, 0, 'nothing posted before the confirm');
      await page.evaluate(() => document.querySelector('.nx-upd [data-a="go"]').click());
      await page.waitForSelector('.nx-upd [data-a="restart:clear-glass"]');
      assert.deepStrictEqual(posts[0], ['apply', { by: 'person', mode: 'update' }]);
      const r = await page.evaluate(() => document.querySelector('.nx-upd').textContent);
      assert.ok(/Updated/.test(r) && /0\.1\.0 → 0\.1\.1/.test(r) && /guardianrestarted/.test(r) && /clear-glasswaits for you/.test(r) && /Restart clear-glass/.test(r), r);
      await page.evaluate(() => document.querySelector('.nx-upd [data-a="restart:clear-glass"]').click());
      await page.waitForFunction(() => /restarted/.test(document.querySelector('.nx-upd [data-a="restart:clear-glass"]').textContent));
      assert.deepStrictEqual(posts[1], ['restart', 'clear-glass', { by: 'person' }]);
      // diverged: the same card offers Keep mine and update, with the local commits named
      D = { ...D, ahead: 1, local: { count: 1, onGitHub: 0, commits: [{ commit: 'abc1234567', subject: 'his local work', onGitHub: false }] } };
      await page.evaluate(() => NexusUpdatePopup.poll()); await page.waitForSelector('.nx-upd [data-a="go"]');
      const k = await page.evaluate(() => document.querySelector('.nx-upd').textContent);
      assert.ok(/Keep mine and update/.test(k) && /1 commit\(s\) GitHub lacks/.test(k) && /nothing is lost/.test(k), k);
      await page.evaluate(() => { const b = document.querySelector('.nx-upd [data-a="go"]'); b.click(); b.click(); });
      await page.waitForFunction(() => /local\/2026/.test(document.querySelector('.nx-upd').textContent));
      assert.deepStrictEqual(posts[2], ['apply', { by: 'person', mode: 'keep-local' }]);
    });
    await browser.close();
  }
  srv.close(); bk.close(); fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
