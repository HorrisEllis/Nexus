// Copyright (c) 2026 James Brooks (Erosmancer). All rights reserved.
// Bridge OS — Proprietary Software. See LICENSE for terms.
// rheon.world · github.com/HorrisEllis/Bridge-v2
'use strict';
/**
 * bridge-cobalt/symbol-detector.js   v1.0.0
 *
 * COBALT CORE — Symbol & Signature Detector
 *
 * Detects and validates cryptographic "symbols" — structural patterns
 * that identify a legitimate Bridge OS node. Think of a symbol as a
 * multi-layer fingerprint beyond the UUID:
 *
 *   Layer 1 — IDENTITY SYMBOL
 *     Ed25519 public key fingerprint + UUID derivation check.
 *     UUID must be derivable from the public key (bridge-identity invariant).
 *     A node that fails this is either not running Bridge OS or has
 *     a tampered identity — hard reject.
 *
 *   Layer 2 — STRUCTURAL SYMBOL
 *     Every Bridge OS node has a predictable module signature:
 *     {siso, causal, sngate, heartbeat, trustMesh} all present in /health.
 *     A node missing these is impersonating Bridge — soft deny.
 *
 *   Layer 3 — COBALT SYMBOL
 *     Boot token present + chain head reported + crypto proof valid.
 *     Only nodes running Cobalt Core boot sequence emit this.
 *     Required for Cobalt mesh admission. Absence = quarantine.
 *
 *   Layer 4 — LEDGE SYMBOL (optional, high-trust tier)
 *     Peer presents their local ledger chain head.
 *     We compare it against our global ledger records for this peer.
 *     If their reported chain head diverges from history → Sybil suspect.
 *
 * Symbol scoring (0–12):
 *   +3  identity symbol (UUID/pubkey binding valid)
 *   +3  structural symbol (module fingerprint matches)
 *   +4  cobalt symbol (boot token + chain head)
 *   +2  ledge symbol (chain continuity verified)
 *   ──
 *   12  perfect Cobalt node
 *   < 7 → reject from Cobalt mesh
 *   < 4 → hard reject (no identity)
 */

const crypto = require('crypto');

const VERSION     = '1.0.0';
const MODULE_UUID = 'bridge-cobalt-symbol-v1000-0000000001';

// Expected module keys in a Bridge OS /health response
const BRIDGE_STRUCTURAL_KEYS = ['causal', 'nodes', 'trust', 'appid', 'network'];
// Cobalt-tier additional keys
const COBALT_STRUCTURAL_KEYS = ['cobalt'];

// ─── Layer 1: Identity Symbol ────────────────────────────────────────────────
function detectIdentitySymbol(handshake, { verifyHandshakeFn } = {}) {
  if (!verifyHandshakeFn) {
    return { ok: false, score: 0, reason: 'no verifyHandshake function' };
  }

  const result = verifyHandshakeFn(handshake);
  if (!result.ok) {
    return { ok: false, score: 0, reason: `identity symbol fail: ${result.reason}` };
  }

  // Extra: check UUID format (bridge-identity uses crypto.randomUUID format)
  const uuidRx = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRx.test(handshake.uuid)) {
    return { ok: false, score: 0, reason: 'identity symbol: UUID format invalid' };
  }

  return {
    ok:        true,
    score:     3,
    reason:    'identity:ok',
    publicKey: result.publicKey,
    uuid:      result.uuid,
  };
}

// ─── Layer 2: Structural Symbol ──────────────────────────────────────────────
// healthData is the parsed /health JSON body fetched from the peer.
function detectStructuralSymbol(healthData) {
  if (!healthData || typeof healthData !== 'object') {
    return { ok: false, score: 0, reason: 'structural symbol: no health data' };
  }

  const missing = BRIDGE_STRUCTURAL_KEYS.filter(k => !(k in healthData));

  if (missing.length > 0) {
    return {
      ok:      false,
      score:   0,
      reason: `structural symbol: missing keys [${missing.join(', ')}]`,
      missing,
    };
  }

  // Version sanity — uuid should be present
  if (!healthData.uuid || typeof healthData.uuid !== 'string') {
    return { ok: false, score: 0, reason: 'structural symbol: health.uuid missing' };
  }

  // Cobalt bonus: does health report cobalt diagnostics?
  const hasCobalt = COBALT_STRUCTURAL_KEYS.every(k => k in healthData);

  return {
    ok:        true,
    score:     3,
    reason:    'structural:ok',
    hasCobalt,
    version:   healthData.version,
  };
}

// ─── Layer 3: Cobalt Symbol ──────────────────────────────────────────────────
// Verifies the boot token and chain head from the peer's Cobalt Core.
function detectCobaltSymbol(handshake, peerPublicKey, { ledgerLock } = {}) {
  const { bootToken, chainHead } = handshake;

  if (!bootToken) {
    return { ok: false, score: 0, reason: 'cobalt symbol: no boot token' };
  }

  if (!chainHead) {
    return { ok: false, score: 0, reason: 'cobalt symbol: no chain head' };
  }

  // Delegate to ledger-lock for full token verification
  if (ledgerLock) {
    const result = ledgerLock.verifyPeerToken(bootToken, peerPublicKey);
    if (!result.ok) {
      return { ok: false, score: 0, reason: `cobalt symbol: ${result.reason}` };
    }

    return {
      ok:      true,
      score:   4,
      reason:  'cobalt:ok',
      nodeId:  result.nodeId,
      tokenAge: result.age,
    };
  }

  // Fallback: basic structural check without ledger
  let token;
  try {
    const decoded = Buffer.from(
      bootToken.replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    ).toString('utf8');
    token = JSON.parse(decoded);
  } catch {
    return { ok: false, score: 0, reason: 'cobalt symbol: token decode failed' };
  }

  if (!token.sig) {
    return { ok: false, score: 0, reason: 'cobalt symbol: token unsigned' };
  }

  if (!token.cryptoProof) {
    return { ok: false, score: 0, reason: 'cobalt symbol: token missing crypto proof' };
  }

  const age = Date.now() - (token.ts || 0);
  if (age > 5 * 60 * 1000) {
    return { ok: false, score: 0, reason: `cobalt symbol: token stale (${Math.round(age / 60000)}min)` };
  }

  return {
    ok:       true,
    score:    2,  // partial — couldn't fully verify without ledger
    reason:   'cobalt:partial (no ledger)',
    nodeId:   token.nodeId,
    tokenAge: Math.round(age / 1000),
  };
}

