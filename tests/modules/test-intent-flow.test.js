'use strict';
/**
 * tests/modules/test-intent-flow.test.js — type what you want, and Idearium carries it (FA8–FA10, 0.60.286)
 * James, 2026-10-29: "yes, and can you do what you can to get idearium to work dynamically? like type in the cli, determine context needed,
 * build dag. search the project for context, ask user about any gaps, then contract, etc"
 *
 *   IF-01  the stages in his order; the intent's words find the component; the DAG puts what it uses first and who uses it after
 *   IF-02  gaps: an unknown word, no test, no done-when (blocking: no contract); answered → a RAID v2 contract that RAID's validate accepts,
 *          its build gates in DAG order; two tied parts ask which
 *   IF-03  the route over a real imported repo: stages, the contract written at contracts/<id>.contract on write:true (RAID loads it);
 *          the repo do command row (answers from --answer, the follow that asks)
 *   IF-04  the Do box in Clear Glass: typed → the DAG and a gap's dropdown; answered → Write the contract → written
 */
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const _data = fs.mkdtempSync(path.join(os.tmpdir(), 'if-'));
const _jaa = fs.mkdtempSync(path.join(os.tmpdir(), 'if-jaa-'));
process.env.IDEARIUM_DATA_DIR = _data;
process.env.JAA_DATA_DIR = _jaa;
process.env.NEXUS_EVIDENCE = 'off';
process.on('exit', () => { for (const d of [_data, _jaa]) try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
const assert = require('assert');
const ROOT = path.join(__dirname, '..', '..');
const quiet = async (f) => { const l = console.log, w = console.warn, e = console.error; console.log = console.warn = console.error = () => {}; try { return await f(); } finally { console.log = l; console.warn = w; console.error = e; } };

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 6).join('\n    ')}`); failed++; } }

const FILES = {
  'shop/pricing.js': "const { money } = require('./money');\nfunction priceOf(pkg) { return money(pkg.price); }\nmodule.exports = { priceOf };\n",
  'shop/money.js': "function money(n) { return '$' + Number(n).toFixed(2); }\nmodule.exports = { money };\n",
  'shop/cart.js': "const { priceOf } = require('./pricing');\nfunction total(items) { return items.map(priceOf); }\nmodule.exports = { total };\n",
  'ui/menu.js': "// the menu\nmodule.exports = { open() {} };\n",
  'README.md': '# Shop\n\nPrices are in `shop/pricing.js`.\n',
};
const files = () => Object.entries(FILES).map(([p, c]) => ({ path: p, content: c }));

(async () => {
  console.log('\n⬡  Type what you want: intent → context → DAG → found → gaps → contract\n');
  const F = require(path.join(ROOT, 'lib/intent-flow.js'));
  const CG = require(path.join(ROOT, 'cortex/core/raid/contract-gates.js'));

  await test('IF-01', 'the stages in his order; the words find the component; the DAG: what it uses first, who uses it after', async () => {
    const r = F.run({ text: 'add a discount to the pricing so the cart total shows it', files: files(), project: 'shop' });
    assert.deepStrictEqual(r.stages.map(s => s.id), F.STAGES);
    assert.strictEqual(r.intent.verb, 'add');
    assert.ok(r.needed.chosen.includes('shop/pricing.js'), JSON.stringify(r.needed));
    const o = r.dag.order;
    assert.ok(o.indexOf('shop/money.js') < o.indexOf('shop/pricing.js'), `money (used) before pricing: ${o.join(' → ')}`);
    const roles = Object.fromEntries(r.dag.nodes.map(n => [n.path, n.role]));
    assert.strictEqual(roles['shop/money.js'], 'uses');
    assert.ok(r.found.find(f => f.path === 'shop/pricing.js').lines.some(l => /price/i.test(l.text)), 'the lines that hold its words');
  });

  await test('IF-02', 'gaps asked; blocking ones hold the contract; answered → a RAID v2 contract RAID validates, gates in DAG order', async () => {
    const r = F.run({ text: 'add a discount to the pricing', files: files(), project: 'shop' });
    const ids = r.gaps.map(g => g.id);
    assert.ok(ids.includes('unknown-words') && ids.includes('test') && ids.includes('done-when'), ids.join(','));
    assert.deepStrictEqual([r.contract, r.blockedBy], [null, ['done-when']]);
    const a = F.run({ text: 'add a discount to the pricing', files: files(), project: 'shop', answers: { 'done-when': 'priceOf returns the discounted price' } });
    assert.ok(a.contract, a.stages.at(-1).say);
    assert.deepStrictEqual(CG.validate(a.contract), [], 'RAID accepts it');
    const g = a.contract.gates; const build = (p) => g.find(x => x.actions && x.actions[0].path === p);
    assert.ok(build('shop/pricing.js').depends_on.includes(build('shop/money.js').id), 'pricing waits for money');
    assert.strictEqual(g.at(-1).id, 'verify'); assert.strictEqual(g.at(-1).done_when, 'priceOf returns the discounted price');
    assert.ok(a.contract.gaps.find(x => x.id === 'done-when').answer);
    const tie = F.run({ text: 'open it', files: [{ path: 'a/open.js', content: 'module.exports = 1' }, { path: 'b/open.js', content: 'module.exports = 2' }], project: 'p', answers: { 'done-when': 'x' } });
    assert.ok(tie.gaps.find(x => x.id === 'where' && x.blocking && x.options.length === 2), JSON.stringify(tie.gaps));
    const picked = F.run({ text: 'open it', files: [{ path: 'a/open.js', content: 'module.exports = 1' }, { path: 'b/open.js', content: 'module.exports = 2' }], project: 'p', answers: { 'done-when': 'x', where: 'b/open.js' } });
    assert.deepStrictEqual(picked.needed.chosen, ['b/open.js']); assert.ok(picked.contract);
    assert.match(F.run({ text: '  ' }).error, /say what you want/);
  });

  let api = null, uuid = null;
  await test('IF-03', 'the route over an imported repo writes the contract RAID loads; the repo do row and its follow', async () => {
    api = await import(pathToFileURL(path.join(ROOT, 'idearium/api/index.js')).href);
    await import(pathToFileURL(path.join(ROOT, 'idearium/spec-engine/index.js')).href);
    const Zip = require(path.join(ROOT, 'lib/zip.js')); const z = new Zip(); for (const [p, c] of Object.entries(FILES)) z.addFile(`shop-proj/${p}`, Buffer.from(c));
    let made = null;
    for (let i = 0; i < 40; i++) { made = await quiet(() => api._route('POST', '/api/repos/import', { name: 'if-shop', filename: 'shop.zip', contentBase64: z.toBuffer().toString('base64') })); if (made.json && made.json.repo) break; await new Promise(r => setTimeout(r, 100)); }
    uuid = made.json.repo.uuid;
    const first = (await quiet(() => api._route('POST', `/api/repos/${uuid}/intent`, { text: 'add a discount to the pricing' }))).json;
    assert.deepStrictEqual([first.contract, first.blockedBy, first.written], [null, ['done-when'], null]);
    const w = await quiet(() => api._route('POST', `/api/repos/${uuid}/intent`, { text: 'add a discount to the pricing', answers: { 'done-when': 'the cart total is discounted' }, write: true }));
    assert.strictEqual(w.status, 200, JSON.stringify(w.json).slice(0, 300));
    assert.deepStrictEqual(w.json.problems, []); assert.match(w.json.written, /^contracts\/if-shop\.add-.*\.contract$/);
    const text = api.getRepoLayer().readTextFile(uuid, w.json.written).content;
    const tmp = path.join(_data, 'c.contract'); fs.writeFileSync(tmp, text);
    const L = CG.load(tmp); assert.strictEqual(L.v, 2); assert.deepStrictEqual(CG.validate(L.payload), []);
    const { SPEC } = await import(pathToFileURL(path.join(ROOT, 'idearium/cli/route-commands.js')).href);
    const row = SPEC.find(x => x.key === 'repo.do');
    assert.deepStrictEqual(row.req({ repo: { uuid: 'u' }, args: ['add', 'x'], flags: { answer: ['done-when=it shows', 'where=a.js'], write: true } }).body, { text: 'add x', answers: { 'done-when': 'it shows', where: 'a.js' }, write: true });
    const said = []; const log = console.log; console.log = (m) => said.push(String(m));
    try { assert.strictEqual(await row.follow({ gaps: [{ id: 'done-when', blocking: true, question: 'q', options: ['a'] }] }, { repo: { uuid: 'u' }, args: ['x'], flags: {} }, { c: new Proxy({}, { get: () => (s) => s }) }), null, 'no terminal: said, not asked'); }
    finally { console.log = log; }
    assert.ok(said.some(s => /--answer done-when=/.test(s)));
  });

  await test('IF-04', 'the Do box in Clear Glass: typed → the DAG and a gap\'s dropdown; answered → Write the contract → written', async () => {
    const glass = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
    if (!glass.engine()) { console.log('  - IF-04 SKIPPED: Clear Glass has no engine here'); return; }
    assert.ok(uuid, 'IF-03 made the repo');
    const http = require('http'); const UI = path.join(ROOT, 'idearium/ui');
    const HTML = `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="box"></div>
      <script>async function api(p,o={},t){const r=await fetch(p,{headers:{'Content-Type':'application/json'},...o});const d=await r.json();if(!r.ok||d.ok===false){throw new Error(d.error||'failed')}return d}</script>
      <script src="/js/repo-intent.js"></script><script>renderIntent(document.getElementById('box'),{uuid:'${uuid}'})</script></body></html>`;
    const srv = http.createServer(async (req, res) => {
      const u = new URL(req.url, 'http://x');
      if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(HTML); }
      if (u.pathname.startsWith('/api/')) { let raw = ''; for await (const c of req) raw += c; const r = await quiet(() => api._route(req.method, u.pathname, raw ? JSON.parse(raw) : undefined)); res.writeHead(r.status, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(r.json)); }
      const f = path.join(UI, path.normalize(u.pathname).replace(/^[/\\]+/, '')); if (!f.startsWith(UI) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' }); fs.createReadStream(f).pipe(res);
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    let browser;
    try {
      browser = await glass.chromium.launch();
      const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${srv.address().port}/`);
      await page.waitForSelector('#fi-text');
      await page.evaluate(() => { document.getElementById('fi-text').value = 'add a discount to the pricing'; });
      await page.click('[data-fi="go"]');
      await page.waitForSelector('[data-gap="done-when"]', { timeout: 60000 });
      const dag = await page.textContent('#fi-out');
      assert.ok(/shop\/money\.js/.test(dag) && /waiting on: done-when/.test(dag), dag.slice(0, 400));
      await page.evaluate(() => { const s = document.querySelector('[data-gap="done-when"]'); s.value = 'the tests pass'; });
      await page.click('[data-fi="answer"]');
      await page.waitForSelector('[data-fi="write"]', { timeout: 60000 });
      await page.click('[data-fi="write"]');
      await page.waitForFunction(() => /wrote contracts\//.test(document.getElementById('fi-out').textContent), null, { timeout: 60000 });
      if (process.env.IF_SHOT) await page.screenshot({ path: process.env.IF_SHOT, fullPage: true });
      assert.deepStrictEqual(errors, []);
    } finally { try { if (browser) await browser.close(); } catch (_) {} srv.close(); }
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exitCode = failed ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 200).unref();
})();
