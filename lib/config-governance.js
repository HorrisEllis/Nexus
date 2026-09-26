'use strict';
/**
 * lib/config-governance.js — §TABLET T3 change governance
 * UUID: nexus-config-governance-v1-0000-4000-0000-000000000001
 * @version 1.0.0
 *
 * docs/nexus-tablet.spec T3 gate:
 *   "a config change is written to the ledger with CFR conditions stamped,
 *    projected to the registry, scored by sigma, and an anomalous one
 *    raises friction."
 *
 * This module is DELIBERATELY THIN. Every one of those five capabilities
 * already existed and was already load-bearing elsewhere (§16.4 — extend
 * what exists, never build a parallel path; §16.5 — the best new code is
 * no new code):
 *
 *   ledger + CFR stamp + sigma  → meta/cfr/ledger.js's record(), which
 *     already computes sigma against the type's baseline, updates the CFR
 *     field, and writes the stamped entry. Reused whole, not reimplemented.
 *   canonical ledger + registry projection → lib/component-ledger.js's
 *     write(), which lands the physical day file, the JAA mirror, and the
 *     event_log breadcrumb the pattern engine reads.
 *   friction → cortex/self-heal/escalation.js already listens for
 *     'anomaly.detected' on the bus and calls raiseFriction() with a level
 *     derived from severity. This module emits that event; it does NOT
 *     compute friction itself.
 *
 * What this module genuinely adds is the ORDERING and the DECISION: what
 * counts as a config change, in what sequence the four writes happen, and
 * at what sigma score a change is anomalous enough to raise friction.
 *
 * §LAW II (memory authority): the ledger write happens BEFORE the change is
 * projected as current truth. A change nothing recorded did not happen.
 */

const { randomUUID } = require('crypto');

const MODULE_ID = 'config-governance';
const VERSION   = '1.0.0';

// Sigma score above which a config change is treated as anomalous. Chosen
// to match the codebase's existing anomaly convention rather than invented
// here — meta/cfr/sigma.js scores 0..1 across structural/temporal/
// contextual axes, and lib/seam/queue.js's own escalation path treats >0.7
// as the actionable band. Overridable per call for systems with a genuine
// reason to be stricter; not a magic number buried in a branch.
const ANOMALY_SIGMA = 0.7;

// Severity handed to escalation. escalation._levelForSeverity maps this via
// SEVERITY_TO_LEVEL; 'medium' is the honest default for "a config value
// moved unusually" — it is not an outage, and inflating severity to force
// attention is exactly the noise that trains people to ignore friction.
const ANOMALY_SEVERITY = 'medium';

/**
 * Record and govern a single config change.
 *
 * @param {object}   o
 * @param {string}   o.system      owning system (required — §1.1: no anonymous writes)
 * @param {string}   o.key         config key that changed (required)
 * @param {*}        o.from        previous value (may be undefined for a first set)
 * @param {*}        o.to          new value (required — a change to nothing is a delete, use o.deleted)
 * @param {string}  [o.actor]      'user' | 'system' | a specific component id. Defaults 'user'.
 *                                 The spec's user-live vs system-in-COS distinction rides here.
 * @param {boolean} [o.deleted]    true when the key was removed rather than reassigned
 * @param {object}  [o.cfrLedger]  a live CFR ledger (createCFRLedger). Optional: without it the
 *                                 change is still ledgered and projected, but carries no CFR/sigma
 *                                 stamp — and says so in the returned result rather than pretending.
 * @param {object}  [o.bus]        event bus for the anomaly emit. Without it, an anomalous change
 *                                 is still recorded and REPORTED, just not escalated (§1.2).
 * @param {number}  [o.anomalyThreshold]
 * @returns {object} { uuid, sigma, cfr, anomalous, escalated, stamped, projected }
 */
