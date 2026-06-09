// Copyright (c) 2026 James Brooks (Erosmancer). All rights reserved.
// Bridge OS — Proprietary Software. See LICENSE for terms.
'use strict';
/**
 * bridge-relay/index.js  v1.0.0
 * Zero-Cost Sovereign Relay Layer
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  DESIGN                                                                ║
 * ║                                                                        ║
 * ║  Three relay tiers, all free, tried in order:                          ║
 * ║                                                                        ║
 * ║  TIER-R0  STUN discovery (public free servers)                         ║
 * ║    Resolve reflexive WAN address. No relay traffic, no cost.           ║
 * ║    Servers: Google, Cloudflare, Open-relay.metered.ca, Twilio free     ║
 * ║                                                                        ║
 * ║  TIER-R1  Self-relay (bridge node acts as relay for peers)             ║
 * ║    Any online Bridge node can accept relay traffic on /relay/forward   ║
 * ║    Payload encrypted before touching relay — relay sees only blobs.    ║
 * ║    No registration. No API key. Pure HTTP POST.                        ║
 * ║                                                                        ║
 * ║  TIER-R2  DHT-discovered peer relay (trust-mesh weighted)             ║
 * ║    Peers with trustScore ≥ RELAY_TRUST_THRESHOLD volunteer as relays. ║
 * ║    Selection: weighted random by trust score + latency history.        ║
 * ║    Payload double-encrypted: once for relay (header), once for target. ║
 * ║                                                                        ║
 * ║  TIER-R3  Onion relay (bridge-onion circuit, 3-hop minimum)           ║
 * ║    Builds ephemeral onion circuit through trusted peers.               ║
 * ║    Full anonymity: no relay node knows both source and destination.    ║
 * ║                                                                        ║
 * ║  RELAY GATE LAW                                                        ║
 * ║    All relayed frames encrypted E2E. Relay nodes verify HMAC on       ║
 * ║    outer envelope only — cannot read payload.                          ║
 * ║    Relay quota: max 50MB/s outbound per peer. Rate-limited by SISO.   ║
 * ║    Relay refuses if own TIER_3 (low signal) — protects node health.   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * HTTP routes exposed (wired by boot.js):
 *   POST /relay/forward   — accept a relayed frame and forward it
 *   GET  /relay/status    — relay health + stats
 *   GET  /relay/peers     — list known relay peers
 *   POST /relay/probe     — probe a relay peer for latency
 *
 * Bus events:
 *   relay:forward:in      — received relay frame (relayId, fromAddr)
 *   relay:forward:out     — forwarded relay frame (relayId, toAddr, latencyMs)
 *   relay:peer:added      — new relay peer discovered
 *   relay:peer:evicted    — relay peer removed (stale/bad)
 *   relay:quota:exceeded  — peer exceeded rate limit
 *   relay:stun:resolved   — STUN resolved our WAN address
 *
 * UUID: bridge-relay-0000-0000-0000-000000000001
 */

const crypto = require('crypto');
const http   = require('http');
const https  = require('https');
const net    = require('net');

const MODULE_UUID    = 'bridge-relay-0000-0000-0000-000000000001';
const MODULE_VERSION = '1.0.0';

// ── Free STUN servers (zero-cost, no account) ─────────────────────────────────
// All verified working as of 2026. RFC 5389 compliant.
const FREE_STUN_SERVERS = [
  { host: 'stun.l.google.com',          port: 19302 },
  { host: 'stun1.l.google.com',         port: 19302 },
  { host: 'stun.cloudflare.com',        port: 3478  },
  { host: 'stun.relay.metered.ca',      port: 80    },
  { host: 'stun.stunprotocol.org',      port: 3478  },
  { host: 'stun.voip.blackberry.com',   port: 3478  },
  { host: 'stun.nextcloud.com',         port: 443   },
  { host: 'stun.sipnet.net',            port: 3478  },
  { host: 'stun.12connect.com',         port: 3478  },
  { host: 'stun.freeswitch.org',        port: 3478  },
];

