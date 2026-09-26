'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// lib/agent-capability.js — what each agent can ACTUALLY take, measured
// UUID: nexus-agent-capability-v1-0000-2026-0818-001
// Version: 1.0.0
// Component: lib.agent-capability
// Hook: lib.agent-capability:v1:p0001
//
// James: "Just need to figure out their limits, constraints, have them improve
// chunking for nexus for each agent... Agent agnostic co-pilot."
//
// WHAT ALREADY WORKS AND IS NOT REBUILT HERE — hats (forged_hats: baseAgent,
// allowedAgents, toolScope, personaPrompt), agent switching, the fallback
// chain, multi-agent routing, and per-hat tool scoping. All live, all tested.
// This adds only the piece none of them have.
//
// ── THE GAP ─────────────────────────────────────────────────────────────────
//
// Every agent limit in the tree is a HARDCODED GUESS, written once and never
// checked against reality:
//
//   lib/agent-router.js:48   chatgpt: { maxTokens: 900, chunk: true }
//   lib/agent-router.js:51   gemini:  { maxTokens: 1000000, outputTokens: 65536 }
//   copilot/lifeline.js:154  maxTokens: opts.maxTokens || 1024
//   copilot/analysis.js:183  maxTokens: 1024
//
// Two problems. They drift — tests/modules/test-p1-agent-contracts.js already
// asserts "real Gemini limits (65536 output, NOT STALE)", which is a test
// written by someone who had been bitten. And they are scattered, so a co-pilot
// that wants to be agent-agnostic has per-agent numbers baked into four
// unrelated files.
//
// This replaces guessing with measuring:
//
//   DECLARED  a seed from vendor docs. Explicitly marked as unverified, because
//             a number from a changelog is a claim, not an observation.
//   OBSERVED  derived from real outcomes. A success at N tokens PROVES N is
//             reachable. A failure at N makes N a suspected ceiling. Nothing
//             else counts as evidence.
//
// Observed beats declared the moment there is any observation at all — a single
// real failure is worth more than a documented maximum, because the failure
// happened here, to this account, on this plan, today.
//
// §1.1 — an agent with no evidence returns proven:null. NOT a default, NOT the
// declared figure dressed as measured. A caller must be able to tell "we have
// never tested this" from "we tested it and it holds", because those justify
// completely different amounts of caution. This is the same unknown-vs-zero
// rule that /graph, consumer-registry and loom-map already enforce.
// ─────────────────────────────────────────────────────────────────────────────

const MODULE_ID = 'agent-capability';
const VERSION   = '1.0.0';
const COMP_ID   = 'lib.agent-capability';
const HOOK_ID   = 'lib.agent-capability:v1:p0001';

const TABLE = 'agent_capability';

// Seeds only. Every one is marked unverified until an outcome is recorded.
// Sourced from lib/agent-router.js's existing table so the two cannot disagree
// on day one — but the whole point is that these get overwritten by evidence.
const DECLARED = Object.freeze({
  chatgpt:    { inputTokens: 900,     outputTokens: null,  note: 'the 900 that chunking was built around — never verified' },
  claude:     { inputTokens: 200000,  outputTokens: 64000, note: 'declared context window' },
  gemini:     { inputTokens: 1000000, outputTokens: 65536, note: 'declared; test-p1-agent-contracts already guards this going stale' },
  perplexity: { inputTokens: 4000,    outputTokens: null,  note: 'declared' },
});

// Send at this fraction of the proven ceiling. A limit met exactly is a limit
// occasionally exceeded — token counting is approximate on every side of this.
const SAFETY = +(process.env.AGENT_CAPABILITY_SAFETY || 0.85);

// Below this many observations, a proven figure is reported as provisional.
const CONFIDENT_AFTER = +(process.env.AGENT_CAPABILITY_CONFIDENT_AFTER || 3);

let _jaa;
function _getJAA() {
  if (_jaa === undefined) return _jaa;
  try { ({ jaaDB: _jaa } = require('../cortex/memory/jaa-db')); } catch (_) { _jaa = null; }
  return _jaa;
}

// agent → { successes:[sizes], failures:[sizes], lastSeen }
const _obs = new Map();

function _bucket(agent) {
  if (!_obs.has(agent)) _obs.set(agent, { successes: [], failures: [], lastSeen: null });
  return _obs.get(agent);
}

/**
 * record(agent, { inputTokens, ok, reason }) — one real outcome.
 *
 * This is the only thing that produces knowledge here. Everything else reads
 * from what this recorded.
 *
 * A success at N proves N is reachable — nothing larger is implied.
 * A failure at N makes N a suspected ceiling, but ONLY when the reason is a
 * size failure. A refusal, a timeout or a network error at 50k tokens says
 * nothing about capacity, and treating it as a size limit would ratchet the
 * ceiling down on evidence that was never about size at all.
 */
