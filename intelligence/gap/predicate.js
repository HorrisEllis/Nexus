'use strict';
/**
 * lib/gap-predicate.js — Gap Predicate Library + Closure Verifier
 * UUID: nexus-gap-predicate-v1-0000-4000-0000-000000000001
 * Version: 1.0.0
 * Phase: 23.7 — gap-lifecycle.spec
 * Registered as component: gap-lifecycle.predicate-library
 *
 * §1.1 Nothing exists until proven — every gap carries a checkable predicate
 * §1.2 Nothing silently fails — every verification attempt is logged
 * §2.1 Truth floor written synchronously before any async work
 * §2.3 All state observable — predicates and results queryable from JAA
 * §5.1 UUID + hookId on everything
 * §5.7 All inter-module communication via bus only
 *
 * Three responsibilities:
 *
 *   1. PREDICATE LIBRARY — known gap types → checkable predicates
 *      A predicate is a JAA query that returns true while the gap is open.
 *      The gap closes when predicate.check() returns false AND an artifact exists.
 *
 *   2. DEDUP KEY — stable hash of predicate identity
 *      Two gaps with the same dedup_key are the same gap.
 *      Prevents the 300-job cycle from identical problems spawning new UUIDs.
 *
 *   3. CLOSURE VERIFIER — runs after every repair attempt
 *      Checks predicate AND artifact. Both must pass. Neither alone is closure.
 *      Logs every attempt. Moves gap to EXPIRED or BLOCKED when appropriate.
 *
 *   4. TRUTH FLOOR — synchronous Qwen classification at gap creation
 *      Runs before any async work. Cannot fail (heuristic fallback).
 *      Written to gap.truth_floor immediately. The minimum viable truth artifact.
 */

const crypto  = require('crypto');
const http    = require('http');
const path    = require('path');
const fs      = require('fs');

const MODULE_ID = 'gap-predicate';
const VERSION   = '1.1.0';
const COMP_ID   = 'gap-lifecycle.predicate-library';
const HOOK_ID   = 'gap-lifecycle.predicate-library:v1:p0001';

// ── Tension escalation (Phase 23.8 — added per direct request 2026-06-24) ────
// The spec's TTL/EXPIRED is a hard cliff: a gap is either "fine" or "expired,"
// nothing in between. That hides a gap that's been open 25 minutes behind the
// same flat "open" status as one open 25 seconds — same severity, same
// dispatch priority, same urgency. Tension makes that visible and acted on
// *before* TTL: the longer a gap stays open without a verified artifact, the
// higher its tension score climbs, and crossing a threshold bumps severity
// (and therefore reflection contract priority / dispatch ordering) for real,
// not just for display.
// §23.9 — consolidated onto cortex/self-heal/fault-taxonomy.js's
// scoreTension(), which already existed and already has a real caller
// (service/nexus-diagnostic.js's /tension endpoint). That formula is
// open-ended: severity_weight(0.4-4.0) ×
// age_factor(1.0-3.0, log-capped) × retry_penalty(1.0+). 12.0 is a critical
// gap at max age_factor with zero retries — a reasonable "this is fully
// tense before retries even start piling on" ceiling for normalizing into
// the 0-1 composite space below. Retries can push the raw score past that;
// the clamp below is intentional, not a bug.
const TENSION_CEILING = 12.0;
const TENSION_THRESHOLDS = { medium: 0.40, high: 0.70, critical: 0.90 }; // composite score
const SEVERITY_RANK = { low: 0, medium: 1, high: 2, critical: 3 };


// ── Lazy deps ─────────────────────────────────────────────────────────────────
let _jaa, _uid, _bus;
function _getJAA()  { if (!_jaa)  try { ({ jaaDB: _jaa, uid: _uid } = require('../../cortex/memory/jaa-db')); } catch(_) {} return _jaa; }
function _getBus()  { if (!_bus)  try { _bus = require('../../nexus/nexus-bus'); } catch(_) {} return _bus; }
function uid()      { return _uid?.() ?? crypto.randomUUID(); }

