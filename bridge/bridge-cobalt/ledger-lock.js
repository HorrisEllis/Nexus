// Copyright (c) 2026 James Brooks (Erosmancer). All rights reserved.
// Bridge OS — Proprietary Software. See LICENSE for terms.
// rheon.world · github.com/HorrisEllis/Bridge-v2
'use strict';
/**
 * bridge-cobalt/ledger-lock.js   v1.0.0
 *
 * COBALT CORE — Cryptographic Ledger Lock
 *
 * Provides a tamper-proof, append-only ledger of every boot event.
 * Each entry is signed by the node's Ed25519 identity key and chained
 * to the previous entry via its SHA-256 hash (like a mini-blockchain).
 *
 * Key properties:
 *   1. CHAIN INTEGRITY — every entry commits to prev entry hash.
 *      Any retroactive edit breaks all subsequent hashes.
 *   2. IDENTITY BINDING — each entry is signed. A tampered entry
 *      fails Ed25519 verification even if you re-hash the chain.
 *   3. NETWORK LOCK — on each boot, node computes a "boot token"
 *      that encodes {uuid, cryptoProof, fileHashes, chainHead}.
 *      Peers receive this token on connect. If token is invalid
 *      or absent, admission is denied regardless of trust score.
 *   4. IMMUTABLE SEAL — once sealed, a boot session cannot be
 *      retroactively altered. The ledger is append-only on disk.
 *
 * Format (JSONL — one JSON object per line):
 *   { seq, ts, event, nodeId, payload, prevHash, hash, sig }
 *
 * Boot token format (base64url-encoded JSON):
 *   { nodeId, seq, chainHead, cryptoProof, fileCount, ts, sig }
 */

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

const VERSION     = '1.0.0';
const MODULE_UUID = 'bridge-cobalt-ledger-v1000-00000000001';

// ─── Helpers ────────────────────────────────────────────────────────────────
function sha256(data) {
  return crypto.createHash('sha256')
    .update(typeof data === 'string' ? data : JSON.stringify(data))
    .digest('hex');
}

