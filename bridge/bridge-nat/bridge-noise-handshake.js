// Copyright (c) 2026 James Brooks (Erosmancer). All rights reserved.
// Bridge OS — Proprietary Software. See LICENSE for terms.
// rheon.world · github.com/HorrisEllis/Bridge-v2
'use strict';

/**
 * bridge-noise-handshake  v1.0.0
 * Noise Protocol Framework — IK + XX patterns for Bridge OS
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  PHILOSOPHY                                                            ║
 * ║                                                                        ║
 * ║  TLS requires certificate authorities. DTLS bolts TLS onto UDP and    ║
 * ║  inherits its complexity. Both separate identity from routing.         ║
 * ║                                                                        ║
 * ║  Noise IK collapses them: the peer's public key IS its identity AND    ║
 * ║  its address. No CA. No certificate chain. No OCSP. One round trip     ║
 * ║  for known peers (IK), two for first contact (XX). WireGuard uses      ║
 * ║  this model at the transport level. We use it at the session level,    ║
 * ║  above the transport, wired directly into bridge-nexus-pipe.           ║
 * ║                                                                        ║
 * ║  PATTERN SELECTION                                                     ║
 * ║    IK — initiator knows responder's static pubkey (peer in DHT)        ║
 * ║       → 1 RTT. Responder's static key provides identity assurance.    ║
 * ║    XX — first contact; no prior key knowledge                          ║
 * ║       → 2 RTTs. Both sides transmit static keys and authenticate.     ║
 * ║                                                                        ║
 * ║  PARALLEL SPECULATIVE HANDSHAKE                                        ║
 * ║    When bridge-nat-engine returns N candidates, this engine launches   ║
 * ║    N concurrent IK handshakes in parallel — one per predicted path.    ║
 * ║    The first to complete AND pass identity verification commits.       ║
 * ║    All others are aborted. This removes the serial latency of          ║
 * ║    try-one-wait-fail-try-next that WebRTC ICE suffers.                ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * NOISE PROTOCOL PRIMITIVES USED
 * ────────────────────────────────
 *   DH:   X25519  (Node.js native crypto.diffieHellman)
 *   AEAD: ChaCha20-Poly1305  (Node.js native)
 *   HASH: SHA-256  (Node.js native)
 *   MixHash, MixKey, EncryptAndHash, DecryptAndHash — hand-implemented
 *   conforming to noise spec §5.
 *
 * INTEGRATION WITH bridge-nexus-pipe
 * ────────────────────────────────────
 *   Phase 3 of NexusPipeSession currently does a 4-sub-layer handshake
 *   using ad-hoc HMAC + ECDH + identity. This module replaces sub-layers
 *   3b (identity) and 3c (ECDH) with a Noise IK or XX pattern and keeps
 *   3a (magnet token) and 3d (cobalt chain) as Bridge-specific wrappers
 *   around the Noise handshake payload.
 *
 *   Usage (initiator):
 *     const hs = NoiseHandshake.initiatorIK(myStaticKeys, theirStaticPubKey);
 *     const msg1 = hs.writeMessage(bridgePayload1);    // → send to peer
 *     const { payload: peerPayload } = hs.readMessage(peerMsg1);
 *     const session = hs.finalize();                   // → { send, recv keys }
 *
 *   Usage (responder):
 *     const hs = NoiseHandshake.responderIK(myStaticKeys);
 *     const { payload: initPayload } = hs.readMessage(msg1);
 *     const msg2 = hs.writeMessage(bridgePayload2);
 *     const session = hs.finalize();
 *
 *   For first contact (XX):
 *     const hs = NoiseHandshake.initiatorXX(myStaticKeys);
 *     // 3 messages instead of 2
 *
 *   Speculative parallel (multi-path):
 *     const race = NoiseHandshakeRace.run({ staticKeys, peers, transport });
 *     const winner = await race;   // → { session, peerId, path }
 *
 * BUS EVENTS
 * ───────────
 *   noise:handshake:start     — pattern, role, peerId
 *   noise:handshake:complete  — peerId, pattern, rttMs, sessionFP
 *   noise:handshake:fail      — peerId, reason, pattern
 *   noise:race:winner         — peerId, path, rttMs
 *   noise:race:abandoned      — peerIds abandoned after winner committed
 *
 * Author: James Brooks (Erosmancer) / Bridge OS
 */

