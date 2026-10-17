'use strict';
/**
 * tests/modules/test-ui-editor.test.js — UE0 + UE1 (0.60.122): the UI editor. Map: docs/2026-10-10-design-surface-phasemap.spec.
 * James, 2026-10-17: "the ui editor is for editing uis, whether its electron, html, etc. ... we need a full editor ... like
 * full enterprise grade" · "always make effective use of what you already have."
 *   UE-01..05  the round trip (js/ui-editor-doc.js): outside the body kept byte for byte, the editor's CSS in one marked
 *              block that a second save replaces, local stylesheets found and resolved, a scripted page recognised
 *   UE-10..13  the page, driven in Clear Glass (the REAL ui-editor.html, the vendored GrapesJS, against a stub of the repo's
 *              file routes): opens a repo page with its stylesheet; an element restyled and a block added; Save writes the
 *              page back with its head kept and the stylesheet untouched; a page that builds markup from script cannot be saved
 * No engine on the machine: the browser part is SKIPPED, said, never passed.
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert'), fs = require('fs'), path = require('path'), http = require('http'), vm = require('vm');
const ROOT = path.join(__dirname, '../..'), UI = path.join(ROOT, 'idearium', 'ui');
let passed = 0, failed = 0, skipped = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${String(e.stack || e.message).split('\n').slice(0, 4).join('\n    ')}`); failed++; } }
const ctx = { module: { exports: {} } }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(UI, 'js', 'ui-editor-doc.js'), 'utf8'), ctx);
const D = ctx.module.exports;
const PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Site</title>
  <link rel="stylesheet" href="style.css">
  <link rel="stylesheet" href="https://cdn.example.com/x.css">
</head>
<body class="home">
  <h1 id="title">Hello</h1>
  <p class="lead">A page.</p>
</body>
</html>
`;

(async () => {
  await test('UE-01', 'split: the body, the local stylesheets only, nothing scripted', async () => {
    const d = D.split(PAGE);
    assert.ok(/<h1 id="title">Hello<\/h1>/.test(d.body) && d.bodyAttrs.trim() === 'class="home"');
    assert.deepStrictEqual([...d.links], ['style.css']);
    assert.strictEqual(d.scripted, false);
  });
  await test('UE-02', 'merge: everything outside the body byte for byte; the editor CSS in one marked block in the head', async () => {
    const out = D.merge(PAGE, { body: '\n  <h1 id="title">Hi</h1>\n', css: '#title{color:red;}' });
    assert.ok(out.startsWith(PAGE.slice(0, PAGE.indexOf('</head>'))), 'the head up to its end is unchanged');
    assert.ok(/<style data-nexus-ui-editor>\n#title\{color:red;\}\n<\/style>\n<\/head>/.test(out));
    assert.ok(out.endsWith('</body>\n</html>\n') && /<body class="home">\n  <h1 id="title">Hi<\/h1>\n<\/body>/.test(out));
  });
  await test('UE-03', 'a second save replaces its own block, never stacks a second one', async () => {
    const once = D.merge(PAGE, { body: 'a', css: 'p{color:red}' });
    const twice = D.merge(once, { body: 'b', css: 'p{color:blue}' });
    assert.strictEqual((twice.match(/data-nexus-ui-editor/g) || []).length, 1);
    assert.ok(/p\{color:blue\}/.test(twice) && !/color:red/.test(twice));
    assert.deepStrictEqual(JSON.parse(JSON.stringify(D.split(twice).styles.filter(s => s.ours).map(s => s.css.trim()))), ['p{color:blue}']);   // (vm realm → plain JSON)
  });
  await test('UE-04', 'resolve: a stylesheet relative to the page; out of the repo or remote → null', async () => {
    assert.strictEqual(D.resolve('site/index.html', 'css/a.css'), 'site/css/a.css');
    assert.strictEqual(D.resolve('site/pages/x.html', '../style.css?v=2'), 'site/style.css');
    assert.strictEqual(D.resolve('index.html', '../../etc/passwd'), null);
    assert.strictEqual(D.resolve('index.html', 'https://x/y.css'), null);
  });
  await test('UE-05', 'a page that builds its markup from script is recognised (saving over it would erase what it makes)', async () => {
    assert.strictEqual(D.split('<body><div id="app"></div><script>document.getElementById("app").innerHTML = "<p>x</p>";</script></body>').scripted, true);
    assert.strictEqual(D.split('<body><div id="app"></div><script src="app.js"></script></body>').scripted, true);
  });

  // ── the page, in Clear Glass ──
  const FILES = { 'site/index.html': PAGE, 'site/style.css': 'h1{font-family:serif}\n.lead{color:#555}\n',
    'site/app.html': '<!doctype html><html><head></head><body><div id="app"></div><script>document.getElementById("app").innerHTML = "<p>x</p>";</script></body></html>' };
  const WRITES = [];
  const srv = http.createServer((q, s) => {
    const u = new URL(q.url, 'http://x');
    if (u.pathname === '/api/repos/r1/file' && q.method === 'GET') { const p = u.searchParams.get('path'); s.setHeader('content-type', 'application/json'); return s.end(JSON.stringify(FILES[p] != null ? { ok: true, path: p, content: FILES[p] } : { ok: false, error: `not found in repo: ${p}` })); }
    if (u.pathname === '/api/repos/r1/file' && q.method === 'POST') { let b = ''; q.on('data', d => b += d); q.on('end', () => { const j = JSON.parse(b); WRITES.push(j); FILES[j.path] = j.content; s.setHeader('content-type', 'application/json'); s.end(JSON.stringify({ ok: true, path: j.path })); }); return; }
    const f = path.normalize(path.join(UI, u.pathname));
    if (!f.startsWith(UI) || !fs.existsSync(f)) { s.statusCode = 404; return s.end('nf'); }
    s.setHeader('content-type', f.endsWith('.js') ? 'application/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html');
    s.end(fs.readFileSync(f));
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const glass = require('../../clear-glass/src/driver/glass.js');
  const eng = glass.engine();
  if (!eng) { console.log('  - UE-10…UE-13 SKIPPED: Clear Glass has no engine here'); skipped += 4; srv.close(); return done(); }
  let browser;
  try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - UE-10…UE-13 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); skipped += 4; srv.close(); return done(); }
  console.log(`  · driven by Clear Glass (clear-glass/src/driver/glass.js), engine: ${eng.kind}`);
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/ui-editor.html?repo=r1&path=site/index.html`);
    await page.waitForFunction(() => window.UE && UE.editor && UE.editor.getWrapper().find('h1').length === 1, { timeout: 30000 });
    await test('UE-10', 'opens a repo page in the full editor, its stylesheet loaded as it is', async () => {
      assert.ok(/1 stylesheet\(s\) loaded/.test(await page.textContent('#ue-state')), await page.textContent('#ue-state'));
      assert.ok(await page.$('.gjs-pn-panels, .gjs-pn-panel'), 'the editor\'s panels are drawn');
      assert.strictEqual(await page.evaluate(() => UE.editor.getWrapper().find('p.lead').length), 1);
      assert.ok(await page.evaluate(() => UE.sheets.some(s => s.path === 'site/style.css' && s.url)));
    });
    await test('UE-11', 'an element restyled and a block added; undo works', async () => {
      await page.evaluate(() => { const h = UE.editor.getWrapper().find('h1')[0]; UE.editor.select(h); UE.editor.getSelected().addStyle({ color: 'rgb(200, 0, 0)' }); UE.editor.addComponents('<button type="button">Go</button>'); });
      assert.strictEqual(await page.evaluate(() => UE.editor.getWrapper().find('button').length), 1);
      assert.strictEqual(await page.evaluate(() => document.getElementById('ue-save').disabled), false, 'save is enabled once something changed');
    });
    await test('UE-12', 'save writes the page back through the file route: head kept, edits in the marked block, the stylesheet untouched', async () => {
      await page.click('#ue-save');
      await page.waitForFunction(() => /saved site\/index\.html/.test(document.getElementById('ue-state').textContent), { timeout: 15000 });
      assert.strictEqual(WRITES.length, 1); assert.strictEqual(WRITES[0].path, 'site/index.html');
      const out = WRITES[0].content;
      assert.ok(out.includes('<link rel="stylesheet" href="style.css">') && out.includes('<title>Site</title>') && out.includes('<body class="home">'), out.slice(0, 400));
      assert.ok(/<style data-nexus-ui-editor>[\s\S]*color:\s*rgb\(200, 0, 0\)[\s\S]*<\/style>/.test(out), 'the restyle is in the marked block');
      assert.ok(/<button type="button">Go<\/button>/.test(out) && /<p class="lead">A page\.<\/p>/.test(out));
      assert.ok(!WRITES.some(w => w.path === 'site/style.css'), 'the page\'s own stylesheet is never rewritten');
    });
    await test('UE-13', 'a page that builds its markup from script opens, but cannot be saved over (said)', async () => {
      await page.evaluate(() => { UE.dirty = false; });   // saved: nothing to ask about before it unloads
      const p2 = page;
      await p2.goto(`${base}/ui-editor.html?repo=r1&path=site/app.html`);
      try { await p2.waitForFunction(() => !!(window.UE && UE.editor), { timeout: 30000 }); } catch (e) { throw new Error(`the editor did not open: ${JSON.stringify(await p2.evaluate(() => ({ url: location.href, ue: !!window.UE, st: (document.getElementById("ue-state") || {}).textContent })))}`); }
      await p2.evaluate(() => { UE.editor.addComponents('<p>x</p>'); });
      assert.strictEqual(await p2.evaluate(() => document.getElementById('ue-save').disabled), true);
      assert.ok(/builds markup from script: saving is off/.test(await p2.textContent('#ue-state')));
      assert.deepStrictEqual(errors, []);
    });
  } finally { await browser.close(); srv.close(); }
  done();
})();
function done() { console.log(`\n  ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`); process.exit(failed ? 1 : 0); }
