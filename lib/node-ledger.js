'use strict';
/**
 * lib/node-ledger.js — Node Identity Ledger
 * UUID: nexus-node-ledger-v1-0000-4000-0000-000000000001
 *
 * Persistent record of every node ever seen by this system.
 * The ledger is the source of truth for node identity and trust.
 *
 * Trust state machine:
 *   UNKNOWN   → heard a pulse, UUID not previously seen
 *   CANDIDATE → N consistent pulses, public key stable, handshake pending
 *   MEMBER    → handshake passed, full system access granted
 *   SUSPENDED → anomaly detected (key mismatch, spoofed UUID, abnormal BPM)
 *   DEAD      → 10 missed beats, evicted from active monitoring
 *
 * Invariants:
 *   - Records are never deleted (§2.1 persistence is the golden rule)
 *   - SUSPENDED nodes are never silently re-accepted
 *   - Proximity is not a credential — UDP pulse ≠ trust
 *   - Every state transition is written to the ledger before it takes effect
 *
 * Zero external dependencies. Uses Node fs only.
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const TRUST = {
  UNKNOWN:   'UNKNOWN',
  CANDIDATE: 'CANDIDATE',
  MEMBER:    'MEMBER',
  SUSPENDED: 'SUSPENDED',
  DEAD:      'DEAD',
};

// ── Pulse signature verification ──────────────────────────────────────────────
function verifyPulseSig(payload, sig, publicKeyB64) {
  // Pulse carries optional sig = sign(ts, privateKey).
  // If publicKeyB64 is stored in ledger and sig is present, verify it.
  // If no sig present (old nodes, dev mode) → skip, don't fail.
  if (!sig || !publicKeyB64) return true; // permissive until keys are established
  try {
    const pubKey = crypto.createPublicKey({
      key: Buffer.from(publicKeyB64, 'base64'),
      format: 'der', type: 'spki',
    });
    return crypto.verify('sha256', Buffer.from(payload), pubKey,
      Buffer.from(sig, 'base64'));
  } catch(_) {
    return false; // any crypto error = treat as invalid
  }
}

// ── NodeLedger ────────────────────────────────────────────────────────────────
function createNodeLedger({ ledgerDir, systemId, busEmit = null } = {}) {
  if (!ledgerDir) throw new Error('NodeLedger: ledgerDir is required');

  const LEDGER_FILE = path.join(ledgerDir, 'node-ledger.jsonl');
  const INDEX_FILE  = path.join(ledgerDir, 'node-index.json');

  // In-memory index: uuid → record (rebuilt from JSONL on boot)
  const _index = new Map();
  let _stream = null;

  // ── Init ──────────────────────────────────────────────────────────────────
  function open() {
    fs.mkdirSync(ledgerDir, { recursive: true });

    // Replay JSONL to rebuild in-memory index
    if (fs.existsSync(LEDGER_FILE)) {
      const lines = fs.readFileSync(LEDGER_FILE, 'utf8')
        .split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.uuid) {
            // Each JSONL line is a state snapshot — last write wins per UUID
            const existing = _index.get(entry.uuid) || {};
            _index.set(entry.uuid, { ...existing, ...entry });
          }
        } catch(_) {}
      }
    }

    // Open append stream
    _stream = fs.createWriteStream(LEDGER_FILE, { flags: 'a' });

    // Save readable index snapshot
    _saveIndex();
    return _index.size;
  }

  function close() {
    _stream?.end();
    _stream = null;
  }

  // ── Write ─────────────────────────────────────────────────────────────────
  function _write(record) {
    const row = { ...record, _writtenAt: Date.now(), _writer: systemId };
    _index.set(record.uuid, { ...(_index.get(record.uuid)||{}), ...row });
    _stream?.write(JSON.stringify(row) + '\n');
    _saveIndex();
    busEmit?.('node.ledger.updated', { uuid: record.uuid,
      trustLevel: record.trustLevel, systemId }, 'DEBUG');
  }

  function _saveIndex() {
    try {
      const snap = {};
      for (const [uuid, rec] of _index) snap[uuid] = rec;
      fs.writeFileSync(INDEX_FILE, JSON.stringify(snap, null, 2));
    } catch(_) {}
  }

  // ── State transitions ─────────────────────────────────────────────────────

  /**
   * Process an incoming pulse. Returns { action, record }.
   * action: 'beat' | 'new' | 'anomaly' | 'candidate_progress' | 'accepted_candidate'
   */
  function onPulse({ uuid, publicKey, groupHint, address, ts, sig }) {
    if (!uuid) return { action: 'invalid', record: null };

    const existing = _index.get(uuid);

    // ── Brand new UUID — never seen before ─────────────────────────────────
    if (!existing) {
      const record = {
        uuid, publicKey, groupHint, address,
        trustLevel:   TRUST.UNKNOWN,
        firstSeen:    ts || Date.now(),
        lastSeen:     ts || Date.now(),
        pulseCount:   1,
        missedBeats:  0,
        healthScore:  null,
        anomalies:    [],
        _transition:  'DISCOVERED',
      };
      _write(record);
      busEmit?.('node.discovered', { uuid, groupHint, address, trustLevel: TRUST.UNKNOWN }, 'WARN');
      return { action: 'new', record };
    }

    // ── Known UUID — verify public key hasn't changed ──────────────────────
    if (existing.publicKey && publicKey &&
        existing.publicKey !== publicKey &&
        existing.trustLevel === TRUST.MEMBER) {
      // Key mismatch on an established MEMBER — this is a spoofing attempt
      const anomaly = {
        type:       'KEY_MISMATCH',
        uuid,
        expected:   existing.publicKey?.slice(0,16),
        received:   publicKey?.slice(0,16),
        address,
        ts:         Date.now(),
      };
      const record = {
        ...existing,
        trustLevel:  TRUST.SUSPENDED,
        lastSeen:    Date.now(),
        pulseCount:  (existing.pulseCount || 0) + 1,
        anomalies:   [...(existing.anomalies || []), anomaly],
        _transition: 'SUSPENDED_KEY_MISMATCH',
      };
      _write(record);
      busEmit?.('node.anomaly', { uuid, type: 'KEY_MISMATCH', address }, 'ERROR');
      busEmit?.('node.suspended', { uuid, reason: 'KEY_MISMATCH', address }, 'ERROR');
      return { action: 'anomaly', record };
    }

    // ── Suspended node pulsing — do not re-accept silently ────────────────
    if (existing.trustLevel === TRUST.SUSPENDED) {
      const record = {
        ...existing,
        lastSeen:    Date.now(),
        pulseCount:  (existing.pulseCount || 0) + 1,
        _transition: 'SUSPENDED_PULSE_IGNORED',
      };
      _write(record);
      busEmit?.('node.suspended.pulse', { uuid, address, pulseCount: record.pulseCount }, 'WARN');
      return { action: 'suspended', record };
    }

    // ── UNKNOWN → accumulate pulses toward CANDIDATE ───────────────────────
    if (existing.trustLevel === TRUST.UNKNOWN) {
      const newCount = (existing.pulseCount || 0) + 1;
      // Require 3 consistent pulses before promoting to CANDIDATE
      const CANDIDATE_THRESHOLD = 3;
      const newTrust = newCount >= CANDIDATE_THRESHOLD
        ? TRUST.CANDIDATE : TRUST.UNKNOWN;

      const record = {
        ...existing,
        lastSeen:    Date.now(),
        pulseCount:  newCount,
        publicKey:   publicKey || existing.publicKey,
        groupHint:   groupHint || existing.groupHint,
        address,
        trustLevel:  newTrust,
        _transition: newTrust === TRUST.CANDIDATE
          ? 'PROMOTED_TO_CANDIDATE' : 'PULSE_ACCUMULATED',
      };
      _write(record);
      if (newTrust === TRUST.CANDIDATE) {
        busEmit?.('node.candidate', { uuid, groupHint, address, pulseCount: newCount }, 'INFO');
      }
      return {
        action: newTrust === TRUST.CANDIDATE ? 'accepted_candidate' : 'candidate_progress',
        record,
      };
    }

    // ── CANDIDATE awaiting handshake ───────────────────────────────────────
    if (existing.trustLevel === TRUST.CANDIDATE) {
      const record = {
        ...existing,
        lastSeen:   Date.now(),
        pulseCount: (existing.pulseCount || 0) + 1,
        address,
        _transition: 'CANDIDATE_PULSE',
      };
      _write(record);
      return { action: 'candidate_pulse', record };
    }

    // ── MEMBER — normal beat ───────────────────────────────────────────────
    if (existing.trustLevel === TRUST.MEMBER || existing.trustLevel === TRUST.DEAD) {
      const record = {
        ...existing,
        lastSeen:    Date.now(),
        pulseCount:  (existing.pulseCount || 0) + 1,
        missedBeats: 0,
        address,
        // Reinstate DEAD nodes that come back
        trustLevel:  existing.trustLevel === TRUST.DEAD ? TRUST.MEMBER : existing.trustLevel,
        _transition: existing.trustLevel === TRUST.DEAD ? 'REINSTATED' : 'BEAT',
      };
      _write(record);
      if (existing.trustLevel === TRUST.DEAD) {
        busEmit?.('node.reinstated', { uuid, address }, 'INFO');
      }
      return { action: 'beat', record };
    }

    return { action: 'unknown_state', record: existing };
  }

  /**
   * Accept a CANDIDATE — called after successful handshake challenge.
   * healthUrl: the URL to poll for liveness
   */
  function accept(uuid, { healthUrl, role, meta = {} } = {}) {
    const existing = _index.get(uuid);
    if (!existing) return { ok: false, error: 'uuid not in ledger' };
    if (existing.trustLevel !== TRUST.CANDIDATE) {
      return { ok: false, error: `cannot accept — trustLevel=${existing.trustLevel}` };
    }
    const record = {
      ...existing,
      trustLevel:   TRUST.MEMBER,
      acceptedAt:   Date.now(),
      healthUrl,
      role:         role || existing.groupHint,
      meta,
      _transition:  'ACCEPTED',
    };
    _write(record);
    busEmit?.('node.accepted', { uuid, role, healthUrl }, 'INFO');
    return { ok: true, record };
  }

  /**
   * Manually accept a known system at startup (pre-seeded MEMBER).
   * Used for the known NEXUS systems that don't need the full handshake flow.
   */
  function seed(uuid, { systemId, role, healthUrl, port, groupHint, publicKey } = {}) {
    const existing = _index.get(uuid);
    // Never downgrade an existing MEMBER or SUSPENDED
    if (existing?.trustLevel === TRUST.MEMBER) return existing;
    if (existing?.trustLevel === TRUST.SUSPENDED) return existing;

    const record = {
      uuid,
      systemId:   systemId || role,
      publicKey:  publicKey || null,
      groupHint:  groupHint || 'nexus:system',
      role,
      healthUrl,
      port,
      trustLevel:  TRUST.MEMBER,
      firstSeen:   existing?.firstSeen || Date.now(),
      lastSeen:    existing?.lastSeen  || null,
      pulseCount:  existing?.pulseCount || 0,
      missedBeats: 0,
      healthScore: null,
      anomalies:   existing?.anomalies || [],
      _transition: 'SEEDED',
    };
    _write(record);
    _index.set(uuid, record);  // §1.2 fix: seed() must update in-memory index
    return record;
  }

  /** Update health score from HeartbeatManager */
  function updateHealth(uuid, { bpm, consistency, latency, healthScore }) {
    const existing = _index.get(uuid);
    if (!existing) return;
    _write({
      ...existing,
      lastSeen:    Date.now(),
      missedBeats: 0,
      bpm, consistency, latency, healthScore,
      _transition: 'HEALTH_UPDATE',
    });
  }

  /** Record a missed beat */
  function missedBeat(uuid, { degradeAt, deadAt }) {
    const existing = _index.get(uuid);
    if (!existing) return;
    const missed = (existing.missedBeats || 0) + 1;
    const newTrust = missed >= deadAt   ? TRUST.DEAD
                   : missed >= degradeAt ? existing.trustLevel  // keep, degrade via busEmit
                   : existing.trustLevel;
    _write({
      ...existing,
      missedBeats: missed,
      trustLevel:  newTrust,
      _transition: newTrust === TRUST.DEAD ? 'DEAD_MISSED_BEATS' : 'MISSED_BEAT',
    });
  }

  // ── Queries ───────────────────────────────────────────────────────────────
  function get(uuid)          { return _index.get(uuid) || null; }
  function getAll()           { return [..._index.values()]; }
  function getMembers()       { return getAll().filter(n => n.trustLevel === TRUST.MEMBER); }
  function getCandidates()    { return getAll().filter(n => n.trustLevel === TRUST.CANDIDATE); }
  function getUnknown()       { return getAll().filter(n => n.trustLevel === TRUST.UNKNOWN); }
  function getSuspended()     { return getAll().filter(n => n.trustLevel === TRUST.SUSPENDED); }
  function count()            { return _index.size; }
  function isMember(uuid)     { return _index.get(uuid)?.trustLevel === TRUST.MEMBER; }

  // NodeRegistry interface expected by HeartbeatManager
  function seen(uuid) {
    const n = _index.get(uuid);
    if (n) _write({ ...n, lastSeen: Date.now(), _transition: 'SEEN' });
  }

  // upsert — write-or-update: prevents phantom entries on duplicate uuid (F021)
  function upsert(entry) {
    if (!entry?.uuid) throw new Error('node-ledger.upsert: uuid required');
    const existing = _index.get(entry.uuid);
    const record = { ...(existing||{}), ...entry,
      _transition: existing ? 'UPSERTED' : 'SEEDED',
      firstSeen: existing?.firstSeen || Date.now(),
    };
    _write(record);
    _index.set(record.uuid, record);
    return record;
  }

  return {
    // Lifecycle
    open, close,
    // Core
    onPulse, accept, seed, upsert, missedBeat, updateHealth,
    // NodeRegistry interface
    seen,
    // Queries
    get, getAll, all: getAll, getMembers, getCandidates, getUnknown, getSuspended,  // .all() = alias for .getAll()
    count, isMember,
    // Trust constants
    TRUST,
  };
}

module.exports = { createNodeLedger, TRUST };
