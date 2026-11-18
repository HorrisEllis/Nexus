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

  b.shutdown({ by: 'test' });
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  ✗ threw', e.stack); process.exit(1); });
