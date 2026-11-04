'use strict';
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-automation-driver-port.test.js — AE2, 0.60.333 (docs/2026-10-25-automation-engine-to-orchestrator-phasemap.spec).
 * James, 2026-10-31: "merge and finish automation and cos backend".
 *   DP-01 the orchestrator's engine hook (browserFn) reaches Clear Glass's port over HTTP and drives a real page (glass.js, never Playwright)
 *   DP-02 a macro step reaches the macro runner with its name, page and params; a failing step comes back as { error }, not a crash
 *   DP-03 Clear Glass down: the hook says "browser steps need Clear Glass running" — the engine names the step, nothing throws
 */
const assert = require('assert'), path = require('path'), http = require('http'), fs = require('fs');
const ROOT = path.join(__dirname, '..', '..');
if (!process.env.GLASS_CHROMIUM) { const c = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'; if (fs.existsSync(c) && !fs.existsSync(path.join(ROOT, 'node_modules/electron'))) process.env.GLASS_CHROMIUM = c; }
const port = () => new Promise(r => { const s = http.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 3).join('\n    ')}`); failed++; } }

(async () => {
  console.log('\n⬡  the automation engine drives Clear Glass\'s browser through the port (AE2)\n');
  const P = await port(); process.env.WIRE_PORT = String(P);   // the orchestrator reads it when its module loads
  const A = require(path.join(ROOT, 'orchestrator/automation/index.js'));
  const DP = require(path.join(ROOT, 'clear-glass/src/automation/driver-port.js'));
  const hooks = A.buildHooks({ guardianFn: async () => ({}), raidDecideFn: async () => null });
  let browser = null, pg = null; const macros = [];
  try { const { chromium } = require(path.join(ROOT, 'clear-glass/src/driver/glass.js')); browser = await chromium.launch(); pg = await browser.newPage(); } catch (e) { console.log(`  - DP-01 page part skipped: the engine could not start (${e.message.split('\n')[0]})`); }
  // the port as Clear Glass's wire server mounts it, with a browser step that drives the real page
  const srv = http.createServer(async (req, res) => { let t = ''; for await (const c of req) t += c;
    const r = await DP.handle({ method: req.method, url: req.url, body: t ? JSON.parse(t) : {} }, {
      browser: async (a) => { if (a.action === 'navigate') { await pg.goto(a.args.url); return { url: a.args.url }; } if (a.action === 'eval') return { result: await pg.evaluate(a.args.code) }; throw new Error(`no action ${a.action}`); },
      runMacro: async (m) => { macros.push(m); return { ran: m.name }; } });
    if (!r) { res.writeHead(404); return res.end('{}'); } res.writeHead(r.status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(r.body)); });
  await new Promise(r => srv.listen(P, '127.0.0.1', r));
  try {
    if (pg) await test('DP-01', 'browserFn → the port over HTTP → a real page', async () => {
      await hooks.browserFn({ page: 'auto-1', action: 'navigate', args: { url: 'data:text/html,<title>Fiverr gig</title><h1 id=h>Hello gig</h1>' } });
      const r = await hooks.browserFn({ page: 'auto-1', action: 'eval', args: { code: "document.getElementById('h').textContent" } });
      assert.strictEqual(r.result, 'Hello gig', JSON.stringify(r));
    });
    await test('DP-02', 'a macro step reaches the runner; a failing step is { error }', async () => {
      assert.deepStrictEqual(await hooks.runMacroFn({ name: 'Fiverr gig - choose category', agentId: 'auto-1', params: { category: 'Programming & Tech' } }), { ran: 'Fiverr gig - choose category' });
      assert.deepStrictEqual(macros[0], { name: 'Fiverr gig - choose category', agentId: 'auto-1', params: { category: 'Programming & Tech' } });
      const bad = await hooks.browserFn({ page: 'auto-1', action: 'fly', args: {} });
      assert.ok(/no action fly/.test(bad.error), JSON.stringify(bad));
      assert.strictEqual(await DP.handle({ method: 'GET', url: '/automation/driver' }, {}), null, 'only its two POST routes');
    });
  } finally { await new Promise(r => srv.close(r)); }
  await test('DP-03', 'Clear Glass down: the step is named, nothing throws', async () => {
    const r = await hooks.browserFn({ page: 'auto-1', action: 'eval', args: { code: '1' } });
    assert.ok(r && r.ok === false && /browser steps need Clear Glass running/.test(r.error), JSON.stringify(r));
  });
  try { if (browser) await browser.close(); } catch (_) {}
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
