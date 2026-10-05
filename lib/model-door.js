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
 *   outcome({ provider, kind, ok, class, ms, error, policy }) → { ok, recorded, breaker }
 * resolve(provider) → { backend, agent } — copilot's resolveDefaultBackend.
 */
const PR = require('./pipeline-routing.js');

const MODULE_ID = 'nexus.lib.model-door';
const VERSION = '1.0.0';

function route(body = {}, { defaultProvider = null, resolve } = {}) {
  const preferAgent = body.preferAgent || (defaultProvider && !['auto', 'copilot'].includes(defaultProvider) ? defaultProvider : null);
  const policy = body.policy && typeof body.policy === 'object' ? body.policy : PR.DEFAULTS;
  const block = body.block && typeof body.block === 'object' ? body.block : null;   // a spec block's own agent and fallback chain
  const pl = PR.plan({ preferAgent, block, jobType: String(body.kind || 'chat'), policy, records: body.records || null });
  const hops = pl.route.map(h => {
    const base = PR.baseOf(h.provider), r = resolve(base) || {};
    return { provider: h.provider, backend: r.backend || null, agent: r.agent || null, model: PR.modelOf(h.provider), why: h.why };
  });
  return { ok: true, kind: pl.jobType, mode: pl.mode, route: hops, skipped: pl.skipped, by: 'copilot' };
}

function outcome(body = {}) {
  if (!body.provider) return { ok: false, error: 'provider is required' };
  const policy = body.policy && typeof body.policy === 'object' ? body.policy : PR.DEFAULTS;
  const cls = body.ok ? null : (body.class || 'unknown');
  const rec = PR.recordHop({ provider: body.provider, jobType: String(body.kind || 'chat'), outcome: body.ok ? 'ok' : 'failed', class: cls, ms: body.ms || null, error: body.error || null });
  let breaker;
  if (body.ok) { PR.breaker.success(body.provider); breaker = PR.breaker.state(body.provider); }
  else breaker = PR.breaker.failure(body.provider, cls, policy);
  return { ok: true, recorded: !(rec && rec.ok === false), breaker };
}

module.exports = { MODULE_ID, VERSION, route, outcome };
