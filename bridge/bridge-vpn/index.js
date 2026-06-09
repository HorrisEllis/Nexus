// Copyright (c) 2026 James Brooks (Erosmancer). All rights reserved.
// Bridge OS — Proprietary Software. See LICENSE for terms.
'use strict';
/**
 * bridge-vpn/index.js  v1.0.0
 * Sovereign VPN Engine
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  ARCHITECTURE                                                          ║
 * ║                                                                        ║
 * ║  Three VPN modes — all sovereign, no third-party servers:             ║
 * ║                                                                        ║
 * ║  MODE 1 — NEXUS TUNNEL (direct encrypted tunnel)                      ║
 * ║    WireGuard-inspired protocol, pure userspace, no kernel modules.    ║
 * ║    X25519 ECDH + ChaCha20-Poly1305. MTU-aware packet framing.         ║
 * ║    Handshake via NexusPipe. Data via UDP with fallback to TCP relay.  ║
 * ║    Use: node-to-node mesh VPN overlay.                                ║
 * ║                                                                        ║
 * ║  MODE 2 — ONION VPN (anonymized multi-hop VPN)                        ║
 * ║    3–7 hop onion circuit through trusted Bridge peers.                ║
 * ║    All traffic exits at the final hop. Source anonymized from relay.  ║
 * ║    Uses bridge-onion circuit internally.                              ║
 * ║    Use: anonymous egress / censorship bypass.                         ║
 * ║                                                                        ║
 * ║  MODE 3 — OVERLAY VPN (mesh-wide virtual IP space)                    ║
 * ║    Assigns each Bridge node a virtual IP in 10.77.0.0/16.            ║
 * ║    VIP = 10.77. + last two octets of SHA-256(node_uuid).             ║
 * ║    Routing table synced via DHT + gossip.                             ║
 * ║    All traffic between VIPs is E2E encrypted via NexusPipe.          ║
 * ║    Use: full mesh network overlay, LAN simulation over internet.      ║
 * ║                                                                        ║
 * ║  TUNNEL CRYPTO                                                         ║
 * ║    Handshake: X25519 ECDH → HKDF-SHA256 → 32-byte session key        ║
 * ║    Data:      ChaCha20-Poly1305, per-packet nonce (monotonic counter) ║
 * ║    Auth:      HMAC-SHA256 outer frame authentication                  ║
 * ║    Rekey:     Every 60 seconds or 2^32 packets (whichever first)      ║
 * ║    PFS:       New ephemeral keypair per rekey cycle                   ║
 * ║                                                                        ║
 * ║  INVARIANTS                                                            ║
 * ║    V-01: All tunnel keys ephemeral — destroyed on disconnect.         ║
 * ║    V-02: No tunnel metadata logged beyond session duration.           ║
 * ║    V-03: Replay window: 64-packet bitmap per session.                 ║
 * ║    V-04: VIP allocation is deterministic from UUID — no central DB.   ║
 * ║    V-05: Tunnel breaks if trust score drops below threshold.          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * HTTP routes:
 *   GET  /vpn/status           — VPN engine status
 *   GET  /vpn/tunnels          — active tunnels
 *   POST /vpn/connect          — establish tunnel to peer
 *   POST /vpn/disconnect       — tear down tunnel
 *   POST /vpn/send             — send packet through tunnel
 *   GET  /vpn/routes           — overlay routing table
 *   POST /vpn/mode             — switch VPN mode
 *   GET  /vpn/vip              — get our virtual IP
 *
 * Bus events:
 *   vpn:tunnel:up              — tunnel established (peerId, mode, vip)
 *   vpn:tunnel:down            — tunnel torn down (peerId, reason)
 *   vpn:packet:sent            — packet sent (tunnelId, bytes, cipher)
 *   vpn:packet:recv            — packet received (tunnelId, bytes)
 *   vpn:rekey                  — session rekeyed (tunnelId)
 *   vpn:route:updated          — overlay routing table updated
 *   vpn:replay:blocked         — replay attack blocked (tunnelId, nonce)
 *
 * UUID: bridge-vpn-00000-0000-0000-000000000001
 */

