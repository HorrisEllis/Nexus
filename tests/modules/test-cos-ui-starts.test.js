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
  // 0.60.531 — James, 2026-11-14, of the TV's co-pilot bar reading "Co-pilot bridge error: Failed to fetch": "thats a problem"
  await test('CS-04', 'the TV\'s co-pilot bar wakes an asleep copilot through COS and asks again; COS not answering is said; a slow copilot is not woken', async () => {
    const html = fs.readFileSync(path.join(ROOT, 'lib/ui/tv-shell/index.html'), 'utf8');
    const src = html.slice(html.indexOf('async function _wakeOnDemand'), html.indexOf('function toggleCopilotMode'));
    assert.ok(src.length > 500 && /async function _copilotDispatch/.test(src), 'both functions found in the page');
    const run = async (fetchFn) => {
      const calls = [];
      const ctx = { window: {}, AbortSignal, setTimeout, Date, Math, encodeURIComponent, JSON, Error, Promise, Object,
        fetch: async (url, o = {}) => { calls.push([o.method || 'GET', url, o.mode || '']); return fetchFn(url, o, calls); } };
      require('vm').runInNewContext(src + '\nthis.go = _copilotDispatch;', ctx);
      let out = null, err = null; try { out = await ctx.go({ prompt: 'hi' }, 5000); } catch (e) { err = e; }
      return { out, err, calls };
    };
    const okJson = (b) => ({ ok: true, status: 200, json: async () => b });
    // asleep: the first ask is refused; COS is touched; health answers; the ask is made again and its answer returned
    let asks = 0;
    const woke = await run(async (url) => {
      if (/:3750\/api\/prompt$/.test(url)) { if (++asks === 1) throw new TypeError('Failed to fetch'); return okJson({ ok: true, text: 'here' }); }
      if (/:7799\/api\/cos\/systems\/copilot\/touch$/.test(url)) return { ok: false, type: 'opaque' };
      if (/:3750\/health$/.test(url)) return { ok: true };
      throw new Error('unexpected ' + url);
    });
    assert.strictEqual(woke.err, null, woke.err && woke.err.message);
    assert.strictEqual(woke.out.text, 'here');
    assert.deepStrictEqual(woke.calls.map(c => c[0] + ' ' + c[1].replace('http://127.0.0.1', '')), ['POST :3750/api/prompt', 'POST :7799/api/cos/systems/copilot/touch', 'GET :3750/health', 'POST :3750/api/prompt']);
    assert.strictEqual(woke.calls[1][2], 'no-cors', 'the touch is sent without reading its answer: COS\'s manager gives this page no CORS');
    // COS's manager itself not answering: said, with its port; nothing asked twice
    const noCos = await run(async (url) => { throw new TypeError('Failed to fetch'); });
    assert.match(noCos.err.message, /copilot is not running: COS's manager did not answer on :7799/);
    assert.strictEqual(noCos.calls.filter(c => /api\/prompt/.test(c[1])).length, 1);
    // reached but slow: the timeout is the answer, nothing is woken
    const slow = await run(async () => { const e = new Error('The operation timed out'); e.name = 'TimeoutError'; throw e; });
    assert.strictEqual(slow.err.name, 'TimeoutError');
    assert.strictEqual(slow.calls.length, 1);
  });
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
