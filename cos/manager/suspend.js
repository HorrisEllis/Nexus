'use strict';
/**
 * cos/manager/suspend.js — the OS primitive under pause (CP5b, 0.60.362). Spec: cos/spec/compartment.spec MOD-CP-SUSPEND, schema PauseState ·
 * Map: docs/2026-11-01-the-compartment-phasemap.spec CP5b_pause_resume, CP_D9.
 *
 * James, 2026-11-01: "the entire sandbox is rewindable/pausable/recordable/branchable/parraelel and benchmarked".
 *
 * A compartment's process and its children are suspended or resumed together, and every act is read back from the OS (§0.1, CP-003):
 *   Linux, macOS   SIGSTOP / SIGCONT; read back from /proc/<pid>/stat (Linux) or `ps -o stat=` (macOS): state T is stopped
 *   Windows        NtSuspendProcess / NtResumeProcess through PowerShell (Add-Type over ntdll — no native module); read back from every
 *                  thread's WaitReason (Suspended)
 * The read-back decides ok, never the call's return (§1.2). No pid outside the tree is touched.
 *
 *   tree(pid) → Promise<number[]>          the pid and its descendants (ps ppid / Win32_Process ParentProcessId)
 *   suspend(pid) · resume(pid) → Promise<{ ok, pids, via, os, error? }>
 *   osState(pids) → Promise<'suspended' | 'running' | 'mixed' | 'unknown'>
 */
const fs = require('fs');
const { execFile } = require('child_process');

const MODULE_ID = 'cos.manager.suspend';
const VERSION = '1.0.0';
const WIN = process.platform === 'win32';
const VIA = WIN ? 'NtSuspendProcess/NtResumeProcess' : 'SIGSTOP/SIGCONT';

const run = (cmd, args, timeout = 15000) => new Promise((resolve) => {
  execFile(cmd, args, { timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, out, errOut) => resolve({ ok: !err, out: String(out || ''), error: err ? (String(errOut || '').trim() || err.message) : null }));
});
const ps = (script) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script]);
const NT = "Add-Type -Name N -Namespace C -MemberDefinition '[DllImport(\"ntdll.dll\")] public static extern int NtSuspendProcess(IntPtr h); [DllImport(\"ntdll.dll\")] public static extern int NtResumeProcess(IntPtr h);';";

async function _children() {
  if (WIN) {
    const r = await ps('Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId)" }');
    if (!r.ok) return null;
    return r.out.split(/\r?\n/).map(l => l.trim().split(/\s+/).map(Number)).filter(a => a.length === 2 && a.every(Number.isFinite));
  }
  const r = await run('ps', ['-A', '-o', 'pid=,ppid=']);
  if (!r.ok) return null;
  return r.out.split('\n').map(l => l.trim().split(/\s+/).map(Number)).filter(a => a.length === 2 && a.every(Number.isFinite));
}

async function tree(pid) {
  pid = Number(pid); if (!Number.isInteger(pid) || pid <= 0) return [];
  const pairs = await _children(); if (!pairs) return [pid];
  const out = [pid];
  for (let i = 0; i < out.length; i++) for (const [p, pp] of pairs) if (pp === out[i] && !out.includes(p)) out.push(p);
  return out;
}

async function _one(pid) {
  if (WIN) return null;   // Windows reads the tree at once (osState)
  if (process.platform === 'linux') {
    try { const st = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); const s = st.slice(st.lastIndexOf(')') + 2, st.lastIndexOf(')') + 3); return s === 'T' || s === 't' ? 'suspended' : 'running'; } catch (_) { return 'gone'; }
  }
  const r = await run('ps', ['-o', 'stat=', '-p', String(pid)]); if (!r.ok) return 'gone';
  return /^T/.test(r.out.trim()) ? 'suspended' : 'running';
}

async function osState(pids) {
  pids = (pids || []).map(Number).filter(n => n > 0); if (!pids.length) return 'unknown';
  let states;
  if (WIN) {
    const r = await ps(`${pids.map(p => `$p=Get-Process -Id ${p} -ErrorAction SilentlyContinue; if ($p) { $t=@($p.Threads); $s=@($t | Where-Object { $_.WaitReason -eq 'Suspended' }).Count; "${p} $($t.Count) $s" } else { "${p} 0 0" }`).join('; ')}`);
    if (!r.ok) return 'unknown';
    states = r.out.split(/\r?\n/).filter(Boolean).map(l => { const [, n, s] = l.trim().split(/\s+/).map(Number); return n === 0 ? 'gone' : s === n ? 'suspended' : 'running'; });
  } else states = await Promise.all(pids.map(_one));
  const live = states.filter(s => s !== 'gone');
  if (!live.length) return 'unknown';
  return live.every(s => s === 'suspended') ? 'suspended' : live.every(s => s === 'running') ? 'running' : 'mixed';
}

async function _act(pid, verb) {
  const pids = await tree(pid);
  const want = verb === 'suspend' ? 'suspended' : 'running';
  const order = verb === 'suspend' ? [...pids].reverse() : pids;   // children stopped before the parent; the parent resumed first
  let error = null;
  if (WIN) {
    const fn = verb === 'suspend' ? 'NtSuspendProcess' : 'NtResumeProcess';
    const r = await ps(`${NT} ${order.map(p => `$p=Get-Process -Id ${p} -ErrorAction SilentlyContinue; if ($p) { [void][C.N]::${fn}($p.Handle) }`).join('; ')}`);
    if (!r.ok) error = r.error;
  } else {
    for (const p of order) { try { process.kill(p, verb === 'suspend' ? 'SIGSTOP' : 'SIGCONT'); } catch (e) { if (e.code !== 'ESRCH') error = `${p}: ${e.message}`; } }
  }
  let os = await osState(pids);
  for (let i = 0; os !== want && os !== 'unknown' && i < 10; i++) { await new Promise(r => setTimeout(r, 50)); os = await osState(pids); }   // a signal is delivered asynchronously
  return { ok: os === want, pids, via: VIA, os, ...(error ? { error } : os !== want ? { error: `the OS reads ${os}, not ${want}` } : {}) };
}

const suspend = (pid) => _act(pid, 'suspend');
const resume = (pid) => _act(pid, 'resume');

module.exports = { tree, suspend, resume, osState, VIA, MODULE_ID, VERSION };
