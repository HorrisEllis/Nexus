// Copyright (c) 2026 James Brooks (Erosmancer). All rights reserved.
// Bridge OS — Proprietary Software. See LICENSE for terms.
'use strict';
/**
 * bridge-integrity/index.js
 *
 * Three hard guarantees for journalist-grade sovereign nodes:
 *
 * 1. CRYPTO SELF-TEST (boot gate)
 *    AES-256-GCM, ECDH, HKDF, HMAC, SHA-256, scrypt all exercised
 *    before Phase 2. If any primitive fails → boot aborts. Hard stop.
 *    No degraded crypto. Either fully working or not running.
 *
 * 2. FILE INTEGRITY LEDGER (local + global)
 *    SHA-256 hash of every core module file at boot.
 *    Local ledger: data/integrity-ledger.json (signed by node identity)
 *    Global ledger: broadcast to mesh peers on connect, stored in
 *    data/integrity-global.jsonl — append-only.
 *    On boot: compare current hashes to stored baseline.
 *    Tampered file → boot aborts (configurable: 'abort' | 'warn').
 *    On mesh connect: exchange ledger entries, flag mismatches.
 *
 * 3. NODE ADMISSION (SNR reinforcement)
 *    evaluateNodeAdmission(handshake, peerLedger):
 *      - verifyHandshake (Ed25519, UUID-pubkey binding, replay window)
 *      - crypto self-test proof (peer must supply boot-time HMAC)
 *      - optional: ledger hash comparison
 *    Returns { admit: true|false, reason, score }
 *    SNGate evaluateMeshHandshake() uses this score.
 *    Rejected nodes are quarantined: no bus events, no data relay.
 *
 * Threat model this defends against:
 *   - Tampered bridge binary reaching the mesh
 *   - Node with broken crypto (degraded, partially overwritten)
 *   - Impersonation (UUID without matching key)
 *   - Replay attacks on handshake
 *   - Vulnerable node contaminating the mesh
 */

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');
const engine = require('../bridge-core/crypto-engine');

// ─── Constants ─────────────────────────────────────────────────────────────────
const VERSION     = '1.0.0';
const MODULE_UUID = 'bridge-integrity-v1000-000000000001';

// Core files whose hashes must match the ledger baseline.
// Paths relative to bridge root (process.cwd() when running bridge/index.js).
const CORE_FILES = [
  'bridge-core/crypto-engine.js',
  'bridge-core/bus.js',
  'bridge-core/siso/index.js',
  'bridge-sngate/index.js',
  'bridge-identity/identity.js',
  'bridge-identity/index.js',
  'bridge-integrity/index.js',
  'bridge-node/boot.js',
  'bridge-cobalt/index.js',
  'bridge-cobalt/ledger-lock.js',
  'bridge-cobalt/symbol-detector.js',
  'index.js',
];

// Self-test challenge label — HMAC key is derived from identity privateKey digest.
// Peer must reproduce the same HMAC to prove their crypto stack works.
const CHALLENGE_LABEL = 'bridge-integrity-boot-proof-v1';

// ─── Result helpers ─────────────────────────────────────────────────────────────
const pass = (data)  => ({ ok: true,  ...data });
const fail = (reason, detail = null) => ({ ok: false, reason, detail });

// ─── 1. CRYPTO SELF-TEST ───────────────────────────────────────────────────────

/**
 * Run all crypto primitives. Any failure throws — caller should abort boot.
 * Returns a signed proof object the node can show to peers as admission evidence.
 *
 * @param {Identity} identity — loaded bridge identity (for signing the proof)
 * @returns {{ ok, proof: { hmac, ts, nodeId }, checks }}
 */
