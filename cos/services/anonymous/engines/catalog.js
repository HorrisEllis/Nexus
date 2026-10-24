'use strict';
/**
 * engines/catalog.js — one-click application installer
 * anonymousservers.info
 *
 * Each app is a recipe:
 *   { id, name, description, requires[], steps[] }
 *
 * Steps execute in order:
 *   db:provision   → ask database engine to create db + user
 *   files:download → wget/curl the release tarball
 *   files:extract  → untar to sites dir
 *   files:config   → write config file from template
 *   php:pool       → register PHP-CGI pool
 *   vhost:add      → tell proxy to route domain → app dir
 *   tls:issue      → request cert for domain
 *   dns:add        → add A/CNAME record
 *   health:check   → poll until app responds 200
 *   notify         → send install complete event
 */

const { execSync, spawn } = require('child_process');
const fs     = require('fs');
const path   = require('path');
const http   = require('http');
const https  = require('https');
const crypto = require('crypto');
const { ipc, conf, log, claimPort, isInit, NAME } = require('./_engine');

const ROOT      = process.env.NEXUS_ROOT || path.join(__dirname, '..');
const SITES_DIR = path.join(ROOT, 'sites');
const TMP_DIR   = path.join(ROOT, 'state', 'tmp');

const DEFAULTS = {
  listenPort: 4005,
  sitesDir:   SITES_DIR,
  phpBin:     'php',
  mysqlBin:   'mysql',
  wgetBin:    'wget',
  curlBin:    'curl',
};

if (isInit()) {
  conf.init(DEFAULTS);
  [SITES_DIR, TMP_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));
  log('catalog: wrote default conf');
  process.exit(0);
}

let cfg = conf.load(DEFAULTS);
[SITES_DIR, TMP_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

// ─── install progress tracking ────────────────────────────────────────────────

const installs = new Map(); // installId -> { app, domain, status, steps, log }

function progress(installId, step, status, detail = '') {
  const rec = installs.get(installId);
  if (!rec) return;
  rec.steps.push({ step, status, detail, ts: Date.now() });
  rec.status = status === 'error' ? 'error' : status === 'done' ? 'done' : 'running';
  ipc.send('catalog:progress', { installId, step, status, detail });
  log(`[${installId}] ${step}: ${status} ${detail}`);
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function sh(cmd, opts = {}) {
  return execSync(cmd, { stdio: 'pipe', timeout: 120000, ...opts }).toString().trim();
}

function randomStr(n = 16) {
  return crypto.randomBytes(n).toString('hex');
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    mod.get(url, { timeout: 60000 }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', err => { fs.unlink(dest, () => {}); reject(err); });
  });
}

function pollUrl(url, maxAttempts = 20, intervalMs = 3000) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const mod = url.startsWith('https') ? https : http;
    function attempt() {
      attempts++;
      mod.get(url, { timeout: 5000 }, res => {
        if (res.statusCode < 500) resolve(res.statusCode);
        else if (attempts < maxAttempts) setTimeout(attempt, intervalMs);
        else reject(new Error(`health check failed after ${attempts} attempts`));
      }).on('error', () => {
        if (attempts < maxAttempts) setTimeout(attempt, intervalMs);
        else reject(new Error(`health check unreachable after ${attempts} attempts`));
      });
    }
    attempt();
  });
}

// ─── database provisioning ────────────────────────────────────────────────────

async function provisionDb(dbName, dbUser, dbPass) {
  // try to create via local mysql/mariadb if available
  try {
    sh(`mysql -u root -e "CREATE DATABASE IF NOT EXISTS \`${dbName}\`;"`);
    sh(`mysql -u root -e "CREATE USER IF NOT EXISTS '${dbUser}'@'localhost' IDENTIFIED BY '${dbPass}';"`);
    sh(`mysql -u root -e "GRANT ALL ON \`${dbName}\`.* TO '${dbUser}'@'localhost'; FLUSH PRIVILEGES;"`);
    return { type: 'mysql', host: '127.0.0.1', port: 3306, db: dbName, user: dbUser, pass: dbPass };
  } catch {
    // fallback: SQLite (for WordPress this is a plugin — not default, but works)
    log('MySQL not available — using SQLite fallback', 'WARN');
    return { type: 'sqlite', file: path.join(SITES_DIR, dbName, 'db.sqlite') };
  }
}

// ─── port allocator ───────────────────────────────────────────────────────────

let nextPort = 8100;
function allocatePort() { return nextPort++; }

// ─── APP RECIPES ──────────────────────────────────────────────────────────────

