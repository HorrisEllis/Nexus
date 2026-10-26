'use strict';
// FD1 (0.60.266): test/gig-dropdown.electron.js in real Electron under xvfb. James, 2026-10-26: "can you fix the drop down mewnu?"
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
new Function('return ' + require('../src/autofill/gig.js').SELECT_SCRIPT)();   // the page script parses
const bin = [path.join(root, '..', 'node_modules/electron/dist/electron'), path.join(root, 'node_modules/electron/dist/electron')].find(f => fs.existsSync(f));
const xvfb = process.platform === 'linux' ? ['/usr/bin/xvfb-run', '/usr/local/bin/xvfb-run'].find(f => fs.existsSync(f)) : null;
if (!bin || (process.platform === 'linux' && !xvfb)) { console.log('gig-dropdown.test.js: Electron part SKIPPED (no Electron or xvfb)'); process.exit(0); }
const args = [bin, '--no-sandbox', path.join(__dirname, 'gig-dropdown.electron.js')];
const r = xvfb ? spawnSync(xvfb, ['-a', ...args], { encoding: 'utf8', timeout: 90000 }) : spawnSync(args[0], args.slice(1), { encoding: 'utf8', timeout: 90000 });
const line = String(r.stdout || '').split('\n').find(l => l.startsWith('FDRESULT '));
assert.ok(line, `no result: ${String(r.stderr || '').slice(-600)}`);
const o = JSON.parse(line.slice(9));
assert.ok(!o.error, o.error);
assert.deepStrictEqual(o.ok.results.map(x => x.chose), ['Programming & Tech', 'AI Development'], 'the category, then the subcategory its choice enabled');
assert.strictEqual(o.picked, '{"cat":"Programming & Tech","sub":"AI Development"}', 'the page itself registered both choices');
assert.ok(/no option matches/.test(o.miss.results[1].why) && o.miss.results[1].options.includes('AI Development'), 'no match: said, with the real options');
assert.strictEqual(o.nativeValue, 'Programming & Tech|1', 'a native <select> is set by its option text, with a change event');
console.log('gig-dropdown.test.js: ok — ' + JSON.stringify(o.ok.results));
