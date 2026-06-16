'use strict';
// ── lib/loop-topology.js ──────────────────────────────────────────────────────
// UUID: nexus-loop-topology-v1-0000-4000-0000-000000000001
// Version: 1.0.0
//
// INSIGHT: Real systems don't fail independently.
//
//           Root Cause X
//          /     |      \
//    Loop A   Loop B   Loop C
//       |        |        |
//   Symptom  Symptom  Symptom
//
// The highest-leverage action is rarely "close Loop A".
// It's "find Root Cause X" — because closing X collapses A, B, and C.
//
// This module takes a set of open loops and finds their focal points:
// the shared causal ancestors or structural dependencies that, if resolved,
// would collapse the greatest number of open loops simultaneously.
//
// OUTPUT: A ranked list of FOCAL_POINTs, each with:
//   - affected_loops   which open loops it explains
//   - leverage_score   affected × confidence × recurrence ÷ repair_cost
//   - evidence         why we believe this is a focal point
//   - suggested_action what resolution looks like
//
// LIFECYCLE ADDITION: loops themselves evolve as evidence accumulates.
//   Initial:  { type: TEMPORAL, evidence: ['bus undefined'], confidence: 0.5 }
//   After scan: { type: CAUSAL, evidence: [...+3 more], confidence: 0.72 }
// The loop is the authority. Not the handler. Not the owner.
//
// §1.1 Nothing exists until proven — focal points require ≥2 loops + evidence
// §1.2 Nothing silently fails — every topology run logged
// §4.3 Enterprise-grade: blast radius, dependency graph, friction all consulted

const { DEPENDENCY_GRAPH } = (() => {
  try { return require('./diagnostic-engines'); }
  catch(_) { return { DEPENDENCY_GRAPH: {} }; }
})();

const { classify } = (() => {
  try { return require('./open-loop-taxonomy'); }
  catch(_) { return { classify: (g) => ({ loop_type: g.loop_type || 'CAUSAL', confidence: 0.5 }) }; }
})();

const MODULE_ID = 'loop-topology';
const VERSION   = '1.0.0';

// ── Repair cost estimates by loop type ────────────────────────────────────────
// Lower = cheaper to fix. Used in leverage score denominator.
// Cost is relative effort, not time. 1.0 = safe idempotent action. 5.0 = human + code rewrite.
const REPAIR_COST = {
  TEMPORAL:      1.0,  // wait / retry / schedule
  KNOWLEDGE:     1.5,  // retrieve / search
  UNDERSTANDING: 1.5,  // ask / clarify
  RELATIONAL:    2.0,  // dialogue / observe
  DECISION:      2.0,  // goal graph eval
  CAPABILITY:    3.0,  // build or install module
  INTEGRITY:     2.5,  // audit / validate
  CONFLICT:      3.0,  // evidence reconciliation
  CAUSAL:        3.5,  // root cause trace
  CONSTITUTIONAL:4.0,  // human must decide
};

// ── Source extraction — what system/module emitted this loop ──────────────────
function _extractSource(loop) {
  const src = loop.source || loop.path || '';
  // Normalize to system name: 'cortex/healer' → 'cortex', 'guardian/server' → 'guardian'
  return src.split('/')[0].replace(/[._-].*/,'') || 'unknown';
}

// ── Extract tokens from a loop for intersection analysis ─────────────────────
// Returns the set of structural tokens this loop carries:
// source systems, module paths, error patterns, dependency names.
function _loopTokens(loop) {
  const tokens = new Set();

  // Source system
  const src = _extractSource(loop);
  if (src && src !== 'unknown') tokens.add(`sys:${src}`);

  // Path segments
  const pathParts = (loop.path || '').split('/').filter(Boolean);
  for (const p of pathParts) tokens.add(`path:${p}`);

  // Body keywords — normalized
  const body = (loop.body || '').toLowerCase();
  const keywords = body.match(/\b([a-z_]{4,})\b/g) || [];
  const STOP = new Set(['that','this','with','have','been','from','into',
    'error','fail','found','open','loop','gap','null','true','false','undefined']);
  for (const kw of keywords) {
    if (!STOP.has(kw)) tokens.add(`kw:${kw}`);
  }

  // Dependencies from dependency graph
  const deps = DEPENDENCY_GRAPH[src] || [];
  for (const d of deps) tokens.add(`dep:${d}`);

  // Loop type
  const cls = classify(loop);
  tokens.add(`type:${cls.loop_type}`);

  // causedBy chain
  if (loop.causedBy) tokens.add(`cause:${loop.causedBy}`);

  return tokens;
}

