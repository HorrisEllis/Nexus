'use strict';
/**
 * cos/manager/relaunch.js — COS's manager starts again after it restarts itself, when nothing above it will (CE2b, 0.60.417).
 * Map: docs/2026-11-02-cos-enterprise-phasemap.spec CE2b_updates_restart_cos.
 * James, 2026-11-06: "updates need to restart cos." · "the applicable system or module. as long as its done writting." · on Clear Glass: "Ask me first".
 *
 * Two ways COS comes back after he says yes to "Restart COS":
 *   - started by autopilot (the Windows service and the COS app both run lib/nexus/autopilot.js; it sets COS_LAUNCHER=autopilot): the manager
 *     exits with RESTART_CODE and autopilot starts it again and boots its systems, under the pid NSSM and the COS app already track.
 *   - started by hand (node cos/manager/server.js …): spawnRelauncher starts this file on its own; it waits for the old manager to end and its
 *     port to free, then starts the same command again with --boot, so the systems come back.
 *   spawnRelauncher({ pid, execPath, args, cwd, port, waitMs }) → { pid }      wait({ pid, port, waitMs }) → { ok, why? }
 * Nothing here decides to restart: the yes is his (updates.restart, POST /api/cos/update/restart).
 */
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const RESTART_CODE = 75;   // "restart me": a manager that exits with it asked to be started again

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const portFree = (port) => new Promise((ok) => { const s = net.createServer(); s.once('error', () => ok(false)); s.listen(port, '127.0.0.1', () => s.close(() => ok(true))); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function wait({ pid, port, waitMs = 30000 } = {}) {
  const t0 = Date.now();
  while (pid && alive(pid)) { if (Date.now() - t0 > waitMs) return { ok: false, why: `the old manager (pid ${pid}) did not end in ${Math.round(waitMs / 1000)} s` }; await sleep(200); }
  while (port && !(await portFree(port))) { if (Date.now() - t0 > waitMs) return { ok: false, why: `:${port} did not free in ${Math.round(waitMs / 1000)} s` }; await sleep(200); }
  return { ok: true };
}

/** the manager's argv for its next start: the same, with --boot once (its systems were running; they come back) */
const withBoot = (args = []) => [...args.filter(a => a !== '--boot'), '--boot'];

function spawnRelauncher({ pid = process.pid, execPath = process.execPath, args = [], cwd = process.cwd(), port, waitMs = 30000, env = process.env } = {}) {
  const job = JSON.stringify({ pid, execPath, args: withBoot(args), cwd, port, waitMs });
  const child = spawn(process.execPath, [__filename, job], { cwd, env, detached: true, stdio: 'inherit', windowsHide: true });
  child.unref();
  return { pid: child.pid };
}

async function main(job) {
  const w = await wait(job);
  if (!w.ok) { console.error(`[cos relaunch] not started: ${w.why}`); process.exit(1); }
  const child = spawn(job.execPath, job.args, { cwd: job.cwd, env: process.env, detached: true, stdio: 'inherit', windowsHide: true });
  child.unref();
  console.log(`[cos relaunch] COS's manager started again (pid ${child.pid}): ${path.basename(job.args[0] || '')} ${job.args.slice(1).join(' ')}`);
  process.exit(0);
}

if (require.main === module) main(JSON.parse(process.argv[2] || '{}')).catch((e) => { console.error(`[cos relaunch] ${e.message}`); process.exit(1); });

module.exports = { RESTART_CODE, spawnRelauncher, wait, withBoot, MODULE_ID: 'cos.manager.relaunch' };
