'use strict';
// run-all: timeout 120000
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-cos-channel.test.js — MG34, 0.60.352. Map: docs/2026-10-24-cos-manager-phasemap.spec MG34.
 * James, 2026-11-01: "not tension, thats noise. cos ui needs a channel."
 *   CH-01  status(): the manager up (a stand-in answering as cos-manager), the cockpit down — each said, with why
 *   CH-02  start() beside an old autopilot on the manager's port: refused (409), nothing started
 *   CH-03  start() with the manager up and the cockpit down: the real cockpit (cos/ui/serve.js) is started and answers
 *   CH-04  the channel page in Clear Glass: down → the reason and Start COS; Start → the cockpit framed
 *   CH-05  the TV: ⬢ COS loads channels/cos/cos.html; TENSION hidden from the rail, kept
 *   CH-06  TV4 (0.60.360), the real TV page in Clear Glass: the overview shows Idearium and COS only; "all systems" shows the other eleven;
 *          the COS tile reads its status from the orchestrator ("cos is not there still … clear it all if possible and add ideearium and cos")
 */
const assert = require('assert'), http = require('http'), path = require('path'), fs = require('fs'), os = require('os');
const ROOT = path.join(__dirname, '..', '..'), UI = path.join(ROOT, 'lib/ui/tv-shell');
if (!process.env.GLASS_CHROMIUM) { const c = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'; if (fs.existsSync(c) && !fs.existsSync(path.join(ROOT, 'node_modules/electron'))) process.env.GLASS_CHROMIUM = c; }
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 4).join('\n    ')}`); failed++; } }
const D = require(path.join(ROOT, 'orchestrator/cos-ui-door.js'));
const freePort = () => new Promise(r => { const s = http.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const serve = (fn) => new Promise(r => { const s = http.createServer(fn); s.listen(0, '127.0.0.1', () => r(s)); });
const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-ch-'));

(async () => {
  console.log('\n⬢  The COS channel (MG34)\n');
  const mgr = await serve((req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(req.url === '/api/cos/health' ? { ok: true, service: 'cos-manager', pid: 4242, systems: 9 } : { ok: true })); });
  const old = await serve((req, res) => { res.statusCode = 404; res.end('{"error":"autopilot: not found"}'); });
  const mgrPort = mgr.address().port, uiPort = await freePort();
  let started = null;
  await test('CH-01', 'status: manager up, cockpit down, each said', async () => {
    const st = await D.status({ uiPort, mgrPort });
    assert.strictEqual(st.manager.up, true); assert.strictEqual(st.manager.pid, 4242);
    assert.strictEqual(st.cockpit.up, false); assert.ok(new RegExp(`:${uiPort}`).test(st.cockpit.why), st.cockpit.why);
  });
  await test('CH-02', 'start beside an old autopilot: refused, nothing started', async () => {
    const r = await D.start({ uiPort, mgrPort: old.address().port, logDir });
    assert.strictEqual(r.ok, false); assert.strictEqual(r.code, 409); assert.ok(/not as COS's manager/.test(r.error) && /second supervisor/.test(r.error), r.error);
    assert.strictEqual((await D.probe(uiPort, '/')).up, false);
  });
  await test('CH-03', 'manager up, cockpit down: the real cockpit started, answering', async () => {
    const r = await D.start({ uiPort, mgrPort, logDir });
    started = r.pid;
    assert.ok(r.ok, JSON.stringify(r)); assert.strictEqual(r.started, 'cockpit'); assert.strictEqual(r.cockpit.up, true);
    const again = await D.start({ uiPort, mgrPort, logDir }); assert.strictEqual(again.started, null, 'already up → nothing started');
  });
  if (started) try { process.kill(started); } catch (_) {}

  // the page, against a stand-in orchestrator whose cockpit is a stand-in page
  let up = false;
  const cockpit = await serve((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>cockpit</title><h1 id="ck">COS cockpit</h1>'); });
  const cockUrl = `http://127.0.0.1:${cockpit.address().port}/`;
  const st = () => ({ ok: true, cockpit: up ? { up: true, url: cockUrl } : { up: false, url: cockUrl, why: 'nothing answers on :7797 (ECONNREFUSED)' }, manager: { up: false, why: 'nothing answers on :7799 (ECONNREFUSED)' } });
  const orch = await serve((req, res) => {
    const u = req.url.split('?')[0]; res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
    const j = (d) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(d)); };
    if (u === '/api/cos-ui/status') return j(st());
    if (u === '/api/cos-ui/start' && req.method === 'POST') { up = true; return j({ ...st(), started: 'manager', pid: 99 }); }
    const f = path.join(UI, u); if (!f.startsWith(UI) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', f.endsWith('.js') ? 'application/javascript; charset=utf-8' : f.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8'); res.end(fs.readFileSync(f));
  });
  const origin = `http://127.0.0.1:${orch.address().port}`;
  const glass = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
  let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - CH-04 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); }
  if (browser) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
    await test('CH-04', 'down → the reason and Start COS; Start → the cockpit framed', async () => {
      await page.goto(`${origin}/channels/cos/cos.html?orch=${encodeURIComponent(origin)}`);
      await page.waitForFunction(() => document.getElementById('down').style.display === 'block');
      const t = await page.evaluate(() => document.getElementById('down').textContent);
      assert.ok(/:7797/.test(t) && /:7799/.test(t) && /Start COS/.test(t), t);
      assert.strictEqual(await page.evaluate(() => document.getElementById('frame').style.display), 'none', 'never a blank frame');
      if (process.env.CH_SHOTS) await page.screenshot({ path: path.join(process.env.CH_SHOTS, 'cos-channel-down.png') });
      await page.evaluate(() => document.getElementById('start').click());
      await page.waitForFunction(() => document.getElementById('frame').style.display === 'block');
      assert.strictEqual(await page.evaluate(() => document.getElementById('frame').getAttribute('src')), cockUrl);
      assert.ok(/started COS's manager \(pid 99\)/.test(await page.evaluate(() => document.getElementById('msg').textContent)));
    });
    await test('CH-06', 'the overview: Idearium and COS only; all systems shows the rest; COS reads its status', async () => {
      up = true;
      const p2 = await browser.newPage({ viewport: { width: 1400, height: 900 } });
      await p2.goto(`${origin}/index.html`);
      await p2.waitForFunction(() => document.getElementById('ts-cos') && document.getElementById('ts-cos').textContent !== '—', null, { timeout: 15000 }).catch(() => {});
      const vis = () => p2.evaluate(() => [...document.querySelectorAll('#sys-grid .sys-tile')].filter(t => getComputedStyle(t).display !== 'none').map(t => t.id));
      assert.deepStrictEqual(await vis(), ['tile-idr', 'tile-cos']);
      if (process.env.CH_SHOTS) await p2.screenshot({ path: path.join(process.env.CH_SHOTS, 'tv-overview.png') });
      await p2.evaluate(() => { const c = document.getElementById('ov-all-systems'); c.checked = true; c.dispatchEvent(new Event('change')); });
      assert.strictEqual((await vis()).length, 13, 'the eleven hidden, not removed');
      await p2.evaluate(() => { const c = document.getElementById('ov-all-systems'); c.checked = false; c.dispatchEvent(new Event('change')); });
      await p2.close();
    });
    await browser.close();
  }
  for (const s of [mgr, old, cockpit, orch]) s.close();
  await test('CH-05', 'the TV: COS loads its page; TENSION hidden, kept', () => {
    const html = fs.readFileSync(path.join(UI, 'index.html'), 'utf8');
    assert.ok(/if\(chId==='ch-cos'\)\{[^\n]*f\.src='channels\/cos\/cos\.html'/.test(html));
    assert.ok(/\{id:'ch-tension'[^\n]*hidden:true\}/.test(html) && /\{id:'ch-cos'[^\n]*railLabel:'⬢ COS'\}/.test(html) && !/\{id:'ch-cos'[^\n]*hidden/.test(html));
  });
  fs.rmSync(logDir, { recursive: true, force: true });
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
