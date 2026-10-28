'use strict';
// GF1/GF2 (0.60.258): starts test/glass-frame.electron.js in real Electron under xvfb and checks what it saw. No Playwright (AXIOMS §4.1).
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
const bin = [path.join(root, '..', 'node_modules/electron/dist/electron'), path.join(root, 'node_modules/electron/dist/electron')].find(f => fs.existsSync(f));
const xvfb = process.platform === 'linux' ? ['/usr/bin/xvfb-run', '/usr/local/bin/xvfb-run'].find(f => fs.existsSync(f)) : null;
if (!bin || (process.platform === 'linux' && !xvfb)) { console.log(`glass-frame.test.js: SKIPPED — ${!bin ? 'no Electron binary' : 'no xvfb-run'} (said, not passed)`); process.exit(0); }
const args = [bin, '--no-sandbox', path.join(__dirname, 'glass-frame.electron.js')];
const r = xvfb ? spawnSync(xvfb, ['-a', ...args], { encoding: 'utf8', timeout: 90000 }) : spawnSync(args[0], args.slice(1), { encoding: 'utf8', timeout: 90000 });
const line = String(r.stdout || '').split('\n').find(l => l.startsWith('GFRESULT '));
assert.ok(line, `no result from Electron: ${String(r.stderr || '').slice(-800)}`);
const o = JSON.parse(line.slice(9));
assert.ok(!o.error, o.error);
assert.strictEqual(o.barHeight, 34); assert.strictEqual(o.pageHeight, 600 - 34, 'the page sits below the bar, not under it');
assert.strictEqual(o.barTitle, 'Log in or sign up', 'the bar shows the page title');
assert.strictEqual(o.barButtons, 'back,reload,devtools,minimize,maximize,close');
assert.ok(o.inAll, 'listed in all()');
assert.strictEqual(o.barIpc, 'Log in or sign up', "the bar's buttons reach their window (glass-frame:control)");
assert.ok(o.devtoolsByF12, 'F12 on the page opens its DevTools');
assert.deepStrictEqual(o.keys, [true, true, false]);
assert.ok(o.popupFramed, "a site's window.open popup is a Glass frame");
assert.strictEqual(o.popupPage, `${420 - 34} true`, 'the popup page is below the bar and keeps its opener');
assert.ok(o.popupClosedFrame, "the popup's window.close() closes the frame");
assert.ok(o.closed);
console.log('glass-frame.test.js: ok — ' + JSON.stringify(o));