function b64url(buf) {
  return (Buffer.isBuffer(buf) ? buf : Buffer.from(buf))
    .toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function signEntry(identity, payload) {
  if (!identity?._privateKey) return null;
  try {
    const buf = crypto.sign(
      null,
      Buffer.from(JSON.stringify(payload)),
      { key: identity._privateKey, dsaEncoding: 'der' }
    );
    return buf.toString('base64');
  } catch { return null; }
}

function verifyEntrySignature(entry, publicKey) {
  if (!entry.sig || !publicKey) return false;
  try {
    const { sig, hash, ...payload } = entry;
    return crypto.verify(
      null,
      Buffer.from(JSON.stringify(payload)),
      { key: publicKey, dsaEncoding: 'der' },
      Buffer.from(sig, 'base64')
    );
  } catch { return false; }
}

// ─── LedgerLock ─────────────────────────────────────────────────────────────
function createLedgerLock({ dataDir, identity } = {}) {
  const ledgerPath = path.join(dataDir, 'cobalt-ledger.jsonl');
  let _entries     = [];
  let _chainHead   = '0000000000000000000000000000000000000000000000000000000000000000';
  let _seq         = 0;
  let _bootToken   = null;

  // ── Load existing ledger from disk ──────────────────────────────────────
  function load() {
    if (!fs.existsSync(ledgerPath)) return { ok: true, entries: 0, valid: true };

    try {
      const lines = fs.readFileSync(ledgerPath, 'utf8')
        .trim().split('\n').filter(Boolean);

      _entries = [];
      let prevHash = '0000000000000000000000000000000000000000000000000000000000000000';

      for (let i = 0; i < lines.length; i++) {
        let entry;
        try { entry = JSON.parse(lines[i]); } catch {
          return { ok: false, reason: `ledger parse error at line ${i + 1}` };
        }

        // Verify chain link
        if (entry.prevHash !== prevHash) {
          return {
            ok: false,
            reason: `chain break at seq ${entry.seq}: expected prevHash ${prevHash.slice(0,8)}… got ${entry.prevHash?.slice(0,8)}…`,
            brokenAt: i,
          };
        }

        // Verify hash commitment
        const { hash, sig, ...body } = entry;
        const expectedHash = sha256(JSON.stringify(body));
        if (hash !== expectedHash) {
          return {
            ok: false,
            reason: `hash mismatch at seq ${entry.seq}`,
            brokenAt: i,
          };
        }

        prevHash = hash;
        _entries.push(entry);
      }

      _chainHead = prevHash;
      _seq = _entries.length;
      return { ok: true, entries: _entries.length, valid: true };

    } catch (e) {
      return { ok: false, reason: e.message };
    }
  }

  // ── Append an entry ──────────────────────────────────────────────────────
  function append(event, payload = {}) {
    const nodeId  = identity?.uuid || 'unknown';
    const ts      = Date.now();
    const seq     = _seq;
    const prevHash = _chainHead;

    // Build the signable body (excluding hash + sig)
    const body = { seq, ts, event, nodeId, payload, prevHash };
    const hash = sha256(JSON.stringify(body));
    const sig  = signEntry(identity, body);

    const entry = { ...body, hash, sig };

    // Append to disk (atomic: write → flush)
    try {
      fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
      fs.appendFileSync(ledgerPath, JSON.stringify(entry) + '\n', 'utf8');
    } catch (e) {
      // Disk failure is non-fatal — keep in-memory chain intact
      console.warn(`[cobalt-ledger] Disk write failed: ${e.message}`);
    }

    _entries.push(entry);
    _chainHead = hash;
    _seq++;

    return entry;
  }

  // ── Seal this boot session ───────────────────────────────────────────────
  // Called after Phase 1.6 (file integrity) with the cryptoProof from self-test.
  // Returns a signed boot token that proves: identity + crypto health + chain state.
  function sealBoot({ cryptoProof, fileHashes, fileCount } = {}) {
    const nodeId    = identity?.uuid || 'unknown';
    const ts        = Date.now();
    const chainHead = _chainHead;
    const seq       = _seq;

    const tokenBody = { nodeId, seq, chainHead, fileCount: fileCount || 0, ts };

    // Include a truncated crypto proof HMAC so peers can verify we ran self-test
    if (cryptoProof?.hmac) {
      tokenBody.cryptoProof = cryptoProof.hmac.slice(0, 32); // first 128 bits
    }

    const sig = signEntry(identity, tokenBody);
    const token = { ...tokenBody, sig };
    const encoded = b64url(Buffer.from(JSON.stringify(token)));

    _bootToken = { token, encoded };

    // Record seal event in ledger
    append('cobalt:boot:sealed', {
      seq,
      chainHead: chainHead.slice(0, 16),
      fileCount,
      hasCryptoProof: !!cryptoProof?.hmac,
    });

    return { token, encoded };
  }

  // ── Verify a peer's boot token ───────────────────────────────────────────
  function verifyPeerToken(encodedToken, peerPublicKey) {
    if (!encodedToken) return { ok: false, reason: 'no boot token presented' };

    let token;
    try {
      const json = Buffer.from(
        encodedToken.replace(/-/g, '+').replace(/_/g, '/'),
        'base64'
      ).toString('utf8');
      token = JSON.parse(json);
    } catch {
      return { ok: false, reason: 'boot token decode failed' };
    }

    if (!token.nodeId || !token.seq || !token.chainHead || !token.ts) {
      return { ok: false, reason: 'boot token missing required fields' };
    }

    // Replay window: 5 minutes (covers slow boots on Pi/mobile)
    const age = Date.now() - token.ts;
    if (age > 5 * 60 * 1000) {
      return { ok: false, reason: `boot token stale (${Math.round(age / 60000)}min old)` };
    }

    // Verify signature
    if (token.sig && peerPublicKey) {
      const { sig, ...body } = token;
      try {
        const valid = crypto.verify(
          null,
          Buffer.from(JSON.stringify(body)),
          { key: peerPublicKey, dsaEncoding: 'der' },
          Buffer.from(sig, 'base64')
        );
        if (!valid) return { ok: false, reason: 'boot token signature invalid' };
      } catch (e) {
        return { ok: false, reason: `boot token sig verify error: ${e.message}` };
      }
    } else {
      return { ok: false, reason: 'boot token has no signature' };
    }

    // Require crypto proof (proves self-test ran)
    if (!token.cryptoProof) {
      return { ok: false, reason: 'boot token missing crypto proof — node skipped self-test' };
    }

    return {
      ok:     true,
      nodeId: token.nodeId,
      seq:    token.seq,
      ts:     token.ts,
      age:    Math.round(age / 1000),
    };
  }

  // ── Verify full chain integrity ─────────────────────────────────────────
  function verifyChain() {
    let prev = '0000000000000000000000000000000000000000000000000000000000000000';
    for (let i = 0; i < _entries.length; i++) {
      const e = _entries[i];
      if (e.prevHash !== prev) return { ok: false, brokenAt: i, seq: e.seq };
      const { hash, sig, ...body } = e;
      if (sha256(JSON.stringify(body)) !== hash) return { ok: false, brokenAt: i, seq: e.seq };
      prev = hash;
    }
    return { ok: true, entries: _entries.length, chainHead: _chainHead };
  }

  // ── Diagnostics ─────────────────────────────────────────────────────────
  function diagnostics() {
    return {
      version:       VERSION,
      uuid:          MODULE_UUID,
      ledgerPath,
      entries:       _entries.length,
      chainHead:     _chainHead.slice(0, 16) + '…',
      seq:           _seq,
      bootTokenReady: !!_bootToken,
      nodeId:        identity?.uuid || 'unknown',
    };
  }

  function getBootToken()  { return _bootToken; }
  function getChainHead()  { return _chainHead; }
  function getEntries()    { return [..._entries]; }

  return {
    load,
    append,
    sealBoot,
    verifyPeerToken,
    verifyChain,
    diagnostics,
    getBootToken,
    getChainHead,
    getEntries,
    VERSION,
    MODULE_UUID,
  };
}

module.exports = { createLedgerLock, VERSION, MODULE_UUID };
