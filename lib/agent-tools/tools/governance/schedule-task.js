'use strict';
/**
 * lib/agent-tools/tools/schedule-task.js — copilot's access to lib/scheduler.js
 * comp_id: nexus.lib.agent-tools.schedule-task
 * UUID: nexus-tool-schedule-task-v1-0000-2026-0812-001
 *
 * §WIRED 2026-08-12 (James: "co-pilot can schedule tasks, jobs, alarms... fully
 * programmable"). lib/scheduler.js existed complete — schedule/cancel/list/get,
 * RAID-governed on every fire (governAction denies, doesn't silently skip),
 * cortex-persisted so schedules survive a reboot — with zero agent-tool
 * coverage. §1.1: a capability the agent cannot call is not the agent's
 * capability. This is a thin wrapper, not a reimplementation (§16.5) — every
 * action below calls the real scheduler module in-process; no new scheduling
 * logic, no new persistence, no new gate. The governance, persistence, and
 * bounded-runs safety (§user_wellbeing — no unbounded loops) all live in
 * scheduler.js already and are inherited as-is.
 */

function _scheduler() { return require('../../../scheduler.js'); }

const ACTIONS = {
  schedule: (a) => {
    if (!a.target) return { error: 'schedule needs target: { kind, id, payload }' };
    if (!a.at && !a.inMs && !a.everyMs) return { error: 'schedule needs one of: at (epoch ms), inMs (delay), everyMs (interval)' };
    return _scheduler().schedule({
      name: a.name, at: a.at, inMs: a.inMs, everyMs: a.everyMs,
      maxRuns: a.maxRuns, target: a.target, intent: a.intent,
    });
  },
  cancel: (a) => {
    if (!a.id) return { error: 'cancel needs id' };
    return _scheduler().cancel(a.id);
  },
  list: (a) => ({ ok: true, tasks: _scheduler().list(a.status ? { status: a.status } : undefined) }),
  get: (a) => {
    if (!a.id) return { error: 'get needs id' };
    const t = _scheduler().get(a.id);
    return t ? { ok: true, task: t } : { ok: false, error: `no scheduled task ${a.id}` };
  },
};

module.exports = {
  name: 'schedule_task',
  description:
    'Schedule a task to fire once at a time or on a repeating interval, delivering a payload to an ' +
    'agent, system, or command. Every fire is RAID-governed (a denied action logs, it does not run) ' +
    'and persisted to cortex so it survives a restart. Actions: "schedule" (needs target + one of ' +
    'at/inMs/everyMs), "cancel" (needs id), "list" (optionally filter by status), "get" (needs id).',
  parameters: {
    type: 'object',
    properties: {
      action:  { type: 'string', enum: Object.keys(ACTIONS) },
      id:      { type: 'string', description: 'task id — required for cancel/get' },
      name:    { type: 'string', description: 'human-readable task name' },
      at:      { type: 'number', description: 'fire once at this epoch ms' },
      inMs:    { type: 'number', description: 'fire once after this delay in ms' },
      everyMs: { type: 'number', description: 'fire repeatedly on this interval in ms' },
      maxRuns: { type: 'number', description: 'cap on repeat fires (default: 1 for one-shot, Infinity for interval)' },
      target:  { type: 'object', description: '{ kind: "agent"|"system"|"command", id, payload } — what fires' },
      intent:  { type: 'string', description: 'RAID intent label; defaults to scheduled.<kind>' },
      status:  { type: 'string', description: 'filter for "list": scheduled | cancelled | denied | ...' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action "${args.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(args); }
    catch (e) { return { error: `schedule_task ${args.action} failed: ${e.message}` }; }
  },
};
