'use strict';
/**
 * lib/agent-tools/tools/governance/axiom-manage.js — axiom_manage tool
 * UUID: nexus-tool-axiom-manage-v1-0000-2026-0814-jamesbrooks-001
 *
 * §WIRED 2026-08-14 — James: "axioms." axiom_check (faculty-tools.js,
 * earlier) only ever wrapped copilot/axiom-manager's check() — read-only.
 * That module has always had real add/remove/freeze/list too (checked:
 * copilot/axiom-manager.js's own exports), just never tool-wrapped.
 * add() already takes a real `source` field ('user' default) — this tool
 * passes source:'agent' explicitly so an axiom copilot adds is always
 * distinguishable from one James added, same discipline propose_idea
 * already enforces for ideas (origin tracking, never silently blended).
 */
const ax = require('../../../../copilot/axiom-manager.js');

const ACTIONS = {
  list: (a) => ({ ok: true, axioms: ax.list({ tier: a.tier, status: a.status }) }),

  add: (a) => {
    if (!a.id || !a.text) return { error: 'add needs id and text' };
    if (!a.reason) return { error: 'add needs reason — an axiom with no stated reason is a wish, same standard propose_idea holds proposals to' };
    return ax.add(a.id, a.text, { reason: a.reason, source: 'agent', tier: a.tier || 'RUNTIME' });
  },

  remove: (a) => {
    if (!a.id) return { error: 'remove needs id' };
    return ax.remove(a.id, { confirm: !!a.confirm });
  },

  freeze: (a) => {
    if (!a.id) return { error: 'freeze needs id — makes it immutable, cannot be undone by this tool' };
    return ax.freeze(a.id);
  },

  summary: () => ax.summary(),
};

module.exports = {
  name: 'axiom_manage',
  description:
    'Add, remove, freeze, list, or summarize NEXUS axioms — the mutation half of axiom access (use ' +
    'axiom_check to test something against them first). Actions: "list" (optional tier/status filter), ' +
    '"add" (needs id, text, reason — every agent-added axiom is tagged source:"agent", never blended with ' +
    'ones James added), "remove" (needs id, confirm:true), "freeze" (needs id — makes it immutable, ' +
    'irreversible by this tool), "summary".',
  parameters: {
    type: 'object',
    properties: {
      action:  { type: 'string', enum: Object.keys(ACTIONS) },
      id:      { type: 'string', description: 'for "add"/"remove"/"freeze"' },
      text:    { type: 'string', description: 'for "add" — the axiom itself' },
      reason:  { type: 'string', description: 'for "add" — required, why this axiom is needed' },
      tier:    { type: 'string', description: 'for "add"/"list" — defaults to RUNTIME on add' },
      status:  { type: 'string', description: 'for "list" — filter by status' },
      confirm: { type: 'boolean', description: 'for "remove" — required true, no accidental removal' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action "${args.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(args); }
    catch (e) { return { error: `axiom_manage ${args.action} failed: ${e.message}` }; }
  },
};