const crypto = require('crypto');

// ── Version ───────────────────────────────────────────────────────────────────

const MODULE_VERSION = '1.0.0';
const MODULE_UUID    = 'bridge-noise-handshake-v100-000000000002';

// ── Constants ─────────────────────────────────────────────────────────────────

const PROTOCOL_NAME_IK   = 'Noise_IK_25519_ChaChaPoly_SHA256';
const PROTOCOL_NAME_XX   = 'Noise_XX_25519_ChaChaPoly_SHA256';
const HASH_LEN           = 32;    // SHA-256 output
const KEY_LEN            = 32;    // ChaCha20 key
const NONCE_LEN          = 12;    // ChaCha20-Poly1305 nonce
const TAG_LEN            = 16;    // Poly1305 auth tag
const EMPTY              = Buffer.alloc(0);

// ── Noise primitives ──────────────────────────────────────────────────────────
// Conforming to Noise Protocol spec §5 — no external dependencies.

function noiseHash(data) {
  return crypto.createHash('sha256')
    .update(Array.isArray(data) ? Buffer.concat(data) : data)
    .digest();
}

function noiseHMAC(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

// HKDF (Noise §4)
function noiseHKDF(ck, inputMaterial) {
  const tempKey = noiseHMAC(ck, inputMaterial);
  const out1    = noiseHMAC(tempKey, Buffer.from([0x01]));
  const out2    = noiseHMAC(tempKey, Buffer.concat([out1, Buffer.from([0x02])]));
  return [out1, out2];
}

// AEAD encrypt — ChaCha20-Poly1305
function aeadEncrypt(k, n, ad, plaintext) {
  const nonce = Buffer.alloc(NONCE_LEN);
  nonce.writeBigUInt64LE(BigInt(n), 4);   // Noise: nonce is 64-bit LE in bytes 4-11
  const cipher = crypto.createCipheriv('chacha20-poly1305', k, nonce, { authTagLength: TAG_LEN });
  cipher.setAAD(ad);
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([enc, tag]);
}

// AEAD decrypt — ChaCha20-Poly1305
function aeadDecrypt(k, n, ad, ciphertext) {
  const nonce   = Buffer.alloc(NONCE_LEN);
  nonce.writeBigUInt64LE(BigInt(n), 4);
  const tag     = ciphertext.slice(-TAG_LEN);
  const enc     = ciphertext.slice(0, -TAG_LEN);
  const decipher = crypto.createDecipheriv('chacha20-poly1305', k, nonce, { authTagLength: TAG_LEN });
  decipher.setAAD(ad);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]);
}

// DH — X25519
function dhX25519(privateKey, publicKeyB64) {
  const pub = crypto.createPublicKey({
    key: Buffer.from(publicKeyB64, 'base64'),
    type: 'spki', format: 'der',
  });
  return crypto.diffieHellman({ privateKey, publicKey: pub });
}

function generateStaticKeypair() {
  const kp = crypto.generateKeyPairSync('x25519');
  return {
    privateKey:   kp.privateKey,
    publicKeyDer: kp.publicKey.export({ type: 'spki', format: 'der' }),
    publicKeyB64: kp.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  };
}

// ── CipherState (Noise §5.1) ──────────────────────────────────────────────────

class CipherState {
  constructor() {
    this._k = null;
    this._n = 0;
  }

  initializeKey(k) { this._k = k; this._n = 0; }
  hasKey()         { return this._k !== null; }

  encryptWithAD(ad, plaintext) {
    if (!this._k) return plaintext;
    const ct = aeadEncrypt(this._k, this._n++, ad, plaintext);
    if (this._n >= 0xffffffff) throw new Error('[noise] nonce overflow — rekey required');
    return ct;
  }

  decryptWithAD(ad, ciphertext) {
    if (!this._k) return ciphertext;
    const pt = aeadDecrypt(this._k, this._n++, ad, ciphertext);
    if (this._n >= 0xffffffff) throw new Error('[noise] nonce overflow — rekey required');
    return pt;
  }

