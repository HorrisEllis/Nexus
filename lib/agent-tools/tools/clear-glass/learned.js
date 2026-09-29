'use strict';
/**
 * lib/agent-tools/tools/clear-glass/learned.js — clearglass.learned.tool: what copilot has learned, and using it.
 * comp_id: nexus.agent-tools.clearglass.learned
 * Version: 1.0.0
 *
 * James, 2026-09-27: "also have him learn." lib/cg-learning.js keeps what happened on each site (selectors that
 * worked and failed, heals, flows that worked); lib/opportunity keeps what applications led to. This is copilot's
 * handle on both: look at it, replay a flow, turn a flow into a macro, forget what should not be kept.
 */

const { toolName } = require('../../naming.js');
const Lg = () => require('../../../cg-learning.js');

async function replay(a) {
  const f = Lg().getFlow(a.flowId);
  if (!f) return { ok: false, error: `no learned flow ${a.flowId}` };
  const values = a.values || {};
  const steps = f.steps.map(s => {
    const x = { ...s };
    for (const k of ['value', 'text']) if (typeof x[k] === 'string' && /\{\{\s*password\s*\}\}/.test(x[k])) {
      if (!values.password) return { _missing: 'password' };
      x[k] = values.password;
    }
    return x;
  });
  if (steps.some(s => s._missing)) return { ok: false, error: 'this flow types a password — pass values.password (it is never stored)' };
  return require('./browser.js').sequence(a.agentId || 'default', steps, { stopOnError: true });
}

async function promote(a) {
  const f = Lg().getFlow(a.flowId);
  if (!f) return { ok: false, error: `no learned flow ${a.flowId}` };
  const m = Lg().toMacroSteps(f);
  if (!m.ok) return m;
  const name = a.name || `learned-${f.host.replace(/[^a-z0-9]+/gi, '-')}-${f.id.slice(0, 6)}`;
  const r = await require('./macro.js').execute({ action: 'create', name, urlPattern: a.urlPattern || `*://${f.host}/*`, steps: m.steps,
    description: `learned by copilot: ${f.name} (worked ${f.successes}×)` });
  if (r && !r.error && r.ok !== false) { try { require('../../../../cortex/memory/jaa-db.js').jaaDB.update(Lg().T.flows, { id: f.id }, { promotedTo: name }); } catch (_) {} }
  return r && r.error ? { ok: false, error: r.error } : { ok: true, macro: name, steps: m.steps.length };
}

const ACTIONS = {
  summary:  () => ({ ok: true, ...Lg().summary(), outcomes: (() => { try { return require('../../../opportunity').learnedWeights(); } catch (e) { return { error: e.message }; } })() }),
  hints:    (a) => { const host = a.host || Lg().hostOf(a.url); return host ? { ok: true, hints: Lg().hintsFor(host) || { host, observations: 0 } } : { ok: false, error: 'host or url required' }; },
  flows:    (a) => ({ ok: true, flows: Lg().flows(a.host || null).map(f => ({ id: f.id, host: f.host, name: f.name, steps: f.steps.length, successes: f.successes, promotedTo: f.promotedTo || null })) }),
  flow:     (a) => { const f = Lg().getFlow(a.flowId); return f ? { ok: true, flow: f } : { ok: false, error: `no learned flow ${a.flowId}` }; },
  replay,
  promote,
  forget:   (a) => Lg().forget({ host: a.host || null, flowId: a.flowId || null }),
};

module.exports = {
  name: toolName('clearglass', 'learned'),
  description:
    'What you have learned driving Clear Glass, and using it. summary (sites, actions, failures, heals, flows; plus what job ' +
    'applications led to) · hints{host|url} (selectors that worked by label, ones that keep failing, healed ones) · flows{host?} · ' +
    'flow{flowId} · replay{flowId, agentId, values?:{password}} (runs a flow that worked before, healing as it goes) · ' +
    'promote{flowId, name?, urlPattern?} (turns a flow into a Clear Glass macro) · forget{host|flowId}.',
  parameters: {
    type: 'object',
    properties: {
      action:     { type: 'string', enum: Object.keys(ACTIONS) },
      host:       { type: 'string' }, url: { type: 'string' },
      flowId:     { type: 'string' }, agentId: { type: 'string' },
      values:     { type: 'object', description: 'replay — values for {{…}} placeholders, e.g. {password}; never stored' },
      name:       { type: 'string' }, urlPattern: { type: 'string' },
    },
    required: ['action'],
  },
  async execute(a = {}) {
    const fn = ACTIONS[a.action];
    if (!fn) return { ok: false, error: `unknown action "${a.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(a); } catch (e) { return { ok: false, error: e.message }; }
  },
};
