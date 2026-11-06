'use strict';
/**
 * tests/modules/test-cg-element-engine-page-drive.test.js — EE3a: the Element Engine's full page, driven in Clear Glass's engine (AXIOMS §4.1:
 * Clear Glass, never Playwright). James, 2026-11-06: "It needs to have a full page to edit, change and add. Like it needs to be fully featured."
 *
 * The page (renderer/element-engine.html, unchanged) is served by a stand-in for Clear Glass's bridge on :7702 that answers with the real
 * backend (src/element-engine/index.js over an in-memory blocker, his copy in a temp folder, src/eros/options.js over a temp file). The
 * preload is not there, so window.ClearGlass is a stand-in (close, the file picker).
 *
 *   ED-01  it opens on Overview: the counts the blocker holds, Pick an element, the rail with every area in its group
 *   ED-02  Hidden elements: write a rule in the modal → it is a line of his filters and listed under its site; change it; remove it
 *   ED-03  My filters: edit the whole text and Save → his filters are that text; the line count follows
 *   ED-04  Edit TypeScript: open a file of his copy, change it, Save → the file in his folder holds the change; it is marked changed
 *   ED-05  Options: set an ErosmancerOS option from the page → the same store `eros set` uses holds it
 * No engine, or :7702 taken → skipped, said (never a pass).
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..');
const RENDERER = path.join(ROOT, 'clear-glass/renderer');
const E = require(path.join(ROOT, 'clear-glass/src/element-engine/index.js'));
const glass = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));

let passed = 0, failed = 0, skipped = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 5).join('\n    ')}`); failed++; } }

// ── the stand-in bridge: the real backend over an in-memory blocker ──────────────────────────────────────────────────────────────────
const S = { custom: '||ads.example^\nexample.com##.banner\n', enabled: true, allowed: [] };
const svc = {
  state: () => ({ enabled: S.enabled, network: 4321, cosmetic: 210, custom: S.custom, allowed: S.allowed,
    lists: [{ id: 'easylist', title: 'EasyList', about: 'ads', url: 'https://x/easylist.txt', on: true, loaded: true, rules: 4000, updatedAt: Date.now() }] }),
  setCustom(t) { S.custom = String(t); return { ok: true, rules: S.custom.split('\n').filter(l => l.trim()).length, skipped: 0, skippedBy: {} }; },
};
const COPY = fs.mkdtempSync(path.join(os.tmpdir(), 'ee-drive-copy-'));
fs.mkdirSync(path.join(COPY, 'hostile')); const ORIG = 'export const level = 1;\n';
fs.writeFileSync(path.join(COPY, 'hostile', 'index.ts'), ORIG);
fs.writeFileSync(path.join(COPY, '.erosmancer-edit.json'), JSON.stringify({ at: 'now', files: { 'hostile/index.ts': crypto.createHash('sha256').update(ORIG).digest('hex') } }));
const EOPT = require(path.join(ROOT, 'clear-glass/src/eros/options.js')).createOptions({ file: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ee-drive-eros-')), 'options.json'), record: () => {} });
const edit = { MANIFEST: '.erosmancer-edit.json', syntaxErrors: () => [] };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

function route(method, u, b) {
  const p = u.pathname; const q = Object.fromEntries(u.searchParams);
  const his = (fn) => (b.person === true ? fn() : { ok: false, error: 'his' });
  if (p === '/cli/element-engine/overview') return E.overview(svc, { editDir: COPY, edit });
  if (p === '/cli/element-engine/hidden' && method === 'GET') return E.hidden.list(svc);
  if (p === '/cli/element-engine/hidden') return his(() => (b.op === 'edit' ? E.hidden.edit(svc, b) : b.op === 'remove' ? E.hidden.remove(svc, b) : E.hidden.add(svc, b)));
  if (p === '/cli/element-engine/copy') return E.copy.list(COPY, { edit });
  if (p === '/cli/element-engine/copy/file' && method === 'GET') return E.copy.read(COPY, q.file);
  if (p === '/cli/element-engine/copy/file') return his(() => E.copy.write(COPY, b.file, b.text, { edit }));
  if (p === '/cli/adblock/rules') return b.person === true ? svc.setCustom(b.text) : { ok: false, error: 'his' };
  if (p === '/cli/adblock/enabled') { S.enabled = b.on !== false; return { ok: true }; }
  if (p === '/cli/eros/options' && method === 'GET') return { ok: true, ...EOPT.list() };
  if (p === '/cli/eros/options') return b.reset ? EOPT.reset(b.key) : EOPT.set(b.key, b.value, { by: b.by });
  if (p === '/cli/eros/threats') return { ok: true, threats: [] };
  return null;
}
function serve(port) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      let body = ''; req.on('data', (c) => { body += c; });
      req.on('end', () => {
        if (u.pathname.startsWith('/cli/')) {
          let r; try { r = route(req.method, u, body ? JSON.parse(body) : {}); } catch (e) { r = { ok: false, error: e.message }; }
          res.writeHead(r ? 200 : 404, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(r || { ok: false, error: `no route ${u.pathname}` }));
        }
        const f = path.join(RENDERER, decodeURIComponent(u.pathname));
        if (!f.startsWith(RENDERER) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
      });
    });
    srv.once('error', reject); srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}

(async () => {
  console.log('\n⬡  The Element Engine page, driven in Clear Glass (EE3a)\n');
  const eng = glass.engine(); let browser = null, srv = null;
  if (!eng) { console.log('  - ED-01..ED-05 SKIPPED: Clear Glass has no engine here — the page was not driven'); skipped += 5; }
  else {
    try { srv = await serve(7702); } catch (e) { console.log(`  - ED-01..ED-05 SKIPPED: :7702 is taken here (${e.code || e.message}) — the page talks to Clear Glass's bridge on that port`); skipped += 5; }
    if (srv) { try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - ED-01..ED-05 SKIPPED: Clear Glass's engine (${eng.kind}) could not start (${e.message.split('\n')[0]})`); skipped += 5; } }
  }
  if (browser) {
    const pg = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    const errors = []; pg.on('pageerror', (e) => errors.push(String(e && e.message || e)));
    await pg.addInitScript('window.ClearGlass = { window: { closeElementEngine: () => Promise.resolve({ ok: true }) }, plugins: { pick: () => Promise.resolve({ ok: true, canceled: true }) } };');
    const shot = async (name) => { if (process.env.EE_SHOTS) await pg.screenshot({ path: path.join(process.env.EE_SHOTS, `${name}.png`) }); };   // a look for a person, when asked
    const area = async (id, sel) => { await pg.click(`.rail-item[data-id="${id}"]`); await pg.waitForSelector(sel, { timeout: 8000 }); };
    const text = (sel) => pg.evaluate((s) => (document.querySelector(s) || {}).textContent || '', sel);
    const until = (fn, what) => pg.waitForFunction(fn, null, { timeout: 8000 }).catch(() => { throw new Error(`timed out: ${what}`); });

    await test('ED-01', 'it opens on Overview with the blocker\'s counts; every area is on the rail', async () => {
      await pg.goto('http://127.0.0.1:7702/element-engine.html');
      await pg.waitForSelector('.ee-stat', { timeout: 10000 });
      const main = await text('#main');
      assert.match(main, /4,321/); assert.match(main, /blocking rules/); assert.match(main, /Pick an element/);
      const rail = await pg.evaluate(() => [...document.querySelectorAll('.rail-group')].map(g => [g.querySelector('h3').textContent, [...g.querySelectorAll('.rail-item')].map(b => b.dataset.id)]));
      await shot('overview');
      assert.deepStrictEqual(rail, [['Ad blocking', ['overview', 'lists', 'filters', 'allowed']], ['Elements', ['hidden']], ['ErosmancerOS', ['eros-options', 'threats', 'typescript', 'eros']]]);
    });

    await test('ED-02', 'Hidden elements: write a rule, change it, remove it — each a line of his filters', async () => {
      await area('hidden', '.ee-site');
      assert.match(await text('#main'), /example\.com/);
      await pg.click('button:has-text("Write a rule")'); await pg.waitForSelector('.modal', { timeout: 5000 });
      await pg.fill('.modal input[type=text]:not(.mono)', 'fiverr.com'); await pg.fill('.modal input.mono', '.promo-bar');
      await pg.click('.modal button.primary');
      await until(() => [...document.querySelectorAll('.ee-site')].some(e => e.textContent === 'fiverr.com'), 'fiverr.com listed');
      await shot('hidden');
      assert.ok(S.custom.split('\n').includes('fiverr.com##.promo-bar'), S.custom);
      await pg.evaluate(() => { const r = [...document.querySelectorAll('.row')].find(x => x.querySelector('.t').textContent === '.promo-bar'); [...r.querySelectorAll('button')].find(b => b.textContent === 'Change').click(); });
      await pg.waitForSelector('.modal', { timeout: 5000 }); await pg.fill('.modal input.mono', '.promo-top'); await pg.click('.modal button.primary');
      await until(() => [...document.querySelectorAll('.row .t')].some(e => e.textContent === '.promo-top'), 'changed rule listed');
      assert.ok(S.custom.includes('fiverr.com##.promo-top') && !S.custom.includes('.promo-bar'), S.custom);
      await pg.evaluate(() => { const r = [...document.querySelectorAll('.row')].find(x => x.querySelector('.t').textContent === '.promo-top'); [...r.querySelectorAll('button')].find(b => b.textContent === 'Remove').click(); });
      await pg.waitForSelector('.modal', { timeout: 5000 }); await pg.click('.modal button.danger');
      await until(() => ![...document.querySelectorAll('.row .t')].some(e => e.textContent === '.promo-top'), 'rule gone');
      assert.ok(!S.custom.includes('fiverr.com##'), S.custom); assert.ok(S.custom.startsWith('||ads.example^'), 'his other lines untouched');
    });

    await test('ED-03', 'My filters: the whole text edited and saved', async () => {
      await area('filters', 'textarea.ee-big');
      await pg.fill('textarea.ee-big', '||ads.example^\n||tracker.example^\nexample.com##.banner\n');
      assert.match(await text('.ee-meta'), /3 rule line\(s\) · not saved/);
      await pg.click('button.primary:has-text("Save")');
      await until(() => /3 rule line\(s\)$/.test((document.querySelector('.ee-meta') || {}).textContent || ''), 'saved');
      assert.strictEqual(S.custom, '||ads.example^\n||tracker.example^\nexample.com##.banner\n');
    });

    await test('ED-04', 'Edit TypeScript: open a file of his copy, change it, save it — the file in his folder holds it', async () => {
      await area('typescript', '.ee-files');
      await pg.click('.ee-files button:has-text("Edit")'); await pg.waitForSelector('textarea.ee-big', { timeout: 8000 });
      assert.strictEqual(await pg.evaluate(() => document.querySelector('textarea.ee-big').value), ORIG);
      await shot('typescript');
      await pg.fill('textarea.ee-big', 'export const level = 2;\n');
      await pg.click('button.primary:has-text("Save")');
      await until(() => /saved in your copy/.test((document.querySelector('.ee-meta') || {}).textContent || ''), 'saved');
      assert.strictEqual(fs.readFileSync(path.join(COPY, 'hostile', 'index.ts'), 'utf8'), 'export const level = 2;\n');
      await until(() => [...document.querySelectorAll('.ee-files .chip')].some(c => c.textContent === 'changed'), 'marked changed');
    });

    await test('ED-05', 'Options: an ErosmancerOS option set from the page lands in the store eros set uses', async () => {
      await area('eros-options', '.row select');
      await pg.evaluate(() => { const r = [...document.querySelectorAll('.row')].find(x => /^Pace/.test(x.querySelector('.t').textContent)); const s = r.querySelector('select'); s.value = 'cautious'; [...r.querySelectorAll('button')].find(b => b.textContent === 'Set').click(); });
      await until(() => [...document.querySelectorAll('.row')].some(x => /^Pace/.test(x.querySelector('.t').textContent) && x.querySelector('select').value === 'cautious'), 'read back');
      assert.strictEqual(EOPT.get('pace').value, 'cautious');
      assert.deepStrictEqual(errors, [], `no page errors: ${errors.join(' | ')}`);
    });
    await browser.close();
  }
  if (srv) srv.close();
  console.log(`\n  ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`);
  process.exit(failed ? 1 : 0);
})();
