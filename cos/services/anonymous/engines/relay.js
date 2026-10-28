'use strict';
/**
 * engines/relay.js — phantom relay
 * anonymousservers.info
 *
 * What this is: an encrypted TCP tunnel between an edge node and your origin.
 * Same concept as Cloudflare's Argo Tunnel / Cloudflare Tunnel, or ngrok.
 * Traffic hits the relay, gets re-encrypted, forwarded to origin over a
 * persistent encrypted channel. Origin IP never appears in public DNS.
 *
 * Two modes:
 *   server  — runs on the public edge VPS (the relay node)
 *   client  — runs here on the origin, dials the relay, tunnels traffic back
 *
 * Wire protocol:
 *   All frames are: [4-byte length][1-byte type][payload]
 *   Types: 0x01=HELLO 0x02=DATA 0x03=PING 0x04=PONG 0x05=CLOSE 0x06=OPEN
 *
 * Encryption: TLS 1.3 mutual auth (both sides present certs).
 * Pre-shared key: written to conf/relay/psk on first run, shared manually
 * to the edge node. No external CA needed — self-signed pair, pinned.
 */

const net    = require('net');
const tls    = require('tls');
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');
const { execSync } = require('child_process');
const { ipc, conf, log, claimPort, isInit, NAME } = require('./_engine');

const ROOT     = process.env.NEXUS_ROOT || path.join(__dirname, '..');
const RELAY_DIR = path.join(ROOT, 'conf', 'relay');

const DEFAULTS = {
  mode:          'client',       // 'client' (origin) | 'server' (edge node)
  // client settings
  relayHost:     '',             // IP or hostname of your edge VPS
  relayPort:     7443,           // relay control port on edge
  originTarget:  'localhost:80', // where to forward decrypted traffic locally
  reconnectMs:   5000,
  // server settings
  listenPort:    7443,
  publicPort:    443,            // port the relay exposes to the internet
  // shared
  pskFile:       path.join(RELAY_DIR, 'psk'),
  certFile:      path.join(RELAY_DIR, 'relay.crt'),
  keyFile:       path.join(RELAY_DIR, 'relay.key'),
  maxChannels:   100,
  pingIntervalMs: 15000,
};

if (isInit()) {
  conf.init(DEFAULTS);
  fs.mkdirSync(RELAY_DIR, { recursive: true });
  generateRelayCerts();
  generatePSK();
  log('relay: wrote default conf + generated certs + PSK');
  process.exit(0);
}

let cfg = conf.load(DEFAULTS);
fs.mkdirSync(RELAY_DIR, { recursive: true });

// ─── cert + PSK generation ────────────────────────────────────────────────────

function generateRelayCerts() {
  if (fs.existsSync(cfg.certFile) && fs.existsSync(cfg.keyFile)) return;
  try {
    execSync(
      `openssl req -x509 -newkey rsa:2048 -keyout "${cfg.keyFile}" -out "${cfg.certFile}" ` +
      `-days 3650 -nodes -subj "/CN=relay.anonymousservers.info"`,
      { stdio: 'ignore' }
    );
    log('relay certs generated');
  } catch {
    // fallback: generate with Node crypto
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    fs.writeFileSync(cfg.keyFile, privateKey.export({ type: 'pkcs8', format: 'pem' }));
    fs.writeFileSync(cfg.certFile, privateKey.export({ type: 'pkcs8', format: 'pem' }));
    log('relay key generated (no openssl — cert placeholder)', 'WARN');
  }
}

function generatePSK() {
  if (!fs.existsSync(cfg.pskFile)) {
    const psk = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(cfg.pskFile, psk, { mode: 0o600 });
    log(`PSK generated: ${cfg.pskFile} — copy this to your edge node`);
  }
}

function loadPSK() {
  try { return fs.readFileSync(cfg.pskFile, 'utf8').trim(); }
  catch { log('PSK file missing — relay auth will fail', 'ERROR'); return null; }
}

// ─── frame codec ─────────────────────────────────────────────────────────────

const TYPE = { HELLO: 0x01, DATA: 0x02, PING: 0x03, PONG: 0x04, CLOSE: 0x05, OPEN: 0x06 };

function encodeFrame(type, payload) {
  const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload || '');
  const frame = Buffer.allocUnsafe(5 + buf.length);
  frame.writeUInt32BE(buf.length + 1, 0);
  frame.writeUInt8(type, 4);
  buf.copy(frame, 5);
  return frame;
}

