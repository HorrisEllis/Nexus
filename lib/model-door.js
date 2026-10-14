'use strict';
/**
 * lib/model-door.js — copilot's one door for "which model" (CT1, docs/2026-10-05-code-tab-and-one-router-phasemap.spec).
 * component_id: nexus.lib.model-door
 *
 * James: "i feel like it should use copilot regardless, have copilot figure it, and learn from it. failure modes,
 * dynamically switch models, if its not equipped for the task".
 *
 * Not a fourth router: lib/pipeline-routing.js is the policy (learned per kind of job, breakers, the chain); this is
 * the door copilot serves it through (POST /api/route, POST /api/route/outcome in copilot/server.js).
 *   route({ kind, preferAgent, policy }, { defaultProvider, resolve }) → { ok, kind, mode, route:[{ provider, backend,
 *     agent, model, why }], skipped }
 *   outcome({ provider, kind, ok, class, ms, error, policy, verdict }) → { ok, recorded, breaker }
 *     verdict: true — a later judgment (CT2: test-failed · dismissed · constraint, or ok: accepted / passed): learned from,
 *     never a breaker
 * resolve(provider) → { backend, agent } — copilot's resolveDefaultBackend.
 */
const PR = require('./pipeline-routing.js');

const MODULE_ID = 'nexus.lib.model-door';
const VERSION = '1.0.0';

function route(body = {}, { defaultProvider = null, resolve, tabs = null, ready = null } = {}) {
  let preferAgent = body.preferAgent || (defaultProvider && !['auto', 'copilot'].includes(defaultProvider) ? defaultProvider : null);
  const policy = body.policy && typeof body.policy === 'object' ? body.policy : PR.DEFAULTS;
  const block = body.block && typeof body.block === 'object' ? body.block : null;   // a spec block's own agent and fallback chain
  // 0.60.8 — intent routing for reasoning, at the one door every caller uses (chat, the pages, chunk builds): spec, map,
  // plan, read — and any complex message — go to the reasoning agent first (lib/reasoning-route.js forDoor)
  let reasoning = null;
  try { reasoning = require('./reasoning-route.js').forDoor({ kind: body.kind, message: body.message || '', policy, block }); } catch (_) { reasoning = null; }
  // §RT1 — eligibility runs over every candidate, then the hop cap: capped first, an agent that can do the job but sits
  // past max_hops was never seen, and a job whose first three cannot do it found no one
  const pol = policy.mode ? policy : PR.policyFrom(policy);
  const cap = pol.maxHops >= 1 ? pol.maxHops : PR.DEFAULTS.maxHops;
  const planArgs = { block, jobType: String(body.kind || 'chat'), policy: { ...pol, maxHops: 50 }, records: body.records || null };
  let pl = PR.plan({ preferAgent, ...planArgs });
  // what this kind of job has LEARNED (real outcomes) stands: reasoning only decides the order while the kind is untried
  const learnedAlready = pl.route.some(h => /\d+ ok \/ \d+ failed/.test(h.why || ''));
  if (reasoning && reasoning.reason && learnedAlready) reasoning = { ...reasoning, reason: false, why: `${reasoning.why} — but this kind has learned outcomes, so the learned order stands` };
  if (reasoning && reasoning.reason && reasoning.preferAgent) pl = PR.plan({ preferAgent: reasoning.preferAgent, ...planArgs });
  // no reasoner named: the first agent that is not Ollama goes first (Ollama codes; a reasoning agent reasons)
  if (reasoning && reasoning.reason && !reasoning.preferAgent && pl.route.length > 1 && PR.baseOf(pl.route[0].provider) === 'ollama') {
    const i = pl.route.findIndex(h => PR.baseOf(h.provider) !== 'ollama');
    if (i > 0) pl.route = [pl.route[i], ...pl.route.filter((_, k) => k !== i)];
  }
  if (reasoning && reasoning.reason && pl.route[0]) pl.route[0] = { ...pl.route[0], why: `reasoning: ${reasoning.why}${pl.route[0].why ? ` · ${pl.route[0].why}` : ''}` };
  const hops = pl.route.map(h => {
    const base = PR.baseOf(h.provider), r = resolve(base) || {};
    return { provider: h.provider, backend: r.backend || null, agent: r.agent || null, model: PR.modelOf(h.provider), why: h.why };
  });
  // §RT1 0.60.31 — eligibility, then preference: a hop that fails a hard requirement (a tool it lacks, a packet bigger
  // than its window, Guardian says it cannot answer now) is removed and the reason is said; the order above decides
  // among the rest. Whatever its learned score, and even when it was the preferred agent.
  const E = require('./route-eligibility.js');
  const needs = E.needsOf({ kind: body.kind, message: body.message || '', needs: body.needs || null, tokens: body.tokens || null });
  const el = E.check(hops, needs, { ready });
  const reasoningOut = reasoning && reasoning.reason ? { why: reasoning.why, preferAgent: reasoning.preferAgent || null } : null;
  if (!el.eligible.length) {
    return { ok: false, kind: pl.jobType, mode: pl.mode, route: [], skipped: pl.skipped, rejected: el.rejected, needs, by: 'copilot', reasoning: reasoningOut,
      error: `no agent meets this job's requirements — ${el.rejected.map(r => `${r.provider}: ${r.why}`).join('; ') || 'no candidates'}`,
      record: _record([], el.rejected, needs) };
  }
  // §HP18 0.55.2 — a browser agent with no tab connected goes behind the ones that have one (said on the hop, never dropped)
  const t = PR.byTabs(el.eligible.slice(0, cap), tabs, (h) => (h.backend === 'guardian' ? h.agent : null));
  const moved = new Map(t.moved.map(m => [m.provider, m.why]));
  const route = t.order.map(h => (moved.has(h.provider) ? { ...h, why: `${h.why ? `${h.why} · ` : ''}${moved.get(h.provider)}` } : h));
  return { ok: true, kind: pl.jobType, mode: pl.mode, route, skipped: pl.skipped, moved: t.moved, rejected: el.rejected, needs, by: 'copilot',
    reasoning: reasoningOut, record: _record(route, el.rejected, needs) };
}

