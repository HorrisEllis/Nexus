'use strict';
// ── lib/open-loop-taxonomy.js ─────────────────────────────────────────────────
// UUID: nexus-open-loop-taxonomy-v1-0000-4000-0000-000000000001
// Version: 1.0.0
//
// THE INSIGHT: A gap is an open loop. Open loops are not errors.
// They are uncertainty that has been acknowledged and preserved with context.
//
// "The system's awareness is measured by the quality of its open loops,
//  not the quantity of facts it stores."
//
// Closed loops  → knowledge
// Open loops    → active intelligence work
// Loop ecology  → the health of the system
//
// ── TAXONOMY ─────────────────────────────────────────────────────────────────
//
//   OPEN_LOOP
//   ├── UNDERSTANDING    input not parsed or referenced correctly
//   ├── KNOWLEDGE        input understood, information missing
//   ├── CAPABILITY       known request, system cannot perform it
//   ├── CAUSAL           something happened, reason unknown
//   ├── CONFLICT         two truths cannot simultaneously exist
//   ├── DECISION         multiple valid actions, no winner
//   ├── INTEGRITY        trustworthiness uncertain
//   ├── RELATIONAL       system lacks model alignment with human
//   ├── TEMPORAL         correct answer exists, wrong time
//   └── CONSTITUTIONAL   cannot determine if action is permissible
//
// ── LOOP STATES ──────────────────────────────────────────────────────────────
//   OPEN          detected, not yet addressed
//   HELD          intentionally preserved — we know it exists, not closing yet
//   INVESTIGATING  active diagnosis underway
//   ESCALATED     passed to higher-level system or human
//   BLOCKED       cannot progress — missing dependency
//   RESOLVED      closure condition met, evidence recorded
//   ARCHIVED      resolved + history preserved, no longer active
//
//   HELD ≠ UNRESOLVED:
//     HELD     = We know and are intentionally waiting
//     UNRESOLVED = We don't know how to close it yet
//
// ── CLOSURE MECHANISMS ───────────────────────────────────────────────────────
//   Each loop type has a defined closure mechanism. Closure without the correct
//   mechanism is not closure — it is suppression.
//
// ── REQUIRED FIELDS ──────────────────────────────────────────────────────────
//   Every loop record must carry:
//     loop_id           unique identifier
//     loop_type         one of LOOP_TYPES (the 10 canonical types)
//     legacy_type       original gap.type string (preserved for backwards compat)
//     status            one of LOOP_STATES
//     source            which module detected it
//     created_at        detection timestamp
//     confidence        0.0–1.0 (how certain we are this is real)
//     evidence          array of evidence strings
//     dependencies      what must exist before this loop can close
//     closure_condition what constitutes resolution
//     closure_mechanism which strategy class applies
//
// §1.1 Nothing exists until proven — every loop has confidence + evidence
// §1.2 Nothing silently fails — every state transition logged
// §2.1 History preserved — ARCHIVED state, never deleted

