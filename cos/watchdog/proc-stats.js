/**
 * watchdog/proc-stats.js
 * COMPARTMENT OS — Process Resource Reader (Phase: Watchdog Monitor)
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * PLATFORM NOTE, flagged honestly: Node has no built-in cross-platform
 * API for "memory/CPU usage of an arbitrary PID." Two real
 * implementations, not one real + one fake:
 *   - Linux: reads /proc/<pid>/stat + /proc/<pid>/status directly.
 *     VERIFIED in this dev environment — real parsing, tested against
 *     this process's own /proc entry.
 *   - win32: shells out to PowerShell's Get-Process, the same pattern
 *     already used elsewhere in this codebase for things Node can't
 *     reach without native bindings. This is real code, but UNVERIFIED
 *     in this session — no Windows machine is available to run it
 *     against. Flagged rather than silently claimed working.
 * Any other platform (macOS, BSD): not implemented, returns null and lets
 * the caller decide what "no resource data available" means for it.
 */

'use strict';

const fs = require('fs');
const { execFileSync } = require('child_process');

let _clockTicksPerSec = null;
function clockTicksPerSec() {
  if (_clockTicksPerSec) return _clockTicksPerSec;
  try {
    _clockTicksPerSec = parseInt(execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8' }).trim(), 10) || 100;
  } catch {
    _clockTicksPerSec = 100; // standard default on Linux
  }
  return _clockTicksPerSec;
}

/**
 * @param {number} pid
 * @returns {{ rssMB: number, cpuTimeMs: number }|null}
 *          cpuTimeMs is CUMULATIVE cpu time consumed since process start —
 *          caller computes %CPU by sampling this twice and dividing the
 *          delta by the wall-clock delta.
 */
function readLinuxProcStats(pid) {
  try {
    const statRaw = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const lastParen = statRaw.lastIndexOf(')');
    const rest = statRaw.slice(lastParen + 2).trim().split(/\s+/);
    // rest[0] = state, ... rest[11] = utime, rest[12] = stime (ticks)
    const utimeTicks = parseInt(rest[11], 10) || 0;
    const stimeTicks = parseInt(rest[12], 10) || 0;
    const cpuTimeMs = ((utimeTicks + stimeTicks) / clockTicksPerSec()) * 1000;

    const statusRaw = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
    const m = /VmRSS:\s+(\d+)\s*kB/.exec(statusRaw);
    const rssMB = m ? parseInt(m[1], 10) / 1024 : 0;

    return { rssMB, cpuTimeMs };
  } catch {
    return null; // process exited between the caller's check and this read, or /proc unavailable
  }
}

/**
 * @param {number} pid
 * @returns {{ rssMB: number, cpuTimeMs: number }|null}
 */
// 2026-11-05 — James: "getting spammed with command prompt from cos, any way to hide those?" Found: this ran one visible PowerShell per system
// on every watchdog tick (13 systems → 13 console windows, each a PowerShell start costing CPU). Now: hidden (windowsHide), and ONE call
// reads every process, kept for WIN_CACHE_MS, so a tick over 13 systems starts one hidden PowerShell, not 13 windows.
const WIN_CACHE_MS = 2000;
let _winCache = { at: 0, byPid: null };
function _readAllWin32() {
  const out = execFileSync('powershell', [
    '-NoProfile', '-NonInteractive', '-Command',
    "Get-Process | Select-Object Id,WorkingSet64,@{n='CpuSec';e={$_.CPU}} | ConvertTo-Json -Compress",
  ], { encoding: 'utf8', timeout: 5000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  const rows = [].concat(JSON.parse(out) || []);
  const byPid = new Map();
  for (const r of rows) if (r && r.Id != null) byPid.set(Number(r.Id), { rssMB: (r.WorkingSet64 || 0) / (1024 * 1024), cpuTimeMs: (r.CpuSec || 0) * 1000 });
  return byPid;
}
function readWin32ProcStats(pid, { now = Date.now(), readAll = _readAllWin32 } = {}) {
  try {
    if (!_winCache.byPid || now - _winCache.at > WIN_CACHE_MS) _winCache = { at: now, byPid: readAll() };
    return _winCache.byPid.get(Number(pid)) || null;
  } catch {
    _winCache = { at: now, byPid: new Map() };   // a failed read is not retried every call within the window
    return null;
  }
}

/**
 * @param {number} pid
 * @returns {{ rssMB: number, cpuTimeMs: number }|null}
 */
function readProcStats(pid) {
  if (process.platform === 'win32') return readWin32ProcStats(pid);
  if (process.platform === 'linux') return readLinuxProcStats(pid);
  return null; // macOS/BSD/other — not implemented
}

module.exports = { _resetWinCache: () => { _winCache = { at: 0, byPid: null }; },
  readProcStats,
  readLinuxProcStats,
  readWin32ProcStats,
};
