'use strict';
// HC1–HC3 (0.60.260): starts test/human-check.electron.js in real Electron under xvfb and checks what it saw. No Playwright (AXIOMS §4.1).
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
const bin = [path.join(root, '..', 'node_modules/electron/dist/electron'), path.join(root, 'node_modules/electron/dist/electron')].find(f => fs.existsSync(f));
const xvfb = process.platform === 'linux' ? ['/usr/bin/xvfb-run', '/usr/local/bin/xvfb-run'].find(f => fs.existsSync(f)) : null;
// the pure parts first (no Electron)
const HC = require('../src/contexts/human-check.js');
assert.strictEqual(HC.isHumanCheck({ text: 'Before we continue... Press & Hold to confirm you are a human (and not a bot).' }).provider, 'human-perimeterx');
assert.strictEqual(HC.isHumanCheck({ title: 'Just a moment...' }).provider, 'cloudflare');
assert.strictEqual(HC.isHumanCheck({ markers: 'https://www.google.com/recaptcha/api2/anchor?k=x' }).provider, 'recaptcha');
assert.strictEqual(HC.isHumanCheck({ markers: 'https://client.px-cloud.net/PX1/main.min.js', text: 'Welcome back' }).check, false, 'a PerimeterX script on an ordinary page is no check');
assert.deepStrictEqual(HC.humanCheckGate({ text: 'hello' }), { pass: true });
assert.ok(HC.humanCheckGate({ text: 'Press and hold' }).needsPerson);
const src = (f) => fs.readFileSync(path.join(root, f), 'utf8');
assert.ok(src('src/ipc/bridge.js').split('await this._humanCheckGate(agentId)').length - 1 >= 3, 'the IPC fill, the /cli fill and the gig fill pass the gate');
assert.ok(/mode: 'engine', options: \{ reason: `hostile:\$\{type\}` \}/.test(src('src/main/index.js')), 'a challenge is met with the engine identity, not Firefox');
if (!bin || (process.platform === 'linux' && !xvfb)) { console.log(`human-check.test.js: pure parts ok; Electron part SKIPPED — ${!bin ? 'no Electron binary' : 'no xvfb-run'}`); process.exit(0); }
const args = [bin, '--no-sandbox', path.join(__dirname, 'human-check.electron.js')];
const r = xvfb ? spawnSync(xvfb, ['-a', ...args], { encoding: 'utf8', timeout: 90000 }) : spawnSync(args[0], args.slice(1), { encoding: 'utf8', timeout: 90000 });
const line = String(r.stdout || '').split('\n').find(l => l.startsWith('HCRESULT '));
assert.ok(line, `no result from Electron: ${String(r.stderr || '').slice(-800)}`);
const o = JSON.parse(line.slice(9));
assert.ok(!o.error, o.error);
assert.ok(o.personaUa, 'a person tab starts as a Firefox persona (the cause)');
assert.strictEqual(o.plainDetect, false);
assert.deepStrictEqual([o.checkDetect.check, o.checkDetect.provider], [true, 'human-perimeterx']);
assert.ok(o.gate.needsPerson && /nothing here presses, holds or solves it/.test(o.gate.why));
assert.ok(/Firefox\//.test(o.beforeSwitch.ua), `before: the site saw a Firefox UA on a Chromium engine (the cause): ${o.beforeSwitch.ua}`);
assert.ok(o.found && o.switch.ok && o.switch.mode === 'engine');
assert.ok(!/Firefox\//.test(o.afterSwitch.ua) && /Chrome\//.test(o.afterSwitch.ua) && !/Electron/.test(o.afterSwitch.ua), `after: the request is Chromium's own: ${o.afterSwitch.ua}`);
assert.ok(/Chrome\//.test(o.navUa) && !/Firefox/.test(o.navUa), 'navigator.userAgent agrees with the request');
assert.ok(o.again && o.hostileRefused, 'once switched it stays: a hostile-triggered persona is refused');
console.log('human-check.test.js: ok — before ' + o.beforeSwitch.ua.slice(0, 60) + ' · after ' + o.afterSwitch.ua.slice(0, 60) + ' · client hints after: ' + o.afterSwitch.ch);