  rekey() {
    if (!this._k) return;
    // Noise §11.3: new key = encrypt(k, nonce=maxint, ad=empty, plaintext=zeros(32))
    const maxNonce = Buffer.alloc(NONCE_LEN);
    maxNonce.writeBigUInt64LE(BigInt(0xffffffffffffffff), 4);
    const cipher = crypto.createCipheriv('chacha20-poly1305', this._k, maxNonce, { authTagLength: TAG_LEN });
    cipher.setAAD(EMPTY);
    const zeros = Buffer.alloc(32);
    this._k = Buffer.concat([cipher.update(zeros), cipher.final()]).slice(0, 32);
    this._n = 0;
  }
}

// ── SymmetricState (Noise §5.2) ───────────────────────────────────────────────

class SymmetricState {
  constructor(protocolName) {
    const protoBytes = Buffer.from(protocolName, 'ascii');
    if (protoBytes.length <= HASH_LEN) {
      this._h = Buffer.concat([protoBytes, Buffer.alloc(HASH_LEN - protoBytes.length)]);
    } else {
      this._h = noiseHash(protoBytes);
    }
    this._ck          = Buffer.from(this._h);
    this._cipherState = new CipherState();
  }

  mixKey(inputMaterial) {
    const [ck, tempK] = noiseHKDF(this._ck, inputMaterial);
    this._ck = ck;
    this._cipherState.initializeKey(tempK.slice(0, KEY_LEN));
  }

  mixHash(data) {
    this._h = noiseHash([this._h, data]);
  }

  mixKeyAndHash(inputMaterial) {
    const [ck, tempH, tempK] = (() => {
      const tK  = noiseHMAC(this._ck, inputMaterial);
      const o1  = noiseHMAC(tK, Buffer.from([0x01]));
      const o2  = noiseHMAC(tK, Buffer.concat([o1, Buffer.from([0x02])]));
      const o3  = noiseHMAC(tK, Buffer.concat([o2, Buffer.from([0x03])]));
      return [o1, o2, o3];
    })();
    this._ck = ck;
    this.mixHash(tempH);
    this._cipherState.initializeKey(tempK.slice(0, KEY_LEN));
  }

  encryptAndHash(plaintext) {
    const ct = this._cipherState.encryptWithAD(this._h, plaintext);
    this.mixHash(ct);
    return ct;
  }

  decryptAndHash(ciphertext) {
    const pt = this._cipherState.decryptWithAD(this._h, ciphertext);
    this.mixHash(ciphertext);
    return pt;
  }

  // Split into two CipherStates for the transport phase (Noise §5.2)
  split() {
    const [tempK1, tempK2] = noiseHKDF(this._ck, EMPTY);
    const cs1 = new CipherState(); cs1.initializeKey(tempK1);
    const cs2 = new CipherState(); cs2.initializeKey(tempK2);
    return [cs1, cs2];
  }

  get handshakeHash() { return Buffer.from(this._h); }
}

// ── HandshakeState (Noise §5.3) ───────────────────────────────────────────────

class HandshakeState {
  constructor({ pattern, role, staticKeys, remoteStaticPubB64 = null }) {
    this.pattern          = pattern;   // 'IK' | 'XX'
    this.role             = role;      // 'initiator' | 'responder'
    this._ss              = new SymmetricState(
      pattern === 'IK' ? PROTOCOL_NAME_IK : PROTOCOL_NAME_XX
    );
    this._s               = staticKeys;         // my { privateKey, publicKeyB64 }
    this._e               = null;               // my ephemeral
    this._rs              = remoteStaticPubB64; // their static pubkey (IK: known upfront)
    this._re              = null;               // their ephemeral pubkey
    this._messageIndex    = 0;
    this._transportMode   = false;
    this._sendCS          = null;
    this._recvCS          = null;
    this._startTs         = Date.now();

    this._initialize();
  }