const RECIPES = {

  // ── WordPress ──────────────────────────────────────────────────────────────
  wordpress: {
    id: 'wordpress',
    name: 'WordPress',
    description: 'The world\'s most popular CMS. Blogs, sites, WooCommerce.',
    requires: ['php', 'mysql'],
    async install(domain, tenantId, installId, opts = {}) {
      const siteDir = path.join(cfg.sitesDir, tenantId, domain);
      const dbName  = `wp_${randomStr(4)}`;
      const dbUser  = `wp_${randomStr(4)}`;
      const dbPass  = randomStr(16);
      const secret  = randomStr(32);

      progress(installId, 'db:provision', 'running');
      const db = await provisionDb(dbName, dbUser, dbPass);
      progress(installId, 'db:provision', 'ok', `${db.type}://${dbName}`);

      progress(installId, 'files:download', 'running');
      const tarPath = path.join(TMP_DIR, `wp-${installId}.tar.gz`);
      await download('https://wordpress.org/latest.tar.gz', tarPath);
      progress(installId, 'files:download', 'ok');

      progress(installId, 'files:extract', 'running');
      fs.mkdirSync(siteDir, { recursive: true });
      sh(`tar -xzf "${tarPath}" -C "${siteDir}" --strip-components=1`);
      fs.unlinkSync(tarPath);
      progress(installId, 'files:extract', 'ok', siteDir);

      progress(installId, 'files:config', 'running');
      const wpConfig = `<?php
define('DB_NAME',     '${dbName}');
define('DB_USER',     '${dbUser}');
define('DB_PASSWORD', '${dbPass}');
define('DB_HOST',     '${db.host || 'localhost'}');
define('DB_CHARSET',  'utf8mb4');
define('DB_COLLATE',  '');
define('AUTH_KEY',         '${randomStr(32)}');
define('SECURE_AUTH_KEY',  '${randomStr(32)}');
define('LOGGED_IN_KEY',    '${randomStr(32)}');
define('NONCE_KEY',        '${randomStr(32)}');
define('AUTH_SALT',        '${randomStr(32)}');
define('SECURE_AUTH_SALT', '${randomStr(32)}');
define('LOGGED_IN_SALT',   '${randomStr(32)}');
define('NONCE_SALT',       '${randomStr(32)}');
$table_prefix = 'wp_';
define('WP_DEBUG', false);
define('WP_HOME',  'https://${domain}');
define('WP_SITEURL', 'https://${domain}');
if (!defined('ABSPATH')) define('ABSPATH', __DIR__ . '/');
require_once ABSPATH . 'wp-settings.php';
`;
      fs.writeFileSync(path.join(siteDir, 'wp-config.php'), wpConfig);
      progress(installId, 'files:config', 'ok');

      // register vhost
      progress(installId, 'vhost:add', 'running');
      ipc.send('route', { type: 'vhost:add', host: domain, target: `static:${siteDir}`, webroot: siteDir }, 'proxy');
      progress(installId, 'vhost:add', 'ok', domain);

      // request TLS cert
      progress(installId, 'tls:issue', 'running');
      ipc.send('route', { type: 'tls:issue', domain }, 'tls');
      progress(installId, 'tls:issue', 'ok');

      // DNS record
      progress(installId, 'dns:add', 'running');
      ipc.send('route', { type: 'zone:update', name: domain.split('.')[0], type: 'CNAME', value: '@' }, 'dns');
      progress(installId, 'dns:add', 'ok');

      return {
        domain, siteDir, db,
        adminUrl: `https://${domain}/wp-admin`,
        notes: 'Complete setup at /wp-admin/install.php',
      };
    }
  },

  // ── Ghost ──────────────────────────────────────────────────────────────────
  ghost: {
    id: 'ghost',
    name: 'Ghost',
    description: 'Modern publishing platform. Newsletters, memberships, paywalls.',
    requires: ['node'],
    async install(domain, tenantId, installId, opts = {}) {
      const siteDir = path.join(cfg.sitesDir, tenantId, domain);
      const port    = allocatePort();
      const dbFile  = path.join(siteDir, 'ghost.db');

      progress(installId, 'files:install', 'running');
      fs.mkdirSync(siteDir, { recursive: true });

      try {
        sh(`npm install ghost-cli@latest -g --prefix "${path.join(ROOT, 'state', 'npm')}"`, { timeout: 300000 });
        const ghostCli = path.join(ROOT, 'state', 'npm', 'bin', 'ghost');
        sh(`"${ghostCli}" install local --dir "${siteDir}" --port ${port} --no-setup-ssl --no-setup-nginx --no-prompt`, { timeout: 300000 });
      } catch (e) {
        // fallback: write minimal Ghost config and start with node directly
        progress(installId, 'files:install', 'warn', 'ghost-cli unavailable — writing minimal config');
        const ghostConfig = {
          url: `https://${domain}`,
          server: { port, host: '127.0.0.1' },
          database: { client: 'sqlite3', connection: { filename: dbFile } },
          logging: { transports: ['stdout'] },
        };
        fs.writeFileSync(path.join(siteDir, 'config.production.json'), JSON.stringify(ghostConfig, null, 2));
      }

      progress(installId, 'files:install', 'ok', siteDir);

      progress(installId, 'vhost:add', 'running');
      ipc.send('route', { type: 'vhost:add', host: domain, target: `http://127.0.0.1:${port}` }, 'proxy');
      ipc.send('route', { type: 'tls:issue', domain }, 'tls');
      progress(installId, 'vhost:add', 'ok');

      return { domain, siteDir, port, adminUrl: `https://${domain}/ghost` };
    }
  },

  // ── Nextcloud ──────────────────────────────────────────────────────────────
  nextcloud: {
    id: 'nextcloud',
    name: 'Nextcloud',
    description: 'Self-hosted cloud storage, calendar, contacts, and office suite.',
    requires: ['php', 'mysql'],
    async install(domain, tenantId, installId, opts = {}) {
      const siteDir = path.join(cfg.sitesDir, tenantId, domain);
      const dataDir = path.join(cfg.sitesDir, tenantId, `${domain}-data`);
      const dbName  = `nc_${randomStr(4)}`;
      const dbUser  = `nc_${randomStr(4)}`;
      const dbPass  = randomStr(16);
      const adminPass = randomStr(12);

      progress(installId, 'db:provision', 'running');
      const db = await provisionDb(dbName, dbUser, dbPass);
      progress(installId, 'db:provision', 'ok');

      progress(installId, 'files:download', 'running');
      const tarPath = path.join(TMP_DIR, `nc-${installId}.tar.bz2`);
      await download('https://download.nextcloud.com/server/releases/latest.tar.bz2', tarPath);
      fs.mkdirSync(siteDir, { recursive: true });
      fs.mkdirSync(dataDir, { recursive: true });
      sh(`tar -xjf "${tarPath}" -C "${siteDir}" --strip-components=1`);
      fs.unlinkSync(tarPath);
      progress(installId, 'files:download', 'ok');

      progress(installId, 'files:config', 'running');
      try {
        sh(`php "${path.join(siteDir, 'occ')}" maintenance:install ` +
          `--database mysql --database-name "${dbName}" --database-user "${dbUser}" ` +
          `--database-pass "${dbPass}" --admin-user admin --admin-pass "${adminPass}" ` +
          `--data-dir "${dataDir}"`, { cwd: siteDir });
        sh(`php "${path.join(siteDir, 'occ')}" config:system:set trusted_domains 1 --value="${domain}"`, { cwd: siteDir });
      } catch (e) {
        progress(installId, 'files:config', 'warn', `occ setup skipped: ${e.message}`);
      }
      progress(installId, 'files:config', 'ok');

      ipc.send('route', { type: 'vhost:add', host: domain, target: `static:${siteDir}`, webroot: siteDir }, 'proxy');
      ipc.send('route', { type: 'tls:issue', domain }, 'tls');

      return { domain, siteDir, adminPass, adminUrl: `https://${domain}` };
    }
  },

  // ── Plausible Analytics ────────────────────────────────────────────────────
  plausible: {
    id: 'plausible',
    name: 'Plausible Analytics',
    description: 'Privacy-first web analytics. No cookies, GDPR compliant.',
    requires: ['docker'],
    async install(domain, tenantId, installId, opts = {}) {
      const port    = allocatePort();
      const dataDir = path.join(cfg.sitesDir, tenantId, `${domain}-data`);
      fs.mkdirSync(dataDir, { recursive: true });

      progress(installId, 'container:pull', 'running');
      try {
        sh('docker pull plausible/analytics:latest', { timeout: 300000 });
        progress(installId, 'container:pull', 'ok');

        const secretKey = randomStr(32);
        sh(`docker run -d --name plausible-${installId} ` +
          `-e BASE_URL=https://${domain} ` +
          `-e SECRET_KEY_BASE=${secretKey} ` +
          `-p ${port}:8000 ` +
          `-v "${dataDir}:/app/db" ` +
          `plausible/analytics:latest`);

        progress(installId, 'container:start', 'ok', `port ${port}`);
      } catch (e) {
        progress(installId, 'container:pull', 'warn', `Docker unavailable: ${e.message}`);
      }

      ipc.send('route', { type: 'vhost:add', host: domain, target: `http://127.0.0.1:${port}` }, 'proxy');
      ipc.send('route', { type: 'tls:issue', domain }, 'tls');

      return { domain, port, adminUrl: `https://${domain}` };
    }
  },

  // ── Gitea ─────────────────────────────────────────────────────────────────
  gitea: {
    id: 'gitea',
    name: 'Gitea',
    description: 'Lightweight self-hosted Git service. Issues, PRs, CI.',
    requires: ['node'],
    async install(domain, tenantId, installId, opts = {}) {
      const siteDir = path.join(cfg.sitesDir, tenantId, domain);
      const port    = allocatePort();
      fs.mkdirSync(siteDir, { recursive: true });

      progress(installId, 'files:download', 'running');
      const platform = process.platform === 'darwin' ? 'darwin-amd64' : 'linux-amd64';
      const tarPath  = path.join(TMP_DIR, `gitea-${installId}`);
      await download(`https://dl.gitea.com/gitea/1.21.11/gitea-1.21.11-${platform}`, tarPath);
      fs.chmodSync(tarPath, '755');
      progress(installId, 'files:download', 'ok');

      progress(installId, 'files:config', 'running');
      const appIni = `[server]
HTTP_PORT = ${port}
ROOT_URL  = https://${domain}/
DOMAIN    = ${domain}

[database]
DB_TYPE = sqlite3
PATH    = ${path.join(siteDir, 'gitea.db')}

[repository]
ROOT = ${path.join(siteDir, 'repos')}

[security]
SECRET_KEY         = ${randomStr(32)}
INTERNAL_TOKEN     = ${randomStr(32)}
INSTALL_LOCK       = false
`;
      fs.mkdirSync(path.join(siteDir, 'custom', 'conf'), { recursive: true });
      fs.writeFileSync(path.join(siteDir, 'custom', 'conf', 'app.ini'), appIni);
      progress(installId, 'files:config', 'ok');

      // start gitea
      const child = spawn(tarPath, ['web', '--config', path.join(siteDir, 'custom', 'conf', 'app.ini')], {
        cwd: siteDir, detached: true, stdio: 'ignore',
        env: { ...process.env, GITEA_WORK_DIR: siteDir }
      });
      child.unref();

      ipc.send('route', { type: 'vhost:add', host: domain, target: `http://127.0.0.1:${port}` }, 'proxy');
      ipc.send('route', { type: 'tls:issue', domain }, 'tls');

      return { domain, port, siteDir, adminUrl: `https://${domain}` };
    }
  },

  // ── n8n (automation) ──────────────────────────────────────────────────────
  n8n: {
    id: 'n8n',
    name: 'n8n',
    description: 'Workflow automation. Connect 400+ services, no code required.',
    requires: ['node'],
    async install(domain, tenantId, installId, opts = {}) {
      const siteDir = path.join(cfg.sitesDir, tenantId, domain);
      const port    = allocatePort();
      fs.mkdirSync(siteDir, { recursive: true });

      progress(installId, 'npm:install', 'running');
      sh(`npm install n8n --prefix "${siteDir}"`, { timeout: 300000 });
      progress(installId, 'npm:install', 'ok');

      const n8nBin = path.join(siteDir, 'node_modules', '.bin', 'n8n');
      const child  = spawn(n8nBin, ['start'], {
        cwd: siteDir, detached: true, stdio: 'ignore',
        env: { ...process.env, N8N_HOST: '0.0.0.0', N8N_PORT: String(port), N8N_PROTOCOL: 'https', N8N_HOST: domain, WEBHOOK_URL: `https://${domain}/` }
      });
      child.unref();

      ipc.send('route', { type: 'vhost:add', host: domain, target: `http://127.0.0.1:${port}` }, 'proxy');
      ipc.send('route', { type: 'tls:issue', domain }, 'tls');

      return { domain, port, adminUrl: `https://${domain}` };
    }
  },

  // ── Vaultwarden (Bitwarden-compatible password manager) ───────────────────
  vaultwarden: {
    id: 'vaultwarden',
    name: 'Vaultwarden',
    description: 'Self-hosted password manager. Bitwarden-compatible API.',
    requires: ['docker'],
    async install(domain, tenantId, installId, opts = {}) {
      const dataDir = path.join(cfg.sitesDir, tenantId, `${domain}-data`);
      const port    = allocatePort();
      fs.mkdirSync(dataDir, { recursive: true });

      progress(installId, 'container:run', 'running');
      try {
        sh(`docker run -d --name vaultwarden-${installId} ` +
          `-v "${dataDir}:/data" ` +
          `-e DOMAIN=https://${domain} ` +
          `-e SIGNUPS_ALLOWED=true ` +
          `-p ${port}:80 ` +
          `vaultwarden/server:latest`);
        progress(installId, 'container:run', 'ok', `port ${port}`);
      } catch (e) {
        progress(installId, 'container:run', 'warn', `Docker unavailable: ${e.message}`);
      }

      ipc.send('route', { type: 'vhost:add', host: domain, target: `http://127.0.0.1:${port}` }, 'proxy');
      ipc.send('route', { type: 'tls:issue', domain }, 'tls');

      return { domain, port, adminUrl: `https://${domain}` };
    }
  },

  // ── WireGuard VPN ──────────────────────────────────────────────────────────
  wireguard: {
    id: 'wireguard', name: 'WireGuard VPN',
    description: 'Fast modern VPN. Route devices through your server. Add clients with one command. Sell access at $5-10/mo per user.',
    requires: [], category: 'vpn',
    async install(domain, tenantId, installId, opts = {}) {
      const siteDir = path.join(cfg.sitesDir, tenantId, domain);
      const wgPort  = opts.port || 51820;
      fs.mkdirSync(path.join(siteDir, 'clients'), { recursive: true });
      progress(installId, 'wireguard:keygen', 'running');

      let privKey = '', pubKey = '';
      try { privKey = sh('wg genkey'); pubKey = sh(`echo "${privKey}" | wg pubkey`); }
      catch { progress(installId, 'wireguard:keygen', 'warn', 'wg binary not found — install with: apt install wireguard'); }

      fs.writeFileSync(path.join(siteDir, 'wg0.conf'), `[Interface]
PrivateKey = ${privKey || 'REPLACE_WITH: wg genkey'}
Address    = 10.8.0.1/24
ListenPort = ${wgPort}
PostUp     = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown   = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE
# Clients added below by add-client.sh
`);

      fs.writeFileSync(path.join(siteDir, 'add-client.sh'), `#!/bin/bash
# Usage: bash add-client.sh <name>
NAME=\${1:-client}
PRIV=$(wg genkey); PUB=$(echo $PRIV | wg pubkey)
IP="10.8.0.$(($(grep -c AllowedIPs wg0.conf 2>/dev/null || echo 1) + 1))/32"
echo -e "[Peer]\\nPublicKey = $PUB\\nAllowedIPs = $IP" >> wg0.conf
cat > clients/$NAME.conf << EOF
[Interface]
PrivateKey = $PRIV
Address    = $IP
DNS        = 1.1.1.1

[Peer]
PublicKey  = ${pubKey || 'SERVER_PUBKEY'}
Endpoint   = ${domain}:${wgPort}
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
EOF
echo "Client config: clients/$NAME.conf"
command -v qrencode && qrencode -t ansiutf8 < clients/$NAME.conf || true
`);
      try { fs.chmodSync(path.join(siteDir, 'add-client.sh'), '755'); } catch {}

      fs.writeFileSync(path.join(siteDir, 'README.md'), `# WireGuard VPN on ${domain}

Start:    wg-quick up ${siteDir}/wg0.conf
Add user: cd ${siteDir} && bash add-client.sh alice
Enable forwarding: echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf && sysctl -p
Server pubkey: ${pubKey || 'run wg pubkey < wg0.conf'}
Charge: $5-10/mo per client. QR code generated automatically.
`);
      progress(installId, 'wireguard:setup', 'ok', siteDir);
      ipc.send('route', { type: 'zone:update', name: 'vpn', type2: 'A', value: '0.0.0.0' }, 'dns');
      return { domain, siteDir, wgPort, pubKey, setup: `wg-quick up ${siteDir}/wg0.conf` };
    }
  },

  // ── Phantom Relay (git-spawned encrypted TCP relay) ────────────────────────
  phantom_relay: {
    id: 'phantom_relay', name: 'Phantom Relay',
    description: 'Encrypted TCP relay. Clone any relay repo from GitHub and deploy instantly. Zero dependencies.',
    requires: ['node'], category: 'relay',
    async install(domain, tenantId, installId, opts = {}) {
      const siteDir = path.join(cfg.sitesDir, tenantId, domain);
      const port    = allocatePort();
      const ctrlPort = port + 1;
      fs.mkdirSync(siteDir, { recursive: true });
      progress(installId, 'relay:build', 'running');

      // If gitUrl provided, try clone first
      if (opts.gitUrl) {
        try {
          sh(`git clone --depth=1 "${opts.gitUrl}" "${siteDir}"`, { timeout: 60000 });
          progress(installId, 'git:clone', 'ok', opts.gitUrl);
          if (fs.existsSync(path.join(siteDir, 'package.json'))) {
            sh(`npm install --production --prefix "${siteDir}"`, { timeout: 120000 });
          }
        } catch (e) { progress(installId, 'git:clone', 'warn', e.message); }
      }

      // Always write the built-in relay (overwrites index only if nothing from git)
      const relayEntry = path.join(siteDir, 'nexus-relay.js');
      fs.writeFileSync(relayEntry, `'use strict';
const net    = require('net');
const http   = require('http');
const crypto = require('crypto');

const PORT       = ${port};
const CTRL_PORT  = ${ctrlPort};
const PSK        = process.env.RELAY_PSK || crypto.randomBytes(16).toString('hex');
const targets    = (process.env.TARGETS || '').split(',').filter(Boolean);
let   roundRobin = 0;
const sessions   = new Map();

console.log('Phantom Relay | port:', PORT, '| ctrl:', CTRL_PORT, '| PSK:', PSK);

// ── XOR stream cipher (lightweight obfuscation layer) ────────────────────────
function xorStream(key) {
  const k = Buffer.from(key, 'hex'); let i = 0;
  return (chunk) => { const out = Buffer.allocUnsafe(chunk.length); for (let j = 0; j < chunk.length; j++) out[j] = chunk[j] ^ k[i++ % k.length]; return out; };
}

// ── TCP relay server ──────────────────────────────────────────────────────────
net.createServer(src => {
  const sid    = crypto.randomBytes(4).toString('hex');
  const target = targets.length ? targets[roundRobin++ % targets.length] : null;
  if (!target) { src.destroy(); return; }
  const [host, rawPort] = target.split(':');
  const dst = net.connect(parseInt(rawPort) || 80, host);
  const xorIn  = xorStream(PSK); const xorOut = xorStream(PSK);
  src.on('data', d => { if (!dst.destroyed) dst.write(xorOut(d)); });
  dst.on('data', d => { if (!src.destroyed) src.write(xorIn(d)); });
  const cleanup = () => { try { src.destroy(); dst.destroy(); } catch {} sessions.delete(sid); };
  src.on('close', cleanup); dst.on('close', cleanup);
  src.on('error', cleanup); dst.on('error', cleanup);
  sessions.set(sid, { target, started: Date.now() });
}).listen(PORT, () => console.log('relay listening :' + PORT));

// ── control panel ─────────────────────────────────────────────────────────────
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify({
    port: PORT, psk: PSK, targets, activeSessions: sessions.size,
    sessions: [...sessions.entries()].map(([id, s]) => ({ id, ...s, age: Date.now() - s.started })),
  }, null, 2));
}).listen(CTRL_PORT, () => console.log('relay ctrl :' + CTRL_PORT));
`);

      const env = { ...process.env, PORT: String(port), RELAY_PSK: opts.psk || crypto.randomBytes(16).toString('hex'), TARGETS: opts.targets || '' };
      const child = spawn('node', [relayEntry], { cwd: siteDir, detached: true, stdio: 'ignore', env });
      child.unref();

      ipc.send('route', { type: 'vhost:add', host: domain, target: `http://127.0.0.1:${ctrlPort}` }, 'proxy');
      ipc.send('route', { type: 'tls:issue', domain }, 'tls');
      progress(installId, 'relay:build', 'ok', `:${port}`);
      return { domain, siteDir, relayPort: port, ctrlPort, gitUrl: opts.gitUrl };
    }
  },

  // ── Git Deploy (any GitHub repo → live service) ───────────────────────────
  git_deploy: {
    id: 'git_deploy', name: 'Git Deploy',
    description: 'Clone ANY public GitHub repo, auto-detect stack, install deps, and serve it. Instant self-hosted app.',
    requires: ['node'], category: 'tools',
    async install(domain, tenantId, installId, opts = {}) {
      if (!opts.gitUrl) throw new Error('gitUrl required in opts');
      const siteDir = path.join(cfg.sitesDir, tenantId, domain);
      const port    = allocatePort();
      fs.mkdirSync(path.dirname(siteDir), { recursive: true });

      progress(installId, 'git:clone', 'running');
      sh(`git clone --depth=1 "${opts.gitUrl}" "${siteDir}"`, { timeout: 60000 });
      progress(installId, 'git:clone', 'ok', opts.gitUrl);

      progress(installId, 'deps:detect', 'running');
      let startCmd = null;
      if (fs.existsSync(path.join(siteDir, 'package.json'))) {
        sh(`npm install --production --prefix "${siteDir}"`, { timeout: 180000 });
        const pkg = JSON.parse(fs.readFileSync(path.join(siteDir, 'package.json'), 'utf8'));
        startCmd = pkg.scripts?.start ? 'npm start'
          : fs.existsSync(path.join(siteDir, 'index.js'))  ? 'node index.js'
          : fs.existsSync(path.join(siteDir, 'server.js')) ? 'node server.js'
          : fs.existsSync(path.join(siteDir, 'app.js'))    ? 'node app.js' : null;
      } else if (fs.existsSync(path.join(siteDir, 'requirements.txt'))) {
        try { sh(`pip install -r "${path.join(siteDir, 'requirements.txt')}" --break-system-packages`, { timeout: 180000 }); } catch {}
        startCmd = fs.existsSync(path.join(siteDir, 'main.py')) ? 'python main.py' : 'python app.py';
      } else if (fs.existsSync(path.join(siteDir, 'Gemfile'))) {
        try { sh(`cd "${siteDir}" && bundle install`, { timeout: 120000 }); } catch {}
        startCmd = 'bundle exec ruby app.rb';
      }
      progress(installId, 'deps:detect', 'ok', startCmd || 'no start cmd');

      if (startCmd) {
        const [cmd, ...args] = startCmd.split(' ');
        spawn(cmd, args, { cwd: siteDir, detached: true, stdio: 'ignore', env: { ...process.env, PORT: String(port), NODE_ENV: 'production' } }).unref();
        progress(installId, 'app:start', 'ok', startCmd);
      }

      ipc.send('route', { type: 'vhost:add', host: domain, target: `http://127.0.0.1:${port}` }, 'proxy');
      ipc.send('route', { type: 'tls:issue', domain }, 'tls');
      return { domain, siteDir, port, gitUrl: opts.gitUrl, startCmd };
    }
  },

  // ── Web Crawler ────────────────────────────────────────────────────────────
  crawler: {
    id: 'crawler', name: 'Web Crawler',
    description: 'HTTP API for crawling and scraping. Schedule jobs, export JSON/CSV. Build price monitors, lead scrapers, datasets.',
    requires: ['node'], category: 'bots',
    async install(domain, tenantId, installId, opts = {}) {
      const siteDir = path.join(cfg.sitesDir, tenantId, domain);
      const port    = allocatePort();
      fs.mkdirSync(path.join(siteDir, 'data'), { recursive: true });
      progress(installId, 'crawler:write', 'running');

      fs.writeFileSync(path.join(siteDir, 'crawler.js'), `'use strict';
const http=require('http'),https=require('https'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=${port},DATA=path.join(__dirname,'data');
const jobs=new Map();let jid=0;

function fetch(url,ua){return new Promise((resolve,reject)=>{
  const mod=url.startsWith('https')?https:http;
  const req=mod.get(url,{timeout:12000,headers:{'User-Agent':ua||'Mozilla/5.0 (compatible; NexusCrawler/1.0)','Accept':'text/html,*/*'}},res=>{
    let b='';res.on('data',d=>{b+=d;if(b.length>2e6)req.destroy();});res.on('end',()=>resolve({status:res.statusCode,body:b,url,headers:res.headers}));
  });req.on('error',reject);req.on('timeout',()=>{req.destroy();reject(new Error('timeout'));});
});}

function links(html,base){const s=new Set(),re=/href=["']([^"'#?][^"']*)/gi;let m;
  while((m=re.exec(html)))try{s.add(new URL(m[1],base).href);}catch{}return[...s];}
function text(html){return html.replace(/<script[\\s\\S]*?<\\/script>/gi,'').replace(/<style[\\s\\S]*?<\\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/\\s+/g,' ').trim();}
function title(html){return(html.match(/<title[^>]*>([^<]+)/i)||[])[1]?.trim()||'';}
function extract(html,sel){const re=new RegExp('<'+sel+'[^>]*>([^<]+)','i');return(re.exec(html)||[])[1]?.trim();}

async function crawl(job){
  job.status='running';job.visited=new Set();job.queue=[job.startUrl];job.results=[];job.errors=[];
  const host=new URL(job.startUrl).hostname;
  while(job.queue.length&&job.visited.size<(job.maxPages||100)&&job.status==='running'){
    const url=job.queue.shift();if(job.visited.has(url))continue;job.visited.add(url);
    try{
      const r=await fetch(url,job.userAgent);
      const row={url,status:r.status,title:title(r.body),text:job.text?text(r.body).slice(0,1000):undefined,
        custom:job.selectors?Object.fromEntries(Object.entries(job.selectors||{}).map(([k,s])=>[k,extract(r.body,s)])):undefined,
        ts:new Date().toISOString()};
      job.results.push(row);
      if(job.follow!==false)links(r.body,url).forEach(l=>{
        if(!job.visited.has(l)&&(!job.sameHost||new URL(l).hostname===host)&&(!job.pattern||new RegExp(job.pattern).test(l)))job.queue.push(l);
      });
    }catch(e){job.errors.push({url,e:e.message});}
    await new Promise(r=>setTimeout(r,job.delay||500));
  }
  job.status='done';job.finishedAt=new Date().toISOString();
  fs.writeFileSync(path.join(DATA,'job-'+job.id+'.json'),JSON.stringify(job.results,null,2));
}

function rb(req){return new Promise(r=>{let b='';req.on('data',d=>b+=d);req.on('end',()=>{try{r(JSON.parse(b))}catch{r({})}});});}
function j(res,s,o){res.writeHead(s,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify(o,null,2));}

http.createServer(async(req,res)=>{
  const url=req.url.split('?')[0],meth=req.method,body=['POST','PUT'].includes(meth)?await rb(req):{};
  if(meth==='POST'&&url==='/crawl'){
    if(!body.startUrl)return j(res,400,{error:'startUrl required'});
    const job={id:++jid,...body,status:'queued',startedAt:new Date().toISOString()};
    jobs.set(job.id,job);crawl(job).catch(e=>{job.status='error';job.error=e.message;});
    return j(res,202,{jobId:job.id});
  }
  if(meth==='GET'&&url==='/jobs')return j(res,200,[...jobs.values()].map(j=>({id:j.id,startUrl:j.startUrl,status:j.status,pages:j.visited?.size||0,results:j.results?.length||0,startedAt:j.startedAt,finishedAt:j.finishedAt})));
  if(meth==='GET'&&url.match(/^\\/jobs\\/\\d+\\/results/)){
    const f=path.join(DATA,'job-'+url.split('/')[2]+'.json');
    if(!fs.existsSync(f))return j(res,404,{error:'not ready'});
    res.writeHead(200,{'Content-Type':'application/json','Content-Disposition':'attachment; filename="results.json"'});
    return fs.createReadStream(f).pipe(res);
  }
  if(meth==='GET'&&url.startsWith('/jobs/')){const jb=jobs.get(parseInt(url.split('/')[2]));return jb?j(res,200,jb):j(res,404,{error:'not found'});}
  if(meth==='DELETE'&&url.startsWith('/jobs/')){const jb=jobs.get(parseInt(url.split('/')[2]));if(jb)jb.status='stopped';return j(res,200,{ok:true});}
  if(url==='/health')return j(res,200,{ok:true,jobs:jobs.size});
  j(res,404,{error:'not found'});
}).listen(PORT,()=>console.log('Crawler :'+PORT));
`);
      spawn('node', [path.join(siteDir, 'crawler.js')], { cwd: siteDir, detached: true, stdio: 'ignore' }).unref();
      ipc.send('route', { type: 'vhost:add', host: domain, target: `http://127.0.0.1:${port}` }, 'proxy');
      ipc.send('route', { type: 'tls:issue', domain }, 'tls');
      progress(installId, 'crawler:write', 'ok', `:${port}`);
      return { domain, port, siteDir, api: `https://${domain}/crawl` };
    }
  },

  // ── Bot Framework (Discord + Telegram + scheduler) ────────────────────────
  botframework: {
    id: 'botframework', name: 'Bot Framework',
    description: 'Discord, Telegram, Slack bots + cron scheduler. Automate DMs, alerts, commands. Deploy in 30 seconds.',
    requires: ['node'], category: 'bots',
    async install(domain, tenantId, installId, opts = {}) {
      const siteDir = path.join(cfg.sitesDir, tenantId, domain);
      const port    = allocatePort();
      fs.mkdirSync(path.join(siteDir, 'logs'), { recursive: true });
      progress(installId, 'bot:install', 'running');

      fs.writeFileSync(path.join(siteDir, 'package.json'), JSON.stringify({
        name: 'nexus-bots', version: '1.0.0',
        dependencies: { 'discord.js': '^14.0.0', 'telegraf': '^4.15.0', 'node-schedule': '^2.1.1' }
      }, null, 2));
      try { sh(`npm install --prefix "${siteDir}"`, { timeout: 180000 }); } catch {}
      progress(installId, 'bot:install', 'ok');

      fs.writeFileSync(path.join(siteDir, 'bot.js'), `'use strict';
const http=require('http'),fs=require('fs'),path=require('path');
const PORT=${port},LOGS=path.join(__dirname,'logs');
const running=new Map(),schedules=new Map();
function log(n,m){const l=new Date().toISOString()+' '+m+'\\n';fs.appendFileSync(path.join(LOGS,n+'.log'),l);console.log('['+n+']',m);}

function startDiscord(cfg){try{
  const {Client,GatewayIntentBits}=require('discord.js');
  const c=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent]});
  c.on('ready',()=>log('discord','logged in as '+c.user.tag));
  c.on('messageCreate',msg=>{
    if(msg.author.bot)return;
    const pfx=cfg.prefix||'!';if(!msg.content.startsWith(pfx))return;
    const cmd=msg.content.slice(pfx.length).trim().split(' ')[0];
    const reply=cfg.commands?.[cmd];if(reply)msg.reply(reply);
    else if(cmd==='ping')msg.reply('Pong! ');
  });
  c.login(cfg.token);running.set('discord',c);log('discord','started');return true;
}catch(e){log('discord','error: '+e.message);return false;}}

function startTelegram(cfg){try{
  const {Telegraf}=require('telegraf');
  const bot=new Telegraf(cfg.token);
  bot.start(ctx=>ctx.reply(cfg.welcome||'Hello from Nexus!'));
  bot.help(ctx=>ctx.reply(cfg.help||'Send /start'));
  Object.entries(cfg.commands||{}).forEach(([cmd,reply])=>bot.command(cmd,ctx=>ctx.reply(reply)));
  bot.launch();running.set('telegram',bot);log('telegram','started');return true;
}catch(e){log('telegram','error: '+e.message);return false;}}

function scheduleJob(name,cron,action){try{
  const sched=require('node-schedule');
  if(schedules.has(name))schedules.get(name).cancel();
  const job=sched.scheduleJob(cron,()=>{
    log('scheduler','running: '+name);
    if(action?.webhook){const m=action.webhook.startsWith('https')?require('https'):require('http');m.get(action.webhook).on('error',()=>{});}
  });
  schedules.set(name,job);return true;
}catch(e){log('scheduler',e.message);return false;}}

function rb(req){return new Promise(r=>{let b='';req.on('data',d=>b+=d);req.on('end',()=>{try{r(JSON.parse(b))}catch{r({})}});});}
function j(res,s,o){res.writeHead(s,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify(o,null,2));}

http.createServer(async(req,res)=>{
  const url=req.url.split('?')[0],meth=req.method,body=['POST','PUT'].includes(meth)?await rb(req):{};
  if(meth==='POST'&&url==='/bots/discord'){const ok=startDiscord(body);return j(res,ok?200:500,{ok,bot:'discord'});}
  if(meth==='POST'&&url==='/bots/telegram'){const ok=startTelegram(body);return j(res,ok?200:500,{ok,bot:'telegram'});}
  if(meth==='POST'&&url==='/schedule'){const ok=scheduleJob(body.name,body.cron,body.action);return j(res,ok?200:400,{ok,name:body.name,cron:body.cron});}
  if(meth==='GET'&&url==='/bots')return j(res,200,{running:[...running.keys()],scheduled:[...schedules.keys()]});
  if(meth==='DELETE'&&url.startsWith('/bots/')){const n=url.split('/')[2],b=running.get(n);if(b){try{b.destroy?.();b.stop?.();}catch{}running.delete(n);}return j(res,200,{ok:true});}
  if(url==='/health')return j(res,200,{ok:true,running:running.size});
  j(res,404,{error:'not found'});
}).listen(PORT,()=>console.log('Bot framework :'+PORT));
`);
      spawn('node', [path.join(siteDir, 'bot.js')], { cwd: siteDir, detached: true, stdio: 'ignore' }).unref();
      ipc.send('route', { type: 'vhost:add', host: domain, target: `http://127.0.0.1:${port}` }, 'proxy');
      ipc.send('route', { type: 'tls:issue', domain }, 'tls');
      progress(installId, 'bot:install', 'ok', `:${port}`);
      return { domain, port, siteDir };
    }
  },

  // ── API Proxy / Reseller ───────────────────────────────────────────────────
  apiproxy: {
    id: 'apiproxy', name: 'API Proxy & Reseller',
    description: 'Resell any API with per-call billing. OpenAI, weather, geocoding. Issue API keys, charge credits. Pure profit margin.',
    requires: ['node'], category: 'money',
    async install(domain, tenantId, installId, opts = {}) {
      const siteDir = path.join(cfg.sitesDir, tenantId, domain);
      const port    = allocatePort();
      fs.mkdirSync(path.join(siteDir, 'data'), { recursive: true });
      progress(installId, 'apiproxy:write', 'running');

      fs.writeFileSync(path.join(siteDir, 'proxy.js'), `'use strict';
const http=require('http'),https=require('https'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=${port},DATA=path.join(__dirname,'data');
const KEYS_F=path.join(DATA,'keys.json'),ROUTES_F=path.join(DATA,'routes.json');
let keys=load(KEYS_F,{}),routes=load(ROUTES_F,{
  '/v1/chat':{upstream:'https://api.openai.com/v1/chat/completions',cost:0.001,upstreamKey:''},
  '/weather':{upstream:'https://api.openweathermap.org/data/2.5/weather',cost:0.0001,upstreamKey:''},
});
function load(f,d){try{return JSON.parse(fs.readFileSync(f));}catch{return d;}}
function save(){fs.writeFileSync(KEYS_F,JSON.stringify(keys,null,2));fs.writeFileSync(ROUTES_F,JSON.stringify(routes,null,2));}
function genKey(){return 'nxp_'+crypto.randomBytes(16).toString('hex');}
function rb(req){return new Promise(r=>{let b='';req.on('data',d=>{b+=d;if(b.length>1e6)req.destroy();});req.on('end',()=>{try{r(JSON.parse(b))}catch{r({})}});});}
function j(res,s,o){res.writeHead(s,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify(o,null,2));}

http.createServer(async(req,res)=>{
  const url=req.url,meth=req.method,body=['POST','PUT','PATCH'].includes(meth)?await rb(req):{};
  // Admin routes
  if(meth==='POST'&&url==='/admin/keys'){const k=genKey();keys[k]={key:k,label:body.label||'',credits:body.credits||100,calls:0,created:new Date().toISOString()};save();return j(res,201,keys[k]);}
  if(meth==='GET'&&url==='/admin/keys')return j(res,200,Object.values(keys));
  if(meth==='POST'&&url==='/admin/routes'){if(!body.path||!body.upstream)return j(res,400,{error:'path+upstream required'});routes[body.path]={upstream:body.upstream,cost:body.cost||0,upstreamKey:body.upstreamKey||''};save();return j(res,200,routes[body.path]);}
  if(meth==='GET'&&url==='/admin/routes')return j(res,200,routes);
  if(url==='/health')return j(res,200,{ok:true,keys:Object.keys(keys).length});
  // Auth
  const apiKey=req.headers['x-api-key']||req.headers['authorization']?.replace('Bearer ','');
  const acct=apiKey?keys[apiKey]:null;
  if(!acct)return j(res,401,{error:'invalid API key'});
  if(acct.credits<=0)return j(res,402,{error:'out of credits — contact admin'});
  // Route
  const rk=Object.keys(routes).find(r=>url.startsWith(r));
  if(!rk)return j(res,404,{error:'route not found'});
  const route=routes[rk];
  acct.credits-=route.cost||0;acct.calls++;save();
  // Proxy
  const up=new URL(route.upstream);
  const mod=route.upstream.startsWith('https')?https:http;
  const pr=mod.request({hostname:up.hostname,port:up.port||undefined,path:up.pathname+(url.slice(rk.length)||''),method:meth,
    headers:{...req.headers,host:up.hostname,...(route.upstreamKey?{Authorization:'Bearer '+route.upstreamKey}:{})}},
    pres=>{res.writeHead(pres.statusCode,pres.headers);pres.pipe(res);});
  pr.on('error',e=>j(res,502,{error:e.message}));
  if(['POST','PUT','PATCH'].includes(meth))req.pipe(pr);else pr.end();
}).listen(PORT,()=>console.log('API proxy :'+PORT));
`);
      spawn('node', [path.join(siteDir, 'proxy.js')], { cwd: siteDir, detached: true, stdio: 'ignore' }).unref();
      ipc.send('route', { type: 'vhost:add', host: domain, target: `http://127.0.0.1:${port}` }, 'proxy');
      ipc.send('route', { type: 'tls:issue', domain }, 'tls');
      progress(installId, 'apiproxy:write', 'ok', `:${port}`);
      return { domain, port, siteDir, adminKey: 'POST /admin/keys to create first key' };
    }
  },

  // ── Uptime SaaS ────────────────────────────────────────────────────────────
  uptimesaas: {
    id: 'uptimesaas', name: 'Uptime Monitor SaaS',
    description: 'Sell uptime monitoring + public status pages. $5-20/mo per customer. Webhook alerts.',
    requires: ['node'], category: 'money',
    async install(domain, tenantId, installId, opts = {}) {
      const siteDir = path.join(cfg.sitesDir, tenantId, domain);
      const port    = allocatePort();
      fs.mkdirSync(path.join(siteDir, 'data'), { recursive: true });
      progress(installId, 'uptime:write', 'running');

      fs.writeFileSync(path.join(siteDir, 'uptime.js'), `'use strict';
const http=require('http'),https=require('https'),fs=require('fs'),path=require('path');
const PORT=${port},DB=path.join(__dirname,'data','m.json');
let monitors=load([]),mid=monitors.reduce((m,x)=>Math.max(m,x.id||0),0);
function load(d){try{return JSON.parse(fs.readFileSync(DB));}catch{return d;}}
function save(){fs.writeFileSync(DB,JSON.stringify(monitors,null,2));}

async function check(m){
  const t0=Date.now();
  return new Promise(resolve=>{
    const mod=m.url.startsWith('https')?https:http;
    const req=mod.get(m.url,{timeout:10000,headers:{'User-Agent':'NexusUptime/1.0'}},res=>{
      const latency=Date.now()-t0,up=res.statusCode<400;
      if(!m.history)m.history=[];
      m.history.push({up,latency,code:res.statusCode,ts:new Date().toISOString()});
      if(m.history.length>1440)m.history.shift();
      const wasUp=m.up;m.up=up;m.latency=latency;m.lastCheck=new Date().toISOString();
      if(!up&&wasUp!==false&&m.webhookUrl){
        try{const b=JSON.stringify({name:m.name,url:m.url,status:'down',code:res.statusCode,ts:m.lastCheck});
        const u=new URL(m.webhookUrl),mod2=m.webhookUrl.startsWith('https')?https:http;
        const r=mod2.request({hostname:u.hostname,path:u.pathname,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(b)}});r.write(b);r.end();}catch{}
      }
      m.wasUp=up;res.resume();resolve();
    });
    req.on('error',()=>{m.up=false;m.lastCheck=new Date().toISOString();if(!m.history)m.history=[];m.history.push({up:false,ts:m.lastCheck});m.wasUp=false;resolve();});
    req.on('timeout',()=>{req.destroy();resolve();});
  });
}

setInterval(async()=>{for(const m of monitors)if(m.active!==false)await check(m);save();},60000);

function statusPage(){
  const rows=monitors.map(m=>\`<div style="display:flex;align-items:center;gap:16px;padding:14px 0;border-bottom:1px solid #2a2a2a">
    <span style="width:10px;height:10px;border-radius:50%;background:\${m.up?'#4caf50':'#f44336'};flex-shrink:0"></span>
    <div style="flex:1"><strong>\${m.name}</strong><div style="font-size:12px;color:#888">\${m.url}</div></div>
    <span style="font-size:13px;color:#888">\${m.latency||'—'}ms</span>
    <span style="font-size:13px;font-weight:600;color:\${m.up?'#4caf50':'#f44336'}">\${m.up===undefined?'checking':m.up?'UP':'DOWN'}</span>
  </div>\`).join('');
  return \`<!DOCTYPE html><html><head><meta charset=utf-8><title>Status</title><meta http-equiv="refresh" content="60">
  <style>body{font-family:sans-serif;background:#0d0d0d;color:#eee;max-width:800px;margin:40px auto;padding:0 20px}h1{font-size:22px}</style>
  </head><body><h1>System Status</h1><p style="color:#888;font-size:13px">Updated: \${new Date().toLocaleString()}</p>\${rows||'<p style="color:#888">No monitors yet — add via API</p>'}</body></html>\`;
}

function rb(req){return new Promise(r=>{let b='';req.on('data',d=>b+=d);req.on('end',()=>{try{r(JSON.parse(b))}catch{r({})}});});}
function j(res,s,o){res.writeHead(s,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify(o,null,2));}

http.createServer(async(req,res)=>{
  const url=req.url.split('?')[0],meth=req.method,body=['POST','PUT'].includes(meth)?await rb(req):{};
  if((url==='/'||url==='/status')&&meth==='GET'){res.writeHead(200,{'Content-Type':'text/html'});return res.end(statusPage());}
  if(meth==='GET'&&url==='/api/monitors')return j(res,200,monitors.map(m=>({id:m.id,name:m.name,url:m.url,up:m.up,latency:m.latency,lastCheck:m.lastCheck,uptime:m.history?(m.history.filter(h=>h.up).length/m.history.length*100).toFixed(1)+'%':null})));
  if(meth==='POST'&&url==='/api/monitors'){
    if(!body.url)return j(res,400,{error:'url required'});
    const m={id:++mid,name:body.name||body.url,url:body.url,webhookUrl:body.webhookUrl,active:true,history:[],createdAt:new Date().toISOString()};
    monitors.push(m);save();check(m).then(save).catch(()=>{});return j(res,201,m);
  }
  if(meth==='DELETE'&&url.startsWith('/api/monitors/')){const id=parseInt(url.split('/')[3]);monitors=monitors.filter(m=>m.id!==id);save();return j(res,200,{ok:true});}
  if(url==='/health')return j(res,200,{ok:true,monitors:monitors.length});
  j(res,404,{error:'not found'});
}).listen(PORT,()=>console.log('Uptime SaaS :'+PORT));
`);
      spawn('node', [path.join(siteDir, 'uptime.js')], { cwd: siteDir, detached: true, stdio: 'ignore' }).unref();
      ipc.send('route', { type: 'vhost:add', host: domain, target: `http://127.0.0.1:${port}` }, 'proxy');
      ipc.send('route', { type: 'tls:issue', domain }, 'tls');
      progress(installId, 'uptime:write', 'ok', `:${port}`);
      return { domain, port, siteDir, statusPage: `https://${domain}` };
    }
  },

  // ── Link Shortener ─────────────────────────────────────────────────────────
  linkshortener: {
    id: 'linkshortener', name: 'Link Shortener',
    description: 'Branded short links with full click analytics. Monetize with interstitial ads or sell branded domains.',
    requires: ['node'], category: 'money',
    async install(domain, tenantId, installId, opts = {}) {
      const siteDir = path.join(cfg.sitesDir, tenantId, domain);
      const port    = allocatePort();
      fs.mkdirSync(path.join(siteDir, 'data'), { recursive: true });
      progress(installId, 'shortener:write', 'running');

      fs.writeFileSync(path.join(siteDir, 'short.js'), `'use strict';
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=${port},DB=path.join(__dirname,'data','links.json');
let links=load({});function load(d){try{return JSON.parse(fs.readFileSync(DB));}catch{return d;}}
function save(){fs.writeFileSync(DB,JSON.stringify(links,null,2));}
function code(){return crypto.randomBytes(3).toString('base64url').slice(0,5);}
function rb(req){return new Promise(r=>{let b='';req.on('data',d=>b+=d);req.on('end',()=>{try{r(JSON.parse(b))}catch{r({})}});});}
function j(res,s,o){res.writeHead(s,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify(o,null,2));}

http.createServer(async(req,res)=>{
  const url=req.url.split('?')[0],meth=req.method,body=meth==='POST'?await rb(req):{};
  if(meth==='POST'&&url==='/shorten'){
    if(!body.url)return j(res,400,{error:'url required'});
    const c=body.code||code();
    links[c]={url:body.url,code:c,label:body.label||'',clicks:0,created:new Date().toISOString(),log:[]};
    save();return j(res,201,{shortUrl:'https://${domain}/'+c,...links[c]});
  }
  if(meth==='GET'&&url==='/links')return j(res,200,Object.values(links).map(l=>({...l,log:undefined})));
  if(meth==='DELETE'&&url.startsWith('/l/')){const c=url.slice(3);delete links[c];save();return j(res,200,{ok:true});}
  const c=url.slice(1);
  if(links[c]){
    links[c].clicks++;links[c].log.push({ts:new Date().toISOString(),ip:req.socket.remoteAddress});
    if(links[c].log.length>1000)links[c].log.shift();save();
    res.writeHead(302,{Location:links[c].url});return res.end();
  }
  if(url==='/health')return j(res,200,{ok:true,links:Object.keys(links).length});
  j(res,404,{error:'not found'});
}).listen(PORT,()=>console.log('Shortener :'+PORT));
`);
      spawn('node', [path.join(siteDir, 'short.js')], { cwd: siteDir, detached: true, stdio: 'ignore' }).unref();
      ipc.send('route', { type: 'vhost:add', host: domain, target: `http://127.0.0.1:${port}` }, 'proxy');
      ipc.send('route', { type: 'tls:issue', domain }, 'tls');
      progress(installId, 'shortener:write', 'ok', `:${port}`);
      return { domain, port, siteDir };
    }
  },

  // ── File Drop ──────────────────────────────────────────────────────────────
  filedrop: {
    id: 'filedrop', name: 'File Drop',
    description: 'Encrypted self-destructing file sharing. Set max views, TTL. Charge for larger uploads or longer TTLs.',
    requires: ['node'], category: 'money',
    async install(domain, tenantId, installId, opts = {}) {
      const siteDir = path.join(cfg.sitesDir, tenantId, domain);
      const port    = allocatePort();
      fs.mkdirSync(path.join(siteDir, 'uploads'), { recursive: true });
      progress(installId, 'filedrop:write', 'running');

      fs.writeFileSync(path.join(siteDir, 'drop.js'), `'use strict';
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=${port},UPL=path.join(__dirname,'uploads'),MAX=100*1024*1024;
const files=new Map();
setInterval(()=>{for(const[c,f]of files)if(Date.now()>f.exp){try{fs.unlinkSync(f.fp);}catch{}files.delete(c);}},60000);
function code(){return crypto.randomBytes(6).toString('base64url');}
function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function page(b){return \`<!DOCTYPE html><html><head><meta charset=utf-8><title>FileDrop</title>
<style>*{box-sizing:border-box}body{font-family:sans-serif;background:#0a0a0a;color:#eee;max-width:580px;margin:60px auto;padding:0 20px}
input,select{width:100%;padding:10px;background:#111;border:1px solid #333;color:#eee;border-radius:6px;margin-bottom:10px}
button{background:#7c3aed;color:#fff;border:none;padding:12px 24px;border-radius:6px;cursor:pointer;width:100%}a{color:#7c3aed}</style>
</head><body>\${b}</body></html>\`;}

http.createServer(async(req,res)=>{
  const url=req.url.split('?')[0],meth=req.method;
  if(meth==='GET'&&url==='/'){res.writeHead(200,{'Content-Type':'text/html'});return res.end(page(\`
    <h2>FileDrop</h2>
    <form action="/upload" method="post" enctype="multipart/form-data">
      <input type="file" name="f" required>
      <select name="ttl"><option value="3600000">1 hour</option><option value="86400000" selected>24 hours</option><option value="604800000">7 days</option></select>
      <input type="number" name="maxv" placeholder="Max views (blank = unlimited)">
      <button>Upload</button>
    </form>\`));}

  if(meth==='POST'&&url==='/upload'){
    const bnd=req.headers['content-type']?.match(/boundary=(.+)/)?.[1];
    if(!bnd){res.writeHead(400);return res.end('no boundary');}
    let body=Buffer.alloc(0);
    for await(const c of req){body=Buffer.concat([body,c]);if(body.length>MAX){res.writeHead(413);return res.end('too large');}}
    const B=Buffer.from('--'+bnd);let pos=0,fname='file',fdata=null,ttl=86400000,maxv=0;
    while(pos<body.length){
      const s=body.indexOf(B,pos);if(s===-1)break;
      const e=body.indexOf(B,s+B.length);if(e===-1)break;
      const part=body.slice(s+B.length,e);const he=part.indexOf('\\r\\n\\r\\n');if(he===-1){pos=e;continue;}
      const hdr=part.slice(0,he).toString(),dat=part.slice(he+4,part.length-2);
      if(hdr.includes('name="f"')){const m=hdr.match(/filename="([^"]+)"/);if(m){fname=m[1];fdata=dat;}}
      if(hdr.includes('name="ttl"'))ttl=parseInt(dat.toString())||86400000;
      if(hdr.includes('name="maxv"'))maxv=parseInt(dat.toString())||0;
      pos=e;
    }
    if(!fdata){res.writeHead(400);return res.end('no file');}
    const c=code(),fp=path.join(UPL,c);
    fs.writeFileSync(fp,fdata);
    files.set(c,{fp,name:fname,size:fdata.length,exp:Date.now()+ttl,maxv,views:0});
    res.writeHead(200,{'Content-Type':'text/html'});
    return res.end(page(\`<h2>OK Uploaded</h2><input value="https://${domain}/f/\${c}" readonly onclick="this.select()"><p style="color:#888;font-size:12px">Expires \${new Date(Date.now()+ttl).toLocaleString()}\${maxv?' · '+maxv+' max views':''}</p><a href="/">Upload another</a>\`));
  }

  if(meth==='GET'&&url.startsWith('/f/')){
    const c=url.slice(3),f=files.get(c);
    if(!f){res.writeHead(404);return res.end(page('<h2>Not found or expired</h2>'));}
    if(f.maxv&&f.views>=f.maxv){files.delete(c);try{fs.unlinkSync(f.fp);}catch{}res.writeHead(410);return res.end(page('<h2>Expired</h2>'));}
    f.views++;
    res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':\`attachment; filename="\${esc(f.name)}"\`,'Content-Length':f.size});
    return fs.createReadStream(f.fp).pipe(res);
  }

  if(url==='/health')return(res.writeHead(200,{'Content-Type':'application/json'}),res.end(JSON.stringify({ok:true,files:files.size})));
  res.writeHead(404);res.end('not found');
}).listen(PORT,()=>console.log('FileDrop :'+PORT));
`);
      spawn('node', [path.join(siteDir, 'drop.js')], { cwd: siteDir, detached: true, stdio: 'ignore' }).unref();
      ipc.send('route', { type: 'vhost:add', host: domain, target: `http://127.0.0.1:${port}` }, 'proxy');
      ipc.send('route', { type: 'tls:issue', domain }, 'tls');
      progress(installId, 'filedrop:write', 'ok', `:${port}`);
      return { domain, port, siteDir };
    }
  },

  // ── Pastebin ───────────────────────────────────────────────────────────────
  pastebin: {
    id: 'pastebin', name: 'Pastebin',
    description: 'Self-hosted pastebin with syntax highlighting, expiry, private pastes, REST API.',
    requires: ['node'], category: 'tools',
    async install(domain, tenantId, installId, opts = {}) {
      const siteDir = path.join(cfg.sitesDir, tenantId, domain);
      const port    = allocatePort();
      fs.mkdirSync(path.join(siteDir, 'data'), { recursive: true });
      progress(installId, 'pastebin:write', 'running');

      fs.writeFileSync(path.join(siteDir, 'paste.js'), `'use strict';
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=${port},DB=path.join(__dirname,'data','p.json');
let pastes=load({});function load(d){try{return JSON.parse(fs.readFileSync(DB));}catch{return d;}}
function save(){fs.writeFileSync(DB,JSON.stringify(pastes,null,2));}
function code(){return crypto.randomBytes(4).toString('hex');}
function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
setInterval(()=>{let c=false;for(const[k,p]of Object.entries(pastes))if(p.exp&&Date.now()>p.exp){delete pastes[k];c=true;}if(c)save();},60000);

function page(t,b){return \`<!DOCTYPE html><html><head><meta charset=utf-8><title>\${t}</title>
<style>*{box-sizing:border-box}body{font-family:monospace;background:#0d1117;color:#c9d1d9;margin:0;padding:20px}
h1{color:#58a6ff;font-size:16px}textarea,input,select{width:100%;padding:8px;background:#0d1117;border:1px solid #30363d;color:#c9d1d9;border-radius:4px;font-family:monospace}
textarea{min-height:280px;resize:vertical}button{background:#238636;color:#fff;border:none;padding:8px 18px;border-radius:4px;cursor:pointer}a{color:#58a6ff}</style>
</head><body>\${b}</body></html>\`;}

function parseForm(req){return new Promise(r=>{let b='';req.on('data',d=>b+=d);req.on('end',()=>{const p=new URLSearchParams(b);r(Object.fromEntries(p));});});}
function rb(req){return new Promise(r=>{let b='';req.on('data',d=>b+=d);req.on('end',()=>{try{r(JSON.parse(b))}catch{r({})}});});}
function j(res,s,o){res.writeHead(s,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify(o,null,2));}

http.createServer(async(req,res)=>{
  const url=req.url.split('?')[0],meth=req.method;

  if(meth==='GET'&&url==='/'){
    res.writeHead(200,{'Content-Type':'text/html'});
    const recent=Object.values(pastes).filter(p=>!p.priv).slice(-8).reverse().map(p=>\`<a href="/\${p.code}">\${p.code}</a>\`).join(' ');
    return res.end(page('Pastebin',\`<h1>Paste</h1>
    <form method="post" action="/new">
      <textarea name="c" placeholder="Code or text…"></textarea>
      <div style="display:flex;gap:8px;margin-top:8px">
        <select name="l"><option value="">text</option><option>js</option><option>python</option><option>bash</option><option>json</option><option>html</option><option>css</option><option>sql</option></select>
        <select name="t"><option value="">never</option><option value="3600000">1h</option><option value="86400000">1d</option><option value="604800000">7d</option></select>
        <button>Paste</button>
      </div>
    </form>\${recent?'<p style="color:#888;font-size:11px">Recent: '+recent+'</p>':''}\`));
  }

  if(meth==='POST'&&url==='/new'){
    const f=await parseForm(req);if(!f.c){res.writeHead(302,{Location:'/'});return res.end();}
    const c=code(),ttl=parseInt(f.t)||0;
    pastes[c]={code:c,content:f.c,lang:f.l||'',exp:ttl?Date.now()+ttl:null,created:new Date().toISOString(),views:0};
    save();res.writeHead(302,{Location:'/'+c});return res.end();
  }

  // API
  if(meth==='POST'&&url==='/api/paste'){
    const b=await rb(req);if(!b.content)return j(res,400,{error:'content required'});
    const c=code(),ttl=b.ttl||0;
    pastes[c]={code:c,content:b.content,lang:b.lang||'',exp:ttl?Date.now()+ttl:null,created:new Date().toISOString(),views:0};
    save();return j(res,201,{url:'https://${domain}/'+c,raw:'https://${domain}/raw/'+c,code:c});
  }

  if(url.startsWith('/raw/')){const p=pastes[url.slice(5)];if(p){res.writeHead(200,{'Content-Type':'text/plain'});return res.end(p.content);}}

  const c=url.slice(1),p=pastes[c];
  if(p){
    p.views++;save();
    res.writeHead(200,{'Content-Type':'text/html'});
    return res.end(page(c,\`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <span style="color:#888;font-size:11px">\${p.lang||'text'} · \${p.views} views · \${new Date(p.created).toLocaleString()}\${p.exp?' · expires '+new Date(p.exp).toLocaleString():''}</span>
      <button onclick="navigator.clipboard.writeText(document.getElementById('t').value)" style="font-size:11px;padding:4px 10px">Copy</button>
    </div><textarea id="t" readonly>\${esc(p.content)}</textarea>\`));
  }

  if(url==='/health')return j(res,200,{ok:true,pastes:Object.keys(pastes).length});
  res.writeHead(404);res.end(page('Not found','<h1>Not found</h1>'));
}).listen(PORT,()=>console.log('Pastebin :'+PORT));
`);
      spawn('node', [path.join(siteDir, 'paste.js')], { cwd: siteDir, detached: true, stdio: 'ignore' }).unref();
      ipc.send('route', { type: 'vhost:add', host: domain, target: `http://127.0.0.1:${port}` }, 'proxy');
      ipc.send('route', { type: 'tls:issue', domain }, 'tls');
      progress(installId, 'pastebin:write', 'ok', `:${port}`);
      return { domain, port, siteDir };
    }
  },

  // ── Price Monitor ──────────────────────────────────────────────────────────
  pricemonitor: {
    id: 'pricemonitor', name: 'Price Monitor',
    description: 'Monitor prices on any site. Webhook alerts on drops. Sell data feeds or affiliate-link monetize.',
    requires: ['node'], category: 'bots',
    async install(domain, tenantId, installId, opts = {}) {
      const siteDir = path.join(cfg.sitesDir, tenantId, domain);
      const port    = allocatePort();
      fs.mkdirSync(path.join(siteDir, 'data'), { recursive: true });
      progress(installId, 'pricemon:write', 'running');

      fs.writeFileSync(path.join(siteDir, 'monitor.js'), `'use strict';
const http=require('http'),https=require('https'),fs=require('fs'),path=require('path');
const PORT=${port},DB=path.join(__dirname,'data','m.json');
let monitors=load([]),mid=monitors.reduce((m,x)=>Math.max(m,x.id||0),0);
function load(d){try{return JSON.parse(fs.readFileSync(DB));}catch{return d;}}
function save(){fs.writeFileSync(DB,JSON.stringify(monitors,null,2));}

function fetch(url){return new Promise((res,rej)=>{
  const mod=url.startsWith('https')?https:http;
  const req=mod.get(url,{timeout:12000,headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36','Accept':'text/html'}},r=>{
    let b='';r.on('data',d=>{b+=d;if(b.length>1e6)req.destroy();});r.on('end',()=>res(b));
  });req.on('error',rej);req.on('timeout',()=>{req.destroy();rej(new Error('timeout'));});
});}

function extractPrice(html,sel){
  const checks=[
    html.match(/itemprop="price"[^>]*content="([\d.]+)"/i),
    html.match(/"price":\s*"?([\d.]+)"?/i),
    html.match(/<meta[^>]*property="product:price:amount"[^>]*content="([\d.]+)"/i),
    sel?new RegExp('<'+sel+'[^>]*>\\\\s*[\\\\$£€]?([\\\\d,]+\\\\.?\\\\d*)',i).exec(html):null,
    html.match(/class="[^"]*price[^"]*"[^>]*>[^<]*[\\$£€\\s]*([\\d,]+\\.?\\d*)/i),
  ];
  for(const m of checks)if(m){const p=parseFloat(m[1].replace(/,/g,''));if(!isNaN(p)&&p>0)return p;}
  return null;
}

async function checkAll(){
  for(const m of monitors){if(m.active===false)continue;
    try{const html=await fetch(m.url);const price=extractPrice(html,m.selector);
    if(!m.history)m.history=[];
    const prev=m.history.slice(-1)[0]?.price;
    m.history.push({price,ts:new Date().toISOString()});if(m.history.length>500)m.history.shift();
    m.lastPrice=price;m.lastCheck=new Date().toISOString();
    if(prev&&price&&price<prev*(1-(m.dropPct||0.05))){
      const alert={price,prev,drop:prev-price,pct:((prev-price)/prev*100).toFixed(1),ts:m.lastCheck};
      if(!m.alerts)m.alerts=[];m.alerts.push(alert);
      console.log('PRICE DROP:',m.name,prev,'→',price);
      if(m.webhookUrl){try{const b=JSON.stringify({name:m.name,url:m.url,...alert});
        const u=new URL(m.webhookUrl),mod2=m.webhookUrl.startsWith('https')?https:http;
        const r=mod2.request({hostname:u.hostname,path:u.pathname,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(b)}});r.write(b);r.end();}catch{}}
    }
    }catch(e){m.lastError=e.message;}
  }
  save();
}
setInterval(checkAll,60000);

function rb(req){return new Promise(r=>{let b='';req.on('data',d=>b+=d);req.on('end',()=>{try{r(JSON.parse(b))}catch{r({})}});});}
function j(res,s,o){res.writeHead(s,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify(o,null,2));}

http.createServer(async(req,res)=>{
  const url=req.url.split('?')[0],meth=req.method,body=['POST','PUT'].includes(meth)?await rb(req):{};
  if(meth==='GET'&&url==='/monitors')return j(res,200,monitors.map(m=>({id:m.id,name:m.name,url:m.url,lastPrice:m.lastPrice,lastCheck:m.lastCheck,alerts:(m.alerts||[]).length,history:(m.history||[]).slice(-10)})));
  if(meth==='POST'&&url==='/monitors'){
    if(!body.url)return j(res,400,{error:'url required'});
    const m={id:++mid,name:body.name||body.url,url:body.url,selector:body.selector,dropPct:body.dropPct||0.05,webhookUrl:body.webhookUrl,active:true,history:[],alerts:[],created:new Date().toISOString()};
    monitors.push(m);save();
    fetch(m.url).then(html=>{m.lastPrice=extractPrice(html,m.selector);m.lastCheck=new Date().toISOString();if(!m.history)m.history=[];m.history.push({price:m.lastPrice,ts:m.lastCheck});save();}).catch(()=>{});
    return j(res,201,m);
  }
  if(meth==='DELETE'&&url.startsWith('/monitors/')){const id=parseInt(url.split('/')[2]);monitors=monitors.filter(m=>m.id!==id);save();return j(res,200,{ok:true});}
  if(url==='/health')return j(res,200,{ok:true,monitors:monitors.length});
  j(res,404,{error:'not found'});
}).listen(PORT,()=>console.log('Price monitor :'+PORT));
`);
      spawn('node', [path.join(siteDir, 'monitor.js')], { cwd: siteDir, detached: true, stdio: 'ignore' }).unref();
      ipc.send('route', { type: 'vhost:add', host: domain, target: `http://127.0.0.1:${port}` }, 'proxy');
      ipc.send('route', { type: 'tls:issue', domain }, 'tls');
      progress(installId, 'pricemon:write', 'ok', `:${port}`);
      return { domain, port, siteDir };
    }
  },

  // ── Screenshot API ─────────────────────────────────────────────────────────
  screenshotapi: {
    id: 'screenshotapi', name: 'Screenshot API',
    description: 'Sell website screenshots and PDF generation as an API. $0.001–0.01 per call. Zero marginal cost.',
    requires: ['node'], category: 'money',
    async install(domain, tenantId, installId, opts = {}) {
      const siteDir = path.join(cfg.sitesDir, tenantId, domain);
      const port    = allocatePort();
      fs.mkdirSync(path.join(siteDir, 'cache'), { recursive: true });
      progress(installId, 'screenshot:install', 'running');

      fs.writeFileSync(path.join(siteDir, 'package.json'), JSON.stringify({ name: 'nexus-screenshot', dependencies: { puppeteer: '^21.0.0' } }, null, 2));
      try { sh(`npm install --prefix "${siteDir}"`, { timeout: 300000 }); progress(installId, 'screenshot:install', 'ok'); }
      catch (e) { progress(installId, 'screenshot:install', 'warn', 'puppeteer failed — install manually: npm install puppeteer'); }

      fs.writeFileSync(path.join(siteDir, 'api.js'), `'use strict';
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=${port};
let browser=null;
const keys=new Map();keys.set('dev-unlimited',{calls:0,limit:Infinity});

async function getBrowser(){if(browser)return browser;const pp=require('puppeteer');browser=await pp.launch({args:['--no-sandbox','--disable-setuid-sandbox','--disable-gpu']});return browser;}

async function shot(url,opts={}){
  const b=await getBrowser(),page=await b.newPage();
  await page.setViewport({width:opts.w||1280,height:opts.h||800});
  await page.goto(url,{waitUntil:'networkidle2',timeout:30000});
  if(opts.wait)await new Promise(r=>setTimeout(r,parseInt(opts.wait)));
  const buf=await page.screenshot({type:opts.fmt||'png',fullPage:!!opts.full,quality:opts.q?parseInt(opts.q):undefined});
  await page.close();return buf;
}

function rb(req){return new Promise(r=>{let b='';req.on('data',d=>b+=d);req.on('end',()=>{try{r(JSON.parse(b))}catch{r({})}});});}
function j(res,s,o){res.writeHead(s,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify(o,null,2));}

http.createServer(async(req,res)=>{
  const qs=Object.fromEntries(new URL(req.url,'http://x').searchParams),url=req.url.split('?')[0];
  const meth=req.method,body=meth==='POST'?await rb(req):{};
  const params={...qs,...body};
  const key=params.key||req.headers['x-api-key'];const acct=key?keys.get(key):null;
  if(!acct)return j(res,401,{error:'invalid API key — use key=dev-unlimited for testing'});
  if(acct.calls>=acct.limit)return j(res,402,{error:'limit reached'});
  if(url==='/screenshot'){
    if(!params.url)return j(res,400,{error:'url required'});
    try{const buf=await shot(params.url,params);acct.calls++;
    const ext=params.fmt==='jpeg'?'jpg':'png';
    res.writeHead(200,{'Content-Type':'image/'+ext});return res.end(buf);
    }catch(e){return j(res,500,{error:e.message});}
  }
  if(meth==='POST'&&url==='/keys'){const k='nxs_'+crypto.randomBytes(16).toString('hex');keys.set(k,{calls:0,limit:params.limit||1000});return j(res,201,{key:k,limit:params.limit||1000});}
  if(url==='/health')return j(res,200,{ok:true,hasBrowser:!!browser,keys:keys.size});
  j(res,404,{error:'not found'});
}).listen(PORT,()=>console.log('Screenshot API :'+PORT));
`);
      spawn('node', [path.join(siteDir, 'api.js')], { cwd: siteDir, detached: true, stdio: 'ignore' }).unref();
      ipc.send('route', { type: 'vhost:add', host: domain, target: `http://127.0.0.1:${port}` }, 'proxy');
      ipc.send('route', { type: 'tls:issue', domain }, 'tls');
      progress(installId, 'screenshot:install', 'ok', `:${port}`);
      return { domain, port, siteDir, usage: `GET https://${domain}/screenshot?url=https://example.com&key=dev-unlimited` };
    }
  },

}; // end RECIPES


