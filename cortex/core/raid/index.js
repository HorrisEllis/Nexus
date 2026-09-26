'use strict';
/**
 * cortex/core/raid/index.js — RAID Provider Routing Engine
 * UUID: nexus-raid-core-v1-0000-2026-0629-jamesbrooks-001
 * Version: 6.2.0
 * spec: docs/raid.spec
 *
 * Built 2026-06-29. This module did not exist anywhere in the tree —
 * lib/request-handler.js's §P97 CFR-sigma-floor wire and the entire
 * RAID-determinism test suite (tests/full.test.js §6) were calling/testing
 * a path, `cortex/core/raid`, that resolved to nothing. Every request that
 * reached RAID-routing fell through silently. This is that missing engine,
 * built directly against the test suite's pinned behavior, not guessed.
 *
 * §AX-002 — nothing fails silently. _decide() always returns an agent —
 * the unconditional claude-API last resort (LAW_III) exists specifically
 * so this never throws or returns nothing.
 *
 * LAYER 1 (constraints, deny-only) — fully implemented:
 *   _agentAvailable() — online + consecutiveFails<3
 *   explicit preferredAgent honored if available
 *   LAW_I — ChatGPT tried first, Gemini as its fallback, for all
 *     clusters (§DEFAULT-AGENT-CHANGE 2026-09-02 — replaces the prior
 *     ollama-first default; ollama moved into the general chain)
 *   LAW_III — claude (API) is the unconditional last resort, never excluded
 *   §P97 — CFR sigma floor tightens the consecutiveFails threshold when
 *          the causal field is outside 'stable' regime
 *
 * LAYER 2 (fitness, ranks survivors) — real as of 2026-07-06, no stubs:
 *   health() term — real, drawn from the live health snapshot
 *   roleConfidence() — real, reads RAID's own _weights map (previously
 *     write-only — recordOutcome() populated it every dispatch, nothing
 *     ever read it back). Floored at 0.5 (neutral) for <3 observed calls.
 *   topologicalProximity() — real when a CFR CausalGraph is injected via
 *     setCausalGraph() (intelligence/cfr/graph.js gained componentDistance() this
 *     same pass); honestly neutral (0.5) if no graph is wired or either
 *     component has never been observed, never fabricated.
 *   SNR pre-gate (docs/raid-snr-filter.spec) — built as cortex/core/raid/
 *     snr-filter.js (this file also did not exist before this pass). NOT
 *     folded into the fitness multiplication — that would be backwards
 *     (a genuinely-unknown call has snr:0.0 and would zero out every
 *     candidate's score, when unknown is exactly the case that most needs
 *     a normal dispatch). Wired instead as a pre-gate in _decide(), gated
 *     on an explicit faultClass so it only engages for fault-remediation
 *     calls, never for the plain provider-selection calls this file's own
 *     determinism suite (tests/full.test.js §6) already pins.
 *
 * "Specialist clusters" (where LAW_I would NOT apply) are named in
 * docs/raid.spec but never enumerated anywhere. Treating all four current
 * clusters (code/analysis/spec/general) as non-specialist until that list
 * exists — flagged, not assumed silently.
 */

const http = require('http');
const snrFilter = require('./snr-filter');
const tunables = require('./tunables');

const MODULE_ID = 'cortex/core/raid';
const VERSION   = '6.3.0';

// ── Optional CFR causal-graph injection ───────────────────────────────────────
// RAID has no live CFR ledger of its own — bridge/cortex own that. A caller
// that has one (orchestrator, at boot) wires it in via setCausalGraph();
// absent that, topologicalProximity() is honestly neutral, never fabricated.
let _cfrGraph = null;
function setCausalGraph(graph) { _cfrGraph = graph; }

// ── Dispatch-name → health-key mapping ───────────────────────────────────────
// Guardian-mediated NCP tabs are health-checked under 'guardian-<provider>'
// but dispatched under the bare provider name — service/nexus-diagnostic.js
// passes the bare name straight through as the job's provider field, and
// Guardian's userscripts register as provider=claude, never
// provider=guardian-claude. 'guardian-claude' is a healthSnap lookup key,
// never a valid dispatch target.
const HEALTH_KEY = {
  claude:     'guardian-claude',
  chatgpt:    'guardian-chatgpt',
  gemini:     'guardian-gemini',
  perplexity: 'guardian-perplexity',
  deepseek:   'guardian-deepseek',
  ollama:     'ollama',
};

// ── _cluster — deterministic, zero-LLM intent bucketing ──────────────────────
const CLUSTER_KEYWORDS = {
  code:     ['typescript', 'javascript', 'class', 'function', 'implement', 'module', 'code', 'bug', 'compile'],
  analysis: ['analyze', 'analyse', 'explain', 'how this works', 'why', 'investigate'],
  spec:     ['design', 'architecture', 'plan', 'schema', 'contract', 'structure', 'spec'],
};

function _cluster(promptRaw) {
  const p = String(promptRaw || '').toLowerCase();
  if (!p.trim()) return 'general';
  for (const [cluster, words] of Object.entries(CLUSTER_KEYWORDS)) {
    if (words.some(w => p.includes(w))) return cluster;
  }
  return 'general';
}

// ── Layer 1: constraints (deny-only) ──────────────────────────────────────────
// Returns true/false. Does not rank — that's layer 2's job.
function _agentAvailable(dispatchName, health, opts = {}) {
  const key = HEALTH_KEY[dispatchName] || dispatchName;
  const snap = health?.[key];
  if (!snap) return false;
  const failThreshold = opts.tightened ? 1 : 3; // §P97 — tightened under CFR stress
  if (snap.online !== true) return false;
  if ((snap.consecutiveFails || 0) >= failThreshold) return false;
  if (snap.callCount >= 5 && typeof snap.successRate === 'number' && snap.successRate < 0.2) return false;
  if (snap.role === 'violated') return false; // seam-component-registry.spec §2
  return true;
}

