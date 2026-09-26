'use strict';
// ── lib/constitutional-ai.js ──────────────────────────────────────────────────
// UUID: nexus-constitutional-ai-v1-0000-4000-0000-000000000001
// Version: 1.0.0
// Phase: 10 — Constitutional AI
// Deps:  request-handler ✓ · gap-loop ✓ · jaa ✓
// Unlocks: Phase 11 (Reflection Engine) · Phase 12 (User Model) · Phase 13 (Autonomous Loop)
//
// Formalises the four axioms request-handler enforced implicitly (Phase 9, A4)
// into typed, independently-checkable objects. request-handler's inline
// _constitutionCheck() is replaced by check(req, ctx) from this module.
//
// §1.1  Every axiom check is a typed object — nothing silent, every violation logged
// §1.2  Nothing silent — every decision (pass or fail) is written to JAA
// §2.1  Persistence is the golden rule — constitution_decisions table, append-only
// §4.3  Enterprise-grade — blast_radius typed, cost estimated before action
// §5.3  No monkey patches — identity kernel is read-only here; Phase 11 is the
//       only writer, and only after N confirmed evidence items. This module
//       never mutates IDENTITY_KERNEL itself.
//
// ── OUTCOME CONTRACT ─────────────────────────────────────────────────────────
// check(req, ctx) → {
//   pass:        boolean
//   reason:      string  — human-readable, always present (EXPLAINABILITY)
//   axiom:       string  — which axiom produced this result
//   severity:    'block' | 'warn' | 'flag'
//   blast_radius:'none' | 'local' | 'system' | 'irreversible'
//   cost:        number  — COST_TIERS value, 0 if not applicable
//   alternatives:string[] — what the caller could do instead
// }
//
// Misaligned goal-graph intent → HELD, never DENIED. The user may be right;
// the system simply hasn't confirmed alignment. DENIED is reserved for hard
// axiom violations only.

const crypto = require('crypto');

const MODULE_ID = 'constitutional-ai';
const VERSION   = '1.0.0';

// ── Lazy-load dependencies (never block boot) ─────────────────────────────────
let _jaa, _uid, _bus, _taxonomy;

function _getJAA() {
  if (_jaa) return _jaa;
  try { ({ jaaDB: _jaa, uid: _uid } = require('../cortex/memory/jaa-db')); } catch (_) {}
  return _jaa;
}
function uid() { return _uid?.() ?? crypto.randomUUID(); }

function _getBus() {
  if (_bus) return _bus;
  try { _bus = require('../nexus/nexus-bus'); } catch (_) {}
  return _bus;
}
function _getTaxonomy() {
  if (_taxonomy) return _taxonomy;
  try { _taxonomy = require('./open-loop-taxonomy'); } catch (_) {}
  return _taxonomy;
}

// ── Severity / blast radius vocab (§4.3 — typed, not strings invented per-call) ─
const SEVERITY = {
  BLOCK: 'block',   // hard stop — outcome must be DENIED
  WARN:  'warn',    // proceed, but flagged loudly — outcome may be HELD
  FLAG:  'flag',    // informational, does not block — outcome stays RESOLVED
};

const BLAST_RADIUS = {
  NONE:        'none',
  LOCAL:       'local',         // affects one module/component
  SYSTEM:      'system',        // affects multiple systems
  IRREVERSIBLE:'irreversible',  // cannot be undone
};

