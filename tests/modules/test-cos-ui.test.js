'use strict';
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-cos-ui.test.js — COS's UI, floating above the event bus (MG18, MG29; MG_D16). 0.60.336.
 * James, 2026-10-31: "okay. lets build cos ui. floating, above the event bus. all of the phases, build it. do not make this ugly, cluttered,
 * cheap, or lazy". Spec: cos/spec/cos-manager.spec MOD-MG-UI-*, MOD-MG-CONTRACT.
 *   CU-01 the cockpit server: pages served, / goes to the shell, ../ refused, a route outside the contract 404, a write from another origin 403
 *   CU-02 the contract: every page's routes are the manager's or the door's; every event a page names is declared; every page folder exists
 *   CU-03 the bus: the stream says hello, then every ledger line as it is written and each state change
 *   CU-04 proposals: an agent holds, a person takes (the act runs, by = person), an agent cannot take, a drop is ledgered
 *   CU-05 logs and usage: a system's own output kept; memory read back from the OS, "not read" with why when it is not running
 *   CU-06 in Clear Glass: the shell lists the systems; a restart from a card, confirmed, lands on the ledger by = person; an undeclared call
 *         is refused and shown on the page
 */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..', '..');
const { createSupervisor } = require(path.join(ROOT, 'cos/manager/supervisor.js'));
const { listen } = require(path.join(ROOT, 'cos/manager/server.js'));
const { createServer } = require(path.join(ROOT, 'cos/ui/serve.js'));
let passed = 0, failed = 0, skipped = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 3).join('\n    ')}`); failed++; } }
const freePort = () => new Promise(r => { const s = http.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const call = (port, m, p, body, headers = {}) => new Promise((ok) => { const d = body ? JSON.stringify(body) : null;
  const r = http.request({ host: '127.0.0.1', port, path: p, method: m, headers: { ...(d ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(d) } : {}), ...headers } }, (res) => {
    let t = ''; res.on('data', c => t += c); res.on('end', () => { let b = t; try { b = JSON.parse(t); } catch (_) {} ok({ code: res.statusCode, body: b, headers: res.headers }); }); });
  r.on('error', (e) => ok({ code: 0, body: e.message })); if (d) r.write(d); r.end(); });
const until = async (fn, ms = 8000) => { const t = Date.now() + ms; while (Date.now() < t) { const v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 120)); } return null; };

(async () => {
  console.log('\n⬡  COS\'s UI, floating above the event bus (MG18, MG29)\n');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-ui-t-'));
  const SVC = path.join(dir, 'svc.js'); fs.writeFileSync(SVC, "const n=process.argv[3];require('http').createServer((q,s)=>s.end('ok')).listen(Number(process.argv[2]),'127.0.0.1',()=>console.log(n+' listening'));setInterval(()=>console.error(n+' says something on stderr'),400);");
  const p1 = await freePort(), p2 = await freePort();
  const sup = createSupervisor({ root: ROOT, ledgerFile: path.join(dir, 'ledger.jsonl'), log: () => {}, policy: { stopGraceMs: 300 },
    declarations: [{ name: 'alpha', system: 'alpha', cmd: process.execPath, args: [SVC, String(p1), 'alpha'], healthUrl: `http://127.0.0.1:${p1}/`, phase: 1, critical: true },
                   { name: 'beta', system: 'beta', cmd: process.execPath, args: [SVC, String(p2), 'beta'], healthUrl: `http://127.0.0.1:${p2}/`, phase: 2 },
                   { name: 'gamma', system: 'gamma', cmd: process.execPath, args: [SVC, '1', 'gamma'], onDemand: true }] });
  const mgr = await listen(sup, 0); const MP = mgr.address().port;
  const UP = await freePort(); const ui = createServer({ port: UP, manager: `http://127.0.0.1:${MP}` }); await new Promise(r => ui.listen(UP, '127.0.0.1', r));
  const own = { origin: `http://127.0.0.1:${UP}` };
  try {
    await sup.boot({ by: 'boot' });

    await test('CU-01', 'the cockpit server: pages, / to the shell, ../ refused, outside the contract 404, a foreign write 403', async () => {
      const root = await call(UP, 'GET', '/'); assert.strictEqual(root.code, 302); assert.strictEqual(root.headers.location, '/shell/');
      const shell = await call(UP, 'GET', '/shell/'); assert.strictEqual(shell.code, 200); assert.match(String(shell.body), /<canvas id="bus"/);
      assert.strictEqual((await call(UP, 'GET', '/shell/../../manager/contract.json')).code === 200, false, 'path traversal must not serve');
      assert.strictEqual((await call(UP, 'GET', '/serve.js')).code, 403, 'the server\'s own source is not served');
      const outside = await call(UP, 'GET', '/api/cos/nope'); assert.strictEqual(outside.code, 404); assert.match(outside.body.error, /not in the manager's contract/);
      const foreign = await call(UP, 'POST', '/api/cos/systems/beta/restart', { by: 'person' }, { origin: 'https://example.com' });
      assert.strictEqual(foreign.code, 403); assert.match(foreign.body.error, /example\.com/);
      const none = await call(UP, 'POST', '/api/cos/systems/beta/restart', { by: 'person' }); assert.strictEqual(none.code, 403, 'a write with no Origin is refused');
      const ok = await call(UP, 'GET', '/api/cos/systems'); assert.strictEqual(ok.code, 200); assert.strictEqual(ok.body.systems.length, 3);
      const door = await call(UP, 'GET', '/ap/status'); assert.strictEqual(door.code, 200); assert.ok(door.body.kernels.alpha, 'the door forwarded under /ap');
    });

    await test('CU-02', 'the contract: every page\'s routes are the manager\'s or the door\'s, every event declared, every page folder there', async () => {
      const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'cos/manager/contract.json'), 'utf8'));
      const routes = new Set([...c.routes.map(r => `${r.method} ${r.path}`), ...c.door.routes.map(r => `${r.method} ${r.path}`)]);
      for (const p of c.pages) {
        for (const r of p.routes) assert.ok(routes.has(r), `${p.id} names ${r}, which the contract does not serve`);
        for (const e of [...p.listens, ...p.emits]) assert.ok(c.events[e], `${p.id} names the event ${e}, which the contract does not declare`);
        for (const f of ['index.html', ...(p.id === 'shell' ? ['page.css', 'page.js', 'bus.js'] : ['page.css', 'page.js'])]) assert.ok(fs.existsSync(path.join(ROOT, 'cos/ui', p.path, f)), `${p.path}${f}`);
        for (const s of p.sections || []) for (const f of ['section.html', 'section.css', 'section.js']) assert.ok(fs.existsSync(path.join(ROOT, 'cos/ui', p.path, 'sections', s, f)), `${p.id}/${s}/${f}`);
      }
      const served = (await call(MP, 'GET', '/api/cos/contract')).body.contract; assert.strictEqual(served.version, c.version);
      assert.ok(c.planned.length >= 6 && c.planned.every(x => x.phase && x.does && x.waitsOn.length), 'every planned page names its phase, what it does and what it waits on');
    });

    await test('CU-03', 'the bus: hello, then each ledger line as it is written and each state change', async () => {
      const got = [];
      const req = http.get({ host: '127.0.0.1', port: UP, path: '/api/cos/events' }, (res) => { res.setEncoding('utf8'); let buf = ''; res.on('data', (c) => { buf += c; let i;
        while ((i = buf.indexOf('\n\n')) >= 0) { const f = buf.slice(0, i); buf = buf.slice(i + 2); const ev = (/^event: (.+)$/m.exec(f) || [])[1]; const data = (/^data: (.+)$/m.exec(f) || [])[1]; if (ev) got.push({ ev, data: JSON.parse(data) }); } }); });
      assert.ok(await until(() => got.find(x => x.ev === 'cos.hello')), 'hello');
      assert.strictEqual(got.find(x => x.ev === 'cos.hello').data.systems.length, 3);
      await call(UP, 'POST', '/api/cos/systems/beta/restart', { by: 'person' }, own);
      const line = await until(() => got.find(x => x.ev === 'cos.ledger' && x.data.entry.system === 'beta'));
      assert.ok(line, 'the restart was heard on the stream'); assert.strictEqual(line.data.entry.by, 'person');
      assert.ok(await until(() => got.find(x => x.ev === 'cos.system.state' && x.data.name === 'beta')), 'the state change was heard');
      req.destroy();
    });

    await test('CU-04', 'proposals: an agent holds, a person takes (by = person), an agent cannot take, a drop is ledgered', async () => {
      const bad = await call(MP, 'POST', '/api/cos/proposals', { by: 'person', verb: 'restart', target: 'alpha', why: 'x' }); assert.strictEqual(bad.code, 400, 'a proposal is an agent\'s');
      const p = (await call(MP, 'POST', '/api/cos/proposals', { by: 'agent:healer', verb: 'restart', target: 'alpha', why: 'health is slow' })).body.proposal;
      assert.strictEqual(p.status, 'held'); assert.strictEqual(p.seen.state, sup.get('alpha').state);
      assert.strictEqual((await call(UP, 'POST', `/api/cos/proposals/${p.id}/take`, { by: 'agent:healer' }, own)).code, 400, 'an agent cannot take');
      const t = await call(UP, 'POST', `/api/cos/proposals/${p.id}/take`, { by: 'person' }, own); assert.strictEqual(t.code, 200); assert.strictEqual(t.body.proposal.status, 'taken');
      assert.strictEqual((await call(UP, 'POST', `/api/cos/proposals/${p.id}/take`, { by: 'person' }, own)).code, 409, 'taken once');
      const q = (await call(MP, 'POST', '/api/cos/proposals', { by: 'agent:copilot', verb: 'stop', target: 'beta', why: 'idle for an hour' })).body.proposal;
      await call(UP, 'POST', `/api/cos/proposals/${q.id}/drop`, { by: 'person' }, own);
      const kinds = sup.ledger({ limit: 50 }).map(e => `${e.kind}:${e.by}`);
      for (const k of ['proposal-held:agent:healer', 'restart:person', 'proposal-taken:person', 'proposal-dropped:person']) assert.ok(kinds.includes(k), `${k} on the ledger`);
      assert.strictEqual(sup.get('beta').state !== 'stopped', true, 'a dropped stop did not run');
    });

    await test('CU-05', 'logs and usage: its own output kept; memory read back, "not read" with why when not running', async () => {
      const lg = await until(async () => { const r = await call(UP, 'GET', '/api/cos/systems/alpha/logs?limit=20'); return r.body.lines && r.body.lines.some(l => l.stream === 'err') && r; });
      assert.ok(lg, 'stderr lines kept'); assert.ok(lg.body.lines.every(l => l.ts && l.line));
      const u = (await call(UP, 'GET', '/api/cos/usage')).body.usage;
      assert.ok(u.host.cpus > 0 && u.host.totalMB > 0 && u.host.haltPct === 0.1);
      if (process.platform !== 'win32') assert.ok(u.systems.alpha.rssMB > 0, JSON.stringify(u.systems.alpha));
      assert.strictEqual(u.systems.gamma.notRead, 'not running');
    });

    await test('CU-06', 'in Clear Glass: the systems listed; a restart from a card, confirmed, ledgered by person; an undeclared call refused and shown', async () => {
      const glass = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
      let b = null; try { if (glass.engine()) b = await glass.chromium.launch(); } catch (e) { console.log(`  - CU-06 SKIPPED: Clear Glass's engine could not start (${e.message.split('\n')[0]})`); skipped++; passed--; return; }
      if (!b) { console.log('  - CU-06 SKIPPED: Clear Glass has no engine here'); skipped++; passed--; return; }
      try {
        const pg = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []; pg.on('pageerror', e => errs.push(String(e.message || e)));
        await pg.goto(`http://127.0.0.1:${UP}/shell/#/overview`); await pg.waitForTimeout(2200);
        assert.deepStrictEqual(await pg.evaluate(() => [...document.querySelectorAll('#nav-systems a')].map(a => a.dataset.sys).sort()), ['alpha', 'beta', 'gamma']);
        const before = sup.ledger({ limit: 500 }).filter(e => e.kind === 'restart' && e.system === 'alpha').length;
        await pg.evaluate(() => { const f = document.querySelector('iframe[data-page="overview"]').contentDocument; const card = [...f.querySelectorAll('.card')].find(c => c.querySelector('.card-name a').textContent === 'alpha');
          [...card.querySelectorAll('.card-foot button')].find(b => /Restart/.test(b.textContent)).click(); });
        await pg.waitForTimeout(400);
        assert.ok(await pg.evaluate(() => !document.getElementById('confirm').hidden && /Restart alpha\?/.test(document.getElementById('confirm-title').textContent)), 'the act is named before it runs');
        await pg.evaluate(() => document.getElementById('confirm-yes').click());
        assert.ok(await until(() => sup.ledger({ limit: 500 }).filter(e => e.kind === 'restart' && e.system === 'alpha' && e.by === 'person').length > before), 'the restart is on the ledger by = person');
        const shown = await pg.evaluate(async () => { const w = document.querySelector('iframe[data-page="overview"]').contentWindow; try { await w.COS.call('GET', '/api/cos/legacy-callers'); return 'not refused'; } catch (e) { return [e.refused, w.document.querySelector('.refused') && w.document.querySelector('.refused').textContent]; } });
        assert.ok(shown[0] === true && /not declared/.test(shown[1]), JSON.stringify(shown));
        assert.deepStrictEqual(errs, [], 'no page error');
      } finally { await b.close(); }
    });
  } finally {
    sup.shutdown({ by: 'test' }); mgr.close(); ui.close(); setTimeout(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }, 200);
  }
  console.log(`\n  ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`);
  setTimeout(() => process.exit(failed ? 1 : 0), 600);
})();
