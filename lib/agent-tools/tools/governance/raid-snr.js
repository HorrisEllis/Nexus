'use strict';
/**
 * lib/agent-tools/tools/raid-snr.js — copilot's access to RAID's decisions,
 * tunables, and the SNR pre-gate.
 * comp_id: nexus.lib.agent-tools.raid-snr
 * UUID: nexus-tool-raid-snr-v1-0000-2026-0812-001
 *
 * §WIRED 2026-08-12 (P4 of docs/copilot-full-capability-phasemap.spec).
 * cortex/core/raid/index.js decides which agent handles a request; that
 * decision was consulted internally but never answerable to a "why did you
 * route that" question. This tool is READ-ONLY on purpose (§10.3, restated
 * from P4's own phasemap entry) — no action calls _decide/_approveTool/
 * recordOutcome. 'decisions'/'tunables' read the real persisted cortex tables
 * (raid_decisions, raid_tunables) directly, in-process — same pattern as this
 * session's own live verification of scheduler/triggers. 'snr' is the one
 * action with a real side effect and says so plainly: snr-filter.js's own
 * filter() writes an event_log row and increments its in-process stats on
 * every call, because that's what RAID's real pre-gate does on every real
 * dispatch — calling it here is running the real gate, not a dry sim.
 */

function _jaa() { return require('../../../../cortex/memory/jaa-db').jaaDB; }

const ACTIONS = {
  decisions: (a) => {
    const rows = _jaa().query('raid_decisions', () => true);
    const sorted = rows.slice().sort((x, y) => (y.eventTs || 0) - (x.eventTs || 0));
    return { ok: true, total: rows.length, decisions: sorted.slice(0, a.limit || 10) };
  },
  tunables: () => {
    const t = require('../../../../cortex/core/raid/tunables.js');
    return { ok: true, tunables: t.load() };
  },
  snr: (a) => {
    if (!a.intent) return { error: 'snr needs intent — what the call is about' };
    const snr = require('../../../../cortex/core/raid/snr-filter.js');
    return { ok: true, result: snr.filter({ intent: a.intent, cluster: a.cluster, faultClass: a.faultClass, causedBy: a.causedBy, sessionId: a.sessionId, jobId: a.jobId }) };
  },
  snr_stats: () => {
    const snr = require('../../../../cortex/core/raid/snr-filter.js');
    return { ok: true, stats: snr.stats() };
  },
};

module.exports = {
  name: 'raid_snr',
  description:
    'Introspect RAID\'s real routing decisions and tunables, and run the SNR pre-gate on demand. ' +
    'Read-only for "decisions" (most recent real routing outcomes, newest first) and "tunables" ' +
    '(current threshold values). "snr" and "snr_stats" call the REAL SNR filter — "snr" writes an ' +
    'event_log row and counts toward "snr_stats", same as a real dispatch would, because it runs the ' +
    'actual pre-gate, not a simulation. Never calls RAID\'s own routing/approval functions — this is ' +
    'introspection, not a second way to route a request.',
  parameters: {
    type: 'object',
    properties: {
      action:     { type: 'string', enum: Object.keys(ACTIONS) },
      limit:      { type: 'number', description: 'for "decisions" — how many recent rows (default 10)' },
      intent:     { type: 'string', description: 'for "snr" — the intent/prompt text being classified' },
      cluster:    { type: 'string', description: 'for "snr" — optional cluster hint' },
      faultClass: { type: 'string', description: 'for "snr" — optional fault class for the open-loop tier' },
      causedBy:   { type: 'string', description: 'for "snr" — causal chain id' },
      sessionId:  { type: 'string' },
      jobId:      { type: 'string' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action "${args.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(args); }
    catch (e) { return { error: `raid_snr ${args.action} failed: ${e.message}` }; }
  },
};
