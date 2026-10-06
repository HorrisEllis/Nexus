'use strict';
/**
 * lib/pipeline-routing.js — the build pipeline's routing and fallback policy.
 * comp_id: nexus.lib.pipeline-routing
 * UUID: nexus-lib-pipeline-routing-v1-0000-2026-1001-jamesbrooks-001
 * Map: docs/2026-10-01-routing-registry-genesis-phasemap.spec (RG1)
 *
 * James: "can we have full options for fallback logic, routing. what could improve stability with the pipeline?"
 *
 * Before: ONE hard-coded hop (chatgpt → gemini, idearium/api speceng.build), tried once, no memory of a provider
 * that is down. This module is the policy; chunk-dispatch walks the route it returns.
 *
 *   policyFrom(config, overrides)   the routing.* config (idearium/lib/config-core.cjs) → a policy object
 *   plan({ preferAgent, block, policy, records, now })
 *                                   → { route: [{ provider, why }], skipped: [{ provider, why }], mode }
 *       modes  fixed       the chosen agent only
 *              chain       the chosen agent, then the fallback chain (block's own `fallback:` first, then global)
 *              local-first ollama first, then the chosen agent and the chain
 *              economy     the candidates ordered by lib/economy/router.choose (what has worked, cost, latency)
 *   classify(result)                a failed attempt → empty · truncated · refused · timeout · provider-down ·
 *                                   rate-limit · login · unknown (guardian/lib/job-retry.js classify, the seam
 *                                   detector's summary, the error text)
 *   shouldFallback(cls, policy)     does this class move to the next provider? (login never: it needs a person)
 *   breaker                         per provider: `threshold` failures in a row open it for `cooldownMs`; an open
 *                                   provider is skipped (recorded, never silent); a success closes it.
 *
 * Reuse (§8.6): lib/agent-providers.js (the one list), lib/economy/router.js (the learned order), the breaker shape of
 * guardian/lib/dispatch-ladder.js, the classes of guardian/lib/job-retry.js. Pure apart from the breaker's in-process
 * state; nothing written to disk.
 */
const MODULE_ID = 'nexus.lib.pipeline-routing';
const VERSION = '1.0.0';

const MODES = Object.freeze(['learned', 'fixed', 'chain', 'local-first', 'economy']);
const CLASSES = Object.freeze(['empty', 'truncated', 'refused', 'timeout', 'provider-down', 'rate-limit', 'login', 'tool-errors', 'unknown']);   // §CT6 tool-errors
// §CT2 0.39.348 — James: "if its not equipped for the task". A crash is not the only sign: the verdicts that come later —
// its file failed its test, its draft was dismissed, its output broke a constraint — say a model was not up to the job.
// They teach the learned order (a failed record for that kind of job); they never open a breaker (the provider is up).
const VERDICTS = Object.freeze(['test-failed', 'dismissed', 'constraint']);
const DEFAULTS = Object.freeze({
  mode: 'learned',
  chain: ['ollama', 'gemini', 'chatgpt', 'claude', 'deepseek'],
  ollamaModels: [],        // §0.39.287 — each listed model is its own candidate (ollama:<model>), learned separately
  learnMinRecords: 4,      // below this many outcomes for a chunk type, learned mode keeps the chain order
  fallbackOn: ['empty', 'truncated', 'refused', 'timeout', 'provider-down', 'rate-limit', 'unknown'],
  maxHops: 3,
  attemptsPerHop: 6,
  breakerThreshold: 3,
  breakerCooldownMs: 10 * 60 * 1000,
  skipOpen: true,
  // §CT6 0.39.352 — James: "if the 3b fails, switch to the 7b, then the 16b deepseek, then the agents. have all of this
  // configurable." The escalation ladder for a phase build (ladder() below): written, or derived.
  escalate: true,
  escalation: [],          // empty = derived: the Ollama models smallest first, then the chain's agents
  escalateOn: ['failed', 'blocked', 'incomplete', 'tool-errors'],
  retriesPerRung: 1,
  maxToolErrors: 3,
  minBuildB: 3,            // §0.39.355 PB1 — a derived ladder leaves off Ollama models smaller than this (0 = keep all)
});
const ESCALATE_ON = Object.freeze(['failed', 'blocked', 'incomplete', 'tool-errors']);

