'use strict';
// run-all: timeout 120000
/**
 * tests/modules/test-cos-ui-starts.test.js — MG33, 0.60.347. James, 2026-11-01: "where is cos ui?"
 * The manager, started the way `npm run start:all` starts it (node cos/manager/server.js), starts COS's cockpit beside itself.
 *   CS-01  the cockpit answers on COS_UI_PORT: / → /shell/, the shell's page, and the manager's contract through it
 *   CS-02  the cockpit's port held by something else: the manager still answers and says why the cockpit did not start
 *   CS-03  the TV has a COS channel, appended (CH_INSPECT is read by position); since 0.60.352 (MG34) it frames the cockpit through
 *          channels/cos/cos.html, which says when :7797 is down (test-cos-channel); channels appended after it (TENSION) are allowed
 */
const assert = require('assert'), http = require('http'), path = require('path'), fs = require('fs'), net = require('net');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const sb = require(path.join(ROOT, 'lib/test-sandbox.js'));
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 4).join('\n    ')}`); failed++; } }
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const get = (port, p) => new Promise(r => { const q = http.get({ host: '127.0.0.1', port, path: p, timeout: 4000 }, (x) => { let t = ''; x.on('data', c => t += c); x.on('end', () => r({ status: x.statusCode, headers: x.headers, body: t })); }); q.on('error', e => r({ status: 0, error: e.message })); });
function start(env) {
  const box = sb.childEnv({ ...process.env, ...env });   // { env, root, cleanup }: the manager's ledger and stores in a sandbox, never the repo
  const out = []; const child = spawn(process.execPath, [path.join(ROOT, 'cos/manager/server.js')], { cwd: ROOT, env: box.env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.once('exit', () => box.cleanup());
  child.stdout.on('data', c => out.push(String(c))); child.stderr.on('data', c => out.push(String(c)));
  return { child, out, wait: async (re, ms = 15000) => { const until = Date.now() + ms; while (Date.now() < until) { if (re.test(out.join(''))) return true; await new Promise(r => setTimeout(r, 100)); } throw new Error(`no ${re} in: ${out.join('').slice(-600)}`); } };
}
const stop = (p) => new Promise(r => { if (p.child.exitCode != null) return r(); p.child.once('exit', r); p.child.kill('SIGINT'); setTimeout(() => { try { p.child.kill('SIGKILL'); } catch (_) {} r(); }, 3000); });

(async () => {
  console.log('\n⬡  COS\'s UI starts with COS (MG33)\n');
  await test('CS-01', 'the cockpit answers beside the manager: its shell and the contract through it', async () => {
    const [mp, up] = [await freePort(), await freePort()];
    const p = start({ COS_MANAGER_PORT: String(mp), COS_UI_PORT: String(up) });
    try {
      await p.wait(/\[cos\] cockpit on http:\/\/127\.0\.0\.1:\d+\//);
      const root = await get(up, '/'); assert.strictEqual(root.status, 302); assert.strictEqual(root.headers.location, '/shell/');
      const shell = await get(up, '/shell/'); assert.strictEqual(shell.status, 200); assert.match(shell.body, /<html/i);
      const c = JSON.parse((await get(up, '/api/cos/contract')).body); assert.ok(c.ok && c.contract.pages.some(x => x.id === 'emergence'), 'the contract, through the cockpit');
    } finally { await stop(p); }
  });
  await test('CS-02', 'the cockpit\'s port held: the manager still answers, and says why', async () => {
    const [mp, up] = [await freePort(), await freePort()];
    const hold = net.createServer(); await new Promise(r => hold.listen(up, '127.0.0.1', r));
    const p = start({ COS_MANAGER_PORT: String(mp), COS_UI_PORT: String(up) });
    try {
      await p.wait(/the cockpit did not start on :\d+ \(EADDRINUSE\)/);
      const h = JSON.parse((await get(mp, '/api/cos/health')).body); assert.ok(h.ok, JSON.stringify(h));
    } finally { await stop(p); hold.close(); }
  });
  await test('CS-03', 'the TV has a COS channel framing the cockpit, appended', () => {
    const html = fs.readFileSync(path.join(ROOT, 'lib/ui/tv-shell/index.html'), 'utf8');
    const meta = html.slice(html.indexOf('const CH_META=['), html.indexOf('];', html.indexOf('const CH_META=[')));
    const ids = [...meta.matchAll(/\{id:'([^']+)'/g)].map(m => m[1]);
    assert.ok(ids.indexOf('ch-cos') > ids.indexOf('ch-emergence'), 'appended after EMERGENCE, never inserted');
    assert.ok(/id="ch-cos"/.test(html) && /f\.src='channels\/cos\/cos\.html'/.test(html));
    assert.ok(/http:\/\/127\.0\.0\.1:\$\{uiPort\}\//.test(fs.readFileSync(path.join(ROOT, 'orchestrator/cos-ui-door.js'), 'utf8')), 'the cockpit it frames is :7797 (COS_UI_PORT)');
  });
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
