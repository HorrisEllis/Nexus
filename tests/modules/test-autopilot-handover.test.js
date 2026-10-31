'use strict';
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-autopilot-handover.test.js — MG17, 0.60.330. Spec: cos/spec/cos-manager.spec MOD-MG-AUTOPILOT-HANDOVER, MOD-MG-CORE-DUTIES.
 * James, 2026-10-31: "Starting the mg-17". Map: docs/2026-10-24-cos-manager-phasemap.spec MG17_autopilot_hands_over, MG_D15.
 *   AH-01 the launcher boots a fixture tree through COS's manager: one supervisor (its pid is the manager's, a child of the launcher), the
 *         fixture system up on the door's /status, a 'handover' ledger line naming the version; SIGTERM stops the manager and the system
 *   AH-02 a second launcher on the same port finds the manager and starts nothing (no second supervisor, the same pid)
 *   AH-03 an old autopilot holding the port is refused, exit 1, said
 *   AH-04 core's duties: the snapshot keeps autopilot's keys; COS's ledger lines → one gap per circuit-open, one diagnostic per stall, once
 *   AH-05 COS's runtime tells a release that hands over from one that supervises itself
 */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const LAUNCHER = path.join(ROOT, 'lib/nexus/autopilot.js');
const duties = require(path.join(ROOT, 'lib/nexus/core-duties.js'));
const { supervisorOf } = require(path.join(ROOT, 'cos/app/runtime.js'));
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 3).join('\n    ')}`); failed++; } }
const freePort = () => new Promise(r => { const s = http.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const get = (port, p) => new Promise((ok) => { const r = http.get({ host: '127.0.0.1', port, path: p, timeout: 2000 }, (res) => { let t = ''; res.on('data', c => t += c); res.on('end', () => { try { ok(JSON.parse(t)); } catch (_) { ok(null); } }); }); r.on('error', () => ok(null)); r.on('timeout', () => { r.destroy(); ok(null); }); });
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (_) { return false; } };
const until = async (fn, ms = 15000) => { const t = Date.now() + ms; while (Date.now() < t) { const v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 150)); } return null; };
function launch(args) { const c = spawn(process.execPath, [LAUNCHER, ...args], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }); c.out = ''; c.stdout.on('data', d => c.out += d); c.stderr.on('data', d => c.out += d); c.done = new Promise(r => c.on('exit', (code) => r(code))); return c; }

(async () => {
  console.log('\n⬡  autopilot hands over to COS (MG17)\n');
  const fx = fs.mkdtempSync(path.join(os.tmpdir(), 'mg17-'));
  const svcPort = await freePort(), port = await freePort();
  fs.mkdirSync(path.join(fx, 'svc')); fs.writeFileSync(path.join(fx, 'svc', 'ok.js'), "require('http').createServer((q,s)=>s.end('{\"ok\":true}')).listen(Number(process.argv[2]),'127.0.0.1');");
  fs.writeFileSync(path.join(fx, 'svc', 'compartment.json'), JSON.stringify({ name: 'svc', runtime: { process: { name: 'svc', cmd: process.execPath, args: ['{{root}}/svc/ok.js', String(svcPort)], phase: 1, healthUrl: `http://127.0.0.1:${svcPort}/health` } } }));
  const env = ['--root=' + fx, `--status-port=${port}`, '--no-duties'];
  let first = null;
  try {
    await test('AH-01', 'the launcher boots a fixture through COS\'s manager: one supervisor, the system up, the handover ledgered, SIGTERM stops all', async () => {
      first = launch(env);
      const h = await until(() => get(port, '/api/cos/health').then(b => b && b.service === 'cos-manager' && b));
      assert.ok(h, `COS's manager never answered:\n${first.out}`);
      assert.notStrictEqual(h.pid, first.pid, 'the launcher is not the supervisor; the manager is its own process');
      const st = await until(() => get(port, '/status').then(b => b && b.kernels && b.kernels.svc && b.kernels.svc.status === 'online' && b));
      assert.ok(st, `the fixture system never came up on the door's /status:\n${first.out}`);
      const pidSvc = st.kernels.svc.pid; assert.ok(pidSvc && alive(pidSvc));
      const led = await get(port, '/api/cos/ledger?limit=50');
      const ho = led.entries.find(e => e.kind === 'handover');
      assert.ok(ho && /autopilot 0\.\d+\.\d+ handed supervision to COS/.test(ho.why), JSON.stringify(led.entries.map(e => e.kind)));
      assert.ok(led.entries.some(e => e.kind === 'spawn' && e.system === 'svc' && e.by === 'boot'), 'the boot spawned it, by boot');
      first.svcPid = pidSvc; first.managerPid = h.pid;
    });

    await test('AH-02', 'a second launcher on the same port finds the manager and starts nothing', async () => {
      const second = launch(env); const code = await second.done;
      assert.strictEqual(code, 0, second.out); assert.match(second.out, /already running/);
      assert.strictEqual((await get(port, '/api/cos/health')).pid, first.managerPid, 'the same manager answers');
    });

    await test('AH-01b', 'SIGTERM to the launcher stops the manager and every system it supervises', async () => {
      first.kill('SIGTERM'); const code = await first.done; assert.strictEqual(code, 0, first.out);
      assert.ok(await until(() => !alive(first.managerPid) && !alive(first.svcPid), 8000), 'the manager or the system outlived the launcher');
    });

    await test('AH-03', 'an old autopilot holding the port is refused, exit 1, said', async () => {
      const p = await freePort(); const old = http.createServer((q, s) => { s.setHeader('Content-Type', 'application/json'); s.end(q.url === '/status' ? '{"ok":true,"kernels":{}}' : '{"error":"not found"}'); }).listen(p, '127.0.0.1');
      await new Promise(r => old.once('listening', r));
      const l = launch(['--root=' + fx, `--status-port=${p}`, '--no-duties']); const code = await l.done; old.close();
      assert.strictEqual(code, 1); assert.match(l.out, /old autopilot .* holds :\d+.*second supervisor/s);
    });

    await test('AH-04', 'core\'s duties: autopilot\'s snapshot keys; one gap per circuit-open, one diagnostic per stall, each line once', async () => {
      const arch = fs.readFileSync(path.join(ROOT, 'lib/nexus/autopilot.retired-0.60.330.js'), 'utf8');
      const block = arch.slice(arch.indexOf("type: 'autopilot.instance_snapshot'"), arch.indexOf("source: 'autopilot', causedBy: null, ts: Date.now(),\n    });"));
      const keys = [...block.matchAll(/^\s{8}(\w+)[,:]/gm)].map(m => m[1]);
      assert.ok(keys.length >= 9, keys.join(' '));
      const snap = duties.snapshot([{ name: 'a', state: 'up', pid: 11, restarts: { count: 2 } }, { name: 'b', state: 'down', pid: null, restarts: { count: 1 } }], () => ({ 11: 300 }));
      assert.deepStrictEqual(Object.keys(snap).sort(), keys.sort());
      assert.deepStrictEqual([snap.systemsRunning, snap.totalRestarts, snap.topConsumer], [1, 3, { system: 'a', mb: 300 }]);
      // a fake COS: the routes core-duties reads, nothing else
      const lines = [{ id: 'x1', ts: Date.now(), kind: 'circuit-open', system: 'a', why: '6 crashes in 5 min' }, { id: 'x2', ts: Date.now(), kind: 'health', system: 'b', why: 'phase 2: no health within 30s — boot goes on, said' },
        { id: 'x3', ts: Date.now(), kind: 'crash', system: 'a', why: 'exited' }];
      const cp = await freePort();
      const cos = http.createServer((q, s) => { s.setHeader('Content-Type', 'application/json'); s.end(JSON.stringify(q.url.startsWith('/api/cos/ledger') ? { ok: true, entries: lines } : { ok: true, systems: [{ name: 'a', state: 'up', pid: process.pid, restarts: { count: 0 } }] })); }).listen(cp, '127.0.0.1');
      await new Promise(r => cos.once('listening', r));
      const got = { snap: [], gap: [], diag: [] };
      const d = duties.start({ base: `http://127.0.0.1:${cp}`, log: () => {}, wireIn: false, snapshotMs: 1e9, followMs: 1e9,
        sinks: { writeSnapshot: (p) => got.snap.push(p), reportGap: (s) => got.gap.push(s), runDiagnostic: async (s) => { got.diag.push(s); } } });
      await d.tick(); await d.tick(); d.stop(); cos.close();
      assert.ok(got.snap.length >= 2 && got.snap[0].perSystem.a.status === 'up', JSON.stringify(got.snap[0]));
      assert.deepStrictEqual(got.gap, ['a'], 'one gap for the one circuit-open line, however many ticks');
      assert.deepStrictEqual(got.diag, ['b'], 'one diagnostic for the one stall line');
    });

    await test('AH-05', 'COS\'s runtime tells a release that hands over (0.60.330 on) from one that supervises itself', async () => {
      const r = fs.mkdtempSync(path.join(os.tmpdir(), 'mg17-rel-'));
      assert.strictEqual(supervisorOf(r), 'autopilot');
      fs.mkdirSync(path.join(r, 'cos', 'manager'), { recursive: true }); fs.writeFileSync(path.join(r, 'cos', 'manager', 'server.js'), '');
      fs.mkdirSync(path.join(r, 'lib', 'nexus'), { recursive: true }); fs.writeFileSync(path.join(r, 'lib', 'nexus', 'core-duties.js'), '');
      assert.strictEqual(supervisorOf(r), 'cos-manager');
      assert.strictEqual(supervisorOf(ROOT), 'cos-manager', 'this tree hands over');
      fs.rmSync(r, { recursive: true, force: true });
    });
  } finally {
    if (first && first.exitCode === null) first.kill('SIGKILL');
    for (const p of [first && first.managerPid, first && first.svcPid]) if (p && alive(p)) try { process.kill(p, 'SIGKILL'); } catch (_) {}
    try { fs.rmSync(fx, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