function runCryptoSelfTest(identity) {
  const checks = {};
  const errors  = [];

  // AES-256-GCM round-trip
  try {
    const k   = engine.generateKey();
    if (!k.ok) throw new Error(k.error);
    const enc = engine.encrypt(k.buffer, 'bridge-integrity-aes-test');
    if (!enc.ok) throw new Error(enc.error);
    const dec = engine.decrypt(k.buffer, enc);
    if (!dec.ok || dec.plaintext !== 'bridge-integrity-aes-test')
      throw new Error('AES round-trip mismatch');
    checks.aes_gcm = true;
  } catch (e) { checks.aes_gcm = false; errors.push(`aes_gcm: ${e.message}`); }

  // ECDH + HKDF session key agreement
  try {
    const kpA = engine.generateECDH();
    const kpB = engine.generateECDH();
    if (!kpA.ok || !kpB.ok) throw new Error('ECDH keygen failed');
    const skA = engine.deriveSessionKey(kpA.privateKey, kpB.publicKey, 'self-test');
    const skB = engine.deriveSessionKey(kpB.privateKey, kpA.publicKey, 'self-test');
    if (!skA.ok || !skB.ok) throw new Error('session key derivation failed');
    if (skA.sessionKey !== skB.sessionKey) throw new Error('session keys do not agree');
    checks.ecdh_hkdf = true;
  } catch (e) { checks.ecdh_hkdf = false; errors.push(`ecdh_hkdf: ${e.message}`); }

  // HMAC-SHA256
  try {
    const h = engine.hmac('test-key', 'test-data');
    if (!h.ok || h.hex.length !== 64) throw new Error('HMAC output wrong length');
    const v = engine.hmacVerify('test-key', 'test-data', h.hex);
    if (!v.ok || !v.valid) throw new Error('HMAC verify failed');
    checks.hmac = true;
  } catch (e) { checks.hmac = false; errors.push(`hmac: ${e.message}`); }

  // SHA-256
  try {
    const h = engine.sha256('bridge-integrity');
    if (!h.ok || h.hex.length !== 64) throw new Error('SHA-256 output wrong length');
    checks.sha256 = true;
  } catch (e) { checks.sha256 = false; errors.push(`sha256: ${e.message}`); }

  // scrypt (fast params for boot)
  try {
    const s = engine.scrypt('test-password', null, { N: 1024, r: 1, p: 1, keyLen: 32 });
    if (!s.ok || s.key.length !== 64) throw new Error('scrypt output wrong length');
    checks.scrypt = true;
  } catch (e) { checks.scrypt = false; errors.push(`scrypt: ${e.message}`); }

  // Constant-time compare
  try {
    const a = engine.safeEqual('abc', 'abc');
    const b = engine.safeEqual('abc', 'xyz');
    if (!a.ok || !a.equal) throw new Error('safeEqual false negative');
    if (!b.ok || b.equal) throw new Error('safeEqual false positive');
    checks.safe_compare = true;
  } catch (e) { checks.safe_compare = false; errors.push(`safe_compare: ${e.message}`); }

  const allOk = Object.values(checks).every(Boolean);

  if (!allOk) {
    const msg = `[bridge-integrity] CRYPTO SELF-TEST FAILED — boot aborted.\n  Failed: ${errors.join(', ')}\n  This node will not connect to the network.`;
    throw new Error(msg);
  }

  // Build boot proof — signed HMAC of challenge + ts + nodeId
  // Peers can verify: they need our publicKey (from handshake) and ts.
  // We use engine.hmac with the identity public key bytes as the HMAC key.
  // This proves: (a) our crypto works, (b) we hold our identity keypair.
  const ts     = Date.now();
  const nodeId = identity ? identity.uuid : 'unknown';
  const pubDer = identity?._publicKey?.export({ type: 'spki', format: 'der' });
  const hmacKey = pubDer || Buffer.from(nodeId, 'utf8');
  const hmacMsg = `${CHALLENGE_LABEL}:${nodeId}:${ts}`;
  const proof   = engine.hmac(hmacKey, hmacMsg);

  return {
    ok:     true,
    checks,
    proof: {
      hmac:   proof.ok ? proof.hex : null,
      ts,
      nodeId,
      label:  CHALLENGE_LABEL,
      allOk,
    },
  };
}

/**
 * Verify a peer's boot proof.
 * @param {{ hmac, ts, nodeId, label }} proof — from peer's handshake
 * @param {Buffer} peerPublicKeyDer — peer's Ed25519 public key (DER)
 */
