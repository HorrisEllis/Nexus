'use strict';
// tests/modules/test-nexus-atlas-and-glass.test.js — 0.39.263.
// James: "playright? no what is that for? litterally have clearglas... also nexus is the repo,
// not 15, just nexus, then clicking inside of it, shows the rest of them in … the nexus atlas,
// wire that completely in as the homepage of the nexus repo, and everything referenced can be
// opened in idearium, including each system."
//
//   AT-0xx  the nexus repo's Home: the atlas doc from the immutable base, every reference resolvable
//   UI-0xx  the atlas page's markdown + file-tree references; one nexus card in the library
//   CG-0xx  Clear Glass's own engine drives pages; Playwright is gone from the root
require('../../lib/test-sandbox.js').ensure();

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const http = require('http');

const ROOT = path.join(__dirname, '../..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-atlas-test-'));
process.env.NEXUS_SELF_DIR = path.join(TMP, 'self');
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {} });

let passed = 0, failed = 0, skipped = 0;
async function test(id, name, fn) {
  try { const r = await fn(); if (r === 'SKIP') { skipped++; return; } console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${name}\n    ${e.stack}`); failed++; }
}

function fakeTree() {
  const live = fs.mkdtempSync(path.join(TMP, 'live-'));
  const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(live, rel)), { recursive: true }); fs.writeFileSync(path.join(live, rel), text); };
  w('guardian/server.js', 'module.exports = 1;\n');
  w('guardian/lib/node-registry.js', 'module.exports = {};\n');
  w('guardian/spec/guardian.spec', 'spec:\n  meta:\n    name: guardian\n');
  w('loom/spec/loom.spec', 'spec: loom\n');
  w('docs/loom.spec', 'spec: an older copy\n');
  w('ollama/server.js', 'module.exports = 3;\n');
  w('warp/index.js', 'module.exports = 4;\n');
  w('docs/atlases/nexus-atlas.md', '# NEXUS\n\n### guardian\n\n**own atlas:** `guardian-atlas.md` · `guardian/lib/node-registry.js` · port `:7820`\n');
  w('docs/atlases/guardian-atlas.md', '# guardian — atlas\n');
  w('docs/atlases/ollama-atlas.md', '# ollama\n');
  return live;
}

async function main() {
  const store = require('../../lib/nexus-self/store.js');
  const live = fakeTree();
  store.snapshot({ liveRoot: live });
  const se = await import('../../idearium/spec-engine/index.js');
  const { RepoLayer } = await import('../../idearium/repo/index.js');
  const NS = await import('../../idearium/repo/nexus-self.js');
  const rl = new RepoLayer({ specEngine: se });

  // ── AT-0xx ─────────────────────────────────────────────────────────────
  await test('AT-001', 'every kind of atlas reference resolves to what it names; an unknown one to null', () => {
    const r = NS.resolveRefs(rl, ['guardian', 'nexus.guardian', ':7820', 'ollama', 'guardian/lib/node-registry.js', 'guardian/lib/',
      'guardian-atlas.md', 'loom.spec', 'warp/', 'NEXUS/', 'no/such/file.js', 'sigma']);
    assert.strictEqual(r.guardian.kind, 'system');
    assert.strictEqual(r['nexus.guardian'].system, 'guardian');
    assert.strictEqual(r[':7820'].system, 'guardian');
    assert.strictEqual(r.ollama.system, 'ollama-bridge', 'a system is found by the directory it owns too');
    assert.deepStrictEqual([r['guardian/lib/node-registry.js'].kind, r['guardian/lib/node-registry.js'].system], ['file', 'guardian']);
    assert.strictEqual(r['guardian/lib/'].kind, 'dir');
    assert.deepStrictEqual([r['guardian-atlas.md'].kind, r['guardian-atlas.md'].path], ['doc', 'docs/atlases/guardian-atlas.md']);
    assert.strictEqual(r['loom.spec'].path, 'loom/spec/loom.spec', 'the file inside the system it is named after wins');
    assert.deepStrictEqual(r['loom.spec'].alternatives, ['docs/loom.spec']);
    assert.deepStrictEqual([r['warp/'].kind, r['warp/'].system], ['dir', 'core']);
    assert.strictEqual(r['NEXUS/'].kind, 'nexus');
    assert.strictEqual(r['no/such/file.js'], null);
    assert.strictEqual(r.sigma, null);
  });

  await test('AT-002', 'the nexus Home is nexus-atlas.md from the immutable base, every system listed with its own atlas doc', () => {
    const a = NS.nexusAtlas(rl);
    assert.strictEqual(a.doc.path, 'docs/atlases/nexus-atlas.md');
    assert.ok(a.doc.content.startsWith('# NEXUS'));
    const by = Object.fromEntries(a.systems.map(s => [s.system, s]));
    assert.strictEqual(a.systems.length, require('../../lib/nexus-self/systems.js').SYSTEMS.length, 'every system, synced or not');
    assert.strictEqual(by.guardian.atlasDoc, 'docs/atlases/guardian-atlas.md');
    assert.strictEqual(by['ollama-bridge'].atlasDoc, 'docs/atlases/ollama-atlas.md', 'found by the directory the system owns');
    assert.strictEqual(by.loom.atlasDoc, null);
    assert.ok(by.guardian.fileCount >= 3);
  });

  await test('AT-003', 'a live edit does not change what the Home shows until the next snapshot (immutable base)', () => {
    fs.writeFileSync(path.join(live, 'docs/atlases/nexus-atlas.md'), '# CHANGED LIVE\n');
    assert.ok(NS.fileText('docs/atlases/nexus-atlas.md').content.startsWith('# NEXUS'));
    assert.ok(NS.fileText('nope.md').error);
  });

  await test('AT-004', 'the idearium API routes the atlas, resolve and file actions before :system', () => {
    const src = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    const at = (a) => src.indexOf(`'${a}'],`) >= 0 ? src.indexOf(`'${a}']`) : src.indexOf(`'${a}'`);
    for (const a of ['nexus-self.atlas', 'nexus-self.resolve', 'nexus-self.file']) {
      assert.ok(src.includes(`case '${a}':`), `${a} is handled`);
      assert.ok(at(a) < src.indexOf("'nexus-self.system']"), `${a} is routed before :system`);
    }
  });

  // ── UI-0xx ─────────────────────────────────────────────────────────────
  const uiSrc = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/nexus-atlas.js'), 'utf8');
  const ctx = { escapeHtml: (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) };
  vm.createContext(ctx);
  vm.runInContext(uiSrc, ctx);

  await test('UI-001', 'the atlas markdown renders headings, tables, code and marks every reference', () => {
    const html = ctx.nxMarkdown('# T\n\n### guardian\n\n| a | b |\n|---|---|\n| `x/y.js` | c |\n\n<!-- hidden -->\nsee loom-atlas.md and :3753\n\n```\nguardian/\n  lib/\n    node-registry.js  the watcher\nNEXUS/\n  loom/\n```\n');
    assert.ok(/<h1[^>]*>T<\/h1>/.test(html));
    assert.ok(html.includes('data-module="guardian"'), 'a module heading is a reference to its system');
    assert.ok(html.includes('<table') && html.includes('data-ref="x/y.js"'));
    assert.ok(!html.includes('hidden'), 'html comments are not shown');
    assert.ok(html.includes('data-ref="loom-atlas.md"') && html.includes('data-ref=":3753"'));
    const refs = [...html.matchAll(/data-ref="([^"]+)"/g)].map(m => m[1]);
    assert.ok(refs.includes('guardian/lib/node-registry.js'), 'an indented tree entry is under its directory: ' + refs.join(' '));
    assert.ok(refs.includes('loom/') && !refs.includes('NEXUS/loom/'), 'the tree root named after Nexus is not a path segment');
  });

  // §0.39.265 — James: "nexus and nexus/core should be the main repo": the library
  // shows nexus AND nexus/core; every other system still opens from inside nexus.
  await test('UI-002', 'the library shows nexus and nexus/core as the main repo; other systems open from inside it; back from a system goes to nexus', () => {
    const app = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/app.js'), 'utf8');
    // §0.39.265 — nexus and nexus/core are ONE repo: the library lists only the main entry
    assert.ok(/if \(r\.nexusSelf && !_nxIsMain\(r\) && \(r\.nexusSelf\.role === 'parent' \|\| \(!q && !\(REPO_DETAIL_OPEN && r\.uuid === inSystem\)\)\)\) continue;/.test(app));
    assert.ok(/repo\.nexusSelf\.role === 'parent' \|\| repo\.nexusSelf\.system === 'core'\) return renderNexusAtlasHome/.test(app), 'core\'s Home is the atlas');
    const atlas = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/nexus-atlas.js'), 'utf8');
    assert.ok(/function _nxMain\(\) \{ return _nxRepoFor\('core'\) \|\| _nxParent\(\); \}/.test(atlas));
    assert.ok(/if \(repo\.nexusSelf\.role === 'parent' \|\| repo\.nexusSelf\.system === 'core'\) return renderNexusAtlasHome\(repo, el\);/.test(app));
    assert.ok(/role === 'system' && CURRENT_API_REPO\.nexusSelf\.system !== 'core' && typeof nexusAtlasHome === 'function' && _nxParent\(\)\) return nexusAtlasHome\(\);/.test(app));
    const html = fs.readFileSync(path.join(ROOT, 'idearium/ui/index.html'), 'utf8');
    assert.ok(html.indexOf('<script src="js/nexus-atlas.js">') > html.indexOf('<script src="js/app.js">'), 'loaded after app.js');
  });

  await test('UI-003', 'no page loads a system UI at /<system>/ui — the orchestrator serves them at /ui/<system>/', () => {
    // James: '{"ok":false,"error":"route not found: GET /idearium/ui"} … should be /ui/idearium'.
    // A browser URL (src/href/location/iframe) must never climb out of /ui/ to <system>/ui:
    // that is a file path on disk (idearium/ui/, eravos/ui/), not a route.
    const offenders = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', '.git', 'data', 'undefined', '_archive', 'unintegrated'].includes(e.name)) continue;
        const f = path.join(dir, e.name);
        if (e.isDirectory()) { walk(f); continue; }
        if (!/\.(html|js)$/.test(e.name) || /[\\/]tests?[\\/]/.test(f)) continue;
        const src = fs.readFileSync(f, 'utf8');
        for (const m of src.matchAll(/(?:src|href|location|\.src)\s*=\s*["'`]((?:\.\.\/)+|\/)([a-z-]+)\/(?:src\/)?ui(?:[\/"'`?#])/g)) {
          if (m[2] !== 'ui') offenders.push(`${path.relative(ROOT, f)}: ${m[0]}`);
        }
      }
    };
    for (const d of ['ui', 'idearium/ui', 'clear-glass/renderer', 'guardian', 'cockpit']) if (fs.existsSync(path.join(ROOT, d))) walk(path.join(ROOT, d));
    assert.deepStrictEqual(offenders, []);
    const tv = fs.readFileSync(path.join(ROOT, 'ui/tv-shell/index.html'), 'utf8');
    assert.ok(tv.includes("f.src='../idearium/'"), 'tv-shell loads /ui/idearium/');
    assert.ok(fs.readFileSync(path.join(ROOT, 'idearium/ui/index.html'), 'utf8').includes('src="../eravos/"'), 'the Eravos canvas loads /ui/eravos/');
    // §0.39.299 AR4 — the Build tab's Architect is idearium's own page (one canvas for both Architects); arch-builder stays architect/'s own
    assert.ok(fs.readFileSync(path.join(ROOT, 'idearium/ui/index.html'), 'utf8').includes('data-src="architect.html"'), 'the Architect loads idearium\'s own architect.html');
    assert.ok(/SYSTEM_UI_DIRS = \{ idearium: .*architect: \{ dir: \['architect', 'src', 'ui'\]/.test(fs.readFileSync(path.join(ROOT, 'orchestrator/orchestrator.js'), 'utf8')), 'the orchestrator serves /ui/architect/ from architect/src/ui/');
  });

  // ── CG-0xx ─────────────────────────────────────────────────────────────
  await test('CG-001', 'Playwright is not a root package, no probe is python, and every real-page probe drives Clear Glass', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.ok(!('playwright' in (pkg.devDependencies || {})) && !('playwright' in (pkg.dependencies || {})));
    const lock = fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8');
    assert.ok(!/"node_modules\/playwright"/.test(lock), 'not in the lockfile');
    const probeDir = path.join(ROOT, 'tests/probe');
    assert.deepStrictEqual(fs.readdirSync(probeDir).filter(f => f.endsWith('.py')), [], 'no python (playwright) probe is left');
    const pageProbes = fs.readdirSync(probeDir).filter(f => /-chromium\.js$|clearglass-.*\.js$|equivalence\.js$/.test(f)).map(f => 'tests/probe/' + f);
    assert.ok(pageProbes.length >= 8, pageProbes.join(', '));
    for (const f of [...pageProbes, 'tests/manual-chatgpt-console.glass.js']) {
      const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
      assert.ok(!/require\([^)]*playwright/.test(s), `${f} no longer requires playwright`);
      assert.ok(/clear-glass', 'src', 'driver', 'glass\.js'|clear-glass\/src\/driver\/glass\.js|src\/driver\/glass\.js|_glass-probe\.js/.test(s), `${f} uses Clear Glass's driver`);
    }
  });

  const glass = require('../../clear-glass/src/driver/glass.js');
  await test('CG-002', "a real page in Clear Glass's engine: click (a wrapped inline element too), fill, :has-text, text=, events, screenshot", async () => {
    const eng = glass.engine();
    if (!eng) { console.log('  - CG-002 SKIPPED (not passed): no page engine — electron (a root devDependency) is not installed here'); return 'SKIP'; }
    const page = `<!doctype html><html><body style="margin:0">
      <div style="width:120px"><p>lead text <code id="wrap" onclick="window.hit='wrap'">a/very/long/path/that/wraps/over/two/lines.js</code> tail</p></div>
      <ul><li class="row">alpha <button onclick="window.hit='alpha'">go</button></li><li class="row">beta <button onclick="window.hit='beta'">go</button></li></ul>
      <input id="q" oninput="window.typed=this.value"><select id="s"><option value="a">A</option><option value="b">B</option></select>
      <button onclick="console.error('boom-console')">log</button><button onclick="setTimeout(() => { throw new Error('boom-page') })">throw</button>
    </body></html>`;
    const srv = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html' }); r.end(page); });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const b = await glass.chromium.launch();
    try {
      const pg = await b.newPage({ viewport: { width: 800, height: 600 } });
      const errs = [], cons = [];
      pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') cons.push(m.text()); });
      await pg.goto(`http://127.0.0.1:${srv.address().port}/`);
      await pg.click('#wrap');
      assert.strictEqual(await pg.evaluate(() => window.hit), 'wrap', 'a wrapped inline element is clicked on its first line box');
      await pg.click('li.row:has-text("beta") button');
      assert.strictEqual(await pg.evaluate(() => window.hit), 'beta');
      await pg.fill('#q', 'hello');
      assert.strictEqual(await pg.evaluate(() => window.typed), 'hello');
      await pg.selectOption('#s', { index: 1 });
      assert.strictEqual(await pg.$eval('#s', e => e.value), 'b');
      assert.strictEqual(await pg.locator('.row').count(), 2);
      assert.deepStrictEqual(await pg.$$eval('.row', rs => rs.map(r => r.textContent.trim().split(' ')[0])), ['alpha', 'beta']);
      await pg.click('text=log'); await pg.click('text=throw'); await pg.waitForTimeout(200);
      assert.deepStrictEqual([cons, errs], [['boom-console'], ['boom-page']]);
      const png = await pg.screenshot();
      assert.deepStrictEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [800, 600], 'screenshot at the viewport size');
      console.log(`    (engine: ${b.engine})`);
    } finally { await b.close(); srv.close(); }
  });

  console.log(`\n  ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