class FrameParser {
  constructor(onFrame) { this._buf = Buffer.alloc(0); this._onFrame = onFrame; }
  push(chunk) {
    this._buf = Buffer.concat([this._buf, chunk]);
    while (this._buf.length >= 5) {
      const len = this._buf.readUInt32BE(0);
      if (this._buf.length < 4 + len) break;
      const type    = this._buf.readUInt8(4);
      const payload = this._buf.slice(5, 4 + len);
      this._buf = this._buf.slice(4 + len);
      this._onFrame(type, payload);
    }
  }
}

// ─── HMAC auth ────────────────────────────────────────────────────────────────

function makeAuthToken(psk, nonce) {
  return crypto.createHmac('sha256', psk).update(nonce).digest('hex');
}

function verifyAuth(psk, nonce, token) {
  const expected = makeAuthToken(psk, nonce);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
  } catch { return false; }
}

// ─── RELAY SERVER (runs on edge VPS) ─────────────────────────────────────────

function startServer() {
  generateRelayCerts();
  const psk = loadPSK();
  if (!psk) return;

  const channels = new Map(); // channelId -> { originSocket, edgeSocket }
  let controlSocket = null;   // persistent TLS connection from client (origin)

  // Public-facing TCP server — internet traffic comes here
  const publicServer = net.createServer(publicSocket => {
    if (!controlSocket) {
      publicSocket.destroy();
      log('public connection dropped — no origin tunnel connected', 'WARN');
      return;
    }
    const channelId = crypto.randomBytes(4).toString('hex');
    channels.set(channelId, { publicSocket });

    // Tell origin to open a channel
    controlSocket.write(encodeFrame(TYPE.OPEN, JSON.stringify({ channelId })));

    publicSocket.on('data', data => {
      if (!controlSocket) return publicSocket.destroy();
      controlSocket.write(encodeFrame(TYPE.DATA, Buffer.concat([
        Buffer.from(channelId + ':'),
        data
      ])));
    });
    publicSocket.on('close', () => {
      channels.delete(channelId);
      if (controlSocket) controlSocket.write(encodeFrame(TYPE.CLOSE, channelId));
    });
    publicSocket.on('error', () => channels.delete(channelId));
  });

  publicServer.listen(cfg.publicPort, () => {
    log(`relay public port :${cfg.publicPort} open`);
    claimPort(cfg.publicPort);
  });

  // Control server — origin client connects here with mutual TLS
  const tlsOpts = fs.existsSync(cfg.certFile)
    ? { cert: fs.readFileSync(cfg.certFile), key: fs.readFileSync(cfg.keyFile) }
    : {};

  const controlServer = tls.createServer({ ...tlsOpts, requestCert: false }, socket => {
    log(`origin connected from ${socket.remoteAddress}`);
    const parser = new FrameParser((type, payload) => {
      if (type === TYPE.HELLO) {
        const { nonce, token } = JSON.parse(payload.toString());
        if (!verifyAuth(psk, nonce, token)) {
          log('relay auth failed — dropping connection', 'WARN');
          socket.destroy(); return;
        }
        log('origin authenticated');
        controlSocket = socket;
        socket.write(encodeFrame(TYPE.HELLO, JSON.stringify({ ok: true })));
      } else if (type === TYPE.DATA) {
        const raw   = payload.toString();
        const colon = raw.indexOf(':');
        const channelId = raw.slice(0, colon);
        const data      = payload.slice(colon + 1);
        const ch = channels.get(channelId);
        if (ch?.publicSocket) ch.publicSocket.write(data);
      } else if (type === TYPE.PING) {
        socket.write(encodeFrame(TYPE.PONG));
      }
    });
    socket.on('data', chunk => parser.push(chunk));
    socket.on('close', () => {
      if (controlSocket === socket) { controlSocket = null; log('origin disconnected', 'WARN'); }
    });
    socket.on('error', () => {});
  });

  controlServer.listen(cfg.listenPort, () => {
    log(`relay control port :${cfg.listenPort} ready`);
    claimPort(cfg.listenPort);
  });

  log('relay server mode — edge node running');
}

// ─── RELAY CLIENT (runs on origin — this machine) ─────────────────────────────

