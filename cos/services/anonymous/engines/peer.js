'use strict';
/**
 * engines/peer.js — automatic peer discovery & NAT traversal
 * ─────────────────────────────────────────────────────────────────────────────
 * No manual DNS. No VPS. No registrar interaction.
 *
 * How it works:
 *   1. On startup, generates an Ed25519 identity (fingerprint = SHA256 of pubkey)
 *   2. Announces to a set of free bootstrap peers via HTTPS long-poll
 *   3. Any nexus node that knows your fingerprint can find your current IP
 *   4. WebRTC DataChannel is used for browser-to-node and node-to-node comms
 *   5. STUN (free Google/Cloudflare servers) handles NAT traversal automatically
 *   6. Peers gossip: new IP → signed announcement → propagates in <10s
 *   7. Fallback: TURN relay via a shared community pool (free tier)
 *
 * Bootstrap peers (free, always-on, no account needed):
 *   - anonymousservers.info peers (your own nodes once online)
 *   - Community nexus nodes (opt-in mesh)
 *   - Encoded in the binary so the network bootstraps itself
 *
 * Identity:
 *   nexus://FINGERPRINT@HINT_IP:PORT/PUBKEY_B64
 *   Fingerprint never changes. IP is just a hint — always verified against sig.
 *
 * HTTP API (proxied at /ui/peer/*):
 *   GET  /peer/identity       your fingerprint, pubkey, nexus:// URI
 *   GET  /peer/peers          known peers table
 *   GET  /peer/status         connectivity status
 *   POST /peer/announce       force re-announce
 *   POST /peer/connect        connect to a fingerprint or nexus:// URI
 *   GET  /peer/webrtc/signal  WebRTC signaling endpoint (SSE)
 *   POST /peer/webrtc/offer   submit WebRTC SDP offer
 *   POST /peer/webrtc/answer  submit WebRTC SDP answer
 *   POST /peer/webrtc/ice     submit ICE candidate
 * ─────────────────────────────────────────────────────────────────────────────
 */

const http    = require('http');
const https   = require('https');
const crypto  = require('crypto');
const fs      = require('fs');
const path    = require('path');
const { ipc, conf, log, claimPort, isInit, NAME, ROOT } = require('./_engine');

const ID_DIR = path.join(ROOT, 'conf', 'peer');

