'use strict';
// [NEXUS-COMPONENT-ID]
const COMPONENT_ID   = '90b08b0b';
const COMPONENT_UUID = '90b08b0b-2305-5c8c-aa13-3acefb3fcac8';
const COMPONENT_NAME = 'ftp';
// [/NEXUS-COMPONENT-ID]
/**
 * engines/ftp.js
 * ─────────────────────────────────────────────────────────────────────────────
 * A real FTP server — plain RFC 959 control connection + passive-mode data
 * connections, zero dependencies (net/fs/crypto stdlib only). Works with
 * FileZilla, Windows Explorer's "Map network drive" FTP client, curl, etc.
 *
 * Scoped to the same directory tree the File Manager browses (cfg.root,
 * default 'sites'), so anything you upload over FTP shows up in the panel
 * and vice versa.
 *
 * Deliberately does NOT implement: FTPS/TLS (plain FTP only — if you need
 * encryption, use the File Manager or SFTP-over-something-else instead),
 * EPSV/EPRT (PASV/PORT cover every mainstream client), or active mode by
 * default (most clients/NATs don't want it anyway).
 *
 * conf/ftp.conf:
 *   port         control port                         (default 2121 — use
 *                21 in prod if you can bind low ports; Windows without admin
 *                can't, same constraint as the tls/proxy engines on :80/:443)
 *   pasvHost     public IP/hostname advertised in PASV responses (default:
 *                whatever peer.js/ddns discovered as your public IP, else
 *                127.0.0.1)
 *   pasvPortMin/pasvPortMax   passive data port range  (default 50000-50100)
 *   root         directory FTP is scoped to, relative to ROOT (default 'sites')
 *   users        [{ username, passwordHash }] — a default user is generated
 *                on first boot and its password logged once, same pattern as
 *                relay.js's PSK generation.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const net    = require('net');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { ipc, conf, log, claimPort, isInit, ROOT, NAME } = require('./_engine');

const DEFAULTS = {
  port:        2121,
  pasvHost:    '127.0.0.1',
  pasvPortMin: 50000,
  pasvPortMax: 50100,
  root:        'sites',
  users:       [],
};

if (isInit()) {
  conf.init(DEFAULTS);
  log('ftp: wrote default conf');
  process.exit(0);
}

const cfg     = conf.load(DEFAULTS);
const FTPROOT = path.resolve(ROOT, cfg.root);
fs.mkdirSync(FTPROOT, { recursive: true });

function hashPassword(pw, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
}
function checkPassword(pw, stored) {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  const check = crypto.scryptSync(pw, salt, 64).toString('hex');
  try { return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex')); }
  catch { return false; }
}

// Generate a default user on first boot, same pattern as relay.js's PSK —
// log the password once so it isn't silently unusable.
if (!cfg.users || cfg.users.length === 0) {
  const pass = crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, '').slice(0, 12);
  cfg.users = [{ username: 'nexus', passwordHash: hashPassword(pass) }];
  conf.save(cfg);
  log(`FTP default user created — username: nexus  password: ${pass}  (change it in the panel; this only prints once)`, 'WARN');
}

// ─── path safety: every FTP path is resolved against FTPROOT and can never
// escape it, regardless of how many '..' segments a client sends ───────────

function resolveFtpPath(cwd, arg) {
  const base = arg && arg.startsWith('/') ? '/' : cwd;
  const combined = path.posix.join(base, arg || '');
  const abs = path.resolve(FTPROOT, '.' + combined);
  if (abs !== FTPROOT && !abs.startsWith(FTPROOT + path.sep)) return null; // escape attempt
  const virtual = '/' + path.relative(FTPROOT, abs).split(path.sep).join('/');
  return { real: abs, virtual: virtual === '/.' ? '/' : virtual };
}

// ─── passive data port allocation ───────────────────────────────────────────

let nextPasvPort = cfg.pasvPortMin;
function allocPasvPort() {
  const p = nextPasvPort;
  nextPasvPort = nextPasvPort >= cfg.pasvPortMax ? cfg.pasvPortMin : nextPasvPort + 1;
  return p;
}

function openPassiveListener() {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const tryListen = () => {
      const port = allocPasvPort();
      const srv = net.createServer();
      srv.once('error', () => {
        if (++attempts > (cfg.pasvPortMax - cfg.pasvPortMin + 1)) return reject(new Error('no passive ports available'));
        tryListen();
      });
      srv.listen(port, () => resolve({ server: srv, port }));
    };
    tryListen();
  });
}

// ─── control-connection session ─────────────────────────────────────────────

function createSession(socket) {
  let authedUser  = null;
  let pendingUser = null;
  let cwd         = '/';
  let type        = 'A'; // ASCII vs binary — we always transfer raw bytes either way
  let renameFrom  = null;
  let pasv        = null; // { server, port }

  const send = line => socket.write(line + '\r\n');
  send('220 NEXUS FTP ready');

  function closePasv() {
    if (pasv) { try { pasv.server.close(); } catch {} pasv = null; }
  }

  async function withDataConn(fn) {
    if (!pasv) { send('425 Use PASV first'); return; }
    const srv = pasv.server;
    pasv = null; // one use per PASV per RFC 959 convention
    const conn = await new Promise(resolve => {
      const timer = setTimeout(() => { srv.close(); resolve(null); }, 15000);
      srv.once('connection', c => { clearTimeout(timer); resolve(c); });
    });
    if (!conn) { send('425 Data connection timed out'); return; }
    try { await fn(conn); } catch (e) { log(`data error: ${e.message}`, 'WARN'); try { send('550 Transfer failed'); } catch {} }
    finally { try { srv.close(); } catch {}; try { conn.destroy(); } catch {} }
  }

  socket.on('data', async raw => {
    const line = raw.toString('utf8').trim();
    if (!line) return;
    const sp   = line.indexOf(' ');
    const cmd  = (sp === -1 ? line : line.slice(0, sp)).toUpperCase();
    const arg  = sp === -1 ? '' : line.slice(sp + 1);

    try {
      switch (cmd) {
        case 'USER':
          pendingUser = arg;
          send('331 Password required');
          break;

        case 'PASS': {
          const user = (cfg.users || []).find(u => u.username === pendingUser);
          if (user && checkPassword(arg, user.passwordHash)) {
            authedUser = pendingUser;
            send('230 Login successful');
          } else {
            send('530 Login incorrect');
          }
          break;
        }

        case 'SYST': send('215 UNIX Type: L8'); break;
        case 'FEAT': send('211-Features\r\n PASV\r\n SIZE\r\n MDTM\r\n211 End'); break;
        case 'TYPE': type = arg.trim().toUpperCase(); send(`200 Type set to ${type}`); break;
        case 'NOOP': send('200 NOOP ok'); break;
        case 'OPTS': send('200 OK'); break;

        case 'PWD': case 'XPWD':
          send(`257 "${cwd}" is the current directory`);
          break;

        case 'CDUP': case 'CWD': {
          if (!authedUser) { send('530 Not logged in'); break; }
          const target = cmd === 'CDUP' ? '..' : arg;
          const r = resolveFtpPath(cwd, target);
          if (!r || !fs.existsSync(r.real) || !fs.statSync(r.real).isDirectory()) { send('550 No such directory'); break; }
          cwd = r.virtual;
          send(`250 Directory changed to ${cwd}`);
          break;
        }

        case 'PASV': {
          if (!authedUser) { send('530 Not logged in'); break; }
          closePasv();
          const { server, port } = await openPassiveListener();
          pasv = { server, port };
          const ipParts = cfg.pasvHost.split('.').join(',');
          send(`227 Entering Passive Mode (${ipParts},${(port >> 8) & 0xff},${port & 0xff})`);
          break;
        }

        case 'LIST': case 'NLST': {
          if (!authedUser) { send('530 Not logged in'); break; }
          const r = resolveFtpPath(cwd, arg && !arg.startsWith('-') ? arg : '');
          if (!r) { send('550 Invalid path'); break; }
          send('150 Opening data connection for directory listing');
          await withDataConn(async conn => {
            let names = [];
            try { names = fs.readdirSync(r.real); } catch {}
            const lines = names.map(name => {
              if (cmd === 'NLST') return name;
              const st = fs.statSync(path.join(r.real, name));
              const perms = st.isDirectory() ? 'drwxr-xr-x' : '-rw-r--r--';
              const mtime = st.mtime.toDateString().split(' ').slice(1).join(' ');
              return `${perms} 1 nexus nexus ${String(st.size).padStart(10)} ${mtime} ${name}`;
            });
            conn.end(lines.join('\r\n') + (lines.length ? '\r\n' : ''));
          });
          send('226 Transfer complete');
          break;
        }

        case 'SIZE': {
          const r = resolveFtpPath(cwd, arg);
          if (!r || !fs.existsSync(r.real)) { send('550 No such file'); break; }
          send(`213 ${fs.statSync(r.real).size}`);
          break;
        }

        case 'MDTM': {
          const r = resolveFtpPath(cwd, arg);
          if (!r || !fs.existsSync(r.real)) { send('550 No such file'); break; }
          const d = fs.statSync(r.real).mtime;
          const stamp = d.toISOString().replace(/[-:T]/g, '').slice(0, 14);
          send(`213 ${stamp}`);
          break;
        }

        case 'RETR': {
          if (!authedUser) { send('530 Not logged in'); break; }
          const r = resolveFtpPath(cwd, arg);
          if (!r || !fs.existsSync(r.real) || fs.statSync(r.real).isDirectory()) { send('550 No such file'); break; }
          send('150 Opening data connection for file transfer');
          await withDataConn(conn => new Promise((resolve, reject) => {
            const rs = fs.createReadStream(r.real);
            rs.pipe(conn);
            rs.on('error', reject);
            conn.on('close', resolve);
          }));
          send('226 Transfer complete');
          break;
        }

        case 'STOR': {
          if (!authedUser) { send('530 Not logged in'); break; }
          const r = resolveFtpPath(cwd, arg);
          if (!r) { send('550 Invalid path'); break; }
          send('150 Opening data connection to receive file');
          await withDataConn(conn => new Promise((resolve, reject) => {
            const ws = fs.createWriteStream(r.real);
            conn.pipe(ws);
            ws.on('error', reject);
            ws.on('finish', resolve);
          }));
          log(`FTP upload: ${r.virtual} (by ${authedUser})`);
          send('226 Transfer complete');
          break;
        }

        case 'DELE': {
          if (!authedUser) { send('530 Not logged in'); break; }
          const r = resolveFtpPath(cwd, arg);
          if (!r || !fs.existsSync(r.real)) { send('550 No such file'); break; }
          fs.unlinkSync(r.real);
          send('250 File deleted');
          break;
        }

        case 'MKD': case 'XMKD': {
          if (!authedUser) { send('530 Not logged in'); break; }
          const r = resolveFtpPath(cwd, arg);
          if (!r) { send('550 Invalid path'); break; }
          fs.mkdirSync(r.real, { recursive: true });
          send(`257 "${r.virtual}" created`);
          break;
        }

        case 'RMD': case 'XRMD': {
          if (!authedUser) { send('530 Not logged in'); break; }
          const r = resolveFtpPath(cwd, arg);
          if (!r || !fs.existsSync(r.real)) { send('550 No such directory'); break; }
          fs.rmdirSync(r.real);
          send('250 Directory removed');
          break;
        }

        case 'RNFR': {
          const r = resolveFtpPath(cwd, arg);
          if (!r || !fs.existsSync(r.real)) { send('550 No such file or directory'); break; }
          renameFrom = r.real;
          send('350 Ready for RNTO');
          break;
        }

        case 'RNTO': {
          if (!renameFrom) { send('503 RNFR required first'); break; }
          const r = resolveFtpPath(cwd, arg);
          if (!r) { send('550 Invalid path'); break; }
          fs.renameSync(renameFrom, r.real);
          renameFrom = null;
          send('250 Rename successful');
          break;
        }

        case 'QUIT':
          send('221 Goodbye');
          closePasv();
          socket.end();
          break;

        default:
          send('502 Command not implemented');
      }
    } catch (e) {
      log(`FTP command error (${cmd}): ${e.message}`, 'WARN');
      try { send('550 ' + e.message); } catch {}
    }
  });

  socket.on('close', closePasv);
  socket.on('error', () => closePasv());
}

const server = net.createServer(createSession);

function listen(port) {
  server.listen(port, () => { log(`FTP control listening on :${port} (root: ${cfg.root})`); claimPort(port); });
}
server.on('error', err => {
  if (err.code === 'EADDRINUSE') { const n = port_ + 1; log(`port ${port_} in use — trying :${n}`, 'WARN'); port_ = n; setTimeout(() => listen(port_), 300); }
  else log(`server error: ${err.message}`, 'ERROR');
});
let port_ = cfg.port;
log('ftp engine starting');
listen(port_);

// ─── IPC: user management from the panel ────────────────────────────────────

ipc.on('ftp:users:list', payload => {
  ipc.send('ftp:users:list:reply', { requestId: payload?.requestId, users: (cfg.users || []).map(u => ({ username: u.username })) });
});

ipc.on('ftp:users:create', payload => {
  const { username, password, requestId } = payload || {};
  if (!username || !password) return ipc.send('ftp:users:create:reply', { requestId, error: 'username and password required' });
  cfg.users = cfg.users || [];
  if (cfg.users.some(u => u.username === username)) return ipc.send('ftp:users:create:reply', { requestId, error: 'user already exists' });
  cfg.users.push({ username, passwordHash: hashPassword(password) });
  conf.save(cfg);
  log(`FTP user created: ${username}`);
  ipc.send('ftp:users:create:reply', { requestId, ok: true });
});

ipc.on('ftp:users:delete', payload => {
  const { username, requestId } = payload || {};
  cfg.users = (cfg.users || []).filter(u => u.username !== username);
  conf.save(cfg);
  log(`FTP user deleted: ${username}`);
  ipc.send('ftp:users:delete:reply', { requestId, ok: true });
});

ipc.on('ftp:info', payload => {
  ipc.send('ftp:info:reply', { requestId: payload?.requestId, port: cfg.port, root: cfg.root, pasvRange: [cfg.pasvPortMin, cfg.pasvPortMax] });
});

// ─── status ping (monitor health check) ──────────────────────────────────────
ipc.on('status:ping', payload => {
  ipc.send('status:pong', { requestId: payload?.requestId, engine: NAME, alive: true, ts: Date.now() });
});
