'use strict';
/**
 * cos/app/logon.js — COS starts with Windows, elevated, to the tray (MG37, COS 0.3.0). Spec: cos/spec/cos-manager.spec MOD-COSA-AT-LOGON ·
 * Map: docs/2026-10-24-cos-manager-phasemap.spec MG37_starts_with_windows, docs/2026-11-02-cos-the-application-phasemap.spec CA_D1.
 *
 * James, 2026-11-02: "cos starts up with windows, minimizes to tray unless disabled. admin access and a service if applicable."
 *
 * Decided by his axioms (CA_D1): a scheduled task at logon with highest privileges — one admin approval when it is set, no prompt at each
 * start, admin rights for what needs them. When he declines the approval, the per-user login item (no elevation), said. NOT a Windows
 * service: a service runs in session 0 with no desktop, and COS and Clear Glass are windows (§0.0: said, not attempted).
 * The portable exe runs from a temp copy; the path that survives is PORTABLE_EXECUTABLE_FILE (electron-builder), used when set.
 *
 *   exePath(env, execPath) → the path a logon start must run
 *   taskCommand({ exe, enable }) → { cmd, args }                 schtasks /Create … /SC ONLOGON /RL HIGHEST | /Delete
 *   apply({ exe, enable, elevated, platform, runElevated, setLoginItem }) → Promise<{ ok, via, elevated, error? }>
 */
const TASK = 'COS';

const exePath = (env = process.env, execPath = process.execPath) => env.PORTABLE_EXECUTABLE_FILE || execPath;

function taskCommand({ exe, enable = true } = {}) {
  if (!enable) return { cmd: 'schtasks', args: ['/Delete', '/TN', TASK, '/F'] };
  return { cmd: 'schtasks', args: ['/Create', '/TN', TASK, '/SC', 'ONLOGON', '/RL', 'HIGHEST', '/TR', `"${exe}" --hidden`, '/F'] };
}

/** runElevatedDefault(cmd, args) — Windows: one UAC approval (Start-Process -Verb RunAs -Wait); resolves { ok, code, error } */
function runElevatedDefault(cmd, args) {
  return new Promise((resolve) => {
    const quoted = args.map(a => `'${String(a).replace(/'/g, "''")}'`).join(',');
    const ps = `$p = Start-Process -FilePath '${cmd}' -ArgumentList ${quoted} -Verb RunAs -Wait -PassThru -WindowStyle Hidden; exit $p.ExitCode`;
    require('child_process').execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 120000 }, (err) => {
      resolve(err ? { ok: false, code: err.code ?? null, error: /canceled|cancelled|1223/i.test(String(err.message)) ? 'the admin approval was declined' : String(err.message).split('\n')[0] } : { ok: true, code: 0 });
    });
  });
}

async function apply({ exe = exePath(), enable = true, elevated = true, platform = process.platform, runElevated = runElevatedDefault, setLoginItem = null } = {}) {
  const login = (on, why) => {
    try { if (setLoginItem) setLoginItem({ openAtLogin: on, path: exe, args: ['--hidden'] }); }
    catch (e) { return { ok: false, via: 'login-item', elevated: false, error: e.message }; }
    return { ok: true, via: 'login-item', elevated: false, ...(why ? { note: why } : {}) };
  };
  if (platform !== 'win32') return login(enable, platform === 'linux' ? 'on Linux the login item is the desktop autostart; no elevation' : 'no elevation outside Windows');
  if (!enable) {   // off: the task (if any) and the login item both removed
    const t = taskCommand({ enable: false }); const r = elevated ? await runElevated(t.cmd, t.args) : { ok: true };
    const l = login(false); return { ok: l.ok, via: 'removed', elevated: false, ...(r.ok ? {} : { note: `the logon task was not removed: ${r.error}` }) };
  }
  if (elevated) {
    const t = taskCommand({ exe, enable: true }); const r = await runElevated(t.cmd, t.args);
    if (r.ok) { login(false); return { ok: true, via: 'logon-task', elevated: true }; }
    return login(true, `not elevated: ${r.error || 'the task could not be made'} — COS starts with Windows through the login item instead`);
  }
  return login(true, 'not elevated: his setting');
}

module.exports = { exePath, taskCommand, apply, TASK, MODULE_ID: 'cos.app.logon', VERSION: '1.0.0' };
