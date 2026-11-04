'use strict';
// run-all: timeout 120000
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-cos-app-link.test.js — MG35, 0.60.364 (COS 0.2.0). Map: docs/2026-10-24-cos-manager-phasemap.spec MG35_the_exe_starts_nexus ·
 * Spec: cos/spec/cos-manager.spec MOD-COSA-LINK, MOD-COSA-LINKED-RUN, MOD-COSA-START-ON-LAUNCH.
 * James, 2026-11-01: "need the exe for cos. its how were going to start nexus from now on".
 *   CL-01 link: a folder that is not a Nexus is refused, naming what it lacks; his folder linked, listed with its VERSION; nothing written in it
 *   CL-02 start through the controller: the linked folder runs in place with the system node — no ELECTRON_RUN_AS_NODE (it would reach Clear
 *         Glass), no NEXUS_DATA_ROOT, no NODE_PATH from COS — answers /status, stops
 *   CL-03 start on launch: a person's setting (a project or none), validated; unlink forgets the link and leaves the folder
 *   CL-04 the window: main.js starts the chosen project when COS opens and says a failure; preload exposes link; the page has Link a Nexus folder…
 */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), net = require('net');
const ROOT = path.join(__dirname, '..', '..');
const S = require(path.join(ROOT, 'cos/app/store.js')), RT = require(path.join(ROOT, 'cos/app/runtime.js')), Settings = require(path.join(ROOT, 'cos/app/settings.js'));
const { Controller } = require(path.join(ROOT, 'cos/app/controller.js'));
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 4).join('\n    ')}`); failed++; } }
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)).map(x => path.join(e.name, x)) : [e.name]).sort();

(async () => {
  console.log('\n⬢  the exe starts Nexus from his folder (MG35)\n');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-link-')), root = path.join(tmp, 'cos'), his = path.join(tmp, 'nexus-0.60.346');
  fs.mkdirSync(path.join(his, 'lib', 'nexus'), { recursive: true });
  fs.writeFileSync(path.join(his, 'VERSION'), '0.60.364\n');
  fs.writeFileSync(path.join(his, 'package.json'), JSON.stringify({ name: 'nexus', version: '0.60.364', dependencies: {} }));
  // his launcher, stood in: answers /status on the port COS gives it, and writes down the environment it was started with
  fs.writeFileSync(path.join(his, 'lib', 'nexus', 'autopilot.js'), `const http=require('http'),fs=require('fs');const p=+process.env.AUTOPILOT_STATUS_PORT;