// ── IDENTITY KERNEL — read-only ────────────────────────────────────────────────
// What NEXUS is / is not / will not do. Frozen at module load.
//
// §5.3 — this object is never mutated by this module, by request-handler, or
// by any caller. The only sanctioned writer is Phase 11 (lib/reflection.js),
// and only via the gap system after N confirmed evidence items — never a
// direct write. Phase 11 does not exist yet, so today this kernel has no
// write path at all. That absence is intentional, not an oversight.
const IDENTITY_KERNEL = Object.freeze({
  uuid: 'bp_001.identity.kernel.v1',
  is: Object.freeze([
    'A sovereign cognitive OS that reasons about its own requests before acting',
    'A system that prefers reversible action and surfaces uncertainty honestly',
    'A system whose every decision is logged, UUID-stamped, and explainable',
  ]),
  is_not: Object.freeze([
    'An autonomous agent free to act without a logged, checkable decision trail',
    'A system that fabricates confidence to appear more capable than it is',
  ]),
  will_not: Object.freeze([
    'Call external AI APIs directly (NCP browser-tab inference only)',
    'Delete or roll back data without explicit confirmation',
    'Execute a FORGE action without a declared provider',
    'Silently discard an UNRESOLVED or HELD outcome',
  ]),
  writable_by: 'Phase 11 (reflection engine) only — via gap system, after N confirmed evidence items',
  frozen_at: 'Phase 10 boot',
});

function getIdentityKernel() {
  // Defensive: callers receive the frozen object directly. Object.freeze is
  // shallow-safe here because every nested array is itself frozen above.
  return IDENTITY_KERNEL;
}

// ── Goal graph ──────────────────────────────────────────────────────────────
// Maps intent → cluster, checks alignment with system objectives.
// This intentionally overlaps with request-handler's old _goalGraphCheck —
// that logic now lives here as the canonical version; request-handler calls
// into this module instead of its own inline copy.
function checkGoalAlignment(intent, jaa) {
  if (!jaa) return { aligned: true, reason: 'no-jaa-available' };

  // Destructive actions on a healthy system, with no corroborating fault → flag misalignment.
  if (intent.action === 'delete' || intent.action === 'rollback') {
    let openFaults = [];
    try { openFaults = jaa.query('fault_taxonomy', r => r.friction > 0.8, 5); } catch (_) {}
    if (!openFaults.length) {
      return {
        aligned: false,
        reason:  'Destructive action requested with no active fault recorded. Goal graph cannot confirm this serves a current objective.',
        cluster: intent.target || 'general',
      };
    }
  }

  return { aligned: true, reason: 'goal-aligned', cluster: intent.target || 'general' };
}

// ── AXIOM: USER_AUTONOMY ───────────────────────────────────────────────────────
// User intent is respected unless it violates the constitution.
// This axiom's job is narrow: it never blocks on its own. It exists so the
// other three axioms have something explicit to override, and so every
// DENY produced elsewhere can name what was being weighed against what.
const USER_AUTONOMY = {
  name: 'USER_AUTONOMY',
  check(req, ctx) {
    return {
      pass: true,
      reason: 'User intent is respected by default.',
      axiom: 'USER_AUTONOMY',
      severity: SEVERITY.FLAG,
      blast_radius: BLAST_RADIUS.NONE,
      cost: 0,
      alternatives: [],
    };
  },
};

// ── AXIOM: REVERSIBILITY ───────────────────────────────────────────────────────
// Prefer reversible actions. Flag and require confirmation for irreversible ones.
const REVERSIBILITY = {
  name: 'REVERSIBILITY',
  check(req, ctx) {
    const { intent } = ctx;
    const irreversible = intent.action === 'delete' || intent.action === 'rollback';

    if (irreversible && !req.confirmed) {
      return {
        pass: false,
        reason: 'Irreversible action requires explicit confirmation. Set req.confirmed = true.',
        axiom: 'REVERSIBILITY',
        severity: SEVERITY.BLOCK,
        blast_radius: BLAST_RADIUS.IRREVERSIBLE,
        cost: 0,
        alternatives: ['confirm explicitly', 'snapshot first, then retry', 'use a reversible alternative if one exists'],
      };
    }

    if (irreversible && req.confirmed) {
      return {
        pass: true,
        reason: 'Irreversible action explicitly confirmed by caller.',
        axiom: 'REVERSIBILITY',
        severity: SEVERITY.WARN,
        blast_radius: BLAST_RADIUS.IRREVERSIBLE,
        cost: 0,
        alternatives: [],
      };
    }

    return {
      pass: true,
      reason: 'Action is reversible.',
      axiom: 'REVERSIBILITY',
      severity: SEVERITY.FLAG,
      blast_radius: intent.action === 'forge' ? BLAST_RADIUS.LOCAL : BLAST_RADIUS.NONE,
      cost: 0,
      alternatives: [],
    };
  },
};

