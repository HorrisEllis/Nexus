'use strict';
/**
 * tests/modules/test-cos-console-tab.test.js — SC11: COS's Console tab (docs/2026-11-02-cos-console-phasemap.spec)
 * James, 2026-11-05: "next phase. cos needs the console from the autopilot. like a console tab"
 *
 *   CT1-01  what two real systems print reaches GET /api/cos/console, every system merged in time order; ?system= gives one
 *   CT1-02  lines arrive live on the manager's stream as cos.console, in batches
 *   CT1-03  the contract declares the Console page, its routes and the event (the shell builds its tab from it)
 *   CT1-04  in Clear Glass: the Console tab shows both systems' lines with their names, filters to one, and runs a command (ps)
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), net = require('net');
const ROOT = path.join(__dirname, '..', '..');
if (!process.env.GLASS_CHROMIUM) { const c = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'; if (fs.existsSync(c) && !fs.existsSync(path.join(ROOT, 'node_modules/electron/dist/electron'))) process.env.GLASS_CHROMIUM = c; }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-console-tab-'));
process.env.COS_MANAGER_DATA = path.join(tmp, 'data');
const { createSupervisor } = require(path.join(ROOT, 'cos/manager/supervisor.js'));
const { listen } = require(path.join(ROOT, 'cos/manager/server.js'));

let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 5).join('\n    ')}`); failed++; } }
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const wait = async (fn, ms = 8000) => { const until = Date.now() + ms; while (Date.now() < until) { const v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 100)); } throw new Error('timed out waiting'); };
const getJ = (port, p) => new Promise((res, rej) => http.get({ host: '127.0.0.1', port, path: p, timeout: 3000 }, r => { let t = ''; r.on('data', c => t += c); r.on('end', () => { try { res(JSON.parse(t)); } catch (e) { rej(e); } }); }).on('error', rej));
// a tiny system: prints a line every 150 ms (stdout), one error line (stderr), and answers /health
const TALKER = (name, port) => `const http=require('http');let n=0;http.createServer((q,r)=>r.end('{"ok":true}')).listen(${port},'127.0.0.1');console.error('${name} warns once');setInterval(()=>console.log('${name} says '+(++n)),150);\n`;

(async () => {
  console.log('\n⬢  COS console tab (SC11)\n');
  const pA = await freePort(), pB = await freePort();
  fs.writeFileSync(path.join(tmp, 'alpha.js'), TALKER('alpha', pA)); fs.writeFileSync(path.join(tmp, 'beta.js'), TALKER('beta', pB));
  const sup = createSupervisor({ root: tmp, ledgerFile: path.join(tmp, 'data', 'ledger.jsonl'), log: () => {}, policy: { stopGraceMs: 200 },
    declarations: [{ name: 'alpha', system: 'alpha', cmd: process.execPath, args: [path.join(tmp, 'alpha.js')], healthUrl: `http://127.0.0.1:${pA}/health`, phase: 1 },
                   { name: 'beta', system: 'beta', cmd: process.execPath, args: [path.join(tmp, 'beta.js')], healthUrl: `http://127.0.0.1:${pB}/health`, phase: 1 }] });
  const srv = await listen(sup, 0); const M = srv.address().port;
  sup.start('alpha', { by: 'test' }); sup.start('beta', { by: 'test' });
  try {
    await test('CT1-01', 'both systems\' lines merged in time order; ?system= gives one', async () => {
      const r = await wait(async () => { const j = await getJ(M, '/api/cos/console?limit=200'); return j.lines.some(l => l.system === 'alpha' && /says/.test(l.line)) && j.lines.some(l => l.system === 'beta' && /says/.test(l.line)) && j; });
      assert.ok(r.lines.every((l, i) => i === 0 || l.ts >= r.lines[i - 1].ts), 'merged in time order');
      assert.ok(r.lines.some(l => l.system === 'alpha' && l.stream === 'err' && /warns once/.test(l.line)), 'stderr kept as err');
      const only = await getJ(M, '/api/cos/console?system=beta');
      assert.ok(only.lines.length && only.lines.every(l => l.system === 'beta'));
    });

    await test('CT1-02', 'lines arrive live as cos.console, in batches', async () => {
      const got = await new Promise((resolve, reject) => {
        const q = http.get({ host: '127.0.0.1', port: M, path: '/api/cos/events' }, (res) => {
          let buf = ''; const seen = [];
          res.on('data', (c) => { buf += c; let i; while ((i = buf.indexOf('\n\n')) >= 0) { const f = buf.slice(0, i); buf = buf.slice(i + 2);
            if (/^event: cos\.console/m.test(f)) { const d = JSON.parse(f.split('\n').find(x => x.startsWith('data: ')).slice(6)); seen.push(d); if (seen.reduce((n, x) => n + x.lines.length, 0) >= 4) { q.destroy(); resolve(seen); } } } });
        });
        q.on('error', () => {}); setTimeout(() => reject(new Error('no cos.console in 5 s')), 5000);
      });
      const lines = got.flatMap(x => x.lines);
      assert.ok(lines.some(l => l.system === 'alpha') && lines.some(l => l.system === 'beta'), JSON.stringify(lines.slice(0, 4)));
      assert.ok(got.length < lines.length, 'batched: fewer events than lines');
    });

    await test('CT1-03', 'the contract declares the Console page, its routes and cos.console', () => {
      const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'cos/manager/contract.json'), 'utf8'));
      const p = c.pages.find(x => x.id === 'console');
      assert.deepStrictEqual([p.title, p.nav, p.built, p.path], ['Console', 'main', true, 'console/']);
      for (const r of ['GET /api/cos/console', 'POST /api/cos/cli']) assert.ok(p.routes.includes(r), r);
      assert.ok(c.routes.some(r => r.method === 'GET' && r.path === '/api/cos/console') && c.events['cos.console']);
      assert.ok(p.listens.includes('cos.console'));
    });

    const glass = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
    let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - CT1-04 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); }
    if (browser) {
      await test('CT1-04', 'in Clear Glass: both systems\' lines with their names, one system filtered, a command run', async () => {
        const ui = require(path.join(ROOT, 'cos/ui/serve.js')).createServer({ port: 0, manager: `http://127.0.0.1:${M}` });
        await new Promise(r => ui.listen(0, '127.0.0.1', r)); const U = ui.address().port;
        const page = await browser.newPage({ viewport: { width: 1360, height: 860 } });
        const errors = []; page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(`http://127.0.0.1:${U}/shell/#/console`);
        const F = `(document.querySelector('iframe[data-page="console"]') || {}).contentDocument`;
        await wait(async () => page.evaluate(`(() => { const d = ${F}; return !!(d && d.querySelectorAll('#term .ln').length > 3); })()`), 15000);
        const names = await page.evaluate(`[...new Set([...${F}.querySelectorAll('#term .ln .sys')].map(e => e.textContent))]`);
        assert.ok(names.includes('alpha') && names.includes('beta'), JSON.stringify(names));
        assert.ok(await page.evaluate(`!!${F}.querySelector('#term .ln.err')`), 'an error line is marked');
        assert.ok(await page.evaluate(`!!document.querySelector('#nav-main a[data-page="console"]')`), 'the tab is in the rail');
        await page.evaluate(`[...${F}.querySelectorAll('#f-sys .chip')].find(c => c.firstChild.textContent === 'alpha').click()`);
        await wait(async () => page.evaluate(`(() => { const s = [...${F}.querySelectorAll('#term .ln .sys')].map(e => e.textContent); return s.length && s.every(x => x === 'beta'); })()`), 5000);
        await page.evaluate(`(() => { const d = ${F}; d.getElementById('line').value = 'ps'; d.getElementById('prompt').requestSubmit(); })()`);
        await wait(async () => page.evaluate(`(() => { const t = ${F}.getElementById('term').textContent; return /cos> ps/.test(t) && /alpha/.test(t); })()`), 6000);
        if (process.env.CC_SHOTS) await page.screenshot({ path: path.join(process.env.CC_SHOTS, 'cos-console-tab.png') });
        assert.deepStrictEqual(errors, []);
        ui.close();
      });
      await browser.close();
    }
  } finally { srv.close(); sup.shutdown({ by: 'test' }); }
  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exitCode = failed ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 500);
})();
