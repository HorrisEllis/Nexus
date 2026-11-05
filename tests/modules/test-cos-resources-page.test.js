'use strict';
/**
 * tests/modules/test-cos-resources-page.test.js — the Resources page (CP6a expanded 2026-11-05, docs/2026-11-01-the-compartment-phasemap.spec)
 * James, 2026-11-05: "need that resource manager" · to the first step (priority, memory limit, start at boot, applied right away): "yes"
 *
 *   RP-01  the contract has Resources on the main rail, built, with its routes (moved out of planned, kept as plannedBefore)
 *   RP-02  in Clear Glass, against a real supervisor with two running systems: both listed with what they use; priority set to low from the
 *          page is applied to the running process and read back from the OS; a memory limit set from the page is his layer and waits for the
 *          next start; Start at boot switched off is his configuration
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), net = require('net');
const ROOT = path.join(__dirname, '..', '..');
if (!process.env.GLASS_CHROMIUM) { const c = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'; if (fs.existsSync(c) && !fs.existsSync(path.join(ROOT, 'node_modules/electron/dist/electron'))) process.env.GLASS_CHROMIUM = c; }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-res-page-'));
process.env.COS_MANAGER_DATA = path.join(tmp, 'data');
const { createSupervisor } = require(path.join(ROOT, 'cos/manager/supervisor.js'));
const { listen } = require(path.join(ROOT, 'cos/manager/server.js'));

let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 5).join('\n    ')}`); failed++; } }
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const wait = async (fn, ms = 8000) => { const until = Date.now() + ms; while (Date.now() < until) { const v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 100)); } throw new Error('timed out waiting'); };
const getJ = (port, p) => new Promise((res, rej) => http.get({ host: '127.0.0.1', port, path: p, timeout: 5000 }, r => { let t = ''; r.on('data', c => t += c); r.on('end', () => { try { res(JSON.parse(t)); } catch (e) { rej(e); } }); }).on('error', rej));
const SYS = (port) => `require('http').createServer((q,r)=>r.end('{"ok":true}')).listen(${port},'127.0.0.1');setInterval(()=>{},1000);\n`;

(async () => {
  console.log('\n⬢  COS: the Resources page (CP6a expanded)\n');
  await test('RP-01', 'Resources is on the main rail, built, with its routes', () => {
    const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'cos/manager/contract.json'), 'utf8'));
    const p = c.pages.find(x => x.id === 'resources');
    assert.deepStrictEqual([p.title, p.nav, p.built, p.path], ['Resources', 'main', true, 'resources/']);
    for (const r of ['GET /api/cos/resources', 'PATCH /api/cos/systems/:name/caps', 'PATCH /api/cos/systems/:name/config']) assert.ok(p.routes.includes(r), r);
    assert.ok(!c.planned.some(x => x.id === 'resources') && p.plannedBefore, 'out of planned, the old entry kept');
    for (const f of ['index.html', 'page.js', 'page.css']) assert.ok(fs.existsSync(path.join(ROOT, 'cos/ui/resources', f)), f);
  });

  const pA = await freePort(), pB = await freePort();
  fs.writeFileSync(path.join(tmp, 'alpha.js'), SYS(pA)); fs.writeFileSync(path.join(tmp, 'beta.js'), SYS(pB));
  const sup = createSupervisor({ root: tmp, ledgerFile: path.join(tmp, 'data', 'ledger.jsonl'), log: () => {}, policy: { stopGraceMs: 200 },
    declarations: [{ name: 'alpha', system: 'alpha', cmd: process.execPath, args: [path.join(tmp, 'alpha.js')], healthUrl: `http://127.0.0.1:${pA}/health`, phase: 1 },
                   { name: 'beta', system: 'beta', cmd: process.execPath, args: [path.join(tmp, 'beta.js')], healthUrl: `http://127.0.0.1:${pB}/health`, phase: 1 }] });
  const srv = await listen(sup, 0); const M = srv.address().port;
  sup.start('alpha', { by: 'test' }); sup.start('beta', { by: 'test' });
  try {
    await wait(async () => { const r = await getJ(M, '/api/cos/resources'); return r.resources.systems.every(s => s.pid); });
    const glass = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
    let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - RP-02 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); }
    if (browser) {
      await test('RP-02', 'in Clear Glass: both listed; priority low applied and read back; a memory limit waits for the next start; boot off', async () => {
        const ui = require(path.join(ROOT, 'cos/ui/serve.js')).createServer({ port: 0, manager: `http://127.0.0.1:${M}` });
        await new Promise(r => ui.listen(0, '127.0.0.1', r)); const U = ui.address().port;
        const page = await browser.newPage({ viewport: { width: 1360, height: 860 } });
        const errors = []; page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(`http://127.0.0.1:${U}/shell/#/resources`);
        const F = `(document.querySelector('iframe[data-page="resources"]') || {}).contentDocument`;
        await wait(async () => page.evaluate(`(() => { const d = ${F}; return !!(d && d.querySelectorAll('#rows .res-row').length === 2); })()`), 15000);
        assert.ok(await page.evaluate(`!!document.querySelector('#nav-main a[data-page="resources"]')`), 'on the rail');
        // priority → low, from the page
        await page.evaluate(`(() => { const s = ${F}.querySelector('select[data-k="priority"][data-sys="alpha"]'); s.value = 'low'; s.dispatchEvent(new Event('change')); })()`);
        const caps = await wait(async () => { const r = await getJ(M, '/api/cos/systems/alpha/caps'); return r.caps.priority === 'low' && r.caps.applied.priority.state === 'enforced' && r.caps; });
        const pid = sup.get('alpha').pid;
        assert.strictEqual(os.getPriority(pid), os.constants.priority.PRIORITY_LOW, 'the OS says the running process is low');
        assert.strictEqual(caps.layers.priority, 'his');
        // memory limit, from the page
        await page.evaluate(`(() => { const i = ${F}.querySelector('input[data-k="heapMB"][data-sys="beta"]'); i.value = '512'; i.dispatchEvent(new Event('change')); })()`);
        const b = await wait(async () => { const r = await getJ(M, '/api/cos/systems/beta/caps'); return r.caps.heapMB === 512 && r.caps; });
        assert.strictEqual(b.applied.heap.state, 'pending', 'a heap limit applies at its next start, said');
        // start at boot off, from the page
        await page.evaluate(`${F}.querySelector('.switch[data-sys="beta"]').click()`);
        await wait(async () => { const r = await getJ(M, '/api/cos/systems/beta/config'); const st = r.settings && r.settings['start.autostart']; return st && st.value === false; });
        await wait(async () => page.evaluate(`(() => { const s = ${F}.querySelector('select[data-k="priority"][data-sys="alpha"]'); return s && s.value === 'low'; })()`), 5000);
        if (process.env.CC_SHOTS) await page.screenshot({ path: path.join(process.env.CC_SHOTS, 'cos-resources.png') });
        assert.deepStrictEqual(errors, []);
        ui.close();
      });
      await browser.close();
    }
  } finally { srv.close(); sup.shutdown({ by: 'test' }); }
  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exitCode = failed ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 500);
})();
