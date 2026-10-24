'use strict';
// ── lib/adversary-suite.js ────────────────────────────────────────────────────
// UUID: nexus-adversary-suite-v1-0000-4000-0000-000000000001
// Version: 1.0.0
// Phase: 25 — RAID Compartment Engine, sub-step 4
// Deps:  compartment-engine ✓ (registers into) · intent-classifier ✓ (risk_level)
//
// Six attack classes (per spec): syntax · logic · edge-case · state ·
// cross-domain · stress. Plus QA/QC: syntax · schema · type · invariant ·
// deterministic replay.
//
// ── WHAT THIS ACTUALLY CHECKS (not theater) ─────────────────────────────────
// There is no LLM-generated-code sandbox to attack yet — compartments
// execute an arbitrary JS `executor` callback (see compartment-engine.js),
// not freeform model output. Every check below operates on real, available
// data: the compartment's result, its constraint_frame, its trace_log, and
// (for stress/replay) actually re-invoking the executor. None of these
// checks are stubs that always pass — each one can genuinely produce a
// violation given the right input, and each is exercised both ways in
// tests/modules/adversary-suite.test.js.
//
// risk_level scales intensity (per spec: "IRREVERSIBLE -> max adversary
// suite") — higher-risk intents get more stress iterations and stricter
// cross-domain/state checks, not a different set of checks.
//
// §1.1  Every violation found is structured: { type, detail, attackClass }
// §1.2  failure_modes recorded even on PASS runs — see attackResults below

const INTENSITY_BY_RISK = {
  READ:         { stressIterations: 1, strictBoundary: false },
  COMPUTE:      { stressIterations: 1, strictBoundary: false },
  LLM_LOCAL:    { stressIterations: 2, strictBoundary: true  },
  LLM_REMOTE:   { stressIterations: 2, strictBoundary: true  },
  FORGE:        { stressIterations: 3, strictBoundary: true  },
  IRREVERSIBLE: { stressIterations: 5, strictBoundary: true  },
};
const DEFAULT_INTENSITY = { stressIterations: 1, strictBoundary: false };

function _intensityFor(riskCeiling) {
  return INTENSITY_BY_RISK[riskCeiling] || DEFAULT_INTENSITY;
}

// ── Attack class 1: SYNTAX ────────────────────────────────────────────────────
// Does the result serialize cleanly? Circular references, functions where
// data is expected, and other structurally broken output are real,
// mechanically detectable problems — this is not a stand-in for "looks ok."
function _attackSyntax(compartment) {
  const result = compartment.result;
  if (result === undefined) return null; // nothing to check — not itself a violation
  try {
    JSON.stringify(result);
    return null;
  } catch (e) {
    return { type: 'syntax', attackClass: 'syntax', detail: `result does not serialize cleanly: ${e.message}` };
  }
}

// ── Attack class 2: LOGIC ────────────────────────────────────────────────────
// Does the result's shape match what the intent's execution_class implies?
// A DETERMINISTIC/READ intent producing a result that claims to have
// mutated something is a logic violation worth flagging — the executor said
// one thing, the constraint frame's risk ceiling implies another.
function _attackLogic(compartment) {
  const result = compartment.result;
  const riskCeiling = compartment.constraint_frame?.risk_ceiling;
  if (!result || typeof result !== 'object') return null;

  const claimsMutation = result.mutated === true || result.deleted === true || result.wrote === true;
  if (claimsMutation && (riskCeiling === 'READ' || riskCeiling === 'COMPUTE')) {
    return {
      type: 'logic', attackClass: 'logic',
      detail: `result claims a mutation (mutated/deleted/wrote) but risk_ceiling is ${riskCeiling} — READ/COMPUTE intents should never mutate`,
    };
  }
  return null;
}

// ── Attack class 3: EDGE-CASE ────────────────────────────────────────────────────
// Probes for missing-but-expected fields. An executor that resolves
// successfully (PASS-bound) but returns null/undefined when the compartment
// clearly expected output is an edge case worth surfacing, not silently
// passing through as a "successful" empty result.
function _attackEdgeCase(compartment) {
  if (compartment._executionError) return null; // already handled by FAIL path upstream
  const result = compartment.result;
  if (result === null || result === undefined) {
    return { type: 'edge_case', attackClass: 'edge-case', detail: 'executor completed without throwing but returned null/undefined — ambiguous success' };
  }
  return null;
}

// ── Attack class 4: STATE ────────────────────────────────────────────────────
// The actual frame-violation check. Did the result indicate it touched
// anything outside the declared boundary? This is the one check whose
// violation type is literally 'frame_violation' — the only thing that
// routes to DELETE rather than recoverable FAIL, per compartment-engine's
// contract.
function _attackState(compartment, intensity) {
  const result = compartment.result;
  const boundary = compartment.constraint_frame?.boundary;
  if (!result || typeof result !== 'object' || !boundary) return null;

  const touchedPaths = Array.isArray(result.touchedPaths) ? result.touchedPaths : [];
  const touchedSystems = Array.isArray(result.touchedSystems) ? result.touchedSystems : [];

  const declaredPaths = boundary.paths || [];
  const declaredSystems = boundary.systems || [];

  // boundary.paths/systems declare what this compartment is NOT allowed to
  // touch (per spec: "written scope limit — what this compartment is NOT
  // allowed to touch"). Any overlap is a frame violation.
  const pathViolation = touchedPaths.find(p => declaredPaths.includes(p));
  const systemViolation = touchedSystems.find(s => declaredSystems.includes(s));

  if (pathViolation || systemViolation) {
    return {
      type: 'frame_violation', attackClass: 'state',
      detail: `compartment touched a boundary-excluded ${pathViolation ? `path (${pathViolation})` : `system (${systemViolation})`}`,
    };
  }

  // strictBoundary (higher-risk intents): also flag touching ANYTHING not
  // explicitly pre-declared as in-scope, if the executor reported scope at
  // all. Lower-risk intents get the benefit of the doubt when scope simply
  // wasn't reported — most read/compute executors won't bother.
  if (intensity.strictBoundary && (touchedPaths.length || touchedSystems.length) && !boundary.allowAny) {
    const inScope = (boundary.inScopePaths || []);
    const outOfScope = touchedPaths.filter(p => !inScope.includes(p));
    if (outOfScope.length) {
      return {
        type: 'frame_violation', attackClass: 'state',
        detail: `compartment touched paths not pre-declared as in-scope: ${outOfScope.join(', ')}`,
      };
    }
  }

  return null;
}