fs.writeFileSync(${JSON.stringify(path.join(tmp, 'env.json'))},JSON.stringify({execPath:process.execPath,cwd:process.cwd(),ERAN:process.env.ELECTRON_RUN_AS_NODE||null,DATA:process.env.NEXUS_DATA_ROOT||null,NODE_PATH:process.env.NODE_PATH||null}));
http.createServer((q,r)=>{r.writeHead(q.url==='/status'?200:404);r.end('{}');}).listen(p,'127.0.0.1');`);
  const before = walk(his);

  await test('CL-01', 'not a Nexus refused, naming what it lacks; his folder linked with its VERSION; nothing written in it', async () => {
    const bare = path.join(tmp, 'bare'); fs.mkdirSync(bare); fs.writeFileSync(path.join(bare, 'VERSION'), '1.0.0');
    const no = S.link(root, 'nexus', bare); assert.strictEqual(no.ok, false); assert.match(no.error, /not a Nexus folder: it has no lib[\\/]nexus[\\/]autopilot\.js/);
    assert.strictEqual(S.link(root, 'nexus', path.join(tmp, 'nowhere')).ok, false);
    const r = S.link(root, 'nexus', his); assert.ok(r.ok, r.error); assert.deepStrictEqual([r.project, r.dir, r.version], ['nexus', his, '0.60.364']);
    const l = S.list(root, 'nexus')[0]; assert.deepStrictEqual([l.linked.dir, l.linked.version, l.linked.present], [his, '0.60.364', true]);
    assert.deepStrictEqual(walk(his), before, 'nothing written inside his folder');
  });

  await test('CL-02', 'started in place with the system node: no ELECTRON_RUN_AS_NODE, no NEXUS_DATA_ROOT, no NODE_PATH; up; stopped', async () => {
    const port = await freePort();
    const keep = { ERAN: process.env.ELECTRON_RUN_AS_NODE, NP: process.env.NODE_PATH, DR: process.env.NEXUS_DATA_ROOT };
    process.env.ELECTRON_RUN_AS_NODE = '1'; process.env.NODE_PATH = '/cos/bundled'; process.env.NEXUS_DATA_ROOT = '/cos/data';   // what an Electron COS would carry
    try {
      const ctl = new Controller({ root, opts: { statusPort: port, ports: [port], healthTimeoutMs: 10000, graceMs: 2000, pollMs: 100 } });
      const r = await ctl.start('nexus');
      assert.ok(r.ok, JSON.stringify(r)); assert.strictEqual(r.version, 'linked');
      const env = JSON.parse(fs.readFileSync(path.join(tmp, 'env.json'), 'utf8'));
      assert.deepStrictEqual([env.ERAN, env.DATA, env.NODE_PATH], [null, null, null], JSON.stringify(env));
      assert.strictEqual(env.execPath, RT.nodeBinary(), 'the system node'); assert.strictEqual(fs.realpathSync(env.cwd), fs.realpathSync(his), 'run in his folder');
      const st = await RT.status(root, 'nexus'); assert.strictEqual(st.running, true);
      const again = await ctl.start('nexus'); assert.strictEqual(again.ok, false, 'one at a time');
      const s = await ctl.stop('nexus'); assert.ok(s.ok && s.stopped, JSON.stringify(s));
    } finally { for (const [k, v] of [['ELECTRON_RUN_AS_NODE', keep.ERAN], ['NODE_PATH', keep.NP], ['NEXUS_DATA_ROOT', keep.DR]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
  });

  await test('CL-03', 'start on launch is his setting, validated; unlink forgets the link, the folder untouched', async () => {
    assert.strictEqual(Settings.load(root).settings.startOnLaunch, null, 'off by default');
    assert.strictEqual(Settings.set(root, 'startOnLaunch', 'nexus').settings.startOnLaunch, 'nexus');
    assert.strictEqual(Settings.set(root, 'startOnLaunch', '../evil').ok, false);
    assert.strictEqual(Settings.set(root, 'startOnLaunch', null).settings.startOnLaunch, null);
    const u = S.unlink(root, 'nexus'); assert.ok(u.ok && u.unlinked === his); assert.strictEqual(S.list(root, 'nexus')[0].linked, null);
    assert.ok(fs.existsSync(path.join(his, 'lib', 'nexus', 'autopilot.js')), 'the folder untouched');
    const ctl = new Controller({ root }); assert.match((await ctl.start('nexus')).error, /no current version/);
  });

  await test('CL-04', 'the window: starts the chosen project when COS opens, says a failure; link exposed; the button on the page', () => {
    const main = fs.readFileSync(path.join(ROOT, 'cos/app/desktop/main.js'), 'utf8');
    assert.ok(/watchInbox\(\);\s*\n\s*startOnLaunch\(\);/.test(main) && /async function startOnLaunch\(\)/.test(main) && /notify\('Nexus did not start'/.test(main));
    assert.ok(/h\('link'/.test(main) && /h\('pickFolder'/.test(main));
    assert.ok(/link: call\('link'\)/.test(fs.readFileSync(path.join(ROOT, 'cos/app/desktop/preload.js'), 'utf8')));
    assert.ok(/id="btn-link"[^>]*>Link a Nexus folder…/.test(fs.readFileSync(path.join(ROOT, 'cos/app/desktop/ui/index.html'), 'utf8')));
    assert.ok(/Start Nexus when COS opens/.test(fs.readFileSync(path.join(ROOT, 'cos/app/desktop/ui/app.js'), 'utf8')));
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
