'use strict';
// run-all: timeout 120000
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-update-menu.test.js — UP10, 0.60.352. Map: docs/2026-10-25-nexus-update-phasemap.spec UP10.
 * James, 2026-11-01: "can i update nexus from the floating menu button.?"
 *   UM-01  the orchestrator forwards check and apply to Idearium's /api/update (the one place the tree changes); apply without confirm → 428
 *          (source read: the orchestrator cannot be started on a test port; said, not run)
 *   UM-02  the floating menu in Clear Glass, against a stand-in orchestrator: ⇪ UPDATE shows what is waiting; Update now, after his yes,
 *          applies and says what to restart
 *   UM-03  up to date → said; diverged → said, no Update now button; Idearium down → said in red
 */
const assert = require('assert'), http = require('http'), path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..', '..'), UI = path.join(ROOT, 'lib/ui/tv-shell');
if (!process.env.GLASS_CHROMIUM) { const c = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'; if (fs.existsSync(c) && !fs.existsSync(path.join(ROOT, 'node_modules/electron'))) process.env.GLASS_CHROMIUM = c; }
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 4).join('\n    ')}`); failed++; } }

(async () => {
  console.log('\n⇪  Update from the floating menu (UP10)\n');
  await test('UM-01', 'the orchestrator forwards to Idearium; apply needs confirm', () => {
    const src = fs.readFileSync(path.join(ROOT, 'orchestrator/orchestrator.js'), 'utf8');
    const i = src.indexOf("seg[2] === 'check' || seg[2] === 'apply'"); assert.ok(i > 0);
    const b = src.slice(i, i + 1400);
    assert.ok(/GET\('idearium', `\/api\/update/.test(b) && /POST\('idearium', '\/api\/update\/apply', \{ confirm: true, by: 'person' \}/.test(b) && /b\.confirm !== true\) return json\(res, 428/.test(b), b);
  });
  let mode = 'behind', applied = 0;
  const CHECK = { behind: { ok: true, current: '0.60.346', latest: '0.60.352', behind: 31, ahead: 0, upToDate: false, releases: [1, 2, 3], plan: { blocks: [] }, can: null },
    uptodate: { ok: true, current: '0.60.352', latest: '0.60.352', behind: 0, upToDate: true, plan: { blocks: [] }, can: 'nothing to update' },
    diverged: { ok: true, current: '0.60.346', latest: '0.60.352', behind: 31, ahead: 1, upToDate: false, plan: { blocks: [] }, can: 'diverged: 1 local commit(s) not on GitHub — merging is yours (git pull)' },
    down: { ok: false, error: 'idearium did not answer: ECONNREFUSED' } };
  const srv = http.createServer((req, res) => {
    const u = req.url.split('?')[0]; res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
    const j = (s, d) => { res.statusCode = s; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(d)); };
    if (u === '/api/update/check') return j(mode === 'down' ? 502 : 200, CHECK[mode]);
    if (u === '/api/update/apply' && req.method === 'POST') { let t = ''; req.on('data', c => t += c); req.on('end', () => { const b = JSON.parse(t || '{}'); if (b.confirm !== true) return j(428, { ok: false, needsConfirm: true }); applied++;
      j(200, { ok: true, action: 'updated', from: { version: '0.60.346' }, to: { version: '0.60.352' }, archived: ['data/x.json'], archivedTo: '_archive/update/t', npm: { ran: false }, restart: { note: 'restart the systems whose files changed' } }); }); return; }
    if (u === '/') { res.setHeader('Content-Type', 'text/html'); return res.end(`<!doctype html><meta charset="utf-8"><body><script>window.NEXUS_ORCH=location.origin;</script><script src="/menu.js"></script></body>`); }
    const f = path.join(UI, u); if (!f.startsWith(UI) || !fs.existsSync(f)) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8'); res.end(fs.readFileSync(f));
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${srv.address().port}`;
  const glass = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
  let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - UM-02..03 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); }
  if (browser) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
    const out = () => page.evaluate(() => document.getElementById('menu-update-out').textContent);
    const run = async (m) => { mode = m; await page.goto(origin); await page.waitForFunction(() => !!document.getElementById('menu-update-btn'));
      await page.evaluate(() => { NexusMenu.open(); document.getElementById('menu-update-btn').click(); });
      await page.waitForFunction(() => !/checking/.test(document.getElementById('menu-update-out').textContent)); };
    await test('UM-02', '⇪ UPDATE shows what is waiting; Update now, after his yes, applies and says what to restart', async () => {
      await run('behind');
      const t = await out(); assert.ok(/on 0\.60\.346 · GitHub has 0\.60\.352/.test(t) && /31 commits waiting · 3 releases/.test(t) && /Update now → 0\.60\.352/.test(t), t);
      await page.evaluate(() => { window.confirm = () => false; document.getElementById('menu-update-go').click(); });
      assert.strictEqual(applied, 0, 'no yes → nothing applied');
      if (process.env.UM_SHOTS) await page.screenshot({ path: path.join(process.env.UM_SHOTS, 'update-menu.png') });
      await page.evaluate(() => { window.confirm = () => true; document.getElementById('menu-update-go').click(); });
      await page.waitForFunction(() => /updated 0\.60\.346 → 0\.60\.352/.test(document.getElementById('menu-update-out').textContent));
      assert.strictEqual(applied, 1); const a = await out(); assert.ok(/1 local file\(s\) archived/.test(a) && /restart the systems/.test(a), a);
    });
    await test('UM-03', 'up to date, diverged and Idearium down are each said', async () => {
      await run('uptodate'); assert.ok(/up to date/.test(await out()));
      await run('diverged'); assert.ok(/diverged: 1 local commit/.test(await out())); assert.strictEqual(await page.evaluate(() => !!document.getElementById('menu-update-go')), false);
      await run('down'); assert.ok(/idearium did not answer/.test(await out()));
    });
    await browser.close();
  }
  srv.close();
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