// ── The 10 canonical loop types ───────────────────────────────────────────────
const LOOP_TYPES = {

  UNDERSTANDING: {
    description: 'The system does not understand the input. Reference, intent, or context is missing.',
    examples: [
      '"open the thing from last week" — missing reference',
      '"do what we discussed" — no session context',
    ],
    closure_mechanism: 'CLARIFY',  // ask, disambiguate, request more context. Never guess.
    closure_actions:   ['ask', 'clarify', 'disambiguate'],
    raid_cluster:      'general',
    escalation_path:   ['clarify', 'relational_review', 'human'],
    never:             ['guess', 'assume', 'fabricate'],
  },

  KNOWLEDGE: {
    description: 'Request is understood. Required information does not exist in any accessible store.',
    examples: [
      'What happened in the meeting? — no meeting data',
      'What is the current state of X? — no recent record',
    ],
    closure_mechanism: 'RETRIEVE',  // search, research, fetch, ingest
    closure_actions:   ['search', 'research', 'retrieve', 'request_from_source'],
    raid_cluster:      'research',
    escalation_path:   ['retrieve', 'web_search', 'human_knows'],
    never:             ['fabricate', 'hallucinate'],
  },

  CAPABILITY: {
    description: 'The system knows what is requested but cannot perform it — missing engine, module, or permission.',
    examples: [
      'Generate CAD model — no CAD engine',
      'Send email — no mail module connected',
    ],
    closure_mechanism: 'EXTEND',  // build capability, install module, delegate to external
    closure_actions:   ['build_module', 'install_dependency', 'delegate', 'register_capability'],
    raid_cluster:      'forge',
    escalation_path:   ['delegate', 'forge_module', 'human_build'],
    never:             ['pretend_capability_exists'],
  },

  CAUSAL: {
    description: 'Something happened. The root cause is unknown. Symptoms are known, origin is not.',
    examples: [
      'Guardian crashed — known: bus undefined — unknown: why dependency graph allowed it',
      'RAID weights diverged — known: outcome — unknown: which agent caused it',
    ],
    closure_mechanism: 'TRACE',  // root cause analysis, causal chain trace, fault tree
    closure_actions:   ['trace_causal_chain', 'run_fault_tree', 'diagnostic_deep_scan'],
    raid_cluster:      'diagnostic',
    escalation_path:   ['auto_trace', 'deep_scan', 'human_investigation'],
    never:             ['close_without_root_cause', 'treat_as_surface_bug'],
  },

  CONFLICT: {
    description: 'Two truths cannot simultaneously exist. Evidence contradicts evidence.',
    examples: [
      'memory says A, event_log says B',
      'contract says module is healthy, heartbeat says stale',
      'spec says function signature X, code implements Y',
    ],
    closure_mechanism: 'RECONCILE',  // evidence weighting, authoritative source selection
    closure_actions:   ['reconcile_evidence', 'pick_authoritative_source', 'request_human_adjudication'],
    raid_cluster:      'analysis',
    escalation_path:   ['reconcile', 'audit', 'human_decides'],
    never:             ['silently_pick_one', 'discard_either'],
  },

  DECISION: {
    description: 'Multiple valid actions exist. No winner. System cannot determine which to take.',
    examples: [
      'fix now vs wait vs rollback vs patch',
      'which agent to use when all are degraded',
      'respond now vs defer to gather more context',
    ],
    closure_mechanism: 'DECIDE',  // goal graph, cost analysis, constitutional review, reflection
    closure_actions:   ['goal_graph_eval', 'cost_analysis', 'constitutional_review', 'reflection'],
    raid_cluster:      'analysis',
    escalation_path:   ['cost_analysis', 'constitutional_review', 'human_decides'],
    never:             ['random_selection', 'default_to_first'],
  },

  INTEGRITY: {
    description: 'Trustworthiness of a component, record, or claim is uncertain.',
    examples: [
      'checksum mismatch',
      'spec drift detected',
      'contract violation — module claims healthy but fails health check',
      'forge patch applied but test suite not re-run',
    ],
    closure_mechanism: 'VERIFY',  // audit, validate, re-check, hash comparison
    closure_actions:   ['verify_checksum', 'audit_trail', 'validate_contract', 'rerun_tests'],
    raid_cluster:      'diagnostic',
    escalation_path:   ['auto_verify', 'audit', 'human_validation'],
    never:             ['assume_trust', 'skip_verification'],
  },

  RELATIONAL: {
    description: 'System lacks model alignment with a human. Intent unclear, signals contradictory, or user model outdated.',
    examples: [
      'User upset — cause unclear',
      'User says "yes" to a question that should be "no" given context',
      'User intent contradicts stated goal',
    ],
    closure_mechanism: 'DIALOGUE',  // observe, ask, update user model, wait
    closure_actions:   ['observe_pattern', 'ask_clarifying_question', 'update_user_model', 'hold_and_watch'],
    raid_cluster:      'general',
    escalation_path:   ['observe', 'ask', 'human_review'],
    never:             ['assume_user_intent', 'ignore_contradiction'],
  },

  TEMPORAL: {
    description: 'The correct answer exists but the system is not in the right state or time to act.',
    examples: [
      'module not booted yet — dependency not ready',
      'bus subscription before initialization (the Guardian boot bug)',
      'retry too soon after failure',
      'action scheduled for later, not now',
    ],
    closure_mechanism: 'WAIT',  // schedule, retry with backoff, hold
    closure_actions:   ['schedule', 'retry_with_backoff', 'hold_until_dependency_ready', 'poll'],
    raid_cluster:      'general',
    escalation_path:   ['wait', 'schedule', 'human_unblock'],
    never:             ['force_premature_execution', 'ignore_dependency_order'],
  },

  CONSTITUTIONAL: {
    description: 'The system cannot determine whether an action is permissible given its objective hierarchy.',
    examples: [
      'Request conflicts with constitutional axiom',
      'Forge patch would modify a Tier 3 module without human approval',
      'Healer auto-apply would bypass APPLY_PATCH=false constraint',
    ],
    closure_mechanism: 'REVIEW',  // constitutional check, goal review, human escalation
    closure_actions:   ['constitutional_review', 'goal_graph_check', 'human_escalation'],
    raid_cluster:      'forge',  // highest stakes routing
    escalation_path:   ['constitutional_review', 'human_must_decide'],
    never:             ['bypass_constitution', 'auto_approve'],
  },
};

