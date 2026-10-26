'use strict';
// A gig FILE (.gig) loads through parseGig like a written gig, and the import door is wired end to end. An old .gig.json loads too.
const assert = require('assert'), fs = require('fs'), path = require('path');
const G = require('../src/autofill/gig.js');
const root = path.join(__dirname, '..');
// §AT4 0.60.256 — James, 2026-10-26: "fix it so its .gig not .gig.json." The shipped sample is the .gig (its .gig.json twin archived)
const text = fs.readFileSync(path.join(root, 'docs/gigs/nodejs-automation-scraping.gig'), 'utf8');

const r = G.parseGig(text);
assert.strictEqual(r.ok, true); assert.deepStrictEqual(r.warnings, []);
assert.ok(r.gig.title.startsWith('I will') && r.gig.title.length <= G.LIMITS.title);
assert.deepStrictEqual(Object.keys(r.gig.packages), ['basic', 'standard', 'premium']);
assert.strictEqual(r.gig.requirements.length, 5);

// export -> import is lossless (the panel saves { format, platform, ...gig })
const again = G.parseGig(JSON.stringify({ format: 'clearglass.gig/1', platform: 'fiverr', ...r.gig }));
assert.deepStrictEqual(again.gig, r.gig);

// over-limit and non-gig files are reported, never silently accepted
const long = JSON.parse(JSON.stringify(r.gig)); long.title = 'I will ' + 'x'.repeat(120);
assert.ok(G.parseGig(JSON.stringify(long)).warnings.some(w => /title/.test(w)));
assert.strictEqual(G.parseGig('not a gig').ok, false);

// wiring: main handler, preload, registry
const has = (f, s) => assert.ok(fs.readFileSync(path.join(root, f), 'utf8').includes(s), `${f} missing ${s}`);
has('src/ipc/bridge.js', "ipcMain.handle('autofill:gig:import'");
has('src/preload/index.js', "gigImport:");
has('registry-components.js', "'autofill:gig:import'");
has('renderer/browser.html', 'id="gig-file"');
has('renderer/settings/sections/autofill.js', 'cg.autofill.gigImport');
console.log('gig-file.test.js: ok');

// 2026-10-12 — a .gig is YAML: the template and a saved gig both load back through parseGig
const tpl = G.gigTemplate();
assert.strictEqual(tpl.filename, 'gig-template.gig');
assert.strictEqual(G.parseGig(tpl.text).ok, true);
assert.ok(/at most 80 characters/.test(tpl.text) && /requirements:/.test(tpl.text));
const saved = G.gigFile(r.gig);
assert.ok(saved.filename.endsWith('.gig') && !saved.filename.includes('-.gig'));
assert.deepStrictEqual(G.parseGig(saved.text).gig, r.gig);
assert.deepStrictEqual(G.parseGig(fs.readFileSync(path.join(root, 'docs/gigs/nodejs-automation-scraping.gig'), 'utf8')).gig, r.gig);
has('src/ipc/bridge.js', "ipcMain.handle('autofill:gig:file'");
has('src/preload/index.js', 'gigTemplate:');
has('renderer/settings/sections/autofill.js', "btn('Download template'");
has('renderer/browser.html', 'id="gig-template"');
// §AT4 — every gig file is named .gig: the name is forced, and the downloads add no extension
for (const [n, want] of [['a.gig.json', 'a.gig'], ['a.json', 'a.gig'], ['b.yaml', 'b.gig'], ['gig-template.gig', 'gig-template.gig']]) assert.strictEqual(G.gigFilename(n), want);
assert.strictEqual(G.parseGig(JSON.stringify({ format: 'clearglass.gig/1', ...r.gig })).ok, true, 'an old .gig.json still loads');
assert.ok(!fs.existsSync(path.join(root, 'docs/gigs/nodejs-automation-scraping.gig.json')), 'no .gig.json is shipped');
has('src/ipc/bridge.js', 'filename: G.gigFilename(r.filename)');
for (const f of ['renderer/settings/sections/autofill.js', 'renderer/gig-panel.js']) assert.ok(!/text\/yaml/.test(fs.readFileSync(path.join(root, f), 'utf8')), `${f} types a gig download as text/yaml`);
console.log('gig-file.test.js: .gig YAML ok');
