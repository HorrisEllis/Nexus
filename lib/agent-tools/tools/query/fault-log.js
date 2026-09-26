'use strict';
/**
 * lib/agent-tools/tools/fault-log.js — real fault/failure precedent, not
 * a fabricated risk score. Thin wrapper (§16.5) over lib/fault-log.js.
 * comp_id: nexus.lib.agent-tools.tools.fault-log
 * UUID: nexus-tool-fault-log-v1-0000-2026-0813-001
 */
const fl = require('../../../fault-log.js');

const ACTIONS = {
  check: (a) => {
    if (!a.component) return { error: 'check needs component' };
    return { ok: true, ...fl.checkFaultHistory(a.component, { intent: a.intent, limit: a.limit }) };
  },
  log: (a) => {
    if (!a.component) return { error: 'log needs component' };
    return { ok: true, fault: fl.logFault({ system: a.system, agent: a.agent, component: a.component, faultClass: a.faultClass, status: a.status, intent: a.intent, causedBy: a.causedBy, meta: a.meta }) };
  },
};

module.exports = {
  name: 'fault_log',
  description:
    'Real fault/failure precedent for a component — not a fabricated risk score. Every tool call that ' +
    'errors already logs here automatically (no action needed for that). "check" (needs component, ' +
    'optional intent) returns real past faults for it, most recent first, with the real CFR conditions ' +
    'at the time — use this before a consequential action to see if this exact thing has failed before. ' +
    '"log" manually records a fault outside the automatic tool-call path (e.g. from your own reasoning ' +
    'about something that went wrong).',
  parameters: {
    type: 'object',
    properties: {
      action:     { type: 'string', enum: Object.keys(ACTIONS) },
      component:  { type: 'string', description: 'the real thing that failed — a tool name, a system, a file' },
      intent:     { type: 'string', description: 'optional — narrow to a specific intent' },
      limit:      { type: 'number', description: 'for "check" — how many recent faults to return, default 5' },
      system:     { type: 'string', description: 'for "log" — which system' },
      agent:      { type: 'string', description: 'for "log" — which agent' },
      faultClass: { type: 'string', description: 'for "log" — one of fault-taxonomy\'s known classes if it fits' },
      status:     { type: 'string', description: 'for "log" — default "failed"' },
      causedBy:   { type: 'string', description: 'for "log" — a real pointer (jobId/branchId/taskId/requestId)' },
      meta:       { type: 'object', description: 'for "log" — anything else real and relevant' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action "${args.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(args); }
    catch (e) { return { error: `fault_log ${args.action} failed: ${e.message}` }; }
  },
};