// ── Loop states ───────────────────────────────────────────────────────────────
const LOOP_STATES = {
  OPEN:          'open',           // detected, not yet addressed
  HELD:          'held',           // intentionally preserved — known, not closing yet
  INVESTIGATING: 'investigating',  // active diagnosis underway
  ESCALATED:     'escalated',      // passed to higher system or human
  BLOCKED:       'blocked',        // cannot progress — dependency missing
  RESOLVED:      'resolved',       // closure condition met, evidence recorded
  ARCHIVED:      'archived',       // resolved + history preserved, no longer active
};

// The critical distinction:
// HELD     = We know the loop exists and are intentionally preserving it
// UNRESOLVED (absent from states) = We don't know how to close it
// UNRESOLVED is not a state — it is a condition that gets classified into a loop type

// ── Legacy gap type → loop type mapping ──────────────────────────────────────
// Translates every existing gap.type string into the canonical taxonomy.
// Preserved for backwards compatibility. All new gaps should use loop_type directly.
const LEGACY_TYPE_MAP = {
  // gap-finder
  stale_module:          'TEMPORAL',       // module not ready yet, not a code bug
  stuck_call:            'TEMPORAL',       // call stuck in wrong state — timing/ordering
  recurring_failure:     'CAUSAL',         // failure pattern — root cause unknown

  // heartbeat
  api_degraded:          'TEMPORAL',       // service not ready or temporarily down
  heartbeat_api_degraded:'TEMPORAL',

  // contract
  contract_violation:    'INTEGRITY',      // trust broken — needs verification
  contract_repeated_violation: 'INTEGRITY',

  // spec-drift
  spec_missing:          'KNOWLEDGE',      // spec doesn't exist
  spec_version_drift:    'INTEGRITY',      // spec exists but implementation diverged

  // behavioral-boundary
  behavioral_drift:      'CAUSAL',         // drift detected, cause unknown
  regime_degraded:       'CAUSAL',         // system regime shifted, cause unknown
  user_dissatisfaction:  'RELATIONAL',     // user signal of misalignment

  // RAID
  raid_ess_unresolve:    'CONFLICT',       // ESS role unresolvable — two configs conflict
  raid_routing_failure:  'DECISION',       // RAID could not pick an agent

  // intelligence-bridge
  high_friction:         'CAUSAL',         // friction accumulating — cause to trace
  co_occurrence:         'CAUSAL',         // pattern without causal explanation yet
  invariant:             'INTEGRITY',      // invariant violated

  // orion
  open_loop:             'DECISION',       // orion open loop → decision needed

  // self-heal
  forge_failed:          'CAUSAL',         // forge failed — why?
  failure_mode:          'CAUSAL',         // system entered failure mode

  // signals (still auto-resolve)
  'DELTA.TENSION':       'HELD',           // CFR tension — held, not actionable
  'delta.tension':       'HELD',
  tension:               'HELD',
  'cfr.tension':         'HELD',
  'cfr.delta':           'HELD',
  signal:                'HELD',
  observation:           'HELD',
  unknown:               'CAUSAL',         // unknown type — investigate root cause
};