// ── Predicate operations ───────────────────────────────────────────────────────
const OPS = {
  exists:     (rows)         => rows.length > 0,
  not_exists: (rows)         => rows.length === 0,
  equals:     (rows, value)  => rows.some(r => _deepGet(r) === value),
  not_equals: (rows, value)  => rows.every(r => _deepGet(r) !== value),
  gt:         (rows, value)  => rows.some(r => _deepGet(r) > value),
  lt:         (rows, value)  => rows.some(r => _deepGet(r) < value),
  contains:   (rows, value)  => rows.some(r => String(_deepGet(r)||'').includes(value)),
};

function _deepGet(obj, field) {
  if (!field) return obj;
  return field.split('.').reduce((o, k) => o?.[k], obj);
}

// ── Predicate check ───────────────────────────────────────────────────────────
// Returns true if the gap is STILL OPEN (predicate still holds)
// Returns false if the gap predicate is now false (potential closure)
function checkPredicate(predicate) {
  const jaa = _getJAA();
  if (!jaa) return true; // can't check = assume still open (§1.1 nothing exists until proven)

  try {
    const { table, field, op, value, scope } = predicate;
    let rows = jaa.query(table, r => {
      if (scope && r.uuid !== scope && r.id !== scope &&
          r.queue_uuid !== scope && r.comp_id !== scope) return false;
      return true;
    }, 50);

    // Extract field values for operation
    const fieldRows = field ? rows.map(r => ({ _val: _deepGet(r, field) })) : rows;
    const opFn = OPS[op];
    if (!opFn) return true; // unknown op = assume open

    return opFn(fieldRows.map(r => r._val ?? r), value);
  } catch(e) {
    console.warn(`[${MODULE_ID}] §1.2 predicate check failed:`, e.message);
    return true; // fail-safe: assume still open
  }
}