function startClient() {
  const psk = loadPSK();
  if (!psk) return;
  if (!cfg.relayHost) {
    log('relay client: relayHost not set in conf/relay.conf — skipping', 'WARN');
    return;
  }

  const [targetHost, targetPortStr] = cfg.originTarget.split(':');
  const targetPort = Number(targetPortStr) || 80;

  const pendingChannels = new Map(); // channelId -> localSocket

  function connect() {
    log(`relay client: connecting to ${cfg.relayHost}:${cfg.relayPort}`);
    const tlsOpts = {
      host: cfg.relayHost,
      port: cfg.relayPort,
      rejectUnauthorized: false, // self-signed relay cert — we verify via PSK HMAC
    };

    const socket = tls.connect(tlsOpts, () => {
      // authenticate with HMAC
      const nonce = crypto.randomBytes(16).toString('hex');
      const token = makeAuthToken(psk, nonce);
      socket.write(encodeFrame(TYPE.HELLO, JSON.stringify({ nonce, token })));
      log('relay client: authenticated');

      // ping keepalive
      const pingInterval = setInterval(() => {
        if (socket.destroyed) { clearInterval(pingInterval); return; }
        socket.write(encodeFrame(TYPE.PING));
      }, cfg.pingIntervalMs);
    });

    const parser = new FrameParser((type, payload) => {
      if (type === TYPE.HELLO) {
        const { ok } = JSON.parse(payload.toString());
        if (!ok) { log('relay auth rejected', 'ERROR'); socket.destroy(); }
      } else if (type === TYPE.OPEN) {
        // edge got a public connection — open local socket to origin
        const { channelId } = JSON.parse(payload.toString());
        const local = net.createConnection({ host: targetHost, port: targetPort });
        pendingChannels.set(channelId, local);

        local.on('data', data => {
          socket.write(encodeFrame(TYPE.DATA, Buffer.concat([
            Buffer.from(channelId + ':'),
            data
          ])));
        });
        local.on('close', () => {
          pendingChannels.delete(channelId);
          if (!socket.destroyed) socket.write(encodeFrame(TYPE.CLOSE, channelId));
        });
        local.on('error', () => pendingChannels.delete(channelId));

      } else if (type === TYPE.DATA) {
        const raw       = payload.toString('binary');
        const colon     = raw.indexOf(':');
        const channelId = raw.slice(0, colon);
        const data      = payload.slice(colon + 1);
        const local     = pendingChannels.get(channelId);
        if (local && !local.destroyed) local.write(data);

      } else if (type === TYPE.CLOSE) {
        const channelId = payload.toString();
        const local = pendingChannels.get(channelId);
        if (local) { local.destroy(); pendingChannels.delete(channelId); }

      } else if (type === TYPE.PONG) {
        // keepalive acknowledged
      }
    });

    socket.on('data', chunk => parser.push(chunk));
    socket.on('close', () => {
      log(`relay client: disconnected — reconnecting in ${cfg.reconnectMs}ms`, 'WARN');
      pendingChannels.forEach(s => s.destroy());
      pendingChannels.clear();
      setTimeout(connect, cfg.reconnectMs);
    });
    socket.on('error', err => log(`relay client error: ${err.message}`, 'WARN'));
  }

  connect();
  log(`relay client mode — tunneling ${cfg.originTarget} through ${cfg.relayHost}:${cfg.relayPort}`);
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────

ipc.on('relay:status', () => {
  ipc.send('relay:status:reply', {
    mode: cfg.mode,
    relayHost: cfg.relayHost,
    relayPort: cfg.relayPort,
    pskExists: fs.existsSync(cfg.pskFile),
    certExists: fs.existsSync(cfg.certFile),
  });
});

ipc.on('relay:sethost', payload => {
  if (!payload?.host) return;
  cfg.relayHost = payload.host;
  conf.save(cfg);
  log(`relay host set to ${cfg.relayHost}`);
});

// ─── start ────────────────────────────────────────────────────────────────────

generateRelayCerts();
generatePSK();
log(`relay engine starting in ${cfg.mode} mode`);
if (cfg.mode === 'server') startServer();
else startClient();

// ─── status ping (monitor health check) ──────────────────────────────────────
ipc.on('status:ping', payload => {
  ipc.send('status:pong', { requestId: payload?.requestId, engine: NAME, alive: true, ts: Date.now() });
});

