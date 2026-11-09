'use strict';
/**
 * tests/modules/test-cos-settings.test.js — COS's Settings (SC7 expanded 2026-11-08, docs/2026-11-02-cos-console-phasemap.spec)
 * James, 2026-11-08: "also in cos ui, network should move to the settings under a network tab. startup and services tab. none of cos ui should be
 * hardcoded when it comes to compartments.  updates should move to a update tab." · to the preview: "I like the settings."
 *
 *   ST-01  the contract: Settings in the rail's foot; Network, Startup and services, Update are its tabs (nav settings, in tab order), each page
 *          kept whole with its own route; Settings' and Startup's code name no tab, no option and no system
 *   ST-02  the exe's door and its owner agree: every startup option the exe names is a setting cos/app/settings.js accepts, with its value
 *   ST-03  in Clear Glass, against a real supervisor with two systems: three tabs read from the contract, in order; Network's page loads inside
 *          its tab and speaks to the shell; Startup lists both systems from COS, Start at boot off for one is his configuration, read back;
 *          COS itself draws the options the exe gives and sends a change through its door; #/settings/updates/settings opens Update's settings;
 *          in a plain browser (no exe) COS itself says where to change it
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), net = require('net');
const ROOT = path.join(__dirname, '..', '..');
if (!process.env.GLASS_CHROMIUM) { const c = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'; if (fs.existsSync(c) && !fs.existsSync(path.join(ROOT, 'node_modules/electron/dist/electron'))) process.env.GLASS_CHROMIUM = c; }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-settings-'));
process.env.COS_MANAGER_DATA = path.join(tmp, 'data');
const { createSupervisor } = require(path.join(ROOT, 'cos/manager/supervisor.js'));
const { listen } = require(path.join(ROOT, 'cos/manager/server.js'));
const W = require(path.join(ROOT, 'cos/app/window.js')), Settings = require(path.join(ROOT, 'cos/app/settings.js'));

let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 5).join('\n    ')}`); failed++; } }
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const wait = async (fn, ms = 8000) => { const until = Date.now() + ms; while (Date.now() < until) { const v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 100)); } throw new Error(`timed out waiting: ${String(fn).slice(0, 140)}`); };
const getJ = (port, p) => new Promise((res, rej) => http.get({ host: '127.0.0.1', port, path: p, timeout: 5000 }, r => { let t = ''; r.on('data', c => t += c); r.on('end', () => { try { res(JSON.parse(t)); } catch (e) { rej(e); } }); }).on('error', rej));
const SYS = (port) => `require('http').createServer((q,r)=>r.end('{"ok":true}')).listen(${port},'127.0.0.1');setInterval(()=>{},1000);\n`;

(async () => {
  console.log('\n⬢  COS: Settings (SC7 expanded)\n');
  const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'cos/manager/contract.json'), 'utf8'));
  await test('ST-01', 'Settings in the foot; its tabs from the contract, in order, each page kept whole; its code names none of them', () => {
    const s = c.pages.find(x => x.id === 'settings');
    assert.deepStrictEqual([s.nav, s.built, s.route], ['foot', true, '#/settings']);
    const tabs = c.pages.filter(p => p.nav === 'settings').sort((a, b) => a.tab - b.tab);
    assert.deepStrictEqual(tabs.map(p => [p.id, p.tabTitle]), [['network', 'Network'], ['startup', 'Startup and services'], ['updates', 'Update']]);
    for (const p of tabs) { assert.ok(p.built && p.route === `#/${p.id}`, `${p.id} keeps its own route`); for (const f of ['index.html', 'page.js', 'page.css']) assert.ok(fs.existsSync(path.join(ROOT, 'cos/ui', p.path, f)), `${p.id}/${f}`); }
    const code = (p) => fs.readFileSync(path.join(ROOT, 'cos/ui', p), 'utf8').split('\n').filter(l => !/^\s*(\*|\/\/|\/\*\*)/.test(l)).join('\n');
    for (const id of ['network', 'updates', 'startup']) assert.ok(!code('settings/page.js').includes(`'${id}'`), `settings names no tab (${id})`);
    for (const o of W.STARTUP) assert.ok(!code('startup/page.js').includes(o.key), `startup names no option (${o.key})`);
    const sys = (c.pages || []).length && require(path.join(ROOT, 'cos/manager/supervisor.js')); assert.ok(sys);
    for (const n of ['idearium', 'cortex', 'guardian', 'clear-glass', 'orchestrator']) assert.ok(!code('startup/page.js').includes(n) && !code('settings/page.js').includes(n), `no system named (${n})`);
  });

  await test('ST-02', 'every startup option the exe names is a setting its owner accepts, with its value', () => {
    const root = path.join(tmp, 'app'); const r = W.startupOptions(Settings.DEFAULTS);
    assert.strictEqual(r.owner, 'cos.app'); assert.strictEqual(r.options.length, W.STARTUP.length);
    for (const o of r.options) {
      assert.strictEqual(o.value, Settings.DEFAULTS[o.key], `${o.key} reads its default`);
      const v = o.kind === 'bool' ? !o.value : o.choices.find(x => x.value !== o.value).value;
      const s = Settings.set(root, o.key, v); assert.ok(s.ok, `${o.key}: ${s.error}`); assert.strictEqual(s.settings[o.key], v);
      assert.strictEqual(W.startupOptions(s.settings).options.find(x => x.key === o.key).value, v, `${o.key} read back`);
    }
  });

  const pA = await freePort(), pB = await freePort();
  fs.writeFileSync(path.join(tmp, 'alpha.js'), SYS(pA)); fs.writeFileSync(path.join(tmp, 'beta.js'), SYS(pB));
  const sup = createSupervisor({ root: tmp, ledgerFile: path.join(tmp, 'data', 'ledger.jsonl'), log: () => {}, policy: { stopGraceMs: 200 },
    declarations: [{ name: 'alpha', system: 'alpha', cmd: process.execPath, args: [path.join(tmp, 'alpha.js')], healthUrl: `http://127.0.0.1:${pA}/health`, phase: 1 },
                   { name: 'beta', system: 'beta', cmd: process.execPath, args: [path.join(tmp, 'beta.js')], healthUrl: `http://127.0.0.1:${pB}/health`, phase: 1 }] });
  const srv = await listen(sup, 0); const M = srv.address().port;
  sup.start('alpha', { by: 'test' }); sup.start('beta', { by: 'test' });
  try {
    const glass = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
    let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - ST-03 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); }
    if (browser) {
      await test('ST-03', 'in Clear Glass: three tabs from the contract; Network inside its tab; Startup lists COS\'s systems, boot off read back; COS itself through the exe\'s door; Update\'s settings by hash', async () => {
        const ui = require(path.join(ROOT, 'cos/ui/serve.js')).createServer({ port: 0, manager: `http://127.0.0.1:${M}` });
        await new Promise(r => ui.listen(0, '127.0.0.1', r)); const U = ui.address().port;
        const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
        const errors = []; page.on('pageerror', (e) => errors.push(e.message));
        // a plain browser first: no exe, and COS itself says so
        await page.goto(`http://127.0.0.1:${U}/shell/#/settings/startup`);
        const S = `(document.querySelector('iframe[data-page="settings"]') || {}).contentDocument`;
        const T = (id) => `((${S} || document).querySelector('iframe[data-page="${id}"]') || {}).contentDocument`;
        await wait(async () => page.evaluate(`(() => { const d = ${S}; return !!(d && d.querySelectorAll('#tabs button').length === 3); })()`), 15000);
        assert.deepStrictEqual(await page.evaluate(`[...${S}.querySelectorAll('#tabs button')].map(b => b.textContent)`), ['Network', 'Startup and services', 'Update']);
        assert.ok(await page.evaluate(`!!document.querySelector('#nav-foot a[data-page="settings"]')`), 'Settings is in the rail\'s foot');
        assert.ok(await page.evaluate(`!document.querySelector('#nav-main a[data-page="network"]') && !document.querySelector('#nav-main a[data-page="updates"]')`), 'Network and Updates left the rail');
        await wait(async () => page.evaluate(`(() => { const d = ${T('startup')}; return !!(d && d.querySelectorAll('#systems .su-row').length === 2); })()`), 15000);
        assert.match(await page.evaluate(`${T('startup')}.getElementById('self').textContent`), /Open this page in the COS window/);
        // Start at boot off for beta, from the tab
        await page.evaluate(`${T('startup')}.querySelector('.switch[data-sys="beta"]').click()`);
        await wait(async () => { const r = await getJ(M, '/api/cos/systems/beta/config'); const st = r.settings && r.settings['start.autostart']; return st && st.value === false && st.from === 'his'; });
        await wait(async () => page.evaluate(`${T('startup')}.querySelector('.switch[data-sys="beta"]').getAttribute('aria-checked') === 'false'`), 5000);
        // the exe's door: the shell's window carries cosStart (here a stand-in that answers as the exe's startupOptions does)
        const opts = W.startupOptions(Settings.DEFAULTS);
        await page.evaluate(`(() => { const o = ${JSON.stringify(opts)}; window.__calls = []; window.cosStart = { startup: async () => o,
          setStartup: async (k, v) => { window.__calls.push([k, v]); const x = o.options.find(y => y.key === k); if (!x) return { ok: false, error: 'not one' }; x.value = v; return { ok: true, ...o }; } }; })()`);
        await page.evaluate(`${S}.querySelector('iframe[data-page="startup"]').contentWindow.location.reload()`);
        await wait(async () => page.evaluate(`(() => { const d = ${T('startup')}; return !!(d && d.querySelectorAll('#self .su-row').length === ${opts.options.length}); })()`), 15000);
        await page.evaluate(`${T('startup')}.querySelector('#self .switch[data-k="${W.STARTUP.find(o => o.kind === 'bool' && !Settings.DEFAULTS[o.key]).key}"]').click()`);
        await wait(async () => page.evaluate(`window.__calls.length === 1`), 5000);
        const [k, v] = await page.evaluate(`window.__calls[0]`); assert.strictEqual(v, true); assert.ok(W.STARTUP.some(o => o.key === k));
        await wait(async () => page.evaluate(`${T('startup')}.querySelector('#self .switch[data-k="${k}"]').getAttribute('aria-checked') === 'true'`), 5000);
        if (process.env.CC_SHOTS) await page.screenshot({ path: path.join(process.env.CC_SHOTS, 'cos-settings-startup.png') });
        // Network inside its tab: its page starts and draws its gates (it spoke to the shell through the top frame)
        await page.evaluate(`${S}.querySelector('#tabs button[data-tab="network"]').click()`);
        await wait(async () => page.evaluate(`(() => { const d = ${T('network')}; return !!(d && d.getElementById('nw-gates') && !/reading/.test(d.getElementById('nw-gates').textContent)); })()`), 15000);
        assert.ok(await page.evaluate(`location.hash === '#/settings/network'`), 'the tab is in the address');
        assert.ok(!(await page.evaluate(`!!${T('network')}.querySelector('.refused')`)), 'nothing refused');
        if (process.env.CC_SHOTS) await page.screenshot({ path: path.join(process.env.CC_SHOTS, 'cos-settings-network.png') });
        // Update's settings, by the address
        await page.evaluate(`location.hash = '#/settings/updates/settings'`);
        await wait(async () => page.evaluate(`(() => { const d = ${T('updates')}; return !!(d && d.getElementById('settings') && !d.getElementById('settings').hidden); })()`), 15000);
        if (process.env.CC_SHOTS) await page.screenshot({ path: path.join(process.env.CC_SHOTS, 'cos-settings-update.png') });
        assert.deepStrictEqual(errors, [], 'no page error'); ui.close();
      });
      await browser.close();
    }
  } finally {
    sup.shutdown({ by: 'test' }); srv.close();
    await new Promise(r => setTimeout(r, 300));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
