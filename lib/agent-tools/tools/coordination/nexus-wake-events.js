'use strict';
/**
 * lib/agent-tools/tools/coordination/nexus-wake-events.js — real, agent-
 * callable access to "hey nexus" moments captured anywhere in the system.
 * comp_id: nexus.lib.agent-tools.tools.nexus-wake-events
 */
const we = require('../../../nexus-wake-events.js');

const ACTIONS = {
  pending: (a) => ({ ok: true, events: we.pending(a.limit) }),
  consume: (a) => {
    if (!a.id) return { error: 'consume needs id' };
    return we.consume(a.id, a.answer);
  },
};

module.exports = {
  name: 'nexus_wake_events',
  description:
    'Real, persistent record of "hey nexus, ..." moments said in any connected agent tab — captured server-side ' +
    'the instant they happen, whether or not anything was live-listening at that second. "pending" (optional limit, ' +
    'default 20) lists every real, not-yet-consumed event, oldest first, each with the real request text and the ' +
    'agent/chatUrl/account it came from. "consume" (needs id; optional answer — the real response given) marks one ' +
    'handled. Use this to actually answer someone who said "hey nexus" in a browser tab, instead of relying on a ' +
    'human happening to be watching a terminal at that exact moment.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: Object.keys(ACTIONS) },
      limit:  { type: 'number', description: 'for "pending" — max events to return' },
      id:     { type: 'string', description: 'for "consume" — the real wake event id' },
      answer: { type: 'string', description: 'for "consume" — the real answer given' },
    },
    required: ['action'],
  },
  execute: async (a) => {
    const fn = ACTIONS[a.action];
    if (!fn) return { error: `unknown action "${a.action}" — try: ${Object.keys(ACTIONS).join(', ')}` };
    return fn(a);
  },
};
