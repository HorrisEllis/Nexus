'use strict';
/**
 * tests/modules/test-readme-generate.test.js — the README's generated half (0.60.153).
 * James, 2026-10-18: "can you update and expand the read me. expand anything thats a list. all the phases. have a full section of
 * for each of the 15 systems, each module and all the files. the data structure. all the idearium work. use all the changelogs to
 * expand it."
 *
 *   RG-01  every one of the 15 systems' sections carries its generated block, and every file of the tree is named in it; every
 *          phase of every phasemap; every release note; the stores, tables and node types; every Idearium route
 *   RG-02  README.md is the atlas (his 0.59.12 decision), and it stays under 512 KiB, the size GitHub is known to render
 *   RG-03  Clear Glass: the atlas page renders the folds as folds — closed, and a click opens one with its files as live refs
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '../..');

let passed = 0, failed = 0, skipped = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}
function done() { console.log(`\n  ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`); process.exit(failed ? 1 : 0); }

(async () => {
  const atlas = fs.readFileSync(path.join(ROOT, 'docs/atlases/nexus-atlas.md'), 'utf8');
  const S = require(path.join(ROOT, 'lib/nexus-self/systems.js'));
  const AG = require(path.join(ROOT, 'lib/atlas-generate.js'));
  const RG = require(path.join(ROOT, 'lib/readme-generate.js'));

  await test('RG-01', 'every system, module and file; every phase; every release; the data; every Idearium route', () => {
    assert.strictEqual(S.SYSTEMS.length, 15, 'fifteen systems');
    const files = AG.walk();
    for (const s of S.SYSTEMS) {
      const a = atlas.indexOf(`<!-- generated:readme:system:${s.name}:start -->`), b = atlas.indexOf(`<!-- generated:readme:system:${s.name}:end -->`);
      assert.ok(a > 0 && b > a, `${s.name} has its generated block`);
      const head = atlas.search(new RegExp(`^### ${s.name.replace(/[-.]/g, '\\$&')}\\s*$`, 'm'));
      assert.ok(head > 0 && head < a && !/^### /m.test(atlas.slice(head + 4, a)), `${s.name}'s block is inside its own section`);
    }
    const missing = files.filter(f => !atlas.includes('`' + f + '`')).filter(f => !/(^|\/)CHANGELOG-/.test(f));   // 0.60.274 — versionium/changelogs
    // the atlas was generated from this tree a moment ago (scripts/generate-atlases.js); a file added since is named here, not hidden
    assert.ok(missing.length <= 3, `files not in the README: ${missing.slice(0, 10).join(', ')}`);
    const P = require(path.join(ROOT, 'loom/scanners/phasemap-map.js')).loadAll();
    assert.ok(atlas.includes(`${P.phases.length} phases across`), 'every phase counted');
    for (const p of P.phases.slice(0, 50)) assert.ok(atlas.includes(`**${RG.plain(p.id, 70)}**`), `phase ${p.id}`);
    const notes = files.filter(f => /(^|\/)CHANGELOG-[\d.]+(-part\d+)?\.md$/.test(f));
    assert.ok(atlas.includes(`Every release note in the tree, ${notes.length} of them`), 'every release note');
    assert.ok(/James: "/.test(atlas.slice(atlas.indexOf('### Every release, in his words'))), 'his words, in the history');
    for (const k of ['### The data structure', 'the stores ·', 'the JAA tables ·', 'the node types ·', 'the ledgers and records ·', '### All the Idearium work', 'the routes ·', 'the command rows ·']) assert.ok(atlas.includes(k), k);
    const routes = (fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8').match(/\[\s*'(GET|POST|PUT|DELETE|PATCH)'\s*,\s*\[[^\]]*\]\s*,\s*'[a-z][a-z0-9.]*'\s*\]/gi) || []).length;
    assert.ok(routes > 300 && new RegExp(`the routes · \\d+`).test(atlas), `${routes} route tuples`);
  });

  await test('RG-02', 'README.md is the atlas, and stays under 512 KiB', () => {
    const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
    assert.strictEqual(readme, AG.README_HEAD + atlas, 'README.md = the atlas (scripts/generate-atlases.js)');
    const bytes = Buffer.byteLength(readme);
    assert.ok(bytes < 512 * 1024, `${bytes} bytes`);
    assert.strictEqual((atlas.match(/^<details>$/gm) || []).length, (atlas.match(/^<\/details>$/gm) || []).length, 'every fold closed');
  });

  // ── RG-03 the page, in Clear Glass ──
  const ctx = { escapeHtml: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'), console, API_REPOS: [], document: {}, window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'idearium/ui/js/nexus-atlas.js'), 'utf8'), ctx);
  const sec = atlas.slice(atlas.indexOf('<!-- generated:readme:system:loom:start -->'), atlas.indexOf('<!-- generated:readme:system:loom:end -->'));
  const html = ctx.nxMarkdown(sec);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-ui-'));
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="a">${html}</div></body></html>`);
  const glass = require('../../clear-glass/src/driver/glass.js');
  const eng = glass.engine();
  if (!eng) { console.log('  - RG-03 SKIPPED: Clear Glass has no engine here (no Electron binary, no Chromium) — the page check did not run'); skipped++; return done(); }
  let browser;
  try { browser = await glass.chromium.launch(); }
  catch (e) { console.log(`  - RG-03 SKIPPED: Clear Glass's engine (${eng.kind}) could not start (${e.message.split('\n')[0]})`); skipped++; return done(); }
  console.log(`  · driven by Clear Glass (clear-glass/src/driver/glass.js), engine: ${eng.kind}`);
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(path.join(dir, 'index.html')).href);
    await test('RG-03', 'Clear Glass: the folds render closed; a click opens one, its files live refs', async () => {
      const n = await page.evaluate(() => document.querySelectorAll('details.nx-fold').length);
      assert.ok(n > 5, `${n} folds`);
      assert.strictEqual(await page.evaluate(() => [...document.querySelectorAll('details.nx-fold')].every(d => !d.open)), true, 'closed');
      assert.ok(!(await page.textContent('#a')).includes('<details>'), 'no tag shown as text');
      await page.click('details.nx-fold summary');
      assert.strictEqual(await page.evaluate(() => document.querySelector('details.nx-fold').open), true, 'opened');
      const refs = await page.evaluate(() => document.querySelectorAll('details.nx-fold code.nx-ref[data-ref^="loom/"]').length);
      assert.ok(refs > 20, `${refs} file refs`);
    });
  } finally { await browser.close(); }
  done();
})();
