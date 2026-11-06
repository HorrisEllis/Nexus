'use strict';
/**
 * tests/modules/test-cg-element-engine-plugin.test.js — EE0: the Ad Blocker plugin is the Element Engine
 * (docs/2026-11-05-clear-glass-element-engine-phasemap.spec). James, 2026-11-05: "okay this needs to live inside the new plugin also. lets do the merge."
 *
 *   EP-01  the same plugin: id, name, folder and handlers unchanged (his lists and settings stay); 3.0.0, "Element Engine"; the manifest validates
 *   EP-02  the panel: the Ad blocking view first and unchanged, then Elements, ErosmancerOS and Edit ErosmancerOS
 *   EP-03  Pick asks the shell to start the picker; the shell presses #picker-btn
 *   EP-04  Edit ErosmancerOS in the panel: export, show changes, import — through src/eros/edit.js, to his folder
 *   EP-05  EE2: Hide what you point at — a host##selector rule in his filters, the element hidden by the engine on that site only, listed,
 *          Undo removes it; a selector a rule cannot use is refused; the bar after a pick is wired
 *   EP-06  ES4: ErosmancerOS's options and threats in the panel — every option shown (selects for pace and sending, text for the rest); a set
 *          from the panel lands in the same store `eros set` uses; a bad value is refused with why; threats said in plain words
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.EROS_EDIT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ee-edit-'));
process.env.CLEARGL_IPC_PORT = '1';
process.env.EROS_PORT = '1';   // no ErosmancerOS here either
process.env.EROS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ee-eros-data-'));   // no Clear Glass here: ErosmancerOS's state reads "not answering", said
const P = require(path.join(ROOT, 'clear-glass/plugins/adblocker/index.js'));
const M = require(path.join(ROOT, 'clear-glass/plugins/adblocker/manifest.json'));

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 4).join('\n    ')}`); failed++; } }

(async () => {
  console.log('\n⬡  The Element Engine plugin (EE0)\n');

  await test('EP-01', 'the same plugin, now the Element Engine; the manifest validates', () => {
    assert.deepStrictEqual([M.id, M.name, M.entryPoint, M.version, M.displayName], ['8c2f1a90-4e3b-4f1a-9c2d-1a2b3c4d5e6f', 'adblocker', 'index.js', '3.1.0', 'Element Engine']);
    assert.deepStrictEqual(M.contributes['content-filter'][0].handler, 'filterRequest');
    assert.strictEqual(M.previously.displayName, 'Ad Blocker');
    require(path.join(ROOT, 'clear-glass/src/plugins/schema.js')).validateManifest(M);
    for (const h of ['isBlocked', 'filterRequest', 'toggleFromToolbar', 'settings']) assert.strictEqual(typeof P[h], 'function', h);
    assert.strictEqual(P.isBlocked('https://doubleclick.net/x').blocked, true, 'the 0.60.x contract still holds');
  });

  await test('EP-02', 'the panel: Ad blocking first, then Elements, ErosmancerOS and Edit ErosmancerOS', async () => {
    await P._erosStatus();   // the state is refreshed in the background; wait for it once here
    const r = await P.settings({ op: 'get', requestId: 'r1', page: {} });
    assert.strictEqual(r.type, 'plugin:settings');
    const labels = r.data.view.fields.map(f => f.label);
    const at = (l) => labels.indexOf(l);
    assert.ok(at('— Elements —') > 0 && at('— ErosmancerOS —') > at('— Elements —') && at('— Edit ErosmancerOS —') > at('— ErosmancerOS —'), labels.join(' | '));
    assert.ok(labels[0] === 'Not running' || labels[0] === 'Block ads and trackers', 'the Ad blocking part comes first, as before');
    const eros = r.data.view.fields.find(f => f.label === '— ErosmancerOS —');
    assert.match(eros.value, /not answering/, 'with no Clear Glass, the state says so');
    assert.ok(r.data.view.fields.some(f => f.key === 'pick' && f.type === 'action'));
  });

  await test('EP-03', 'Pick asks the shell to start the picker; the shell presses #picker-btn', async () => {
    const r = await P.settings({ op: 'action', key: 'pick', requestId: 'r2', page: {} });
    assert.deepStrictEqual([r.data.do, /Picker on/.test(r.data.note)], ['pick', true]);
    const shell = fs.readFileSync(path.join(ROOT, 'clear-glass/renderer/shell/extensions.js'), 'utf8');
    assert.match(shell, /if \(r\.do === 'pick'\) \{ UI\(\)\.close\(\); const pb = document\.getElementById\('picker-btn'\); if \(pb && !pb\.classList\.contains\('active'\)\) pb\.click\(\); \}/);
    assert.match(fs.readFileSync(path.join(ROOT, 'clear-glass/renderer/browser.js'), 'utf8'), /document\.getElementById\('picker-btn'\)/);
  });

  await test('EP-04', 'Edit ErosmancerOS in the panel: export, show changes, import', async () => {
    const dir = process.env.EROS_EDIT_DIR;
    const ex = await P.settings({ op: 'action', key: 'eros-export', requestId: 'r3', page: {} });
    assert.match(ex.data.note, new RegExp(`Exported \\d+ files to ${dir.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')}`), ex.data.note);
    const df = await P.settings({ op: 'action', key: 'eros-diff', requestId: 'r4', page: {} });
    assert.strictEqual(df.data.note, 'Nothing changed in your copy.');
    const f = path.join(dir, 'hostile', 'index.ts'); fs.appendFileSync(f, '\n// my note\n');
    const df2 = await P.settings({ op: 'action', key: 'eros-diff', requestId: 'r5', page: {} });
    assert.match(df2.data.note, /1 file\(s\) changed: hostile\/index\.ts \(\+\d+ −0\)/, df2.data.note);
    fs.writeFileSync(f, 'export const X = [ ;\n');
    const im = await P.settings({ op: 'action', key: 'eros-import', requestId: 'r6', page: {} });
    assert.match(im.data.note, /^Not imported: hostile\/index\.ts — its syntax does not parse/, im.data.note);
    assert.ok(!/\[ ;/.test(fs.readFileSync(path.join(ROOT, 'clear-glass/erosmancer/erosmancer-os/src/hostile/index.ts'), 'utf8')), 'the live file is untouched');
  });

  await test('EP-05', 'Hide what you point at: one rule, hidden on that site only, listed, undone', async () => {
    const L = require(path.join(ROOT, 'clear-glass/src/adblock/lists.js'));
    const svc = L.service({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'ee2-')), fetch: null }); svc.start();
    const page = { url: 'https://www.fiverr.com/categories', tabId: 1 };
    const r = await P.settings({ op: 'set', key: 'hide', value: { selector: 'div.promo-banner', url: page.url }, page, requestId: 'h1' });
    assert.strictEqual(r.data.rule, 'www.fiverr.com##div.promo-banner', JSON.stringify(r.data).slice(0, 300));
    assert.ok(svc.state().custom.split('\n').includes('www.fiverr.com##div.promo-banner'), 'in his filters');
    const css = (u) => JSON.stringify(svc.cosmetics ? svc.cosmetics(u) : '');
    assert.match(css('https://www.fiverr.com/x'), /div\.promo-banner/, 'hidden on that site');
    assert.doesNotMatch(css('https://example.com/'), /div\.promo-banner/, 'and not on another');
    const list = r.data.view.fields.find(f => f.key === 'hidden');
    assert.deepStrictEqual(list.items.map(i => i.id), ['www.fiverr.com##div.promo-banner']);
    const again = await P.settings({ op: 'set', key: 'hide', value: { selector: 'div.promo-banner', url: page.url }, page, requestId: 'h2' });
    assert.match(again.data.note, /Already hidden/);
    const bad = await P.settings({ op: 'set', key: 'hide', value: { selector: 'a##b', url: page.url }, page, requestId: 'h3' });
    assert.ok(!bad.data.rule && /no selector a rule can use/.test(bad.data.note));
    const u = await P.settings({ op: 'set', key: 'hidden', value: { id: 'www.fiverr.com##div.promo-banner', remove: true }, page, requestId: 'h4' });
    assert.match(u.data.note, /Shown again/); assert.ok(!svc.state().custom.includes('promo-banner'));
    const js = fs.readFileSync(path.join(ROOT, 'clear-glass/renderer/browser.js'), 'utf8');
    assert.match(js, /window\.CGHideBar\?\.offer\(\{ selector: pick\.selector, url: pick\.url \|\| wv\.getURL\(\) \}\)/);
    assert.match(fs.readFileSync(path.join(ROOT, 'clear-glass/renderer/browser.html'), 'utf8'), /<script src="site-hide\/hide-bar\.js"><\/script>/);
    assert.match(fs.readFileSync(path.join(ROOT, 'clear-glass/renderer/site-hide/hide-bar.js'), 'utf8'), /ctx\.cg\.plugins\.settings\(PLUGIN, 'set', 'hide', \{ selector, url \}, \{ url \}\)/);
  });

  await test('EP-06', 'ErosmancerOS\'s options and threats in the panel; a set from the panel is the CLI\'s store', async () => {
    const O = require(path.join(ROOT, 'clear-glass/src/eros/options.js'));
    const r = await P.settings({ op: 'get', requestId: 'o1', page: {} });
    const f = r.data.view.fields;
    const opt = f.filter(x => String(x.key || '').startsWith('eros-opt:'));
    assert.strictEqual(opt.length, O.CATALOGUE.length, 'every settable option is in the panel');
    assert.deepStrictEqual(f.find(x => x.key === 'eros-opt:pace').options.map(o => o.value), O.PACES);
    const set = await P.settings({ op: 'set', key: 'eros-opt:selector.timeoutMs', value: '9000', requestId: 'o2', page: {} });
    assert.match(set.data.note, /Look for an element for at most: 9000 — kept; used the next time/);
    const store = O.createOptions({ file: path.join(process.env.EROS_DATA_DIR, 'options.json') });
    assert.strictEqual(store.get('selector.timeoutMs').value, 9000, 'the same store eros set writes');
    const bad = await P.settings({ op: 'set', key: 'eros-opt:dispatcher.defaultMaxRetries', value: '99', requestId: 'o3', page: {} });
    assert.match(bad.data.note, /between 0 and 20/);
    await P._threatsRefresh({ get: async () => ({ ok: true, body: { states: { t1: { level: 'high', score: 80, activeSignals: [{ type: 'recaptcha', level: 'high' }] } } } }) });
    const again = await P.settings({ op: 'get', requestId: 'o4', page: {} });
    assert.ok(again.data.view.fields.some(x => /Google reCAPTCHA — the page is yours/.test(x.value || '')), 'the threat said plainly');
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exitCode = failed ? 1 : 0;
})();
