'use strict';
/**
 * tests/modules/test-cg-element-engine-plugin.test.js — EE0: the Ad Blocker plugin is the Element Engine
 * (docs/2026-11-05-clear-glass-element-engine-phasemap.spec). James, 2026-11-05: "okay this needs to live inside the new plugin also. lets do the merge."
 *
 *   EP-01  the same plugin: id, name, folder and handlers unchanged (his lists and settings stay); 3.0.0, "Element Engine"; the manifest validates
 *   EP-02  the panel: the Ad blocking view first and unchanged, then Elements, ErosmancerOS and Edit ErosmancerOS
 *   EP-03  Pick asks the shell to start the picker; the shell presses #picker-btn
 *   EP-04  Edit ErosmancerOS in the panel: export, show changes, import — through src/eros/edit.js, to his folder
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.EROS_EDIT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ee-edit-'));
process.env.CLEARGL_IPC_PORT = '1';   // no Clear Glass here: ErosmancerOS's state reads "not answering", said
const P = require(path.join(ROOT, 'clear-glass/plugins/adblocker/index.js'));
const M = require(path.join(ROOT, 'clear-glass/plugins/adblocker/manifest.json'));

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 4).join('\n    ')}`); failed++; } }

(async () => {
  console.log('\n⬡  The Element Engine plugin (EE0)\n');

  await test('EP-01', 'the same plugin, now the Element Engine; the manifest validates', () => {
    assert.deepStrictEqual([M.id, M.name, M.entryPoint, M.version, M.displayName], ['8c2f1a90-4e3b-4f1a-9c2d-1a2b3c4d5e6f', 'adblocker', 'index.js', '3.0.0', 'Element Engine']);
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

  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exitCode = failed ? 1 : 0;
})();
