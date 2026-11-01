'use strict';
// run-all: timeout 120000
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-update-popup.test.js — UP9, 0.60.349. Map: docs/2026-10-25-nexus-update-phasemap.spec UP9.
 * James, 2026-11-01: "can you have it have a popup when it has an update availanel" (his screen: COS's UI unreachable because his folder was a
 * release behind and the automatic check had failed without a word).
 *   UP-01  notice() reads the last automatic check: available, waiting, blocked, refused, error and updated are shown; up-to-date and off are not
 *   UP-02  COS's door answers GET /api/cos/update/notice (in its contract); the orchestrator's /api/update/notice is the same notice (source read)
 *   UP-03  the popup in Clear Glass: shown with the title and both versions; Later hides it and it stays hidden on the next poll; a newer
 *          version shows again; show:false shows nothing; a failed check says "Check again"
 */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..', '..');
const U = require(path.join(ROOT, 'lib/nexus-update.js'));
if (!process.env.GLASS_CHROMIUM) { const c = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'; if (fs.existsSync(c) && !fs.existsSync(path.join(ROOT, 'node_modules/electron'))) process.env.GLASS_CHROMIUM = c; }
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 4).join('\n    ')}`); failed++; } }
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'upd-notice-'));
fs.writeFileSync(path.join(root, 'VERSION'), '0.60.346\n');
const plant = (x) => { fs.mkdirSync(path.join(root, 'data', 'update'), { recursive: true }); fs.writeFileSync(path.join(root, 'data', 'update', 'auto.json'), JSON.stringify({ at: '2026-11-01T18:10:00.000Z', policy: 'auto', ...x })); };

(async () => {
  console.log('\n⬡  The update popup (UP9)\n');
  await test('UP-01', 'notice() — what is shown and what is not', () => {
    assert.strictEqual(U.notice({ root }).show, false, 'no check yet');
    const cases = [[{ action: 'available', current: '0.60.346', latest: '0.60.348' }, true, 'available', /0\.60\.348 is available/],
      [{ action: 'waiting', latest: '0.60.348', why: ['a build is running'] }, true, 'available', /is ready/],
      [{ action: 'blocked', latest: '0.60.348', why: 'diverged: 1 local commit(s) not on GitHub' }, true, 'blocked', /cannot update itself/],
      [{ action: 'refused', latest: '0.60.348', error: 'x' }, true, 'blocked', /refused/],
      [{ action: 'error', error: 'write ECONNABORTED' }, true, 'error', /could not check/],
      [{ action: 'updated', to: '0.60.348', waitForHim: ['clear-glass'] }, true, 'updated', /updated to 0\.60\.348/],
      [{ action: 'updated', to: '0.60.348', waitForHim: [] }, false, 'updated', null],
      [{ action: 'up-to-date', current: '0.60.348' }, false, 'up-to-date', null], [{ action: 'off' }, false, 'off', null]];
    for (const [x, show, kind, title] of cases) { plant(x); const n = U.notice({ root }); assert.strictEqual(n.show, show, x.action); assert.strictEqual(n.kind, kind, x.action); if (title) assert.match(n.title, title); }
    plant({ action: 'error', error: 'write ECONNABORTED' }); assert.match(U.notice({ root }).text, /ECONNABORTED/);
    assert.strictEqual(U.notice({ root }).current, '0.60.346', 'the running version from VERSION');
  });
  await test('UP-02', 'COS\'s door and the orchestrator answer the same notice', async () => {
    plant({ action: 'available', current: '0.60.346', latest: '0.60.348' });
    const sup = { on() {}, setHooks() {}, list: () => [], ledgerFile: path.join(root, 'cos', 'ledger.jsonl'), declarations: () => [] };
    const srv = await require(path.join(ROOT, 'cos/manager/server.js')).listen(sup, 0, { root });
    try {
      const body = await new Promise(r => http.get({ host: '127.0.0.1', port: srv.address().port, path: '/api/cos/update/notice' }, (x) => { let t = ''; x.on('data', c => t += c); x.on('end', () => r(JSON.parse(t))); }));
      assert.ok(body.ok && body.show && body.latest === '0.60.348' && /update\.html$/.test(body.updatesPage), JSON.stringify(body));
    } finally { srv.close(); }
    const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'cos/manager/contract.json'), 'utf8'));
    assert.ok(c.routes.some(r => r.path === '/api/cos/update/notice') && c.pages.find(p => p.id === 'shell').routes.includes('GET /api/cos/update/notice'));
    const o = fs.readFileSync(path.join(ROOT, 'orchestrator/orchestrator.js'), 'utf8'); assert.ok(/sub === 'update' && seg\[2\] === 'notice'/.test(o) && /nexus-update\.js'\)\.notice/.test(o));
  });

  let N = { ok: true, show: true, kind: 'available', title: 'Nexus 0.60.348 is available', text: 'You have 0.60.346.', current: '0.60.346', latest: '0.60.348', at: '2026-11-01T18:10:00.000Z', updatesPage: 'http://127.0.0.1:4800/update.html' };
  const PAGE = `<!doctype html><html><head><meta charset="utf-8"></head><body><h1>a page</h1><script src="/update-popup.js" data-api="/notice"></script></body></html>`;
  const srv = http.createServer((req, res) => { const u = req.url.split('?')[0];
    if (u === '/notice') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(N)); }
    if (u === '/update-popup.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end(fs.readFileSync(path.join(ROOT, 'lib/ui/update-popup/update-popup.js'))); }
    res.setHeader('Content-Type', 'text/html'); res.end(PAGE); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const glass = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
  let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - UP-03 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); }
  if (browser) {
    await test('UP-03', 'the popup: shown, Later holds, a newer one shows, nothing when current, Check again on a failed check', async () => {
      const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
      await page.goto(`http://127.0.0.1:${srv.address().port}/`);
      await page.waitForSelector('.nx-upd');
      const t = await page.evaluate(() => document.querySelector('.nx-upd').textContent);
      assert.ok(/Update available/.test(t) && /Nexus 0\.60\.348 is available/.test(t) && /you have 0\.60\.346/.test(t) && /GitHub has 0\.60\.348/.test(t) && /Open updates/.test(t), t);
      if (process.env.UP_SHOTS) await page.screenshot({ path: path.join(process.env.UP_SHOTS, 'update-popup.png') });
      await page.evaluate(() => document.querySelector('.nx-upd [data-a="later"]').click());
      assert.strictEqual(await page.evaluate(() => !!document.querySelector('.nx-upd')), false);
      await page.evaluate(() => NexusUpdatePopup.poll()); await new Promise(r => setTimeout(r, 200));
      assert.strictEqual(await page.evaluate(() => !!document.querySelector('.nx-upd')), false, 'Later holds for that version');
      N = { ...N, title: 'Nexus 0.60.349 is available', latest: '0.60.349' };
      await page.evaluate(() => NexusUpdatePopup.poll()); await page.waitForSelector('.nx-upd');
      assert.match(await page.evaluate(() => document.querySelector('.nx-upd h3').textContent), /0\.60\.349/);
      N = { ...N, show: false }; await page.evaluate(() => NexusUpdatePopup.poll()); await new Promise(r => setTimeout(r, 200));
      assert.strictEqual(await page.evaluate(() => !!document.querySelector('.nx-upd')), false, 'nothing when current');
      N = { ok: true, show: true, kind: 'error', title: 'Nexus could not check for updates', text: 'write ECONNABORTED', current: '0.60.346', at: N.at };
      await page.evaluate(() => NexusUpdatePopup.poll()); await page.waitForSelector('.nx-upd');
      const e = await page.evaluate(() => document.querySelector('.nx-upd').textContent); assert.ok(/Update check failed/.test(e) && /ECONNABORTED/.test(e) && /Check again/.test(e), e);
    });
    await browser.close();
  }
  srv.close(); fs.rmSync(root, { recursive: true, force: true });
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