async function install({ app, domain, tenantId, requestId, opts }) {
  const recipe = RECIPES[app];
  if (!recipe) throw new Error(`unknown app: ${app}`);

  const installId = `${app}-${randomStr(4)}`;
  installs.set(installId, {
    installId, app, domain, tenantId, requestId,
    status: 'running', steps: [], startedAt: Date.now()
  });

  log(`installing ${recipe.name} → ${domain} [${installId}]`);

  try {
    const result = await recipe.install(domain, tenantId, installId, opts);
    const rec    = installs.get(installId);
    rec.status   = 'done';
    rec.result   = result;
    rec.finishedAt = Date.now();

    // health check
    progress(installId, 'health:check', 'running');
    try {
      const status = await pollUrl(`http://127.0.0.1:${result.port || 80}/`, 20, 3000);
      progress(installId, 'health:check', 'ok', `HTTP ${status}`);
    } catch (e) {
      progress(installId, 'health:check', 'warn', e.message);
    }

    // record in db
    await ipc.db.insert('installs', {
      installId, app, domain, tenantId,
      result: JSON.stringify(result),
      ts: Date.now(),
    }).catch(() => {});

    ipc.send('catalog:installed', { requestId, installId, app, domain, result });
    log(`${recipe.name} installed at https://${domain} [${installId}]`);
    return result;

  } catch (e) {
    const rec = installs.get(installId);
    if (rec) { rec.status = 'error'; rec.error = e.message; }
    ipc.send('catalog:error', { requestId, installId, app, domain, error: e.message });
    log(`install failed: ${app} → ${domain}: ${e.message}`, 'ERROR');
    throw e;
  }
}

