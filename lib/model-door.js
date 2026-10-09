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

function route(body = {}, { defaultProvider = null, resolve, tabs = null } = {}) {
  const preferAgent = body.preferAgent || (defaultProvider && !['auto', 'copilot'].includes(defaultProvider) ? defaultProvider : null);
  const policy = body.policy && typeof body.policy === 'object' ? body.policy : PR.DEFAULTS;
  const block = body.block && typeof body.block === 'object' ? body.block : null;   // a spec block's own agent and fallback chain
  const pl = PR.plan({ preferAgent, block, jobType: String(body.kind || 'chat'), policy, records: body.records || null });
  const hops = pl.route.map(h => {
    const base = PR.baseOf(h.provider), r = resolve(base) || {};
    return { provider: h.provider, backend: r.backend || null, agent: r.agent || null, model: PR.modelOf(h.provider), why: h.why };
  });
  // §HP18 0.55.2 — a browser agent with no tab connected goes behind the ones that have one (said on the hop, never dropped)
  const t = PR.byTabs(hops, tabs, (h) => (h.backend === 'guardian' ? h.agent : null));
  const moved = new Map(t.moved.map(m => [m.provider, m.why]));
  const route = t.order.map(h => (moved.has(h.provider) ? { ...h, why: `${h.why ? `${h.why} · ` : ''}${moved.get(h.provider)}` } : h));
  return { ok: true, kind: pl.jobType, mode: pl.mode, route, skipped: pl.skipped, moved: t.moved, by: 'copilot' };
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