// ── Attack class 5: CROSS-DOMAIN ────────────────────────────────────────────────
// Did the result reference a domain other than the intent's declared
// domain? A compartment spawned for intent.domain='cortex' producing a
// result that explicitly claims domain='guardian' is exactly the kind of
// scope creep this check exists to catch.
function _attackCrossDomain(compartment) {
  const result = compartment.result;
  if (!result || typeof result !== 'object' || !result.domain) return null;
  const declaredDomain = compartment._declaredDomain || null;
  if (declaredDomain && result.domain !== declaredDomain) {
    return {
      type: 'cross_domain', attackClass: 'cross-domain',
      detail: `result claims domain "${result.domain}" but compartment was spawned for domain "${declaredDomain}"`,
    };
  }
  return null;
}

// ── Attack class 6: STRESS ────────────────────────────────────────────────────
// Re-invokes the executor N times (scaled by risk intensity) to check for
// non-determinism or instability under repetition. This genuinely re-runs
// code — it is not a timer-only check. A budget.timeMs ceiling, if
// declared, is also enforced here.
async function _attackStress(compartment, intensity, executor) {
  if (!executor || intensity.stressIterations <= 1) return null;

  const results = [];
  const start = Date.now();
  for (let i = 0; i < intensity.stressIterations; i++) {
    try {
      const r = await executor(compartment.working_memory, compartment.constraint_frame);
      results.push(JSON.stringify(r));
    } catch (e) {
      return { type: 'stress', attackClass: 'stress', detail: `executor threw on stress-repetition ${i + 1}/${intensity.stressIterations}: ${e.message}` };
    }
  }
  const elapsed = Date.now() - start;

  const budgetMs = compartment.constraint_frame?.budget?.timeMs;
  if (budgetMs && elapsed > budgetMs) {
    return { type: 'stress', attackClass: 'stress', detail: `${intensity.stressIterations} repetitions took ${elapsed}ms, exceeding declared budget.timeMs (${budgetMs})` };
  }

  const unique = new Set(results);
  if (unique.size > 1) {
    return { type: 'logic', attackClass: 'stress', detail: `non-deterministic output across ${intensity.stressIterations} repetitions of the same input (${unique.size} distinct results)` };
  }

  return null;
}

// ── Adversary suite entry point — registered into compartment-engine ───────────
async function runAdversarySuite(compartment, executor = null) {
  const riskCeiling = compartment.constraint_frame?.risk_ceiling;
  const intensity = _intensityFor(riskCeiling);

  const checks = [
    _attackSyntax(compartment),
    _attackLogic(compartment),
    _attackEdgeCase(compartment),
    _attackState(compartment, intensity),
    _attackCrossDomain(compartment),
  ];

  if (executor) {
    checks.push(await _attackStress(compartment, intensity, executor));
  }

  const violations = checks.filter(Boolean);

  return {
    ran: true,
    intensity,
    riskCeiling,
    violations,
    attackResults: [
      { class: 'syntax',       violated: !!checks[0] },
      { class: 'logic',        violated: !!checks[1] },
      { class: 'edge-case',    violated: !!checks[2] },
      { class: 'state',        violated: !!checks[3] },
      { class: 'cross-domain', violated: !!checks[4] },
      { class: 'stress',       violated: executor ? !!checks[5] : null }, // null = not run, not "passed"
    ],
  };
}

// ── QA/QC layer — syntax · schema · type · invariant · deterministic replay ────
// Distinct from the adversary suite: adversary tries to find a way to break
// the result; QA/QC verifies the result actually meets baseline structural
// requirements. Both run; either can independently cause a FAIL.
function runQAQC(compartment) {
  const result = compartment.result;

  const checks = {
    syntax: (() => { try { JSON.stringify(result); return true; } catch (_) { return false; } })(),
    schema: result === undefined || result === null || typeof result === 'object',
    type:   compartment._executionError ? false : true,
    invariant: compartment.status === 'RUNNING', // compartment must still be RUNNING when QA/QC runs — anything else means resolve() was called out of order
  };

  // Deterministic replay: actual re-execution is handled by the adversary
  // suite's stress class when an executor is available (it already checks
  // output stability across repetitions). QA/QC's replay check here covers
  // the part of "deterministic replay" that's a pure structural check
  // rather than a re-execution: the trace must not already contain a
  // resolution event before this point — exactly one will be appended
  // after this function returns.
  const resolutionEvents = compartment.trace_log.filter(t => ['PASS', 'FAIL', 'DELETE'].includes(t.event));
  checks.deterministic_replay = resolutionEvents.length === 0;

  return { ran: true, checks };
}

module.exports = {
  runAdversarySuite, runQAQC,
  _attackSyntax, _attackLogic, _attackEdgeCase, _attackState, _attackCrossDomain, _attackStress,
  INTENSITY_BY_RISK,
  MODULE_ID: 'adversary-suite', VERSION: '1.0.0',
};