function record(agent, { inputTokens, ok, reason = null } = {}) {
  if (!agent) throw new Error(`[${MODULE_ID}] §1.1 record requires an agent`);
  if (typeof inputTokens !== 'number' || inputTokens <= 0) {
    throw new Error(`[${MODULE_ID}] §1.1 record requires a real inputTokens count — an outcome with no size measures nothing`);
  }
  const b = _bucket(agent);
  b.lastSeen = Date.now();

  if (ok) {
    b.successes.push(inputTokens);
    // A success above a previously suspected ceiling disproves it. The ceiling
    // was a hypothesis; this is a counter-example, and keeping both would leave
    // the profile self-contradictory.
    b.failures = b.failures.filter(f => f > inputTokens);
  } else if (_isSizeFailure(reason)) {
    b.failures.push(inputTokens);
  } else {
    // Recorded, deliberately not counted against capacity.
    b.lastSeen = Date.now();
    _persist(agent, b);
    return { agent, counted: false,
      note: `failure recorded but NOT treated as a size limit — reason "${reason || 'unstated'}" is not evidence about capacity` };
  }

  _persist(agent, b);
  return { agent, counted: true, ...profile(agent) };
}

// Only these mean "too big". Everything else is a different fault wearing a
// failure's clothes, and misreading it silently shrinks the agent forever.
const SIZE_FAIL_RE = /too long|too large|context length|maximum context|token limit|exceeds|payload too|413|reduce the length/i;
function _isSizeFailure(reason) {
  if (!reason) return false;
  return SIZE_FAIL_RE.test(String(reason));
}

/**
 * profile(agent) — what is actually known, with its basis attached.
 *
 * `proven` is the largest input that has genuinely succeeded. `suspectedCeiling`
 * is the smallest that has genuinely failed for size. When there is no
 * evidence, proven is null — never the declared figure, which would launder a
 * vendor claim into a measurement.
 */
function profile(agent) {
  const declared = DECLARED[agent] || null;
  const b = _obs.get(agent);
  const successes = b ? b.successes : [];
  const failures  = b ? b.failures  : [];

  const proven = successes.length ? Math.max(...successes) : null;
  const ceiling = failures.length ? Math.min(...failures) : null;
  const observations = successes.length + failures.length;

  return {
    agent,
    declared: declared ? { ...declared, verified: false } : null,
    proven,                                   // null = never tested. Not a default.
    suspectedCeiling: ceiling,
    observations,
    confident: observations >= CONFIDENT_AFTER && proven !== null,
    // The basis travels with the number so a caller can weigh it. A figure
    // without its provenance is indistinguishable from a guess.
    basis: proven !== null
      ? `measured — largest success ${proven} tokens across ${successes.length} run(s)`
      : (declared ? `NO OBSERVATIONS — declared ${declared.inputTokens} is a vendor claim, unverified here`
                  : 'unknown agent, no declared figure and no observations'),
    contradiction: (proven !== null && ceiling !== null && proven >= ceiling)
      ? `proven ${proven} >= suspected ceiling ${ceiling} — the boundary is genuinely between them, not a clean line`
      : null,
  };
}

/**
 * chunkFor(agent, opts) — the size to actually send, and why.
 *
 * Never returns a bare number. The reasoning is part of the answer, because
 * "1200" from a measurement and "1200" from a vendor PDF warrant different
 * confidence and a caller cannot tell them apart otherwise.
 */
function chunkFor(agent, { override = null } = {}) {
  if (override) return { size: override, basis: 'caller override', confident: true, agent };

  const p = profile(agent);

  if (p.proven !== null) {
    // Between a proven success and a known failure, aim inside the proven side.
    const cap = p.suspectedCeiling !== null ? Math.min(p.proven, p.suspectedCeiling - 1) : p.proven;
    return {
      agent, size: Math.max(1, Math.floor(cap * SAFETY)),
      basis: `${Math.round(SAFETY * 100)}% of proven ${p.proven}` +
             (p.suspectedCeiling !== null ? ` (capped under failure at ${p.suspectedCeiling})` : ''),
      confident: p.confident, proven: p.proven, observations: p.observations,
      note: p.confident ? null : `only ${p.observations} observation(s) — provisional, will tighten as outcomes accumulate`,
    };
  }

  if (p.suspectedCeiling !== null) {
    // A failure but no success: aim well under, and say the floor is unproven.
    return { agent, size: Math.max(1, Math.floor(p.suspectedCeiling * 0.5)),
      basis: `half of the only known failure (${p.suspectedCeiling}) — no success recorded yet`,
      confident: false,
      note: 'nothing has succeeded at any size for this agent; this is a first probe, not a calibrated figure' };
  }

  const d = DECLARED[agent];
  if (d && d.inputTokens) {
    // §1.1 — the declared figure IS used, because refusing to act would be
    // worse than acting cautiously. But it is labelled unverified so nothing
    // downstream can mistake it for a measurement.
    return { agent, size: Math.max(1, Math.floor(d.inputTokens * 0.5)),
      basis: `half of DECLARED ${d.inputTokens} — UNVERIFIED, no observations for this agent`,
      confident: false, declaredOnly: true,
      note: 'this number has never been tested here. Record outcomes and it will be replaced by a measured one.' };
  }

  return { agent, size: null, basis: 'unknown agent — no declared figure, no observations',
    confident: false,
    note: 'refusing to invent a chunk size. Seed a declared figure or record one real outcome first.' };
}