// ── Focal point detection ─────────────────────────────────────────────────────
// A focal point is a shared token (system, path segment, keyword, dependency)
// that appears in multiple open loops. The more loops share a token, the
// more leverage closing that focal point has.
function detectFocalPoints(loops) {
  if (!loops || loops.length < 2) return [];

  // Build token → [loop_uuids] index
  const tokenIndex = {};
  for (const loop of loops) {
    const tokens = _loopTokens(loop);
    for (const tok of tokens) {
      if (!tokenIndex[tok]) tokenIndex[tok] = [];
      tokenIndex[tok].push(loop.uuid || loop.loop_id || String(Math.random()));
    }
  }

  // Find tokens that appear in ≥2 loops
  const candidates = Object.entries(tokenIndex)
    .filter(([, uuids]) => uuids.length >= 2)
    .map(([token, uuids]) => ({ token, loop_count: uuids.length, loop_uuids: [...new Set(uuids)] }));

  if (!candidates.length) return [];

  // Group overlapping candidates into focal points
  // Two candidates belong to the same focal point if they share ≥1 loop
  const focalPoints = [];
  const claimed = new Set();

  // Sort by loop_count descending — highest intersection first
  candidates.sort((a, b) => b.loop_count - a.loop_count);

  for (const cand of candidates) {
    // Check if this candidate overlaps significantly with an existing focal point
    let merged = false;
    for (const fp of focalPoints) {
      const overlap = cand.loop_uuids.filter(u => fp.loop_uuids.includes(u));
      if (overlap.length >= Math.min(2, cand.loop_uuids.length * 0.5)) {
        // Merge into existing focal point
        fp.tokens.add(cand.token);
        for (const u of cand.loop_uuids) {
          if (!fp.loop_uuids.includes(u)) fp.loop_uuids.push(u);
        }
        merged = true;
        break;
      }
    }
    if (!merged) {
      focalPoints.push({
        tokens:     new Set([cand.token]),
        loop_uuids: [...cand.loop_uuids],
      });
    }
  }

  // Score each focal point
  const scored = focalPoints.map(fp => _scoreFocalPoint(fp, loops));

  // Sort by leverage_score descending
  return scored.sort((a, b) => b.leverage_score - a.leverage_score);
}

// ── Score a focal point ───────────────────────────────────────────────────────
// LEVERAGE_SCORE = affected_loops × avg_confidence × recurrence_factor ÷ repair_cost
//
// This measures: how much uncertainty collapses per unit effort?
// That's the question a diagnostician actually asks.
function _scoreFocalPoint(fp, allLoops) {
  const affectedLoops = allLoops.filter(l =>
    fp.loop_uuids.includes(l.uuid || l.loop_id || '')
  );

  const n = affectedLoops.length;
  if (n === 0) return null;

  // Average confidence across affected loops
  const avgConfidence = affectedLoops.reduce((sum, l) => {
    const cls = classify(l);
    return sum + (cls.confidence || l.confidence || 0.5);
  }, 0) / n;

  // Recurrence factor — loops that have been attempted before are more certain
  const avgAttempts = affectedLoops.reduce((sum, l) => sum + (l.attempts || 0), 0) / n;
  const recurrenceFactor = Math.min(2.0, 1.0 + Math.log1p(avgAttempts) * 0.5);

  // Repair cost — use lowest-cost loop type in the set (prefer the easiest path in)
  const minRepairCost = affectedLoops.reduce((min, l) => {
    const cls = classify(l);
    const cost = REPAIR_COST[cls.loop_type] || 3.0;
    return Math.min(min, cost);
  }, Infinity);

  // Friction sum — high-friction focal points are more urgent
  const frictionSum = affectedLoops.reduce((sum, l) => sum + (l.friction || 0), 0);

  const leverage_score = Math.round(
    (n * avgConfidence * recurrenceFactor * (1 + frictionSum * 0.1)) / minRepairCost * 1000
  ) / 1000;

  // Infer what the focal point represents from its token set
  const tokens = [...fp.tokens];
  const sysToks = tokens.filter(t => t.startsWith('sys:')).map(t => t.slice(4));
  const pathToks = tokens.filter(t => t.startsWith('path:')).map(t => t.slice(5));
  const kwToks   = tokens.filter(t => t.startsWith('kw:')).map(t => t.slice(3)).slice(0, 5);
  const depToks  = tokens.filter(t => t.startsWith('dep:')).map(t => t.slice(4));
  const typeToks = tokens.filter(t => t.startsWith('type:')).map(t => t.slice(5));

  // Determine the focal point's structural identity
  const identity = _inferIdentity(sysToks, pathToks, kwToks, depToks, typeToks, affectedLoops);

  // Build evidence list
  const evidence = [
    n > 1 ? `${n} loops share this focal point` : null,
    sysToks.length ? `systems involved: ${sysToks.join(', ')}` : null,
    depToks.length ? `dependency chain: ${depToks.join(' → ')}` : null,
    kwToks.length  ? `common signal: ${kwToks.slice(0,3).join(', ')}` : null,
    avgAttempts > 0 ? `${Math.round(avgAttempts)} avg attempts — recurring` : null,
    frictionSum > 0 ? `friction accumulated: ${frictionSum.toFixed(2)}` : null,
  ].filter(Boolean);

  return {
    focal_id:      `focal:${tokens.slice(0,2).join('+').replace(/[^a-z0-9:_]/g, '_')}`,
    identity,
    tokens:        tokens.slice(0, 10),
    loop_uuids:    fp.loop_uuids,
    loop_count:    n,
    leverage_score,
    avg_confidence:Math.round(avgConfidence * 100) / 100,
    repair_cost:   minRepairCost,
    friction_sum:  Math.round(frictionSum * 100) / 100,
    evidence,
    loop_types:    [...new Set(typeToks)],
    systems:       sysToks,
    suggested_action: identity.action,
    // The loops themselves, sorted by severity then friction
    affected_loops: affectedLoops
      .sort((a, b) => _severityWeight(b) - _severityWeight(a))
      .map(l => ({
        uuid:     l.uuid,
        type:     l.type,
        loop_type:classify(l).loop_type,
        path:     l.path,
        body:     (l.body || '').slice(0, 120),
        severity: l.severity,
        attempts: l.attempts || 0,
        friction: l.friction || 0,
        status:   l.status,
      })),
  };
}