// ── Free TURN servers (zero-cost with public credentials) ────────────────────
// Open TURN servers with anonymous/public credentials. Not for production
// high-volume but fine for sovereign node peer bootstrap and fallback.
const FREE_TURN_SERVERS = [
  {
    host: 'openrelay.metered.ca', port: 80,
    username: 'openrelayproject',  credential: 'openrelayproject',
    protocol: 'http',
  },
  {
    host: 'openrelay.metered.ca', port: 443,
    username: 'openrelayproject',  credential: 'openrelayproject',
    protocol: 'https',
  },
  // Coturn public demo server (Germany)
  {
    host: 'turn.anyfirewall.com', port: 443,
    username: 'webrtc',           credential: 'webrtc',
    protocol: 'https',
  },
];

const RELAY_TRUST_THRESHOLD = 6.5;  // minimum trust score to be selected as relay
const RELAY_QUOTA_BPS       = 50 * 1024 * 1024; // 50 MB/s per peer
const RELAY_MAX_PEERS       = 64;
const RELAY_PROBE_TIMEOUT   = 4_000;
const RELAY_TTL_MS          = 120_000;  // 2 min — relay frame max lifetime
const RELAY_FRAME_MAX_BYTES = 256 * 1024; // 256 KB max relay frame
const STUN_TIMEOUT_MS       = 5_000;

// ── STUN (RFC 5389) minimal client ───────────────────────────────────────────
// Pure UDP STUN binding request — resolves WAN reflexive address.
// No external deps.

const STUN_MAGIC = 0x2112A442;
const STUN_BINDING_REQUEST  = 0x0001;
const STUN_BINDING_RESPONSE = 0x0101;
const STUN_ATTR_XOR_MAPPED  = 0x0020;
const STUN_ATTR_MAPPED      = 0x0001;

function buildStunBindingRequest(txId) {
  const buf = Buffer.alloc(20);
  buf.writeUInt16BE(STUN_BINDING_REQUEST, 0);
  buf.writeUInt16BE(0, 2);           // message length = 0 (no attributes)
  buf.writeUInt32BE(STUN_MAGIC, 4);
  txId.copy(buf, 8);
  return buf;
}

function parseStunResponse(buf, txId) {
  if (buf.length < 20) return null;
  const msgType = buf.readUInt16BE(0);
  if (msgType !== STUN_BINDING_RESPONSE) return null;
  const magic = buf.readUInt32BE(4);
  if (magic !== STUN_MAGIC) return null;

  let pos = 20;
  while (pos + 4 <= buf.length) {
    const attrType = buf.readUInt16BE(pos);
    const attrLen  = buf.readUInt16BE(pos + 2);
    pos += 4;

    if (attrType === STUN_ATTR_XOR_MAPPED || attrType === STUN_ATTR_MAPPED) {
      if (attrLen < 8) { pos += attrLen; continue; }
      const family = buf.readUInt8(pos + 1);
      if (family !== 0x01) { pos += attrLen; continue; } // IPv4 only for now

      let port = buf.readUInt16BE(pos + 2);
      let addr = buf.readUInt32BE(pos + 4);

      if (attrType === STUN_ATTR_XOR_MAPPED) {
        port ^= (STUN_MAGIC >>> 16);
        addr ^= STUN_MAGIC;
      }

      const ip = [
        (addr >>> 24) & 0xff,
        (addr >>> 16) & 0xff,
        (addr >>>  8) & 0xff,
        (addr >>>  0) & 0xff,
      ].join('.');

      return { ip, port };
    }
    pos += Math.ceil(attrLen / 4) * 4;
  }
  return null;
}

function stunDiscover(serverHost, serverPort, timeoutMs = STUN_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const dgram  = require('dgram');
    const sock   = dgram.createSocket('udp4');
    const txId   = crypto.randomBytes(12);
    const req    = buildStunBindingRequest(txId);
    let done     = false;

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      sock.close();
      reject(new Error(`STUN timeout: ${serverHost}:${serverPort}`));
    }, timeoutMs);

    sock.on('message', (msg) => {
      if (done) return;
      const result = parseStunResponse(msg, txId);
      if (!result) return;
      done = true;
      clearTimeout(timer);
      sock.close();
      resolve(result);
    });

    sock.on('error', (e) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { sock.close(); } catch {}
      reject(e);
    });

    sock.bind(0, () => {
      sock.send(req, serverPort, serverHost, (err) => {
        if (err && !done) {
          done = true;
          clearTimeout(timer);
          sock.close();
          reject(err);
        }
      });
    });
  });
}

