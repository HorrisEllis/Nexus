'use strict';
// RT-01..09 (0.60.67 COSA2+COSA3): COS starts a project's installed version with its own runtime, waits for it to be healthy, says why when it is not, and stops the whole tree.
// Fake releases (a tiny autopilot.js) installed through the real store from real zips. Real processes, real sockets.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), net = require('net');
const Zip = require('../../lib/zip.js'); const Store = require('../../cos/app/store.js'); const RT = require('../../cos/app/runtime.js');
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); console.log('  ✓ ' + name); passed++; } catch (e) { console.error('  ✗ ' + name + '\n    ' + (e.stack || e).toString().split('\n').slice(0, 5).join('\n    ')); failed++; } }
const GOOD = `const http=require('http');require('js-yaml');const p=+process.env.AUTOPILOT_STATUS_PORT;console.log('data='+process.env.NEXUS_DATA_ROOT);http.createServer((q,r)=>{if(q.url==='/status'){r.setHeader('content-type','application/json');r.end('{"ok":true}');}else{r.statusCode=404;r.end();}}).listen(p,'127.0.0.1',()=>console.log('up '+p));`;
const BAD = `console.log('boom: config is wrong');process.exit(3);`, HUNG = `console.log('starting...');setInterval(()=>{},1000);`;
const freePort = () => new Promise((ok) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
function install(root, version, main, deps = { 'js-yaml': '^4' }) {
  const dl = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-rt-dl-')), top = `nexus-${version}`;
  const f = path.join(dl, top + '.zip'); fs.writeFileSync(f, Zip.create([{ path: `${top}/VERSION`, data: Buffer.from(version + '\n') }, { path: `${top}/package.json`, data: Buffer.from(JSON.stringify({ name: 'nexus', dependencies: deps })) }, { path: `${top}/nexus/autopilot.js`, data: Buffer.from(main) }]));
  const r = Store.importZip(root, f); assert.ok(r.ok, JSON.stringify(r)); return r;
}
const rootDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cos-rt-root-'));
const opts = async (extra = {}) => { const port = await freePort(); return { statusPort: port, ports: [port], healthTimeoutMs: 8000, graceMs: 2000, pollMs: 100, ...extra }; };

(async () => {
  await test('RT-01 preflight: a release with an entry and only bundled dependencies passes; a missing module is named and refused before starting', () => {
    const root = rootDir(); install(root, '1.0.0', GOOD); install(root, '1.0.1', GOOD, { 'js-yaml': '^4', 'left-pad': '1' });
    const d = (v) => path.join(root, 'projects', 'nexus', 'versions', v);
    assert.strictEqual(RT.preflight(d('1.0.0')).ok, true); const bad = RT.preflight(d('1.0.1')); assert.strictEqual(bad.ok, false); assert.deepStrictEqual(bad.needs, ['left-pad']); assert.match(bad.problems[0], /left-pad/);
    assert.match(RT.preflight(path.join(root, 'nope')).problems[0], /missing/);
  });
  await test('RT-02 start: runs the version with the project\'s data folder and COS\'s modules, reports healthy, then stop ends it', async () => {
    const root = rootDir(); install(root, '1.0.0', GOOD); const o = await opts(); const r = await RT.start(root, 'nexus', '1.0.0', o);
    assert.strictEqual(r.ok, true, JSON.stringify(r)); assert.ok(r.healthyAfterMs >= 0); const st = await RT.status(root, 'nexus'); assert.strictEqual(st.running, true); assert.strictEqual(st.healthy, true); assert.strictEqual(st.version, '1.0.0');
    assert.match(RT.logs(root, 'nexus').text, new RegExp('data=' + path.join(root, 'projects', 'nexus', 'data').replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')));
    const s = await RT.stop(root, 'nexus'); assert.strictEqual(s.ok, true); assert.strictEqual(s.stopped, true); assert.strictEqual((await RT.status(root, 'nexus')).running, false); assert.strictEqual(await RT.portsBusy([o.statusPort]).then(b => b.length), 0, 'the port is free again');
  });
  await test('RT-03 a second start while it runs is refused, and says which version is running', async () => {
    const root = rootDir(); install(root, '1.0.0', GOOD); const o = await opts(); await RT.start(root, 'nexus', '1.0.0', o);
    const again = await RT.start(root, 'nexus', '1.0.0', o); assert.strictEqual(again.ok, false); assert.strictEqual(again.reason, 'already-running'); assert.match(again.error, /1\.0\.0 is already running/); await RT.stop(root, 'nexus');
  });
  await test('RT-04 a port already in use is named; nothing is started', async () => {
    const root = rootDir(); install(root, '1.0.0', GOOD); const o = await opts(); const blocker = net.createServer(); await new Promise(ok => blocker.listen(o.statusPort, '127.0.0.1', ok));
    const r = await RT.start(root, 'nexus', '1.0.0', o); blocker.close(); assert.strictEqual(r.ok, false); assert.strictEqual(r.reason, 'port-busy'); assert.deepStrictEqual(r.busy, [o.statusPort]); assert.match(r.error, new RegExp(String(o.statusPort)));
    assert.strictEqual((await RT.status(root, 'nexus')).running, false);
  });
  await test('RT-05 a version that crashes on start fails fast with its last log lines', async () => {
    const root = rootDir(); install(root, '1.0.0', BAD); const t0 = Date.now(); const r = await RT.start(root, 'nexus', '1.0.0', await opts()); assert.strictEqual(r.ok, false); assert.strictEqual(r.reason, 'exited');
    assert.match(r.error, /code 3/); assert.match(r.error, /boom: config is wrong/); assert.ok(Date.now() - t0 < 6000, 'did not wait out the whole timeout'); assert.strictEqual((await RT.status(root, 'nexus')).running, false);
  });
  await test('RT-06 a version that runs but never answers is stopped after the timeout, with the reason', async () => {
    const root = rootDir(); install(root, '1.0.0', HUNG); const r = await RT.start(root, 'nexus', '1.0.0', await opts({ healthTimeoutMs: 1500 })); assert.strictEqual(r.ok, false); assert.strictEqual(r.reason, 'not-healthy');
    assert.match(r.error, /did not answer on :\d+ within 2 s/); assert.match(r.error, /starting\.\.\./); assert.strictEqual((await RT.status(root, 'nexus')).running, false, 'it was stopped, not left running');
  });
  await test('RT-07 preflight failure comes back as a reason from start, and no process is spawned', async () => {
    const root = rootDir(); install(root, '1.0.1', GOOD, { 'left-pad': '1' }); const r = await RT.start(root, 'nexus', '1.0.1', await opts()); assert.strictEqual(r.reason, 'preflight'); assert.deepStrictEqual(r.needs, ['left-pad']); assert.strictEqual(RT.readRun(root, 'nexus'), null);
  });
  await test('RT-08 stop ends the whole process tree, including a child the project started', async () => {
    const root = rootDir(); const CH = `const {spawn}=require('child_process');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});require('fs').writeFileSync(require('path').join(process.env.NEXUS_DATA_ROOT,'child.pid'),String(c.pid));` + GOOD;
    install(root, '1.0.0', CH); const o = await opts(); assert.strictEqual((await RT.start(root, 'nexus', '1.0.0', o)).ok, true); const cpid = +fs.readFileSync(path.join(root, 'projects', 'nexus', 'data', 'child.pid'), 'utf8');
    const alive = (p) => { try { process.kill(p, 0); } catch (_) { return false; } try { return !/^\d+ \(.*\) Z/.test(fs.readFileSync(`/proc/${p}/stat`, 'utf8')); } catch (_) { return true; } }; assert.ok(alive(cpid)); await RT.stop(root, 'nexus'); await new Promise(r => setTimeout(r, 400)); assert.strictEqual(alive(cpid), false, 'the grandchild is gone too');
  });
  await test('RT-09 old logs are pruned to the newest few, and stop on a project that is not running is a calm no-op', async () => {
    const root = rootDir(); install(root, '1.0.0', GOOD); const ld = path.join(root, 'projects', 'nexus', 'logs'); fs.mkdirSync(ld, { recursive: true }); for (let i = 0; i < 6; i++) fs.writeFileSync(path.join(ld, `0.0.${i}-old.log`), 'x');
    const o = await opts({ keepLogs: 3 }); await RT.start(root, 'nexus', '1.0.0', o); assert.ok(fs.readdirSync(ld).length <= 4); await RT.stop(root, 'nexus'); const s = await RT.stop(root, 'nexus'); assert.strictEqual(s.ok, true); assert.strictEqual(s.stopped, false);
  });
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