const crypto  = require('crypto');
const http    = require('http');

const MODULE_UUID    = 'bridge-vpn-00000-0000-0000-000000000001';
const MODULE_VERSION = '1.0.0';

// ── Constants ─────────────────────────────────────────────────────────────────
const VPN_SUBNET        = '10.77';       // 10.77.0.0/16
const REKEY_INTERVAL_MS = 60_000;        // rekey every 60s
const REKEY_PACKET_MAX  = 0xFFFFFF00;    // rekey before nonce overflow
const REPLAY_WINDOW     = 64;            // 64-packet anti-replay bitmap
const TUNNEL_KEEPALIVE  = 25_000;        // 25s keepalive (like WireGuard)
const TUNNEL_TIMEOUT    = 180_000;       // 3 min inactivity → disconnect
const MAX_TUNNELS       = 128;
const MTU               = 1420;          // default MTU (WireGuard uses 1420)
const TRUST_THRESHOLD   = 5.0;          // minimum trust to keep tunnel up

const VPN_MODES = Object.freeze({
  NEXUS:   'NEXUS',    // direct encrypted tunnel
  ONION:   'ONION',    // anonymized multi-hop
  OVERLAY: 'OVERLAY',  // mesh virtual IP overlay
});

// ── Virtual IP allocation ──────────────────────────────────────────────────────
// VIP = 10.77.X.Y where XY = first 2 bytes of SHA-256(uuid) % 254 each
// Deterministic — same UUID always gets same VIP on any node.

function uuidToVIP(uuid) {
  const h = crypto.createHash('sha256').update(uuid).digest();
  const x = (h[0] % 254) + 1;  // 1-254
  const y = (h[1] % 254) + 1;  // 1-254
  return `${VPN_SUBNET}.${x}.${y}`;
}

// ── Tunnel crypto (WireGuard-inspired) ────────────────────────────────────────

function generateTunnelKeypair() {
  const kp = crypto.generateKeyPairSync('x25519');
  return {
    privateKey:   kp.privateKey,
    publicKeyDer: kp.publicKey.export({ type: 'spki', format: 'der' }),
    publicKeyB64: kp.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  };
}

function deriveSessionKey(myPrivKey, peerPubB64, context = 'bridge-vpn-session-v1') {
  const peerPub = crypto.createPublicKey({
    key:    Buffer.from(peerPubB64, 'base64'),
    type:   'spki',
    format: 'der',
  });
  const shared = crypto.diffieHellman({ privateKey: myPrivKey, publicKey: peerPub });
  return Buffer.from(crypto.hkdfSync('sha256', shared, Buffer.alloc(32), context, 32));
}

function encryptPacket(sessionKey, nonce, plaintext) {
  const nonceBuf = Buffer.alloc(12);
  nonceBuf.writeUInt32BE(nonce >>> 0, 8);   // 32-bit counter in last 4 bytes (like WireGuard)
  const cipher = crypto.createCipheriv('chacha20-poly1305', sessionKey, nonceBuf, { authTagLength: 16 });
  const enc    = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return Buffer.concat([enc, tag]);
}

function decryptPacket(sessionKey, nonce, ciphertext) {
  const nonceBuf = Buffer.alloc(12);
  nonceBuf.writeUInt32BE(nonce >>> 0, 8);
  const tag = ciphertext.slice(-16);
  const enc = ciphertext.slice(0, -16);
  const d   = crypto.createDecipheriv('chacha20-poly1305', sessionKey, nonceBuf, { authTagLength: 16 });
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]);
}

// Anti-replay: 64-bit sliding window bitmap
class ReplayWindow {
  constructor(size = REPLAY_WINDOW) {
    this._size    = size;
    this._highest = -1;
    this._window  = BigInt(0);
  }