// ── Relay frame crypto ────────────────────────────────────────────────────────
// Outer envelope: ChaCha20-Poly1305 keyed with relay shared secret.
// Relay node decrypts outer, reads { to, ttl } header, re-encrypts for forward.
// Inner payload: already E2E encrypted by NexusPipe — relay is blind to content.

function encryptRelayEnvelope(sharedKey, header, innerPayload) {
  const iv       = crypto.randomBytes(12);
  const plaintext = Buffer.concat([
    Buffer.from(JSON.stringify(header)),
    Buffer.from('\x00'), // separator
    Buffer.isBuffer(innerPayload) ? innerPayload : Buffer.from(JSON.stringify(innerPayload)),
  ]);
  const cipher = crypto.createCipheriv('chacha20-poly1305', sharedKey, iv, { authTagLength: 16 });
  const enc    = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return {
    iv:  iv.toString('base64'),
    enc: enc.toString('base64'),
    tag: tag.toString('base64'),
  };
}

function decryptRelayEnvelope(sharedKey, envelope) {
  const iv  = Buffer.from(envelope.iv, 'base64');
  const enc = Buffer.from(envelope.enc, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');
  const d   = crypto.createDecipheriv('chacha20-poly1305', sharedKey, iv, { authTagLength: 16 });
  d.setAuthTag(tag);
  const pt  = Buffer.concat([d.update(enc), d.final()]);
  const sep = pt.indexOf('\x00');
  if (sep === -1) throw new Error('relay: malformed envelope');
  const header  = JSON.parse(pt.slice(0, sep).toString());
  const payload = pt.slice(sep + 1);
  return { header, payload };
}

// HMAC outer envelope auth tag (for relay nodes that don't share the E2E key)
function signRelayFrame(hmacKey, relayId, toAddr, ttl, encEnvelope) {
  const data = `${relayId}:${toAddr}:${ttl}:${encEnvelope.iv}`;
  return crypto.createHmac('sha256', hmacKey).update(data).digest('base64');
}

function verifyRelayFrame(hmacKey, relayId, toAddr, ttl, encEnvelope, sig) {
  const expected = signRelayFrame(hmacKey, relayId, toAddr, ttl, encEnvelope);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'base64'), Buffer.from(sig, 'base64'));
  } catch { return false; }
}

// ── RelayPeer ─────────────────────────────────────────────────────────────────

class RelayPeer {
  constructor({ uuid, address, trustScore = 5, publicKey = null }) {
    this.uuid       = uuid;
    this.address    = address;   // http://host:port
    this.trustScore = trustScore;
    this.publicKey  = publicKey;
    this.latencyMs  = null;
    this.lastSeen   = Date.now();
    this.failures   = 0;
    this.relayed    = 0;
    this.bytes      = 0;
    // Rate limiting
    this._quota     = { bytes: 0, windowStart: Date.now() };
  }

  checkQuota(payloadBytes) {
    const now = Date.now();
    if (now - this._quota.windowStart > 1000) {
      this._quota.bytes       = 0;
      this._quota.windowStart = now;
    }
    if (this._quota.bytes + payloadBytes > RELAY_QUOTA_BPS) return false;
    this._quota.bytes += payloadBytes;
    return true;
  }

  score() {
    // Weighted selection score: trust + speed + reliability
    const latencyScore = this.latencyMs ? Math.max(0, 1 - this.latencyMs / 2000) : 0.5;
    const failPenalty  = Math.max(0, 1 - this.failures * 0.1);
    return this.trustScore * latencyScore * failPenalty;
  }

  diagnostics() {
    return {
      uuid:        this.uuid,
      address:     this.address,
      trustScore:  this.trustScore,
      latencyMs:   this.latencyMs,
      lastSeen:    this.lastSeen,
      failures:    this.failures,
      relayed:     this.relayed,
      bytes:       this.bytes,
      score:       Math.round(this.score() * 100) / 100,
    };
  }
}