function _providers() { try { return require('./agent-providers.js'); } catch (_) { return null; } }
// §0.39.287 — a candidate is a provider, or provider:model (an Ollama model, learned on its own)
function _norm(n) {
  const P = _providers(); const s = String(n || '').trim().toLowerCase(); if (!s) return null;
  const i = s.indexOf(':'); const base = i > 0 ? s.slice(0, i) : s, model = i > 0 ? s.slice(i + 1) : '';
  const b = P ? P.normalize(base) : base;
  return model ? `${b}:${model}` : b;
}
function baseOf(id) { const s = String(id || ''); const i = s.indexOf(':'); return i > 0 ? s.slice(0, i) : s; }
function modelOf(id) { const s = String(id || ''); const i = s.indexOf(':'); return i > 0 ? s.slice(i + 1) : null; }
function _known(n) { const P = _providers(); return P ? P.isKnown(baseOf(n)) : true; }

/** jobTypeOf(block | chunk) — what kind of chunk this is, the key outcomes are learned under:
 *  a spec block → build:<block id>; a file chunk → build:file.<ext> (build:file.js, build:file.md …) */
function jobTypeOf(x = {}) {
  const file = x.realPath || (x.file && x.file.path) || null;
  if (file) { const m = String(file).toLowerCase().match(/\.([a-z0-9]+)$/); return `build:file.${m ? m[1] : 'none'}`; }
  return `build:${x.sectionId || x.id || 'chunk'}`;
}

function _list(v) {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string') return v.split(/[\s,>]+/).filter(Boolean);
  return [];
}

/** policyFrom(cfg, overrides) — config values (routing.*) → a policy; anything missing takes the default */
function policyFrom(cfg = {}, overrides = {}) {
  const g = (k, alt) => (cfg[k] !== undefined && cfg[k] !== null && cfg[k] !== '' ? cfg[k] : alt);
  const p = {
    mode: g('mode', DEFAULTS.mode),
    chain: _list(g('chain', DEFAULTS.chain)),
    fallbackOn: _list(g('fallback_on', g('fallbackOn', DEFAULTS.fallbackOn))),
    maxHops: Number(g('max_hops', g('maxHops', DEFAULTS.maxHops))),
    attemptsPerHop: Number(g('attempts_per_hop', g('attemptsPerHop', DEFAULTS.attemptsPerHop))),
    breakerThreshold: Number(g('breaker_threshold', g('breakerThreshold', DEFAULTS.breakerThreshold))),
    breakerCooldownMs: Number(g('breaker_cooldown_ms', g('breakerCooldownMs', DEFAULTS.breakerCooldownMs))),
    skipOpen: g('skip_open', g('skipOpen', DEFAULTS.skipOpen)) !== false,
    ollamaModels: _list(g('ollama_models', g('ollamaModels', DEFAULTS.ollamaModels))),
    learnMinRecords: Number(g('learn_min_records', g('learnMinRecords', DEFAULTS.learnMinRecords))),
    escalate: g('escalate', DEFAULTS.escalate) !== false,
    escalation: _list(g('escalation', DEFAULTS.escalation)),
    escalateOn: _list(g('escalate_on', g('escalateOn', DEFAULTS.escalateOn))),
    retriesPerRung: Number(g('retries_per_rung', g('retriesPerRung', DEFAULTS.retriesPerRung))),
    maxToolErrors: Number(g('max_tool_errors', g('maxToolErrors', DEFAULTS.maxToolErrors))),
    minBuildB: Number(g('min_build_b', g('minBuildB', DEFAULTS.minBuildB))),
    ...overrides,
  };
  if (!MODES.includes(p.mode)) p.mode = DEFAULTS.mode;
  if (!(p.maxHops >= 1)) p.maxHops = DEFAULTS.maxHops;
  if (!(p.attemptsPerHop >= 1)) p.attemptsPerHop = DEFAULTS.attemptsPerHop;
  p.fallbackOn = p.fallbackOn.filter(c => CLASSES.includes(c));
  p.escalateOn = (p.escalateOn || []).filter(c => ESCALATE_ON.includes(c));
  if (!(p.retriesPerRung >= 1)) p.retriesPerRung = DEFAULTS.retriesPerRung;
  if (!(p.maxToolErrors >= 0)) p.maxToolErrors = DEFAULTS.maxToolErrors;
  return p;
}

