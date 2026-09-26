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
function readWin32ProcStats(pid) {
  try {
    // WorkingSet is bytes; CPU is TotalProcessorTime in seconds (a double).
    const out = execFileSync('powershell', [
      '-NoProfile', '-Command',
      `Get-Process -Id ${pid} | Select-Object WorkingSet64,@{n='CpuSec';e={$_.CPU}} | ConvertTo-Json`,
    ], { encoding: 'utf8', timeout: 3000 });
    const parsed = JSON.parse(out);
    return {
      rssMB: (parsed.WorkingSet64 || 0) / (1024 * 1024),
      cpuTimeMs: (parsed.CpuSec || 0) * 1000,
    };
  } catch {
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

module.exports = {
  readProcStats,
  readLinuxProcStats,
  readWin32ProcStats,
};