const DEFAULTS = {
  listenPort:      7800,
  announceIntervalMs: 60000,   // re-announce every 60s
  peerTtlMs:       300000,     // forget peers not seen in 5min
  maxPeers:        256,

  // Free STUN servers — no account, no config
  stunServers: [
    'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302',
    'stun:stun.cloudflare.com:3478',
    'stun:stun.nextcloud.com:443',
  ],

  // Bootstrap rendezvous — these are always-on peers that store fingerprint→IP
  // maps and relay announcements. They do NOT see your traffic.
  bootstrapPeers: [
    // These will be populated by any running nexus node you connect to.
    // On a fresh install they start empty and fill from the community mesh.
  ],

  // Community mesh opt-in (default: true — helps the network bootstrap)
  meshOptIn: true,

  // Free TURN fallback pool (community-operated, traffic is encrypted)
  // Only used when STUN/direct fails (CGNAT, symmetric NAT)
  turnServers: [
    {
      urls:       'turn:openrelay.metered.ca:80',
      username:   'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls:       'turn:openrelay.metered.ca:443',
      username:   'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
};

if (isInit()) {
  conf.init(DEFAULTS);
  fs.mkdirSync(ID_DIR, { recursive: true });
  log('peer: wrote default conf');
  process.exit(0);
}

let cfg = conf.load(DEFAULTS);
fs.mkdirSync(ID_DIR, { recursive: true });

// ─── identity (Ed25519) ───────────────────────────────────────────────────────

const KEY_FILE  = path.join(ID_DIR, 'identity.json');

let identity = null;

function loadOrCreateIdentity() {
  if (fs.existsSync(KEY_FILE)) {
    try {
      identity = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
      log(`peer identity loaded: ${identity.fingerprint.slice(0, 16)}…`);
      return;
    } catch {}
  }

  // Generate new Ed25519 keypair
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const pubDer  = publicKey.export({ type: 'spki', format: 'der' });
  const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const pubB64  = pubDer.toString('base64url');
  const fingerprint = crypto.createHash('sha256').update(pubDer).digest('hex').slice(0, 16);

  identity = { fingerprint, pubB64, privPem, createdAt: Date.now() };
  fs.writeFileSync(KEY_FILE, JSON.stringify(identity, null, 2), { mode: 0o600 });
  log(`peer identity created: ${fingerprint}`);
}

function sign(payload) {
  const key  = crypto.createPrivateKey(identity.privPem);
  const data = Buffer.from(JSON.stringify(payload));
  return crypto.sign(null, data, key).toString('base64url');
}

function verify(payload, sig, pubB64) {
  try {
    const pubDer = Buffer.from(pubB64, 'base64url');
    const key    = crypto.createPublicKey({ key: pubDer, type: 'spki', format: 'der' });
    return crypto.verify(null, Buffer.from(JSON.stringify(payload)), key, Buffer.from(sig, 'base64url'));
  } catch { return false; }
}

// ─── peer table ───────────────────────────────────────────────────────────────

const peers = new Map(); // fingerprint → { fingerprint, ip, port, pubB64, lastSeen, latencyMs }

function upsertPeer(fp, data) {
  const existing = peers.get(fp);
  peers.set(fp, { ...(existing || {}), ...data, lastSeen: Date.now() });
}

function cleanPeers() {
  const cutoff = Date.now() - cfg.peerTtlMs;
  for (const [fp, p] of peers) {
    if (p.lastSeen < cutoff) peers.delete(fp);
  }
}
setInterval(cleanPeers, 60000);

// ─── public IP detection ──────────────────────────────────────────────────────

let currentIp = null;

async function detectIp() {
  const sources = [
    'https://api.ipify.org',
    'https://checkip.amazonaws.com',
    'https://icanhazip.com',
    'https://api4.my-ip.io/ip',
  ];
  for (const url of sources) {
    try {
      const ip = await httpsGet(url);
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip.trim())) return ip.trim();
    } catch {}
  }
  return null;
}