function _severityWeight(loop) {
  const w = { critical: 4, high: 3, medium: 2, low: 1 };
  return (w[loop.severity] || 1) + (loop.friction || 0) + (loop.attempts || 0) * 0.1;
}

// ── Identity inference — what IS this focal point? ───────────────────────────
// Tries to name the structural root the loops converge on.
function _inferIdentity(systems, paths, keywords, deps, types, loops) {
  // Boot/lifecycle ordering
  if (keywords.some(k => /boot|init|start|ready|depend|lifecycle|order/.test(k)) ||
      types.includes('TEMPORAL') && systems.length > 1) {
    return {
      label:  'BOOT_LIFECYCLE',
      desc:   `Initialization ordering violation — modules activating before dependencies are ready`,
      action: 'Enforce boot phase ordering. No module may subscribe or emit before its dependency phase completes.',
      category: 'TEMPORAL',
    };
  }

  // Dependency graph failure
  if (deps.length >= 2 || (systems.length >= 2 && types.includes('CAUSAL'))) {
    return {
      label:  'DEPENDENCY_CASCADE',
      desc:   `${systems.join(' → ')} — failure cascading through dependency chain`,
      action: `Stabilize ${systems[0] || 'root system'} first. Cascade will self-resolve downstream.`,
      category: 'CAUSAL',
    };
  }

  // API / health probe cluster
  if (keywords.some(k => /api|probe|health|degraded|unreachable|port/.test(k))) {
    return {
      label:  'API_SURFACE_FAILURE',
      desc:   `Multiple API endpoints failing — possible port binding, process death, or network issue`,
      action: `Check process health for: ${systems.join(', ')}. Verify ports are bound and responding.`,
      category: 'TEMPORAL',
    };
  }

  // Contract / integrity cluster
  if (types.includes('INTEGRITY') || keywords.some(k => /contract|violation|drift|mismatch/.test(k))) {
    return {
      label:  'INTEGRITY_CLUSTER',
      desc:   `Multiple integrity violations sharing source — possible systematic contract breach`,
      action: `Audit the contract layer for ${systems.join(', ')}. Re-validate all contracts after last deploy.`,
      category: 'INTEGRITY',
    };
  }

  // Forge / self-heal failure cluster
  if (keywords.some(k => /forge|self.heal|patch|repair/.test(k)) || types.includes('CAUSAL')) {
    return {
      label:  'REPAIR_LOOP_FAILURE',
      desc:   `Self-repair is failing repeatedly — the repair mechanism itself needs diagnosis`,
      action: `Inspect forge_patches table for regressions. Check Ollama health. Consider pausing auto-apply.`,
      category: 'CAUSAL',
    };
  }

  // Generic system cluster
  if (systems.length >= 2) {
    return {
      label:  'MULTI_SYSTEM_FAULT',
      desc:   `${systems.join(', ')} sharing failure signal`,
      action: `Investigate shared dependency: ${deps.join(', ') || 'unknown'}`,
      category: types[0] || 'CAUSAL',
    };
  }

  // Single system, multiple loop types
  return {
    label:  'SINGLE_SYSTEM_MULTI_LOOP',
    desc:   `${systems[0] || 'unknown'} has multiple concurrent loop types: ${types.join(', ')}`,
    action: `Full diagnostic scan on ${systems[0] || 'the system'}. Check recent changes.`,
    category: types[0] || 'CAUSAL',
  };
}

