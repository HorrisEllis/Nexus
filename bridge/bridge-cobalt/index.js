// Copyright (c) 2026 James Brooks (Erosmancer). All rights reserved.
// Bridge OS — Proprietary Software. See LICENSE for terms.
// rheon.world · github.com/HorrisEllis/Bridge-v2
'use strict';
/**
 * bridge-cobalt/index.js   v1.0.0
 *
 * COBALT CORE — Sealed Boot Lock + Network Rejection Enforcement
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  WHAT THIS DOES                                                     │
 * │                                                                     │
 * │  Ensures the boot sequence is cryptographically permanent.          │
 * │  Once a node boots with Cobalt Core:                                │
 * │                                                                     │
 * │  1. Every boot event is written to a chained, signed ledger.        │
 * │     You cannot alter boot history without breaking the chain.       │
 * │                                                                     │
 * │  2. The node generates a signed Boot Token encoding:                │
 * │     identity + crypto proof + file hashes + ledger chain head.      │
 * │     This token is presented to every peer on connect.               │
 * │                                                                     │
 * │  3. Peers that CANNOT present a valid Boot Token are REJECTED       │
 * │     by the SNGate before they touch the bus or data layer.          │
 * │     No token = no admission. No exceptions.                         │
 * │                                                                     │
 * │  4. Symbol detection runs on every peer handshake — 4 layers:      │
 * │     identity → structural → cobalt → ledge.                         │
 * │     Score < 7/12 = quarantine. Sybil suspects = instant deny.      │
 * │                                                                     │
 * │  This is the Cobalt Core. It cannot be reconfigured at runtime.     │
 * │  Changing these files breaks your own chain. The network rejects    │
 * │  you. There is no override. That's the point.                       │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Usage in boot.js (after Phase 1.6 file integrity):
 *
 *   const cobalt = createCobaltCore({ identity, dataDir, busEmit });
 *   const bootResult = await cobalt.runBootSequence({ cryptoProof, fileHashes, fileCount });
 *   // bootResult.bootToken → attach to all outbound handshakes
 *   // cobalt.admitPeer(handshake, opts) → replaces integrityManager.admitPeer
 *   // Mount cobalt.route() under /cobalt in HTTP server
 */

const { createLedgerLock }   = require('./ledger-lock');
const { detectSymbols }      = require('./symbol-detector');

const VERSION     = '1.0.0';
const MODULE_UUID = 'bridge-cobalt-core-v1000-000000000001';

