'use strict';
/**
 * cos/manager/usage.js — each supervised process's memory and CPU, read back from the OS; the host's load and free memory against the
 * supervisor's halt floors. MG18, 0.60.337. Spec: cos/spec/cos-manager.spec MOD-MG-UI-OVERVIEW ("every number on a card is the supervisor's,
 * with its time"; "usage null → shown as 'not read' with the why, never 0"); cos/spec/compartment.spec MOD-CP-USAGE (CP6a, 0.60.356).
 *   read(systems, policy) → { at, reader, host: { cpus, load1, freeMemPct, freeMB, totalMB, haltPct, criticalHaltPct }, systems: { name: { rssMB, cpuPct, cpuSec, reader } | { notRead } } }
 *   readAsync(systems, policy) → the same, without blocking the manager (the sampler and the routes use it)
 *
 * CP6a (James, 2026-11-01: "then i want resource management for each cos compartment"): found on his Windows 11 (26200) that wmic is gone,
 * so on his machine every system read "wmic did not answer" and nothing was ever measured. Windows now tries wmic, then PowerShell's
 * Get-Process (resident memory and CPU seconds), then tasklist (resident memory only). The reader that answered is named on each reading.
 */
const os = require('os');
const { spawnSync, execFile } = require('child_process');

const PS = (pids) => ['-NoProfile', '-NonInteractive', '-Command', `Get-Process -Id ${pids.join(',')} -ErrorAction SilentlyContinue | ForEach-Object { '{0},{1},{2}' -f $_.Id,$_.WorkingSet64,$_.CPU }`];
const READERS = process.platform === 'win32' ? [
  { name: 'wmic', cmd: 'wmic', args: (p) => ['process', 'where', `(${p.map(x => `ProcessId=${x}`).join(' or ')})`, 'get', 'ProcessId,WorkingSetSize', '/format:csv'],
    parse: (txt) => { const o = {}; for (const line of txt.split('\n')) { const p = line.trim().split(','); const pid = parseInt(p[1], 10), ws = parseInt(p[2], 10); if (pid && !isNaN(ws)) o[pid] = { rssMB: Math.round(ws / 1048576), cpuPct: null, cpuSec: null }; } return o; } },
  { name: 'powershell', cmd: 'powershell', args: PS,
    parse: (txt) => { const o = {}; for (const line of txt.split('\n')) { const [pid, ws, cpu] = line.trim().split(','); const p = parseInt(pid, 10), w = Number(ws), c = parseFloat(String(cpu || '').replace(',', '.')); if (p && !isNaN(w)) o[p] = { rssMB: Math.round(w / 1048576), cpuPct: null, cpuSec: isNaN(c) ? null : Math.round(c * 100) / 100 }; } return o; } },
  { name: 'tasklist', cmd: 'tasklist', args: () => ['/FO', 'CSV', '/NH'],
    parse: (txt, pids) => { const o = {}; const want = new Set(pids); for (const line of txt.split('\n')) { const m = line.match(/^"[^"]*","(\d+)","[^"]*","[^"]*","([\d.,\s]+) K"/); if (m && want.has(+m[1])) o[+m[1]] = { rssMB: Math.round(parseInt(m[2].replace(/[^\d]/g, ''), 10) / 1024), cpuPct: null, cpuSec: null }; } return o; } },
] : [
  { name: 'ps', cmd: 'ps', args: (p) => ['-o', 'pid=,rss=,%cpu=,time=', '-p', p.join(',')],
    parse: (txt) => { const o = {}; for (const line of txt.trim().split('\n')) { const [pid, rss, cpu, time] = line.trim().split(/\s+/); const p = Number(pid), r = Number(rss);
      let sec = null; if (time) { const [d, hms] = time.includes('-') ? time.split('-') : [0, time]; sec = Number(d) * 86400 + hms.split(':').map(Number).reduce((a, x) => a * 60 + x, 0); }
      if (p && !isNaN(r)) o[p] = { rssMB: Math.round(r / 1024), cpuPct: isNaN(Number(cpu)) ? null : Number(cpu), cpuSec: sec }; } return o; } },
];

function perPid(pids) {
  if (!pids.length) return { out: {}, why: null, reader: null };
  const whys = [];
  for (const r of READERS) {
    try {
      const x = spawnSync(r.cmd, r.args(pids), { encoding: 'utf8', timeout: 8000, windowsHide: true });
      if (x.error || x.status !== 0) { whys.push(`${r.name}: ${x.error ? x.error.code || x.error.message : `exit ${x.status}`}`); continue; }
      return { out: r.parse(x.stdout || '', pids), why: null, reader: r.name };
    } catch (e) { whys.push(`${r.name}: ${e.message}`); }
  }
  return { out: {}, why: `no reader answered (${whys.join('; ')})`, reader: null };
}

function perPidAsync(pids) {
  if (!pids.length) return Promise.resolve({ out: {}, why: null, reader: null });
  const whys = [];
  const tryOne = (i) => new Promise((resolve) => {
    if (i >= READERS.length) return resolve({ out: {}, why: `no reader answered (${whys.join('; ')})`, reader: null });
    const r = READERS[i];
    execFile(r.cmd, r.args(pids), { encoding: 'utf8', timeout: 8000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err) { whys.push(`${r.name}: ${err.code || err.message}`); return resolve(tryOne(i + 1)); }
      resolve({ out: r.parse(stdout || '', pids), why: null, reader: r.name });
    });
  });
  return tryOne(0);
}

function shape(systems, policy, { out, why, reader }) {
  const per = {};
  for (const s of systems) {
    if (!s.pid) per[s.name] = { notRead: 'not running' };
    else if (out[s.pid]) per[s.name] = { ...out[s.pid], reader };
    else per[s.name] = { notRead: why || `the OS did not report pid ${s.pid} (${reader})` };
  }
  const free = os.freemem(), total = os.totalmem();
  return { at: Date.now(), reader, host: { cpus: os.cpus().length, load1: Math.round(os.loadavg()[0] * 100) / 100, freeMemPct: Math.round(free / total * 1000) / 10,
    freeMB: Math.round(free / 1048576), totalMB: Math.round(total / 1048576), haltPct: policy.memoryHaltPct ?? null, criticalHaltPct: policy.criticalHaltPct ?? null }, systems: per };
}

function read(systems, policy = {}) { return shape(systems, policy, perPid(systems.filter(s => s.pid).map(s => s.pid))); }
async function readAsync(systems, policy = {}) { return shape(systems, policy, await perPidAsync(systems.filter(s => s.pid).map(s => s.pid))); }

module.exports = { read, readAsync, perPid, perPidAsync, READERS: READERS.map(r => r.name) };
