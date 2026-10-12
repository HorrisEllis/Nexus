'use strict';
// A gig FILE (.gig.json) loads through parseGig like a written gig, and the import door is wired end to end.
const assert = require('assert'), fs = require('fs'), path = require('path');
const G = require('../src/autofill/gig.js');
const root = path.join(__dirname, '..');
const text = fs.readFileSync(path.join(root, 'docs/gigs/nodejs-automation-scraping.gig.json'), 'utf8');

const r = G.parseGig(text);
assert.strictEqual(r.ok, true); assert.deepStrictEqual(r.warnings, []);
assert.ok(r.gig.title.startsWith('I will') && r.gig.title.length <= G.LIMITS.title);
assert.deepStrictEqual(Object.keys(r.gig.packages), ['basic', 'standard', 'premium']);
assert.strictEqual(r.gig.requirements.length, 5);

// export -> import is lossless (the panel saves { format, platform, ...gig })
const again = G.parseGig(JSON.stringify({ format: 'clearglass.gig/1', platform: 'fiverr', ...r.gig }));
assert.deepStrictEqual(again.gig, r.gig);

// over-limit and non-gig files are reported, never silently accepted
const long = JSON.parse(text); long.title = 'I will ' + 'x'.repeat(120);
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