// ── breaker: per provider, in process ─────────────────────────────────────────
const _breakers = new Map();   // provider → { fails, openUntil, lastClass, lastAt }
const breaker = {
  state(provider, now = Date.now()) {
    const b = _breakers.get(provider);
    if (!b) return { provider, open: false, fails: 0 };
    return { provider, open: now < b.openUntil, fails: b.fails, openUntil: b.openUntil || null, lastClass: b.lastClass || null, lastAt: b.lastAt || null };
  },
  failure(provider, cls, policy = DEFAULTS, now = Date.now()) {
    const b = _breakers.get(provider) || { fails: 0, openUntil: 0 };
    // a request problem that is not the provider's fault does not count against it
    if (cls === 'truncated' || cls === 'refused' || cls === 'tool-errors' || VERDICTS.includes(cls)) { b.lastClass = cls; b.lastAt = now; _breakers.set(provider, b); return this.state(provider, now); }
    b.fails += 1; b.lastClass = cls; b.lastAt = now;
    if (b.fails >= (policy.breakerThreshold || DEFAULTS.breakerThreshold)) { b.openUntil = now + (policy.breakerCooldownMs || DEFAULTS.breakerCooldownMs); b.fails = 0; }
    _breakers.set(provider, b);
    return this.state(provider, now);
  },
  success(provider) { _breakers.delete(provider); },
  all(now = Date.now()) { return [..._breakers.keys()].map(p => this.state(p, now)); },
  reset(provider) { if (provider) _breakers.delete(provider); else _breakers.clear(); },
};