// ── AXIOM: TRUTH_OVER_COHERENCE ─────────────────────────────────────────────────
// Surface uncertainty. Never fabricate confidence.
// Operates on ctx.intentObj.confidence when Phase 45's intent classifier ran;
// falls back to a pass when that confidence signal isn't available — this
// axiom can only check what it can see, and silently assuming high
// confidence is exactly the failure mode it exists to prevent.
const TRUTH_OVER_COHERENCE = {
  name: 'TRUTH_OVER_COHERENCE',
  check(req, ctx) {
    const confidence = ctx.intentObj?.confidence;

    if (typeof confidence === 'number' && confidence < 0.5) {
      return {
        pass: false,
        reason: `Intent confidence (${confidence.toFixed(2)}) is too low to proceed without surfacing uncertainty. Clarify before acting.`,
        axiom: 'TRUTH_OVER_COHERENCE',
        severity: SEVERITY.WARN,
        blast_radius: BLAST_RADIUS.NONE,
        cost: 0,
        alternatives: ['ask for clarification', 'proceed with explicit low-confidence flag visible to the user'],
      };
    }

    return {
      pass: true,
      reason: typeof confidence === 'number'
        ? `Intent confidence (${confidence.toFixed(2)}) sufficient.`
        : 'No confidence signal available to evaluate — passing by default, not fabricating certainty.',
      axiom: 'TRUTH_OVER_COHERENCE',
      severity: SEVERITY.FLAG,
      blast_radius: BLAST_RADIUS.NONE,
      cost: 0,
      alternatives: [],
    };
  },
};

// ── AXIOM: EXPLAINABILITY ───────────────────────────────────────────────────────
// Every DENY/DEFER/HELD must have a UUID + human-readable reason.
// This axiom is the meta-check — it verifies the other three did their job,
// not the caller's request itself.
const EXPLAINABILITY = {
  name: 'EXPLAINABILITY',
  check(req, ctx) {
    // Forge actions without a declared provider can't be explained after the fact —
    // there's no record of who/what produced the result.
    if (ctx.intent?.action === 'forge' && !req.provider && !req.skipProvider) {
      return {
        pass: false,
        reason: 'Forge actions require a declared provider (ollama | claude | chatgpt) so the outcome is attributable. Set req.provider.',
        axiom: 'EXPLAINABILITY',
        severity: SEVERITY.BLOCK,
        blast_radius: BLAST_RADIUS.LOCAL,
        cost: 0,
        alternatives: ['set req.provider', 'set req.skipProvider = true for internal/test calls'],
      };
    }

    return {
      pass: true,
      reason: 'Outcome will be attributable and logged.',
      axiom: 'EXPLAINABILITY',
      severity: SEVERITY.FLAG,
      blast_radius: BLAST_RADIUS.NONE,
      cost: 0,
      alternatives: [],
    };
  },
};

const AXIOMS = [USER_AUTONOMY, REVERSIBILITY, TRUTH_OVER_COHERENCE, EXPLAINABILITY];

// ── Decision logging (§1.2 — nothing silent) ───────────────────────────────────
function _logDecision(decision, ctx) {
  const jaa = _getJAA();
  const bus = _getBus();
  const record = {
    uuid: uid(),
    requestId: ctx?.requestId || null,
    axiom: decision.axiom,
    pass: decision.pass,
    reason: decision.reason,
    severity: decision.severity,
    blast_radius: decision.blast_radius,
    cost: decision.cost,
    alternatives: decision.alternatives,
    ts: Date.now(),
  };

  if (jaa) {
    try { jaa.insert('constitution_decisions', record); } catch (_) {}
  }
  if (bus?.emit) {
    try { bus.emit('constitution.decision', { axiom: decision.axiom, pass: decision.pass, requestId: ctx?.requestId }); } catch (_) {}
  }
  return record;
}

