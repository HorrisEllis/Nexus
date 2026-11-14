'use strict';
/**
 * cos/app/service.js — Nexus's headless part as the Windows service NexusCOS, through NSSM (CA4, COS 0.5.0).
 * Map: docs/2026-11-02-cos-the-application-phasemap.spec CA4_the_supervisor_as_a_windows_service, decision CA_D1b.
 *
 * James, 2026-11-04, uploading his NSM and its NSSM notes: "run in service with admin privilages for more control and power." · "run on startup
 * with an option to disable."
 *
 * Decided (CA_D1b, his; the split by §0.0): a Windows service runs in session 0 with no desktop, so the service is the part with no window —
 * his linked Nexus folder started headless (lib/nexus/autopilot.js → COS's manager → every system without a window), as LocalSystem, at boot,
 * restarted by NSSM if it dies, logs rotated at 10 MB. COS_SERVICE=1 tells COS's supervisor to leave the windowed systems (Clear Glass) to his
 * session; the COS window starts them at logon. A Node process cannot answer Windows' service control manager by itself: NSSM (his named tool)
 * does. Without nssm.exe nothing is installed, and where to put it is said.
 *
 *   NAME                                   'NexusCOS'
 *   findNssm({ env, exists, where, appDir }) → path | null     NSSM_EXE, <app>/bin/nssm.exe, <app>/nssm.exe, then PATH
 *   installCommands({ nssm, node, entry, dir, logDir, statusPort }) → [[cmd, args], …]   (remove first, so a reinstall is clean)
 *   removeCommands({ nssm }) → [[cmd, args], …]
 *   batch(commands) → the .cmd text that runs them in order and stops at the first failure (one admin approval for all)
 *   parseStatus(stdout) → 'running' | 'stopped' | 'starting' | 'stopping' | 'paused' | 'missing' | 'unknown'
 *   status({ nssm, exec }) → Promise<{ ok, state, raw }>
 *   apply({ enable, nssm, node, entry, dir, logDir, platform, runBatchElevated }) → Promise<{ ok, via, state?, error?, note? }>
 */
const fs = require('fs');
const path = require('path');

const NAME = 'NexusCOS';
const ROTATE_BYTES = 10 * 1024 * 1024;

function findNssm({ env = process.env, exists = fs.existsSync, where = null, appDir = path.dirname(process.execPath) } = {}) {
  const cands = [env.NSSM_EXE, path.join(appDir, 'bin', 'nssm.exe'), path.join(appDir, 'nssm.exe')].filter(Boolean);
  for (const c of cands) if (exists(c)) return c;
  if (typeof where === 'function') { const w = where('nssm'); if (w && exists(w)) return w; }
  return null;
}
function defaultWhere(cmd) {
  try {
    const out = require('child_process').execFileSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    return out.split(/\r?\n/).map(x => x.trim()).find(Boolean) || null;
  } catch (_) { return null; }
}

function installCommands({ nssm, node, entry, dir, logDir, statusPort = 7799 } = {}) {
  for (const [k, v] of Object.entries({ nssm, node, entry, dir, logDir })) if (!v) throw new Error(`installCommands needs ${k}`);
  const set = (...a) => [nssm, ['set', NAME, ...a]];
  return [
    [nssm, ['stop', NAME]], [nssm, ['remove', NAME, 'confirm']],   // a reinstall starts clean (both may fail on a first install: allowed)
    [nssm, ['install', NAME, node, entry, `--status-port=${statusPort}`]],
    set('AppDirectory', dir),
    set('AppEnvironmentExtra', 'COS_SERVICE=1', `AUTOPILOT_STATUS_PORT=${statusPort}`),
    set('DisplayName', 'Nexus (COS supervisor)'),
    set('Description', 'Nexus started headless by COS: autopilot, COS\'s manager and every system without a window. Clear Glass and the COS window start in your session.'),
    set('ObjectName', 'LocalSystem'),
    set('Start', 'SERVICE_AUTO_START'),
    set('AppStdout', path.join(logDir, 'service.log')), set('AppStderr', path.join(logDir, 'service-error.log')),
    set('AppRotateFiles', '1'), set('AppRotateOnline', '1'), set('AppRotateBytes', String(ROTATE_BYTES)),
    set('AppRestartDelay', '2000'),
    set('AppExit', 'Default', 'Restart'),
    [nssm, ['start', NAME]],
  ];
}
function removeCommands({ nssm } = {}) {
  if (!nssm) throw new Error('removeCommands needs nssm');
  return [[nssm, ['stop', NAME]], [nssm, ['remove', NAME, 'confirm']]];
}