/** plan(...) — the ordered route for one chunk, each step with its reason; skipped providers say why */
function plan({ preferAgent = null, block = null, chunk = null, jobType = null, policy = DEFAULTS, records = null, now = Date.now(), economyPolicy = null } = {}) {
  const p = policy.mode ? policy : policyFrom(policy);
  const route = [], skipped = [];
  const seen = new Set();
  const add = (name, why) => {
    const n = _norm(name);
    if (!n || seen.has(n)) return;
    seen.add(n);
    if (!_known(n)) { skipped.push({ provider: n, why: 'not a known provider (lib/agent-providers)' }); return; }
    const st = breaker.state(n, now);
    if (st.open && p.skipOpen) { skipped.push({ provider: n, why: `breaker open until ${new Date(st.openUntil).toISOString()} (last: ${st.lastClass})` }); return; }
    route.push({ provider: n, why });
  };
  const blockChain = block && Array.isArray(block.fallback) ? block.fallback : _list(block && block.fallback);
  const chosen = preferAgent || (block && block.agent) || null;

  const jt = jobType || jobTypeOf(chunk || block || {});
  // ollama → each configured model (learned mode); a name already naming a model stays as it is
  const expand = (list) => list.flatMap(c => (_norm(c) === 'ollama' && p.ollamaModels.length) ? p.ollamaModels.map(m => `ollama:${m}`) : [c]);

  if (p.mode === 'learned') {
    // §0.39.287 — James: "smart fallback for ollama and guardian, learn which models are best for what chunks".
    // Candidates: the chosen agent, the block's fallback, the chain (Ollama as its models). With enough recorded outcomes
    // for this chunk type, the economy's learning router orders them (Thompson sampling over ok/failed per
    // jobType × provider:model — exploration built in); until then, the chain order, said so.
    const cands = [...new Set(expand([chosen, ...blockChain, ...p.chain].filter(Boolean)).map(_norm).filter(Boolean))];
    let order = cands, why = 'chain order';
    try {
      const recs = (records || (() => { try { return require('./economy/ledger.js').records(); } catch (_) { return []; } })())
        .filter(r => r.jobType === jt);
      const n = recs.filter(r => cands.includes(r.provider)).length;
      if (n >= p.learnMinRecords) {
        // deterministic, not sampled: a build order must be repeatable. Each candidate's success rate is its Beta
        // posterior mean (1+ok)/(2+ok+failed) from lib/economy/router.js scores(); an untried candidate sits at 0.5, so it
        // is tried before anything that keeps failing and after anything that works (exploration without dice).
        const t = require('./economy/router.js').scores(recs, economyPolicy || {});
        const sc = (c) => { const x = t[`${jt}::${c}`]; return x ? x.success : 0.5; };
        order = cands.map((c, i) => ({ c, i, s: sc(c) })).sort((a, b) => b.s - a.s || a.i - b.i).map(x => x.c);
        why = (c) => { const x = t[`${jt}::${c}`]; return x ? `learned for ${jt}: ${x.ok} ok / ${x.bad} failed (${Math.round(x.success * 100)}%)` : `learned for ${jt}: not tried yet (0.5 prior)`; };
      } else why = `learning ${jt} — ${n}/${p.learnMinRecords} outcomes, chain order until then`;
    } catch (_) { /* chain order stands */ }
    for (const c of order) add(c, typeof why === 'function' ? why(c) : why);
  } else if (p.mode === 'fixed') {
    add(chosen || p.chain[0], chosen ? 'chosen' : 'first of the chain (nothing chosen)');
  } else if (p.mode === 'local-first') {
    add('ollama', 'local first');
    if (chosen) add(chosen, 'chosen');
    for (const c of blockChain) add(c, `block ${block.id} fallback`);
    for (const c of p.chain) add(c, 'fallback chain');
  } else if (p.mode === 'economy') {
    const cands = [...new Set([chosen, ...blockChain, ...p.chain].map(_norm).filter(Boolean))];
    let order = cands, why = 'economy unavailable — chain order';
    try {
      const R = require('./economy/router.js');
      const recs = records || (() => { try { return require('./economy/ledger.js').records(); } catch (_) { return []; } })();
      const r = R.choose(`build:${(block && block.id) || 'chunk'}`, cands, { policy: economyPolicy || {}, records: recs });
      if (r.order && r.order.length) { order = [...r.order, ...cands.filter(c => !r.order.includes(c))]; why = 'economy: learned order'; }
    } catch (_) { /* the chain order stands */ }
    for (const c of order) add(c, why);
  } else {   // chain
    if (chosen) add(chosen, 'chosen');
    for (const c of blockChain) add(c, `block ${block.id} fallback`);
    for (const c of p.chain) add(c, 'fallback chain');
  }
  // a route is never empty when something was chosen: an open breaker on every hop still tries the chosen agent once
  if (!route.length && chosen && _known(_norm(chosen))) route.push({ provider: _norm(chosen), why: 'every hop skipped — the chosen agent, once' });
  return { mode: p.mode, jobType: jt, route: route.slice(0, p.maxHops), skipped, beyond: route.slice(p.maxHops).map(r => r.provider), maxHops: p.maxHops };
}

/** classify(result) — why an attempt failed, as one class */
function classify(result = {}) {
  const text = [result.error, result.failureMode, result.detection && result.detection.summary, result.gate].filter(Boolean).join(' ');
  if (result.toolErrors || /tool calls failed in a row/i.test(text)) return 'tool-errors';   // §CT6 — up, but not equipped
  if (/log ?in|sign ?in|captcha|verify you are/i.test(text)) return 'login';
  if (/rate.?limit|usage (cap|limit)|too many requests|quota|economy/i.test(text)) return 'rate-limit';
  if (/ECONNREFUSED|ECONNRESET|ENOTFOUND|unreachable|not connected|no (tab|window|webview)|provider (is )?down|502|503|network error|failed to fetch/i.test(text)) return 'provider-down';
  if (/truncat|mid_sentence|cut off|incomplete/i.test(text)) return 'truncated';
  if (/empty|no text|0 ?ch\b|nothing (came back|answered)|no reply|NO_REPLY/i.test(text)) return 'empty';
  if (/timed? ?out|timeout|wall-clock|ETIMEDOUT|aborted/i.test(text)) return 'timeout';
  if (/refus|not allowed|blocked by|can.?t help|cannot help/i.test(text)) return 'refused';
  if (/empty|no text|0 ?ch|nothing (came back|answered)|no reply|NO_REPLY/i.test(text) || (result.ok === false && !String(result.text || '').trim() && !text)) return 'empty';
  try {
    const jr = require('../guardian/lib/job-retry.js').classify(result.gate || '', text);
    if (jr.kind === 'needs-you') return 'login';
    if (jr.kind === 'no-reply') return 'empty';
    if (jr.kind === 'provider-error' || jr.kind === 'input' || jr.kind === 'submit' || jr.kind === 'tab-busy') return 'provider-down';
  } catch (_) { /* guardian not present */ }
  return 'unknown';
}