// ── Main entry point ──────────────────────────────────────────────────────────
// check(req, ctx) → single combined result for request-handler's Phase A4.
//
// Runs the goal graph first (HELD, not DENIED, on misalignment), then every
// axiom in order. First BLOCK-severity failure wins and short-circuits the
// remaining axioms — there is no point computing alternatives for axioms
// that were never reached. All results, pass or fail, are logged.
//
// ctx is the request-handler ctx object: { intent, jaa, requestId, intentObj, ... }
function check(req = {}, ctx = {}) {
  const jaa = ctx.jaa || _getJAA();
  const intent = ctx.intent;

  if (!intent) {
    const errDecision = {
      pass: false,
      reason: 'constitutional-ai.check() called without ctx.intent — request-handler must extract intent first.',
      axiom: 'EXPLAINABILITY',
      severity: SEVERITY.BLOCK,
      blast_radius: BLAST_RADIUS.NONE,
      cost: 0,
      alternatives: [],
    };
    _logDecision(errDecision, ctx);
    return errDecision;
  }

  // ── Goal graph — misaligned → HELD, never DENIED ──────────────────────────
  const goal = checkGoalAlignment(intent, jaa);
  if (!goal.aligned) {
    const heldDecision = {
      pass: false,
      reason: goal.reason,
      axiom: 'GOAL_GRAPH',
      severity: SEVERITY.WARN,       // WARN, not BLOCK — this is HELD territory, not DENIED
      blast_radius: BLAST_RADIUS.NONE,
      cost: 0,
      alternatives: ['confirm intent explicitly', 'provide the corroborating fault/context'],
      held: true,
      cluster: goal.cluster,
    };
    _logDecision(heldDecision, ctx);

    // Open a CONSTITUTIONAL loop so this misalignment is tracked, not just returned.
    const taxonomy = _getTaxonomy();
    if (taxonomy && jaa) {
      try {
        const loop = taxonomy.createLoop({
          loop_type: 'CONSTITUTIONAL',
          source: MODULE_ID,
          path: `request/${ctx.requestId?.slice(0, 8) || 'unknown'}`,
          body: `Goal graph misalignment: ${intent.action} ${intent.target || ''}`.trim(),
          evidence: [goal.reason],
          closure_condition: 'User confirms intent explicitly, or corroborating fault context is provided.',
          causedBy: ctx.requestId,
        });
        jaa.insert('gaps', { uuid: uid(), ...loop, createdAt: Date.now() });
      } catch (_) {}
    }

    return heldDecision;
  }

  // ── Run every axiom, log every result, short-circuit on first BLOCK ──────
  for (const axiomDef of AXIOMS) {
    let result;
    try {
      result = axiomDef.check(req, ctx);
    } catch (e) {
      result = {
        pass: false,
        reason: `Axiom ${axiomDef.name} threw during check: ${e.message}`,
        axiom: axiomDef.name,
        severity: SEVERITY.BLOCK,
        blast_radius: BLAST_RADIUS.NONE,
        cost: 0,
        alternatives: [],
      };
    }

    _logDecision(result, ctx);

    if (!result.pass && result.severity === SEVERITY.BLOCK) {
      return result;
    }
  }

  // All axioms passed (or only warned/flagged, never blocked).
  return {
    pass: true,
    reason: 'All constitutional axioms satisfied.',
    axiom: 'ALL',
    severity: SEVERITY.FLAG,
    blast_radius: BLAST_RADIUS.NONE,
    cost: 0,
    alternatives: [],
  };
}

// ── Boot validation ───────────────────────────────────────────────────────────
function validateWiring() {
  const checks = {
    jaa: !!_getJAA(),
    bus: !!_getBus(),
    taxonomy: !!_getTaxonomy(),
  };
  const online = Object.values(checks).filter(Boolean).length;
  console.log(`[${MODULE_ID}] wiring: ${online}/${Object.keys(checks).length} systems reachable`);
  return checks;
}

module.exports = {
  check,
  checkGoalAlignment,
  getIdentityKernel,
  validateWiring,
  AXIOMS,
  SEVERITY,
  BLAST_RADIUS,
  MODULE_ID,
  VERSION,
};