// ── Layer 2: fitness (ranks survivors) ────────────────────────────────────────
// 2026-07-06: the three stubs below are now real. §Correction, not just a
// fill-in: snrTierGate was named here in the original comment as a fitness
// multiplier, but its actual spec (docs/raid-snr-filter.spec) describes a
// pre-gate — "does a known fix already exist at all" — not a per-agent
// ranking term. Multiplying it in here would be backwards: a genuinely
// unknown call (snr:0.0) would zero out every candidate's fitness, when an
// unknown call is exactly the case that most needs a normal agent dispatch.
// snr-filter is wired instead as a pre-gate in _decide(), before any agent
// is even considered — see below.

// roleConfidence — reads RAID's own _weights map (already populated by
// recordOutcome() on every real dispatch outcome, previously write-only:
// nothing ever read it back into a decision). Laplace-floored at 0.5 for
// <3 observed calls — insufficient evidence is honestly neutral, not
// fabricated certainty in either direction.
function _roleConfidence(dispatchName, cluster) {
  const key = `${cluster}:${dispatchName}`;
  const w = _weights.get(key);
  if (!w || w.calls < tunables.get('minCallsForConfidence')) return tunables.get('neutralConfidence');
  return w.successes / w.calls;
}

// topologicalProximity — real when a CFR CausalGraph has been injected via
// setCausalGraph(); honestly neutral (tunables.neutralConfidence) otherwise,
// or when either component has never appeared in the graph. Never fabricates
// a distance. CFR's graph itself stays domain-agnostic (§5.9 — meta/ modules
// never import a sovereign system's own config); RAID owns the Cortex
// dependency and passes the hop-depth cap into componentDistance() itself
// rather than CFR reading RAID's table directly.
function _topologicalProximity(dispatchName, callerComponentId) {
  const neutral = tunables.get('neutralConfidence');
  if (!_cfrGraph || !callerComponentId) return neutral;
  const targetComponentId = HEALTH_KEY[dispatchName] || dispatchName;
  const dist = _cfrGraph.componentDistance(callerComponentId, targetComponentId, tunables.get('maxGraphHopDepth'));
  if (dist === null) return neutral;
  return 1 / (1 + dist);
}

function _fitness(dispatchName, cluster, health, callerComponentId) {
  const key = HEALTH_KEY[dispatchName] || dispatchName;
  const snap = health?.[key] || {};
  const healthScore = snap.successRate != null ? snap.successRate : (snap.online ? 0.8 : 0.1);
  const roleConfidence      = _roleConfidence(dispatchName, cluster);
  const topologicalProximity = _topologicalProximity(dispatchName, callerComponentId);
  return roleConfidence * healthScore * topologicalProximity;
}

// ── _decide — pure function, same inputs always produce same decision ───────
function _decide(call, health, weights) {
  const cluster = _cluster(call?.prompt || call?.intent || '');
  const ctx = call?.context || {};
  const cfrRegime     = ctx.cfrRegime || 'stable';
  const cfrSigmaFloor  = ctx.cfrSigmaFloor || 0;
  const tightened      = cfrRegime !== 'stable' && cfrSigmaFloor > 0; // §P97
  const callerComponentId = ctx.componentId || null;

  // SNR pre-gate (docs/raid-snr-filter.spec) — only engages when the caller
  // declares a faultClass (this is a fault-remediation call, not general
  // provider selection). A known invariant or crystallised pattern resolves
  // right here with no agent dispatched at all — LAW_I/LAW_III and the
  // fitness chain below never run for those. Gated deliberately, not run
  // unconditionally: this codebase's existing RAID-determinism suite pins
  // plain prompt→provider selection with no faultClass on any fixture, and
  // this gate must never become a silent second path those tests can't see.
  if (call?.faultClass) {
    const snr = snrFilter.filter({
      intent: call?.prompt || call?.intent || '',
      cluster,
      faultClass: call.faultClass,
      causedBy: ctx.causedBy, sessionId: ctx.sessionId, jobId: ctx.jobId,
    });
    if (snr.dispatch === false) {
      return { agent: null, cluster, reason: `snr-gate resolved locally: ${snr.reason}`, snr };
    }
  }

  // Explicit preference — checked by its literal key, echoed back verbatim.
  if (call?.preferredAgent) {
    if (_agentAvailable(call.preferredAgent, health, { tightened })) {
      return { agent: call.preferredAgent, cluster, reason: 'explicit preference honored' };
    }
    // falls through to LAW_I / chain — preference offline is not fatal
  }

  // LAW_I — ChatGPT first, Gemini as its fallback.
  // §DEFAULT-AGENT-CHANGE 2026-09-02 — James, direct, explicit: "use
  // Gemini or ChatGPT as the default agent" / "ChatGPT first, Gemini
  // fallback." This REPLACES the prior ollama-first LAW_I below (not
  // layered alongside it) — ollama moves down into the general chain,
  // still real and available, just no longer guaranteed-first. LAW_III
  // (claude, unconditional last resort) is unchanged.
  if (_agentAvailable('chatgpt', health, { tightened })) {
    return { agent: 'chatgpt', cluster, reason: 'LAW_I: chatgpt always first for non-specialist clusters' };
  }
  if (_agentAvailable('gemini', health, { tightened })) {
    return { agent: 'gemini', cluster, reason: 'LAW_I: gemini fallback (chatgpt unavailable)' };
  }

  // Computed chain (replaces the retired hardcoded CLUSTER_CHAINS, per
  // docs/raid.spec v6.1 note) — today this is one fixed order because
  // role_confidence data doesn't exist yet to differentiate by cluster.
  // Becomes per-cluster once that lands; flagged, not silently faked.
  // §UPDATED 2026-08-18 — James, direct, explicit preference: "I want to
  // use ChatGPT and Gemini since they are free. Use you [claude] as a
  // last resort." The real, existing LAW_III below (further down this
  // function) already named claude "the unconditional last resort" — but
  // this chain contradicted it, putting claude BEFORE chatgpt, and never
  // included gemini at all. Reordered to genuinely match both the
  // person's stated preference and this function's own already-declared
  // law, not just the label. gemini added — was completely absent before,
  // confirmed by reading this array directly, not assumed present.
  // §NEW 2026-09-11 — James: "also deepseek... get raid solid, enterprise
  // grade." perplexity/deepseek added at the END — real, available
  // fallback candidates, but James never stated a preference for either
  // relative to the others, so they're not assumed to outrank an
  // explicit, stated preference; last means "considered, not favored."
  // §RE-APPLIED 2026-09-11 (this fix regressed out of an earlier merge
  // and is being restored here, onto the current chain including
  // perplexity/deepseek, not blindly overwritten from an older snapshot
  // that predated them): chatgpt/gemini already handled by LAW_I above
  // (they only reach this array if BOTH were unavailable, listed again
  // here only so a mid-request health change during the survivors scan
  // can't skip them — same defensive shape LAW_III already relies on).
  // ollama moved from position 1 to position 3: still tried, no longer
  // guaranteed-first.
  const chain = ['chatgpt', 'gemini', 'ollama', 'claude', 'perplexity', 'deepseek'];
  const survivors = chain.filter(name => _agentAvailable(name, health, { tightened }));

  if (survivors.length === 1) {
    return { agent: survivors[0], cluster, reason: `cluster_chain: only survivor for ${cluster}` };
  }
  if (survivors.length > 1) {
    const ranked = survivors
      .map(name => ({ name, score: _fitness(name, cluster, health, callerComponentId) }))
      .sort((a, b) => b.score - a.score);
    return { agent: ranked[0].name, cluster, reason: `cluster_chain: highest fitness for ${cluster} (${ranked[0].score.toFixed(2)})` };
  }

  // LAW_III — claude (API) is the unconditional last resort. Never excluded.
  // This is what keeps _decide() from ever throwing or returning nothing —
  // §AX-002, nothing fails silently, applies to RAID having no answer too.
  return { agent: 'claude', cluster, reason: 'LAW_III: all candidates excluded, claude API used as unconditional reserve' };
}