// ── Classifier — maps a raw gap record to its loop type ──────────────────────
// Returns: { loop_type, loop_def, confidence, closure_mechanism, raid_cluster }
function classify(gap) {
  // 1. Explicit loop_type already set (new-style gaps)
  if (gap.loop_type && LOOP_TYPES[gap.loop_type]) {
    return {
      loop_type:         gap.loop_type,
      loop_def:          LOOP_TYPES[gap.loop_type],
      confidence:        gap.confidence || 0.9,
      closure_mechanism: LOOP_TYPES[gap.loop_type].closure_mechanism,
      raid_cluster:      LOOP_TYPES[gap.loop_type].raid_cluster,
    };
  }

  // 2. Legacy type mapping
  const legacyKey = (gap.type || '').replace(/[.-]/g, '_').toLowerCase();
  const mapped = LEGACY_TYPE_MAP[gap.type] || LEGACY_TYPE_MAP[legacyKey];
  if (mapped && LOOP_TYPES[mapped]) {
    return {
      loop_type:         mapped,
      loop_def:          LOOP_TYPES[mapped],
      confidence:        0.7,  // lower confidence — inferred from legacy type
      closure_mechanism: LOOP_TYPES[mapped].closure_mechanism,
      raid_cluster:      LOOP_TYPES[mapped].raid_cluster,
      legacy_type:       gap.type,
    };
  }

  // 3. Fallback — classify from body text
  const text = [gap.body, gap.type, gap.path].filter(Boolean).join(' ').toLowerCase();
  let loop_type = 'CAUSAL'; // safest default — something happened, investigate

  if (/not.*ready|not.*booted|timeout|retry|wait|pending|dependency|before.*init/i.test(text))
    loop_type = 'TEMPORAL';
  else if (/unknown|why|root.*cause|reason.*unclear|crash|unexpected/i.test(text))
    loop_type = 'CAUSAL';
  else if (/mismatch|conflict|contradict|both|neither|says.*but/i.test(text))
    loop_type = 'CONFLICT';
  else if (/checksum|drift|violation|invalid|broken.*contract|integrity/i.test(text))
    loop_type = 'INTEGRITY';
  else if (/cannot.*do|not.*supported|no.*engine|missing.*module|capability/i.test(text))
    loop_type = 'CAPABILITY';
  else if (/which.*action|what.*to.*do|decide|options|alternatives/i.test(text))
    loop_type = 'DECISION';
  else if (/user|human|intent.*unclear|upset|contradictory.*signal/i.test(text))
    loop_type = 'RELATIONAL';
  else if (/not.*found|missing.*data|no.*record|information.*unavailable/i.test(text))
    loop_type = 'KNOWLEDGE';
  else if (/permission|constitutional|axiom|allowed|forbidden|permissible/i.test(text))
    loop_type = 'CONSTITUTIONAL';
  else if (/understand|unclear|what.*mean|what.*is|reference.*missing/i.test(text))
    loop_type = 'UNDERSTANDING';

  return {
    loop_type,
    loop_def:          LOOP_TYPES[loop_type],
    confidence:        0.5,  // low confidence — inferred from body text
    closure_mechanism: LOOP_TYPES[loop_type].closure_mechanism,
    raid_cluster:      LOOP_TYPES[loop_type].raid_cluster,
    legacy_type:       gap.type,
    inferred:          true,
  };
}

// ── Builder — create a typed loop record ─────────────────────────────────────
// Use this instead of raw jaaDB.insert('gaps', ...) for new-style loops.
//
// createLoop({
//   loop_type:         'TEMPORAL',
//   source:            'gap-loop',
//   path:              'guardian/server.js',
//   body:              'bus subscription before initialization',
//   evidence:          ['bus.on called at line 842', 'bus declared at line 1466'],
//   dependencies:      ['event_bus'],
//   closure_condition: 'bus available before subscription phase',
//   severity:          'high',
// })
// ── Lazy-load gap-predicate (avoid circular dep — gap-predicate requires taxonomy) ──
let _gapPredicate = null;
function _getGapPredicate() {
  if (!_gapPredicate) try { _gapPredicate = require('../intelligence/gap/predicate'); } catch(_) {}
  return _gapPredicate;
}

function createLoop({
  loop_type,
  source,
  path       = '',
  body       = '',
  evidence   = [],
  dependencies     = [],
  closure_condition = '',
  severity         = 'medium',
  confidence       = 0.8,
  legacy_type      = null,
  causedBy         = null,
}) {
  if (!LOOP_TYPES[loop_type]) {
    throw new Error(`[open-loop-taxonomy] Unknown loop_type: '${loop_type}'. Must be one of: ${Object.keys(LOOP_TYPES).join(', ')}`);
  }

  const def = LOOP_TYPES[loop_type];

  const base = {
    // Standard gap fields (backwards compat)
    type:    loop_type,
    path,
    body,
    severity,
    status:  'pending',

    // Loop taxonomy fields
    loop_type,
    loop_id:           null,
    legacy_type:       legacy_type || null,
    confidence,
    evidence:          Array.isArray(evidence) ? evidence : [evidence].filter(Boolean),
    dependencies:      Array.isArray(dependencies) ? dependencies : [dependencies].filter(Boolean),
    closure_condition,
    closure_mechanism: def.closure_mechanism,
    closure_actions:   def.closure_actions,
    raid_cluster:      def.raid_cluster,
    escalation_path:   def.escalation_path,

    // Provenance
    source,
    causedBy,
    createdAt: Date.now(),
  };

  // §23.7 — gap-lifecycle.spec: enrich with predicate, artifact_requirement,
  // dedup_key, truth_floor, ttl_ms. enrichGap also does dedup check but
  // here we only add the fields — the dedup check happens at insert time
  // in the diagnostic service and reflection engine.
  const gp = _getGapPredicate();
  if (gp) {
    try {
      const { enriched_gap } = gp.enrichGap(base);
      if (enriched_gap) return enriched_gap;
    } catch(e) {
      // enrichment failed — return base (§1.2 log but never throw from createLoop)
      console.warn('[open-loop-taxonomy] §1.2 enrichGap failed (returning base):', e.message);
    }
  }

  return base;
}