// ─── Cobalt Core ─────────────────────────────────────────────────────────────
function createCobaltCore({ identity, dataDir, busEmit } = {}) {
  const ledgerLock  = createLedgerLock({ dataDir, identity });
  const quarantine  = new Map();   // uuid → { ts, reason, score }
  let   _bootToken  = null;
  let   _bootSealed = false;
  let   _startTs    = Date.now();

  // ── Step 1: Load existing ledger (called at start of boot) ─────────────
  function loadLedger() {
    const result = ledgerLock.load();

    if (!result.ok) {
      // Chain is broken — this is a hard error
      const msg = `[cobalt-core] LEDGER CHAIN BROKEN: ${result.reason}` +
        `\n  This node's boot history has been tampered with.` +
        `\n  The network will reject this node until the chain is repaired.`;

      busEmit?.('cobalt:chain:broken', {
        reason: result.reason,
        brokenAt: result.brokenAt,
        nodeId: identity?.uuid,
      }, 'WARN');

      // Log but don't abort — integrity will catch the file hash on top of this
      console.warn(`\x1b[91m${msg}\x1b[0m`);
    } else {
      busEmit?.('cobalt:ledger:loaded', {
        entries: result.entries,
        nodeId: identity?.uuid,
      }, 'DEBUG');
    }

    ledgerLock.append('cobalt:boot:started', {
      version:   VERSION,
      nodeId:    identity?.uuid,
      ts:        _startTs,
      ledgerOk:  result.ok,
      priorBoots: result.entries,
    });

    return result;
  }

  // ── Step 2: Seal the boot session ─────────────────────────────────────
  // Called after Phase 1.6 with the integrity manager's results.
  // This is the point of no return — the boot is committed to the chain.
  async function runBootSequence({ cryptoProof, fileHashes, fileCount } = {}) {
    if (_bootSealed) {
      throw new Error('[cobalt-core] Boot already sealed — cannot re-run boot sequence');
    }

    const seal = ledgerLock.sealBoot({ cryptoProof, fileHashes, fileCount });
    _bootToken = seal;
    _bootSealed = true;

    busEmit?.('cobalt:boot:sealed', {
      nodeId:    identity?.uuid,
      chainHead: ledgerLock.getChainHead().slice(0, 16),
      fileCount,
      hasCryptoProof: !!cryptoProof?.hmac,
    }, 'INFO');

    return {
      ok:         true,
      bootToken:  seal.encoded,
      chainHead:  ledgerLock.getChainHead(),
      ledgerSeq:  ledgerLock.diagnostics().seq,
    };
  }

  // ── Peer admission (replaces integrity.admitPeer for Cobalt mesh) ─────
  function admitPeer(handshake, opts = {}) {
    const {
      verifyHandshakeFn,
      healthData          = null,
      requireCobalt       = true,
    } = opts;

    const globalEntries = ledgerLock.getEntries()
      .filter(e => e.event === 'cobalt:peer:seen');

    const result = detectSymbols(handshake, {
      verifyHandshakeFn,
      healthData,
      ledgerLock,
      globalLedgerEntries: globalEntries,
      requireCobalt,
    });

    const admission = {
      admit:  result.admit,
      score:  result.score,
      max:    result.maxScore,
      uuid:   result.uuid || handshake.uuid,
      reason: result.admit
        ? `cobalt:admitted (${result.score}/${result.maxScore}): ${result.reasons.join(' · ')}`
        : `cobalt:rejected (${result.score}/${result.maxScore}): ${result.reasons.join(' · ')}`,
      symbols:      result.symbols,
      sybilSuspect: result.sybilSuspect,
    };

    busEmit?.('cobalt:peer:admission', admission, result.admit ? 'INFO' : 'WARN');

    if (!result.admit) {
      const ttl = result.sybilSuspect ? 30 * 60 * 1000 : 5 * 60 * 1000;
      quarantine.set(handshake.uuid, {
        ts:      Date.now(),
        reason:  admission.reason,
        score:   result.score,
        ttl,
        sybil:   result.sybilSuspect,
      });

      busEmit?.('cobalt:peer:quarantined', {
        uuid:   handshake.uuid,
        reason: admission.reason,
        sybil:  result.sybilSuspect,
        ttl:    Math.round(ttl / 60000) + 'min',
      }, 'WARN');

      ledgerLock.append('cobalt:peer:rejected', {
        uuid:    handshake.uuid,
        score:   result.score,
        sybil:   result.sybilSuspect,
        reasons: result.reasons,
      });
    } else {
      ledgerLock.append('cobalt:peer:seen', {
        uuid:      handshake.uuid,
        score:     result.score,
        chainHead: handshake.chainHead,
        ledgerSeq: handshake.ledgerSeq,
      });
    }

    return admission;
  }

  // ── Quarantine management ─────────────────────────────────────────────
  function isQuarantined(uuid) {
    const entry = quarantine.get(uuid);
    if (!entry) return false;
    if (Date.now() - entry.ts > entry.ttl) {
      quarantine.delete(uuid);
      return false;
    }
    return true;
  }

  function releaseQuarantine(uuid) {
    quarantine.delete(uuid);
    ledgerLock.append('cobalt:peer:released', { uuid });
  }

  // ── Build our outbound handshake extension ─────────────────────────────
  // Attach this to every peer connect / identity.handshake() before sending.
  function buildHandshakeExtension() {
    return {
      bootToken:  _bootToken?.encoded  || null,
      chainHead:  ledgerLock.getChainHead(),
      ledgerSeq:  ledgerLock.diagnostics().seq,
      cobaltVersion: VERSION,
    };
  }

  // ── SNGate integration ─────────────────────────────────────────────────
  // Install a deny rule that rejects peers without a valid boot token.
  // Call this after sngate is ready (Phase 4).
  function installSNGateRule(gate) {
    if (!gate?.rules?.add) {
      console.warn('[cobalt-core] SNGate not available — boot token enforcement disabled');
      return null;
    }

    const ruleId = gate.rules.add({
      type:    'cobalt:no-boot-token',
      action:  'deny',
      surface: 'mesh',
      value:   'missing',
      _cobalt: true,
      _desc:   'Reject any mesh peer that did not present a valid Cobalt boot token',
    });

    busEmit?.('cobalt:sngate:rule:installed', { ruleId }, 'INFO');
    return ruleId;
  }

  // ── HTTP route handler ─────────────────────────────────────────────────
  function route(method, urlParts, body) {
    const sub = urlParts[1];

    if (method === 'GET' && !sub) {
      return {
        ok:           true,
        cobalt:       diagnostics(),
        bootToken:    _bootToken?.token
          ? { ...(_bootToken.token), sig: '[redacted]' }
          : null,
        chainHead:    ledgerLock.getChainHead(),
      };
    }

    if (method === 'GET' && sub === 'ledger') {
      const entries = ledgerLock.getEntries();
      return {
        ok:      true,
        entries: entries.slice(-50),   // last 50
        total:   entries.length,
        chainHead: ledgerLock.getChainHead(),
      };
    }

    if (method === 'GET' && sub === 'chain') {
      return { ok: true, ...ledgerLock.verifyChain() };
    }

    if (method === 'GET' && sub === 'quarantine') {
      const list = [];
      for (const [uuid, entry] of quarantine) {
        list.push({ uuid, ...entry, age: Math.round((Date.now() - entry.ts) / 1000) + 's' });
      }
      return { ok: true, quarantine: list, count: list.length };
    }

    if (method === 'POST' && sub === 'release' && body?.uuid) {
      releaseQuarantine(body.uuid);
      return { ok: true, released: body.uuid };
    }

    if (method === 'POST' && sub === 'verify' && body?.bootToken) {
      // Verify a raw boot token submitted externally (dev/debug)
      if (!body.publicKey) return { ok: false, error: 'publicKey required' };
      const result = ledgerLock.verifyPeerToken(body.bootToken, body.publicKey);
      return { ok: result.ok, ...result };
    }

    return null; // Unknown route
  }

  // ── Diagnostics ───────────────────────────────────────────────────────
  function diagnostics() {
    return {
      version:       VERSION,
      uuid:          MODULE_UUID,
      bootSealed:    _bootSealed,
      uptime:        Math.round((Date.now() - _startTs) / 1000) + 's',
      quarantine:    quarantine.size,
      ledger:        ledgerLock.diagnostics(),
      nodeId:        identity?.uuid || 'unknown',
    };
  }

  function health() {
    return {
      ok:         _bootSealed,
      bootSealed: _bootSealed,
      quarantine: quarantine.size,
      chainOk:    ledgerLock.verifyChain().ok,
      version:    VERSION,
    };
  }

  return {
    // Boot sequence
    loadLedger,
    runBootSequence,
    // Peer handling
    admitPeer,
    isQuarantined,
    releaseQuarantine,
    buildHandshakeExtension,
    // SNGate integration
    installSNGateRule,
    // HTTP
    route,
    // Diagnostics
    diagnostics,
    health,
    // Expose internals for boot.js wiring
    ledgerLock,
    // Constants
    VERSION,
    MODULE_UUID,
  };
}

module.exports = {
  createCobaltCore,
  VERSION,
  MODULE_UUID,
};