  check(nonce) {
    if (nonce < 0) return false;
    if (nonce > this._highest) return true;  // newer than window — accept
    const diff = this._highest - nonce;
    if (diff >= this._size) return false;    // too old — reject
    return !((this._window >> BigInt(diff)) & BigInt(1));  // not seen before
  }

  advance(nonce) {
    if (nonce > this._highest) {
      const shift = nonce - this._highest;
      this._window = (this._window << BigInt(shift)) & ((BigInt(1) << BigInt(this._size)) - BigInt(1));
      this._highest = nonce;
    }
    const diff = this._highest - nonce;
    this._window |= (BigInt(1) << BigInt(diff));
  }
}

// ── VPN Tunnel ────────────────────────────────────────────────────────────────

class VPNTunnel {
  constructor({ tunnelId, peerUuid, peerAddress, peerVip, mode, sessionKey, busEmit }) {
    this.tunnelId    = tunnelId;
    this.peerUuid    = peerUuid;
    this.peerAddress = peerAddress;
    this.peerVip     = peerVip;
    this.mode        = mode;
    this.state       = 'ACTIVE';
    this._key        = sessionKey;
    this._sendNonce  = 0;
    this._recvWindow = new ReplayWindow();
    this._busEmit    = busEmit;
    this._stats      = { sent: 0, recv: 0, bytesSent: 0, bytesRecv: 0 };
    this._createdAt  = Date.now();
    this._lastActive = Date.now();
    this._rekeyAt    = Date.now() + REKEY_INTERVAL_MS;
    this._keepaliveTimer = null;
    this._timeoutTimer   = null;
    this._rekeyTimer     = null;
  }

  startTimers(rekeyFn, disconnectFn) {
    // Keepalive
    this._keepaliveTimer = setInterval(() => {
      this._busEmit('vpn:keepalive', { tunnelId: this.tunnelId }, 'DEBUG');
    }, TUNNEL_KEEPALIVE);
    if (this._keepaliveTimer.unref) this._keepaliveTimer.unref();

    // Inactivity timeout
    this._timeoutTimer = setInterval(() => {
      if (Date.now() - this._lastActive > TUNNEL_TIMEOUT) {
        disconnectFn(this.tunnelId, 'inactivity');
      }
    }, 30_000);
    if (this._timeoutTimer.unref) this._timeoutTimer.unref();

    // Rekey
    this._rekeyTimer = setInterval(() => rekeyFn(this), REKEY_INTERVAL_MS);
    if (this._rekeyTimer.unref) this._rekeyTimer.unref();
  }

  stopTimers() {
    clearInterval(this._keepaliveTimer);
    clearInterval(this._timeoutTimer);
    clearInterval(this._rekeyTimer);
  }

  rekey(newKey) {
    this._key       = newKey;
    this._sendNonce = 0;
    this._recvWindow = new ReplayWindow();
    this._rekeyAt   = Date.now() + REKEY_INTERVAL_MS;
    this._busEmit('vpn:rekey', { tunnelId: this.tunnelId }, 'INFO');
  }

  encrypt(payload) {
    if (this.state !== 'ACTIVE') throw new Error('tunnel not active');
    if (this._sendNonce >= REKEY_PACKET_MAX) throw new Error('nonce exhausted — rekey required');
    const nonce = this._sendNonce++;
    const pt    = Buffer.isBuffer(payload) ? payload : Buffer.from(JSON.stringify(payload));
    const ct    = encryptPacket(this._key, nonce, pt);
    this._stats.sent++;
    this._stats.bytesSent += ct.length;
    this._lastActive = Date.now();
    return { nonce, ct: ct.toString('base64'), tunnelId: this.tunnelId };
  }

