'use strict';
/**
 * lib/agent-tools/tools/register-trigger.js — copilot's access to lib/triggers.js
 * comp_id: nexus.lib.agent-tools.register-trigger
 * UUID: nexus-tool-register-trigger-v1-0000-2026-0812-001
 *
 * §WIRED 2026-08-12. Same gap as schedule-task.js's, reactive half: lib/triggers.js
 * ("when X, do Y" — subscribes to lib/ledger-fanin, RAID-governs every fire,
 * cortex-persisted, once-by-default with maxFires bounding repeats) had no
 * agent-tool coverage. Thin wrapper only (§16.5) — no new condition engine here.
 */

function _triggers() { return require('../../../triggers.js'); }

const ACTIONS = {
  register: (a) => {
    if (!a.condition) return { error: 'register needs condition: { type: "event"|"metric", matchType?, source? }' };
    if (!a.target) return { error: 'register needs target: { kind, id, payload }' };
    return _triggers().registerTrigger({
      name: a.name, condition: a.condition, target: a.target,
      once: a.once, maxFires: a.maxFires, intent: a.intent,
    });
  },
  disarm: (a) => {
    if (!a.id) return { error: 'disarm needs id' };
    return _triggers().disarmTrigger(a.id);
  },
  list: (a) => ({ ok: true, triggers: _triggers().list(a.status ? { status: a.status } : undefined) }),
  get: (a) => {
    if (!a.id) return { error: 'get needs id' };
    const t = _triggers().get(a.id);
    return t ? { ok: true, trigger: t } : { ok: false, error: `no trigger ${a.id}` };
  },
};

module.exports = {
  name: 'register_trigger',
  description:
    'Register a "when X, do Y" condition→action binding: fires when an event of a given type lands ' +
    'on the fan-in (condition.type "event", matchType exact or "prefix." ) or when a numeric predicate ' +
    'holds (condition.type "metric"). RAID-governed and cortex-persisted, same as schedule_task. Actions: ' +
    '"register" (needs condition + target), "disarm" (needs id), "list", "get" (needs id). Defaults to ' +
    'firing once — pass once:false with maxFires for a bounded repeating trigger.',
  parameters: {
    type: 'object',
    properties: {
      action:    { type: 'string', enum: Object.keys(ACTIONS) },
      id:        { type: 'string', description: 'trigger id — required for disarm/get' },
      name:      { type: 'string' },
      condition: { type: 'object', description: '{ type: "event"|"metric", matchType?, source? } — the fan-in filter' },
      target:    { type: 'object', description: '{ kind: "agent"|"system"|"command", id, payload }' },
      once:      { type: 'boolean', description: 'default true — fire once then disarm' },
      maxFires:  { type: 'number', description: 'cap on repeats when once=false (default Infinity)' },
      intent:    { type: 'string', description: 'RAID intent label' },
      status:    { type: 'string', description: 'filter for "list"' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action "${args.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(args); }
    catch (e) { return { error: `register_trigger ${args.action} failed: ${e.message}` }; }
  },
};