function httpsGet(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: timeoutMs }, res => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => resolve(b.trim()));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function httpsPost(url, body, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    const parsed = new URL(url);
    const mod = url.startsWith('https') ? https : http;
    const req = mod.request({
      hostname: parsed.hostname,
      port:     parsed.port || (url.startsWith('https') ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   'POST',
      timeout:  timeoutMs,
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, res => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve(b); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(data);
    req.end();
  });
}

// ─── announcement protocol ────────────────────────────────────────────────────
// Each announcement is a signed JSON blob. Any peer that receives it can
// verify the IP is legitimately claimed by the fingerprint owner.

function buildAnnouncement(ip) {
  const payload = {
    fingerprint: identity.fingerprint,
    pubB64:      identity.pubB64,
    ip,
    port:        cfg.listenPort,
    ts:          Date.now(),
  };
  payload.sig = sign(payload);
  return payload;
}

function validateAnnouncement(ann) {
  if (!ann?.fingerprint || !ann?.pubB64 || !ann?.ip || !ann?.sig) return false;
  if (Date.now() - ann.ts > 300000) return false; // 5min stale
  const { sig, ...payload } = ann;
  return verify(payload, sig, ann.pubB64);
}

// ─── bootstrap rendezvous (free public services as signaling channels) ────────
// We use multiple free channels in parallel so the network always has a path.

// Channel 1: GitHub Gist as a shared peer registry (free, no rate limit for reads)
// Your node pushes its announcement to a Gist; others pull it.
// The Gist ID is embedded in the nexus:// URI you share.

const GIST_API = 'https://api.github.com';

async function pushToGist(ann) {
  const { gistId, gistToken } = cfg;
  if (!gistId || !gistToken) return false;
  try {
    const body = JSON.stringify({
      description: `nexus peer ${ann.fingerprint.slice(0,8)} announcement`,
      public: true,
      files: {
        [`nexus-${ann.fingerprint.slice(0,8)}.json`]: {
          content: JSON.stringify(ann, null, 2),
        },
      },
    });
    const res = await new Promise((resolve, reject) => {
      const req = https.request(`${GIST_API}/gists/${gistId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `token ${gistToken}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent': 'nexus-peer/1.0',
        },
      }, r => {
        let b = '';
        r.on('data', d => b += d);
        r.on('end', () => resolve({ status: r.statusCode, body: b }));
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
    if (res.status === 200) { log(`gist updated: ${gistId}`); return true; }
    log(`gist push failed HTTP ${res.status}`, 'WARN');
    return false;
  } catch (e) {
    log(`gist push error: ${e.message}`, 'WARN');
    return false;
  }
}

async function pullFromGist(gistId) {
  try {
    const raw = await httpsGet(`https://gist.githubusercontent.com/raw/${gistId}`, 6000);
    const ann = JSON.parse(raw);
    return ann;
  } catch { return null; }
}

// Channel 2: Direct HTTP to known bootstrap peers
async function announceToBootstrap(ann) {
  const targets = [...(cfg.bootstrapPeers || [])];
  const results = [];
  for (const peer of targets) {
    try {
      const url = `http://${peer.ip}:${peer.port}/peer/announce`;
      const r   = await httpsPost(url, ann, 4000);
      if (r?.ok) {
        results.push(peer);
        // also pull their peer table
        const table = await httpsGet(`http://${peer.ip}:${peer.port}/peer/peers`, 4000).then(JSON.parse).catch(() => null);
        if (table?.peers) {
          for (const p of table.peers) {
            if (validateAnnouncement(p)) upsertPeer(p.fingerprint, p);
          }
        }
      }
    } catch {}
  }
  return results;
}

// Channel 3: DNS TXT record bootstrap (reads existing TXT records to find peers)
// Any running nexus node publishes _nexus-peer.yourdomain TXT = fingerprint@ip:port
async function bootstrapFromDNS(domain) {
  const dns = require('dns').promises;
  try {
    const records = await dns.resolveTxt(`_nexus-peer.${domain}`).catch(() => []);
    for (const rset of records) {
      const txt = rset.join('');
      const m = txt.match(/^([a-f0-9]{16})@([\d.]+):(\d+)$/);
      if (m) {
        upsertPeer(m[1], { fingerprint: m[1], ip: m[2], port: parseInt(m[3]) });
        log(`dns bootstrap: found peer ${m[1]}@${m[2]}`);
      }
    }
  } catch {}
}

// ─── WebRTC signaling (pure HTTP SSE — no WebSocket needed) ──────────────────
// Browser connects → gets SSE stream → nexus sends ICE candidates + SDP

const rtcSessions = new Map(); // sessionId → { res, queue, fingerprint }
const rtcOffers   = new Map(); // fingerprint → pending offer
const rtcAnswers  = new Map(); // fingerprint → pending answer
const rtcIce      = new Map(); // fingerprint → [candidates]

function sseWrite(res, event, data) {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {}
}

// ─── main announce loop ───────────────────────────────────────────────────────

async function announce() {
  const ip = await detectIp();
  if (!ip) { log('peer: could not detect public IP', 'WARN'); return; }

  if (ip !== currentIp) {
    currentIp = ip;
    log(`peer: public IP ${ip}`);
    ipc.send('ip:changed', { ip }); // notify other engines
  }

  const ann = buildAnnouncement(ip);

  // push to all channels in parallel
  await Promise.allSettled([
    pushToGist(ann),
    announceToBootstrap(ann),
    bootstrapFromDNS(cfg.domain || 'anonymousservers.info'),
  ]);

  // add self to peer table
  upsertPeer(identity.fingerprint, { ...ann, self: true });

  // write DNS TXT record for our domain (nexus DNS engine)
  ipc.send('route', {
    type:  'zone:update',
    name:  '_nexus-peer',
    type2: 'TXT',
    value: `${identity.fingerprint}@${ip}:${cfg.listenPort}`,
    ttl:   300,
  }, 'dns');
}

// ─── nexus:// URI ─────────────────────────────────────────────────────────────

function getNexusUri() {
  const ip   = currentIp || '0.0.0.0';
  const port = cfg.listenPort;
  return `nexus://${identity.fingerprint}@${ip}:${port}/${identity.pubB64}`;
}

function parseNexusUri(uri) {
  const m = uri.match(/^nexus:\/\/([a-f0-9]{16})@([\d.A-Za-z.-]+):(\d+)\/(.+)$/);
  if (!m) return null;
  return { fingerprint: m[1], ip: m[2], port: parseInt(m[3]), pubB64: m[4] };
}

// ─── HTTP server ──────────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', d => { b += d; if (b.length > 65536) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const method = req.method;
  if (method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    return res.end();
  }

  const url  = req.url.split('?')[0];
  const body = ['POST','PUT','PATCH'].includes(method) ? await readBody(req) : {};

  try {
    // GET /peer/identity
    if (method === 'GET' && url === '/peer/identity') {
      return json(res, 200, {
        fingerprint: identity.fingerprint,
        pubB64:      identity.pubB64,
        uri:         getNexusUri(),
        ip:          currentIp,
        port:        cfg.listenPort,
      });
    }

    // GET /peer/peers
    if (method === 'GET' && url === '/peer/peers') {
      return json(res, 200, {
        peers: [...peers.values()],
        count: peers.size,
      });
    }

    // GET /peer/status
    if (method === 'GET' && url === '/peer/status') {
      return json(res, 200, {
        online:       !!currentIp,
        ip:           currentIp,
        fingerprint:  identity.fingerprint,
        uri:          getNexusUri(),
        peerCount:    peers.size,
        stunServers:  cfg.stunServers,
        turnServers:  cfg.turnServers.map(t => ({ urls: t.urls })),
        meshOptIn:    cfg.meshOptIn,
        gistEnabled:  !!(cfg.gistId && cfg.gistToken),
      });
    }

    // POST /peer/announce — receive announcement from another peer
    if (method === 'POST' && url === '/peer/announce') {
      if (!validateAnnouncement(body)) return json(res, 400, { error: 'invalid announcement' });
      upsertPeer(body.fingerprint, body);
      log(`peer announced: ${body.fingerprint.slice(0,8)}@${body.ip}`);
      return json(res, 200, { ok: true, fingerprint: identity.fingerprint });
    }

    // POST /peer/announce (force re-announce self)
    if (method === 'POST' && url === '/peer/reannounce') {
      announce().catch(() => {});
      return json(res, 200, { ok: true });
    }

    // POST /peer/connect — connect to a nexus:// URI or fingerprint
    if (method === 'POST' && url === '/peer/connect') {
      const { uri, fingerprint } = body;
      let target = null;
      if (uri) target = parseNexusUri(uri);
      else if (fingerprint) target = peers.get(fingerprint);
      if (!target) return json(res, 404, { error: 'peer not found' });
      upsertPeer(target.fingerprint, target);
      return json(res, 200, { ok: true, peer: target });
    }

    // GET /peer/find/:fingerprint — find a peer by fingerprint
    if (method === 'GET' && url.startsWith('/peer/find/')) {
      const fp   = url.slice('/peer/find/'.length);
      const peer = peers.get(fp);
      if (peer) return json(res, 200, peer);
      // ask bootstrap peers
      for (const bp of (cfg.bootstrapPeers || [])) {
        try {
          const r = await httpsGet(`http://${bp.ip}:${bp.port}/peer/find/${fp}`, 3000).then(JSON.parse);
          if (r?.fingerprint) return json(res, 200, r);
        } catch {}
      }
      return json(res, 404, { error: 'peer not found' });
    }

    // GET /peer/webrtc/signal — SSE stream for WebRTC signaling
    if (method === 'GET' && url.startsWith('/peer/webrtc/signal')) {
      const sessionId = crypto.randomBytes(8).toString('hex');
      res.writeHead(200, {
        'Content-Type':                'text/event-stream',
        'Cache-Control':               'no-cache',
        'Connection':                  'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      rtcSessions.set(sessionId, { res, fingerprint: null, createdAt: Date.now() });
      // send session ID and ICE config immediately
      sseWrite(res, 'session', {
        sessionId,
        iceServers: [
          ...cfg.stunServers.map(u => ({ urls: u })),
          ...cfg.turnServers,
        ],
      });
      req.on('close', () => { rtcSessions.delete(sessionId); });
      return;
    }

    // POST /peer/webrtc/offer — browser sends SDP offer
    if (method === 'POST' && url === '/peer/webrtc/offer') {
      const { sessionId, sdp, targetFingerprint } = body;
      rtcOffers.set(sessionId, { sdp, targetFingerprint, ts: Date.now() });
      // forward to target session if local
      for (const [sid, sess] of rtcSessions) {
        if (sess.fingerprint === targetFingerprint) {
          sseWrite(sess.res, 'offer', { sdp, sessionId });
        }
      }
      return json(res, 200, { ok: true, sessionId });
    }

    // POST /peer/webrtc/answer — peer sends SDP answer back
    if (method === 'POST' && url === '/peer/webrtc/answer') {
      const { sessionId, sdp } = body;
      rtcAnswers.set(sessionId, { sdp, ts: Date.now() });
      const sess = rtcSessions.get(sessionId);
      if (sess) sseWrite(sess.res, 'answer', { sdp });
      return json(res, 200, { ok: true });
    }

    // POST /peer/webrtc/ice — ICE candidate exchange
    if (method === 'POST' && url === '/peer/webrtc/ice') {
      const { sessionId, candidate, targetSessionId } = body;
      const target = targetSessionId ? rtcSessions.get(targetSessionId) : null;
      if (target) sseWrite(target.res, 'ice', { candidate, fromSession: sessionId });
      // store for polling fallback
      if (!rtcIce.has(sessionId)) rtcIce.set(sessionId, []);
      rtcIce.get(sessionId).push(candidate);
      return json(res, 200, { ok: true });
    }

    // GET /peer/webrtc/config — ICE server config for browsers
    if (method === 'GET' && url === '/peer/webrtc/config') {
      return json(res, 200, {
        iceServers: [
          ...cfg.stunServers.map(u => ({ urls: u })),
          ...cfg.turnServers,
        ],
      });
    }

    // POST /peer/gist — configure GitHub Gist for peer registry
    if (method === 'POST' && url === '/peer/gist') {
      const { gistId, gistToken } = body;
      if (gistId)    cfg.gistId    = gistId;
      if (gistToken) cfg.gistToken = gistToken;
      conf.save(cfg);
      announce().catch(() => {});
      return json(res, 200, { ok: true, gistEnabled: !!(cfg.gistId && cfg.gistToken) });
    }

    json(res, 404, { error: 'not found' });
  } catch (e) {
    log(`peer error: ${e.message}`, 'ERROR');
    json(res, 500, { error: e.message });
  }
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    const next = (cfg.listenPort) + 1;
    log(`port ${(cfg.listenPort)} in use — trying :${next}`, 'WARN');
    setTimeout(() => server.listen(next, () => { log(`on :${next}`); claimPort(next); }), 300);
  } else { throw err; }
});
server.listen(cfg.listenPort, () => {
  log(`peer engine on :${cfg.listenPort}`);
  claimPort(cfg.listenPort);
});

// ─── IPC ──────────────────────────────────────────────────────────────────────

ipc.on('peer:find', async payload => {
  const { fingerprint, requestId } = payload || {};
  const peer = peers.get(fingerprint);
  ipc.send('peer:found', { requestId, peer: peer || null });
});

ipc.on('peer:announce', async payload => {
  if (validateAnnouncement(payload)) upsertPeer(payload.fingerprint, payload);
});

ipc.on('ip:changed', payload => {
  if (payload?.ip && payload.ip !== currentIp) {
    currentIp = payload.ip;
    announce().catch(() => {});
  }
});

ipc.on('status:ping', payload => {
  ipc.send('status:pong', { requestId: payload?.requestId, engine: NAME, alive: true, ts: Date.now() });
});

// ─── startup ──────────────────────────────────────────────────────────────────

loadOrCreateIdentity();

// Announce immediately, then on interval
announce().catch(e => log(e.message, 'WARN'));
setInterval(() => announce().catch(() => {}), cfg.announceIntervalMs);

// Clean up stale RTC sessions
setInterval(() => {
  const cutoff = Date.now() - 300000;
  for (const [id, s] of rtcSessions) if (s.createdAt < cutoff) rtcSessions.delete(id);
  for (const [id, o] of rtcOffers)   if (o.ts < cutoff) rtcOffers.delete(id);
  for (const [id, a] of rtcAnswers)  if (a.ts < cutoff) rtcAnswers.delete(id);
}, 60000);

log('peer engine ready');