// ── Live health snapshot — polled, not computed per-call ─────────────────────
// _decide() is pure and takes health as an argument (tests construct their
// own fixtures). This is the module's own live copy for production callers
// (lib/request-handler.js does `raid._health`, `raid._weights` directly).
const _health = {
  ollama:            { online: false, consecutiveFails: 0, callCount: 0, successRate: 1 },
  'guardian-claude':  { online: false, consecutiveFails: 0, callCount: 0, successRate: 1 },
  'guardian-chatgpt': { online: false, consecutiveFails: 0, callCount: 0, successRate: 1 },
  'guardian-gemini':  { online: false, consecutiveFails: 0, callCount: 0, successRate: 1 },
  'guardian-perplexity': { online: false, consecutiveFails: 0, callCount: 0, successRate: 1 },
  'guardian-deepseek':   { online: false, consecutiveFails: 0, callCount: 0, successRate: 1 },
};

function _httpGetJson(url, timeoutMs = 2000) {
  return new Promise(resolve => {
    try {
      const u = new URL(url);
      const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'GET', timeout: timeoutMs },
        res => {
          let buf = '';
          res.on('data', c => buf += c);
          res.on('end', () => { try { resolve(JSON.parse(buf)); } catch(_) { resolve(null); } });
        });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.end();
    } catch(_) { resolve(null); }
  });
}

async function _pollHealth() {
  const OL_URL = process.env.OLLAMA_URL   || 'http://127.0.0.1:3749';
  const GD_URL = process.env.GUARDIAN_URL || 'http://127.0.0.1:7820';

  const ol = await _httpGetJson(`${OL_URL}/health`);
  _health.ollama.online = !!ol?.ok;
  _health.ollama.consecutiveFails = ol?.ok ? 0 : (_health.ollama.consecutiveFails + 1);

  const gd = await _httpGetJson(`${GD_URL}/health`);
  const providers = gd?.connectedProviders || {};
  // §FIX 2026-09-11 — James: "get raid solid. enterprise grade." Real,
  // severe bug found while adding deepseek: this loop only ever polled
  // ['claude','chatgpt'] — gemini was in HEALTH_KEY/_health but its real
  // online flag was NEVER updated after boot, permanently stuck at the
  // honest-but-wrong default (false), regardless of whether it was
  // actually connected. _agentAvailable() requires online===true, so
  // RAID could never have dispatched to gemini at all, silently, the
  // entire time this bug existed. Confirmed guardian's own real
  // /health response is NOT the problem — connectedProviders is built
  // dynamically from live NCP connections (guardian/server.js:1708-10),
  // already includes whichever providers are genuinely connected. Fixed
  // by iterating every real guardian-backed entry in HEALTH_KEY instead
  // of a manually-maintained, silently-stale list — adding a new agent
  // to HEALTH_KEY now automatically polls it too; this exact bug class
  // cannot recur.
  for (const name of Object.keys(HEALTH_KEY)) {
    if (name === 'ollama') continue; // ollama has its own real poll above, not guardian-backed
    const key = HEALTH_KEY[name];
    const online = !!providers[name];
    _health[key].online = online;
    _health[key].consecutiveFails = online ? 0 : (_health[key].consecutiveFails + 1);
  }
}

