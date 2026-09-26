'use strict';
/**
 * copilot/lib/grammar-router.js — the dynamic grammar engine, in the mind (§P5)
 * UUID: nexus-copilot-grammar-router-v1-0000-2026-0807-001
 *
 * James: "expand P5 exponentially — dynamic grammar engine." There already IS one
 * (lib/grammar-engine.js): it reads the component registry grammar tree, builds a
 * trie, and resolves natural language → { componentId, params, confidence }. It
 * live-rebuilds on component.registered, so it GROWS as capabilities are added.
 * co-pilot's CLI uses it — but co-pilot's CONVERSATIONAL path does not. That's the
 * gap this closes.
 *
 * THE EXPONENTIAL PART: co-pilot's chat currently understands ~7 hand-written
 * regex intercepts. Wired to the grammar engine, it understands ALL 239
 * capabilities — and every future one — with zero new regex, because the grammar
 * is generated FROM loom's registry, not hand-maintained. Adding a component adds
 * a phrase co-pilot understands, automatically.
 *
 * §8.6 composes lib/grammar-engine (the trie) + copilot/lib/capabilities (to
 * describe what resolved). §1.1 confidence-gated: a high-confidence resolution
 * routes to the real capability; a low-confidence one falls through to the LLM
 * rather than mis-firing (the grammar-misfire-tracker exists precisely because a
 * confident wrong match is worse than a miss). §1.2 never throws to the caller.
 */

let _engine = null;
let _loaded = false;

// ─────────────────────────────────────────────────────────────────────────────
// §CLOSED FEEDBACK LOOP — built 2026-08-18, AXIOMS v3.1 §Group 0/13/15/17
// James: "use cortex to make [the grammar engine] more fluid and improves
// over time." Real, precise gap found before this: the misfire-tracker
// (orchestrator/lib/grammar-misfire-tracker.js) was real, wired, and
// escalates a real, sustained low-confidence streak to idearium — but was
// completely disconnected from co-pilot's CONVERSATIONAL route() below.
// Two real defects fixed, not one:
//   1. route()'s own low-confidence case (`belowFloor: true, routed:
//      false`) was captured, then silently discarded at every real call
//      site — recordMisfire() never fired for co-pilot's path at all.
//   2. Even with (1) fixed, the tracker's own real streak resets to 0
//      immediately after an escalation (by design — §17.7 says the
//      SECOND occurrence promotes to investigation, not that every
//      subsequent occurrence re-escalates forever). That means a raw
//      streak count can never be the real signal for "this pattern has
//      been PROVEN unreliable" — that permanent record only exists in
//      event_log's own grammar.misfire_escalated events, which per §0.3
//      are never deleted. This is the actual closed loop: a pattern
//      that was ever escalated gets its confidence demoted on every
//      future resolve(), for real, not just logged and forgotten.
// ─────────────────────────────────────────────────────────────────────────────

// §13.1 — real, bounded, in-memory index of historically-escalated
// patterns, refreshed periodically rather than scanning event_log on
// every single resolve() call (that would be real friction on the hot
// path this function IS). Same real caching shape already proven this
// session (lib/loom-map.js's own maxAgeMs pattern) — reused, not
// reinvented.
let _escalatedIndex = null;
let _escalatedIndexBuiltAt = 0;
const ESCALATED_INDEX_MAX_AGE_MS = 60_000;

function _buildEscalatedIndex() {
  const index = new Set();
  try {
    const { jaaDB } = require('../../cortex/memory/jaa-db');
    // §FIXED-CLASS 2026-08-17/18 — jaaDB.tail(), never query() with a
    // limit, for anything that needs RECENT/real data — query() returns
    // oldest-first and silently truncates once a table exceeds the
    // limit, a real bug already found and fixed 6 times elsewhere in
    // this codebase this session. A wide window (5000) because
    // escalation events are real but genuinely rare — the goal is
    // catching every real one that's happened recently, not a sample.
    const events = jaaDB.tail('event_log', 5000).filter(e => e.type === 'grammar.misfire_escalated');
    for (const e of events) {
      const key = e.payload?.componentId && e.payload?.matched
        ? `${e.payload.componentId}::${e.payload.matched}` : null;
      if (key) index.add(key);
    }
  } catch (e) { console.warn(`[copilot-grammar-router] escalated-index rebuild failed (non-fatal, fails open to no demotion): ${e.message}`); }
  return index;
}

function _isKnownMisfirePattern(componentId, matched) {
  const now = Date.now();
  if (!_escalatedIndex || (now - _escalatedIndexBuiltAt) > ESCALATED_INDEX_MAX_AGE_MS) {
    _escalatedIndex = _buildEscalatedIndex();
    _escalatedIndexBuiltAt = now;
  }
  return _escalatedIndex.has(`${componentId}::${matched}`);
}

/**
 * _recordAndLog(componentId, matched, requestId, reason) — real, non-
 * blocking call into the same, already-proven misfire tracker orchestrator
 * uses. §17.6 — every call is a real, traceable event regardless of
 * outcome (fire success, fire failure, tracker unavailable), never silent.
 */
