'use strict';
// tests/modules/test-cos-outlive.test.js — MG15 outlive (docs/2026-10-24-cos-manager-phasemap.spec, addendum 2026-11-18).
// James, 2026-11-18: "coupled. thats going to kill nexus." · "yes the node instances should be hooked into the service, until emerge.exe is doned" ·
// "system states saved as a node file, crash reverts them back to the most recent one."
// A real child process: started by one supervisor, its log read from a file, handed over, adopted by a second supervisor, then stopped.
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { createSupervisor } = require(path.join(ROOT, 'cos', 'manager', 'supervisor.js'));
let pass = 0, fail = 0;
const check = (n, ok, why) => { if (ok) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, why || ''); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 8000) { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await wait(100); } return fn(); }
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-outlive-'));
  const script = path.join(dir, 'ticker.js');
  fs.writeFileSync(script, "let n = 0; setInterval(() => console.log('tick ' + (++n)), 150);\n");
  const decl = { name: 'ticker', system: 'ticker', cmd: process.execPath, args: [script], cwd: dir };
  const opts = { root: dir, declarations: [decl], ledgerFile: path.join(dir, 'manager', 'ledger.jsonl'), policy: { outlive: true }, log: () => {} };

  const a = createSupervisor(opts);
  await a.boot();
  const pid = a.get('ticker').pid;
  check('MG15-1 a system writes to its own log file, read back as it grows', await until(() => a.logs('ticker').some((l) => /tick \d+/.test(l.line))) && fs.existsSync(path.join(dir, 'manager', 'logs', 'ticker.out.log')), JSON.stringify(a.logs('ticker').slice(-2)));
  const state = JSON.parse(fs.readFileSync(path.join(dir, 'manager', 'state', 'running.node'), 'utf8'));
  check('MG15-2 the running systems kept as a node file (and the last ones)', state.type === 'cos-running' && state.payload.systems.ticker.pid === pid && fs.readdirSync(path.join(dir, 'manager', 'state')).some((f) => /^running-\d+\.node$/.test(f)), JSON.stringify(state).slice(0, 200));

  a.handOver({ by: 'test' });
  await wait(600);
  check('MG15-3 a hand-over leaves the system running', alive(pid));

  const b = createSupervisor(opts);
  const boot = await b.boot();
  check('MG15-4 the next supervisor adopts it: same pid, up, not started again', b.get('ticker').pid === pid && b.get('ticker').state === 'up' && b.ledger({ limit: 20 }).some((e) => e.kind === 'adopted' && e.system === 'ticker'), JSON.stringify(b.get('ticker')));
  const before = b.logs('ticker').length;
  check('MG15-5 the adopted system\'s new lines reach the new supervisor', await until(() => b.logs('ticker').length > before && b.logs('ticker').some((l) => /tick \d+/.test(l.line))));

  b.stop('ticker', { by: 'test' });
  check('MG15-6 an adopted system is stopped by its pid', await until(() => !alive(pid), 8000) && await until(() => b.get('ticker').state === 'stopped', 4000), b.get('ticker').state);

  // MG15b (0.60.579): a system missing from running.node whose port is held by a live process is adopted, never a second copy started
  const held = require('child_process').spawn(process.execPath, ['-e', "const s=require('http').createServer((q,r)=>r.end('{}')).listen(0,'127.0.0.1',()=>console.log(s.address().port))"]);
  const port = await new Promise((r) => held.stdout.once('data', (b) => r(Number(String(b).trim()))));
  let spawned = 0; const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-port-'));
  const c = createSupervisor({ root: d2, declarations: [{ name: 'holder', cmd: process.execPath, args: ['-e', 'setTimeout(()=>{},1e6)'], healthUrl: `http://127.0.0.1:${port}/health`, onDemand: true }],
    ledgerFile: path.join(d2, 'ledger.jsonl'), policy: { outlive: true }, log: () => {}, spawnFn: (...x) => { spawned++; return require('child_process').spawn(...x); } });
  c.start('holder', { by: 'test' });
  check('MG15-7 a port already held is adopted, not started again', process.platform !== 'win32' || (await until(() => c.get('holder').state === 'up', 6000) && c.get('holder').pid === held.pid && spawned === 0), JSON.stringify({ spawned, st: c.get('holder').state, pid: c.get('holder').pid, held: held.pid }));
  c.shutdown({ by: 'test' }); held.kill(); try { fs.rmSync(d2, { recursive: true, force: true }); } catch (_) {}
  // MG15c (0.60.580): a holder that does not answer (busy) is kept as degraded, never stopped
  const mute = require('child_process').spawn(process.execPath, ['-e', "const s=require('http').createServer(()=>{}).listen(0,'127.0.0.1',()=>console.log(s.address().port))"]);
  const mport = await new Promise((r) => mute.stdout.once('data', (b) => r(Number(String(b).trim()))));
  const d3 = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-busy-'));
  const m = createSupervisor({ root: d3, declarations: [{ name: 'busy', cmd: process.execPath, args: ['-e', 'setTimeout(()=>{},1e6)'], healthUrl: `http://127.0.0.1:${mport}/health`, onDemand: true }],
    ledgerFile: path.join(d3, 'ledger.jsonl'), policy: { outlive: true, busyAfterMs: 500 }, log: () => {}, checkHealth: async () => false });
  m.start('busy', { by: 'test' });
  await until(() => m.ledger({ limit: 20 }).some((e) => e.kind === 'adopted-busy'), 6000); await wait(1500);
  check('MG15-8 a holder that does not answer is kept as degraded, not stopped', process.platform !== 'win32' || (alive(mute.pid) && m.get('busy').pid === mute.pid && m.get('busy').state === 'degraded'), JSON.stringify({ st: m.get('busy').state, alive: alive(mute.pid) }));
  m.shutdown({ by: 'test' }); mute.kill(); try { fs.rmSync(d3, { recursive: true, force: true }); } catch (_) {}
  b.shutdown({ by: 'test' });
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  ✗ threw', e.stack); process.exit(1); });