// §CT6 0.39.352 — a model's size from its name (qwen2.5-coder:7b → 7, deepseek-coder-v2:16b → 16, llama3.2:3b → 3);
// the tag after ':' is read first, so a version (qwen2.5) is never taken for a size. null = no size in the name.
function sizeOf(model) {
  const s = String(model || '').toLowerCase(); const tag = s.includes(':') ? s.slice(s.lastIndexOf(':') + 1) : s;
  const m = tag.match(/(\d+(?:\.\d+)?)\s*b(?![a-z])/) || s.match(/[-_:](\d+(?:\.\d+)?)b(?![a-z])/);
  return m ? Number(m[1]) : null;
}
/** ladder(policy, { installed }) — the escalation ladder, lowest rung first: routing.escalation exactly as written, or
 *  derived — the Ollama models (routing.ollama_models, else the installed ones) smallest first by the size in their
 *  name (unsized after, in their order), then the chain's providers that are not Ollama. Each rung { provider, model }. */
function ladder(policy = DEFAULTS, { installed = [] } = {}) {
  const rung = (p) => { const n = _norm(p); if (!n) return null; const i = n.indexOf(':'); return i > 0 ? { provider: n, base: n.slice(0, i), model: n.slice(i + 1) } : { provider: n, base: n, model: null }; };
  const written = (policy.escalation || []).map(rung).filter(Boolean);
  if (written.length) return { rungs: written, from: 'routing.escalation' };
  const models = (policy.ollamaModels && policy.ollamaModels.length ? policy.ollamaModels : installed || []).map(String).filter(Boolean);
  const floor = Number.isFinite(policy.minBuildB) ? policy.minBuildB : DEFAULTS.minBuildB;
  // §0.39.355 PB1 — a model too small to build a phase is not a rung (unsized models stay: their size is unknown)
  const all = models.map((m, i) => ({ m, i, z: sizeOf(m) }));
  const sized = all.filter(x => !(floor > 0 && x.z != null && x.z < floor));
  const below = all.filter(x => !sized.includes(x)).map(x => x.m);
  sized.sort((a, b) => (a.z == null) - (b.z == null) || (a.z || 0) - (b.z || 0) || a.i - b.i);
  const rungs = sized.map(x => rung(`ollama:${x.m}`)).filter(Boolean);
  for (const p of policy.chain || DEFAULTS.chain) { const r = rung(p); if (r && r.base !== 'ollama' && !rungs.some(x => x.provider === r.provider)) rungs.push(r); }
  const left = below.length ? ` (left off, smaller than ${floor}b: ${below.join(', ')})` : '';
  return { rungs, below, from: (models.length ? 'derived: the Ollama models smallest first, then the chain\'s agents' : 'derived: no Ollama models listed or installed — the chain\'s agents') + left };
}
/** climb({ rungs, policy, attempt, onOutcome }) — walk the ladder. attempt(rung, index, tryNo) → { state, trigger?, … }
 *  (trigger overrides state for the decision: 'tool-errors'). onOutcome(out, { rung, index, tryNo, next, exhausted }) is
 *  awaited after every attempt — the caller records it, and the climb when next is set ({ index, tryNo, how:
 *  'retrying' | 'escalating', rung }). Returns the last attempt's out with { index, tryNo, exhausted }. No rungs: one
 *  attempt with rung null. */