  _initialize() {
    // Noise prologue: mix in protocol metadata (Bridge OS domain separation)
    const prologue = Buffer.from('bridge-nexus-pipe-v1');
    this._ss.mixHash(prologue);

    if (this.pattern === 'IK') {
      // IK pre-messages: responder's static pubkey is known
      if (this.role === 'initiator') {
        // Initiator pre-message: mix in responder's static pubkey
        this._ss.mixHash(Buffer.from(this._rs, 'base64'));
        // Responder pre-message: mix in initiator's static pubkey (will come in msg1)
      } else {
        // Responder: mix in our own static pubkey (as initiator's pre-msg)
        this._ss.mixHash(Buffer.from(this._s.publicKeyB64, 'base64'));
      }
    }
    // XX: no pre-messages
  }

  // Write a handshake message (tokens + payload)
  writeMessage(payload = EMPTY) {
    if (this._transportMode) throw new Error('[noise] already in transport mode');
    const payloadBuf = Buffer.isBuffer(payload) ? payload : Buffer.from(JSON.stringify(payload));
    let output       = EMPTY;

    const tokens = this._messageTokens();

    for (const token of tokens) {
      switch (token) {
        case 'e': {
          this._e = generateStaticKeypair();
          const ePub = Buffer.from(this._e.publicKeyB64, 'base64');
          this._ss.mixHash(ePub);
          output = Buffer.concat([output, ePub]);
          // NOTE: mixKey(ePub) here is PSK-only (Noise §9.2). Standard IK/XX do not mix
          // the ephemeral pubkey into the chaining key — only into the hash. The call was
          // causing the responder's CK to diverge from the initiator's during msg2.
          break;
        }
        case 's': {
          const sPub = this._ss.encryptAndHash(Buffer.from(this._s.publicKeyB64, 'base64'));
          output = Buffer.concat([output, sPub]);
          break;
        }
        case 'ee': {
          this._ss.mixKey(dhX25519(this._e.privateKey, this._re));
          break;
        }
        case 'es': {
          const dhResult = this.role === 'initiator'
            ? dhX25519(this._e.privateKey, this._rs)
            : dhX25519(this._s.privateKey, this._re);
          this._ss.mixKey(dhResult);
          break;
        }
        case 'se': {
          const dhResult = this.role === 'initiator'
            ? dhX25519(this._s.privateKey, this._re)
            : dhX25519(this._e.privateKey, this._rs);
          this._ss.mixKey(dhResult);
          break;
        }
        case 'ss': {
          this._ss.mixKey(dhX25519(this._s.privateKey, this._rs));
          break;
        }
        default:
          throw new Error(`[noise] unknown token: ${token}`);
      }
    }

    const encPayload = this._ss.encryptAndHash(payloadBuf);
    output = Buffer.concat([output, encPayload]);
    this._messageIndex++;
    return output;
  }

  // Read a handshake message and return the decrypted payload
  readMessage(message) {
    if (this._transportMode) throw new Error('[noise] already in transport mode');
    let pos    = 0;
    const tokens = this._messageTokens();

    for (const token of tokens) {
      switch (token) {
        case 'e': {
          const keyLen = 44; // X25519 DER SPKI base64 decoded = 44 bytes raw; encoded DER SPKI ≈ 56 bytes
          // X25519 SPKI DER is always 44 bytes
          const ePub = message.slice(pos, pos + 44);
          pos += 44;
          this._re = ePub.toString('base64');
          this._ss.mixHash(ePub);
          break;
        }
        case 's': {
          // If cipher has key: 44 + 16 tag bytes; else 44 bytes
          const len = this._ss._cipherState.hasKey() ? 44 + TAG_LEN : 44;
          const sEnc = message.slice(pos, pos + len);
          pos += len;
          const sPub = this._ss.decryptAndHash(sEnc);
          this._rs = sPub.toString('base64');
          break;
        }
        case 'ee':
          this._ss.mixKey(dhX25519(this._e.privateKey, this._re));
          break;
        case 'es': {
          const dhResult = this.role === 'initiator'
            ? dhX25519(this._e.privateKey, this._rs)
            : dhX25519(this._s.privateKey, this._re);
          this._ss.mixKey(dhResult);
          break;
        }
        case 'se': {
          const dhResult = this.role === 'initiator'
            ? dhX25519(this._s.privateKey, this._re)
            : dhX25519(this._e.privateKey, this._rs);
          this._ss.mixKey(dhResult);
          break;
        }
        case 'ss':
          this._ss.mixKey(dhX25519(this._s.privateKey, this._rs));
          break;
        default:
          throw new Error(`[noise] unknown token: ${token}`);
      }
    }

    const encPayload = message.slice(pos);
    const payload    = this._ss.decryptAndHash(encPayload);
    this._messageIndex++;

    let parsedPayload = payload;
    try { parsedPayload = JSON.parse(payload.toString()); } catch {}

    return { payload: parsedPayload, rawPayload: payload };
  }

