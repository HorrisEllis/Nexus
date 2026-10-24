'use strict';
// [NEXUS-COMPONENT-ID]
const COMPONENT_ID   = 'c4922d35';
const COMPONENT_UUID = 'c4922d35-f402-5865-a717-1a74085e4f60';
const COMPONENT_NAME = 'ssh';
// [/NEXUS-COMPONENT-ID]
/**
 * engines/ssh.js
 * ─────────────────────────────────────────────────────────────────────────────
 * SSH / SFTP access — deliberately NOT a from-scratch SSH implementation.
 * Re-implementing SSH's transport layer (key exchange, ciphers, MAC,
 * channel multiplexing) from raw sockets is exactly the kind of thing that
 * looks like it works and is actually subtly wrong or insecure — wrong place
 * to cut corners. Real SSH already exists on both platforms this runs on:
 *
 *   Windows 10/11:  OpenSSH Server is a built-in optional feature
 *                   (Settings > Optional Features, or
 *                   `Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0`)
 *   Linux:          openssh-server package, or already installed
 *
 * Both bundle sftp-server, so enabling sshd gives you SFTP for free — no
 * separate SFTP implementation needed either.
 *
 * This engine: detects whether OpenSSH Server is installed, reports its
 * status (running/stopped, port, host keys present), can start/stop/enable
 * it, and — if you provide a public key — appends it to the right
 * authorized_keys file for the account NEXUS is running as, so you can log
 * in with a Nexus-managed keypair without ever typing a Windows/Linux
 * account password over SSH.
 *
 * conf/ssh.conf:
 *   port           informational only — actual port lives in the OS's own
 *                  sshd_config (default 22); NEXUS doesn't override it
 *   authorizedKeys public keys NEXUS has installed, for display in the panel
 * ─────────────────────────────────────────────────────────────────────────────
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const cp   = require('child_process');
const { ipc, conf, log, isInit, ROOT, NAME } = require('./_engine');

const DEFAULTS = { port: 22, authorizedKeys: [] };

if (isInit()) {
  conf.init(DEFAULTS);
  log('ssh: wrote default conf');
  process.exit(0);
}

const cfg     = conf.load(DEFAULTS);
const IS_WIN  = process.platform === 'win32';

function run(command) {
  return new Promise(resolve => {
    cp.exec(command, { windowsHide: true, timeout: 10000 }, (err, stdout, stderr) => {
      resolve({ ok: !err, code: err?.code, stdout: (stdout || '').trim(), stderr: (stderr || '').trim() });
    });
  });
}

// ─── detection ────────────────────────────────────────────────────────────────

async function detect() {
  if (IS_WIN) {
    const cap = await run('powershell -NoProfile -Command "(Get-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0).State"');
    const installed = /Installed/i.test(cap.stdout);
    let running = false, autostart = false;
    if (installed) {
      const svc = await run('powershell -NoProfile -Command "Get-Service sshd | Select-Object -ExpandProperty Status"');
      running = /Running/i.test(svc.stdout);
      const st = await run('powershell -NoProfile -Command "Get-Service sshd | Select-Object -ExpandProperty StartType"');
      autostart = /Automatic/i.test(st.stdout);
    }
    return {
      platform: 'windows', installed, running, autostart,
      sshdConfig: 'C:\\ProgramData\\ssh\\sshd_config',
      authorizedKeysPath: path.join(os.homedir(), '.ssh', 'authorized_keys'),
      detail: cap.stdout || cap.stderr,
    };
  } else {
    const which = await run('command -v sshd || which sshd');
    const installed = which.ok && !!which.stdout;
    let running = false, autostart = false;
    if (installed) {
      const svc = await run('systemctl is-active sshd || systemctl is-active ssh');
      running = /^active/.test(svc.stdout);
      const en = await run('systemctl is-enabled sshd || systemctl is-enabled ssh');
      autostart = /^enabled/.test(en.stdout);
    }
    return {
      platform: 'linux', installed, running, autostart,
      sshdConfig: '/etc/ssh/sshd_config',
      authorizedKeysPath: path.join(os.homedir(), '.ssh', 'authorized_keys'),
      detail: which.stdout || which.stderr,
    };
  }
}

async function install() {
  if (IS_WIN) {
    return run('powershell -NoProfile -Command "Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0"');
  }
  const apt = await run('apt-get install -y openssh-server');
  if (apt.ok) return apt;
  return run('yum install -y openssh-server || dnf install -y openssh-server');
}

async function setRunning(want) {
  if (IS_WIN) {
    if (want) {
      const start = await run('powershell -NoProfile -Command "Start-Service sshd; Set-Service -Name sshd -StartupType Automatic"');
      // Windows Firewall rule for inbound 22 — same courtesy the firewall
      // engine gives HTTP/HTTPS/SMTP, but scoped to just this one rule.
      await run('powershell -NoProfile -Command "if (!(Get-NetFirewallRule -Name sshd -ErrorAction SilentlyContinue)) { New-NetFirewallRule -Name sshd -DisplayName \'OpenSSH Server (sshd)\' -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 }"');
      return start;
    }
    return run('powershell -NoProfile -Command "Stop-Service sshd"');
  }
  return run(want ? 'systemctl enable --now sshd || systemctl enable --now ssh'
                   : 'systemctl disable --now sshd || systemctl disable --now ssh');
}

function appendAuthorizedKey(pubkey, authorizedKeysPath) {
  const dir = path.dirname(authorizedKeysPath);
  fs.mkdirSync(dir, { recursive: true });
  let existing = '';
  try { existing = fs.readFileSync(authorizedKeysPath, 'utf8'); } catch {}
  if (existing.includes(pubkey.trim())) return { ok: true, alreadyPresent: true };
  fs.appendFileSync(authorizedKeysPath, (existing && !existing.endsWith('\n') ? '\n' : '') + pubkey.trim() + '\n');
  if (!IS_WIN) { try { fs.chmodSync(authorizedKeysPath, 0o600); } catch {} }
  return { ok: true, alreadyPresent: false };
}

// ─── IPC ──────────────────────────────────────────────────────────────────────

ipc.on('ssh:status', async payload => {
  try {
    const status = await detect();
    ipc.send('ssh:status:reply', { requestId: payload?.requestId, ...status, authorizedKeys: cfg.authorizedKeys });
  } catch (e) { ipc.send('ssh:status:reply', { requestId: payload?.requestId, error: e.message }); }
});

ipc.on('ssh:install', async payload => {
  try {
    const result = await install();
    log(`SSH install: ${result.ok ? 'ok' : 'failed — ' + (result.stderr || result.stdout)}`);
    ipc.send('ssh:install:reply', { requestId: payload?.requestId, ...result });
  } catch (e) { ipc.send('ssh:install:reply', { requestId: payload?.requestId, error: e.message }); }
});

ipc.on('ssh:start', async payload => {
  const result = await setRunning(true);
  log(`SSH start: ${result.ok ? 'ok' : 'failed — ' + (result.stderr || result.stdout)}`);
  ipc.send('ssh:start:reply', { requestId: payload?.requestId, ...result });
});

ipc.on('ssh:stop', async payload => {
  const result = await setRunning(false);
  ipc.send('ssh:stop:reply', { requestId: payload?.requestId, ...result });
});

ipc.on('ssh:addkey', payload => {
  const { pubkey, requestId } = payload || {};
  if (!pubkey || !/^(ssh-(rsa|ed25519)|ecdsa-)/.test(pubkey.trim())) {
    return ipc.send('ssh:addkey:reply', { requestId, error: 'that doesn\'t look like a public key (expected ssh-rsa / ssh-ed25519 / ecdsa-...)' });
  }
  detect().then(status => {
    try {
      const r = appendAuthorizedKey(pubkey, status.authorizedKeysPath);
      cfg.authorizedKeys = cfg.authorizedKeys || [];
      if (!r.alreadyPresent) cfg.authorizedKeys.push({ pubkey: pubkey.trim().slice(0, 200), addedAt: Date.now() });
      conf.save(cfg);
      log(`SSH key added to ${status.authorizedKeysPath}`);
      ipc.send('ssh:addkey:reply', { requestId, ok: true, path: status.authorizedKeysPath, alreadyPresent: r.alreadyPresent });
    } catch (e) { ipc.send('ssh:addkey:reply', { requestId, error: e.message }); }
  });
});

// ─── status ping (monitor health check) ──────────────────────────────────────
ipc.on('status:ping', payload => {
  ipc.send('status:pong', { requestId: payload?.requestId, engine: NAME, alive: true, ts: Date.now() });
});

log('ssh engine ready — manages the OS OpenSSH server (does not implement SSH itself)');
