'use strict';
// ── autopilot.js — the launcher that hands supervision to COS (MG17, 0.60.330) ─────────────────────────────────────────────────────
// UUID: nexus-autopilot-v1-0000-4000-0000-000000000001
// Spec: cos/spec/cos-manager.spec MOD-MG-AUTOPILOT-HANDOVER · Map: docs/2026-10-24-cos-manager-phasemap.spec MG17_autopilot_hands_over, MG_D15
//
// James, 2026-10-30: "This will be the new orchastrator/autopilot." · 2026-10-31: "lets do the orchastration. that needs to be done
// completely." · "Starting the mg-17".
//
// Until 0.60.330 this file was the supervisor. Its body is archived beside it (autopilot.retired-0.60.330.js, §0.3), and COS's manager
// (cos/manager/server.js) is the one supervisor. This launcher supervises nothing (§10.3):
//   1. finds COS's manager on the port, or starts it (`node cos/manager/server.js --handover=<version>`), and proves the one answering is
//      the one it started (its pid) — GATE-MG17-001/002;
//   2. refuses to start beside an old autopilot holding the port (it answers /status, not /api/cos/health) — no second supervisor;
//   3. asks the manager to boot (POST /api/cos/boot, --only as the boot set), then runs core's duties (lib/nexus/core-duties.js);
//   4. stays in the foreground as `npm run start:all` always did: the logs here, Ctrl+C stops every system. --detach starts, says where, exits.
// It reaches COS by its routes; the only thing it knows of COS's files is the server's path, to start it.
//
// Usage: node lib/nexus/autopilot.js [--only=cortex,guardian] [--status-port=7799] [--cli] [--detach] [--no-duties]
//        node lib/nexus/autopilot.js --duties-only        (core's duties against a manager already running; what --detach leaves behind)
//        node lib/nexus/autopilot.js --legacy-supervisor  (runs the archived supervisor: undoes the handover without a release, said loudly)

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const net = require('net');

const ROOT = path.join(__dirname, '..', '..');
const MANAGER = path.join(ROOT, 'cos', 'manager', 'server.js');
const ARCHIVE = path.join(__dirname, 'autopilot.retired-0.60.330.js');
const VERSION = (() => { try { return require('../version.js').system || null; } catch (_) { return null; } })();

function parseArgs(argv) {
  const val = (k) => { const a = argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
  const port = val('status-port') ?? process.env.AUTOPILOT_STATUS_PORT ?? process.env.COS_MANAGER_PORT ?? '7799';
  return { only: val('only') ? val('only').split(',').map(s => s.trim()).filter(Boolean) : null, port: parseInt(port, 10), root: val('root'),
    cli: argv.includes('--cli'), detach: argv.includes('--detach'), duties: !argv.includes('--no-duties'), dutiesOnly: argv.includes('--duties-only'),
    legacy: argv.includes('--legacy-supervisor') };
}

function ask(port, method, p, body = null, timeoutMs = 1500) {
  return new Promise((ok) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ host: '127.0.0.1', port, path: p, method, timeout: timeoutMs, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} }, (res) => {
      let t = ''; res.on('data', c => t += c); res.on('end', () => { let b = null; try { b = JSON.parse(t); } catch (_) {} ok({ code: res.statusCode, body: b }); });
    });
    req.on('error', () => ok(null)); req.on('timeout', () => { req.destroy(); ok(null); });
    if (data) req.write(data); req.end();
  });
}
const portFree = (port) => new Promise((ok) => { const s = net.createServer(); s.once('error', () => ok(false)); s.listen(port, '127.0.0.1', () => s.close(() => ok(true))); });

/** who(port) → 'cos' (COS's manager answers), 'autopilot' (an old supervisor: /status, no /api/cos/health), 'other' (held, neither), 'free' */
async function who(port) {
  const h = await ask(port, 'GET', '/api/cos/health');
  if (h && h.code === 200 && h.body && h.body.service === 'cos-manager') return { is: 'cos', pid: h.body.pid || null };
  const s = await ask(port, 'GET', '/status');
  if (s && s.code === 200 && s.body && s.body.kernels) return { is: 'autopilot' };
  return { is: (await portFree(port)) ? 'free' : 'other' };
}

function legacy(o) {
  console.error('[autopilot] ⚠ --legacy-supervisor: running the RETIRED supervisor (autopilot.retired-0.60.330.js), not COS\'s manager. The handover is undone for this run only.');
  const args = process.argv.slice(2).filter(a => a !== '--legacy-supervisor');
  const child = spawn(process.execPath, [ARCHIVE, ...args], { cwd: ROOT, stdio: 'inherit' });
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { try { child.kill(sig); } catch (_) {} });
  child.on('exit', (code) => process.exit(code ?? 1));
}

async function waitHealthy(port, child, ms = 20000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (child && child.exitCode !== null) return { ok: false, why: `COS's manager exited during start (code ${child.exitCode})` };
    const w = await who(port);
    if (w.is === 'cos') return w.pid && child && w.pid !== child.pid ? { ok: false, why: `another COS manager (pid ${w.pid}) answered on :${port}, not the one started (pid ${child.pid})` } : { ok: true, pid: w.pid };
    await new Promise(r => setTimeout(r, 200));
  }
  return { ok: false, why: `COS's manager did not answer /api/cos/health on :${port} within ${ms / 1000}s` };
}

