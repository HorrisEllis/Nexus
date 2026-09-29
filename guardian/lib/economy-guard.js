'use strict';
/**
 * guardian/lib/economy-guard.js — the provider economy at guardian's dispatch. §0.39.281 EC6.
 * comp_id: nexus.guardian.economy-guard
 * UUID: nexus-guardian-economy-guard-v1-0000-2026-0929-jamesbrooks-001
 * Map: docs/2026-09-29-provider-economy-phasemap.spec (EC6).
 *
 * check(job) → the gate's verdict for this job now (lib/economy/gate.js over lib/economy/store.js's policy and
 *              lib/economy/ledger.js's usage). The dispatcher acts on it: allow → dispatched; wait → queued with the
 *              reason and dispatched again when the wait ends; stop → failed with the reason; fallback → the provider
 *              the PERSON configured (onLimit), said on the job (economyFallback) and the bus.
 * attach(bus, getJob) → every guardian.job.complete / .error / .timeout and every login wall is written to the ledger
 *              (tokens estimated by lib/economy/tokens.js, the method named), so the limits, the learned token
 *              constraints and the learning router all read what really happened.
 * jobTypeOf(job) → build · plan · manage · heal · wake · automation · chat (from what the job carries).
 */
const Ledger = require('../../lib/economy/ledger.js');
const Store = require('../../lib/economy/store.js');
const Gate = require('../../lib/economy/gate.js');
const Tokens = require('../../lib/economy/tokens.js');

function jobTypeOf(job = {}) {
  if (job.jobType) return job.jobType;
  if (job.wakeDepth) return 'wake';
  const s = `${job.source || ''} ${job.command || ''}`.toLowerCase();
  if (/heal|repair|gap/.test(s)) return 'heal';
  if (/plan/.test(s)) return 'plan';
  if (/manage/.test(s)) return 'manage';
  if (/automation|workflow|macro/.test(s)) return 'automation';
  if (/build|chunk|spec|codegen|phase/.test(s)) return 'build';
  return 'chat';
}

function createEconomyGuard({ now = () => Date.now(), policy = () => Store.load() } = {}) {
  let _cache = null, _at = 0;
  const pol = () => { if (!_cache || now() - _at > 5000) { _cache = policy(); _at = now(); } return _cache; };

  function check(job) {
    if (!job || !job.provider) return { verdict: 'allow' };
    const provider = String(job.provider).toLowerCase();
    const p = pol();
    if (!p.providers || !p.providers[provider]) return { verdict: 'allow' };
    const estTokens = Tokens.estimate(job.prompt || job.content || '');
    return { ...Gate.decide({ provider, jobType: jobTypeOf(job), estTokens }, { policy: p, usage: Ledger.usage(provider, now()), now: now() }), estTokens, jobType: jobTypeOf(job) };
  }
  function begin(job) { if (job && job.provider) Ledger.begin(String(job.provider).toLowerCase(), job.id); }

  function _record(job, outcome, reason) {
    if (!job || !job.provider) return;
    Ledger.record({ provider: String(job.provider).toLowerCase(), jobType: jobTypeOf(job), jobId: job.id,
      tokensIn: Tokens.estimate(job.prompt || job.content || ''), tokensOut: Tokens.estimate(job.response || ''), tokenMethod: Tokens.METHOD,
      ms: job.dispatchedAt ? now() - job.dispatchedAt : (job.ts ? now() - job.ts : null), outcome, reason });
  }
  function attach(bus, getJob) {
    const payload = (ev) => (ev && ev.data) || ev || {};
    bus.on('guardian.job.complete', (ev) => { const d = payload(ev); const j = getJob(d.jobId); if (j) _record(j, j.truncated ? 'truncated' : 'ok'); });
    bus.on('guardian.job.error', (ev) => { const d = payload(ev); const j = getJob(d.jobId); if (j) _record(j, /sign ?in|log ?in|login/i.test(String(d.error || '')) || d.needsUser ? 'login' : 'failed', d.error); });
    bus.on('guardian.job.timeout', (ev) => { const d = payload(ev); const j = getJob(d.jobId); if (j) _record(j, 'timeout', d.reason); });
    bus.on('guardian.provider.login_required', (ev) => { const d = payload(ev); Ledger.record({ provider: d.provider, jobType: 'chat', outcome: 'login', reason: d.text || 'sign-in wall' }); });
  }
  return { check, begin, attach, jobTypeOf, policy: pol, invalidate: () => { _cache = null; } };
}

module.exports = { createEconomyGuard, jobTypeOf };