// ─── Layer 4: Ledge Symbol ───────────────────────────────────────────────────
// Checks chain continuity against our recorded history for this peer.
function detectLedgeSymbol(handshake, { globalLedgerEntries = [] } = {}) {
  const { chainHead, nodeId } = handshake;

  if (!chainHead || !nodeId) {
    return { ok: false, score: 0, reason: 'ledge symbol: chainHead or nodeId missing' };
  }

  // Find previous entries for this peer
  const peerHistory = globalLedgerEntries
    .filter(e => e.peerUuid === nodeId || e.peerUuid === handshake.uuid)
    .sort((a, b) => (b.receivedAt || 0) - (a.receivedAt || 0));

  if (peerHistory.length === 0) {
    // First time seeing this peer — can't verify ledge, but not a fail
    return {
      ok:     true,
      score:  1,
      reason: 'ledge: first contact (no history)',
      firstContact: true,
    };
  }

  // Check most recent known chain head
  const lastEntry = peerHistory[0];
  const lastSeq   = lastEntry.ledger?.seq || lastEntry.seq || 0;

  // Their new seq must be >= last known seq (chain only grows)
  const reportedSeq = handshake.ledgerSeq || 0;
  if (reportedSeq < lastSeq) {
    return {
      ok:     false,
      score:  0,
      reason: `ledge symbol: seq regression (reported ${reportedSeq} < known ${lastSeq}) — possible rollback attack`,
      sybilSuspect: true,
    };
  }

  return {
    ok:          true,
    score:       2,
    reason:      'ledge:ok',
    knownSince:  lastEntry.receivedAt,
    priorContacts: peerHistory.length,
  };
}

// ─── Full Symbol Detection ───────────────────────────────────────────────────
/**
 * Run all 4 symbol layers against an incoming peer.
 *
 * @param {object} handshake      — peer handshake + cobalt fields
 * @param {object} opts
 * @param {function} opts.verifyHandshakeFn
 * @param {object}  opts.healthData        — parsed /health from peer (optional)
 * @param {object}  opts.ledgerLock        — our LedgerLock instance
 * @param {Array}   opts.globalLedgerEntries
 * @param {boolean} opts.requireCobalt     — if true, score < 7 = reject
 *
 * @returns {{ admit, score, maxScore, symbols, reasons }}
 */
function detectSymbols(handshake, opts = {}) {
  const {
    verifyHandshakeFn,
    healthData        = null,
    ledgerLock        = null,
    globalLedgerEntries = [],
    requireCobalt     = true,
  } = opts;

  const symbols  = {};
  const reasons  = [];
  let   score    = 0;
  const MAX      = 12;

  // Layer 1 — Identity (hard gate)
  const idResult = detectIdentitySymbol(handshake, { verifyHandshakeFn });
  symbols.identity = idResult;
  if (!idResult.ok) {
    return {
      admit:   false,
      score:   0,
      maxScore: MAX,
      symbols,
      reasons: [idResult.reason],
      hardReject: true,
    };
  }
  score += idResult.score;
  reasons.push(idResult.reason);

  const peerPublicKey = idResult.publicKey;

  // Layer 2 — Structural
  if (healthData) {
    const structResult = detectStructuralSymbol(healthData);
    symbols.structural = structResult;
    score += structResult.score;
    reasons.push(structResult.reason);
  } else {
    symbols.structural = { ok: false, score: 0, reason: 'structural: no health data provided' };
    reasons.push('structural:skipped');
  }

  // Layer 3 — Cobalt
  const cobaltResult = detectCobaltSymbol(handshake, peerPublicKey, { ledgerLock });
  symbols.cobalt = cobaltResult;
  score += cobaltResult.score;
  reasons.push(cobaltResult.reason);

  // Layer 4 — Ledge
  const ledgeResult = detectLedgeSymbol(handshake, { globalLedgerEntries });
  symbols.ledge = ledgeResult;
  score += ledgeResult.score;
  reasons.push(ledgeResult.reason);

  // ── Decision ──────────────────────────────────────────────────────────────
  const COBALT_THRESHOLD   = 7;   // requires identity + cobalt at minimum
  const STANDARD_THRESHOLD = 4;   // requires identity only (non-cobalt mesh)

  const threshold = requireCobalt ? COBALT_THRESHOLD : STANDARD_THRESHOLD;
  const admit     = score >= threshold;

  return {
    admit,
    score,
    maxScore:   MAX,
    threshold,
    symbols,
    reasons,
    sybilSuspect: ledgeResult.sybilSuspect || false,
    uuid:         idResult.uuid,
  };
}

module.exports = {
  detectSymbols,
  detectIdentitySymbol,
  detectStructuralSymbol,
  detectCobaltSymbol,
  detectLedgeSymbol,
  VERSION,
  MODULE_UUID,
};
