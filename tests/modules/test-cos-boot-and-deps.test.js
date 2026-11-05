'use strict';
/**
 * tests/modules/test-cos-boot-and-deps.test.js — BT1 (Start at boot, each system) and DP1 (dependencies before boot)
 * James, 2026-11-05: "cos also needs to install the dependancies. also this pc is getting its ass kicked. i need options for what systems start on boot."
 *
 *   BD-01  check(): no node_modules → needed; no npm record → needed; a lock newer than the install → needed; current → not
 *   BD-02  install() runs npm install --no-audit --no-fund in the folder; npm missing is said with where to get it
 *   BD-03  a system switched off (start.autostart false, through the route) is skipped at boot, said; switched on again, it starts
 *   BD-04  the Automation page lists every system with its switch, and declares the routes it uses; --boot runs the check first
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), net = require('net');
const ROOT = path.join(__dirname, '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-bd-'));
process.env.COS_MANAGER_DATA = path.join(tmp, 'data');
const D = require(path.join(ROOT, 'cos/manager/deps.js'));
const { createSupervisor } = require(path.join(ROOT, 'cos/manager/supervisor.js'));
const { listen } = require(path.join(ROOT, 'cos/manager/server.js'));

let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 5).join('\n    ')}`); failed++; } }
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const send = (port, method, p, body) => new Promise((res, rej) => { const b = JSON.stringify(body || {}); const q = http.request({ host: '127.0.0.1', port, path: p, method, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) } }, r => { let t = ''; r.on('data', c => t += c); r.on('end', () => { try { res(JSON.parse(t)); } catch (e) { rej(e); } }); }); q.on('error', rej); q.end(b); });

(async () => {
  console.log('\n⬢  COS: what starts at boot, and its dependencies first (BT1, DP1)\n');

  await test('BD-01', 'check() says when npm install is needed, and why', () => {
    const r = fs.mkdtempSync(path.join(tmp, 'n-'));
    assert.deepStrictEqual(D.check(r).needed, false, 'no package.json: nothing to install');
    fs.writeFileSync(path.join(r, 'package.json'), '{}'); fs.writeFileSync(path.join(r, 'package-lock.json'), '{}');
    assert.match(D.check(r).why, /node_modules is missing/);
    fs.mkdirSync(path.join(r, 'node_modules'));
    assert.match(D.check(r).why, /no record of an install/);
    fs.writeFileSync(path.join(r, 'node_modules', '.package-lock.json'), '{}');
    const old = new Date(Date.now() - 60000); fs.utimesSync(path.join(r, 'node_modules', '.package-lock.json'), old, old);
    assert.match(D.check(r).why, /package-lock\.json changed/);
    const now = new Date(); fs.utimesSync(path.join(r, 'node_modules', '.package-lock.json'), now, now);
    assert.deepStrictEqual(D.check(r), { needed: false, why: 'dependencies are current' });
    // by content once installed: a lock whose time moved but whose content did not is not an install; a changed one is
    D.stamp(r); const later = new Date(Date.now() + 120000); fs.utimesSync(path.join(r, 'package-lock.json'), later, later);
    assert.strictEqual(D.check(r).needed, false, 'only the time moved (a git pull)');
    fs.writeFileSync(path.join(r, 'package-lock.json'), '{"changed":true}');
    assert.match(D.check(r).why, /package-lock\.json changed/);
  });

  await test('BD-02', 'install() runs npm install in the folder; no npm is said', async () => {
    const calls = [];
    const r = await D.install('/x/nexus', { npm: 'C:\\Program Files\\nodejs\\npm.cmd', exec: (cmd, args, o) => { calls.push([cmd, args.join(' '), o.cwd]); return { code: 0, tail: 'added 12 packages' }; } });
    assert.deepStrictEqual([r.ok, calls[0]], [true, ['C:\\Program Files\\nodejs\\npm.cmd', 'install --no-audit --no-fund', '/x/nexus']]);   // (the stamp write to /x is skipped quietly)
    const n = await D.install('/x', { npm: null });
    assert.ok(!n.ok && /nodejs\.org/.test(n.tail));
  });

  await test('BD-03', 'a system switched off is skipped at boot, said; switched on, it starts', async () => {
    const pA = await freePort(), pB = await freePort();
    const S = (p) => `require('http').createServer((q,r)=>r.end('{"ok":true}')).listen(${p},'127.0.0.1');`;
    fs.writeFileSync(path.join(tmp, 'a.js'), S(pA)); fs.writeFileSync(path.join(tmp, 'b.js'), S(pB));
    const sup = createSupervisor({ root: tmp, ledgerFile: path.join(tmp, 'data', 'ledger.jsonl'), log: () => {}, policy: { stopGraceMs: 200, phaseGateMs: 3000 },
      declarations: [{ name: 'heavy', system: 'heavy', cmd: process.execPath, args: [path.join(tmp, 'a.js')], healthUrl: `http://127.0.0.1:${pA}/health`, phase: 1 },
                     { name: 'light', system: 'light', cmd: process.execPath, args: [path.join(tmp, 'b.js')], healthUrl: `http://127.0.0.1:${pB}/health`, phase: 1 }] });
    const srv = await listen(sup, 0, { root: tmp }); const M = srv.address().port;
    try {
      const off = await send(M, 'PATCH', '/api/cos/systems/heavy/config', { patch: { 'start.autostart': 'false' }, by: 'person' });
      assert.ok(off.ok !== false, JSON.stringify(off));
      const b = await send(M, 'POST', '/api/cos/boot', { by: 'person' });
      assert.ok(b.started.includes('light') && !b.started.includes('heavy'), JSON.stringify(b));
      assert.ok(b.skipped.some(s => s.name === 'heavy' && /autostart off/.test(s.why)), JSON.stringify(b.skipped));
      await send(M, 'PATCH', '/api/cos/systems/heavy/config', { patch: { 'start.autostart': 'true' }, by: 'person' });
      const b2 = await send(M, 'POST', '/api/cos/boot', { by: 'person' });
      assert.ok(!b2.skipped.some(s => s.name === 'heavy'), JSON.stringify(b2.skipped));
    } finally { srv.close(); sup.shutdown({ by: 'test' }); }
  });

  await test('BD-04', 'the Automation page lists every system with a switch; its routes declared; --boot checks dependencies first', () => {
    const html = fs.readFileSync(path.join(ROOT, 'cos/ui/automation/index.html'), 'utf8');
    assert.match(html, /<section class="panel rise" id="boot-list">[\s\S]*<h2>Start at boot<\/h2>[\s\S]*id="boot-rows"/);
    const js = fs.readFileSync(path.join(ROOT, 'cos/ui/automation/page.js'), 'utf8');
    assert.match(js, /COS\.call\('PATCH', `\/api\/cos\/systems\/\$\{encodeURIComponent\(sys\.name\)\}\/config`, \{ patch: \{ 'start\.autostart': want \? 'true' : 'false' \}, by: 'person' \}\)/);
    const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'cos/manager/contract.json'), 'utf8')).pages.find(p => p.id === 'automation');
    for (const r of ['GET /api/cos/systems', 'GET /api/cos/systems/:name/config', 'PATCH /api/cos/systems/:name/config']) assert.ok(c.routes.includes(r), r);
    const srv = fs.readFileSync(path.join(ROOT, 'cos/manager/server.js'), 'utf8');
    assert.match(srv, /if \(!process\.argv\.includes\('--no-deps'\)\) \{ const D = require\('\.\/deps\.js'\); const c = D\.check\(root\);[\s\S]{0,400}await D\.install\(root\)[\s\S]{0,400}const r = await sup\.boot\(/);
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exitCode = failed ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 300);
})();
