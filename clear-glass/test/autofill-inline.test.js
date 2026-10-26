'use strict';
// AF3 (0.60.263): test/autofill-inline.electron.js in real Electron under xvfb. James, 2026-10-26: "When you click on name it will show
// autofill?" · "1". No Playwright (AXIOMS §4.1).
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
const bin = [path.join(root, '..', 'node_modules/electron/dist/electron'), path.join(root, 'node_modules/electron/dist/electron')].find(f => fs.existsSync(f));
const xvfb = process.platform === 'linux' ? ['/usr/bin/xvfb-run', '/usr/local/bin/xvfb-run'].find(f => fs.existsSync(f)) : null;
assert.ok(/autofillInline === false/.test(fs.readFileSync(path.join(root, 'src/autofill/inline.js'), 'utf8')), 'Settings can switch it off');
assert.ok(/_autofillInline\(contents\)/.test(fs.readFileSync(path.join(root, 'src/main/index.js'), 'utf8')), 'main shows it after a page loads');
if (!bin || (process.platform === 'linux' && !xvfb)) { console.log('autofill-inline.test.js: Electron part SKIPPED (no Electron or xvfb)'); process.exit(0); }
const args = [bin, '--no-sandbox', path.join(__dirname, 'autofill-inline.electron.js')];
const r = xvfb ? spawnSync(xvfb, ['-a', ...args], { encoding: 'utf8', timeout: 90000 }) : spawnSync(args[0], args.slice(1), { encoding: 'utf8', timeout: 90000 });
const line = String(r.stdout || '').split('\n').find(l => l.startsWith('AFIRESULT '));
assert.ok(line, `no result: ${String(r.stderr || '').slice(-600)}`);
const o = JSON.parse(line.slice(10));
assert.ok(!o.error, o.error);
assert.strictEqual(o.attach, 3); assert.strictEqual(o.tagged, 'fn,ln,em', 'name, surname, email; never the password');
assert.strictEqual(o.pageSeesData, 'undefined null', "the page's scripts see neither the chip's data nor its shadow root");
assert.ok(o.shown && /James/.test(o.rows[0]) && /Fill all 3 fields/.test(o.rows[1]), JSON.stringify(o.rows));
assert.strictEqual(o.values, 'James|||', 'a real click on the chip fills that field');
assert.strictEqual(o.inputEvent, 'James', 'the input event a React form listens to fired');
assert.ok(o.hidden);
assert.strictEqual(o.allValues, 'James|Brooks|j@example.com|', '"Fill all" fills every matched field, never the password');
assert.strictEqual(o.plan, 0, 'a password field is never planned');
console.log('autofill-inline.test.js: ok — ' + JSON.stringify(o));
