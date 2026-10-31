'use strict';
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-cos-autopilot-door.test.js — MG16, 0.60.329. Spec: cos/spec/cos-manager.spec MOD-MG-AUTOPILOT-DOOR.
 * James, 2026-10-31: "go" (after "okay we need the orchastration completed"). No caller of :7799 changes (MG-003).
 *   AD-01 every route autopilot's source serves is answered by the door (none falls to 404) — read from lib/nexus/autopilot.js itself
 *   AD-02 /status in autopilot's shape: { ok, kernels: { name: { status, restarts, crashesInWindow, lastExit, downSince, pid, healthUrl, port } }, boot, ledger, ts }
 *   AD-03 /control and /spawn in autopilot's reply shapes; a stop of a stopped system is 'held'; a non-on-demand spawn refused as autopilot did
 *   AD-04 /tables and /files: marked legacy with their replacement; each call counted with its caller
 */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..', '..');
const { createSupervisor } = require(path.join(ROOT, 'cos/manager/supervisor.js'));
const { listen } = require(path.join(ROOT, 'cos/manager/server.js'));
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 3).join('\n    ')}`); failed++; } }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-door-'));
const OK = path.join(dir, 'ok.js'); fs.writeFileSync(OK, "require('http').createServer((q,s)=>s.end('ok')).listen(Number(process.argv[2]),'127.0.0.1');");
const freePort = () => new Promise(r => { const s = http.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });

(async () => {
  console.log('\n⬡  autopilot\'s door, answered by COS (MG16)\n');
  const p1 = await freePort();
  const sup = createSupervisor({ root: ROOT, ledgerFile: path.join(dir, 'l.jsonl'), log: () => {}, policy: { stopGraceMs: 200 },
    declarations: [{ name: 'svc', system: 'svc', cmd: process.execPath, args: [OK, String(p1)], healthUrl: `http://127.0.0.1:${p1}/health`, phase: 1 },
                   { name: 'cold', system: 'cold', cmd: process.execPath, args: [OK, '1'], onDemand: true },
                   { name: 'od', system: 'od', cmd: process.execPath, args: [OK, String(await freePort())], onDemand: true }] });
  const srv = await listen(sup, 0); const base = `http://127.0.0.1:${srv.address().port}`;
  const call = (m, p, h = {}) => new Promise((ok) => { const r = http.request(base + p, { method: m, headers: h }, (res) => { let t = ''; res.on('data', c => t += c); res.on('end', () => { let b = null; try { b = JSON.parse(t); } catch (_) { b = t; } ok({ code: res.statusCode, body: b, headers: res.headers }); }); }); r.end(); });
  try {
    await test('AD-01', 'every route autopilot serves is answered (none 404), read from its own source', async () => {
      const src = fs.readFileSync(path.join(ROOT, 'lib/nexus/autopilot.js'), 'utf8');
      const block = src.slice(src.indexOf('function _startStatusServer'), src.indexOf("res.end('not found"));
      const routes = [...new Set([...block.matchAll(/req\.url === '([^']+)'|req\.url\.startsWith\('([^']+)'\)|\^\\\/(\w[\w-]*)\\\//g)].map(m => m[1] || m[2] || `/${m[3]}/`))];
      assert.ok(routes.length >= 11, routes.join(' '));
      const sample = { '/spawn/': ['POST', '/spawn/od'], '/control/': ['POST', '/control/svc/start'], '/touch/': ['POST', '/touch/od'], '/contract-map/': ['GET', '/contract-map/svc'],
        '/files/': ['GET', '/files/svc'], '/run-tests/': ['POST', '/run-tests/svc'] };
      const missed = [];
      for (const r of routes) { const [m, p] = sample[r] || [r === '/idle' || r === '/status' || r.startsWith('/ledger') || r.startsWith('/graph') || r.startsWith('/tables') || r.startsWith('/warp') ? 'GET' : 'GET', r];
        const res = await call(m, p); if (res.code === 404 && !/no such|not found:|unknown|no kernel/i.test(JSON.stringify(res.body))) missed.push(`${m} ${p} → 404`); }
      assert.deepStrictEqual(missed, [], `routes: ${routes.join(' ')}`);
    });
    await test('AD-02', "/status in autopilot's shape", async () => {
      sup.start('svc');
      await new Promise(r => setTimeout(r, 600));
      const r = (await call('GET', '/status')).body;
      for (const k of ['ok', 'kernels', 'boot', 'ledger', 'ts']) assert.ok(k in r, k);
      assert.deepStrictEqual(Object.keys(r.kernels.svc).sort(), ['crashesInWindow', 'downSince', 'healthUrl', 'lastExit', 'pid', 'port', 'restarts', 'status'].sort());
      assert.ok(['online', 'starting'].includes(r.kernels.svc.status), r.kernels.svc.status);
    });
    await test('AD-03', "/control and /spawn reply in autopilot's shapes", async () => {
      assert.deepStrictEqual((await call('POST', '/control/cold/stop')).body, { ok: true, status: 'held', note: 'it was not running — held' });
      const nr = await call('POST', '/spawn/svc'); assert.strictEqual(nr.code, 503); assert.ok(/not an on-demand kernel/.test(nr.body.error));
      const sp = await call('POST', '/spawn/od'); assert.ok(sp.body.ok && 'verified' in sp.body || sp.body.alreadyRunning, JSON.stringify(sp.body));
      assert.strictEqual((await call('POST', '/control/nope/start')).body.code, 404);
    });
    await test('AD-04', '/tables and /files: legacy, with the replacement; each call counted with its caller', async () => {
      const t = await call('GET', '/tables', { 'x-nexus-caller': 'tablet' });
      assert.ok(/Data tab/.test(t.headers['x-nexus-legacy'] || ''), JSON.stringify(t.headers));
      await call('GET', '/files/svc', { 'x-nexus-caller': 'idearium' });
      const c = (await call('GET', '/api/cos/legacy-callers')).body.callers;
      assert.deepStrictEqual(c.filter(x => x.caller !== 'unknown').map(x => `${x.route} ${x.caller} ${x.count}`).sort(), ['/files idearium 1', '/tables tablet 1']); assert.ok(c.some(x => x.caller === 'unknown'), 'a call that names no caller is counted as unknown');
    });
  } finally { srv.close(); sup.shutdown({ by: 'test' }); }
  await new Promise(r => setTimeout(r, 400));
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
