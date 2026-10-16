'use strict';
// SW-01..09 (0.60.67 COSA4): switch a project between installed versions with a data snapshot, a health check and an automatic rollback. Real zips, real processes, real sockets.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), net = require('net');
const Zip = require('../../lib/zip.js'); const Store = require('../../cos/app/store.js'); const RT = require('../../cos/app/runtime.js'); const SW = require('../../cos/app/switch.js');
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); console.log('  ✓ ' + name); passed++; } catch (e) { console.error('  ✗ ' + name + '\n    ' + (e.stack || e).toString().split('\n').slice(0, 5).join('\n    ')); failed++; } }
const SERVER = `const http=require('http');require('js-yaml');const p=+process.env.AUTOPILOT_STATUS_PORT;http.createServer((q,r)=>{r.end('{"ok":true,"v":"'+process.env.WHO+'"}');}).listen(p,'127.0.0.1');`;
const good = (v) => `process.env.WHO='${v}';require('fs').writeFileSync(require('path').join(process.env.NEXUS_DATA_ROOT,'ran-'+'${v}'),'1');` + SERVER;
const BAD = (v) => `console.log('${v} is broken');require('fs').writeFileSync(require('path').join(process.env.NEXUS_DATA_ROOT,'corrupt.json'),'GARBAGE');process.exit(3);`;
const freePort = () => new Promise((ok) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
function install(root, version, main, deps = { 'js-yaml': '^4' }) {
  const dl = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-sw-dl-')), top = `nexus-${version}`, f = path.join(dl, top + '.zip');
  fs.writeFileSync(f, Zip.create([{ path: `${top}/VERSION`, data: Buffer.from(version + '\n') }, { path: `${top}/package.json`, data: Buffer.from(JSON.stringify({ dependencies: deps })) }, { path: `${top}/nexus/autopilot.js`, data: Buffer.from(main) }]));
  assert.ok(Store.importZip(root, f).ok);
}
const mk = async () => { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-sw-root-')); const port = await freePort(); return { root, o: { statusPort: port, ports: [port], healthTimeoutMs: 6000, graceMs: 2000, pollMs: 100 }, data: path.join(root, 'projects', 'nexus', 'data'), st: () => JSON.parse(fs.readFileSync(path.join(root, 'projects', 'nexus', 'state.json'), 'utf8')) }; };
const ver = async (r) => (await RT.status(r.root, 'nexus')).version;

(async () => {
  await test('SW-01 the first switch: the version becomes current, runs, and is healthy', async () => {
    const r = await mk(); install(r.root, '1.0.0', good('1.0.0')); const s = await SW.switchTo(r.root, 'nexus', '1.0.0', r.o); assert.strictEqual(s.ok, true, JSON.stringify(s)); assert.strictEqual(s.from, null);
    assert.strictEqual(r.st().current, '1.0.0'); assert.strictEqual((await RT.status(r.root, 'nexus')).healthy, true); await RT.stop(r.root, 'nexus');
  });
  await test('SW-02 a good upgrade: the old one stops, a data snapshot is kept, the new one runs on the same data, previous is recorded', async () => {
    const r = await mk(); install(r.root, '1.0.0', good('1.0.0')); install(r.root, '1.0.1', good('1.0.1')); await SW.switchTo(r.root, 'nexus', '1.0.0', r.o); fs.writeFileSync(path.join(r.data, 'work.json'), 'MY-WORK');
    const s = await SW.switchTo(r.root, 'nexus', '1.0.1', r.o); assert.strictEqual(s.ok, true, JSON.stringify(s)); assert.strictEqual(s.from, '1.0.0'); assert.strictEqual(await ver(r), '1.0.1');
    assert.deepStrictEqual([r.st().current, r.st().previous], ['1.0.1', '1.0.0']); assert.strictEqual(fs.readFileSync(path.join(s.snapshot, 'work.json'), 'utf8'), 'MY-WORK'); assert.strictEqual(fs.readFileSync(path.join(r.data, 'work.json'), 'utf8'), 'MY-WORK'); await RT.stop(r.root, 'nexus');
  });
  await test('SW-03 a version that crashes: rolled back, the working version is running again, and the data the bad one wrote is gone', async () => {
    const r = await mk(); install(r.root, '1.0.0', good('1.0.0')); install(r.root, '2.0.0', BAD('2.0.0')); await SW.switchTo(r.root, 'nexus', '1.0.0', r.o); fs.writeFileSync(path.join(r.data, 'work.json'), 'MY-WORK');
    const s = await SW.switchTo(r.root, 'nexus', '2.0.0', r.o); assert.strictEqual(s.ok, false); assert.strictEqual(s.rolledBack, true); assert.strictEqual(s.restoredData, true); assert.strictEqual(s.backOn, '1.0.0'); assert.match(s.error, /2\.0\.0 is broken/);
    assert.strictEqual(await ver(r), '1.0.0'); assert.strictEqual((await RT.status(r.root, 'nexus')).healthy, true); assert.strictEqual(r.st().current, '1.0.0');
    assert.ok(!fs.existsSync(path.join(r.data, 'corrupt.json')), 'the bad version\'s write is undone'); assert.strictEqual(fs.readFileSync(path.join(r.data, 'work.json'), 'utf8'), 'MY-WORK');
    assert.ok(fs.existsSync(path.join(r.root, 'projects', 'nexus', 'versions', '2.0.0')), 'the failed version is kept for inspection'); await RT.stop(r.root, 'nexus');
  });
  await test('SW-04 a candidate that fails preflight never takes the running version down', async () => {
    const r = await mk(); install(r.root, '1.0.0', good('1.0.0')); install(r.root, '1.1.0', good('1.1.0'), { 'js-yaml': '^4', 'left-pad': '1' }); await SW.switchTo(r.root, 'nexus', '1.0.0', r.o);
    const s = await SW.switchTo(r.root, 'nexus', '1.1.0', r.o); assert.strictEqual(s.ok, false); assert.strictEqual(s.reason, 'preflight'); assert.match(s.error, /left-pad/); assert.match(s.error, /1\.0\.0 is still running/);
    assert.strictEqual(await ver(r), '1.0.0'); assert.strictEqual((await RT.status(r.root, 'nexus')).healthy, true); await RT.stop(r.root, 'nexus');
  });
  await test('SW-05 switching to the version already running is a calm no-op; an uninstalled one is refused', async () => {
    const r = await mk(); install(r.root, '1.0.0', good('1.0.0')); await SW.switchTo(r.root, 'nexus', '1.0.0', r.o);
    assert.strictEqual((await SW.switchTo(r.root, 'nexus', '1.0.0', r.o)).already, true); const n = await SW.switchTo(r.root, 'nexus', '9.9.9', r.o); assert.strictEqual(n.ok, false); assert.strictEqual(n.reason, 'not-installed'); await RT.stop(r.root, 'nexus');
  });
  await test('SW-06 a deliberate rollback goes back WITHOUT touching data by default (the new version may have written real work)', async () => {
    const r = await mk(); install(r.root, '1.0.0', good('1.0.0')); install(r.root, '1.0.1', good('1.0.1')); await SW.switchTo(r.root, 'nexus', '1.0.0', r.o); await SW.switchTo(r.root, 'nexus', '1.0.1', r.o);
    fs.writeFileSync(path.join(r.data, 'written-by-new.json'), 'REAL-WORK'); const b = await SW.rollback(r.root, 'nexus', r.o); assert.strictEqual(b.ok, true, JSON.stringify(b)); assert.strictEqual(await ver(r), '1.0.0');
    assert.strictEqual(fs.readFileSync(path.join(r.data, 'written-by-new.json'), 'utf8'), 'REAL-WORK'); await RT.stop(r.root, 'nexus');
  });
  await test('SW-07 rollback with restoreData puts the data back as it was when the switch was made', async () => {
    const r = await mk(); install(r.root, '1.0.0', good('1.0.0')); install(r.root, '1.0.1', good('1.0.1')); await SW.switchTo(r.root, 'nexus', '1.0.0', r.o); fs.writeFileSync(path.join(r.data, 'before.json'), 'B'); await SW.switchTo(r.root, 'nexus', '1.0.1', r.o);
    fs.writeFileSync(path.join(r.data, 'after.json'), 'A'); const b = await SW.rollback(r.root, 'nexus', { ...r.o, restoreData: true }); assert.strictEqual(b.ok, true, JSON.stringify(b)); assert.ok(b.restoredData);
    assert.ok(fs.existsSync(path.join(r.data, 'before.json'))); assert.ok(!fs.existsSync(path.join(r.data, 'after.json'))); assert.strictEqual(await ver(r), '1.0.0'); await RT.stop(r.root, 'nexus');
  });
  await test('SW-08 no previous version: rollback says so and changes nothing', async () => {
    const r = await mk(); install(r.root, '1.0.0', good('1.0.0')); await SW.switchTo(r.root, 'nexus', '1.0.0', r.o); const b = await SW.rollback(r.root, 'nexus', r.o); assert.strictEqual(b.ok, false); assert.strictEqual(b.reason, 'no-previous'); assert.strictEqual(await ver(r), '1.0.0'); await RT.stop(r.root, 'nexus');
  });
  await test('SW-09 snapshots are pruned to the newest few after good switches', async () => {
    const r = await mk(); for (const v of ['1.0.0', '1.0.1', '1.0.2', '1.0.3']) install(r.root, v, good(v));
    for (const v of ['1.0.0', '1.0.1', '1.0.2', '1.0.3']) await SW.switchTo(r.root, 'nexus', v, { ...r.o, keepSnapshots: 2 }); const left = fs.readdirSync(path.join(r.root, 'projects', 'nexus', 'snapshots')); assert.strictEqual(left.length, 2, left.join()); await RT.stop(r.root, 'nexus');
  });
  await test('SW-10 the CLI drives it: switch, running, logs, stop, and a failing switch exits 1 with the rollback said', async () => {
    const CLI = require('../../cos/app/cli.js'); const r = await mk(); install(r.root, '1.0.0', good('1.0.0')); install(r.root, '2.0.0', BAD('2.0.0')); const lines = []; const run = (...a) => CLI.run([...a, '--root', r.root, '--status-port', String(r.o.statusPort), '--timeout', '6'], (s) => lines.push(s));
    assert.strictEqual(await run('switch', 'nexus', '1.0.0'), 0); assert.match(lines.join('\n'), /nexus 1\.0\.0 healthy/); lines.length = 0; assert.strictEqual(await run('running', 'nexus'), 0); assert.match(lines[0], /1\.0\.0 running .* healthy/);
    lines.length = 0; assert.strictEqual(await run('switch', 'nexus', '2.0.0'), 1); assert.match(lines.join('\n'), /rolled back, data restored; 1\.0\.0 is running again/); lines.length = 0; assert.strictEqual(await run('logs', 'nexus', '--lines', '5'), 0); assert.match(lines.join('\n'), /\.log/);
    lines.length = 0; assert.strictEqual(await run('stop', 'nexus'), 0); assert.match(lines[0], /stopped nexus/); lines.length = 0; assert.strictEqual(await run('switch', 'nexus'), 1);
  });
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