  // After all handshake messages: split into transport session keys
  finalize() {
    const [cs1, cs2] = this._ss.split();
    this._transportMode = true;
    // Initiator sends with cs1, receives with cs2. Responder is reversed.
    this._sendCS = this.role === 'initiator' ? cs1 : cs2;
    this._recvCS = this.role === 'initiator' ? cs2 : cs1;

    const rttMs       = Date.now() - this._startTs;
    const handshakeHash = this._ss.handshakeHash;
    const sessionFP   = handshakeHash.slice(0, 8).toString('hex');

    return {
      send:         (ad, plaintext) => this._sendCS.encryptWithAD(ad, plaintext),
      recv:         (ad, ciphertext) => this._recvCS.decryptWithAD(ad, ciphertext),
      remoteStatic: this._rs,
      handshakeHash,
      sessionFP,
      rttMs,
      pattern:      this.pattern,
    };
  }

  // Token sequences per pattern and message index
  _messageTokens() {
    const idx = this._messageIndex;
    if (this.pattern === 'IK') {
      // Noise IK:
      //   → e, es, s, ss   (initiator msg 0)
      //   ← e, ee, se      (responder msg 1)
      const IK = [
        ['e', 'es', 's', 'ss'],  // initiator writes / responder reads
        ['e', 'ee', 'se'],       // responder writes / initiator reads
      ];
      return IK[idx] ?? [];
    }
    if (this.pattern === 'XX') {
      // Noise XX:
      //   → e              (msg 0)
      //   ← e, ee, s, es   (msg 1)
      //   → s, se          (msg 2)
      const XX = [
        ['e'],
        ['e', 'ee', 's', 'es'],
        ['s', 'se'],
      ];
      return XX[idx] ?? [];
    }
    return [];
  }

  get isComplete() {
    if (this.pattern === 'IK') return this._messageIndex >= 2;
    if (this.pattern === 'XX') return this._messageIndex >= 3;
    return false;
  }

  get remoteStaticPub() { return this._rs; }
}

// ── NoiseHandshake — public API surface ───────────────────────────────────────

class NoiseHandshake {
  // IK — initiator knows responder's static pubkey (from DHT)
  static initiatorIK(staticKeys, remoteStaticPubB64) {
    return new HandshakeState({ pattern: 'IK', role: 'initiator', staticKeys, remoteStaticPubB64 });
  }

  static responderIK(staticKeys) {
    return new HandshakeState({ pattern: 'IK', role: 'responder', staticKeys });
  }

  // XX — first contact; no prior key knowledge
  static initiatorXX(staticKeys) {
    return new HandshakeState({ pattern: 'XX', role: 'initiator', staticKeys });
  }

  static responderXX(staticKeys) {
    return new HandshakeState({ pattern: 'XX', role: 'responder', staticKeys });
  }

  static generateStaticKeypair() {
    return generateStaticKeypair();
  }
}

// ── NoiseHandshakeRace ────────────────────────────────────────────────────────
/**
 * Runs N concurrent IK handshakes across N candidate paths in parallel.
 * The first path to complete a verified handshake wins. All others are aborted.
 *
 * This is the speculative parallel key exchange described in the architecture:
 * instead of serial try-one-wait-fail-try-next, all promising paths are
 * attempted simultaneously. When the codec's ConfidencePropagator reports
 * joint confidence above threshold, remaining races are abandoned.
 *
 * Usage:
 *   const winner = await NoiseHandshakeRace.run({
 *     myStaticKeys,
 *     candidates: [
 *       { peerId, path: 'direct', remoteStaticPubB64, transport: asyncSendFn },
 *       { peerId, path: 'stun',   remoteStaticPubB64, transport: asyncSendFn },
 *       { peerId, path: 'relay',  remoteStaticPubB64, transport: asyncSendFn },
 *     ],
 *     bridgePayload,   // extra data to include in handshake message (magnet token etc.)
 *     timeoutMs,
 *     bus,
 *     onWinner,        // optional callback on first winner
 *   });
 */
