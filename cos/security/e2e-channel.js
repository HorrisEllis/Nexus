/**
 * security/e2e-channel.js — encrypted wrapper over a WebRTC data channel,
 * plus a connection-drop kill switch.
 *
 * §BUILT 2026-09-16 — James: "this needs to be secure, private, and
 * stable. a mistake could cost lives. a gap could [cost] lives. we need
 * this airtight. an encrypted wrapper over webrtc. a kill switch if the
 * connection drops."
 *
 * Said plainly, up front, because it matters more than anything below:
 * NOTHING is airtight. Any system that claims to be is lying to the
 * people trusting it with their safety, and for this specific audience —
 * journalists under state surveillance, abuse victims — a false sense of
 * security is more dangerous than a known, named gap, because a known
 * gap gets fixed and false confidence gets someone hurt. What follows is
 * real defense-in-depth, built on audited primitives (WebCrypto's own
 * X25519/HKDF/AES-GCM, not hand-rolled crypto), verified end-to-end
 * before this file was written — not just written and assumed correct.
 * It is not a substitute for an actual cryptographic security review
 * before this carries a real journalist's or a real victim's traffic.
 * Say that to whoever reviews this before it ships to either audience.
 *
 * ── What this protects against ──────────────────────────────────────────
 * - A compromised or malicious TURN/signaling relay reading data-channel
 *   contents. WebRTC's own DTLS already encrypts the data channel in
 *   transit — this is a SECOND, independent layer on top, keyed by the
 *   peers' own identities rather than a DTLS handshake negotiated through
 *   infrastructure you don't control. Defense in depth: if DTLS is ever
 *   misconfigured, downgraded, or a relay is doing something it
 *   shouldn't, the payload itself is still opaque.
 * - Replay and reordering of captured frames (strict per-direction
 *   sequence enforcement — a repeated or out-of-order frame is rejected,
 *   not applied).
 * - Tampering (AES-GCM's authentication tag — confirmed by direct test:
 *   flipping one bit of ciphertext makes decryption fail, not decrypt to
 *   garbage silently).
 * - A dropped connection being treated as "probably fine" — see kill
 *   switch below.
 *
 * ── What this does NOT protect against — say this part too ────────────
 * - A compromised endpoint. If the host or viewer machine itself is
 *   already monitored (stalkerware, a compromised OS), encrypting the
 *   wire does nothing — the attacker is reading the screen directly.
 * - Traffic analysis / metadata. This hides CONTENT, not the fact that
 *   two peers are talking, when, how often, or how much data moves.
 *   That's a network-layer concern (see the mesh-node threat-model doc's
 *   TURN-relay-only recommendation) — orthogonal to this file.
 * - Active MITM on the KEY EXCHANGE itself. The X25519 public key each
 *   side sends MUST travel inside a signaling-envelope.js envelope (the
 *   `dhPub` field belongs in that envelope's `payload`) so it's bound to
 *   a signed Ed25519 identity. If a raw, unsigned X25519 public key is
 *   ever accepted here without that binding, an attacker sitting on the
 *   signaling channel can substitute their own key and this whole file
 *   protects nothing — it authenticates content between two keys, not
 *   which two keys are trustworthy. That authentication is
 *   signaling-envelope.js's job, still gated on signaling-gate.js
 *   actually existing (tracked separately, not yet built).
 *
 * ── Why two separate keys, not one ──────────────────────────────────────
 * ECDH produces ONE shared secret, symmetric between both peers. Using
 * it directly as a single AES-GCM key in both directions means both
 * sides could pick the same nonce for different messages — catastrophic
 * for GCM (breaks confidentiality AND authentication). Fixed here the
 * standard way (same shape as TLS's separate client/server write keys):
 * HKDF splits the one shared secret into two directional keys via
 * different `info` labels. Sender and receiver never share a key, so
 * nonce collision across directions is structurally impossible, not
 * just unlikely.
 *
 * ── Why counters, not random IVs ────────────────────────────────────────
 * A random 96-bit IV per message is common practice and NIST-bounded to
 * ~2^32 messages per key before collision risk becomes non-negligible —
 * fine for most uses, but this session could run for hours at high
 * frame rates. A strictly monotonic per-key counter removes the
 * birthday bound entirely: uniqueness is guaranteed, not merely
 * probable. Safe specifically BECAUSE the kill switch below forces a
 * brand new key (and therefore a fresh, zeroed counter) on every
 * reconnect — an old counter is never reused against an old key, so
 * there's no path to accidental reuse.
 *
 * Verified in this sandbox before writing this header: X25519 keygen,
 * ECDH agreement (both sides derive the identical secret), HKDF
 * derivation, AES-GCM encrypt/decrypt round-trip, and tamper rejection
 * all ran against Node's real WebCrypto implementation and passed.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('crypto').webcrypto);
  } else {
    root.E2EChannel = factory(window.crypto);
  }
}(typeof self !== 'undefined' ? self : this, function (webcrypto) {
  const subtle = webcrypto.subtle;
  const HKDF_INFO_BASE = 'nexus-e2e-channel-v1';

  function bufToB64(buf) {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return (typeof btoa !== 'undefined') ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64');
  }
  function b64ToBuf(b64) {
    const bin = (typeof atob !== 'undefined') ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  // ── Key agreement ───────────────────────────────────────────────────────

  // Deliberately separate from signaling-envelope.js's Ed25519 identity
  // keypair — never reuse a signing key for key agreement, they're
  // different algorithms with different security properties. This
  // keypair's PUBLIC half is what goes inside a signed envelope's
  // payload; the private half never leaves this module.
  async function generateDhKeypair() {
    const kp = await subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
    const spki = await subtle.exportKey('spki', kp.publicKey);
    return { privateKey: kp.privateKey, publicKey: kp.publicKey, pub: bufToB64(spki) };
  }

  async function importPeerDhPublicKey(pubB64) {
    return subtle.importKey('spki', b64ToBuf(pubB64), { name: 'X25519' }, false, []);
  }

  /**
   * deriveChannelKeys — one ECDH agreement, split into two directional
   * AES-256-GCM keys via HKDF. `role` MUST be agreed out-of-band (e.g.
   * host is always 'initiator', viewer always 'responder' — signal.js's
   * existing session-token role field is a fine source for this) so
   * both sides pick sendKey/recvKey consistently.
   * `sessionId` binds the derived keys to this specific session — reused
   * across sessions, the same two identities would derive the same
   * keys, which defeats the point of the kill switch forcing fresh keys.
   */
  async function deriveChannelKeys({ myDhPrivateKey, peerDhPublicKeyB64, sessionId, role }) {
    if (role !== 'initiator' && role !== 'responder') throw new Error('role must be "initiator" or "responder"');
    const peerPub = await importPeerDhPublicKey(peerDhPublicKeyB64);
    const secretBits = await subtle.deriveBits({ name: 'X25519', public: peerPub }, myDhPrivateKey, 256);
    const hkdfKey = await subtle.importKey('raw', secretBits, 'HKDF', false, ['deriveKey']);
    const salt = new TextEncoder().encode(String(sessionId));

    async function sub(label) {
      const info = new TextEncoder().encode(`${HKDF_INFO_BASE}:${label}`);
      return subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info }, hkdfKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    }
    const i2r = await sub('initiator->responder');
    const r2i = await sub('responder->initiator');
    return role === 'initiator' ? { sendKey: i2r, recvKey: r2i } : { sendKey: r2i, recvKey: i2r };
  }

  // ── Frame encrypt/decrypt — counter nonce, strict anti-replay ─────────

  function counterToNonce(counter) {
    // 12-byte GCM nonce: 4 zero bytes + 8-byte big-endian counter. See
    // header — safe specifically because a fresh key always starts this
    // at 0, and the kill switch guarantees no key is ever reused across
    // a reconnect.
    const buf = new ArrayBuffer(12);
    const view = new DataView(buf);
    view.setBigUint64(4, BigInt(counter), false);
    return new Uint8Array(buf);
  }

  async function encryptFrame(key, counter, plaintextObj) {
    const iv = counterToNonce(counter);
    const pt = new TextEncoder().encode(JSON.stringify(plaintextObj));
    const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, pt);
    return { seq: counter, ct: bufToB64(ct) };
  }

  async function decryptFrame(key, frame, lastSeenSeq) {
    if (typeof frame?.seq !== 'number' || typeof frame?.ct !== 'string') {
      return { ok: false, reason: 'malformed_frame' };
    }
    // Strict anti-replay: seq must be greater than every seq seen so far
    // on this key. Rejects exact replays AND reordering — a real
    // remote-desktop/mesh frame arriving out of order is treated as an
    // attack, not a network hiccup, because at this layer there's no way
    // to tell the difference and the safe default is reject.
    if (frame.seq <= lastSeenSeq) return { ok: false, reason: 'replay_or_reorder', seq: frame.seq, lastSeenSeq };

    const iv = counterToNonce(frame.seq);
    let pt;
    try {
      pt = await subtle.decrypt({ name: 'AES-GCM', iv }, key, b64ToBuf(frame.ct));
    } catch {
      return { ok: false, reason: 'decrypt_failed_or_tampered' };
    }
    let payload;
    try { payload = JSON.parse(new TextDecoder().decode(pt)); }
    catch { return { ok: false, reason: 'invalid_json_payload' }; }
    return { ok: true, seq: frame.seq, payload };
  }

  // ── EncryptedChannel — wraps a transport, owns the kill switch ────────

  /**
   * EncryptedChannel(transport, { peerConnection }) — `transport` is
   * anything shaped like update-system's WebRTCTransport (send(obj) /
   * onMessage(cb)); `peerConnection` is the underlying RTCPeerConnection,
   * watched for the kill switch. Call setKeys() once deriveChannelKeys()
   * resolves, before sending/receiving anything real.
   */
  function EncryptedChannel(transport, { peerConnection } = {}) {
    let sendKey = null, recvKey = null;
    let sendCounter = 0, lastSeenSeq = -1;
    let killed = false;
    const listeners = { message: [], killswitch: [] };

    function emit(evt, data) { for (const fn of listeners[evt] || []) { try { fn(data); } catch {} } }

    function setKeys({ sendKey: sk, recvKey: rk }) {
      sendKey = sk; recvKey = rk;
      sendCounter = 0; lastSeenSeq = -1;
      killed = false;
    }

    // ── Kill switch ───────────────────────────────────────────────────
    // Fires on ANY departure from 'connected' — 'disconnected', 'failed',
    // 'closed' — on either connectionstatechange or
    // iceconnectionstatechange (watching both: some runtimes surface a
    // drop through one before the other). Once triggered: every send()
    // and incoming decrypt is refused until setKeys() is called again
    // with a freshly-derived key from a full new handshake. This is the
    // actual requirement, not a UI nicety — a silent auto-reconnect that
    // resumes on the OLD key/counter is exactly the session-hijack shape
    // the phase 6 work (signaling-envelope.js / signaling-gate.js) exists
    // to prevent. This file enforces the same rule at the encryption
    // layer: no session survives a drop without re-proving identity.
    function killSwitch(reason) {
      if (killed) return;
      killed = true;
      // Best-effort only — say so plainly. Dropping references stops
      // THIS module from using the key; it does not and cannot guarantee
      // the underlying WebCrypto implementation scrubs the key material
      // from memory. CryptoKey objects are opaque by design; there is no
      // JS-level "secure erase" for them.
      sendKey = null; recvKey = null;
      emit('killswitch', { reason, ts: Date.now() });
    }

    if (peerConnection && typeof peerConnection.addEventListener === 'function') {
      const bad = new Set(['disconnected', 'failed', 'closed']);
      peerConnection.addEventListener('connectionstatechange', () => {
        if (bad.has(peerConnection.connectionState)) killSwitch(`connectionState:${peerConnection.connectionState}`);
      });
      peerConnection.addEventListener('iceconnectionstatechange', () => {
        if (bad.has(peerConnection.iceConnectionState)) killSwitch(`iceConnectionState:${peerConnection.iceConnectionState}`);
      });
    }

    transport.onMessage((raw) => {
      (async () => {
        if (killed || !recvKey) return; // dropped, not queued — a killed channel does not buffer for later replay
        let frame;
        try { frame = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return; }
        const result = await decryptFrame(recvKey, frame, lastSeenSeq);
        if (!result.ok) { killSwitch(`rx:${result.reason}`); return; }
        lastSeenSeq = result.seq;
        emit('message', result.payload);
      })();
    });

    return {
      setKeys,
      isKilled: () => killed,
      async send(obj) {
        if (killed || !sendKey) throw new Error('e2e-channel: killed or not keyed — cannot send');
        const frame = await encryptFrame(sendKey, sendCounter++, obj);
        transport.send(JSON.stringify(frame));
      },
      on(evt, fn) { (listeners[evt] ??= []).push(fn); },
      killSwitch, // exposed for an explicit manual trip too (e.g. a panic button), not just automatic
    };
  }

  return { generateDhKeypair, deriveChannelKeys, EncryptedChannel, encryptFrame, decryptFrame };
}));