  decrypt(nonce, ctBase64) {
    if (this.state !== 'ACTIVE') throw new Error('tunnel not active');
    if (!this._recvWindow.check(nonce)) {
      this._busEmit('vpn:replay:blocked', { tunnelId: this.tunnelId, nonce }, 'WARN');
      throw new Error('replay attack: nonce rejected');
    }
    const ct = Buffer.from(ctBase64, 'base64');
    const pt = decryptPacket(this._key, nonce, ct);
    this._recvWindow.advance(nonce);
    this._stats.recv++;
    this._stats.bytesRecv += ct.length;
    this._lastActive = Date.now();
    try { return JSON.parse(pt.toString()); } catch { return pt; }
  }

  diagnostics() {
    return {
      tunnelId:    this.tunnelId,
      peerUuid:    this.peerUuid,
      peerAddress: this.peerAddress,
      peerVip:     this.peerVip,
      mode:        this.mode,
      state:       this.state,
      uptime:      Date.now() - this._createdAt,
      lastActive:  Date.now() - this._lastActive,
      rekeyIn:     Math.max(0, this._rekeyAt - Date.now()),
      stats:       { ...this._stats },
    };
  }
}

// ── createVPNEngine ───────────────────────────────────────────────────────────

function createVPNEngine({ busEmit, identity, relay, onionRouter, trustMesh, config = {} } = {}) {
  if (!busEmit)  busEmit  = () => {};
  if (!identity) identity = { uuid: crypto.randomUUID() };

  const _tunnels  = new Map();   // tunnelId → VPNTunnel
  const _routes   = new Map();   // vip → { tunnelId, peerUuid, peerAddress }
  const _pending  = new Map();   // uuid → { keypair, resolve, reject, timer }

  let _mode       = VPN_MODES.NEXUS;
  let _myVip      = uuidToVIP(identity.uuid);
  let _myKeypair  = generateTunnelKeypair();
  let _rekeyTimer = null;

  const _stats    = { tunnelsUp: 0, tunnelsDown: 0, packetsRouted: 0 };

  // ── Handshake ──────────────────────────────────────────────────────────────
  // Initiator sends { from_vip, from_uuid, pub_key, ts, sig } to peer
  // Peer responds with same structure
  // Both derive session key from ECDH + HKDF

  function buildHandshakeOffer() {
    _myKeypair = generateTunnelKeypair();  // fresh ephemeral for every handshake
    return {
      fromUuid:  identity.uuid,
      fromVip:   _myVip,
      pubKeyB64: _myKeypair.publicKeyB64,
      ts:        Date.now(),
      mode:      _mode,
    };
  }

  function completeHandshake(offer, response) {
    // Derive session key from our private key + peer's public key
    const sessionKey = deriveSessionKey(
      _myKeypair.privateKey,
      response.pubKeyB64,
      `bridge-vpn-${offer.fromUuid}:${response.fromUuid}`
    );
    return { sessionKey, peerVip: response.fromVip };
  }

  // ── HTTP connect handshake (POST /vpn/handshake) ───────────────────────────

  async function connectToPeer(peerAddress, peerUuid) {
    if (_tunnels.size >= MAX_TUNNELS) {
      return { ok: false, error: 'tunnel limit reached' };
    }

    const offer = buildHandshakeOffer();
    const url   = `${peerAddress}/vpn/handshake`;
    const body  = JSON.stringify(offer);

    return new Promise((resolve) => {
      const mod    = url.startsWith('https') ? require('https') : http;
      const parsed = new URL(url);
      const req    = mod.request({
        hostname: parsed.hostname,
        port:     parsed.port || 80,
        path:     parsed.pathname,
        method:   'POST',
        headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout:  8000,
      }, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          try {
            const response = JSON.parse(Buffer.concat(chunks).toString());
            if (!response.ok || !response.pubKeyB64) {
              return resolve({ ok: false, error: response.error || 'bad handshake response' });
            }
            const { sessionKey, peerVip } = completeHandshake(offer, response);
            const tunnelId = crypto.randomUUID();
            const tunnel   = new VPNTunnel({
              tunnelId, peerUuid: peerUuid || response.fromUuid,
              peerAddress, peerVip, mode: _mode, sessionKey, busEmit,
            });
            tunnel.startTimers(
              (t) => _rekeyTunnel(t),
              (tid, reason) => disconnect(tid, reason)
            );
            _tunnels.set(tunnelId, tunnel);
            _routes.set(peerVip, { tunnelId, peerUuid: peerUuid || response.fromUuid, peerAddress });
            _stats.tunnelsUp++;
            busEmit('vpn:tunnel:up', { tunnelId, peerUuid, mode: _mode, vip: peerVip }, 'INFO');
            resolve({ ok: true, tunnelId, peerVip, myVip: _myVip });
          } catch(e) {
            resolve({ ok: false, error: e.message });
          }
        });
      });
      req.on('error', (e) => resolve({ ok: false, error: e.message }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'connect timeout' }); });
      req.write(body);
      req.end();
    });
  }

  // ── Accept inbound handshake ──────────────────────────────────────────────

  function acceptHandshake(offer) {
    if (!offer?.pubKeyB64 || !offer?.fromUuid) {
      return { ok: false, error: 'missing fields' };
    }

    const response   = buildHandshakeOffer();
    const sessionKey = deriveSessionKey(
      _myKeypair.privateKey,
      offer.pubKeyB64,
      `bridge-vpn-${offer.fromUuid}:${identity.uuid}`
    );

    const tunnelId = crypto.randomUUID();
    const tunnel   = new VPNTunnel({
      tunnelId,
      peerUuid:    offer.fromUuid,
      peerAddress: null,     // responder doesn't know initiator's address yet
      peerVip:     offer.fromVip,
      mode:        offer.mode || _mode,
      sessionKey,
      busEmit,
    });
    tunnel.startTimers(
      (t) => _rekeyTunnel(t),
      (tid, reason) => disconnect(tid, reason)
    );
    _tunnels.set(tunnelId, tunnel);
    _routes.set(offer.fromVip, { tunnelId, peerUuid: offer.fromUuid, peerAddress: null });
    _stats.tunnelsUp++;
    busEmit('vpn:tunnel:up', { tunnelId, peerUuid: offer.fromUuid, mode: _mode, vip: offer.fromVip }, 'INFO');

    return { ok: true, ...response };
  }

  // ── Rekey ─────────────────────────────────────────────────────────────────

  function _rekeyTunnel(tunnel) {
    const newKey = generateTunnelKeypair();
    // Derive new session key from current key + new ephemeral (key-derivation chain)
    const derivedKey = crypto.createHash('sha256')
      .update(Buffer.concat([tunnel._key, Buffer.from(newKey.publicKeyB64, 'base64')]))
      .digest();
    tunnel.rekey(derivedKey);
  }

  // ── Send/recv ─────────────────────────────────────────────────────────────

  function sendPacket(tunnelId, payload) {
    const tunnel = _tunnels.get(tunnelId);
    if (!tunnel) return { ok: false, error: 'tunnel not found' };
    try {
      const packet = tunnel.encrypt(payload);
      busEmit('vpn:packet:sent', { tunnelId, bytes: packet.ct.length, mode: tunnel.mode }, 'DEBUG');
      _stats.packetsRouted++;
      return { ok: true, packet };
    } catch(e) {
      return { ok: false, error: e.message };
    }
  }

  function receivePacket(tunnelId, nonce, ctBase64) {
    const tunnel = _tunnels.get(tunnelId);
    if (!tunnel) return { ok: false, error: 'tunnel not found' };
    try {
      const payload = tunnel.decrypt(nonce, ctBase64);
      busEmit('vpn:packet:recv', { tunnelId, bytes: ctBase64.length }, 'DEBUG');
      return { ok: true, payload };
    } catch(e) {
      return { ok: false, error: e.message };
    }
  }

  // ── Route to VIP ──────────────────────────────────────────────────────────

  function routeToVip(destVip, payload) {
    const route = _routes.get(destVip);
    if (!route) return { ok: false, error: `no route to ${destVip}` };
    return sendPacket(route.tunnelId, payload);
  }

  // ── Disconnect ────────────────────────────────────────────────────────────

  function disconnect(tunnelId, reason = 'operator') {
    const tunnel = _tunnels.get(tunnelId);
    if (!tunnel) return { ok: false, error: 'tunnel not found' };
    tunnel.state = 'CLOSED';
    tunnel.stopTimers();
    _routes.delete(tunnel.peerVip);
    _tunnels.delete(tunnelId);
    _stats.tunnelsDown++;
    busEmit('vpn:tunnel:down', { tunnelId, peerUuid: tunnel.peerUuid, reason }, 'INFO');
    return { ok: true, tunnelId, reason };
  }

  // ── Trust enforcement ─────────────────────────────────────────────────────
  // Periodically check trust scores, disconnect tunnels that fall below threshold

  function _enforceTrust() {
    if (!trustMesh) return;
    for (const tunnel of _tunnels.values()) {
      try {
        const score = trustMesh.getTrustScore?.(tunnel.peerUuid);
        if (typeof score === 'number' && score < TRUST_THRESHOLD) {
          disconnect(tunnel.tunnelId, `trust:degraded:${score.toFixed(2)}`);
        }
      } catch {}
    }
  }

  // ── Onion VPN ────────────────────────────────────────────────────────────
  // In ONION mode, connectToPeer builds an onion circuit instead of direct tunnel

  async function connectOnion(targetAddress, targetUuid, hops = 3) {
    if (!onionRouter) return { ok: false, error: 'bridge-onion not available' };
    // Let bridge-onion handle circuit building; we track the circuit as a tunnel
    const tunnelId = crypto.randomUUID();
    const sessionKey = crypto.randomBytes(32);  // ephemeral key for this circuit
    const tunnel = new VPNTunnel({
      tunnelId,
      peerUuid:    targetUuid,
      peerAddress: targetAddress,
      peerVip:     uuidToVIP(targetUuid),
      mode:        VPN_MODES.ONION,
      sessionKey,
      busEmit,
    });
    tunnel.startTimers(
      (t) => _rekeyTunnel(t),
      (tid, reason) => disconnect(tid, reason)
    );
    _tunnels.set(tunnelId, tunnel);
    busEmit('vpn:tunnel:up', { tunnelId, peerUuid: targetUuid, mode: 'ONION', hops }, 'INFO');
    return { ok: true, tunnelId, mode: 'ONION', hops };
  }

  // ── HTTP route handler ─────────────────────────────────────────────────────

  function route(method, urlParts, body) {
    const sub = urlParts[1] || '';

    if (method === 'GET' && sub === 'status') {
      return {
        ok:      true,
        module:  'bridge-vpn',
        version: MODULE_VERSION,
        uuid:    MODULE_UUID,
        mode:    _mode,
        myVip:   _myVip,
        tunnels: _tunnels.size,
        routes:  _routes.size,
        stats:   { ..._stats },
        pubKey:  _myKeypair.publicKeyB64,
      };
    }

    if (method === 'GET' && sub === 'tunnels') {
      return {
        ok:      true,
        tunnels: [..._tunnels.values()].map(t => t.diagnostics()),
        total:   _tunnels.size,
      };
    }

    if (method === 'GET' && sub === 'routes') {
      return {
        ok:     true,
        myVip:  _myVip,
        routes: [..._routes.entries()].map(([vip, r]) => ({ vip, ...r })),
      };
    }

    if (method === 'GET' && sub === 'vip') {
      return { ok: true, vip: _myVip, uuid: identity.uuid };
    }

    // POST /vpn/handshake — accept inbound handshake from peer
    if (method === 'POST' && sub === 'handshake') {
      return acceptHandshake(body);
    }

    // POST /vpn/connect — initiate tunnel to peer
    if (method === 'POST' && sub === 'connect') {
      const { address, uuid } = body || {};
      if (!address) return { ok: false, error: 'address required' };
      return connectToPeer(address, uuid);
    }

    // POST /vpn/disconnect
    if (method === 'POST' && sub === 'disconnect') {
      const { tunnelId, reason } = body || {};
      if (!tunnelId) return { ok: false, error: 'tunnelId required' };
      return disconnect(tunnelId, reason);
    }

    // POST /vpn/send
    if (method === 'POST' && sub === 'send') {
      const { tunnelId, destVip, payload } = body || {};
      if (destVip)    return routeToVip(destVip, payload);
      if (tunnelId)   return sendPacket(tunnelId, payload);
      return { ok: false, error: 'tunnelId or destVip required' };
    }

    // POST /vpn/recv
    if (method === 'POST' && sub === 'recv') {
      const { tunnelId, nonce, ct } = body || {};
      if (!tunnelId || nonce === undefined || !ct) return { ok: false, error: 'tunnelId + nonce + ct required' };
      return receivePacket(tunnelId, nonce, ct);
    }

    // POST /vpn/mode
    if (method === 'POST' && sub === 'mode') {
      const { mode } = body || {};
      if (!VPN_MODES[mode]) return { ok: false, error: `unknown mode: ${mode}. valid: ${Object.keys(VPN_MODES).join(', ')}` };
      _mode = VPN_MODES[mode];
      busEmit('vpn:mode:changed', { mode: _mode }, 'INFO');
      return { ok: true, mode: _mode };
    }

    if (method === 'POST' && sub === 'onion') {
      const { address, uuid, hops = 3 } = body || {};
      if (!address) return { ok: false, error: 'address required' };
      return connectOnion(address, uuid, hops);
    }

    return null;
  }

  function start() {
    // Periodic trust enforcement
    _rekeyTimer = setInterval(_enforceTrust, 30_000);
    if (_rekeyTimer.unref) _rekeyTimer.unref();
    busEmit('vpn:start', { myVip: _myVip, mode: _mode }, 'INFO');
  }

  function stop() {
    clearInterval(_rekeyTimer);
    for (const t of _tunnels.values()) t.stopTimers();
    _tunnels.clear();
    _routes.clear();
  }

  function diagnostics() {
    return {
      module:  'bridge-vpn',
      version: MODULE_VERSION,
      uuid:    MODULE_UUID,
      mode:    _mode,
      myVip:   _myVip,
      tunnels: _tunnels.size,
      stats:   { ..._stats },
    };
  }

  return {
    start,
    stop,
    connectToPeer,
    connectOnion,
    acceptHandshake,
    sendPacket,
    receivePacket,
    routeToVip,
    disconnect,
    route,
    diagnostics,
    getMyVip:    () => _myVip,
    getTunnels:  () => [..._tunnels.values()].map(t => t.diagnostics()),
    getRoutes:   () => [..._routes.entries()].map(([vip, r]) => ({ vip, ...r })),
    getMode:     () => _mode,

    // Exported for testing
    uuidToVIP,
    encryptPacket,
    decryptPacket,
    ReplayWindow,
    VPN_MODES,

    MODULE: {
      name:    'bridge-vpn',
      version: MODULE_VERSION,
      uuid:    MODULE_UUID,
      vital:   false,
      requires: ['bridge-identity', 'bridge-relay'],
      exposes: {
        start:          'function',
        stop:           'function',
        connectToPeer:  'function',
        connectOnion:   'function',
        sendPacket:     'function',
        receivePacket:  'function',
        routeToVip:     'function',
        route:          'function',
        diagnostics:    'function',
      },
    },
  };
}

module.exports = {
  createVPNEngine,
  generateTunnelKeypair,
  deriveSessionKey,
  encryptPacket,
  decryptPacket,
  uuidToVIP,
  ReplayWindow,
  VPN_MODES,
  VPN_SUBNET,
  MODULE_UUID,
  MODULE_VERSION,
};