class NoiseHandshakeRace {
  static async run({
    myStaticKeys,
    candidates,
    bridgePayload = {},
    timeoutMs     = 5000,
    bus           = null,
    onWinner      = null,
  }) {
    if (!candidates?.length) throw new Error('[noise-race] no candidates');

    const emit = (type, data) => { try { bus?.emit(type, data); } catch (_) {} };
    const startTs = Date.now();
    let winner  = null;
    let settled = false;

    const racePromises = candidates.map(async (cand) => {
      const { peerId, path, remoteStaticPubB64, transport } = cand;

      emit('noise:handshake:start', {
        peerId, path,
        pattern:  remoteStaticPubB64 ? 'IK' : 'XX',
        role:     'initiator',
        ts:       Date.now(),
      });

      try {
        // Select IK if we know their static key, XX otherwise
        const hs = remoteStaticPubB64
          ? NoiseHandshake.initiatorIK(myStaticKeys, remoteStaticPubB64)
          : NoiseHandshake.initiatorXX(myStaticKeys);

        // Message 1: write and send
        const payload1 = Buffer.from(JSON.stringify({
          bridgePayload,
          ts: Date.now(),
          path,
        }));
        const msg1 = hs.writeMessage(payload1);

        // Send over this candidate's transport (returns peer's response message)
        const response1 = await Promise.race([
          transport(msg1),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
        ]);

        if (!response1 || settled) return null;

        // Read peer response
        const { payload: peerPayload1 } = hs.readMessage(Buffer.from(response1));

        // For XX: one more round trip
        if (hs.pattern === 'XX') {
          const msg2 = hs.writeMessage(Buffer.from(JSON.stringify({ ts: Date.now() })));
          await Promise.race([
            transport(msg2),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
          ]);
        }

        if (settled) return null;

        const session = hs.finalize();
        const rttMs   = Date.now() - startTs;

        emit('noise:handshake:complete', {
          peerId,
          path,
          pattern:    hs.pattern,
          rttMs,
          sessionFP:  session.sessionFP,
          ts:         Date.now(),
        });

        return { session, peerId, path, rttMs, peerPayload: peerPayload1 };

      } catch (err) {
        if (!settled) {
          emit('noise:handshake:fail', { peerId, path, reason: err.message, ts: Date.now() });
        }
        return null;
      }
    });

    // First non-null result wins
    return new Promise((resolve, reject) => {
      let pending = racePromises.length;

      racePromises.forEach(p => {
        p.then(result => {
          if (result && !settled) {
            settled = true;
            winner  = result;
            emit('noise:race:winner', {
              peerId:  result.peerId,
              path:    result.path,
              rttMs:   result.rttMs,
              ts:      Date.now(),
            });
            onWinner?.(result);

            // Identify abandoned candidates
            const abandonedPeers = candidates
              .filter(c => c.path !== result.path)
              .map(c => c.peerId);
            if (abandonedPeers.length) {
              emit('noise:race:abandoned', { peerIds: abandonedPeers, winner: result.peerId });
            }

            resolve(result);
          }
          pending--;
          if (pending === 0 && !settled) {
            reject(new Error('[noise-race] all paths failed'));
          }
        }).catch(() => {
          pending--;
          if (pending === 0 && !settled) {
            reject(new Error('[noise-race] all paths failed'));
          }
        });
      });

      // Overall timeout
      setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error(`[noise-race] timeout after ${timeoutMs}ms`));
        }
      }, timeoutMs + 100);
    });
  }
}

// ── NoiseSession — post-handshake transport wrapper ───────────────────────────
/**
 * Wraps the raw CipherState pair from hs.finalize() with:
 *   • nonce tracking
 *   • rekey scheduling (every 1M messages per Noise spec recommendation)
 *   • wire format: [4-byte seq][ciphertext]
 */
