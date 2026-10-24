/**
 * input-auth.js — per-message input authentication (closes the phase-4 gap:
 * "no per-message authentication on the input channel — a MITM on a
 * misconfigured TURN relay could inject arbitrary input").
 *
 * HMAC-SHA256, keyed by the session token both sides already hold from the
 * phase-2 token handshake — no new secret to distribute. Works unmodified
 * in a browser (viewer.html/host.html, via window.crypto.subtle) and in
 * Node (input-injector.js's caller, via node:crypto's webcrypto), same
 * file either way.
 *
 * Deliberately has no opinion on WHERE verification happens — just
 * correct primitives. That choice belongs to the caller (main.js verifies
 * in the trusted Electron main process, not the renderer — see its
 * ipcMain handler).
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('crypto').webcrypto);
  } else {
    root.InputAuth = factory(window.crypto);
  }
}(typeof self !== 'undefined' ? self : this, function (webcrypto) {
  const subtle = webcrypto.subtle;

  const keyCache = new Map(); // token -> CryptoKey, avoid re-importing per message

  async function getKey(token) {
    if (keyCache.has(token)) return keyCache.get(token);
    const key = await subtle.importKey(
      'raw',
      new TextEncoder().encode(token),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify']
    );
    keyCache.set(token, key);
    return key;
  }

  function randomNonce() {
    const bytes = new Uint8Array(12);
    webcrypto.getRandomValues(bytes);
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function hex(buf) {
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function unhex(str) {
    const bytes = str.match(/.{1,2}/g) || [];
    return new Uint8Array(bytes.map((b) => parseInt(b, 16)));
  }

  // Flat objects only (that's all an input event ever is) — sorted-key
  // JSON.stringify so signing is deterministic regardless of property
  // insertion order between the two sides.
  function stableStringify(obj) {
    return JSON.stringify(obj, Object.keys(obj).sort());
  }

  async function signFrame(evt, token) {
    if (!evt || typeof evt.kind !== 'string') {
      throw new Error('input-auth: evt.kind is required');
    }
    const frame = { ...evt, ts: evt.ts || Date.now(), nonce: randomNonce() };
    const key = await getKey(token);
    const sigBuf = await subtle.sign('HMAC', key, new TextEncoder().encode(stableStringify(frame)));
    return { ...frame, sig: hex(sigBuf) };
  }

  async function verifyFrame(signedFrame, token) {
    if (!signedFrame || typeof signedFrame.sig !== 'string' || typeof signedFrame.nonce !== 'string') {
      return false; // malformed frame — closes "malformed input frames were unguarded"
    }
    const { sig, ...frame } = signedFrame;
    try {
      const key = await getKey(token);
      return await subtle.verify('HMAC', key, unhex(sig), new TextEncoder().encode(stableStringify(frame)));
    } catch {
      return false; // never throw on a bad frame — a hostile input is data, not a crash
    }
  }

  // Replay protection at the input-channel level (spec's channel-level
  // replay closure, distinct from phase 6's signaling-layer replay guard).
  // Rejects: a nonce seen before, or a timestamp outside the freshness
  // window (also catches "out-of-order" frames arriving too late to act on).
  function createReplayGuard({ windowMs = 10_000 } = {}) {
    const seenNonces = new Map(); // nonce -> expiresAt
    const sweep = setInterval(() => {
      const now = Date.now();
      for (const [nonce, expiresAt] of seenNonces) if (now > expiresAt) seenNonces.delete(nonce);
    }, windowMs);
    sweep.unref?.();

    return {
      check(frame) {
        if (!frame || typeof frame.ts !== 'number' || typeof frame.nonce !== 'string') return false;
        const now = Date.now();
        if (Math.abs(now - frame.ts) > windowMs) return false; // stale or clock-skewed/out-of-order
        if (seenNonces.has(frame.nonce)) return false; // replay
        seenNonces.set(frame.nonce, now + windowMs);
        return true;
      },
      _stop: () => clearInterval(sweep),
    };
  }

  return { signFrame, verifyFrame, stableStringify, createReplayGuard };
}));