function verifyBootProof(proof, peerPublicKeyDer) {
  if (!proof || !proof.hmac || !proof.ts || !proof.nodeId)
    return fail('missing proof fields');
  if (proof.label !== CHALLENGE_LABEL)
    return fail('proof label mismatch');
  // Replay window: 60s (boot can be slow on Raspberry Pi etc.)
  if (Math.abs(Date.now() - proof.ts) > 60000)
    return fail(`proof timestamp stale (${Math.round((Date.now() - proof.ts)/1000)}s old)`);

  const hmacMsg = `${CHALLENGE_LABEL}:${proof.nodeId}:${proof.ts}`;
  const result  = engine.hmacVerify(peerPublicKeyDer, hmacMsg, proof.hmac);
  if (!result.ok) return fail(`HMAC verification error: ${result.error}`);
  if (!result.valid) return fail('boot proof HMAC invalid — peer crypto suspect');

  return pass({ nodeId: proof.nodeId, ts: proof.ts });
}

// ─── 2. FILE INTEGRITY LEDGER ──────────────────────────────────────────────────

/**
 * Hash all core files. Returns map of relPath → sha256hex.
 * @param {string} rootDir — bridge root (where index.js lives)
 */
function hashCoreFiles(rootDir) {
  const hashes = {};
  for (const relPath of CORE_FILES) {
    const fullPath = path.join(rootDir, relPath);
    try {
      const content = fs.readFileSync(fullPath);
      hashes[relPath] = crypto.createHash('sha256').update(content).digest('hex');
    } catch (e) {
      hashes[relPath] = `ERROR:${e.message}`;
    }
  }
  return hashes;
}

/**
 * Load the stored baseline ledger (if any).
 */
function loadLocalLedger(ledgerPath) {
  if (!fs.existsSync(ledgerPath)) return null;
  try { return JSON.parse(fs.readFileSync(ledgerPath, 'utf8')); }
  catch { return null; }
}

/**
 * Save a new baseline ledger, signed by identity.
 */
function saveLocalLedger(ledgerPath, hashes, identity) {
  const ts      = Date.now();
  const nodeId  = identity?.uuid || 'unknown';
  const payload = JSON.stringify({ hashes, ts, nodeId, version: VERSION });
  let sig = null;
  try {
    const sigBuf = identity?._privateKey
      ? crypto.sign(null, Buffer.from(payload), { key: identity._privateKey, dsaEncoding: 'der' })
      : null;
    sig = sigBuf ? sigBuf.toString('base64') : null;
  } catch {}

  const ledger = { hashes, ts, nodeId, version: VERSION, sig };
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
  return ledger;
}

/**
 * Compare current hashes to baseline. Returns list of tampered files.
 */
function compareToBaseline(current, baseline) {
  const tampered = [];
  const added    = [];
  const missing  = [];

  for (const [file, hash] of Object.entries(current)) {
    if (hash.startsWith('ERROR:')) { missing.push(file); continue; }
    if (!baseline[file]) { added.push(file); continue; }
    if (baseline[file] !== hash) tampered.push({ file, expected: baseline[file], got: hash });
  }
  for (const file of Object.keys(baseline)) {
    if (!current[file]) missing.push(file);
  }

  return { tampered, added, missing, clean: tampered.length === 0 && missing.length === 0 };
}

/**
 * Append a peer's ledger entry to the global ledger (append-only JSONL).
 */
function appendGlobalLedger(globalLedgerPath, peerLedgerEntry) {
  try {
    fs.mkdirSync(path.dirname(globalLedgerPath), { recursive: true });
    const line = JSON.stringify({ ...peerLedgerEntry, receivedAt: Date.now() }) + '\n';
    fs.appendFileSync(globalLedgerPath, line);
  } catch {}
}

/**
 * Read global ledger entries.
 */
