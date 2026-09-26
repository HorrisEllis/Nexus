'use strict';
/**
 * tests/modules/test-cg-settings-ui-files.test.js — v0.39.227
 * James: "should have had the ui aspects separate files. Including css file per ui file."
 * Enforces it for Clear Glass Settings: one JS file per area, one CSS file per
 * JS file, every area rule scoped to that area, and the shared stylesheet
 * holding no selector that only one area uses.
 */
const assert = require('assert'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const S = path.join(ROOT, 'clear-glass/renderer/settings');
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  \u2713 ${id} ${d}`); passed++; } catch (e) { console.error(`  \u2717 ${id} ${d}\n    ${e.message}`); failed++; } }
const js = fs.readdirSync(path.join(S, 'sections')).filter(f => f.endsWith('.js'));
const css = fs.readdirSync(path.join(S, 'sections')).filter(f => f.endsWith('.css'));

(async () => {
  await test('UF-01', 'every section file registers exactly ONE area, and its file name is that area\u2019s id', () => {
    for (const f of js) {
      const src = fs.readFileSync(path.join(S, 'sections', f), 'utf8');
      const ids = [...src.matchAll(/section\(\{\s*id: '([a-z]+)'/g)].map(m => m[1]);
      assert.deepStrictEqual(ids, [f.replace(/\.js$/, '')], `${f} registers ${ids.join(', ')}`);
    }
    assert.strictEqual(js.length, 18);   // 14 at v0.39.227; areas added since
  });
  await test('UF-02', 'one CSS file per JS file, and no orphan CSS', () => {
    assert.deepStrictEqual(css.map(f => f.replace(/\.css$/, '')).sort(), js.map(f => f.replace(/\.js$/, '')).sort());
  });
  await test('UF-03', 'every rule in an area CSS file is scoped to body[data-area="<that area>"]', () => {
    for (const f of css) {
      const a = f.replace(/\.css$/, '');
      const src = fs.readFileSync(path.join(S, 'sections', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/@[^{]+\{/g, '');
      const selectors = [...src.matchAll(/([^{}@]+)\{/g)].map(m => m[1].trim()).filter(s => s && !s.startsWith('@'));
      assert.ok(selectors.length, `${f} has no rules`);
      for (const sel of selectors) for (const part of sel.split(',')) assert.ok(part.trim().startsWith(`body[data-area="${a}"]`), `${f}: unscoped "${part.trim()}"`);
    }
  });
  await test('UF-04', 'the shared stylesheet keeps no selector that belongs to one area only', () => {
    const shared = fs.readFileSync(path.join(S, 'settings.css'), 'utf8');
    for (const cls of ['.acct', '.star', '.plus', '.banner', '.kv', '.step.eros', '.step .more']) assert.ok(!shared.includes(cls), `settings.css still has ${cls}`);
  });
  await test('UF-05', 'core.js sets the area on body and loads that area\u2019s stylesheet once; the page lists every section script', () => {
    const core = fs.readFileSync(path.join(S, 'core.js'), 'utf8');
    // 0.39.241 — the CSS folder is a boot() option (the Library window shares this runtime);
    // Settings' default is still settings/sections/.
    assert.ok(/document\.body\.dataset\.area = def\.id/.test(core) && /loadAreaCss\(def\.id\)/.test(core) && /href: `\$\{CFG\.cssBase\}\$\{id\}\.css`/.test(core) && /cssBase: 'settings\/sections\/'/.test(core) && /loadedCss\.has\(id\)/.test(core));
    const html = fs.readFileSync(path.join(ROOT, 'clear-glass/renderer/settings.html'), 'utf8');
    for (const f of js) assert.ok(html.includes(`<script src="settings/sections/${f}"></script>`), f);
  });
  let JSDOM; try { ({ JSDOM } = require('jsdom')); } catch (_) {}
  if (JSDOM) await test('UF-06', 'showing an area really adds its stylesheet link and marks body with the area (jsdom)', async () => {
    const dom = new JSDOM('<body><div id="rail"></div><main id="main"></main><div id="toasts"></div><button id="close"></button></body>', { url: 'http://localhost/settings.html', runScripts: 'outside-only' });
    const w = dom.window; w.ClearGlass = { window: { closeSettings() {} } };
    w.eval(fs.readFileSync(path.join(S, 'core.js'), 'utf8'));
    w.CGS.section({ id: 'accounts', group: 'Identity', label: 'A', render: async () => [] });
    w.CGS.section({ id: 'mesh', group: 'Agents', label: 'M', render: async () => [] });
    w.CGS.boot(); await new Promise(r => setTimeout(r, 20));
    await w.CGS.show('mesh'); await w.CGS.show('accounts');
    const links = [...w.document.querySelectorAll('link[data-area]')].map(l => l.getAttribute('href'));
    assert.deepStrictEqual(links, ['settings/sections/accounts.css', 'settings/sections/mesh.css'], 'each once');
    assert.strictEqual(w.document.body.dataset.area, 'accounts');
  });
  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exit(failed ? 1 : 0);
})();