async function _recordAndLog(componentId, matched, requestId, reason) {
  try {
    const tracker = require('../../orchestrator/lib/grammar-misfire-tracker');
    if (typeof tracker.init === 'function' && !tracker._initialized) {
      try { const { jaaDB } = require('../../cortex/memory/jaa-db'); tracker.init(jaaDB); tracker._initialized = true; } catch (_) {}
    }
    const r = await tracker.recordMisfire({ componentId, matched, requestId });
    if (r?.escalated) _escalatedIndex = null; // real, immediate invalidation — the NEXT resolve() for this exact pattern (or the cache's next natural rebuild) sees the new escalation without waiting out the full 60s window
    return r;
  } catch (e) {
    console.warn(`[copilot-grammar-router] misfire recording failed (${reason}, non-fatal): ${e.message}`);
    return { ok: false, error: e.message };
  }
}
// ─────────────────────────────────────────────────────────────────────────────

function _getEngine() {
  if (!_engine) { try { _engine = require('../../lib/grammar-engine'); } catch (_) { _engine = null; } }
  return _engine;
}

/**
 * ensureLoaded(opts) — make sure the grammar trie is built (fetched from the
 * registry). Idempotent; safe to call before each resolve. Non-blocking-friendly:
 * if the registry isn't reachable, the engine stays not-ready and route() returns
 * null (fall through to LLM), never hangs.
 */
async function ensureLoaded(opts = {}) {
  const eng = _getEngine();
  if (!eng) return false;
  if (_loaded && eng._ready) return true;
  try {
    if (typeof eng.load === 'function') { await eng.load(opts.orchestratorUrl); _loaded = true; }
    else if (typeof eng.rebuild === 'function') { await eng.rebuild(); _loaded = true; }
    return !!eng._ready;
  } catch (_) { return false; }
}

/**
 * route(prompt, opts) — resolve a natural-language prompt to a real capability via
 * the grammar trie. Returns null if the grammar can't confidently resolve it (→
 * the caller falls through to the LLM / other intercepts).
 * @returns { componentId, params, confidence, capability } | null
 */
async function route(prompt, opts = {}) {
  const eng = _getEngine();
  if (!eng || typeof eng.resolve !== 'function') return null;

  // Make sure the trie is built; if it isn't and can't be, don't block — miss.
  if (!eng._ready) { const ok = await ensureLoaded(opts); if (!ok) return null; }

  let res;
  try { res = eng.resolve(prompt); } catch (_) { return null; }
  if (!res || !res.componentId) return null;

  // §1.1 confidence gate. A confident wrong match is worse than a miss (that's
  // why the misfire-tracker exists). Only route above the floor; else fall
  // through to the LLM. Default floor 0.6 — aliases/full matches are 0.95,
  // partials scale down toward 0.3.
  const floor = opts.confidenceFloor != null ? opts.confidenceFloor : 0.6;

  // §CLOSED LOOP, real behavior change — checked BEFORE the floor comparison,
  // so a demotion can genuinely push a would-be-routed match below the floor,
  // not just get logged alongside an unaffected result. §0.1: this is
  // accumulated real evidence (a real, prior escalation), never a guess.
  const isKnownMisfire = _isKnownMisfirePattern(res.componentId, res.matched);
  const effectiveConfidence = isKnownMisfire ? (res.confidence || 0) * 0.5 : (res.confidence || 0);

  if (effectiveConfidence < floor) {
    // §GAP #1 FIXED — this branch used to return the same shape but nothing
    // downstream ever consulted it for misfire tracking; every real call
    // discarded it. Now it's the real, closed loop's own input.
    await _recordAndLog(res.componentId, res.matched, opts.requestId, isKnownMisfire ? 'demoted-by-history' : 'low-confidence');
    return { ...res, confidence: effectiveConfidence, belowFloor: true, routed: false, demotedByHistory: isKnownMisfire };
  }

  // Describe what it resolved to, from the real capability registry.
  let capability = null;
  try {
    const caps = opts.capabilities || require('./capabilities');
    const all = caps.whatCanIDo();
    for (const sys of Object.values(all.systems || {})) {
      const hit = sys.find(c => c.id === res.componentId);
      if (hit) { capability = hit; break; }
    }
  } catch (_) { /* description is a bonus, not required */ }

  return { componentId: res.componentId, params: res.params || [], confidence: effectiveConfidence, matched: res.matched, capability, routed: true };
}

/**
 * describeGrammar() — how many phrases co-pilot understands right now (grows with
 * the registry). For "how do you understand me" / introspection.
 */
function describeGrammar() {
  const eng = _getEngine();
  if (!eng) return { ready: false, reason: 'grammar engine unavailable' };
  try {
    const st = eng.status ? eng.status() : {};
    const aliases = eng.getAliases ? eng.getAliases() : {};
    return { ready: !!eng._ready, aliases: Object.keys(aliases).length, ...st,
      text: `Grammar engine ${eng._ready ? 'ready' : 'not loaded'} — resolves natural language to real capabilities via the registry trie${eng._ready ? `, ${Object.keys(aliases).length} aliases` : ''}. Grows automatically as components register.` };
  } catch (e) { return { ready: false, reason: e.message }; }
}

function _reset() { _engine = null; _loaded = false; _escalatedIndex = null; _escalatedIndexBuiltAt = 0; }
module.exports = { route, ensureLoaded, describeGrammar, _reset, _isKnownMisfirePattern, _buildEscalatedIndex, MODULE_ID: 'copilot-grammar-router', VERSION: '1.1.0' };