let _pollTimer = null;
function startHealthPoll(intervalMs = 15000) {
  if (_pollTimer) return;
  _pollHealth().catch(() => {});
  _pollTimer = setInterval(() => _pollHealth().catch(() => {}), intervalMs);
}
function stopHealthPoll() {
  if (_pollTimer) clearInterval(_pollTimer);
  _pollTimer = null;
}

// ── Live weights — learned from outcomes ──────────────────────────────────────
// lib/request-handler.js already logs a `user.satisfied` event after every
// dispatch (D3 in its pipeline) but never called back into RAID — the
// feedback loop the spec's "Weight table learns from outcomes" line
// describes was logged, never closed. recordOutcome() is that missing call.
const _weights = new Map();

function recordOutcome(agent, cluster, success) {
  const key = `${cluster}:${agent}`;
  const prior = _weights.get(key) || { calls: 0, successes: 0 };
  prior.calls += 1;
  if (success) prior.successes += 1;
  _weights.set(key, prior);
  // Feed the same numbers back into the live health snapshot so _fitness()
  // and _agentAvailable()'s successRate/callCount terms are real, not stuck
  // at their boot-time defaults.
  const key2 = HEALTH_KEY[agent] || agent;
  if (_health[key2]) {
    _health[key2].callCount = (_health[key2].callCount || 0) + 1;
    const sr = _health[key2].successRate != null ? _health[key2].successRate : 1;
    _health[key2].successRate = sr + ((success ? 1 : 0) - sr) / _health[key2].callCount; // running average
  }
  return _weights.get(key);
}

// ── Tool approval gate ────────────────────────────────────────────────────────
// docs/raid.spec's tool_approval_gate. Built against
// tests/modules/raid-approve-tool.test.js's 9 pinned cases — that test file
// already existed; this is the function it was always meant to test.
const contracts = require('../../contract');

const _toolCalls = new Map(); // source -> [{ ts, action, approved }]
const RATE_WINDOW_MS = 60000;

