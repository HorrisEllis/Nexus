'use strict';
/**
 * tests/modules/test-cos-hidden-windows.test.js — SC16: no console window per system (docs/2026-11-02-cos-console-phasemap.spec)
 * James, 2026-11-05: "keeps spamming my screen. any way to have those node.exe windows open in the background?"
 *
 *   HW-01  the supervisor starts a node system with windowsHide: true, and an Electron one (Clear Glass) with false, so its own window shows
 *   HW-02  every spawn in the supervisor, the door's test runner and core-duties hides its window
 *   HW-03  2026-11-05 ("getting spammed with command prompt from cos"): the watchdog's per-process read on Windows was one VISIBLE PowerShell
 *          per system per tick. Now one hidden call reads every process, cached for 2 s: 13 systems in a tick start one, not 13
 *   HW-04  2026-11-08 ("also can we have cos.exe run the command prompts in the background?"): Electron through node_modules/.bin/electron(.cmd)
 *          opened a node console beside Clear Glass's window. Both COS paths (the supervisor, the desktop starter) now start electron/dist's
 *          own program when it is there — no shell, no console — and the launcher only when it is not
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { EventEmitter } = require('events');
const ROOT = path.join(__dirname, '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-hw-'));
process.env.COS_MANAGER_DATA = path.join(tmp, 'data');
const { createSupervisor } = require(path.join(ROOT, 'cos/manager/supervisor.js'));

let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 4).join('\n    ')}`); failed++; } }

(async () => {
  console.log('\n⬢  COS: no console window per system (SC16)\n');
  await test('HW-01', 'a node system hidden; an Electron one keeps its window', async () => {
    const calls = [];
    const spawnFn = (cmd, args, o) => { calls.push({ cmd, o }); const p = new EventEmitter(); p.pid = 4242 + calls.length; p.stdout = new EventEmitter(); p.stderr = new EventEmitter(); p.kill = () => {}; return p; };
    const sup = createSupervisor({ root: tmp, ledgerFile: path.join(tmp, 'data', 'l.jsonl'), log: () => {}, spawnFn, policy: { stopGraceMs: 50 },
      declarations: [{ name: 'api', system: 'api', cmd: 'node', args: ['api/server.js'] }, { name: 'clear-glass', system: 'clear-glass', cmd: path.join(tmp, 'node_modules', 'electron', 'dist', 'electron.exe'), args: ['clear-glass'] }] });
    sup.start('api', { by: 'test' }); sup.start('clear-glass', { by: 'test' });
    const by = (n) => calls.find(c => (n === 'api' ? c.cmd === 'node' || /node/.test(c.cmd) : /electron/i.test(c.cmd)));
    assert.ok(by('api'), JSON.stringify(calls.map(c => c.cmd)));
    assert.strictEqual(by('api').o.windowsHide, true, 'the node system has no console window');
    assert.strictEqual(by('cg').o.windowsHide, false, 'Clear Glass keeps its window');
    sup.shutdown({ by: 'test' });
  });
  await test('HW-02', 'every spawn in the supervisor, the door\'s test runner and core-duties hides its window', () => {
    for (const f of ['cos/manager/supervisor.js', 'cos/manager/autopilot-door.js', 'cos/manager/duties.js']) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      const spawns = [...src.matchAll(/\b(spawnFn|spawn|spawnSync)\((?:[^()]|\([^()]*\))*\)/g)].map(m => m[0]).filter(x => !/^spawn\(\s*\)/.test(x) && /\{/.test(x));
      for (const sp of spawns) assert.match(sp, /windowsHide/, `${f}: ${sp.slice(0, 90)}`);
      assert.ok(spawns.length > 0, `${f} has spawns`);
    }
  });
  await test('HW-03', 'the watchdog\'s Windows read: one hidden PowerShell per tick for every system, not one window each', () => {
    const PS = require(path.join(ROOT, 'cos/watchdog/proc-stats.js'));
    const src = fs.readFileSync(path.join(ROOT, 'cos/watchdog/proc-stats.js'), 'utf8');
    assert.match(src, /execFileSync\('powershell'[\s\S]{0,300}windowsHide: true/, 'the PowerShell is hidden');
    PS._resetWinCache(); let calls = 0;
    const all = () => { calls++; return new Map([[101, { rssMB: 50, cpuTimeMs: 1000 }], [102, { rssMB: 70, cpuTimeMs: 2000 }]]); };
    for (let pid = 101; pid <= 113; pid++) PS.readWin32ProcStats(pid, { now: 1000, readAll: all });
    assert.strictEqual(calls, 1, `13 systems in one tick → ${calls} PowerShell starts`);
    assert.deepStrictEqual(PS.readWin32ProcStats(102, { now: 1500, readAll: all }), { rssMB: 70, cpuTimeMs: 2000 });
    PS.readWin32ProcStats(101, { now: 4000, readAll: all }); assert.strictEqual(calls, 2, 'read again after 2 s');
    assert.strictEqual(PS.readWin32ProcStats(999, { now: 4100, readAll: all }), null, 'a process that is gone reads as null');
    assert.match(fs.readFileSync(path.join(ROOT, 'cos/services/anonymous/nexus.js'), 'utf8'), /Win32_Process[\s\S]{0,200}windowsHide: true/);
  });
  await test('HW-04', 'Electron starts as its own program, not through the .cmd launcher: no node console beside its window', async () => {
    const dir = path.join(tmp, 'hw4'), bin = path.join(dir, 'node_modules', '.bin'), dist = path.join(dir, 'node_modules', 'electron', 'dist');
    fs.mkdirSync(bin, { recursive: true }); fs.mkdirSync(dist, { recursive: true });
    const exeName = process.platform === 'win32' ? 'electron.exe' : process.platform === 'darwin' ? 'Electron.app/Contents/MacOS/Electron' : 'electron';
    fs.mkdirSync(path.dirname(path.join(dist, exeName)), { recursive: true }); fs.writeFileSync(path.join(dist, exeName), ''); fs.writeFileSync(path.join(bin, 'electron'), ''); fs.writeFileSync(path.join(bin, 'electron.cmd'), '');
    const calls = []; const spawnFn = (cmd, args, o) => { calls.push({ cmd, o }); const p = new EventEmitter(); p.pid = 5000 + calls.length; p.stdout = new EventEmitter(); p.stderr = new EventEmitter(); p.kill = () => setImmediate(() => p.emit('exit', 0, null)); return p; };
    const sup = createSupervisor({ root: dir, ledgerFile: path.join(tmp, 'data', 'l4.jsonl'), log: () => {}, spawnFn, policy: { stopGraceMs: 50 },
      declarations: [{ name: 'clear-glass', system: 'clear-glass', cmd: 'electron', cmdCandidates: [path.join(bin, 'electron')], args: ['.'] }] });
    sup.start('clear-glass', { by: 'test' });
    const c = calls[0]; assert.ok(c, 'started');
    assert.strictEqual(c.cmd, path.join(dist, exeName), 'electron/dist\'s own program, not the .bin launcher: ' + c.cmd);
    assert.ok(!c.o.shell, 'no shell, so no console'); assert.strictEqual(c.o.windowsHide, false, 'its own window still shows');
    sup.shutdown({ by: 'test' });
    const ds = require(path.join(ROOT, 'cos/app/desktop-systems.js'));
    assert.strictEqual(ds.realElectron(path.join(bin, 'electron.cmd'), 'win32', (f) => /dist/.test(f)).endsWith(path.join('dist', 'electron.exe')), true, 'the desktop starter: the same');
    assert.strictEqual(ds.realElectron(path.join(bin, 'electron.cmd'), 'win32', () => false), path.join(bin, 'electron.cmd'), 'no dist: the launcher, as before');
    assert.strictEqual(ds.realElectron('node', 'win32', () => true), 'node', 'anything else: unchanged');
  });
  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exitCode = failed ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 300);
})();