// ── CA8 (COS 0.9.0) — COS's own service host, cos-svc.exe, in place of nssm.exe ──────────────────────────────────────────────────────
// James, 2026-11-13, told the service needs nssm.exe, which is not on his machine and not in his NSSM.zip: "need to build it from scratch."
// cos/app/service-host/cos-svc.cs (built to cos/app/bin/cos-svc.exe, shipped inside COS) answers the service control manager itself and runs
// the same thing NSSM ran: node + autopilot, COS_SERVICE=1, LocalSystem, at boot, logs rotated at 10 MB, started again when it exits (2 s,
// doubling to 30 s) and, from his NSM v2, when it is up but its health URL stops answering. What it runs is one JSON file, written here.
// It is used first; nssm.exe (CA4) stays as the way when the host is missing (§0.3).
//   findHost({ env, exists, here, appDir }) → path | null       COS_SVC_EXE, cos/app/bin/cos-svc.exe beside this file, <app>/bin/cos-svc.exe
//   hostConfig({ node, entry, dir, logDir, statusPort }) → the object cos-svc reads
//   hostInstallCommands({ host, configFile }) / hostRemoveCommands({ host }) → [[cmd, args], …]
function findHost({ env = process.env, exists = fs.existsSync, here = __dirname, appDir = path.dirname(process.execPath) } = {}) {
  const cands = [env.COS_SVC_EXE, path.join(here, 'bin', 'cos-svc.exe'), path.join(appDir, 'bin', 'cos-svc.exe')].filter(Boolean);
  for (const c of cands) if (exists(c)) return c;
  return null;
}
function hostConfig({ node, entry, dir, logDir, statusPort = 7799 } = {}) {
  for (const [k, v] of Object.entries({ node, entry, dir, logDir })) if (!v) throw new Error(`hostConfig needs ${k}`);
  return {
    name: NAME, displayName: 'Nexus (COS supervisor)',
    description: 'Nexus started headless by COS: autopilot, COS\'s manager and every system without a window. Clear Glass and the COS window start in your session.',
    node, entry, args: [`--status-port=${statusPort}`], dir, logDir,
    env: { COS_SERVICE: '1', AUTOPILOT_STATUS_PORT: String(statusPort) },
    rotateBytes: ROTATE_BYTES, restartDelayMs: 2000, maxDelayMs: 30000,
    healthUrl: `http://127.0.0.1:${statusPort}/api/cos/health`, healthGraceMs: 120000, healthEveryMs: 30000, healthFails: 3,
  };
}
function hostInstallCommands({ host, configFile } = {}) {
  for (const [k, v] of Object.entries({ host, configFile })) if (!v) throw new Error(`hostInstallCommands needs ${k}`);
  // a reinstall starts clean (stop and remove may fail on a first install: allowed, as with NSSM)
  return [[host, ['stop', NAME]], [host, ['remove', NAME, 'confirm']], [host, ['install', configFile]], [host, ['start', NAME]]];
}
function hostRemoveCommands({ host } = {}) {
  if (!host) throw new Error('hostRemoveCommands needs host');
  return [[host, ['stop', NAME]], [host, ['remove', NAME, 'confirm']]];
}

const _q = (s) => `"${String(s).replace(/"/g, '""')}"`;
function batch(commands) {
  // the first two of an install (stop, remove) may fail when there is nothing to remove; every other line must succeed
  const lines = ['@echo off', 'setlocal'];
  commands.forEach(([cmd, args], i) => {
    const line = [_q(cmd), ...args.map(_q)].join(' ');
    const optional = args[0] === 'stop' || args[0] === 'remove';
    lines.push(optional ? `${line} >nul 2>&1` : `${line}`, ...(optional ? [] : [`if errorlevel 1 (echo failed at step ${i + 1}: ${args.slice(0, 2).join(' ')} & exit /b ${i + 10})`]));
  });
  lines.push('exit /b 0');
  return lines.join('\r\n') + '\r\n';
}