function recordConfigChange(o = {}) {
  const { system, key, actor = 'user', deleted = false, cfrLedger = null, bus = null } = o;
  const threshold = typeof o.anomalyThreshold === 'number' ? o.anomalyThreshold : ANOMALY_SIGMA;

  // §1.1 — refuse loudly and specifically. A governance record that cannot
  // name its system or key is worse than no record: it pollutes the ledger
  // with unattributable change and quietly breaks every later query.
  if (!system || typeof system !== 'string') {
    throw new Error(`[${MODULE_ID}] recordConfigChange: 'system' is required and must be a string — a config change with no owner cannot be governed`);
  }
  if (!key || typeof key !== 'string') {
    throw new Error(`[${MODULE_ID}] recordConfigChange: 'key' is required and must be a string (system='${system}')`);
  }
  // §FIX 2026-07-27 — found by adversarial simulation (UC3.3): a key containing
  // newlines or null bytes was accepted verbatim. JSON.stringify escapes them
  // so the jsonl row survives, but the key then flows into log lines, component
  // names and grep-based tooling where an embedded newline DOES split a record.
  // A config key is an identifier, not free text: refuse rather than sanitise,
  // because silently rewriting an identifier means two names for one setting.
  if (/[\r\n\u0000-\u001f\u007f]/.test(key)) {
    throw new Error(`[${MODULE_ID}] recordConfigChange: key contains control characters — a config key is an identifier and must not carry newlines or nulls (system='${system}')`);
  }
  if (key.length > 256) {
    throw new Error(`[${MODULE_ID}] recordConfigChange: key exceeds 256 chars (system='${system}')`);
  }
  if (!deleted && !('to' in o)) {
    throw new Error(`[${MODULE_ID}] recordConfigChange: 'to' is required unless deleted:true (system='${system}', key='${key}')`);
  }

  const uuid = randomUUID();
  const ts   = Date.now();
  const payload = {
    uuid, system, key, actor, ts,
    from: o.from,
    to:   deleted ? undefined : o.to,
    deleted: !!deleted,
    changed: deleted ? true : !_sameValue(o.from, o.to),
  };

  // ── 1+2+4. CFR ledger: stamps conditions AND scores sigma in one pass ────
  // record() computes sigma against this event type's baseline using the
  // PRE-update field, then updates the field — so the returned snapshot is
  // the condition the system was in when the change landed. That ordering
  // is meta/cfr/ledger.js's, deliberately not re-derived here.
  let sigma = null, cfr = null, stamped = false;
  if (cfrLedger && typeof cfrLedger.record === 'function') {
    try {
      const entry = cfrLedger.record('config.changed', payload, { uuid });
      sigma   = entry?.sigma ?? null;
      cfr     = entry?.cfr ?? null;
      stamped = sigma !== null;
    } catch (e) {
      // A governance write must not be lost because scoring failed. Loud,
      // then continue to the canonical ledger — recording the change
      // unscored beats not recording it (§1.2 over §1.1 here: the change
      // DID happen, refusing to log it would erase real history).
      console.error(`[${MODULE_ID}] CFR stamp failed for ${system}.${key}: ${e.message} — recording unstamped`);
    }
  }

  const sigmaScore = _scoreOf(sigma);
  const anomalous  = sigmaScore !== null && sigmaScore > threshold;

  // ── 1+3. Canonical ledger + registry projection ──────────────────────────
  // component-ledger.write() is the single canonical writer: physical day
  // file + JAA mirror (the registry projection — the registry is a
  // projection over the ledger, never an independent truth) + event_log
  // breadcrumb for the pattern engine.
  let projected = false;
  try {
    const { write } = require('./component-ledger');
    write({
      system,
      component: `${system}.config`,
      action:    deleted ? 'config.deleted' : 'config.changed',
      status:    anomalous ? 'anomalous' : 'ok',
      tags:      ['config', 'governance', actor === 'user' ? 'user-initiated' : 'system-initiated'],
      detail:    { ...payload, sigma: sigmaScore, cfr },
      causedBy:  o.causedBy || null,
      session:   o.session || null,
      // §schema 2026-07-24 — a governed config change is now locatable: which
      // hook fired it and which wire carried it, not merely that it happened.
      hook:      o.hook || `${system}.config.${deleted ? 'delete' : 'set'}`,
      wire:      o.wire || `${system}.config`,
      intent:    o.intent || `${actor} ${deleted ? 'removed' : 'set'} ${key}`,
      faultId:   anomalous ? uuid : null,
    });
    projected = true;
  } catch (e) {
    // This one IS fatal to the operation's contract: if the canonical write
    // failed, the change is not governed, and claiming otherwise would be
    // the exact silent-success failure this whole module exists to prevent.
    console.error(`[${MODULE_ID}] CANONICAL LEDGER WRITE FAILED for ${system}.${key}: ${e.message}`);
    throw new Error(`[${MODULE_ID}] config change could not be governed — canonical ledger write failed: ${e.message}`);
  }

  // ── 5. Anomalous change raises friction ──────────────────────────────────
  // Emitted, not computed: escalation.js owns friction thresholds and the
  // friction ledger. Duplicating that logic here would create the second
  // truth about system health that §10.3 forbids.
  let escalated = false;
  if (anomalous) {
    if (bus && typeof bus.emit === 'function') {
      try {
        bus.emit('anomaly.detected', {
          anomalyUuid: uuid,
          type:        `config.anomalous.${system}`,
          severity:    ANOMALY_SEVERITY,
          sessionId:   o.session || null,
        }, { source: MODULE_ID });
        escalated = true;
      } catch (e) {
        console.error(`[${MODULE_ID}] anomaly emit failed for ${system}.${key}: ${e.message}`);
      }
    } else {
      // §1.2 — an anomaly with nowhere to escalate is stated, never dropped
      // into silence. The change is already in the ledger marked
      // status:'anomalous', so the fact survives even unescalated.
      console.warn(`[${MODULE_ID}] ANOMALOUS config change ${system}.${key} (sigma ${sigmaScore.toFixed(3)} > ${threshold}) — no bus supplied, friction NOT raised. Recorded in the ledger as anomalous.`);
    }
  }

  return { uuid, ts, sigma: sigmaScore, cfr, anomalous, escalated, stamped, projected };
}

// Value comparison that treats objects/arrays structurally. A config diff
// reported purely by reference identity would call every re-read a change
// and flood the ledger.
function _sameValue(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === 'object') {
    try { return JSON.stringify(a) === JSON.stringify(b); } catch (_) { return false; }
  }
  return false;
}

// sigma may arrive as a bare number or as computeSigma's {score,...} object
// depending on the ledger version. Handle both rather than assuming one and
// silently scoring every change as 0 (which would disable anomaly detection
// entirely and look like "no anomalies ever" — the worst failure shape).
function _scoreOf(sigma) {
  if (sigma === null || sigma === undefined) return null;
  if (typeof sigma === 'number') return sigma;
  if (typeof sigma === 'object' && typeof sigma.score === 'number') return sigma.score;
  return null;
}

module.exports = { recordConfigChange, MODULE_ID, VERSION, ANOMALY_SIGMA, ANOMALY_SEVERITY };