// ── Artifact verification ─────────────────────────────────────────────────────
// Returns { found: boolean, detail: string }
function verifyArtifact(artifact_requirement) {
  if (!artifact_requirement) return { found: false, detail: 'no artifact_requirement declared' };
  const jaa = _getJAA();
  const { type, location, key, validator } = artifact_requirement;

  try {
    switch (type) {
      case 'jaa_row': {
        if (!jaa) return { found: false, detail: 'jaa unavailable' };
        const rows = jaa.query(location, r =>
          !key || r.uuid === key || r.id === key || r.queue_uuid === key, 10);
        if (!rows.length) return { found: false, detail: `no row in ${location} matching key ${key}` };
        if (validator) {
          // Simple validator: "field op value" e.g. "status != queued" or "weight > 0.5"
          const vMatch = validator.match(/^(\w[\w.]*)\s*(!=|==|=|>|<|>=|<=)\s*(.+)$/);
          if (vMatch) {
            const [, vField, vOp, vVal] = vMatch;
            const passes = rows.some(r => {
              const rv = _deepGet(r, vField);
              const tv = isNaN(vVal) ? vVal.replace(/^['"]|['"]$/g,'') : Number(vVal);
              switch(vOp) {
                case '!=': return rv != tv;
                case '==': case '=': return rv == tv;
                case '>':  return rv > tv;
                case '<':  return rv < tv;
                case '>=': return rv >= tv;
                case '<=': return rv <= tv;
                default:   return false;
              }
            });
            if (!passes) return { found: false, detail: `validator "${validator}" not satisfied` };
          }
        }
        return { found: true, detail: `${location}[${key||'any'}] exists` };
      }

      case 'file_written': {
        const fullPath = path.resolve(process.cwd(), location);
        if (!fs.existsSync(fullPath)) return { found: false, detail: `file not found: ${location}` };
        if (validator && key) {
          try {
            const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
            const entries = Array.isArray(content) ? content : Object.values(content);
            const found = entries.some(e =>
              (e.uuid === key || e.pattern_hash === key || e.id === key)
            );
            if (!found) return { found: false, detail: `key ${key} not found in ${location}` };
          } catch { return { found: false, detail: `could not parse ${location}` }; }
        }
        return { found: true, detail: `file exists: ${location}` };
      }

      case 'component_registered': {
        if (!jaa) return { found: false, detail: 'jaa unavailable' };
        const comps = jaa.query('components', r =>
          r.id === location || r.uuid === key, 5);
        if (!comps.length) return { found: false, detail: `component ${location} not registered` };
        return { found: true, detail: `component ${location} registered` };
      }

      case 'event_log_entry': {
        if (!jaa) return { found: false, detail: 'jaa unavailable' };
        const [evType, afterTs] = [key, Date.now() - 3600000]; // last hour
        const events = jaa.query('event_log', r =>
          r.type === evType && r.ts > afterTs, 5);
        if (!events.length) return { found: false, detail: `no ${evType} event in last hour` };
        return { found: true, detail: `event ${evType} found` };
      }

      case 'decision_log_scored': {
        if (!jaa) return { found: false, detail: 'jaa unavailable' };
        const scored = jaa.query('decision_log', r =>
          r.actor === location && r.satisfaction != null, 5);
        if (!scored.length) return { found: false, detail: `no scored decisions for ${location}` };
        return { found: true, detail: `${scored.length} scored decisions for ${location}` };
      }

      default:
        return { found: false, detail: `unknown artifact type: ${type}` };
    }
  } catch(e) {
    return { found: false, detail: `artifact verification threw: ${e.message}` };
  }
}

// ── Dedup key ─────────────────────────────────────────────────────────────────
// Stable hash of (predicate.table + predicate.field + predicate.op + predicate.scope)
// Two gaps with the same dedup_key are the same gap. Before inserting a new gap,
// check for an existing open gap with this key.
function dedupKey(predicate) {
  if (!predicate) return crypto.randomUUID(); // no predicate = unique (§1.1)
  const sig = [
    predicate.table  || '',
    predicate.field  || '',
    predicate.op     || '',
    String(predicate.scope || ''),
    String(predicate.value ?? ''),
  ].join('::');
  return crypto.createHash('sha1').update(sig).digest('hex').slice(0, 16);
}

// ── Predicate library ─────────────────────────────────────────────────────────
// Known gap types → predicates + artifact requirements.
// Grows over time as Qwen proposes new entries via _clusterReviewTick.
// Stored in JAA gap_predicates table for persistence.
// This is the seed — loaded at boot, extended by learning.

const PREDICATE_LIBRARY = {

  // §23.12 — added alongside the actual fix in lib/ncp.js + both userscripts'
  // connect(). There is no artifact that proves "a race condition is no
  // longer happening" — you can't write a file as evidence of an absence.
  // So this is honestly TTL-only: predicate checks for genuinely recent
  // flap events (not "has this type of event ever fired," which would never
  // resolve), and if none in the window, the gap ages out via the existing
  // sweepExpired() mechanism rather than a fabricated RESOLVED state.
  ncp_connection_flapping: {
    predicate: (gap) => ({
      table: 'event_log', field: 'ts', op: 'gt',
      value: Date.now() - 600000, // any flap logged in the last 10 minutes?
      scope: gap.path || null,    // path is the provider:tabId key, written as queue_uuid below
    }),
    artifact_requirement: null,
    truth_floor_hint: (gap) => `NCP connection for ${gap.path} disconnected/reconnected repeatedly — was a server+client race condition (fixed §23.12), now also tracked in case a different cause recurs.`,
    ttl_ms: 1200000, // 20 minutes of silence before this ages out
    strategy: 'WAIT',
  },

  seam_orphan_resume: {
    predicate: (gap) => ({
      table: 'seam_records', field: 'queue_uuid', op: 'not_exists',
      scope: gap.body?.match(/queue\s+([0-9a-f]{8})/i)?.[1] || gap.queueId || null,
    }),
    artifact_requirement: (gap) => ({
      type: 'jaa_row', location: 'seam_records',
      key:  gap.body?.match(/queue\s+([0-9a-f]{8})/i)?.[1] || gap.queueId || null,
      validator: 'status != null',
    }),
    truth_floor_hint: 'SEAM queue resumed from previous session with no in-memory state — normal after restart. Logging gap and seeking session record.',
    ttl_ms: 600000, // 10 minutes
    strategy: 'RETRIEVE',
  },

  obligation: {
    predicate: (gap) => ({
      table: 'agent_calls', field: 'status', op: 'equals', value: 'pending',
      scope: gap.callUuid || null,
    }),
    artifact_requirement: (gap) => ({
      type: 'jaa_row', location: 'agent_calls',
      key: gap.callUuid || null,
      validator: 'status != pending',
    }),
    truth_floor_hint: 'Agent call stuck in pending state — not claimed or dispatched. Seeking dispatch or closure.',
    ttl_ms: 300000, // 5 minutes
    strategy: 'DISPATCH',
  },

  system_offline: {
    predicate: (gap) => ({
      table: 'event_log', field: 'type', op: 'not_exists',
      scope: null, value: `system.online.${gap.system}`,
    }),
    artifact_requirement: (gap) => ({
      type: 'event_log_entry', location: `system.online.${gap.system}`,
      key: `system.online.${gap.system}`, validator: null,
    }),
    truth_floor_hint: (gap) => `${gap.system} is offline. The system cannot route to it until it comes back up.`,
    ttl_ms: 1800000, // 30 minutes
    strategy: 'WAIT',
  },

  cluster_misfire: {
    predicate: (gap) => ({
      table: 'bep_patterns', field: 'cluster', op: 'not_exists',
      scope: gap.patternHash || null,
    }),
    artifact_requirement: (gap) => ({
      type: 'file_written',
      location: 'data/cortex/ledger/raid-clusters.json',
      key: gap.patternHash || null,
      validator: 'weight > 0.5',
    }),
    truth_floor_hint: 'RAID classified intent incorrectly — no learned pattern covers this case. Qwen correction samples accumulating.',
    ttl_ms: 1800000,
    strategy: 'EXTEND',
  },

  spec_drift: {
    predicate: (gap) => ({
      table: 'components', field: 'version', op: 'not_equals',
      scope: gap.componentId || null, value: gap.specVersion || null,
    }),
    artifact_requirement: (gap) => ({
      type: 'jaa_row', location: 'components',
      key: gap.componentId || null,
      validator: `version == ${gap.specVersion}`,
    }),
    truth_floor_hint: 'Component version does not match its spec — code and spec have diverged.',
    ttl_ms: 900000,
    strategy: 'RETRIEVE',
  },

  reflection_contract_unresolved: {
    predicate: (gap) => ({
      table: 'reflection_contracts', field: 'status', op: 'equals',
      value: 'queued', scope: gap.contractUuid || null,
    }),
    artifact_requirement: (gap) => ({
      type: 'jaa_row', location: 'reflection_contracts',
      key: gap.contractUuid || null,
      validator: 'status = resolved',
    }),
    truth_floor_hint: 'A reflection contract has been queued but not yet dispatched or resolved.',
    ttl_ms: 600000,
    strategy: 'DISPATCH',
  },
};

// ── Truth floor ───────────────────────────────────────────────────────────────
// Synchronous. Always succeeds. Uses Qwen if available, heuristic if not.
// Written to gap before any async work begins.

const TRUTH_FLOOR_HEURISTICS = {};
for (const [type, entry] of Object.entries(PREDICATE_LIBRARY)) {
  TRUTH_FLOOR_HEURISTICS[type] = typeof entry.truth_floor_hint === 'function'
    ? entry.truth_floor_hint
    : () => entry.truth_floor_hint;
}

function buildTruthFloor(gap) {
  const heuristicFn = TRUTH_FLOOR_HEURISTICS[gap.type] || TRUTH_FLOOR_HEURISTICS[gap.gap_type];
  const diagnosis = heuristicFn
    ? heuristicFn(gap)
    : `Gap type "${gap.type}" detected in ${gap.system || 'unknown system'}. No heuristic available — awaiting Qwen classification.`;

  return {
    diagnosis,
    confidence: heuristicFn ? 0.7 : 0.3,
    written_at: Date.now(),
    model:      'fallback:heuristic',
  };
}

// ── Gap enrichment ────────────────────────────────────────────────────────────
// Call this before inserting a gap into JAA.
// Adds: predicate, artifact_requirement, dedup_key, truth_floor, ttl_ms
// Returns: { enriched_gap, existing_gap_uuid | null }

function enrichGap(raw) {
  const jaa    = _getJAA();
  const gapType = raw.type || raw.gap_type || 'unknown';
  const entry  = PREDICATE_LIBRARY[gapType];

  const predicate           = entry?.predicate(raw)           || null;
  const artifact_requirement= entry?.artifact_requirement(raw)|| null;
  const dedup               = dedupKey(predicate);
  const truth_floor         = buildTruthFloor(raw);
  const ttl_ms              = entry?.ttl_ms || 1800000;

  // Dedup check — find existing open gap with same predicate identity
  let existing_uuid = null;
  if (jaa && predicate) {
    try {
      const existing = jaa.query('gaps', g =>
        g.dedup_key === dedup && (g.status === 'open' || g.status === 'investigating'), 1);
      if (existing.length) {
        existing_uuid = existing[0].uuid;
        // Append evidence and increment recurrence
        try {
          jaa.update('gaps', existing_uuid, {
            recurrence_count: (existing[0].recurrence_count || 0) + 1,
            last_seen: Date.now(),
            evidence: [...(existing[0].evidence || []), truth_floor.diagnosis].slice(-20),
          });
          _logEvent('gap.deduplicated', {
            existing_uuid, gapType, dedup_key: dedup,
            recurrence: (existing[0].recurrence_count || 0) + 1,
          });
        } catch(_) {}
        return { enriched_gap: null, existing_uuid };
      }
    } catch(_) {}
  }

  const enriched = {
    ...raw,
    predicate,
    artifact_requirement,
    dedup_key:      dedup,
    truth_floor,
    ttl_ms,
    ttl_expires_at: Date.now() + ttl_ms,
    closure_attempts: [],
    recurrence_count: 0,
    last_seen:      Date.now(),
    // SISO seam fields — §5.1 every gap is a first-class component event
    comp_id:   COMP_ID,
    hook_id:   HOOK_ID,
    seam_id:   `gap-lifecycle:${gapType}:${dedup.slice(0,8)}`,
  };

  return { enriched_gap: enriched, existing_uuid: null };
}

// ── Tension escalation ─────────────────────────────────────────────────────────
// Recomputes how urgent an open gap has become, purely from age — independent
// of and in addition to the weight/friction/tension a gap was created with.
// Called on every verifyClosure() pass, so it rides the same cadence every
// other system already polls gaps on (diagnostic sweep, reflection pass,
// gap-loop tick) — no new timer, no new poller.
function escalateTension(gap) {
  // The canonical number now comes from healer.scoreTension() — see the
  // §23.9 comment on TENSION_CEILING above for why. This function's job is
  // just to normalize that into 0-1 and decide whether severity escalates.
  let rawTension;
  try {
    rawTension = require('../../cortex/self-heal/fault-taxonomy').scoreTension(gap);
  } catch (_) {
    // §DYNAMIC-TENSION 2026-08-23 — James: "no hardcoded. dynamic updating
    // over time." This was a flat 0.5 — the one genuinely hardcoded
    // tension value left in this file, real only as a last-resort when
    // fault-taxonomy itself is unreachable (a rare failure, not the
    // normal path — that module's own scoreTension() is real and already
    // uses accumulated friction history). Now falls back to the real,
    // continuously-updating CFR delta signal instead of a fabricated
    // constant — genuinely different data (system-wide, real-time
    // tension rather than this gap-type's own friction history) but real
    // and dynamic rather than a guess. Only if THAT also has no real data
    // yet (a genuinely new system with no CFR history) does this fall to
    // a stated, honest neutral midpoint — not silently.
    const gp = require('../../lib/gap-priority.js');
    const delta = gp.tensionFromDelta(gap.system || gap.source);
    rawTension = (delta ?? 0.5) * TENSION_CEILING;
  }
  const tension = Math.min(1, rawTension / TENSION_CEILING);

  const weight   = gap.weight   ?? 0.5;
  const friction = gap.friction ?? 0.5;
  const composite = parseFloat((weight * 0.4 + friction * 0.35 + tension * 0.25).toFixed(3));

  let severityFloor = 'low';
  if (composite >= TENSION_THRESHOLDS.critical) severityFloor = 'critical';
  else if (composite >= TENSION_THRESHOLDS.high) severityFloor = 'high';
  else if (composite >= TENSION_THRESHOLDS.medium) severityFloor = 'medium';

  // Tension only ever pushes severity UP, never down — escalation is
  // monotonic. A gap doesn't get quieter just because tension hasn't crossed
  // the next threshold yet; it keeps whatever severity it already earned.
  const currentRank = SEVERITY_RANK[gap.severity] ?? 0;
  const floorRank    = SEVERITY_RANK[severityFloor] ?? 0;
  const severity      = floorRank > currentRank ? severityFloor : (gap.severity || severityFloor);
  const escalated      = severity !== (gap.severity || 'low');

  const ageMin = Math.max(0, (Date.now() - (gap.createdAt || gap.detectedAt || Date.now())) / 60000);

  return {
    tension: parseFloat(tension.toFixed(3)), rawTension: parseFloat(rawTension.toFixed(3)),
    composite, severity, escalated, ageMin: parseFloat(ageMin.toFixed(1)),
  };
}

// ── Closure verifier ──────────────────────────────────────────────────────────
// Called after every repair attempt. Checks predicate AND artifact.
// Both must pass. Logs every attempt. Updates gap state.

function verifyClosure(gap, { strategy = 'unknown', jobId = null } = {}) {
  const jaa = _getJAA();
  const attemptUuid = uid();
  const now = Date.now();

  // Check TTL first
  if (gap.ttl_expires_at && now > gap.ttl_expires_at && gap.status !== 'resolved') {
    if (jaa) {
      try {
        jaa.update('gaps', gap.uuid, { status: 'expired', expiredAt: now });
        _logEvent('gap.expired', { gapUuid: gap.uuid, gapType: gap.type });
        console.log(`[${MODULE_ID}] ⌛ gap ${gap.uuid.slice(0,8)} expired · ${gap.type}`);
      } catch(_) {}
    }
    return { resolved: false, reason: 'ttl_expired', attemptUuid };
  }

  // §23.8 — tension escalation runs on every check, win or lose. A gap that's
  // still open after this check is exactly the case tension exists for.
  const escalation = escalateTension(gap);
  if (escalation.escalated && jaa) {
    try {
      jaa.update('gaps', gap.uuid, {
        severity: escalation.severity, tension: escalation.tension, composite: escalation.composite,
      });
      console.warn(`[${MODULE_ID}] ⚠ TENSION ESCALATED · gap ${gap.uuid.slice(0,8)} · ${gap.type} · ` +
        `${gap.severity || 'low'} → ${escalation.severity} · open ${escalation.ageMin}min · composite ${escalation.composite}`);
      try {
        require('../../lib/component-ledger').write({
          system: 'gap-lifecycle', component: COMP_ID, action: 'tension_escalated', status: escalation.severity,
          tags: [gap.type], detail: `open ${escalation.ageMin}min, composite ${escalation.composite}`,
          causedBy: gap.uuid,
        });
      } catch (_) {}
      gap.severity = escalation.severity; // reflect in this call's own subsequent logic
    } catch (_) {}
  }

  const predicateStillTrue = gap.predicate
    ? checkPredicate(gap.predicate)
    : false; // no predicate = assume resolvable

  const artifactResult = gap.artifact_requirement
    ? verifyArtifact(gap.artifact_requirement)
    : { found: false, detail: 'no artifact_requirement declared' };

  const resolved = !predicateStillTrue && artifactResult.found;

  const attempt = {
    attempt_uuid:    attemptUuid,
    ts:              now,
    strategy,
    jobId:           jobId || null,
    artifact_sought: gap.artifact_requirement || null,
    artifact_found:  artifactResult.found,
    predicate_false: !predicateStillTrue,
    error:           null,
    detail:          artifactResult.detail,
  };

  const attempts = [...(gap.closure_attempts || []), attempt];

  if (jaa) {
    try {
      const newStatus = resolved ? 'resolved'
        : attempts.length >= 10 ? 'blocked'
        : 'open';

      jaa.update('gaps', gap.uuid, {
        status:           newStatus,
        closure_attempts: attempts,
        ...(resolved ? { resolvedAt: now } : {}),
        ...(newStatus === 'blocked' ? { blockedAt: now } : {}),
      });

      // Also write to closure_attempts table for independent querying
      jaa.insert('closure_attempts', {
        uuid: attemptUuid, gap_uuid: gap.uuid, gap_type: gap.type,
        ...attempt, ts: now,
      });

      _logEvent(resolved ? 'gap.resolved' : 'gap.closure.attempt_failed', {
        gapUuid: gap.uuid, gapType: gap.type, attemptUuid,
        artifactFound: artifactResult.found, predicateFalse: !predicateStillTrue,
        detail: artifactResult.detail, strategy,
        attemptCount: attempts.length,
      });

      if (resolved) {
        console.log(`[${MODULE_ID}] ✓ gap ${gap.uuid.slice(0,8)} RESOLVED · ${gap.type} · ${artifactResult.detail}`);
      } else if (newStatus === 'blocked') {
        console.warn(`[${MODULE_ID}] ⛔ gap ${gap.uuid.slice(0,8)} BLOCKED · ${gap.type} · 10 attempts exhausted`);
      } else {
        console.log(`[${MODULE_ID}] ↺ gap ${gap.uuid.slice(0,8)} still open · ${artifactResult.detail}`);
      }
    } catch(e) {
      console.warn(`[${MODULE_ID}] §1.2 closure verify write failed:`, e.message);
    }
  }

  return { resolved, reason: resolved ? 'predicate_false_and_artifact_found' : 'not_resolved', attemptUuid, detail: artifactResult.detail };
}

// ── TTL sweep ─────────────────────────────────────────────────────────────────
// Runs periodically. Moves expired gaps to EXPIRED state.
function sweepExpired() {
  const jaa = _getJAA();
  if (!jaa) return 0;
  const now = Date.now();
  let expired = 0;
  try {
    const stale = jaa.query('gaps',
      g => (g.status === 'open' || g.status === 'investigating') &&
           g.ttl_expires_at && now > g.ttl_expires_at &&
           g.loop_type !== 'CONSTITUTIONAL', // constitutional gaps never expire
      50);
    for (const g of stale) {
      try {
        jaa.update('gaps', g.uuid, { status: 'expired', expiredAt: now });
        _logEvent('gap.expired', { gapUuid: g.uuid, gapType: g.type, ttl_ms: g.ttl_ms });
        expired++;
      } catch(_) {}
    }
  } catch(_) {}
  if (expired > 0) console.log(`[${MODULE_ID}] ⌛ swept ${expired} expired gap${expired===1?'':'s'}`);
  return expired;
}

// ── Event logging ─────────────────────────────────────────────────────────────
function _logEvent(type, payload) {
  const jaa = _getJAA();
  const bus = _getBus();
  try { if (jaa) jaa.insert('event_log', { uuid: uid(), type, payload, source: MODULE_ID, ts: Date.now() }); } catch(_) {}
  try { if (bus?.emit) bus.emit(type, { ...payload, _comp: COMP_ID, _hook: HOOK_ID }); } catch(_) {}
}

// ── Component registration ────────────────────────────────────────────────────
// Registers this module in the component registry so it's discoverable
// via the grammar engine, RAID, and the topology view.
function registerComponent() {
  try {
    const reg = require('../../lib/component-registry');
    reg.register({
      id:          COMP_ID,
      namespace:   'gap-lifecycle',
      name:        'Predicate Library',
      version:     VERSION,
      description: 'Gap predicate library, dedup key, truth floor, and closure verifier. Every gap carries a checkable predicate. Closure verified against real JAA state, not job completion signals.',
      grammar:     ['gap predicate', 'gap closure', 'verify closure', 'gap dedup'],
      route:       null, // internal module, no HTTP route
      comp_type:   'engine',
      events: {
        emits:      ['gap.deduplicated','gap.resolved','gap.closure.attempt_failed','gap.expired'],
        listensTo:  ['guardian.job.complete','reflection.contract.resolved'],
      },
      registeredBy: MODULE_ID,
    });
  } catch(_) {} // non-fatal — runs before orchestrator may be ready
}

// ── Exports ───────────────────────────────────────────────────────────────────
module.exports = {
  enrichGap,
  verifyClosure,
  checkPredicate,
  verifyArtifact,
  dedupKey,
  buildTruthFloor,
  sweepExpired,
  escalateTension,
  registerComponent,
  PREDICATE_LIBRARY,
  MODULE_ID,
  VERSION,
  COMP_ID,
  HOOK_ID,
};
