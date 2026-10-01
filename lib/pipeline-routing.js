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

const MODES = Object.freeze(['fixed', 'chain', 'local-first', 'economy']);
const CLASSES = Object.freeze(['empty', 'truncated', 'refused', 'timeout', 'provider-down', 'rate-limit', 'login', 'unknown']);
const DEFAULTS = Object.freeze({
  mode: 'chain',
  chain: ['ollama', 'gemini', 'chatgpt', 'claude', 'deepseek'],
  fallbackOn: ['empty', 'truncated', 'refused', 'timeout', 'provider-down', 'rate-limit', 'unknown'],
  maxHops: 3,
  attemptsPerHop: 6,
  breakerThreshold: 3,
  breakerCooldownMs: 10 * 60 * 1000,
  skipOpen: true,
});

function _providers() { try { return require('./agent-providers.js'); } catch (_) { return null; } }
function _norm(n) { const P = _providers(); const s = String(n || '').trim().toLowerCase(); return s ? (P ? P.normalize(s) : s) : null; }
function _known(n) { const P = _providers(); return P ? P.isKnown(n) : true; }

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
    ...overrides,
  };
  if (!MODES.includes(p.mode)) p.mode = DEFAULTS.mode;
  if (!(p.maxHops >= 1)) p.maxHops = DEFAULTS.maxHops;
  if (!(p.attemptsPerHop >= 1)) p.attemptsPerHop = DEFAULTS.attemptsPerHop;
  p.fallbackOn = p.fallbackOn.filter(c => CLASSES.includes(c));
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
    if (cls === 'truncated' || cls === 'refused') { b.lastClass = cls; b.lastAt = now; _breakers.set(provider, b); return this.state(provider, now); }
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
function plan({ preferAgent = null, block = null, policy = DEFAULTS, records = null, now = Date.now(), economyPolicy = null } = {}) {
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

  if (p.mode === 'fixed') {
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
  return { mode: p.mode, route: route.slice(0, p.maxHops), skipped, beyond: route.slice(p.maxHops).map(r => r.provider), maxHops: p.maxHops };
}

/** classify(result) — why an attempt failed, as one class */
function classify(result = {}) {
  const text = [result.error, result.failureMode, result.detection && result.detection.summary, result.gate].filter(Boolean).join(' ');
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

function shouldFallback(cls, policy = DEFAULTS) {
  const on = (policy.fallbackOn || DEFAULTS.fallbackOn);
  return cls !== 'login' && on.includes(cls);
}

module.exports = { MODULE_ID, VERSION, MODES, CLASSES, DEFAULTS, policyFrom, plan, classify, shouldFallback, breaker };