function parseStatus(out) {
  const s = String(out || '');
  if (/SERVICE_RUNNING/.test(s)) return 'running';
  if (/SERVICE_STOPPED/.test(s)) return 'stopped';
  if (/SERVICE_START_PENDING/.test(s)) return 'starting';
  if (/SERVICE_STOP_PENDING/.test(s)) return 'stopping';
  if (/SERVICE_PAUSED/.test(s)) return 'paused';
  if (/can't open service|does not exist|OpenService\(\)|1060/i.test(s)) return 'missing';
  return 'unknown';
}
function status({ nssm, exec = null } = {}) {
  if (!nssm) return Promise.resolve({ ok: false, state: 'unknown', error: 'neither cos-svc.exe nor nssm.exe found' });
  const run = exec || ((cmd, args) => new Promise((res) => require('child_process').execFile(cmd, args, { windowsHide: true, timeout: 15000 }, (err, so, se) => res({ code: err ? (err.code ?? 1) : 0, out: `${so || ''}${se || ''}` }))));
  return run(nssm, ['status', NAME]).then(r => ({ ok: true, state: parseStatus(r.out), raw: String(r.out || '').trim().slice(0, 200) }));
}

/** runBatchElevatedDefault(text) — writes the .cmd to a temp file, runs it with one UAC approval, resolves { ok, code, error } */
function runBatchElevatedDefault(text) {
  return new Promise((resolve) => {
    const file = path.join(require('os').tmpdir(), `cos-service-${Date.now()}.cmd`);
    try { fs.writeFileSync(file, text); } catch (e) { return resolve({ ok: false, error: `could not write the script: ${e.message}` }); }
    const ps = `$p = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c','"${file.replace(/'/g, "''")}"' -Verb RunAs -Wait -PassThru -WindowStyle Hidden; exit $p.ExitCode`;
    require('child_process').execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 180000 }, (err) => {
      try { fs.unlinkSync(file); } catch (_) {}
      if (!err) return resolve({ ok: true, code: 0 });
      const code = err.code ?? null;
      resolve({ ok: false, code, error: /canceled|cancelled|1223/i.test(String(err.message)) ? 'the admin approval was declined' : code >= 10 ? `step ${code - 9} of the install failed` : String(err.message).split('\n')[0] });
    });
  });
}

async function apply({ enable = true, nssm = undefined, node, entry, dir, logDir, statusPort = 7799, platform = process.platform,
  runBatchElevated = runBatchElevatedDefault, statusFn = status, findFn = findNssm, host = undefined, findHostFn = findHost,
  writeConfig = (file, obj) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(obj, null, 2)); } } = {}) {
  if (platform !== 'win32') return { ok: false, via: 'none', error: 'a Windows service is Windows only; on this machine COS starts Nexus itself' };
  // CA8: COS's own host first. A caller that names nssm (or null) itself is asking for the NSSM way, and gets it.
  const own = host !== undefined ? host : (nssm === undefined ? findHostFn() : null);
  const exe = own || (nssm === undefined ? findFn({ where: defaultWhere }) : nssm);
  if (!exe) return { ok: false, via: 'none', error: 'COS\'s service host (bin\\cos-svc.exe) is missing from this COS, and nssm.exe was not found. Reinstall COS, or put nssm.exe next to COS (bin\\nssm.exe) or on PATH, then switch this on again. Nothing was installed.' };
  const by = own ? 'cos-svc' : 'nssm';
  if (!enable) {
    const r = await runBatchElevated(batch(own ? hostRemoveCommands({ host: own }) : removeCommands({ nssm: exe })));
    return r.ok ? { ok: true, via: 'removed', state: 'missing', by } : { ok: false, via: 'removed', error: r.error, by };
  }
  if (!node || !entry || !dir) return { ok: false, via: 'none', error: 'no linked Nexus folder with node to run: link your Nexus folder first' };
  const logs = logDir || path.join(dir, 'data', 'cos-service');
  let commands;
  if (own) {
    const configFile = path.join(logs, 'service.json');
    try { writeConfig(configFile, hostConfig({ node, entry, dir, logDir: logs, statusPort })); }
    catch (e) { return { ok: false, via: 'none', by, error: `what the service runs could not be written (${configFile}): ${e.message}. Nothing was installed.` }; }
    commands = hostInstallCommands({ host: own, configFile });
  } else commands = installCommands({ nssm: exe, node, entry, dir, logDir: logs, statusPort });
  const r = await runBatchElevated(batch(commands));
  if (!r.ok) return { ok: false, via: 'service', error: r.error, by };
  const st = await statusFn({ nssm: exe }).catch(() => ({ state: 'unknown' }));   // cos-svc answers `status NexusCOS` in NSSM's words
  return { ok: true, via: 'service', state: st.state, by, ...(own ? { host: own } : { nssm: exe }), ...(st.state !== 'running' ? { note: `installed; Windows says it is ${st.state}` } : {}) };
}

module.exports = { NAME, ROTATE_BYTES, findNssm, installCommands, removeCommands, findHost, hostConfig, hostInstallCommands, hostRemoveCommands, batch, parseStatus, status, apply, MODULE_ID: 'cos.app.service', VERSION: '1.1.0' };
