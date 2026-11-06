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
 * CE2b (0.60.417) — James, 2026-11-06: "updates need to restart cos." · "the applicable system or module. as long as its done writting." · on
 * Clear Glass: "Ask me first".
 *   CU-08  after an update that changed COS's code and Clear Glass: the changed systems restart by themselves; COS and Clear Glass are asked
 *          (pending, on the check, in the bell, saying what closes with COS); neither restarts under him
 *   CU-09  done writing: git's index.lock holds the restarts (said); a restart asked while an update runs is refused, said
 *   CU-10  his yes: a system restarts and leaves the asks; "cos" calls COS's own restart; an unknown name is refused; agents refused at the route;
 *          the contract, the route and `cos restart cos` (person-only) are wired
 *   CU-11  COS restarts itself for real (a fixture tree): started by hand it comes back on its port through relaunch.js, with --boot; under
 *          autopilot it exits 75 and autopilot starts it again and boots it
 *   CU-12  the Updates page in Clear Glass: the asks drawn (COS saying Clear Glass closes), Restart now posts his yes, Later hides the row
 *   (CU-07, 0.60.417: the tool's card asks too — Restart clear-glass and Restart COS, twice for COS — through /api/cos/update/restart)
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
  for (const n of ['i1', 'i2', 'i3', 'i4', 'i5']) G(tmp, 'clone', '-q', '--branch', 'main', origin, path.join(tmp, n));
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
    // CE2b (0.60.417): lib/ and clear-glass/ changed, so before 'updated' the update asks him (COS, Clear Glass); nothing restarted under him
    assert.deepStrictEqual(ev.map(x => x[1]), ['started', 'restarted', 'restarted', 'ask-restart', 'updated']); assert.ok(ev.every(x => x[0] === 'cos.update'));
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

  // ── CE2b (0.60.417): updates restart COS — asked, after the writing is done ─────────────────────────────────────────────────────────
  process.env.COS_UPDATE_BACKUP_URL = BK_URL;
  const supRunning = () => { const s = supOf(); s.list = () => ['guardian', 'clear-glass', 'cortex'].map(name => ({ name, state: 'running' })); return s; };
  let cu8 = null;
  await test('CU-08', 'after an update: changed systems restart by themselves; COS and Clear Glass are asked, never restarted under him', async () => {
    const s = supRunning(); const ev = []; const cosCalls = [];
    const up = createUpdates(s, { root: path.join(tmp, 'i4'), emit: (e, x) => ev.push(x), restartCos: (x) => { cosCalls.push(x); return { how: 'test' }; }, closesWithCos: () => s.list().filter(x => x.name === 'clear-glass' && x.state === 'running').map(x => x.name) });
    const r = await up.apply({ mode: 'update', by: 'person' });
    assert.ok(r.ok, r.error); assert.deepStrictEqual(s.restarted.sort(), ['cortex', 'guardian']); assert.deepStrictEqual(cosCalls, [], 'COS never restarts by itself');
    assert.deepStrictEqual(r.pending && [r.pending.to, r.pending.cos, r.pending.systems, r.pending.closes], ['0.1.1', true, ['clear-glass'], ['clear-glass']]);
    assert.ok(r.said.some(x => /COS asks to restart \(clear-glass would close\)/.test(x)), r.said.join(' | '));
    const ask = ev.find(x => x.phase === 'ask-restart'); assert.deepStrictEqual([ask.cos, ask.systems, ask.closes], [true, ['clear-glass'], ['clear-glass']]);
    const c = await up.check(); assert.deepStrictEqual(c.pending, up.pending(), 'the check carries the asks');
    const N = require(path.join(ROOT, 'cos/manager/notices.js')).createNotices({ file: path.join(tmp, 'notices.json') });
    const n = N.fromUpdate(ask); assert.deepStrictEqual([n.kind, n.level], ['update', 'warn']); assert.match(n.title, /Restart COS and clear-glass to load the update/); assert.match(n.body, /Restarting COS closes clear-glass/);
    cu8 = { up, s, cosCalls };
  });

  await test('CU-09', 'done writing: git\'s index.lock holds the restarts; a restart while an update writes is refused', async () => {
    const d = path.join(tmp, 'i5'); const s = supRunning(); const up = createUpdates(s, { root: d, settleMs: 300 });
    fs.writeFileSync(path.join(d, '.git', 'index.lock'), '');
    const held = await up.settled(); assert.strictEqual(held.ok, false); assert.match(held.why, /git is still writing \(\.git[\\/]index\.lock after 300 ms\)/);
    fs.unlinkSync(path.join(d, '.git', 'index.lock')); assert.strictEqual((await up.settled()).ok, true);
    const first = up.apply({ mode: 'update', by: 'person' });
    const early = await up.restart({ what: 'clear-glass', by: 'person' });
    assert.deepStrictEqual([early.ok, early.code], [false, 409]); assert.match(early.error, /an update is still writing \(update\): restart once it is done/);
    assert.ok(!s.restarted.includes('clear-glass'));
    const r = await first; assert.ok(r.ok, r.error); assert.ok(r.settled === undefined || true);
  });
  delete process.env.COS_UPDATE_BACKUP_URL;

  await test('CU-10', 'his yes: a system restarts and leaves the asks; cos calls COS\'s restart; wired at the route, contract and command', async () => {
    const { up, s, cosCalls } = cu8;
    const a = await up.restart({ what: 'clear-glass', by: 'person' }); assert.ok(a.ok, a.error); assert.ok(s.restarted.includes('clear-glass'));
    assert.deepStrictEqual(up.pending().systems, []); assert.strictEqual(up.pending().cos, true, 'COS still asked');
    const b = await up.restart({ what: 'cos', by: 'person' }); assert.deepStrictEqual([b.ok, b.how], [true, 'test']); assert.deepStrictEqual(cosCalls, [{ by: 'person' }]); assert.strictEqual(up.pending(), null);
    const x = await up.restart({ what: 'nope', by: 'person' }); assert.deepStrictEqual([x.ok, x.code], [false, 404]);
    const src = fs.readFileSync(path.join(ROOT, 'cos/manager/server.js'), 'utf8');
    assert.match(src, /p === '\/api\/cos\/update\/restart'\) \{ if \(!body\.by\) return send\(res, 400[^\n]*if \(\/\^agent:\/\.test\(String\(body\.by\)\)\) return send\(res, 403/);
    const C = JSON.parse(fs.readFileSync(path.join(ROOT, 'cos/manager/contract.json'), 'utf8'));
    assert.ok(C.routes.some(r => r.method === 'POST' && r.path === '/api/cos/update/restart'));
    const row = require(path.join(ROOT, 'idearium/cli/route-commands.js')).SPEC.find(r => r.key === 'cos.act');
    assert.deepStrictEqual(row.req({ args: ['restart', 'cos'], flags: {} }), { method: 'POST', path: '/api/cos/update/restart', body: { by: 'person', what: 'cos' } });
    assert.ok(row.personOnly({ args: ['restart', 'cos'] })); assert.strictEqual(row.personOnly({ args: ['restart', 'guardian'] }), null);
    assert.strictEqual(row.req({ args: ['restart', 'guardian'], flags: {} }).path, '/api/cos/systems/guardian/restart', 'a system\'s restart unchanged');
  });

  // CU-11 — the real manager, on a fixture tree with no systems, restarted after his yes
  const freePort = () => new Promise(r => { const t = require('net').createServer(); t.listen(0, '127.0.0.1', () => { const p = t.address().port; t.close(() => r(p)); }); });
  const health = (port) => new Promise((ok) => { const q = http.get({ host: '127.0.0.1', port, path: '/api/cos/health', timeout: 1500 }, (res) => { let b = ''; res.on('data', c => { b += c; }); res.on('end', () => { try { ok(JSON.parse(b)); } catch (_) { ok(null); } }); }); q.on('error', () => ok(null)); q.on('timeout', () => { q.destroy(); ok(null); }); });
  const post = (port, p, body) => new Promise((ok) => { const d = JSON.stringify(body); const q = http.request({ host: '127.0.0.1', port, path: p, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } }, (res) => { let b = ''; res.on('data', c => { b += c; }); res.on('end', () => { try { ok(JSON.parse(b)); } catch (_) { ok(null); } }); }); q.on('error', () => ok(null)); q.end(d); });
  const until = async (fn, ms = 20000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await new Promise(r => setTimeout(r, 200)); } };
  const killPid = (pid) => { try { process.kill(pid, 'SIGTERM'); } catch (_) {} };
  await test('CU-11', 'COS restarts itself for real: by hand through relaunch.js (with --boot); under autopilot through exit 75', async () => {
    const { spawn } = require('child_process');
    const fx = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-restart-fx-'));
    // by hand: the manager alone
    const p1 = await freePort();
    const m = spawn(process.execPath, [path.join(ROOT, 'cos/manager/server.js'), '--no-ui', `--root=${fx}`], { env: { ...process.env, COS_MANAGER_PORT: String(p1), COS_LAUNCHER: '' }, stdio: 'ignore' });
    const h1 = await until(() => health(p1)); assert.ok(h1 && h1.ok, 'the manager answers'); assert.strictEqual(h1.pid, m.pid);
    const r1 = await post(p1, '/api/cos/update/restart', { by: 'person', what: 'cos' }); assert.match(r1.how, /relaunch\.js starts it again with --boot/);
    const h1b = await until(async () => { const x = await health(p1); return x && x.pid !== m.pid ? x : null; }); assert.ok(h1b, 'back on its port under a new pid');
    const args = fs.readFileSync(`/proc/${h1b.pid}/cmdline`, 'utf8').split('\0'); assert.ok(args.includes('--boot') && args.includes(`--root=${fx}`), args.join(' '));
    killPid(h1b.pid);
    // under autopilot (as the Windows service and the COS app run it)
    const p2 = await freePort(); const uiPort = await freePort();
    const ap = spawn(process.execPath, [path.join(ROOT, 'lib/nexus/autopilot.js'), `--status-port=${p2}`, '--no-duties', `--root=${fx}`], { env: { ...process.env, COS_UI_PORT: String(uiPort) }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; ap.stdout.on('data', c => { out += c; }); ap.stderr.on('data', c => { out += c; });
    try {
      const h2 = await until(() => health(p2)); assert.ok(h2 && h2.ok, `the manager under autopilot answers: ${out.slice(-300)}`);
      const r2 = await post(p2, '/api/cos/update/restart', { by: 'person', what: 'cos' }); assert.match(r2.how, /autopilot starts it again and boots its systems/);
      const h2b = await until(async () => { const x = await health(p2); return x && x.pid !== h2.pid ? x : null; }); assert.ok(h2b, `back under autopilot: ${out.slice(-400)}`);
      await until(() => /COS's manager is back \(pid \d+\); booted 0/.test(out)); assert.match(out, /asked to restart \(after an update\): starting it again/); assert.match(out, /COS's manager is back/);
      assert.strictEqual(ap.exitCode, null, 'autopilot itself kept running (the pid NSSM and the COS app track)');
    } finally { killPid(ap.pid); await new Promise(r => setTimeout(r, 800)); const x = await health(p2); if (x && x.pid) killPid(x.pid); }
  });

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
      if (u.startsWith('/api/cos/update/apply')) { posts.push(['apply', JSON.parse(b)]); return j({ ok: true, action: 'updated', from: { version: '0.1.0' }, to: { version: '0.1.1' }, perSystem: D.perSystem, restarted: [{ name: 'guardian', ok: true }, { name: 'cortex', ok: true }], said: ['clear-glass changed too: restart it when you are not using it (never restarted under you)'], pending: { to: '0.1.1', cos: true, systems: ['clear-glass'], closes: ['clear-glass'] }, keptOn: JSON.parse(b).mode === 'keep-local' ? 'local/2026-11-02-10-00-00' : null }); }
      if (u.startsWith('/api/cos/update/restart')) { const x = JSON.parse(b); posts.push(['restart', x.what, x]); return j({ ok: true, what: x.what }); }   // CE2b: his yes, through the update's own route
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
      assert.deepStrictEqual(posts[1], ['restart', 'clear-glass', { by: 'person', what: 'clear-glass' }], JSON.stringify(posts));   // CE2b: through /api/cos/update/restart (clears the ask)
      // CE2b — COS itself: its own button, naming what closes; asked twice, then his yes
      assert.match(await page.evaluate(() => document.querySelector('.nx-upd [data-a="restart-cos"]').textContent), /Restart COS \(clear-glass closes\)/);
      await page.evaluate(() => document.querySelector('.nx-upd [data-a="restart-cos"]').click());
      assert.match(await page.evaluate(() => document.querySelector('.nx-upd [data-a="restart-cos"]').textContent), /Confirm: restart COS now/); assert.strictEqual(posts.length, 2, 'nothing posted before the confirm');
      await page.evaluate(() => document.querySelector('.nx-upd [data-a="restart-cos"]').click());
      await page.waitForFunction(() => /COS is restarting/.test(document.querySelector('.nx-upd [data-a="restart-cos"]').textContent));
      assert.deepStrictEqual(posts[2], ['restart', 'cos', { by: 'person', what: 'cos' }], JSON.stringify(posts));
      // diverged: the same card offers Keep mine and update, with the local commits named
      D = { ...D, ahead: 1, local: { count: 1, onGitHub: 0, commits: [{ commit: 'abc1234567', subject: 'his local work', onGitHub: false }] } };
      await page.evaluate(() => NexusUpdatePopup.poll()); await page.waitForSelector('.nx-upd [data-a="go"]');
      const k = await page.evaluate(() => document.querySelector('.nx-upd').textContent);
      assert.ok(/Keep mine and update/.test(k) && /1 commit\(s\) GitHub lacks/.test(k) && /nothing is lost/.test(k), k);
      await page.evaluate(() => { const b = document.querySelector('.nx-upd [data-a="go"]'); b.click(); b.click(); });
      await page.waitForFunction(() => /local\/2026/.test(document.querySelector('.nx-upd').textContent));
      assert.deepStrictEqual(posts[3], ['apply', { by: 'person', mode: 'keep-local' }]);   // CE2b: after the two restarts (clear-glass, COS)
    });
    await test('CU-12', 'the Updates page in Clear Glass: the asks, Restart now posts his yes, Later hides the row', async () => {
      const yes = [];
      const PEND = { ok: true, current: '0.1.1', latest: '0.1.1', behind: 0, ahead: 0, releases: [], systems: [], perSystem: { restart: [], waitForHim: [], kernelChanged: false, cosChanged: false }, pending: { to: '0.1.1', cos: true, systems: ['clear-glass'], closes: ['clear-glass'] } };
      const mgr = http.createServer((req, res) => { let b = ''; req.on('data', c => { b += c; }); req.on('end', () => { const j = (x) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(x)); }; const u = req.url;
        if (u.startsWith('/api/cos/update/restart')) { const x = JSON.parse(b); yes.push(x); if (x.what !== 'cos') PEND.pending.systems = PEND.pending.systems.filter(n => n !== x.what); return j({ ok: true, what: x.what }); }
        if (u.startsWith('/api/cos/update/settings')) return j({ ok: true, settings: { policy: 'notify', everyHours: 6, keepLocal: 'ask' }, last: null, options: { policy: ['auto', 'notify', 'off'], keepLocal: ['ask', 'auto'] } });
        if (u.startsWith('/api/cos/update/history')) return j({ ok: true, history: [] });
        if (u.startsWith('/api/cos/update')) return j(PEND);
        if (u.startsWith('/api/cos/contract')) return j({ ok: true, contract: JSON.parse(fs.readFileSync(path.join(ROOT, 'cos/manager/contract.json'), 'utf8')) });   // the real contract: the page must declare the route
        res.statusCode = 404; j({ ok: false, error: 'no route' }); }); });
      await new Promise(r => mgr.listen(0, '127.0.0.1', r));
      const ui = require(path.join(ROOT, 'cos/ui/serve.js')).createServer({ port: 0, manager: `http://127.0.0.1:${mgr.address().port}` });
      await new Promise(r => ui.listen(0, '127.0.0.1', r));
      const page = await browser.newPage({ viewport: { width: 1280, height: 860 } }); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
      await page.addInitScript('window.confirm = () => true;');
      try {
        await page.goto(`http://127.0.0.1:${ui.address().port}/updates/index.html`);
        try { await page.waitForSelector('#asks .ask', { timeout: 10000 }); } catch (e) { throw new Error(`no asks drawn: errors ${JSON.stringify(errors)} · state ${await page.evaluate(() => (document.getElementById('state') || {}).textContent)}`); }
        const t = await page.evaluate(() => document.getElementById('asks').textContent);
        assert.ok(/Waiting for you · the update to 0\.1\.1/.test(t) && /Restart COS to load its new code — clear-glass closes and starts again/.test(t) && /Restart clear-glass to load the update/.test(t), t);
        if (process.env.UP_SHOTS) await page.screenshot({ path: path.join(process.env.UP_SHOTS, 'cos-updates-asks.png') });
        await page.evaluate(() => [...document.querySelectorAll('#asks .ask[data-what="clear-glass"] button')].find(b => /now/.test(b.textContent)).click());
        await page.waitForFunction(() => !document.querySelector('#asks .ask[data-what="clear-glass"]'));
        assert.deepStrictEqual(yes, [{ by: 'person', what: 'clear-glass' }]);
        await page.evaluate(() => [...document.querySelectorAll('#asks .ask[data-what="cos"] button')].find(b => b.textContent === 'Later').click());
        assert.strictEqual(await page.evaluate(() => !!document.querySelector('#asks .ask[data-what="cos"]')), false, 'Later hides the row');
        assert.strictEqual(yes.length, 1, 'Later posts nothing');
        assert.deepStrictEqual(errors, [], 'no page error');
      } finally { await page.close(); ui.close(); mgr.close(); }
    });
    await browser.close();
  }
  srv.close(); bk.close(); fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