// ── Loop evolution — accumulate evidence onto a loop record ───────────────────
// "The loop itself evolved. Not the handler."
// Call this after each diagnostic step to advance loop state and confidence.
function evolveLoop(loop, newEvidence = [], newConfidence = null, newType = null) {
  const existing = Array.isArray(loop.evidence) ? loop.evidence : [loop.body].filter(Boolean);
  const merged   = [...new Set([...existing, ...newEvidence.filter(Boolean)])];

  const evolution = {
    evidence:   merged,
    confidence: newConfidence ?? loop.confidence ?? 0.5,
    evolved_at: Date.now(),
  };

  // Type can upgrade as evidence accumulates
  // e.g. TEMPORAL → CAUSAL when root cause becomes clearer
  if (newType && newType !== loop.loop_type) {
    evolution.loop_type      = newType;
    evolution.prev_loop_type = loop.loop_type;
    evolution.type_evolved   = true;
  }

  return { ...loop, ...evolution };
}

// ── Priority queue — what should the system work on next? ────────────────────
// Returns loops sorted by: focal priority → severity → friction → attempts
// "Which intervention collapses the greatest amount of uncertainty?"
function prioritize(loops, focalPoints = null) {
  if (!loops || !loops.length) return [];

  // Compute focal points if not provided
  const fps = focalPoints || detectFocalPoints(loops);

  // Build loop → focal point index
  const loopFocalScore = {};
  for (const fp of fps) {
    for (const uuid of fp.loop_uuids) {
      // A loop's focal score = leverage of its highest-leverage focal point
      loopFocalScore[uuid] = Math.max(loopFocalScore[uuid] || 0, fp.leverage_score);
    }
  }

  // Sort: focal score → severity → friction → attempts → age
  return [...loops].sort((a, b) => {
    const fa = loopFocalScore[a.uuid] || 0;
    const fb = loopFocalScore[b.uuid] || 0;
    if (Math.abs(fa - fb) > 0.1) return fb - fa;  // focal score wins

    const sa = _severityWeight(a);
    const sb = _severityWeight(b);
    if (sa !== sb) return sb - sa;  // severity

    const fricA = a.friction || 0;
    const fricB = b.friction || 0;
    if (Math.abs(fricA - fricB) > 0.1) return fricB - fricA; // friction

    return (a.createdAt || 0) - (b.createdAt || 0); // oldest first
  });
}

// ── Full topology analysis ────────────────────────────────────────────────────
// Main entry point. Takes all open loops, returns complete topology picture.
function analyze(loops, events = []) {
  if (!loops || !loops.length) {
    return { focal_points: [], priority_queue: [], loop_count: 0, topology_health: 'empty' };
  }

  const focalPoints  = detectFocalPoints(loops);
  const priorityQueue = prioritize(loops, focalPoints);

  // Topology health signal
  const highLeverageFocals = focalPoints.filter(fp => fp.leverage_score > 3.0);
  const topology_health =
    highLeverageFocals.length > 3 ? 'critical' :
    highLeverageFocals.length > 1 ? 'degraded' :
    focalPoints.length > 0        ? 'watch'    :
                                    'nominal';

  // Summary for logging
  const summary = focalPoints.length > 0
    ? `${focalPoints.length} focal point(s) found. Top: "${focalPoints[0]?.identity?.label}" ` +
      `(leverage: ${focalPoints[0]?.leverage_score}, affects ${focalPoints[0]?.loop_count} loops)`
    : `${loops.length} open loops, no shared focal points detected`;

  return {
    loop_count:      loops.length,
    focal_points:    focalPoints,
    priority_queue:  priorityQueue,
    topology_health,
    summary,
    top_action:      focalPoints[0]?.suggested_action || null,
    ts:              Date.now(),
  };
}

module.exports = {
  analyze,
  detectFocalPoints,
  prioritize,
  evolveLoop,
  REPAIR_COST,
  MODULE_ID,
  VERSION,
};