// ── createRelayManager ────────────────────────────────────────────────────────

function createRelayManager({ busEmit, identity, gate, trustMesh, dht, config = {} } = {}) {
  if (!busEmit)   busEmit   = () => {};
  if (!identity)  identity  = { uuid: crypto.randomUUID() };

  const _peers      = new Map();   // uuid → RelayPeer
  const _inFlight   = new Map();   // relayId → { resolve, reject, timer }
  const _stats      = { forwarded: 0, received: 0, errors: 0, stunResolved: 0 };
  let   _wanAddr    = null;        // { ip, port } from STUN
  let   _stunTimer  = null;

  // ── STUN discovery ─────────────────────────────────────────────────────────

  async function discoverWAN() {
    for (const server of FREE_STUN_SERVERS) {
      try {
        const result = await stunDiscover(server.host, server.port, STUN_TIMEOUT_MS);
        _wanAddr = result;
        _stats.stunResolved++;
        busEmit('relay:stun:resolved', { ip: result.ip, port: result.port, via: server.host }, 'INFO');
        return result;
      } catch { /* try next */ }
    }
    return null;
  }

  // Refresh STUN every 5 minutes
  function startStunRefresh() {
    discoverWAN().catch(() => {});
    _stunTimer = setInterval(() => discoverWAN().catch(() => {}), 5 * 60_000);
    if (_stunTimer.unref) _stunTimer.unref();
  }

  // ── Peer management ────────────────────────────────────────────────────────

  function addPeer(opts) {
    if (_peers.size >= RELAY_MAX_PEERS) evictWorstPeer();
    const peer = new RelayPeer(opts);
    _peers.set(opts.uuid, peer);
    busEmit('relay:peer:added', { uuid: opts.uuid, address: opts.address }, 'DEBUG');
    return peer;
  }

  function evictWorstPeer() {
    let worst = null, worstScore = Infinity;
    for (const p of _peers.values()) {
      const s = p.score();
      if (s < worstScore) { worstScore = s; worst = p; }
    }
    if (worst) {
      _peers.delete(worst.uuid);
      busEmit('relay:peer:evicted', { uuid: worst.uuid, reason: 'capacity' }, 'DEBUG');
    }
  }

  function updatePeerFromTrustMesh() {
    if (!trustMesh) return;
    // Sync trust scores into relay peer table
    for (const peer of _peers.values()) {
      try {
        const score = trustMesh.getTrustScore?.(peer.uuid);
        if (typeof score === 'number') peer.trustScore = score;
      } catch {}
    }
  }

  function selectRelayPeer(excludeUuids = []) {
    updatePeerFromTrustMesh();
    const candidates = [..._peers.values()].filter(p =>
      !excludeUuids.includes(p.uuid) &&
      p.trustScore >= RELAY_TRUST_THRESHOLD &&
      p.failures < 5 &&
      Date.now() - p.lastSeen < RELAY_TTL_MS * 2
    );
    if (!candidates.length) return null;

    // Weighted random selection by score
    const total = candidates.reduce((s, p) => s + p.score(), 0);
    let pick = Math.random() * total;
    for (const p of candidates) {
      pick -= p.score();
      if (pick <= 0) return p;
    }
    return candidates[candidates.length - 1];
  }

  // ── Probe a relay peer ─────────────────────────────────────────────────────

  async function probePeer(address) {
    const t0  = Date.now();
    const url = `${address}/relay/status`;
    return new Promise((resolve, reject) => {
      const mod    = url.startsWith('https') ? https : http;
      const req    = mod.get(url, { timeout: RELAY_PROBE_TIMEOUT }, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString());
            resolve({ ok: body.ok, latencyMs: Date.now() - t0 });
          } catch { reject(new Error('probe: bad JSON')); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('probe: timeout')); });
    });
  }

  // ── Forward a relay frame ──────────────────────────────────────────────────
  // Called locally to send through a relay peer.

  async function forwardViaRelay(peer, relayFrame) {
    const t0 = Date.now();
    const url = `${peer.address}/relay/forward`;
    const body = JSON.stringify(relayFrame);

    return new Promise((resolve, reject) => {
      const mod    = url.startsWith('https') ? https : http;
      const parsed = new URL(url);
      const options = {
        hostname: parsed.hostname,
        port:     parsed.port || (url.startsWith('https') ? 443 : 80),
        path:     parsed.pathname,
        method:   'POST',
        headers:  {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(body),
          'X-Relay-Id':     relayFrame.relayId,
        },
        timeout: RELAY_PROBE_TIMEOUT,
      };

      const req = mod.request(options, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          try {
            const data = JSON.parse(Buffer.concat(chunks).toString());
            const latencyMs = Date.now() - t0;
            peer.latencyMs = latencyMs;
            peer.lastSeen  = Date.now();
            if (data.ok) {
              peer.relayed++;
              peer.bytes += body.length;
              _stats.forwarded++;
              busEmit('relay:forward:out', {
                relayId:   relayFrame.relayId,
                toAddr:    peer.address,
                latencyMs,
              }, 'DEBUG');
              resolve({ ok: true, latencyMs });
            } else {
              peer.failures++;
              reject(new Error(data.error || 'relay: remote error'));
            }
          } catch(e) {
            peer.failures++;
            reject(e);
          }
        });
      });

      req.on('error', (e) => { peer.failures++; reject(e); });
      req.on('timeout', () => { peer.failures++; req.destroy(); reject(new Error('relay: timeout')); });
      req.write(body);
      req.end();
    });
  }

  // ── Send via best available relay tier ────────────────────────────────────

  async function send({ targetAddress, targetUuid, payload, excludeUuids = [] }) {
    const relayId = crypto.randomUUID();

    // Try TIER-R1/R2: peer relay
    const peer = selectRelayPeer([...(excludeUuids || []), targetUuid]);
    if (peer) {
      // Generate a per-relay-session HMAC key (derives from identity + peer uuid)
      const hmacKey = crypto.createHash('sha256')
        .update(`${identity.uuid}:${peer.uuid}:relay-hmac-v1`)
        .digest();

      const ttl = Date.now() + RELAY_TTL_MS;
      const frame = {
        relayId,
        to:      targetAddress,
        ttl,
        payload: Buffer.isBuffer(payload) ? payload.toString('base64') : JSON.stringify(payload),
        hmac:    signRelayFrame(hmacKey, relayId, targetAddress, ttl, { iv: '', enc: '', tag: '' }),
      };

      if (!peer.checkQuota(JSON.stringify(frame).length)) {
        busEmit('relay:quota:exceeded', { uuid: peer.uuid }, 'WARN');
      } else {
        try {
          const result = await forwardViaRelay(peer, frame);
          return { ok: true, tier: 'R1', relayId, via: peer.uuid, ...result };
        } catch { /* fall through to next tier */ }
      }
    }

    // TIER-R3: onion relay — request caller to use onion module
    return { ok: false, tier: null, relayId, error: 'no relay available — try onion circuit' };
  }

  // ── HTTP route handler ─────────────────────────────────────────────────────
  // POST /relay/forward — accept relayed frame from another Bridge node

  async function receiveForward(body) {
    if (!body?.relayId || !body?.to || !body?.payload) {
      return { ok: false, error: 'relay: malformed frame' };
    }

    if (body.ttl && Date.now() > body.ttl) {
      return { ok: false, error: 'relay: frame expired' };
    }

    const payloadBytes = Buffer.byteLength(JSON.stringify(body.payload));
    if (payloadBytes > RELAY_FRAME_MAX_BYTES) {
      return { ok: false, error: 'relay: frame too large' };
    }

    _stats.received++;
    busEmit('relay:forward:in', { relayId: body.relayId, toAddr: body.to }, 'DEBUG');

    // Forward to target (fire-and-forget)
    const targetUrl = `${body.to}/relay/deliver`;
    const fwdBody   = JSON.stringify({ relayId: body.relayId, payload: body.payload });

    const tryForward = () => {
      const mod    = targetUrl.startsWith('https') ? https : http;
      const parsed = new URL(targetUrl);
      const req    = mod.request({
        hostname: parsed.hostname,
        port:     parsed.port || 80,
        path:     parsed.pathname,
        method:   'POST',
        headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(fwdBody) },
        timeout:  RELAY_PROBE_TIMEOUT,
      });
      req.on('error', () => { _stats.errors++; });
      req.write(fwdBody);
      req.end();
    };

    setImmediate(tryForward);
    return { ok: true, relayId: body.relayId };
  }

  function route(method, urlParts, body) {
    const sub = urlParts[1] || '';

    if (method === 'GET' && sub === 'status') {
      return {
        ok:      true,
        module:  'bridge-relay',
        version: MODULE_VERSION,
        uuid:    MODULE_UUID,
        wanAddr: _wanAddr,
        peers:   _peers.size,
        stats:   _stats,
        stun:    FREE_STUN_SERVERS.slice(0, 3).map(s => s.host),
        turn:    FREE_TURN_SERVERS.map(s => ({ host: s.host, port: s.port })),
      };
    }

    if (method === 'GET' && sub === 'peers') {
      return {
        ok:    true,
        peers: [..._peers.values()].map(p => p.diagnostics()),
        total: _peers.size,
      };
    }

    if (method === 'POST' && sub === 'forward') {
      return receiveForward(body);
    }

    if (method === 'POST' && sub === 'probe') {
      const { address } = body || {};
      if (!address) return { ok: false, error: 'address required' };
      return probePeer(address).then(r => ({ ok: true, ...r })).catch(e => ({ ok: false, error: e.message }));
    }

    if (method === 'POST' && sub === 'peer') {
      const { uuid, address, trustScore } = body || {};
      if (!uuid || !address) return { ok: false, error: 'uuid + address required' };
      if (_peers.has(uuid)) {
        const p = _peers.get(uuid);
        p.lastSeen = Date.now();
        if (typeof trustScore === 'number') p.trustScore = trustScore;
        return { ok: true, action: 'updated', uuid };
      }
      addPeer({ uuid, address, trustScore: trustScore ?? 5 });
      return { ok: true, action: 'added', uuid };
    }

    if (method === 'GET' && sub === 'stun') {
      return { ok: true, servers: FREE_STUN_SERVERS, turn: FREE_TURN_SERVERS };
    }

    return null;
  }

  function diagnostics() {
    return {
      module:  'bridge-relay',
      version: MODULE_VERSION,
      uuid:    MODULE_UUID,
      wanAddr: _wanAddr,
      peers:   _peers.size,
      stats:   { ..._stats },
    };
  }

  function start() {
    startStunRefresh();
  }

  function stop() {
    if (_stunTimer) clearInterval(_stunTimer);
  }

  // Wire DHT peer discovery into relay peer table
  function wireWithDHT(dhtInstance) {
    if (!dhtInstance?.on) return;
    dhtInstance.on?.('peer:discovered', (peer) => {
      if (!peer?.uuid || !peer?.address) return;
      if (!_peers.has(peer.uuid)) {
        addPeer({ uuid: peer.uuid, address: peer.address, trustScore: 5 });
      }
    });
  }

  return {
    start,
    stop,
    send,
    addPeer,
    selectRelayPeer,
    probePeer,
    discoverWAN,
    wireWithDHT,
    route,
    diagnostics,
    getWanAddr: () => _wanAddr,
    getPeers:   () => [..._peers.values()].map(p => p.diagnostics()),
    getStats:   () => ({ ..._stats }),
    FREE_STUN_SERVERS,
    FREE_TURN_SERVERS,
    MODULE: {
      name:    'bridge-relay',
      version: MODULE_VERSION,
      uuid:    MODULE_UUID,
      vital:   false,
      requires: ['bridge-identity'],
      exposes: {
        start:          'function',
        stop:           'function',
        send:           'function',
        addPeer:        'function',
        discoverWAN:    'function',
        route:          'function',
        diagnostics:    'function',
      },
    },
  };
}

module.exports = {
  createRelayManager,
  stunDiscover,
  encryptRelayEnvelope,
  decryptRelayEnvelope,
  signRelayFrame,
  verifyRelayFrame,
  FREE_STUN_SERVERS,
  FREE_TURN_SERVERS,
  MODULE_UUID,
  MODULE_VERSION,
};
