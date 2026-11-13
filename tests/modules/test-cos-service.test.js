'use strict';
/**
 * tests/modules/test-cos-service.test.js — Nexus's headless part as the Windows service NexusCOS (CA4, COS 0.5.0, Nexus 0.60.389)
 * James, 2026-11-04: "run in service with admin privilages for more control and power." · "run on startup with an option to disable."
 *
 *   SV-01  the install: every NSSM command exactly (LocalSystem, at boot, COS_SERVICE=1, logs rotated at 10 MB, restart after 2 s), one script, one
 *          admin approval; a reinstall starts clean; remove stops and removes
 *   SV-02  nssm.exe found (NSSM_EXE, next to COS, PATH) or said missing with where to put it — and nothing installed; not Windows → said
 *   SV-03  the status read from NSSM's words; apply installs then reads it; a declined approval is said
 *   SV-04  under COS_SERVICE=1 the supervisor leaves a windowed process (Electron: Clear Glass) to his session and says so; without it, it starts it
 *   SV-05  the COS window finds the windowed systems in his folder and starts the ones not already answering, in his session
 *   SV-07  the controller hands the service his linked folder, its entry and node; and the windowed systems from that folder
 *   SV-06  the setting runAsService (off by default, his switch); the exe's file list carries the new files; COS is 0.5.0
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 6).join('\n    ')}`); failed++; } }

(async () => {
  console.log('\n⬡  Nexus as the Windows service NexusCOS (CA4)\n');
  const SV = require(path.join(ROOT, 'cos/app/service.js'));
  const N = 'C:\\COS\\bin\\nssm.exe', NODE = 'C:\\Program Files\\nodejs\\node.exe', DIR = 'D:\\nexus';
  const ENTRY = `${DIR}\\lib\\nexus\\autopilot.js`, LOGS = `${DIR}\\data\\cos-service`;

  await test('SV-01', 'the install commands exactly, in one script with one approval; remove', () => {
    const c = SV.installCommands({ nssm: N, node: NODE, entry: ENTRY, dir: DIR, logDir: LOGS });
    const args = c.map(([cmd, a]) => { assert.strictEqual(cmd, N); return a.join(' '); });
    assert.deepStrictEqual(args.slice(0, 3), ['stop NexusCOS', 'remove NexusCOS confirm', `install NexusCOS ${NODE} ${ENTRY} --status-port=7799`]);
    for (const want of [`set NexusCOS AppDirectory ${DIR}`, 'set NexusCOS AppEnvironmentExtra COS_SERVICE=1 AUTOPILOT_STATUS_PORT=7799', 'set NexusCOS ObjectName LocalSystem',
      'set NexusCOS Start SERVICE_AUTO_START', `set NexusCOS AppStdout ${path.join(LOGS, 'service.log')}`, 'set NexusCOS AppRotateBytes 10485760', 'set NexusCOS AppRestartDelay 2000',
      'set NexusCOS AppExit Default Restart']) assert.ok(args.includes(want), `${want}\n${args.join('\n')}`);
    assert.strictEqual(args[args.length - 1], 'start NexusCOS');
    const b = SV.batch(c);
    assert.match(b, /^@echo off\r\n/);
    assert.match(b, /"C:\\COS\\bin\\nssm\.exe" "stop" "NexusCOS" >nul 2>&1\r\n/, 'a first install has nothing to stop: allowed to fail');
    assert.match(b, /"install" "NexusCOS" "C:\\Program Files\\nodejs\\node\.exe"[^\r]*\r\nif errorlevel 1 \(echo failed at step 3: install NexusCOS & exit \/b 12\)/);
    assert.deepStrictEqual(SV.removeCommands({ nssm: N }).map(([, a]) => a.join(' ')), ['stop NexusCOS', 'remove NexusCOS confirm']);
    assert.throws(() => SV.installCommands({ nssm: N }), /needs node/);
  });

  await test('SV-02', 'nssm.exe found in its places or said missing, nothing installed; not Windows said', async () => {
    const has = (set) => (f) => set.includes(f);
    assert.strictEqual(SV.findNssm({ env: { NSSM_EXE: 'E:\\tools\\nssm.exe' }, exists: has(['E:\\tools\\nssm.exe']), appDir: 'C:\\COS' }), 'E:\\tools\\nssm.exe');
    assert.strictEqual(SV.findNssm({ env: {}, exists: has([path.join('C:\\COS', 'bin', 'nssm.exe')]), appDir: 'C:\\COS' }), path.join('C:\\COS', 'bin', 'nssm.exe'));
    assert.strictEqual(SV.findNssm({ env: {}, exists: has(['C:\\Windows\\nssm.exe']), where: () => 'C:\\Windows\\nssm.exe', appDir: 'C:\\COS' }), 'C:\\Windows\\nssm.exe');
    assert.strictEqual(SV.findNssm({ env: {}, exists: () => false, where: () => null, appDir: 'C:\\COS' }), null);
    let ran = 0;
    const none = await SV.apply({ enable: true, nssm: null, node: NODE, entry: ENTRY, dir: DIR, platform: 'win32', runBatchElevated: async () => { ran++; return { ok: true }; } });
    assert.ok(!none.ok && /nssm\.exe was not found.*bin\\nssm\.exe.*Nothing was installed/.test(none.error) && ran === 0, JSON.stringify(none));
    const lin = await SV.apply({ enable: true, platform: 'linux' });
    assert.ok(!lin.ok && /Windows only/.test(lin.error));
    const nolink = await SV.apply({ enable: true, nssm: N, platform: 'win32', runBatchElevated: async () => { ran++; return { ok: true }; } });
    assert.ok(!nolink.ok && /link your Nexus folder first/.test(nolink.error) && ran === 0);
  });

  await test('SV-03', 'status from NSSM\'s words; apply installs then reads it; a declined approval said; off removes', async () => {
    assert.deepStrictEqual(['SERVICE_RUNNING', 'SERVICE_STOPPED\r\n', 'SERVICE_START_PENDING', "Can't open service!\nOpenService(): The specified service does not exist", 'x'].map(SV.parseStatus),
      ['running', 'stopped', 'starting', 'missing', 'unknown']);
    const st = await SV.status({ nssm: N, exec: async (cmd, a) => ({ code: 0, out: a.join(' ') === 'status NexusCOS' ? 'SERVICE_RUNNING\r\n' : '' }) });
    assert.deepStrictEqual([st.ok, st.state], [true, 'running']);
    const scripts = [];
    const ok = await SV.apply({ enable: true, nssm: N, node: NODE, entry: ENTRY, dir: DIR, logDir: LOGS, platform: 'win32', runBatchElevated: async (t) => { scripts.push(t); return { ok: true }; }, statusFn: async () => ({ state: 'running' }) });
    assert.deepStrictEqual([ok.ok, ok.via, ok.state, scripts.length], [true, 'service', 'running', 1], JSON.stringify(ok));
    assert.match(scripts[0], /"install" "NexusCOS"/);
    const declined = await SV.apply({ enable: true, nssm: N, node: NODE, entry: ENTRY, dir: DIR, platform: 'win32', runBatchElevated: async () => ({ ok: false, error: 'the admin approval was declined' }) });
    assert.deepStrictEqual([declined.ok, declined.error], [false, 'the admin approval was declined']);
    const off = await SV.apply({ enable: false, nssm: N, platform: 'win32', runBatchElevated: async (t) => { scripts.push(t); return { ok: true }; } });
    assert.deepStrictEqual([off.ok, off.via], [true, 'removed']);
    assert.match(scripts[1], /"remove" "NexusCOS" "confirm"/);
    assert.ok(!/"install"/.test(scripts[1]));
  });

  await test('SV-04', 'under COS_SERVICE=1 the supervisor leaves Clear Glass to his session, said; without it, starts it', async () => {
    const { createSupervisor, isWindowed } = require(path.join(ROOT, 'cos/manager/supervisor.js'));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sv04-'));
    const decls = [{ name: 'clear-glass', process: { cmd: 'electron', args: ['.'] }, cmd: 'electron', args: ['.'], cwd: tmp, phase: 3 },
      { name: 'loom', process: { cmd: 'node', args: ['loom/server.js'] }, cmd: 'node', args: ['loom/server.js'], cwd: tmp, phase: 1 }];
    assert.strictEqual(isWindowed(decls[0], { cmd: 'C:\\n\\node_modules\\.bin\\electron.cmd' }), true);
    assert.strictEqual(isWindowed(decls[1], { cmd: 'node' }), false);
    const run = (svc) => {
      const spawned = [];
      const prev = process.env.COS_SERVICE; if (svc) process.env.COS_SERVICE = '1'; else delete process.env.COS_SERVICE;
      const fake = () => { const { EventEmitter } = require('events'); const p = new EventEmitter(); p.pid = 4242; p.stdout = new EventEmitter(); p.stderr = new EventEmitter(); p.kill = () => {}; return p; };
      const sup = createSupervisor({ root: tmp, declarations: decls, ledgerFile: path.join(tmp, `l-${svc}.jsonl`), spawnFn: (cmd, args) => { spawned.push(cmd); return fake(); }, freeMemPct: () => 0.9, checkHealth: async () => false, log: () => {} });
      sup.start('clear-glass'); sup.start('loom');
      const cg = sup.get('clear-glass'); const led = sup.ledger({ system: 'clear-glass' }) || [];
      if (prev === undefined) delete process.env.COS_SERVICE; else process.env.COS_SERVICE = prev;
      try { sup.shutdown && sup.shutdown(); } catch (_) {}
      return { spawned, state: cg && cg.state, led: JSON.stringify(led) };
    };
    const s = run(true);
    assert.deepStrictEqual([s.spawned, s.state], [['node'], 'desktop'], JSON.stringify(s));
    assert.match(s.led, /has a window: under the Windows service it starts in your session/);
    const n = run(false);
    assert.ok(n.spawned.some(c => /electron/.test(c)) && n.spawned.includes('node'), JSON.stringify(n));
  });

  await test('SV-05', 'the windowed systems found in his folder and started when not already answering', async () => {
    const D = require(path.join(ROOT, 'cos/app/desktop-systems.js'));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sv05-'));
    const mk = (n, rt) => { fs.mkdirSync(path.join(tmp, n), { recursive: true }); fs.writeFileSync(path.join(tmp, n, 'compartment.json'), JSON.stringify({ runtime: rt })); };
    mk('clear-glass', { healthUrl: 'http://127.0.0.1:7704/health', process: { name: 'clear-glass', cmd: 'electron', args: ['.'], cwd: 'clear-glass', env: { GUARDIAN_DIR: '{{root}}/guardian' }, cmdCandidates: ['{{root}}/node_modules/.bin/electron'] } });
    mk('loom', { process: { name: 'loom', cmd: 'node', args: ['loom/server.js'] } });
    fs.mkdirSync(path.join(tmp, 'node_modules', '.bin'), { recursive: true }); fs.writeFileSync(path.join(tmp, 'node_modules', '.bin', 'electron'), '');
    const w = D.windowed(tmp);
    assert.deepStrictEqual(w.map(x => [x.name, x.cmd, x.args.join(' '), x.cwd, x.env.GUARDIAN_DIR]), [['clear-glass', `${tmp}/node_modules/.bin/electron`, '.', path.join(tmp, 'clear-glass'), `${tmp}/guardian`]]);
    const calls = [];
    const r = await D.startAll(tmp, { healthy: async () => false, spawn: (cmd, args, o) => { calls.push([cmd, args, o.detached, 'ELECTRON_RUN_AS_NODE' in o.env, 'COS_SERVICE' in o.env]); return { pid: 99, unref() {} }; } });
    assert.deepStrictEqual(r, [{ name: 'clear-glass', started: true, pid: 99 }]);
    assert.deepStrictEqual(calls[0].slice(2), [true, false, false], 'detached, a real Electron, not marked as the service');
    const again = await D.startAll(tmp, { healthy: async () => true, spawn: () => { throw new Error('must not start twice'); } });
    assert.deepStrictEqual(again, [{ name: 'clear-glass', started: false, why: 'already running' }]);
  });

  await test('SV-06', 'runAsService off by default, his switch; the exe carries the files; COS 0.5.0; the tray has the switch', () => {
    const S = require(path.join(ROOT, 'cos/app/settings.js'));
    assert.strictEqual(S.DEFAULTS.runAsService, false);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sv06-'));
    assert.strictEqual(S.set(tmp, 'runAsService', true).settings.runAsService, true);
    assert.match(S.set(tmp, 'runAsService', 'maybe').error, /true or false/);
    const B = fs.readFileSync(path.join(ROOT, 'scripts/build-cos-app.js'), 'utf8');
    for (const f of ['cos/app/service.js', 'cos/app/desktop-systems.js']) assert.ok(B.includes(`'${f}'`), f);
    const [maj, min] = require(path.join(ROOT, 'cos/app/version.js')).version.split('.').map(Number); assert.ok(maj > 0 || min >= 5, 'COS 0.5.0 or later carries the service');
    const M = fs.readFileSync(path.join(ROOT, 'cos/app/desktop/main.js'), 'utf8');
    assert.match(M, /Run Nexus as a Windows service \(admin, at boot\)/);
    assert.match(M, /if \(serviceOn\(\) && ctl\.linkedDir\(\)\)/);
  });

  await test('SV-07', 'the controller hands the service his linked folder, its entry and node; the windowed systems from that folder', async () => {
    const { Controller } = require(path.join(ROOT, 'cos/app/controller.js'));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sv07-')); fs.mkdirSync(path.join(dir, 'lib', 'nexus'), { recursive: true }); fs.writeFileSync(path.join(dir, 'lib', 'nexus', 'autopilot.js'), '');
    const store = { list: () => [{ project: 'nexus', linked: { present: true, dir } }] };
    const rt = { ENTRIES: ['lib/nexus/autopilot.js'], nodeBinary: () => 'C:\\node.exe' };
    const c = new Controller({ root: fs.mkdtempSync(path.join(os.tmpdir(), 'sv07r-')), store, rt });
    let got = null;
    const r = await c.applyService(true, { service: { apply: async (o) => { got = o; return { ok: true, via: 'service', state: 'running' }; } } });
    assert.deepStrictEqual([r.ok, got.enable, got.dir, got.entry, got.node, got.logDir], [true, true, dir, path.join(dir, 'lib', 'nexus', 'autopilot.js'), 'C:\\node.exe', path.join(dir, 'data', 'cos-service')]);
    const w = await c.startWindowed('nexus', { desktop: { startAll: async (d) => [{ name: 'clear-glass', started: true, dir: d }] } });
    assert.deepStrictEqual(w, [{ name: 'clear-glass', started: true, dir }]);
    const none = new Controller({ root: fs.mkdtempSync(path.join(os.tmpdir(), 'sv07n-')), store: { list: () => [] }, rt });
    assert.deepStrictEqual(await none.startWindowed(), []);
  });

  // ── CA8 (COS 0.9.0) — James, 2026-11-13: "need to build it from scratch." COS's own service host, cos-svc.exe, in place of nssm.exe ──
  const H = 'C:\\COS\\resources\\app\\cos\\app\\bin\\cos-svc.exe';
  await test('SV-08', 'COS\'s own host: found in its places; what it runs is one config (NSSM\'s settings, plus the health rule); the commands exactly', () => {
    const has = (set) => (f) => set.includes(f);
    assert.strictEqual(SV.findHost({ env: { COS_SVC_EXE: 'E:\\x\\cos-svc.exe' }, exists: has(['E:\\x\\cos-svc.exe']), here: 'C:\\a', appDir: 'C:\\COS' }), 'E:\\x\\cos-svc.exe');
    assert.strictEqual(SV.findHost({ env: {}, exists: has([path.join('C:\\a', 'bin', 'cos-svc.exe')]), here: 'C:\\a', appDir: 'C:\\COS' }), path.join('C:\\a', 'bin', 'cos-svc.exe'));
    assert.strictEqual(SV.findHost({ env: {}, exists: () => false, here: 'C:\\a', appDir: 'C:\\COS' }), null);
    const c = SV.hostConfig({ node: NODE, entry: ENTRY, dir: DIR, logDir: LOGS });
    assert.deepStrictEqual([c.name, c.node, c.entry, c.args, c.dir, c.logDir, c.env, c.rotateBytes, c.restartDelayMs, c.maxDelayMs, c.healthUrl, c.healthFails],
      ['NexusCOS', NODE, ENTRY, ['--status-port=7799'], DIR, LOGS, { COS_SERVICE: '1', AUTOPILOT_STATUS_PORT: '7799' }, 10485760, 2000, 30000, 'http://127.0.0.1:7799/api/cos/health', 3]);
    assert.throws(() => SV.hostConfig({ node: NODE }), /needs entry/);
    const cfg = path.join(LOGS, 'service.json');
    assert.deepStrictEqual(SV.hostInstallCommands({ host: H, configFile: cfg }).map(([cmd, a]) => { assert.strictEqual(cmd, H); return a.join(' '); }),
      ['stop NexusCOS', 'remove NexusCOS confirm', `install ${cfg}`, 'start NexusCOS']);
    assert.deepStrictEqual(SV.hostRemoveCommands({ host: H }).map(([, a]) => a.join(' ')), ['stop NexusCOS', 'remove NexusCOS confirm']);
    const b = SV.batch(SV.hostInstallCommands({ host: H, configFile: cfg }));
    assert.match(b, /cos-svc\.exe" "stop" "NexusCOS" >nul 2>&1\r\n/, 'a first install has nothing to stop: allowed to fail');
    assert.match(b, /cos-svc\.exe" "install" "[^"]*service\.json"\r\nif errorlevel 1 \(echo failed at step 3: install [^\r]* & exit \/b 12\)/);
  });

  await test('SV-09', 'apply uses COS\'s own host before nssm.exe, writes its config, reads its status; off removes through it; neither found is said', async () => {
    const scripts = [], written = [];
    const on = await SV.apply({ enable: true, node: NODE, entry: ENTRY, dir: DIR, logDir: LOGS, platform: 'win32', findHostFn: () => H, findFn: () => { throw new Error('nssm must not be looked for when the host is there'); },
      writeConfig: (f, o) => written.push([f, o]), runBatchElevated: async (t) => { scripts.push(t); return { ok: true }; }, statusFn: async ({ nssm }) => ({ state: nssm === H ? 'running' : 'unknown' }) });
    assert.deepStrictEqual([on.ok, on.via, on.by, on.state, on.host, scripts.length], [true, 'service', 'cos-svc', 'running', H, 1], JSON.stringify(on));
    assert.deepStrictEqual([written[0][0], written[0][1].entry, written[0][1].env.COS_SERVICE], [path.join(LOGS, 'service.json'), ENTRY, '1']);
    assert.ok(/cos-svc\.exe" "install"/.test(scripts[0]) && !/nssm/.test(scripts[0]));
    const off = await SV.apply({ enable: false, platform: 'win32', findHostFn: () => H, runBatchElevated: async (t) => { scripts.push(t); return { ok: true }; } });
    assert.deepStrictEqual([off.ok, off.via, off.by], [true, 'removed', 'cos-svc']);
    assert.ok(/cos-svc\.exe" "remove" "NexusCOS"/.test(scripts[1]) && !/"install"/.test(scripts[1]));
    const fallback = await SV.apply({ enable: true, node: NODE, entry: ENTRY, dir: DIR, logDir: LOGS, platform: 'win32', findHostFn: () => null, findFn: () => N, runBatchElevated: async (t) => { scripts.push(t); return { ok: true }; }, statusFn: async () => ({ state: 'running' }) });
    assert.deepStrictEqual([fallback.ok, fallback.by, fallback.nssm], [true, 'nssm', N]);
    let ran = 0;
    const neither = await SV.apply({ enable: true, node: NODE, entry: ENTRY, dir: DIR, platform: 'win32', findHostFn: () => null, findFn: () => null, runBatchElevated: async () => { ran++; return { ok: true }; } });
    assert.ok(!neither.ok && /cos-svc\.exe\) is missing.*Nothing was installed/.test(neither.error) && ran === 0, JSON.stringify(neither));
    const cant = await SV.apply({ enable: true, node: NODE, entry: ENTRY, dir: DIR, platform: 'win32', findHostFn: () => H, writeConfig: () => { throw new Error('disk full'); }, runBatchElevated: async () => { ran++; return { ok: true }; } });
    assert.ok(!cant.ok && /could not be written.*disk full.*Nothing was installed/.test(cant.error) && ran === 0, JSON.stringify(cant));
  });

  await test('SV-10', 'the host ships: its source, its build script, the built exe matching its SHA256, in the exe\'s file list; COS 0.9.0 or later', () => {
    for (const f of ['cos/app/service-host/cos-svc.cs', 'cos/app/service-host/build.cmd', 'cos/app/bin/cos-svc.exe', 'cos/app/bin/cos-svc.exe.sha256']) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
    const sum = require('crypto').createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'cos/app/bin/cos-svc.exe'))).digest('hex');
    assert.strictEqual(fs.readFileSync(path.join(ROOT, 'cos/app/bin/cos-svc.exe.sha256'), 'utf8').trim().split(/\s+/)[0], sum, 'the exe is the one build.cmd wrote');
    const B = fs.readFileSync(path.join(ROOT, 'scripts/build-cos-app.js'), 'utf8');
    for (const f of ['cos/app/bin/cos-svc.exe', 'cos/app/bin/cos-svc.exe.sha256']) assert.ok(B.includes(`'${f}'`), f);
    const [maj, min] = require(path.join(ROOT, 'cos/app/version.js')).version.split('.').map(Number); assert.ok(maj > 0 || min >= 9, 'COS 0.9.0 or later carries its own host');
    const src = fs.readFileSync(path.join(ROOT, 'cos/app/service-host/cos-svc.cs'), 'utf8');
    for (const verb of ['install', 'start', 'stop', 'remove', 'status', 'run', 'console']) assert.ok(src.includes(`case "${verb}":`), verb);
  });

  if (process.platform === 'win32') await test('SV-11', 'on Windows, the built host really runs: starts the process with its env and arguments, logs it, starts it again with a growing delay, ends it on stop; status says a missing service', async () => {
    const { spawnSync } = require('child_process');
    const exe = path.join(ROOT, 'cos/app/bin/cos-svc.exe');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sv11-'));
    fs.writeFileSync(path.join(tmp, 'child.js'), "console.log('up', process.env.COS_SERVICE, process.argv.slice(2).join('|')); console.error('err line'); setTimeout(() => process.exit(7), 400);");
    const cfg = path.join(tmp, 'service.json');
    fs.writeFileSync(cfg, JSON.stringify({ name: 'CosSvcTest', node: process.execPath, entry: path.join(tmp, 'child.js'), args: ['--status-port=7799', 'two words'], dir: tmp, env: { COS_SERVICE: '1' }, logDir: path.join(tmp, 'logs'), restartDelayMs: 200, maxDelayMs: 800 }));
    const r = spawnSync(exe, ['console', cfg, '3500'], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
    assert.strictEqual(r.status, 0, r.stderr);
    const out = fs.readFileSync(path.join(tmp, 'logs', 'service.log'), 'utf8').trim().split(/\r?\n/);
    assert.ok(out.length >= 3 && out.every(l => l === 'up 1 --status-port=7799|two words'), JSON.stringify(out));
    assert.match(fs.readFileSync(path.join(tmp, 'logs', 'service-error.log'), 'utf8'), /err line/);
    const host = fs.readFileSync(path.join(tmp, 'logs', 'service-host.log'), 'utf8');
    assert.ok(/exit 7\).*again in 200 ms/.test(host) && /again in 400 ms/.test(host) && /again in 800 ms/.test(host) && /stopped\s*$/.test(host), host);
    const st = spawnSync(exe, ['status', 'CosSvcTest'], { encoding: 'utf8', windowsHide: true });
    assert.deepStrictEqual([st.status, SV.parseStatus(st.stdout)], [3, 'missing']);
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exitCode = failed ? 1 : 0;
})();
