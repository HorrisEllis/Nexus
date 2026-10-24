#!/usr/bin/env node
'use strict';
/**
 * install.js — anonymousservers.info
 * ─────────────────────────────────────────────────────────────────────────────
 * One command does everything:
 *
 *   node install.js
 *
 * What it does:
 *   1. Checks Node version
 *   2. Creates all required directories
 *   3. Runs `node nexus.js init` to write all engine .conf files
 *   4. Detects your public IP and patches ddns.conf
 *   5. Detects available system tools (php, mysql, openssl, docker, wget)
 *   6. Writes a launch script: ./start (or start.bat on Windows)
 *   7. Optionally starts immediately
 *
 * After this, everything is managed with:
 *   ./start                      start the platform
 *   node nexus.js status         check engines
 *   node nexus.js restart <name> hot-restart one engine
 *   node nexus.js logs <name>    tail logs
 *   node nexus.js stop           graceful shutdown
 * ─────────────────────────────────────────────────────────────────────────────
 */

const fs      = require('fs');
const path    = require('path');
const https   = require('https');
const http    = require('http');
const cp      = require('child_process');
const os      = require('os');
const readline = require('readline');

const ROOT = __dirname;

// ─── terminal colors ──────────────────────────────────────────────────────────

const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  green:  '\x1b[32m',
  cyan:   '\x1b[36m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  white:  '\x1b[37m',
  blue:   '\x1b[34m',
  purple: '\x1b[35m',
};

function c(color, str) { return `${C[color]}${str}${C.reset}`; }
function bold(str)      { return `${C.bold}${str}${C.reset}`; }

function banner() {
  console.log('');
  console.log(c('cyan', bold('  ████████╗██╗  ██╗███████╗')));
  console.log(c('cyan', bold('  ╚══██╔══╝██║  ██║██╔════╝')));
  console.log(c('cyan', bold('     ██║   ███████║█████╗  ')));
  console.log(c('cyan', bold('     ██║   ██╔══██║██╔══╝  ')));
  console.log(c('cyan', bold('     ██║   ██║  ██║███████╗')));
  console.log(c('cyan', bold('     ╚═╝   ╚═╝  ╚═╝╚══════╝')));
  console.log('');
  console.log(c('white', bold('  NEXUS — sovereign hosting kernel')));
  console.log(c('dim',   '  anonymousservers.info'));
  console.log('');
}

// ─── step printer ─────────────────────────────────────────────────────────────

let stepN = 0;
function step(label) {
  stepN++;
  process.stdout.write(`  ${c('dim', `${stepN}.`)} ${label} `);
}
function ok(note = '')   { console.log(c('green', '✓') + (note ? c('dim', `  ${note}`) : '')); }
function warn(note = '') { console.log(c('yellow', '⚠') + (note ? c('dim', `  ${note}`) : '')); }
function fail(note = '') { console.log(c('red', '✗') + (note ? `  ${note}` : '')); }
function info(str)       { console.log(c('dim', `     ${str}`)); }

// ─── utils ────────────────────────────────────────────────────────────────────

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function which(bin) {
  try {
    cp.execSync(`which ${bin} 2>/dev/null || where ${bin} 2>nul`, { stdio: 'pipe' });
    return true;
  } catch { return false; }
}

function tryExec(cmd) {
  try { return cp.execSync(cmd, { stdio: 'pipe', timeout: 5000 }).toString().trim(); }
  catch { return null; }
}

function readJSON(p, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return fallback; }
}

function writeJSON(p, obj) {
  ensureDir(path.dirname(p));
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, p);
}

function getPublicIp() {
  const sources = [
    'https://api.ipify.org',
    'https://checkip.amazonaws.com',
    'https://icanhazip.com',
  ];
  return new Promise(resolve => {
    let tried = 0;
    for (const url of sources) {
      const mod = url.startsWith('https') ? https : http;
      const req = mod.get(url, { timeout: 4000 }, res => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
          const ip = body.trim();
          if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) resolve(ip);
          else tryNext();
        });
      });
      req.on('error', tryNext);
      req.on('timeout', () => { req.destroy(); tryNext(); });
    }
    function tryNext() { if (++tried >= sources.length) resolve(null); }
  });
}

