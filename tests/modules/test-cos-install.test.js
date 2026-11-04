'use strict';
/**
 * tests/modules/test-cos-install.test.js — COS installs Nexus from GitHub itself, first run (CA5, COS 0.6.0, Nexus 0.60.390)
 * James, 2026-11-04: "have it pull from the git. it should be installing the cos ui. this is redundant garbage."
 *
 *   IN-01  with git: git clone (partial) into <COS root>/nexus, then npm install in it; an existing clone is pulled, not cloned again
 *   IN-02  without git: the latest release's nexus-<version>.zip downloaded and unpacked, then npm install
 *   IN-03  a step that fails stops it, with its reason; no npm is said with where to get Node.js; nothing half-done is linked
 *   IN-04  the controller installs, links the folder, sets it to start with COS, and starts it
 *   IN-05  the window: nothing linked says "not installed" with Install Nexus; installing says its step; a failure says why
 *   IN-06  COS 0.6.0; install.js in the exe; autoInstall on by default
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const I = require(path.join(ROOT, 'cos/app/install.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 6).join('\n    ')}`); failed++; } }

(async () => {
  console.log('\n⬡  COS installs Nexus from GitHub (CA5)\n');

  await test('IN-01', 'git clone then npm install; an existing clone is pulled', async () => {
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'in01-')), 'nexus');
    const calls = [];
    const exec = async (cmd, args, o) => { calls.push([cmd, args.join(' '), o && o.cwd]); if (args[0] === 'clone') { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'VERSION'), '0.60.390\n'); } return { code: 0, tail: '' }; };
    const steps = [];
    const r = await I.run({ dir, git: 'git', npm: 'npm', exec, onStep: (e) => steps.push(`${e.id}:${e.state}`) });
    assert.deepStrictEqual([r.ok, r.via, r.version], [true, 'git-clone', '0.60.390'], JSON.stringify(r));
    assert.deepStrictEqual(calls, [['git', `clone --filter=blob:none https://github.com/HorrisEllis/Nexus.git ${dir}`, undefined], ['npm', 'install --no-audit --no-fund', dir]]);
    assert.deepStrictEqual(steps, ['clone:running', 'clone:done', 'npm:running', 'npm:done']);
    fs.mkdirSync(path.join(dir, '.git'));
    calls.length = 0;
    const again = await I.run({ dir, git: 'git', npm: 'npm', exec });
    assert.deepStrictEqual([again.via, calls[0][1]], ['git-pull', `-C ${dir} pull --ff-only`]);
  });

  await test('IN-02', 'no git: the latest release zip downloaded and unpacked, then npm install', async () => {
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'in02-')), 'nexus');
    const got = [];
    const fetch = async (url) => {
      got.push(url);
      if (/\/releases\?/.test(url)) return { ok: true, json: async () => [{ tag_name: 'cos-v0.6.0', assets: [{ name: 'COS-0.6.0-setup.exe' }] }, { tag_name: 'v0.60.390', assets: [{ name: 'SHA256SUMS' }, { name: 'nexus-0.60.390.zip', browser_download_url: 'https://dl/nexus-0.60.390.zip' }] }] };
      return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
    };
    let unpacked = null;
    const r = await I.run({ dir, git: null, npm: 'npm', fetch, unzip: (buf, d) => { unpacked = [buf.length, d]; }, exec: async () => ({ code: 0 }) });
    assert.deepStrictEqual([r.ok, r.via, r.version], [true, 'release-zip', '0.60.390'], JSON.stringify(r));
    assert.deepStrictEqual(got, ['https://api.github.com/repos/HorrisEllis/Nexus/releases?per_page=30', 'https://dl/nexus-0.60.390.zip']);
    assert.deepStrictEqual(unpacked, [3, dir]);
  });

  await test('IN-03', 'a failing step stops it with its reason; no npm said with where to get it', async () => {
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'in03-')), 'nexus');
    const r = await I.run({ dir, git: 'git', npm: 'npm', exec: async (cmd, a) => (a[0] === 'clone' ? { code: 128, tail: 'fatal: unable to access github.com' } : { code: 0 }) });
    assert.ok(!r.ok && r.step === 'clone' && /exit 128.*unable to access github\.com/.test(r.error), JSON.stringify(r));
    const n = await I.run({ dir, git: 'git', npm: null, exec: async () => ({ code: 0 }) });
    assert.ok(!n.ok && n.step === 'npm' && /install Node\.js.*nodejs\.org/.test(n.error), JSON.stringify(n));
    const dl = await I.run({ dir, git: null, npm: 'npm', fetch: async () => ({ ok: false, status: 503 }) });
    assert.ok(!dl.ok && /GitHub answered 503/.test(dl.error));
  });

  await test('IN-04', 'the controller installs, links, sets start-with-COS, and starts it', async () => {
    const { Controller } = require(path.join(ROOT, 'cos/app/controller.js'));
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'in04-'));
    const linked = [], started = [];
    const store = { list: () => [], link: (r0, p, d) => { linked.push([p, d]); return { ok: true, dir: d }; }, defaultRoot: () => root };
    const c = new Controller({ root, store });
    c.start = async (p) => { started.push(p); return { ok: true }; };
    const r = await c.installNexus({ install: { run: async (o) => { o.onStep({ id: 'clone', state: 'running', what: 'downloading' }); return { ok: true, dir: o.dir, via: 'git-clone' }; } } });
    assert.deepStrictEqual([r.ok, r.linked, r.started], [true, true, true], JSON.stringify(r));
    assert.deepStrictEqual(linked, [['nexus', path.join(root, 'nexus')]]);
    assert.deepStrictEqual(started, ['nexus']);
    assert.strictEqual(c.settings().settings.startOnLaunch, 'nexus');
    const bad = await c.installNexus({ install: { run: async () => ({ ok: false, error: 'no network' }) } });
    assert.deepStrictEqual([bad.ok, bad.error, linked.length], [false, 'no network', 1], 'nothing half-done is linked');
  });

  await test('IN-05', 'the window: not installed with Install Nexus; installing says its step; a failure says why', () => {
    const W = require(path.join(ROOT, 'cos/app/window.js'));
    const a = W.windowTarget({});
    assert.ok(a.canInstall && /not installed yet: press Install Nexus/.test(a.why), JSON.stringify(a));
    const b = W.windowTarget({ installing: 'downloading Nexus from GitHub (git clone)' });
    assert.ok(b.installing && /^installing Nexus: downloading Nexus from GitHub/.test(b.why));
    const c = W.windowTarget({ installError: 'npm was not found' });
    assert.ok(c.canInstall && /not installed: npm was not found — press Install Nexus to try again/.test(c.why));
    assert.strictEqual(W.windowTarget({ cockpitUp: true }).kind, 'cockpit');
    const H = fs.readFileSync(path.join(ROOT, 'cos/app/desktop/starting.html'), 'utf8');
    assert.match(H, /id="install" hidden>Install Nexus</); assert.match(H, /window\.cosStart\.install\(\)/);
    assert.match(fs.readFileSync(path.join(ROOT, 'cos/app/desktop/starting-preload.js'), 'utf8'), /install: \(\) => ipcRenderer\.invoke\('cos:install'\)/);
  });

  await test('IN-06', 'COS 0.6.0; install.js in the exe; autoInstall on by default; first launch installs', () => {
    assert.strictEqual(require(path.join(ROOT, 'cos/app/version.js')).version, '0.6.0');
    assert.ok(fs.readFileSync(path.join(ROOT, 'scripts/build-cos-app.js'), 'utf8').includes("'cos/app/install.js'"));
    assert.strictEqual(require(path.join(ROOT, 'cos/app/settings.js')).DEFAULTS.autoInstall, true);
    const M = fs.readFileSync(path.join(ROOT, 'cos/app/desktop/main.js'), 'utf8');
    assert.match(M, /if \(!ctl\.linkedDir\(\) && ctl\.settings\(\)\.settings\.autoInstall !== false\)/);
    assert.match(M, /h\('install', \(\) => installNexus\(\)\)/);
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exitCode = failed ? 1 : 0;
})();