// ── Lifecycle transitions ─────────────────────────────────────────────────────
// Validates that a state transition is legal.
const LEGAL_TRANSITIONS = {
  open:          ['held', 'investigating', 'escalated', 'blocked', 'resolved'],
  held:          ['open', 'investigating', 'escalated', 'resolved'],
  investigating: ['held', 'escalated', 'blocked', 'resolved'],
  escalated:     ['investigating', 'resolved', 'held'],
  blocked:       ['open', 'investigating', 'resolved'],
  resolved:      ['archived'],
  archived:      [],  // terminal
};

function canTransition(fromStatus, toStatus) {
  const allowed = LEGAL_TRANSITIONS[fromStatus] || [];
  return allowed.includes(toStatus);
}

function assertTransition(fromStatus, toStatus, loopId = '') {
  if (!canTransition(fromStatus, toStatus)) {
    throw new Error(
      `[open-loop-taxonomy] Illegal state transition: ${fromStatus} → ${toStatus}` +
      (loopId ? ` (loop: ${loopId})` : '')
    );
  }
}

// ── Summary — for diagnostic surfaces ────────────────────────────────────────
// Returns a human-readable summary of a loop record.
function summarize(gap) {
  const cls = classify(gap);
  return [
    `LOOP_ID:           ${gap.uuid || gap.loop_id || 'unknown'}`,
    `TYPE:              ${cls.loop_type}${cls.inferred ? ' (inferred)' : ''}`,
    `STATUS:            ${(gap.status || 'OPEN').toUpperCase()}`,
    `CONFIDENCE:        ${((cls.confidence || 0) * 100).toFixed(0)}%`,
    `CLOSURE:           ${cls.closure_mechanism}`,
    `EVIDENCE:          ${(gap.evidence || []).join('; ') || gap.body || '—'}`,
    `DEPENDENCIES:      ${(gap.dependencies || []).join(', ') || '—'}`,
    `CLOSURE_CONDITION: ${gap.closure_condition || '—'}`,
    `SOURCE:            ${gap.source || '—'}`,
  ].join('\n');
}

// ── Health signal — loop ecology summary ─────────────────────────────────────
// Intelligence ≠ few loops. Intelligence = accurate loop management.
// Returns a snapshot of the system's loop ecology for reflection + RAID.
function ecology(gaps = []) {
  const by_type   = {};
  const by_status = {};

  for (const g of gaps) {
    const cls = classify(g);
    by_type[cls.loop_type]   = (by_type[cls.loop_type]   || 0) + 1;
    by_status[g.status || 'open'] = (by_status[g.status || 'open'] || 0) + 1;
  }

  // Constitutional + Integrity loops are highest priority — they block everything else
  const critical = (by_type.CONSTITUTIONAL || 0) + (by_type.INTEGRITY || 0);
  // Temporal loops should self-resolve — if they're accumulating, boot order is wrong
  const temporal_accumulation = (by_type.TEMPORAL || 0) > 5;
  // Causal loops without resolution = intelligence is not tracing
  const causal_unresolved = gaps.filter(g => {
    const cls = classify(g);
    return cls.loop_type === 'CAUSAL' && g.status !== 'resolved' && g.status !== 'archived';
  }).length;

  return {
    total:        gaps.length,
    by_type,
    by_status,
    critical_count:       critical,
    temporal_accumulation,
    causal_unresolved,
    // System is healthy when it knows WHICH loops are open and WHY
    ecology_health: critical === 0 && !temporal_accumulation ? 'nominal' :
                    critical > 0                             ? 'degraded' :
                                                               'watch',
  };
}

module.exports = {
  LOOP_TYPES,
  LOOP_STATES,
  LEGACY_TYPE_MAP,
  classify,
  createLoop,
  canTransition,
  assertTransition,
  summarize,
  ecology,
};