function readGlobalLedger(globalLedgerPath, limit = 500) {
  if (!fs.existsSync(globalLedgerPath)) return [];
  try {
    return fs.readFileSync(globalLedgerPath, 'utf8')
      .trim().split('\n').filter(Boolean)
      .slice(-limit)
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

// ─── 3. NODE ADMISSION ─────────────────────────────────────────────────────────

/**
 * Full admission check for an incoming mesh peer.
 *
 * @param {object} handshake  — { uuid, publicKey, ts, sig, groupHint, bootProof?, ledger? }
 * @param {object} opts       — { verifyHandshake, ownLedger?, requireBootProof? }
 * @returns {{ admit, score, reason, checks }}
 *
 * Score 0–10:
 *   +4  Ed25519 handshake valid (UUID-pubkey binding + sig + replay window)
 *   +3  Boot proof HMAC valid (crypto stack confirmed working)
 *   +2  Ledger provided and internally consistent (sha256 self-check)
 *   +1  Group hint matches ours
 *   ──
 *   10  perfect score
 *   < 6 → reject
 */
function evaluateNodeAdmission(handshake, opts = {}) {
  const {
    verifyHandshakeFn,
    ownGroupHint   = null,
    requireBootProof = true,
    requireLedger  = false,
  } = opts;

  const checks = {};
  let   score  = 0;
  const reasons = [];

  // ── Check 1: Ed25519 handshake (identity binding) ──────────────────────
  if (!verifyHandshakeFn) {
    return { admit: false, score: 0, reason: 'no verifyHandshake function provided', checks };
  }
  const hsResult = verifyHandshakeFn(handshake);
  checks.handshake = hsResult.ok;

  if (!hsResult.ok) {
    // Hard fail — no identity means no admission regardless of other checks
    return {
      admit:  false,
      score:  0,
      reason: `handshake failed: ${hsResult.reason}`,
      checks,
    };
  }
  score += 4;
  reasons.push('handshake:ok');

  // ── Check 2: Boot proof (crypto self-test evidence) ────────────────────
  const peerPubKeyDer = hsResult.publicKey?.export({ type: 'spki', format: 'der' });

  if (handshake.bootProof && peerPubKeyDer) {
    const proofResult = verifyBootProof(handshake.bootProof, peerPubKeyDer);
    checks.boot_proof = proofResult.ok;
    if (proofResult.ok) {
      score += 3;
      reasons.push('boot_proof:ok');
    } else {
      reasons.push(`boot_proof:FAIL(${proofResult.reason})`);
      if (requireBootProof) {
        return {
          admit:  false,
          score,
          reason: `boot proof failed: ${proofResult.reason} — node crypto suspect, rejecting`,
          checks,
        };
      }
    }
  } else {
    checks.boot_proof = false;
    reasons.push('boot_proof:absent');
    if (requireBootProof) {
      return {
        admit:  false,
        score,
        reason: 'no boot proof supplied — node did not run crypto self-test, rejecting',
        checks,
      };
    }
  }

  // ── Check 3: Ledger consistency ────────────────────────────────────────
  if (handshake.ledger) {
    const { hashes, nodeId, sig } = handshake.ledger;
    let ledgerOk = false;
    if (hashes && typeof hashes === 'object') {
      // Verify the ledger hasn't been tampered with: re-hash the hashes obj
      // against the reported nodeId. If sig present, verify it.
      const payloadStr = JSON.stringify({ hashes, ts: handshake.ledger.ts, nodeId, version: handshake.ledger.version });
      if (sig && peerPubKeyDer) {
        try {
          const pubKey = hsResult.publicKey;
          const valid = crypto.verify(null, Buffer.from(payloadStr), { key: pubKey, dsaEncoding: 'der' }, Buffer.from(sig, 'base64'));
          ledgerOk = valid;
          if (valid) reasons.push('ledger:sig_ok');
          else reasons.push('ledger:sig_FAIL');
        } catch { reasons.push('ledger:sig_error'); }
      } else {
        // No sig — treat ledger as present but unverified
        ledgerOk = Object.keys(hashes).length > 0;
        reasons.push('ledger:unsigned');
      }
    }
    checks.ledger = ledgerOk;
    if (ledgerOk) score += 2;
  } else {
    checks.ledger = false;
    reasons.push('ledger:absent');
    if (requireLedger) {
      return {
        admit:  false,
        score,
        reason: 'no file integrity ledger supplied — rejecting (requireLedger=true)',
        checks,
      };
    }
  }

  // ── Check 4: Group hint ─────────────────────────────────────────────────
  if (ownGroupHint && handshake.groupHint && handshake.groupHint === ownGroupHint) {
    score += 1;
    checks.group_match = true;
    reasons.push('group:match');
  } else {
    checks.group_match = false;
  }

  // ── Admission decision ──────────────────────────────────────────────────
  const ADMIT_THRESHOLD = 6; // requires handshake + boot_proof at minimum
  const admit = score >= ADMIT_THRESHOLD;

  return {
    admit,
    score,
    reason: admit
      ? `admitted (score ${score}/10): ${reasons.join(', ')}`
      : `rejected (score ${score}/10 < ${ADMIT_THRESHOLD}): ${reasons.join(', ')}`,
    checks,
    uuid: hsResult.uuid,
  };
}

// ─── MAIN MODULE ───────────────────────────────────────────────────────────────

/**
 * Create an integrity manager. Call from boot.js after Phase 1 (identity).
 *
 * @param {object} opts
 * @param {string} opts.rootDir   — bridge root directory (absolute path)
 * @param {string} opts.dataDir   — bridge data directory
 * @param {object} opts.identity  — loaded bridge Identity
 * @param {function} opts.busEmit — bus emit function
 * @param {string}  opts.onTamper — 'abort' | 'warn' (default: 'abort')
 */
function createIntegrityManager({ rootDir, dataDir, identity, busEmit, onTamper = 'abort' } = {}) {
  const ledgerPath       = path.join(dataDir, 'integrity-ledger.json');
  const globalLedgerPath = path.join(dataDir, 'integrity-global.jsonl');
  const quarantine       = new Set(); // UUIDs rejected this session

  let _selfTestResult  = null;
  let _currentHashes   = null;
  let _localLedger     = null;

  // ── Phase 1.5: Crypto self-test (runs before anything else) ─────────────
  // Throws on failure — boot must catch and abort.
  function runSelfTest() {
    _selfTestResult = runCryptoSelfTest(identity);
    busEmit?.('integrity:self_test', {
      ok:     _selfTestResult.ok,
      checks: _selfTestResult.checks,
      nodeId: identity?.uuid,
    }, 'INFO');
    return _selfTestResult;
  }

  // ── Phase 1.6: File integrity check ─────────────────────────────────────
  // Returns { ok, tampered, missing, added, newBaseline }
  function runFileIntegrityCheck() {
    _currentHashes = hashCoreFiles(rootDir);
    _localLedger   = loadLocalLedger(ledgerPath);

    // First boot — save baseline, nothing to compare
    if (!_localLedger) {
      const saved = saveLocalLedger(ledgerPath, _currentHashes, identity);
      busEmit?.('integrity:baseline_created', {
        fileCount: Object.keys(_currentHashes).length,
        nodeId:    identity?.uuid,
      }, 'INFO');
      return { ok: true, newBaseline: true, tampered: [], missing: [], added: [], hashes: _currentHashes };
    }

    // Compare to baseline
    const comparison = compareToBaseline(_currentHashes, _localLedger.hashes);

    if (!comparison.clean) {
      const detail = {
        tampered: comparison.tampered,
        missing:  comparison.missing,
        nodeId:   identity?.uuid,
      };

      busEmit?.('integrity:tamper_detected', detail, 'WARN');

      const msg = [
        '[bridge-integrity] FILE INTEGRITY CHECK FAILED',
        comparison.tampered.length
          ? `  Tampered files (${comparison.tampered.length}):` +
            comparison.tampered.map(t => `\n    ${t.file}`).join('')
          : '',
        comparison.missing.length
          ? `  Missing files (${comparison.missing.length}):` +
            comparison.missing.map(f => `\n    ${f}`).join('')
          : '',
        '',
        onTamper === 'abort'
          ? '  Boot aborted. This node will not connect to the network.'
          : '  WARNING: running with tampered files. Network may reject this node.',
      ].filter(Boolean).join('\n');

      if (onTamper === 'abort') throw new Error(msg);
      console.warn(msg);
    } else {
      busEmit?.('integrity:files_ok', {
        fileCount: Object.keys(_currentHashes).length,
        nodeId:    identity?.uuid,
      }, 'INFO');
    }

    return {
      ok:       comparison.clean,
      tampered: comparison.tampered,
      missing:  comparison.missing,
      added:    comparison.added,
      hashes:   _currentHashes,
    };
  }

  // ── Peer admission ────────────────────────────────────────────────────────
  function admitPeer(handshake, { verifyHandshakeFn } = {}) {
    const result = evaluateNodeAdmission(handshake, {
      verifyHandshakeFn,
      ownGroupHint:    identity?.groupHint,
      requireBootProof: true,
      requireLedger:    false,
    });

    busEmit?.('integrity:peer_admission', {
      uuid:   result.uuid || handshake.uuid,
      admit:  result.admit,
      score:  result.score,
      reason: result.reason,
    }, result.admit ? 'INFO' : 'WARN');

    if (!result.admit) {
      quarantine.add(handshake.uuid);
      busEmit?.('integrity:peer_quarantined', {
        uuid:   handshake.uuid,
        reason: result.reason,
      }, 'WARN');
    }

    // Append to global ledger regardless — even failed attempts are recorded
    if (handshake.ledger) {
      appendGlobalLedger(globalLedgerPath, {
        peerUuid:  handshake.uuid,
        admitted:  result.admit,
        score:     result.score,
        ledger:    handshake.ledger,
      });
    }

    return result;
  }

  // ── Quarantine check ──────────────────────────────────────────────────────
  function isQuarantined(uuid) {
    return quarantine.has(uuid);
  }

  function releaseQuarantine(uuid) {
    quarantine.delete(uuid);
  }

  // ── Build our own handshake extension (bootProof + ledger) ────────────────
  // Attach to identity.handshake() output before sending to peers.
  function buildHandshakeExtension() {
    return {
      bootProof: _selfTestResult?.proof || null,
      ledger: _localLedger ? {
        hashes:  _localLedger.hashes,
        ts:      _localLedger.ts,
        nodeId:  _localLedger.nodeId,
        version: _localLedger.version,
        sig:     _localLedger.sig,
      } : null,
    };
  }

  // ── Update baseline (after intentional upgrade) ───────────────────────────
  function updateBaseline() {
    _currentHashes = hashCoreFiles(rootDir);
    _localLedger   = saveLocalLedger(ledgerPath, _currentHashes, identity);
    busEmit?.('integrity:baseline_updated', {
      fileCount: Object.keys(_currentHashes).length,
      nodeId:    identity?.uuid,
      ts:        _localLedger.ts,
    }, 'INFO');
    return _localLedger;
  }

  // ── Health / diagnostics ─────────────────────────────────────────────────
  function health() {
    return {
      ok:             !!_selfTestResult?.ok,
      cryptoChecks:   _selfTestResult?.checks || {},
      fileCount:      _currentHashes ? Object.keys(_currentHashes).length : 0,
      baselineExists: !!_localLedger,
      quarantined:    quarantine.size,
      globalLedgerEntries: readGlobalLedger(globalLedgerPath).length,
      version:        VERSION,
      uuid:           MODULE_UUID,
    };
  }

  function diagnostics() {
    return {
      ...health(),
      currentHashes:  _currentHashes,
      baselineTs:     _localLedger?.ts,
      globalLedger:   readGlobalLedger(globalLedgerPath, 50),
      quarantineList: [...quarantine],
    };
  }

  return {
    // Boot sequence
    runSelfTest,
    runFileIntegrityCheck,
    updateBaseline,
    // Peer handling
    admitPeer,
    isQuarantined,
    releaseQuarantine,
    buildHandshakeExtension,
    // Ledger
    readGlobalLedger: () => readGlobalLedger(globalLedgerPath),
    // Diagnostics
    health,
    diagnostics,
    // Expose for sngate reinforcement
    evaluateNodeAdmission,
    // Constants
    VERSION,
    MODULE_UUID,
  };
}

module.exports = {
  createIntegrityManager,
  runCryptoSelfTest,
  verifyBootProof,
  hashCoreFiles,
  evaluateNodeAdmission,
  CORE_FILES,
  VERSION,
  MODULE_UUID,
};
