'use strict';
/**
 * cos/app/desktop-systems.js — the systems with a window, started by the COS window in his session (CA4, COS 0.5.0).
 * Map: docs/2026-11-02-cos-the-application-phasemap.spec CA4_the_supervisor_as_a_windows_service, decision CA_D1b.
 *
 * When Nexus runs as the Windows service NexusCOS (session 0, no desktop), COS's supervisor leaves every windowed process unstarted
 * (cos/manager/supervisor.js isWindowed). This finds them in his linked folder (each system's compartment.json runtime.process with an Electron
 * command, the same declaration the supervisor reads) and starts the ones not already answering their health, detached, in his session.
 *
 *   windowed(dir, { readdir, readJson, exists }) → [{ name, cmd, args, cwd, env, healthUrl }]
 *   startAll(dir, { spawn, healthy, ...fs }) → Promise<[{ name, started, why }]>
 */
const fs = require('fs');
const path = require('path');

const fill = (v, root) => (typeof v === 'string' ? v.replace(/\{\{root\}\}/g, root) : Array.isArray(v) ? v.map(x => fill(x, root))
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x, root)])) : v);

function windowed(dir, { readdir = (d) => fs.readdirSync(d, { withFileTypes: true }), readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8')), exists = fs.existsSync } = {}) {
  const out = [];
  let entries = []; try { entries = readdir(dir); } catch (_) { return out; }
  for (const e of entries) {
    if (!e.isDirectory() || /^(\.|node_modules$|data$|_archive$)/.test(e.name)) continue;
    const f = path.join(dir, e.name, 'compartment.json'); if (!exists(f)) continue;
    let c; try { c = readJson(f); } catch (_) { continue; }
    const rt = c.runtime || c; const procs = [].concat(rt.process || [], rt.processes || []);
    for (const p0 of procs) {
      const p = fill(p0, dir);
      if (!p || !/electron/i.test(path.basename(String(p.cmd || '')))) continue;
      const cmd = (p.cmdCandidates || []).find(x => exists(x)) || p.cmd;
      out.push({ name: p.name || e.name, cmd, args: p.args || [], cwd: path.resolve(dir, p.cwd || e.name), env: p.env || {}, healthUrl: p.healthUrl || rt.healthUrl || null });
    }
  }
  return out;
}

function httpHealthy(url, ms = 1500) {
  return new Promise((resolve) => {
    if (!url) return resolve(false);
    const req = require('http').get(url, { timeout: ms }, (res) => { res.resume(); resolve(res.statusCode >= 200 && res.statusCode < 500); });
    req.on('timeout', () => { req.destroy(); resolve(false); }); req.on('error', () => resolve(false));
  });
}

async function startAll(dir, { spawn = require('child_process').spawn, healthy = httpHealthy, ...io } = {}) {
  const res = [];
  for (const w of windowed(dir, io)) {
    if (await healthy(w.healthUrl)) { res.push({ name: w.name, started: false, why: 'already running' }); continue; }
    try {
      const env = { ...process.env, ...w.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.COS_SERVICE;   // a real Electron, in his session
      const child = spawn(w.cmd, w.args, { cwd: w.cwd, env, detached: true, stdio: 'ignore', windowsHide: false });
      if (child && child.unref) child.unref();
      res.push({ name: w.name, started: true, pid: child && child.pid });
    } catch (e) { res.push({ name: w.name, started: false, why: e.message }); }
  }
  return res;
}

module.exports = { windowed, startAll, httpHealthy, MODULE_ID: 'cos.app.desktop-systems', VERSION: '1.0.0' };
