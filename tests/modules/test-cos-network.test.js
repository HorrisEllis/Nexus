'use strict';
// run-all: timeout 120000
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-cos-network.test.js — CA3, 0.60.367. Map: docs/2026-11-02-cos-the-application-phasemap.spec CA3 · Spec: cos/spec/network.spec.
 * James, 2026-11-02: "both but extensive settings for all of this." · "Gate behind settings to open. Make a full detailed settings for network."
 *   NW-01 defaults: everything off, every reach gate closed, tokens shown as not set
 *   NW-02 patch: an agent refused; a bad value refused naming the field, nothing written; the fixed safety values cannot be turned off;
 *         opening DDNS opens only DDNS's gate; a token is never read back
 *   NW-03 the manager's routes: GET shows settings and gates; PATCH by a person; by an agent 403
 *   NW-04 the anonymous kernel checks the gate before spawning a reach engine
 *   NW-05 the Network page in Clear Glass, through the real cockpit: all off; switch the tunnel on, save, its gate opens
 */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..', '..');
if (!process.env.GLASS_CHROMIUM) { const c = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'; if (fs.existsSync(c) && !fs.existsSync(path.join(ROOT, 'node_modules/electron'))) process.env.GLASS_CHROMIUM = c; }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-net-')); process.env.COS_MANAGER_DATA = dir;
const N = require(path.join(ROOT, 'cos/manager/network-settings.js'));
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 4).join('\n    ')}`); failed++; } }
const req = (port, method, p, body) => new Promise((res) => { const q = http.request({ host: '127.0.0.1', port, path: p, method, headers: { 'Content-Type': 'application/json' } }, (x) => { let t = ''; x.on('data', c => t += c); x.on('end', () => res({ status: x.statusCode, body: JSON.parse(t || '{}') })); }); q.end(body ? JSON.stringify(body) : undefined); });

(async () => {
  console.log('\n⇄  COS network settings, gated (CA3)\n');
  await test('NW-01', 'defaults: all off, every gate closed, tokens not set', () => {
    for (const e of ['tunnel', 'relay', 'upnp', 'ddns', 'ssh']) { const g = N.gate(e); assert.strictEqual(g.ok, false, e); assert.match(g.why, /switch on .* in Network settings/); }
    assert.strictEqual(N.gate('dns').ok, true, 'an engine that does not reach outside is not gated');
    const v = N.view(); assert.deepStrictEqual([v.outbound.tunnel.token, v.inbound.ddns.token], [{ set: false }, { set: false }]);
  });
  await test('NW-02', 'agent refused; bad value refused, nothing written; fixed values fixed; DDNS opens only DDNS; tokens never read back', () => {
    assert.strictEqual(N.patch({ inbound: { enabled: true } }, { by: 'agent:copilot' }).code, 403);
    const bad = N.patch({ inbound: { ssh: { port: 70000 }, ddns: { domain: 'not a domain' } } }, { by: 'person' });
    assert.strictEqual(bad.code, 400); assert.match(bad.error, /inbound\.ssh\.port: a whole number 1–65535/); assert.match(bad.error, /inbound\.ddns\.domain/);
    assert.strictEqual(fs.existsSync(path.join(dir, 'network.json')), false, 'nothing written');
    assert.match(N.patch({ inbound: { ssh: { keysOnly: false } } }, { by: 'person' }).error, /fixed at true/);
    const ok = N.patch({ inbound: { enabled: true, ddns: { enabled: true, domain: 'mynexus.duckdns.org', token: 'SECRET-123' } } }, { by: 'person' });
    assert.ok(ok.ok, ok.error);
    assert.deepStrictEqual(['tunnel', 'relay', 'upnp', 'ddns', 'ssh'].map(e => N.gate(e).ok), [false, false, false, true, false]);
    assert.ok(!JSON.stringify(N.view()).includes('SECRET-123') && !JSON.stringify(ok).includes('SECRET-123'), 'the token never read back');
    assert.deepStrictEqual(N.view().inbound.ddns.token, { set: true });
    N.patch({ inbound: { ddns: { domain: 'other.duckdns.org' } } }, { by: 'person' });
    assert.strictEqual(N.load().inbound.ddns.token, 'SECRET-123', 'a patch that leaves the token out keeps it');
  });
  const { createSupervisor } = require(path.join(ROOT, 'cos/manager/supervisor.js'));
  const sup = createSupervisor({ root: dir, ledgerFile: path.join(dir, 'l.jsonl'), log: () => {}, declarations: [] });
  const mgr = await require(path.join(ROOT, 'cos/manager/server.js')).listen(sup, 0, { root: dir });
  const mp = mgr.address().port;
  await test('NW-03', 'the routes: GET settings and gates; PATCH by a person; by an agent 403', async () => {
    const g = await req(mp, 'GET', '/api/cos/network'); assert.strictEqual(g.status, 200); assert.strictEqual(g.body.gates.ddns.ok, true); assert.deepStrictEqual(g.body.settings.inbound.ddns.token, { set: true });
    const a = await req(mp, 'PATCH', '/api/cos/network', { patch: { outbound: { enabled: true } }, by: 'agent:x' }); assert.strictEqual(a.status, 403);
    const p = await req(mp, 'PATCH', '/api/cos/network', { patch: { inbound: { ddns: { enabled: false } } }, by: 'person' }); assert.strictEqual(p.status, 200); assert.strictEqual(p.body.gates.ddns.ok, false);
    assert.ok(sup.ledger({}).some(e => e.kind === 'network'), 'on the ledger');
  });
  await test('NW-04', 'the anonymous kernel checks the gate before spawning a reach engine', () => {
    const src = fs.readFileSync(path.join(ROOT, 'cos/services/anonymous/nexus.js'), 'utf8');
    const i = src.indexOf('function spawnEngine(def) {'); const b = src.slice(i, i + 600);
    assert.ok(/network-settings\.js'\)\.gate\(def\.name\)/.test(b) && /if \(!g\.ok\) \{ log\('KERNEL', `\$\{def\.name\} not started — \$\{g\.why\}`/.test(b), b);
  });
  // the cockpit takes a write only from its own origin, which it knows by its configured port: one free port for both
  const cp = await new Promise(r => { const t = require('net').createServer(); t.listen(0, '127.0.0.1', () => { const x = t.address().port; t.close(() => r(x)); }); });
  const cockpit = require(path.join(ROOT, 'cos/ui/serve.js')).createServer({ port: cp, manager: `http://127.0.0.1:${mp}` });
  await new Promise(r => cockpit.listen(cp, '127.0.0.1', r));
  const glass = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
  let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - NW-05 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); }
  if (browser) {
    await test('NW-05', 'the Network page through the real cockpit: all shown; tunnel on, saved, its gate opens', async () => {
      const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
      await page.addInitScript(() => { window.confirm = () => true; });
      await page.goto(`http://127.0.0.1:${cp}/network/index.html`);
      let n = 0; for (let k = 0; k < 50 && n !== 5; k++) { await new Promise(r => setTimeout(r, 200)); n = await page.evaluate(() => document.querySelectorAll('[data-gate]').length); }
      assert.strictEqual(n, 5, `the gates drawn: ${await page.evaluate(() => document.body.innerText.slice(0, 300))}`);
      assert.ok(await page.evaluate(() => document.querySelectorAll('.nw-row').length) >= 25, 'every setting shown');
      if (process.env.NW_SHOTS) await page.screenshot({ path: path.join(process.env.NW_SHOTS, 'cos-network.png'), fullPage: true });
      await page.evaluate(() => { for (const p of ['outbound.enabled', 'outbound.tunnel.enabled']) { const i = document.querySelector(`[data-path="${p}"]`); i.checked = true; i.dispatchEvent(new Event('change')); } document.getElementById('nw-save').click(); });
      let open = false; for (let k = 0; k < 50 && !open; k++) { await new Promise(r => setTimeout(r, 200)); open = await page.evaluate(() => /open/.test((document.querySelector('[data-gate="tunnel"]') || {}).textContent || '')); }
      assert.ok(open, `the tunnel's gate after save — the page says: ${await page.evaluate(() => document.getElementById('nw-msg').textContent)}`);
      assert.strictEqual(N.gate('tunnel').ok, true); assert.strictEqual(N.gate('ddns').ok, false);
    });
    await browser.close();
  }
  cockpit.close(); mgr.close(); sup.shutdown({ by: 'test' });
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exit(failed ? 1 : 0);
})();