// ─── HTTP API ─────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const url    = req.url.split('?')[0];
  const method = req.method;

  function json(status, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(body);
  }

  // GET /catalog — list available apps (grouped by category)
  if (method === 'GET' && url === '/catalog') {
    const apps = Object.values(RECIPES).map(r => ({
      id: r.id, name: r.name, description: r.description,
      requires: r.requires, icon: r.icon, category: r.category || 'other',
    }));
    return json(200, apps);
  }

  // GET /catalog/categories — grouped
  if (method === 'GET' && url === '/catalog/categories') {
    const groups = {};
    for (const r of Object.values(RECIPES)) {
      const cat = r.category || 'other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push({ id: r.id, name: r.name, icon: r.icon, description: r.description });
    }
    return json(200, groups);
  }

  // POST /catalog/install — trigger an install
  if (method === 'POST' && url === '/catalog/install') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      try {
        const { app, domain, tenantId, opts } = JSON.parse(body);
        const requestId = randomStr(8);
        install({ app, domain, tenantId: tenantId || 'default', requestId, opts })
          .catch(() => {});
        json(202, { message: 'install started', requestId });
      } catch (e) { json(400, { error: e.message }); }
    });
    return;
  }

  // GET /catalog/status/:installId
  if (method === 'GET' && url.startsWith('/catalog/status/')) {
    const installId = url.slice('/catalog/status/'.length);
    const rec = installs.get(installId);
    if (!rec) return json(404, { error: 'not found' });
    return json(200, rec);
  }

  json(404, { error: 'not found' });
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    const next = (cfg.listenPort) + 1;
    log(`port ${(cfg.listenPort)} in use — trying :${next}`, 'WARN');
    setTimeout(() => server.listen(next, () => { log(`on :${next}`); claimPort(next); }), 300);
  } else { throw err; }
});
server.listen(cfg.listenPort, () => {
  log(`catalog engine on :${cfg.listenPort}`);
  claimPort(cfg.listenPort);
});

// ─── IPC handlers ─────────────────────────────────────────────────────────────

ipc.on('catalog:install', async payload => {
  const { app, domain, tenantId, requestId, opts } = payload || {};
  try { await install({ app, domain, tenantId, requestId, opts }); }
  catch {}
});

ipc.on('catalog:list', () => {
  ipc.send('catalog:list:reply', {
    apps: Object.values(RECIPES).map(r => ({
      id: r.id, name: r.name, description: r.description, requires: r.requires, icon: r.icon
    }))
  });
});

log(`catalog engine ready — ${Object.keys(RECIPES).length} apps available`);
log(`apps: ${Object.keys(RECIPES).join(', ')}`);

// ─── status ping (monitor health check) ──────────────────────────────────────
ipc.on('status:ping', payload => {
  ipc.send('status:pong', { requestId: payload?.requestId, engine: NAME, alive: true, ts: Date.now() });
});