function ask(rl, question, defaultVal) {
  return new Promise(resolve => {
    const prompt = defaultVal
      ? `  ${question} ${c('dim', `[${defaultVal}]`)}: `
      : `  ${question}: `;
    rl.question(prompt, answer => {
      resolve(answer.trim() || defaultVal || '');
    });
  });
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  banner();

  // ── 1. Node version ───────────────────────────────────────────────────────

  step('Node.js version');
  const [major] = process.versions.node.split('.').map(Number);
  if (major < 18) {
    fail(`Node.js 18+ required. You have ${process.version}`);
    info('Install from https://nodejs.org or use nvm');
    process.exit(1);
  }
  ok(process.version);

  // ── 2. Check engine files exist ───────────────────────────────────────────

  step('Engine files');
  const engines = [
    'nexus.js', 'engines/_engine.js', 'engines/dns.js', 'engines/ddns.js',
    'engines/tls.js', 'engines/relay.js', 'engines/proxy.js',
    'engines/firewall.js', 'engines/auth.js', 'engines/signal.js',
    'engines/smtp.js', 'engines/cache.js', 'engines/storage.js',
    'engines/queue.js', 'engines/catalog.js',
  ];
  const missing = engines.filter(e => !fs.existsSync(path.join(ROOT, e)));
  if (missing.length) {
    warn(`${missing.length} engine(s) missing — will be skipped`);
    missing.forEach(m => info(`missing: ${m}`));
  } else {
    ok(`${engines.length} engines found`);
  }

  // ── 3. System tools detection ─────────────────────────────────────────────

  step('System tools');
  const tools = {
    openssl: which('openssl'),
    php:     which('php'),
    mysql:   which('mysql') || which('mariadb'),
    docker:  which('docker'),
    wget:    which('wget'),
    curl:    which('curl'),
    git:     which('git'),
    node:    true,
  };
  const available = Object.entries(tools).filter(([, v]) => v).map(([k]) => k);
  ok(available.join('  '));
  const unavailable = Object.entries(tools).filter(([, v]) => !v).map(([k]) => k);
  if (unavailable.length) info(`optional — not found: ${unavailable.join(', ')}`);

  // ── 4. Create directory structure ─────────────────────────────────────────

  step('Directory structure');
  const dirs = [
    'engines', 'conf', 'conf/tls/certs', 'conf/tls/acme',
    'conf/tls/challenges', 'conf/relay', 'conf/smtp/dkim',
    'state', 'state/jaa', 'state/mailboxes', 'state/buckets',
    'state/tmp', 'state/npm', 'logs', 'sites',
  ];
  dirs.forEach(d => ensureDir(path.join(ROOT, d)));
  ok(`${dirs.length} directories`);

  // ── 5. Interactive config ─────────────────────────────────────────────────

  console.log('');
  console.log(c('white', bold('  Configure your platform')));
  console.log(c('dim',   '  Press Enter to accept defaults\n'));

  const iface = readline.createInterface({ input: process.stdin, output: process.stdout });

  const domain  = await ask(iface, 'Your domain', 'anonymousservers.info');
  const email   = await ask(iface, 'Admin email (for TLS certs)', `admin@${domain}`);
  const isWinPort = process.platform === 'win32';
  const httpPort = await ask(iface, 'HTTP port (use 8080 on Windows without admin)', isWinPort ? '8080' : '80');
  const httpsPort = await ask(iface, 'HTTPS port (use 8443 on Windows without admin)', isWinPort ? '8443' : '443');
  const acmeStaging = (await ask(iface, 'Use ACME staging (test certs)? y/n', 'n')).toLowerCase() === 'y';

  let cfToken = '', cfZoneId = '';
  const useCf = (await ask(iface, 'Cloudflare DDNS? y/n', 'n')).toLowerCase() === 'y';
  if (useCf) {
    cfToken  = await ask(iface, 'Cloudflare API token', '');
    cfZoneId = await ask(iface, 'Cloudflare Zone ID', '');
  }

  const relayHost = await ask(iface, 'Phantom relay host (blank to skip)', '');

  iface.close();
  console.log('');

  // ── 6. Detect public IP ───────────────────────────────────────────────────

  step('Public IP');
  const publicIp = await getPublicIp();
  if (publicIp) ok(publicIp);
  else warn('could not detect — set manually in conf/ddns.conf');

  // ── 7. Write engine confs ─────────────────────────────────────────────────

  step('Engine configuration');

  // Run nexus.js init for each engine that exists
  for (const eng of engines) {
    const script = path.join(ROOT, eng);
    if (!fs.existsSync(script)) continue;
    try {
      cp.execFileSync(process.execPath, [script], {
        cwd: ROOT,
        env: { ...process.env, NEXUS_ENGINE: path.basename(eng, '.js'), NEXUS_ROOT: ROOT, NEXUS_INIT: '1' },
        stdio: 'pipe', timeout: 8000,
      });
    } catch {}
  }
  ok('defaults written');

  // ── 8. Patch confs with user input ────────────────────────────────────────

  step('Applying your settings');

  // dns.conf
  const dnsConf = path.join(ROOT, 'conf', 'dns.conf');
  if (fs.existsSync(dnsConf)) {
    const dns = readJSON(dnsConf);
    dns.origin = domain + '.';
    dns.records = (dns.records || []).map(r => {
      if ((r.type === 'A') && publicIp) r.value = publicIp;
      if (r.value?.includes('anonymousservers')) r.value = r.value.replace('anonymousservers.info', domain);
      return r;
    });
    writeJSON(dnsConf, dns);
  }

  // ddns.conf
  const ddnsConf = path.join(ROOT, 'conf', 'ddns.conf');
  if (fs.existsSync(ddnsConf)) {
    const ddns = readJSON(ddnsConf);
    ddns.domain = domain;
    if (publicIp) ddns.lastIp = publicIp;
    if (useCf && cfToken) {
      ddns.provider = 'cloudflare';
      ddns.cloudflare.apiToken = cfToken;
      ddns.cloudflare.zoneId   = cfZoneId;
    }
    writeJSON(ddnsConf, ddns);
  }

  // proxy.conf
  const proxyConf = path.join(ROOT, 'conf', 'proxy.conf');
  if (fs.existsSync(proxyConf)) {
    const proxy = readJSON(proxyConf);
    proxy.domain    = domain;
    proxy.httpPort  = parseInt(httpPort) || 80;
    proxy.httpsPort = parseInt(httpsPort) || 443;
    proxy.vhosts = (proxy.vhosts || []).map(v => ({
      ...v,
      host: v.host.replace('anonymousservers.info', domain),
    }));
    if (!proxy.vhosts.find(v => v.host === domain)) {
      proxy.vhosts.unshift({ host: domain, target: 'static:./sites/root' });
    }
    writeJSON(proxyConf, proxy);
  }

  // tls.conf
  const tlsConf = path.join(ROOT, 'conf', 'tls.conf');
  if (fs.existsSync(tlsConf)) {
    const tlsCfg = readJSON(tlsConf);
    tlsCfg.acmeEmail   = email;
    tlsCfg.acmeStaging = acmeStaging;
    tlsCfg.domains     = [domain, `*.${domain}`];
    writeJSON(tlsConf, tlsCfg);
  }

  // smtp.conf
  const smtpConf = path.join(ROOT, 'conf', 'smtp.conf');
  if (fs.existsSync(smtpConf)) {
    const smtp = readJSON(smtpConf);
    smtp.hostname = `mail.${domain}`;
    smtp.domain   = domain;
    writeJSON(smtpConf, smtp);
  }

  // relay.conf
  const relayConf = path.join(ROOT, 'conf', 'relay.conf');
  if (fs.existsSync(relayConf) && relayHost) {
    const relay = readJSON(relayConf);
    relay.mode      = 'client';
    relay.relayHost = relayHost;
    writeJSON(relayConf, relay);
  }

  // billing.conf — set domain
  const billingConf = path.join(ROOT, 'conf', 'billing.conf');
  if (fs.existsSync(billingConf)) {
    const billing = readJSON(billingConf);
    billing.domain = domain;
    writeJSON(billingConf, billing);
  }

  ok(`domain=${domain} ip=${publicIp || '?'}`);

  // ── 9. Create root site ───────────────────────────────────────────────────

  step('Default site');
  const siteRoot = path.join(ROOT, 'sites', 'root');
  ensureDir(siteRoot);
  if (!fs.existsSync(path.join(siteRoot, 'index.html'))) {
    fs.writeFileSync(path.join(siteRoot, 'index.html'), `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${domain}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0a0a0f; color: #e0e0e0; font-family: 'Courier New', monospace;
           display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .container { text-align: center; padding: 2rem; }
    h1 { font-size: 2.5rem; color: #00d4ff; letter-spacing: 0.1em; margin-bottom: 1rem; }
    p  { color: #888; font-size: 0.9rem; letter-spacing: 0.05em; }
    .dot { display: inline-block; width: 8px; height: 8px; background: #00ff88;
           border-radius: 50%; margin-right: 0.5rem; animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
  </style>
</head>
<body>
  <div class="container">
    <h1>${domain}</h1>
    <p><span class="dot"></span>sovereign hosting — online</p>
  </div>
</body>
</html>`);
  }
  ok(`sites/root/index.html`);

  // ── 10. Write start script ────────────────────────────────────────────────

  step('Launch script');
  const isWin  = process.platform === 'win32';
  const startSh = path.join(ROOT, 'start');
  const startBat = path.join(ROOT, 'start.bat');

  if (!isWin) {
    fs.writeFileSync(startSh,
      `#!/bin/sh\nexec node "${path.join(ROOT, 'nexus.js')}" up "$@"\n`
    );
    fs.chmodSync(startSh, '755');
    ok('./start');
  } else {
    fs.writeFileSync(startBat,
      `@echo off\nnode "${path.join(ROOT, 'nexus.js')}" up %*\n`
    );
    ok('start.bat');
  }

  // ── 11. Write systemd unit (Linux only) ──────────────────────────────────

  if (process.platform === 'linux') {
    const unitPath = path.join(ROOT, 'nexus.service');
    fs.writeFileSync(unitPath, `[Unit]
Description=Nexus — anonymousservers.info
After=network.target

[Service]
Type=simple
User=${os.userInfo().username}
WorkingDirectory=${ROOT}
ExecStart=${process.execPath} ${path.join(ROOT, 'nexus.js')} up
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
`);
    info(`systemd unit written: ${unitPath}`);
    info(`to install: sudo cp nexus.service /etc/systemd/system/ && sudo systemctl enable --now nexus`);
  }

  // ── summary ───────────────────────────────────────────────────────────────

  console.log('');
  console.log(c('green', bold('  ✓ Installation complete')));
  console.log('');
  console.log(c('white', bold('  Start:')));
  console.log(c('cyan',  isWin ? '    start.bat' : '    ./start'));
  console.log('');
  console.log(c('white', bold('  Manage:')));
  console.log(c('dim',   '    node nexus.js status          — engine health'));
  console.log(c('dim',   '    node nexus.js logs proxy       — tail proxy log'));
  console.log(c('dim',   '    node nexus.js restart ddns     — hot-restart one engine'));
  console.log(c('dim',   '    node nexus.js stop             — graceful shutdown'));
  console.log('');
  console.log(c('white', bold('  Install an app:')));
  console.log(c('dim',   `    curl -X POST http://localhost:4005/catalog/install \\`));
  console.log(c('dim',   `      -d '{"app":"wordpress","domain":"blog.${domain}","tenantId":"default"}'`));
  console.log('');
  console.log(c('white', bold('  Available apps:')));
  console.log(c('dim',   '    wordpress  ghost  nextcloud  plausible  gitea  n8n  vaultwarden'));
  console.log('');

  if (publicIp) {
    console.log(c('yellow', `  ⚠  Point your domain's A record to: ${publicIp}`));
    console.log(c('dim',    `     ${domain}  A  ${publicIp}`));
    console.log('');
  }

  if (acmeStaging) {
    console.log(c('yellow', '  ⚠  ACME staging mode — certs will not be trusted by browsers'));
    console.log(c('dim',    '     Change acmeStaging to false in conf/tls.conf for production'));
    console.log('');
  }

  // ── optionally start now ──────────────────────────────────────────────────

  const autoStart = process.argv.includes('--start') || process.argv.includes('-s');
  if (autoStart) {
    console.log(c('cyan', '  Starting nexus...\n'));
    const child = cp.spawn(process.execPath, [path.join(ROOT, 'nexus.js'), 'up'], {
      cwd: ROOT, stdio: 'inherit',
      env: { ...process.env, NEXUS_ROOT: ROOT }
    });
    child.on('exit', code => process.exit(code || 0));
  } else {
    console.log(c('dim', `  Run with ${c('cyan', '--start')} to launch immediately after install`));
    console.log('');
  }
}

main().catch(e => {
  console.error(c('red', `\n  Fatal: ${e.message}`));
  process.exit(1);
});