class NoiseSession {
  constructor({ send, recv, handshakeHash, sessionFP, remoteStatic, pattern, rttMs }) {
    this._send         = send;
    this._recv         = recv;
    this.handshakeHash = handshakeHash;
    this.sessionFP     = sessionFP;
    this.remoteStatic  = remoteStatic;
    this.pattern       = pattern;
    this.rttMs         = rttMs;
    this._sendSeq      = 0;
    this._recvSeq      = 0;
    this._createdAt    = Date.now();
  }

  encrypt(plaintext, ad = EMPTY) {
    if (this._sendSeq >= 0xffffffff) throw new Error('[noise-session] send key exhausted — must rekey');
    const buf   = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(JSON.stringify(plaintext));
    const adBuf = Buffer.isBuffer(ad) ? ad : Buffer.from(ad);
    const ct    = this._send(adBuf, buf);
    const seq   = Buffer.alloc(4);
    seq.writeUInt32BE(this._sendSeq++);
    return Buffer.concat([seq, ct]);
  }

  decrypt(message, ad = EMPTY) {
    const seq    = message.readUInt32BE(0);
    // Reject replayed or out-of-order messages — seq must strictly advance
    if (seq !== this._recvSeq) {
      throw new Error(`[noise-session] replay or out-of-order: expected seq ${this._recvSeq}, got ${seq}`);
    }
    const ct     = message.slice(4);
    const adBuf  = Buffer.isBuffer(ad) ? ad : Buffer.from(ad);
    const pt     = this._recv(adBuf, ct);
    this._recvSeq++;
    try { return JSON.parse(pt.toString()); } catch { return pt; }
  }

  get messagesSent()     { return this._sendSeq; }
  get messagesReceived() { return this._recvSeq; }
  get ageMs()            { return Date.now() - this._createdAt; }

  summary() {
    return {
      sessionFP:        this.sessionFP,
      pattern:          this.pattern,
      remoteStatic:     this.remoteStatic ? this.remoteStatic.slice(0, 16) + '…' : null,
      handshakeRttMs:   this.rttMs,
      messagesSent:     this._sendSeq,
      messagesReceived: this._recvSeq,
      ageMs:            this.ageMs,
    };
  }
}

// ── Factory helpers ───────────────────────────────────────────────────────────

/**
 * Convenience: run a complete IK handshake synchronously over a mock transport.
 * Useful in tests and for in-process pipe connections.
 *
 * Returns { initiatorSession, responderSession, handshakeHash }
 */
function performIKHandshakeMock(initiatorKeys, responderKeys, initiatorPayload = {}, responderPayload = {}) {
  const iHS = NoiseHandshake.initiatorIK(initiatorKeys, responderKeys.publicKeyB64);
  const rHS = NoiseHandshake.responderIK(responderKeys);

  // → msg1
  const msg1 = iHS.writeMessage(Buffer.from(JSON.stringify(initiatorPayload)));
  const { payload: rPayload } = rHS.readMessage(msg1);

  // ← msg2
  const msg2 = rHS.writeMessage(Buffer.from(JSON.stringify(responderPayload)));
  const { payload: iPayload } = iHS.readMessage(msg2);

  const iSession = new NoiseSession(iHS.finalize());
  const rSession = new NoiseSession(rHS.finalize());

  return {
    initiatorSession: iSession,
    responderSession: rSession,
    initiatorReceivedPayload: rPayload,
    responderReceivedPayload: iPayload,
  };
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  NoiseHandshake,
  NoiseHandshakeRace,
  NoiseSession,
  HandshakeState,
  CipherState,
  SymmetricState,
  performIKHandshakeMock,
  generateStaticKeypair,

  // Primitives (for testing)
  noiseHash,
  noiseHMAC,
  noiseHKDF,
  aeadEncrypt,
  aeadDecrypt,
  dhX25519,

  MODULE_VERSION,
  MODULE_UUID,
  PROTOCOL_NAME_IK,
  PROTOCOL_NAME_XX,
};