// §PHASEMAP P1 (docs/raid-warp-verification-phasemap.spec) — RAID records every
// tool decision. Traceability floor: RAID must SEE before it can VERIFY (§17.6
// auditable, §1.2 observable, §9.2 ledger-before-dispatch). Built OUTWARD from
// the existing _toolCalls recorder (§8.6 reuse before build), and PERSISTED to
// cortex (§2.2 storage is source of truth — the in-memory Maps die on restart;
// cortex is the persistent data). Append-only (§0.3 nothing lost). No blocking
// here — pure record; the verify gates arrive in P2-P5.
const _RAID_DECISIONS_TABLE = 'raid_decisions';
function recordDecision(decision = {}) {
  const { uid } = require('../../memory/jaa-db');
  const row = {
    uuid:      uid ? uid() : `raid-dec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind:      'tool.decision',
    source:    decision.source || 'unknown',
    tool:      decision.tool || decision.action || 'unknown',
    argsDigest: decision.argsDigest || _digestArgs(decision.args),
    outcome:   decision.outcome || 'executed',   // executed | error | denied
    approved:  decision.approved !== false,
    error:     decision.error || null,
    meta:      decision.meta || null,             // §17.5 — structured, queryable decision metadata (e.g. P4 sigma/regime), NOT hashed away
    causedBy:  decision.causedBy || null,         // §9.6 session/decision chain
    eventTs:   decision.eventTs || Date.now(),    // §3.2 logical time is the ordering axis
    ts:        Date.now(),
  };
  // Persist to cortex (§2.2). Fail loud but never break the caller (§1.2) — a
  // recording failure is logged, the tool still runs (P1 is observe-only).
  try {
    const { jaaDB } = require('../../memory/jaa-db');
    jaaDB.insert(_RAID_DECISIONS_TABLE, row);
  } catch (e) {
    console.warn(`[raid] recordDecision persist failed (${e.message}) — decision not lost from memory`, row.uuid);
  }
  return row;
}

// Stable digest of tool args so the record is queryable/comparable without
// storing arbitrary payloads (§17.5 provenance, bounded).
function _digestArgs(args) {
  if (args == null) return null;
  try {
    const s = typeof args === 'string' ? args : JSON.stringify(args);
    return require('crypto').createHash('sha256').update(s).digest('hex').slice(0, 16);
  } catch { return null; }
}

function _pruneCalls(source) {
  const now = Date.now();
  const calls = (_toolCalls.get(source) || []).filter(c => now - c.ts < RATE_WINDOW_MS);
  _toolCalls.set(source, calls);
  return calls;
}

// §PHASEMAP P3 — COS ISOLATE AND VERIFY (docs/raid-warp-verification-phasemap.spec).
// A consequential action is verified in a COS compartment BEFORE it touches real
// state (§1.1 nothing real until proven, §2.1 no mutation before pass). §8.4:
// _approveTool has 6 live callers, all synchronous — so P3 does NOT make it
// async. Instead this is a SEPARATE async verify the sandbox path opts into,
// leaving every existing caller untouched (§0.4 more optionality, not a breaking
// change). §8.6/§16.5: it DELEGATES to lib/execution-pipeline (which already
// chains BranchEngine.fork → SandboxRunner.run → CompareEngine) — the isolation
// machinery is reused, not rebuilt. commit-only-on-PASS is the pipeline's own
// guarantee (§2.1). A non-consequential action returns { verified:true,
// skipped:'not-consequential' } fast — the sandbox is earned, not universal
// (§16.4 complexity earns its existence).
const _CONSEQUENTIAL_ACTIONS = new Set(['forge', 'build', 'delete', 'rollback', 'repair', 'migrate', 'scaffold']);
function _isConsequential(action, opts = {}) {
  if (opts.consequential === true) return true;
  if (opts.consequential === false) return false;
  return _CONSEQUENTIAL_ACTIONS.has(action);
}

async function verifyInIsolation({ source, action, specPath, outputDir, testCommand, opts = {} } = {}) {
  // Not consequential → no sandbox needed. Fast path, recorded (§17.6).
  if (!_isConsequential(action, opts)) {
    recordDecision({ source, tool: action, outcome: 'executed', approved: true,
      causedBy: opts.causedBy, args: { verify: 'skipped-not-consequential' } });
    return { verified: true, skipped: 'not-consequential', action };
  }
  // Consequential → run the existing isolate→verify→compare pipeline (§8.6 reuse).
  if (!specPath) {
    return { verified: false, error: 'verifyInIsolation: specPath required for a consequential action (§1.2)' };
  }
  let pipeline;
  try { pipeline = require('../../../lib/execution-pipeline'); }
  catch (e) { return { verified: false, error: `execution-pipeline unavailable: ${e.message}` }; }

  let result;
  try {
    // §BUGFIX 2026-08-12 — was calling runPipeline(specPath, {outputDir,
    // testCommand}), a bare string as the first argument. runPipeline's
    // real signature destructures {specPath, outputDir, provider,
    // testCommand, ...} FROM its first argument — a string has no
    // .specPath property, so this has been silently resolving to
    // specPath:undefined on every real call, failing immediately at the
    // 'validate' stage with 'specPath required'. Confirmed live before
    // fixing: reproducing this exact call pattern returns
    // {ok:false,stage:'validate',error:'specPath required'} every time.
    // This means the P3-P6 isolation/verify/compare/rewind spine — the
    // real safety backbone for every consequential action in NEXUS — has
    // never actually run for real. Found while checking repair-on-
    // prompt.js's real dependencies before wiring R3 to them.
    result = await pipeline.runPipeline({ specPath, outputDir, testCommand });
  } catch (e) {
    recordDecision({ source, tool: action, outcome: 'error', approved: false,
      error: `isolation verify threw: ${e.message}`, causedBy: opts.causedBy });
    return { verified: false, error: `isolation verify threw: ${e.message}` };
  }

  // The pipeline never touched the real target unless it PASSED (§2.1). Map its
  // verdict onto verify + record (§17.6 auditable).
  const verified = !!(result && result.ok);

  // §PHASEMAP P5 — COMPARE CONTRACT vs OUTPUT. The pipeline ALREADY gates on
  // regressions (CompareEngine vs golden → ok:false, stage:'compare') — §16.5,
  // don't duplicate the gate. P5's job is to make a contract-vs-output mismatch
  // LEGIBLE as what it is (§16.2 reads like a story): a compare-stage failure is
  // a distinct, first-class signal in the verdict + record, not lumped with build
  // or validate failures. This is the "comparison engine between contract and
  // outputs" surfaced to RAID.
  const compareFailed = !verified && result?.stage === 'compare';
  const regressions = (result?.compareReport?.regression?.regressions) || result?.regressions || [];

  // §PHASEMAP P6 — REWIND ON FAIL. A failed verification (P2-P5) is snapshotted
  // so the decision point is replayable and inspectable — the failure becomes
  // training data, not a lost event (§0.3 nothing lost, §7.4 dead branches are
  // data, §0.1 evidence over memory). §8.6 built on the real replay-engine
  // snapshot() API. Non-fatal: a snapshot hiccup never changes the verdict.
  let snapshotId = null;
  if (!verified) {
    try {
      const replay = require('../../../lib/replay-engine');
      const snap = replay.snapshot({
        trigger: 'raid.verify.fail',
        actor: source,
        requestId: opts.requestId || null,
        action, stage: result?.stage, contractBreach: compareFailed,
      });
      snapshotId = snap && snap.snapshotId || null;
    } catch (_) { /* replay unavailable — the fail is still recorded, just not replayable */ }
  }

  // §PHASEMAP P4 — SIGMA + BEHAVIORAL DRIFT SCORING. Score the isolated run:
  // sigma (divergence from baseline) + BDA (behavioral regime). These are SOFT
  // signals (§17.10 — weight 0.3, they FLAG, they do not by themselves hard-fail
  // a run that otherwise passed). A sigma spike or an unstable regime
  // (DYSREGULATED/COLLAPSING) is surfaced to the caller and recorded, so a run
  // that "passed" but drifted is visible (§13.4 drift is data). §8.6 — built on
  // the real computeSigma(event, baseline, cfrState) + bda.observe({role,text}).
  const drift = _scoreRun({ source, action, result, verified, opts });

  recordDecision({
    source, tool: action,
    outcome: verified ? 'executed' : 'denied',
    approved: verified,
    error: verified ? null
      : (compareFailed ? `contract breach: output regressed vs golden (${regressions.length} regression${regressions.length === 1 ? '' : 's'})`
                       : `isolation verify failed at stage '${result?.stage || 'unknown'}'`),
    causedBy: opts.causedBy,
    meta: { branchId: result?.branchId, stage: result?.stage,
      sigma: drift.sigma, regime: drift.regime, drifted: drift.drifted,
      contractBreach: compareFailed, regressionCount: regressions.length,
      snapshotId },
  });
  return {
    verified,
    stage: result?.stage,
    branchId: result?.branchId,
    contractBreach: compareFailed,   // §P5 — a contract-vs-output mismatch, distinct from other failures
    regressions,                     // §P5 — the specific regressions (what broke the contract)
    snapshotId,                      // §P6 — a failed decision is replayable from this snapshot
    realTargetTouched: verified,     // pipeline only checks out to the real dir on pass
    sigma: drift.sigma,              // §P4 divergence score (soft signal)
    regime: drift.regime,            // §P4 behavioral regime (soft signal)
    drifted: drift.drifted,          // §P4 true if sigma spike or unstable regime
    driftReason: drift.reason,
    result,
  };
}

// §P4 helper — score a completed run for divergence + behavioral drift. Soft,
// non-throwing: a scoring failure degrades to { drifted:false } rather than
// breaking the verify (§1.2 — the score is best-effort context, not a gate).
const _SIGMA_SPIKE = 0.7;   // divergence above this is a flagged spike
const _UNSTABLE_REGIMES = new Set(['DYSREGULATED', 'COLLAPSING']);
function _scoreRun({ source, action, result, verified, opts = {} }) {
  let sigma = null, regime = null, drifted = false, reasons = [];
  // Sigma — divergence of this run's shape from baseline (§8.6 real API).
  try {
    const { computeSigma } = require('../../../intelligence/cfr/sigma');
    const event = { type: `raid.verify.${action}`, source, ok: verified, stage: result?.stage };
    const baseline = opts.sigmaBaseline || {};
    const s = computeSigma(event, baseline, opts.cfrState || {}, opts.intervalMs || 0);
    sigma = s && typeof s.score === 'number' ? s.score : null;
    if (sigma != null && sigma >= _SIGMA_SPIKE) { drifted = true; reasons.push(`sigma spike ${sigma}`); }
  } catch (e) { reasons.push(`sigma unavailable: ${e.message}`); }
  // BDA — behavioral regime of the run's narrative (§8.6 real API, §0.1 verified:
  // meta/bda exports the BDAKernel CLASS, not a factory. Instantiate once (cached)
  // so it accumulates observation history — drift is measured across runs, not
  // per-run in isolation. observe() returns { pendulum: { regime } }.
  try {
    const kernel = _bdaKernel();
    if (kernel) {
      const text = `verify ${action} by ${source}: ${verified ? 'passed' : 'failed'} at ${result?.stage || 'unknown'}`;
      const obs = kernel.observe({ role: 'assistant', text });
      regime = obs?.pendulum?.regime || null;
      if (regime && _UNSTABLE_REGIMES.has(regime)) { drifted = true; reasons.push(`unstable regime ${regime}`); }
    }
  } catch (e) { reasons.push(`bda unavailable: ${e.message}`); }
  return { sigma, regime, drifted, reason: reasons.join('; ') || null };
}

// Cached BDA kernel — one instance accumulates the observation history drift
// analysis needs (a fresh kernel per call would always read STABLE).
let _bdaKernelInstance = null;
function _bdaKernel() {
  if (_bdaKernelInstance) return _bdaKernelInstance;
  try {
    const bda = require('../../../intelligence/bda');
    if (bda && bda.BDAKernel) _bdaKernelInstance = new bda.BDAKernel();
  } catch (_) { _bdaKernelInstance = null; }
  return _bdaKernelInstance;
}

function _approveTool(source, command, opts = {}) {
  if (!source) {
    return { approved: false, reason: 'source is required' };
  }

  const action   = opts.action || 'tool';

  // §PHASEMAP P2 — CONSTITUTION GATE (docs/raid-warp-verification-phasemap.spec).
  // The cheapest, most fundamental check runs FIRST (§17.10 — hard axioms run
  // first and are never skipped). constitutional-ai.check() is a HARD WARP axiom
  // (weight 1.0): a BLOCK-severity violation denies immediately, naming the
  // axiom (§1.2 specific). A WARN/held result is NOT a hard denial — it falls
  // through to the contract checks below (constitution's own severity model:
  // BLOCK = deny, WARN = held territory). §8.6 — built on the existing
  // check(req, ctx), not a reimplementation. Skipped only if the caller can't
  // supply an intent (constitution requires ctx.intent) — logged, never silent.
  if (opts.intent) {
    try {
      const constitution = require('../../../lib/constitutional-ai');
      const verdict = constitution.check(
        { source, action, command },
        { intent: opts.intent, jaa: opts.jaa }
      );
      if (verdict && verdict.pass === false && verdict.severity === 'block') {
        // Hard constitutional violation — deny, name the axiom (§1.2, §16.3).
        recordDecision({ source, tool: action, outcome: 'denied',
          approved: false, error: `constitution:${verdict.axiom}: ${verdict.reason}`,
          causedBy: opts.causedBy });
        return { approved: false, source, reason: `constitution denied — ${verdict.axiom}: ${verdict.reason}`,
          axiom: verdict.axiom, blast_radius: verdict.blast_radius,
          alternatives: verdict.alternatives || [] };
      }
      // WARN/held or pass → continue to contract checks. The verdict is attached
      // so the caller sees it (§17.6 auditable).
      opts._constitutionVerdict = verdict;
    } catch (e) {
      // §1.2 — constitution unreachable is loud, not silent. Fail CLOSED for a
      // consequential action would be safest, but P2's scope is the check itself;
      // a broken constitution module is a system fault surfaced, not a swallow.
      console.warn(`[raid] constitution check unavailable for '${action}': ${e.message}`);
    }
  }

  const contract = contracts.get(source);
  const isDefault = !contracts.CONTRACTS[source];

  const calls = _pruneCalls(source);

  // Explicit denial first — most specific, clearest reason.
  if ((contract.denied_actions || []).includes(action)) {
    const reason = isDefault
      ? `minimal-trust default contract explicitly denies '${action}'`
      : `'${action}' is explicitly denied for source '${source}'`;
    calls.push({ ts: Date.now(), action, approved: false });
    return { approved: false, source, trust_level: contract.trust_level, reason };
  }

  // Proof-gated contracts (the _default fallback, or any contract that
  // opts into it) — anything not explicitly denied needs proof.
  if (contract.proof_required && !opts.proof) {
    calls.push({ ts: Date.now(), action, approved: false });
    return { approved: false, source, trust_level: contract.trust_level, reason: `proof required, none supplied for '${action}'` };
  }

  // Allowed by an explicit allow-list, or implicitly allowed because proof
  // was supplied and proof_required gates the rest.
  const allowed = (contract.allowed_actions || []).includes(action) || (contract.proof_required && !!opts.proof);
  if (!allowed) {
    calls.push({ ts: Date.now(), action, approved: false });
    return { approved: false, source, trust_level: contract.trust_level, reason: `'${action}' is not in '${source}'s allowed_actions` };
  }

  // Rate limit — checked last, only on the path that would otherwise approve.
  const limit = (contract.rate_limits || {})[action] || (contract.rate_limits || {})['*'];
  if (limit) {
    const recentForAction = calls.filter(c => c.action === action);
    if (recentForAction.length >= limit.max) {
      const oldest = recentForAction[0].ts;
      const retryAfterMs = Math.max(0, limit.windowMs - (Date.now() - oldest));
      calls.push({ ts: Date.now(), action, approved: false });
      return { approved: false, source, trust_level: contract.trust_level, reason: `rate limit exceeded for '${action}' (${limit.max}/${limit.windowMs}ms)`, retryAfterMs };
    }
  }

  calls.push({ ts: Date.now(), action, approved: true });
  return { approved: true, source, trust_level: contract.trust_level, reason: 'allowed' };
}

function _toolHealthSnapshot() {
  const snap = {};
  for (const [source, calls] of _toolCalls.entries()) {
    const recent = calls.filter(c => Date.now() - c.ts < RATE_WINDOW_MS);
    snap[source] = {
      recentCalls:   recent.length,
      recentDenials: recent.filter(c => !c.approved).length,
    };
  }
  return snap;
}

// ── Phase 6 — bus wiring (§14.1: event → gate → event) ────────────────────────
// RAID existed as a real, tested decision engine (_decide/_health/_weights)
// but was never bus-wired — only reachable via a direct function call.
// This closes that: cortex.orion.classified (Phase 5) → _decide() → cortex.raid.decided.
// The existing direct-call path is untouched; this is an additional consumer
// of the same _decide(), not a replacement for it (§3.4 — the route was
// already proven at the raw-code layer; this is the same code, bus-triggered).
let _bus = null;

function _onOrionClassified(event) {
  const classification = event?.payload;
  if (!classification?.faultClass) return;

  const call = {
    prompt: classification.intent,
    intent: classification.intent,
    faultClass: classification.faultClass,
    context: {
      cfrRegime: classification.context?.cfrRegime,
      cfrSigmaFloor: classification.context?.cfrSigmaFloor,
      componentId: classification.context?.componentId,
      causedBy: classification.context?.causedBy,
      sessionId: classification.context?.sessionId,
    },
  };

  const decision = _decide(call, _health, _weights);
  if (_bus) _bus.emit('cortex.raid.decided', {
    decision, faultClass: classification.faultClass, causedBy: classification.context?.causedBy,
  }, { source: MODULE_ID });
}

function init(cfg = {}) {
  _bus = cfg.bus || null;
  if (_bus) _bus.on('cortex.orion.classified', _onOrionClassified);
  console.log(`[${MODULE_ID}] v${VERSION} — bus-wired to cortex.orion.classified${_bus ? '' : ' (no bus — test mode)'}`);
  return { ok: true };
}

function stop() {
  if (_bus) _bus.off('cortex.orion.classified', _onOrionClassified);
  _bus = null;
}

// ── §PHASEMAP P7 — the ONE fused verify every system calls (WARP GateFusion) ──
// (docs/raid-warp-verification-phasemap.spec). verify(decision) composes the
// whole spine into a single call: constitution gate (P2, hard + cheap, runs
// FIRST and short-circuits — §17.10) → isolate+drift+compare+rewind (P3-P6 via
// verifyInIsolation) → one unified verdict, recorded (P1). §16.5 — this COMPOSES
// the pieces built in P1-P6, it does not reimplement them. §10.3 — agent-tools,
// the execution-pipeline, and the autonomous loop all call THIS, so there is one
// spine, not N verification paths. The StreamLog audit trail is the decision
// record every step already writes (§17.6).
//
// @param {object} decision
//   source, action, intent  — for the constitution gate (P2)
//   specPath, outputDir, testCommand — for isolation (P3-P6), if consequential
//   opts — passthrough (causedBy, requestId, sigmaBaseline, ...)
// @returns {Promise<{approved, stage, reason, axiom?, contractBreach?, sigma?, regime?, drifted?, snapshotId?, verdicts}>}
async function verify(decision = {}) {
  const { source, action = 'tool', intent, specPath, outputDir, testCommand, opts = {} } = decision;
  const verdicts = {};

  // ── Gate 1: constitution (P2) — hard, cheap, FIRST. A block short-circuits the
  // whole chain before any sandbox cost (§17.10 hard axioms run first).
  const approval = _approveTool(source, action, { action, intent, causedBy: opts.causedBy, jaa: opts.jaa });
  verdicts.constitution = { approved: approval.approved, axiom: approval.axiom, reason: approval.reason };
  if (!approval.approved) {
    // Denied at the constitution/contract gate — no isolation needed. Already
    // recorded by _approveTool (P1/P2 compose).
    return {
      approved: false, stage: 'constitution',
      reason: approval.reason, axiom: approval.axiom,
      blast_radius: approval.blast_radius, alternatives: approval.alternatives || [],
      verdicts,
    };
  }

  // ── Gate 2: isolate → drift → compare → rewind (P3-P6). Only runs if the
  // constitution gate passed. For a non-consequential action this returns fast
  // (verified:true, skipped). verifyInIsolation records the decision (P1) and
  // snapshots on fail (P6).
  const iso = await verifyInIsolation({ source, action, specPath, outputDir, testCommand, opts });
  verdicts.isolation = {
    verified: iso.verified, stage: iso.stage, skipped: iso.skipped,
    contractBreach: iso.contractBreach, sigma: iso.sigma, regime: iso.regime,
    drifted: iso.drifted, snapshotId: iso.snapshotId,
  };

  // ── Fused verdict: approved iff constitution passed AND isolation verified.
  return {
    approved: approval.approved && iso.verified,
    stage: iso.verified ? 'approved' : (iso.stage || 'isolation'),
    reason: iso.verified ? 'all gates passed'
      : (iso.contractBreach ? 'contract breach: output regressed vs golden'
                            : `verification failed at stage '${iso.stage || 'unknown'}'`),
    contractBreach: iso.contractBreach,
    sigma: iso.sigma, regime: iso.regime, drifted: iso.drifted,
    regressions: iso.regressions,
    snapshotId: iso.snapshotId,   // §P6 — a failed fused verify is replayable
    verdicts,                     // the per-gate breakdown (§17.6 legible)
  };
}

// ── decideForContract — RR1's real, additive fidelity-based selection ───────
// §BUILT 2026-09-13 (MCO2/RR1) — deliberately NOT added inside _decide()
// above. _decide() is documented as pure and pinned: tests/modules/
// raid-fitness-real-terms.test.js's T-007 explicitly asserts "_decide
// without faultClass → SNR gate never engages (existing behavior
// untouched)" and pins the exact resulting agent for a real fixture.
// Reusing that function for general fidelity-scored contract routing
// would either break T-007 or require silently special-casing around it —
// exactly the "silent second path those tests can't see" _decide()'s own
// SNR-gate comment already warns against. This is a new, separate,
// additive function instead (§3.1 — phased, independently-verifiable
// piece, not a rewrite of pinned logic).
//
// Checked before wiring this in anywhere: guardian/server.js's real
// POST /command handler explicitly does NOT want this. Its own comment,
// read directly: "Provider here is explicitly chosen by the caller, not
// RAID-picked — that's correct, the console/CLI already decided who
// handles this." That is a deliberate, already-reasoned design decision,
// not an oversight RR1 is meant to fix — this function must never be
// wired into that call path. The real, uncontested gap is elsewhere:
// idearium/spec-engine/chunk-dispatch.js's `opts.preferAgent || 'ollama'`
// — a hardcoded, unreasoned fallback with no explicit caller decision
// behind it at all (confirmed by reading that file directly).
//
// Reuses the SAME _fitness()/_agentAvailable() machinery _decide()'s own
// "computed chain" branch already uses below — no second scoring formula
// (§8.6). Deliberately does NOT apply LAW_I's chatgpt-first default here:
// LAW_I is James's explicit stated preference for the DEFAULT fallback
// chain on raw calls ("use ChatGPT and Gemini since they're free"), not a
// claim that chatgpt has the highest fidelity for every contract — this
// function answers a different, narrower question (which agent fits THIS
// contract's real fitness terms best) on purpose, for the specific real
// gap named above, not as a universal replacement for LAW_I.
function decideForContract(contract = {}, health = _health, weights = _weights) {
  const cluster = _cluster(contract.intention || contract.content || contract.title || '');
  const callerComponentId = contract.componentId || null;
  const chain = ['chatgpt', 'gemini', 'ollama', 'claude', 'perplexity', 'deepseek'];
  const survivors = chain.filter(name => _agentAvailable(name, health, {}));

  if (!survivors.length) {
    // §1.2 — never fabricate a winner when nothing is available; same
    // unconditional-reserve law LAW_III already relies on in _decide().
    return {
      agent: 'claude', cluster, score: null, tokenBudget: null,
      reason: 'no survivors available — claude API unconditional reserve (LAW_III parity)',
      candidates: [],
    };
  }

  const ranked = survivors
    .map(name => ({ name, score: _fitness(name, cluster, health, callerComponentId) }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  let tokenBudget = null;
  try {
    const { AGENT_CONSTRAINTS } = require('../../../lib/agent-router');
    tokenBudget = AGENT_CONSTRAINTS[best.name] || null; // real gap: not every agent has a real entry (e.g. ollama) — null is honest, not fabricated
  } catch (_) { /* agent-router unreachable — routing still returns, budget just null (§1.2) */ }

  return {
    agent: best.name,
    cluster,
    score: best.score,
    tokenBudget,
    reason: `RR1 fidelity ranking: highest fitness for '${cluster}' (${best.score.toFixed(3)})`,
    candidates: ranked,
  };
}

module.exports = {
  MODULE_ID, VERSION,
  _decide, _cluster, _health, _weights,
  _agentAvailable, _fitness, HEALTH_KEY,
  _roleConfidence, _topologicalProximity, setCausalGraph,
  recordOutcome,
  startHealthPoll, stopHealthPoll,
  _approveTool, _toolHealthSnapshot, recordDecision, verifyInIsolation, verify,
  init, stop, _onOrionClassified,
  decideForContract,
};