function startDuties(o, log) {
  if (!o.duties) { log('core\'s duties not started (--no-duties)'); return { stop() {} }; }
  try { return require('./core-duties.js').start({ base: `http://127.0.0.1:${o.port}`, log }); }
  catch (e) { log(`⚠ core's duties could not start: ${e.message} — COS still supervises; the vitals check, updates and snapshots do not run`); return { stop() {} }; }
}

async function main(o = parseArgs(process.argv.slice(2))) {
  const log = (s) => console.log(`[autopilot] ${s}`);
  if (o.legacy) return legacy(o);
  if (!Number.isFinite(o.port) || o.port <= 0) { console.error('[autopilot] a port is needed: COS\'s manager has no headless mode without one'); process.exit(2); }

  const found = await who(o.port);
  if (o.dutiesOnly) {
    if (found.is !== 'cos') { console.error(`[autopilot] --duties-only: no COS manager on :${o.port}`); process.exit(1); }
    const d = startDuties(o, log); for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { d.stop(); process.exit(0); });
    return;
  }
  if (found.is === 'cos') {
    log(`COS's manager is already running on 127.0.0.1:${o.port} (pid ${found.pid}) — nothing started`);
    if (o.only) { const r = await ask(o.port, 'POST', '/api/cos/boot', { set: o.only, by: 'person' }, 120000); log(`asked it to boot ${o.only.join(', ')}: ${r && r.body ? `started ${(r.body.started || []).length}` : 'no answer'}`); }
    process.exit(0);
  }
  if (found.is === 'autopilot') { console.error(`[autopilot] an old autopilot (the retired supervisor) holds :${o.port}. Stop it first: COS does not start a second supervisor (MG-001, GATE-MG17-002).`); process.exit(1); }
  if (found.is === 'other') { console.error(`[autopilot] :${o.port} is held by another program, which is neither COS's manager nor autopilot. Free it, or pass --status-port=<port>.`); process.exit(1); }

  const args = [MANAGER, ...(VERSION ? [`--handover=${VERSION}`] : []), ...(o.root ? [`--root=${o.root}`] : [])];
  const env = { ...process.env, COS_MANAGER_PORT: String(o.port) };
  let child;
  if (o.detach) {
    const dir = path.join(ROOT, 'data', 'autopilot'); fs.mkdirSync(dir, { recursive: true });
    const logFile = path.join(dir, 'cos-manager.log'); const fd = fs.openSync(logFile, 'a');
    child = spawn(process.execPath, args, { cwd: ROOT, env, detached: true, stdio: ['ignore', fd, fd], windowsHide: true }); fs.closeSync(fd);
    log(`COS's manager started detached (pid ${child.pid}); its log: ${logFile}`);
  } else child = spawn(process.execPath, args, { cwd: ROOT, env, stdio: 'inherit' });

  const up = await waitHealthy(o.port, child);
  if (!up.ok) { console.error(`[autopilot] ${up.why}. Nothing supervises; autopilot does not fall back to supervising.`); try { child.kill('SIGTERM'); } catch (_) {} process.exit(1); }
  log(`COS's manager supervises on 127.0.0.1:${o.port} (pid ${up.pid}); the routes autopilot served answer there unchanged`);

  const boot = await ask(o.port, 'POST', '/api/cos/boot', { by: 'boot', ...(o.only ? { set: o.only } : {}) }, 30 * 60 * 1000);
  if (boot && boot.body && boot.body.ok) log(`booted ${boot.body.started.length}: ${boot.body.started.join(', ')}${boot.body.skipped.length ? ` · not at boot: ${boot.body.skipped.map(s => `${s.name} (${s.why})`).join(', ')}` : ''}`);
  else log(`⚠ the boot did not answer: ${boot ? JSON.stringify(boot.body) : 'no reply'} — what started is supervised; GET /api/cos/systems says what runs`);

  if (o.detach) {
    if (o.duties) { const d = spawn(process.execPath, [__filename, '--duties-only', `--status-port=${o.port}`], { cwd: ROOT, env: process.env, detached: true, stdio: 'ignore', windowsHide: true }); d.unref(); log(`core's duties run beside it (pid ${d.pid})`); }
    child.unref(); process.exit(0);
  }
  const duties = startDuties(o, log);
  if (o.cli) setTimeout(() => { try { require('../nexus-cli-interface').start({ onClose: () => {} }); } catch (e) { log(`--cli interface failed to start: ${e.message}`); } }, 1000);
  let stopping = false;
  const stop = (sig) => { if (stopping) return; stopping = true; log(`${sig}: stopping COS's manager and every system it supervises`); duties.stop(); try { child.kill('SIGTERM'); } catch (_) {}
    const t = setTimeout(() => { try { child.kill('SIGKILL'); } catch (_) {} process.exit(0); }, 10000); if (t.unref) t.unref(); };
  process.on('SIGINT', () => stop('SIGINT')); process.on('SIGTERM', () => stop('SIGTERM'));
  child.on('exit', (code, signal) => { duties.stop(); if (!stopping) console.error(`[autopilot] COS's manager exited (code ${code}${signal ? ', ' + signal : ''}); its systems stopped with it`); process.exit(stopping ? 0 : (code || 1)); });
}

if (require.main === module) main().catch((e) => { console.error(`[autopilot] ${e.stack || e.message}`); process.exit(1); });

module.exports = { main, parseArgs, who, ask, waitHealthy, MANAGER, ARCHIVE };
