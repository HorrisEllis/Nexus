'use strict';
/**
 * cos/manager/usage.js — each supervised process's memory and CPU, read back from the OS; the host's load and free memory against the
 * supervisor's halt floors. MG18, 0.60.336. Spec: cos/spec/cos-manager.spec MOD-MG-UI-OVERVIEW ("every number on a card is the supervisor's,
 * with its time"; "usage null → shown as 'not read' with the why, never 0").
 *   read(systems, policy) → { at, host: { cpus, load1, freeMemPct, freeMB, totalMB, haltPct, criticalHaltPct }, systems: { name: { rssMB, cpuPct } | { notRead } } }
 */
const os = require('os');
const { spawnSync } = require('child_process');

function perPid(pids) {
  const out = {};
  if (!pids.length) return { out, why: null };
  try {
    if (process.platform === 'win32') {
      const r = spawnSync('wmic', ['process', 'where', `(${pids.map(p => `ProcessId=${p}`).join(' or ')})`, 'get', 'ProcessId,WorkingSetSize', '/format:csv'], { encoding: 'utf8', timeout: 5000, windowsHide: true });
      if (r.status !== 0) return { out, why: 'wmic did not answer (it may not be on this Windows)' };
      for (const line of r.stdout.split('\n')) { const p = line.trim().split(','); const pid = parseInt(p[1], 10), ws = parseInt(p[2], 10); if (pid && !isNaN(ws)) out[pid] = { rssMB: Math.round(ws / 1048576), cpuPct: null }; }
      return { out, why: null };
    }
    const r = spawnSync('ps', ['-o', 'pid=,rss=,%cpu=', '-p', pids.join(',')], { encoding: 'utf8', timeout: 5000 });
    for (const line of (r.stdout || '').trim().split('\n')) { const [pid, rss, cpu] = line.trim().split(/\s+/).map(Number); if (pid && !isNaN(rss)) out[pid] = { rssMB: Math.round(rss / 1024), cpuPct: isNaN(cpu) ? null : cpu }; }
    return { out, why: null };
  } catch (e) { return { out, why: e.message }; }
}

function read(systems, policy = {}) {
  const running = systems.filter(s => s.pid);
  const { out, why } = perPid(running.map(s => s.pid));
  const per = {};
  for (const s of systems) {
    if (!s.pid) per[s.name] = { notRead: 'not running' };
    else if (out[s.pid]) per[s.name] = out[s.pid];
    else per[s.name] = { notRead: why || `the OS did not report pid ${s.pid}` };
  }
  const free = os.freemem(), total = os.totalmem();
  return { at: Date.now(), host: { cpus: os.cpus().length, load1: Math.round(os.loadavg()[0] * 100) / 100, freeMemPct: Math.round(free / total * 1000) / 10,
    freeMB: Math.round(free / 1048576), totalMB: Math.round(total / 1048576), haltPct: policy.memoryHaltPct ?? null, criticalHaltPct: policy.criticalHaltPct ?? null }, systems: per };
}

module.exports = { read, perPid };
