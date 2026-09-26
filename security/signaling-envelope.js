/**
 * security/signaling-envelope.js — signed envelope for the signaling
 * channel (join/offer/answer/ice), closing remote-desktop.spec phase 6's
 * `security.signaling_replay_protection` and the fingerprint half of
 * `security.session_hijack_detection`.
 *
 * Why not reuse input-auth.js's HMAC scheme? That's keyed by the shared
 * session token — host and viewer both hold the same token, so an HMAC
 * proves "has a valid token", not "is the same peer who joined earlier".
 * Hijack detection needs to tell two holders of the same token apart,
 * which requires each side to have its own keypair. Ed25519 is what
 * bridge-identity already uses for the host's persistent identity
 * (bridge-os-core/bridge-identity/identity.js) — this file speaks the
 * same signature format (raw 64-byte Ed25519, `dsaEncoding` is a no-op
 * for EdDSA so bridge-identity's signatures verify here unchanged) so a
 * future pass can hand this the real host identity instead of a
 * browser-local one without changing the wire format.
 *
 * Browser+Node compatible via WebCrypto in both places (same dual-export
 * pattern as input-auth.js): browser uses window.crypto.subtle, Node uses
 * node:crypto's webcrypto. Verified cross-compatible with node:crypto's
 * crypto.sign/verify (what bridge-identity uses) — same raw-signature,
 * same SPKI DER public key encoding, no format translation needed.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('crypto').webcrypto);
  } else {
    root.SignalingEnvelope = factory(window.crypto);
  }
}(typeof self !== 'undefined' ? self : this, function (webcrypto) {
  const subtle = webcrypto.subtle;

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

  function hex(buf) {
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Canonical, deterministic JSON: sorts keys at EVERY nesting level.
  //
  // §PATCH (found while testing this file): input-auth.js's stableStringify
  // uses `JSON.stringify(obj, Object.keys(obj).sort())` — the array form of
  // JSON.stringify's replacer argument. That looks like "sort these keys"
  // but it actually means "only these keys, at every level of the tree,
  // recursively". Tested directly:
  //
  //   JSON.stringify({ a: 1, payload: { type: 'offer', sdp: 'REAL' } },
  //                   ['a', 'payload'])
  //   → '{"a":1,"payload":{}}'
  //
  // `type` and `sdp` aren't in the top-level key list, so the entire
  // nested payload is silently dropped — from the signature's point of
  // view, `payload` is always `{}` no matter what's actually in it. A
  // signature computed this way verifies for ANY payload content, which
  // defeats the entire point of signing offer/answer/ice messages. It
  // never surfaced in input-auth.js because every input-frame payload is
  // flat (`{kind, x, y, ts, nonce}`, no nested objects) — this file's
  // envelope always nests the real message under `payload`, which is
  // exactly the shape that trips it. Fixed here with a real recursive
  // canonical stringify; input-auth.js's version has the same latent bug
  // and should get this same fix if its payload shape ever grows a
  // nested object.
  function stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    const keys = Object.keys(value).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
  }

  // ── Identity ────────────────────────────────────────────────────────────

  async function generateIdentity() {
    const kp = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    const spki = await subtle.exportKey('spki', kp.publicKey);
    const fpBuf = await subtle.digest('SHA-256', spki);
    return {
      privateKey: kp.privateKey,
      publicKey:  kp.publicKey,
      pub:        bufToB64(spki),
      fingerprint: hex(fpBuf),
    };
  }

  // Re-import a previously-generated identity from its exported form
  // (privateKey exported as JWK, since PKCS8 export requires
  // extractable=true which is the same either way — JWK is simplest to
  // round-trip through localStorage as JSON).
  async function importIdentity({ privateJwk, pub, fingerprint }) {
    const privateKey = await subtle.importKey('jwk', privateJwk, { name: 'Ed25519' }, true, ['sign']);
    const publicKey  = await subtle.importKey('spki', b64ToBuf(pub), { name: 'Ed25519' }, true, ['verify']);
    return { privateKey, publicKey, pub, fingerprint };
  }

  async function exportIdentity(identity) {
    const privateJwk = await subtle.exportKey('jwk', identity.privateKey);
    return { privateJwk, pub: identity.pub, fingerprint: identity.fingerprint };
  }

  // ── Sign / verify ───────────────────────────────────────────────────────

  async function signEnvelope(payload, identity, seq) {
    const envelope = {
      seq,
      ts: Date.now(),
      fingerprint: identity.fingerprint,
      pub: identity.pub,
      payload,
    };
    const sigBuf = await subtle.sign('Ed25519', identity.privateKey, new TextEncoder().encode(stableStringify(envelope)));
    return { ...envelope, sig: bufToB64(sigBuf) };
  }

  // Verifies signature + fingerprint-matches-pubkey. Does NOT check
  // replay or session-fingerprint-binding — that's signaling-gate.js's
  // job (it has session state to check against; this file is pure crypto).
  async function verifyEnvelope(signed) {
    if (!signed || typeof signed.sig !== 'string' || typeof signed.pub !== 'string' ||
        typeof signed.fingerprint !== 'string' || typeof signed.seq !== 'number' || typeof signed.ts !== 'number') {
      return { ok: false, reason: 'malformed_envelope' };
    }

    let pubDer;
    try { pubDer = b64ToBuf(signed.pub); } catch { return { ok: false, reason: 'bad_pubkey_encoding' }; }

    const derivedFp = hex(await subtle.digest('SHA-256', pubDer));
    if (derivedFp !== signed.fingerprint) {
      return { ok: false, reason: 'fingerprint_mismatch' };
    }

    let publicKey;
    try {
      publicKey = await subtle.importKey('spki', pubDer, { name: 'Ed25519' }, false, ['verify']);
    } catch {
      return { ok: false, reason: 'bad_pubkey' };
    }

    const { sig, ...unsigned } = signed;
    let valid = false;
    try {
      valid = await subtle.verify('Ed25519', publicKey, b64ToBuf(sig), new TextEncoder().encode(stableStringify(unsigned)));
    } catch {
      return { ok: false, reason: 'verify_error' };
    }
    if (!valid) return { ok: false, reason: 'bad_signature' };

    return { ok: true, fingerprint: signed.fingerprint, seq: signed.seq, ts: signed.ts, payload: signed.payload };
  }

  return { generateIdentity, importIdentity, exportIdentity, signEnvelope, verifyEnvelope, stableStringify };
}));
