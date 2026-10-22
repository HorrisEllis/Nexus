'use strict';
/**
 * tests/modules/test-data-home.test.js — one resolver for every system's data, and each system bringing its own data home (DL2)
 * Map: docs/2026-10-21-data-layout-phasemap.spec DL2_one_resolver · Spec: docs/data-layout.spec MOD-DATA-HOME
 * James, 2026-10-22: "start the data migration. look at the phases, any migrating data to the respective systems, and make each
 * system responsible for it's own data."
 *
 *   DH-01  every kind resolves under its system (the sandbox in a test), never under the root data/; an unknown system names the known
 *   DH-02  bringHome in a scratch tree under the real ownership table: its files move (manifest, hashes), a path code still names
 *          waits, his call is never moved, the record is written, rollback restores byte for byte
 *   DH-03  a test process does not move the real tree; a system with nothing in the root data/ reads no census
 *   DH-05  the route (list, one system's plan, bring, rollback) and the `data home` / `data rollback` rows
 *   DH-06  the Data screen (Settings console → Data), driven in Clear Glass
 *   DH-04  a boot with the same release and the same waiting paths reads no census (his machine runs 14 of these at boot)
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const DH = require(path.join(ROOT, 'lib/data-home.js'));
const C = require(path.join(ROOT, 'lib/data-clearup.js'));

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}
const put = (root, rel, text) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return f; };

console.log('\n⬡  data-home — every system\'s data in its own folder\n');

test('DH-01', 'home, ledger, nodes, memory resolve under the system (sandboxed here); never the root data/; unknown named', () => {
  const sb = process.env.NEXUS_TEST_SANDBOX;
  assert.ok(sb, 'the sandbox is set');
  assert.strictEqual(DH.home('guardian', 'store', 'jobs.json'), path.join(sb, 'systems', 'guardian', 'store', 'jobs.json'));
  assert.strictEqual(DH.nodes('cortex', 'failure_mode'), path.join(sb, 'systems', 'cortex', 'nodes', 'failure_mode'));
  assert.strictEqual(DH.memory('vector-index'), path.join(sb, 'systems', 'cortex', 'memory', 'vector-index'));
  assert.match(DH.ledger('loom', new Date(2026, 9, 22, 9, 5, 7).getTime()), /systems[\\/]loom[\\/]event_ledgers[\\/]2026-10-22_09-05-07\.ledger$/);
  assert.strictEqual(DH.folder('ollama-bridge'), 'ollama', 'a registry name maps to its folder');
  for (const s of DH.SYSTEMS()) assert.ok(!DH.dir(s).startsWith(path.join(ROOT, 'data')), `${s} never under the root data/`);
  assert.throws(() => DH.home('nosuch', 'store'), /unknown system "nosuch" — known: .*guardian/);
});

test('DH-02', 'bringHome in a scratch tree: owned files move, a named path waits, his call stays, record written, rollback restores', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-'));
  fs.mkdirSync(path.join(root, 'docs'));
  fs.copyFileSync(path.join(ROOT, 'docs/data-layout.spec'), path.join(root, 'docs/data-layout.spec'));
  for (const s of ['versionium', 'guardian', 'idearium']) fs.mkdirSync(path.join(root, s), { recursive: true });
  put(root, 'data/versionium/index.json', '{"snapshots":3}\n');
  put(root, 'data/versionium/deep/a.nex', 'NEX1');
  put(root, 'data/guardian/jobs.json', '[]\n');
  put(root, 'guardian/config.js', "const D = path.join(ROOT, 'data', 'guardian');\n");   // code still names data/guardian
  put(root, 'data/run-state/x.run', 'run');                                               // his call (ask), owner idearium
  const v = DH.bringHome('versionium', { root, force: true, fresh: true });
  assert.strictEqual(v.moved, 2, JSON.stringify(v));
  assert.strictEqual(fs.readFileSync(path.join(root, 'versionium/data/index.json'), 'utf8'), '{"snapshots":3}\n');
  assert.ok(fs.existsSync(path.join(root, 'versionium/data/deep/a.nex')) && !fs.existsSync(path.join(root, 'data/versionium')), 'moved, the emptied folder pruned');
  assert.ok(fs.existsSync(path.join(root, v.manifest)), 'manifest written');
  assert.strictEqual(C.verify(v.manifest, { root }).ok, true);
  const g = DH.bringHome('guardian', { root, force: true });
  assert.strictEqual(g.moved, 0);
  assert.ok(g.waiting.length === 1 && /rewire first: 1 code file/.test(g.waiting[0].why), JSON.stringify(g.waiting));
  assert.ok(fs.existsSync(path.join(root, 'data/guardian/jobs.json')), 'a named path is not moved');
  const i = DH.bringHome('idearium', { root, force: true });
  assert.ok(i.asked.length === 1 && fs.existsSync(path.join(root, 'data/run-state/x.run')), 'his call is never moved');
  const rec = JSON.parse(fs.readFileSync(path.join(DH.dir('versionium', { root }), DH.HOME_FILE), 'utf8'));
  assert.strictEqual(rec.moved, 2); assert.strictEqual(rec.by, 'system:versionium');
  const rb = C.rollback(v.manifest, { root });
  assert.strictEqual(rb.restored.length, 2);
  assert.strictEqual(fs.readFileSync(path.join(root, 'data/versionium/index.json'), 'utf8'), '{"snapshots":3}\n', 'byte for byte');
  fs.rmSync(root, { recursive: true, force: true });
});

test('DH-03', 'a test process never moves the real tree; nothing owned in the root data/ reads no census', () => {
  const r = DH.bringHome('guardian');
  assert.strictEqual(r.moved, 0); assert.match(r.said, /test process/);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-'));
  fs.mkdirSync(path.join(root, 'docs')); fs.copyFileSync(path.join(ROOT, 'docs/data-layout.spec'), path.join(root, 'docs/data-layout.spec'));
  put(root, 'data/versionium/index.json', '{}');
  const real = C.census; let read = 0; C.census = (...a) => { read++; return real(...a); };
  try { const l = DH.bringHome('loom', { root, force: true }); assert.strictEqual(read, 0, 'no census'); assert.match(l.said, /nothing of loom/); }
  finally { C.census = real; fs.rmSync(root, { recursive: true, force: true }); }
});

test('DH-04', 'a boot with the same release and the same waiting paths reads no census; another release reads again', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-'));
  fs.mkdirSync(path.join(root, 'docs')); fs.copyFileSync(path.join(ROOT, 'docs/data-layout.spec'), path.join(root, 'docs/data-layout.spec'));
  fs.mkdirSync(path.join(root, 'guardian'));
  put(root, 'data/guardian/jobs.json', '[]');
  put(root, 'guardian/config.js', "path.join(ROOT, 'data', 'guardian')");
  const first = DH.bringHome('guardian', { root, force: true, fresh: true });
  assert.strictEqual(first.waiting.length, 1);
  const real = C.census; let read = 0; C.census = (...a) => { read++; return real(...a); };
  try {
    const again = DH.bringHome('guardian', { root, force: true });
    assert.strictEqual(read, 0, 'the last record stands'); assert.ok(again.cached && /unchanged since/.test(again.said));
    const f = path.join(DH.dir('guardian', { root }), DH.HOME_FILE); const rec = JSON.parse(fs.readFileSync(f, 'utf8'));
    fs.writeFileSync(f, JSON.stringify({ ...rec, version: '0.0.1' }));
    DH.bringHome('guardian', { root, force: true });
    assert.strictEqual(read, 1, 'another release: read again');
  } finally { C.census = real; fs.rmSync(root, { recursive: true, force: true }); }
});

(async () => {
  // DH-05 — the route and the commands (backend → route → command, his order)
  const { pathToFileURL } = require('url');
  const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };
  const api = await quiet(() => import(pathToFileURL(path.join(ROOT, 'idearium/api/index.js')).href));
  const R = (m, p, b) => quiet(() => api._route(m, p, b));
  try {
    const l = await R('GET', '/api/data/home');
    assert.strictEqual(l.status, 200, JSON.stringify(l.json).slice(0, 300));
    const names = l.json.systems.map(x => x.system);
    for (const s of ['guardian', 'cortex', 'versionium', 'ollama-bridge']) assert.ok(names.includes(s), `${s} listed`);
    const g = await R('GET', '/api/data/home/guardian');
    assert.ok(g.status === 200 && Array.isArray(g.json.moves) && g.json.folder === 'guardian', JSON.stringify(g.json).slice(0, 300));
    assert.strictEqual((await R('GET', '/api/data/home/nosuch')).status, 404);
    const b = await R('POST', '/api/data/home/guardian', {});
    assert.ok(b.status === 200 && b.json.moved === 0 && /test process/.test(b.json.said), 'a test never moves the real tree');
    assert.strictEqual((await R('POST', '/api/data/rollback', { manifest: '../etc/passwd' })).status, 400);
    const rows = require(path.join(ROOT, 'idearium/cli/route-commands.js'));
    const all = Array.isArray(rows) ? rows : (rows.SPEC || []);
    assert.ok(all.some(r => r.key === 'data.home') && all.some(r => r.key === 'data.rollback'), 'the commands are rows in the one table');
    console.log('  ✓ DH-05 the route lists every system, plans one, refuses an unknown one and a bad manifest; the commands are rows'); passed++;
  } catch (e) { console.error(`  ✗ DH-05 route and commands\n    ${e.stack.split('\n').slice(0, 5).join('\n    ')}`); failed++; }
  // DH-06 — the Data screen in the settings console, in Clear Glass (AXIOMS §4.1): served with the real API behind it
  const glass = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
  if (!glass.engine()) console.log('  - DH-06 SKIPPED: Clear Glass has no engine here (no Electron binary, no Chromium)');
  else {
    const http = require('http');
    const UI = path.join(ROOT, 'idearium/ui');
    const srv = http.createServer(async (req, res) => {
      const u = new URL(req.url, 'http://x');
      if (u.pathname.startsWith('/api/')) {
        let raw = ''; for await (const c of req) raw += c;
        const r = await R(req.method, u.pathname + u.search, raw ? JSON.parse(raw) : undefined);
        res.writeHead(r.status, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(r.json));
      }
      const f = path.join(UI, path.normalize(u.pathname).replace(/^[/\\]+/, ''));
      if (!f.startsWith(UI) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    let browser;
    try {
      browser = await glass.chromium.launch();
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${srv.address().port}/settings.html`);
      await page.waitForSelector('[data-datahome]');
      await page.click('[data-datahome]');
      await page.waitForSelector('[data-dh-open="guardian"]', { timeout: 60000 });
      assert.strictEqual(await page.textContent('#title'), 'Data');
      const rowText = await page.textContent('#body');
      assert.ok(/guardian/.test(rowText) && /→ guardian[\\/]?|systems/.test(rowText), rowText.slice(0, 300));
      await page.click('[data-dh-open="guardian"]');
      await page.waitForFunction(() => { const e = document.getElementById('dh-files'); return e && e.textContent !== 'reading…'; }, null, { timeout: 60000 });
      if (process.env.DH_SHOT) await page.screenshot({ path: process.env.DH_SHOT, fullPage: false });
      const files = await page.textContent('#dh-files');
      assert.ok(files.length > 0, 'the files of one system are listed (or said to be none)');
      assert.deepStrictEqual(errors, []);
      console.log('  ✓ DH-06 in Clear Glass: Settings → Data lists every system; one system\'s files open with each plan'); passed++;
    } catch (e) { console.error(`  ✗ DH-06 the Data screen in Clear Glass\n    ${e.stack.split('\n').slice(0, 5).join('\n    ')}`); failed++; }
    finally { try { if (browser) await browser.close(); } catch (_) {} srv.close(); }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