/**
 * calibrate(agent, probe, opts) — find the real limit by binary search.
 *
 * `probe(size)` sends a payload of roughly that many tokens and resolves
 * { ok, reason }. Each result is recorded, so calibration and normal use feed
 * the same evidence pool — a calibration run is not a special mode, it is just
 * concentrated ordinary use.
 */
async function calibrate(agent, probe, { low = 500, high = null, rounds = 8 } = {}) {
  if (typeof probe !== 'function') throw new Error(`[${MODULE_ID}] calibrate needs a probe(size) function`);
  const d = DECLARED[agent];
  let hi = high || (d && d.inputTokens) || 100000;
  let lo = low;
  const trail = [];

  for (let n = 0; n < rounds && lo < hi; n++) {
    const mid = Math.floor((lo + hi) / 2);
    let r;
    try { r = await probe(mid); }
    catch (e) { r = { ok: false, reason: e.message }; }

    const rec = record(agent, { inputTokens: mid, ok: !!r.ok, reason: r.reason });
    trail.push({ round: n + 1, size: mid, ok: !!r.ok, counted: rec.counted !== false, reason: r.reason || null });

    if (r.ok) lo = mid + 1;
    else if (_isSizeFailure(r.reason)) hi = mid - 1;
    else {
      // Not a size failure — retrying the same size learns nothing new, and
      // narrowing on it would corrupt the search with unrelated evidence.
      trail[trail.length - 1].note = 'non-size failure — search not narrowed on this result';
      break;
    }
  }

  return { agent, trail, rounds: trail.length, ...profile(agent), chunk: chunkFor(agent) };
}

// ── Persistence ──────────────────────────────────────────────────────────────
function _persist(agent, b) {
  const jaa = _getJAA();
  if (!jaa) return;
  try {
    const row = { agent, successes: b.successes.slice(-100), failures: b.failures.slice(-100),
                  lastSeen: b.lastSeen, ts: Date.now() };
    const existing = (jaa.query(TABLE, r => r.agent === agent, 1) || [])[0];
    if (existing) jaa.update(TABLE, { uuid: existing.uuid }, row);
    else jaa.insert(TABLE, { uuid: require('crypto').randomUUID(), ...row });
  } catch (_) { /* §1.2 — the profile still works in memory if the store is down */ }
}

/** load() — rehydrate. Continuity is the point: limits learned last week still apply. */
function load() {
  const jaa = _getJAA();
  if (!jaa) return { ok: false, reason: 'no store — starting with no observations, which is NOT the same as having tested and found nothing' };
  try {
    let n = 0;
    for (const r of (jaa.query(TABLE, () => true, 1000) || [])) {
      _obs.set(r.agent, { successes: r.successes || [], failures: r.failures || [], lastSeen: r.lastSeen || null });
      n++;
    }
    return { ok: true, agents: n };
  } catch (e) { return { ok: false, reason: e.message }; }
}

/** all() — every agent's profile. The co-pilot's one place to ask. */
function all() {
  const names = new Set([...Object.keys(DECLARED), ..._obs.keys()]);
  return [...names].map(a => ({ ...profile(a), chunk: chunkFor(a) }));
}

function health() {
  const ps = all();
  return {
    ok: true, version: VERSION, safety: SAFETY, confidentAfter: CONFIDENT_AFTER,
    agents: ps.length,
    measured: ps.filter(p => p.proven !== null).map(p => p.agent),
    // The list that matters: everything still running on a vendor claim.
    unmeasured: ps.filter(p => p.proven === null).map(p => p.agent),
    note: ps.some(p => p.proven === null)
      ? 'agents in `unmeasured` are using DECLARED figures — unverified here, and the ones most likely to be wrong'
      : null,
  };
}

function _resetForTest() { _obs.clear(); }

module.exports = { record, profile, chunkFor, calibrate, all, load, health,
  DECLARED, SAFETY, CONFIDENT_AFTER, TABLE, _isSizeFailure,
  MODULE_ID, VERSION, COMP_ID, HOOK_ID, _resetForTest };