/**
 * §RT1 — every route says: the reason for its first hop, the alternatives it kept (in order) and the ones it rejected
 * (with why), how confident the order is (learned outcomes for this kind, or untried), the fallback, and what verifies
 * the work. Confidence is the route's, not the intent's: splitting or asking on a low-confidence intent (CK-236) is not
 * built here.
 */
function _record(route, rejected, needs) {
  const first = route[0] || null;
  const m = first && /(\d+) ok \/ (\d+) failed/.exec(first.why || '');
  const n = m ? Number(m[1]) + Number(m[2]) : 0;
  const confidence = m && n ? { value: Math.round((Number(m[1]) / n) * 100) / 100, basis: `${m[1]} ok / ${m[2]} failed for this kind`, low: Number(m[1]) / n < 0.5 || n < 3 }
    : { value: null, basis: 'untried for this kind — the chain order (or the reasoner) decides', low: true };
  return {
    reason: first ? (first.why || 'first in the chain') : null,
    chosen: first ? first.provider : null,
    alternatives: route.slice(1).map(h => ({ provider: h.provider, why: h.why || null })),
    rejected,
    needs: { tools: needs.tools, tokens: needs.tokens, from: needs.from },
    confidence,
    fallback: route[1] ? route[1].provider : null,
    verification: 'the gate checks the work (contract-gates); its outcome comes back through outcome() and is classed (GT1) before the order learns from it',
  };
}

function outcome(body = {}) {
  if (!body.provider) return { ok: false, error: 'provider is required' };
  const policy = body.policy && typeof body.policy === 'object' ? body.policy : PR.DEFAULTS;
  const cls = body.ok ? null : (body.class || 'unknown');
  const rec = PR.recordHop({ provider: body.provider, jobType: String(body.kind || 'chat'), outcome: body.ok ? 'ok' : 'failed', class: cls, ms: body.ms || null, error: body.error || null });
  let breaker;
  // §CT2 — a verdict (its test failed, it was dismissed, it broke a constraint; or it was accepted, it passed) teaches
  // the learned order but never moves a breaker: the provider answered, it was not up to the job
  if (body.verdict) breaker = PR.breaker.state(body.provider);
  else if (body.ok) { PR.breaker.success(body.provider); breaker = PR.breaker.state(body.provider); }
  else breaker = PR.breaker.failure(body.provider, cls, policy);
  return { ok: true, recorded: !(rec && rec.ok === false), breaker };
}

module.exports = { MODULE_ID, VERSION, route, outcome };