async function climb({ rungs = [], policy = DEFAULTS, attempt, onOutcome = async () => {} } = {}) {
  if (!rungs.length) { const out = await attempt(null, -1, 1); await onOutcome(out, { rung: null, index: -1, tryNo: 1, next: null, exhausted: false }); return { ...out, index: -1, tryNo: 1, exhausted: false }; }
  const per = policy.retriesPerRung >= 1 ? policy.retriesPerRung : DEFAULTS.retriesPerRung;
  let i = 0, t = 1;
  for (;;) {
    const out = await attempt(rungs[i], i, t);
    const up = shouldEscalate(out.trigger || out.state, policy);
    const next = !up ? null : t < per ? { index: i, tryNo: t + 1, how: 'retrying', rung: rungs[i] } : i + 1 < rungs.length ? { index: i + 1, tryNo: 1, how: 'escalating', rung: rungs[i + 1] } : null;
    const exhausted = up && !next;
    await onOutcome(out, { rung: rungs[i], index: i, tryNo: t, next, exhausted });
    if (!next) return { ...out, index: i, tryNo: t, exhausted };
    i = next.index; t = next.tryNo;
  }
}
/** changedAnything(r) — §0.39.355 PB2: did a phase attempt change a file — its reply's code was written, staged or
 *  proposed, or a code_edit / code_write / code_batch call succeeded. A reply that changed nothing did not build. */
const _WRITE_TOOLS = /(^|\.)(code_edit|code_write|code_batch)(\.tool)?$/;
function changedAnything(r) {
  if (!r) return false;
  if (r.injects && Array.isArray(r.injects.injects) && r.injects.injects.length) return true;
  return Array.isArray(r.toolCalls) && r.toolCalls.some(t => t && t.ok !== false && !t.error && _WRITE_TOOLS.test(String(t.name || '')));
}
/** shouldEscalate(state, policy) — does this outcome of a phase build climb the ladder */
function shouldEscalate(state, policy = DEFAULTS) { return policy.escalate !== false && (policy.escalateOn || DEFAULTS.escalateOn).includes(state); }

function shouldFallback(cls, policy = DEFAULTS) {
  const on = (policy.fallbackOn || DEFAULTS.fallbackOn);
  return cls !== 'login' && on.includes(cls);
}

/** recordHop({ jobType, provider, outcome, class, ms, error }) — one hop's outcome into the economy ledger, so the
 *  learned mode (and the provider economy) learn from every build. ok → ok; truncated/timeout/login keep their name;
 *  anything else is failed. A refusal is recorded as refused (the router ignores it: the provider was not at fault). */
function recordHop(h = {}) {
  try {
    const outcome = h.outcome === 'ok' ? 'ok' : (['truncated', 'timeout', 'login', 'refused'].includes(h.class) ? h.class : 'failed');
    return require('./economy/ledger.js').record({ provider: h.provider, model: modelOf(h.provider), jobType: h.jobType || 'build:chunk',
      outcome, ms: h.ms, reason: h.error || h.class || null });
  } catch (e) { return { ok: false, error: e.message }; }
}

/** learned({ jobType }) — what has been learned: per chunk type, each candidate's ok/failed, success rate, median ms */
function learned({ jobType = null, records = null } = {}) {
  let recs = records; if (!recs) { try { recs = require('./economy/ledger.js').records(); } catch (_) { recs = []; } }
  recs = recs.filter(r => String(r.jobType || '').startsWith('build:') && (!jobType || r.jobType === jobType));
  const t = require('./economy/router.js').scores(recs, {});
  const out = {};
  for (const s of Object.values(t)) (out[s.jobType] = out[s.jobType] || []).push({ provider: s.provider, ok: s.ok, failed: s.bad, success: s.success, medianMs: s.medianMs, records: s.records });
  for (const k of Object.keys(out)) out[k].sort((a, b) => b.success - a.success || b.records - a.records);
  return out;
}

module.exports = { MODULE_ID, VERSION, MODES, CLASSES, VERDICTS, ESCALATE_ON, DEFAULTS, sizeOf, ladder, changedAnything, shouldEscalate, climb, policyFrom, plan, classify, shouldFallback, breaker, jobTypeOf, baseOf, modelOf, recordHop, learned };
