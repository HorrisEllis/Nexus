'use strict';
/**
 * lib/agent-tools/tools/forge-tool.js — the command that lets copilot make tools.
 * comp_id: nexus.lib.agent-tools.forge-tool
 * UUID: nexus-tool-forge-cmd-v1-0000-2026-0809-001
 *
 * "Giving the system a system for its own capabilities." (James, 2026-08-09)
 *
 * A forged tool is DATA, not code — a name, a JSON-schema, and steps that bind
 * to things already verified to exist. Nothing new executes. This cannot give
 * the agent a capability it did not already have; it lets the agent PACKAGE what
 * it has into one named, repeatable call.
 *
 * Every step is proven at forge time (§1.1). A tool that fails on first use is
 * worse than one that was never made, because a plan has already been built
 * around it.
 */
const path = require('path');
const F = require(path.join(__dirname, '../../../tool-forge.js'));

const ACTIONS = {
  schema: () => ({ ok: true, schema: F.TOOL_SCHEMA, callKinds: F.CALL_KINDS,
    example: {
      name: 'guardian_pulse',
      description: 'Guardian health and its open gaps in one call, for a quick status read',
      parameters: { type: 'object', properties: {}, required: [] },
      steps: [{ call: 'capability:guardian.health' }, { call: 'tool:query_movement', args: { action: 'snapshot', system: 'guardian' } }],
    },
    references: { '{$.param}': "a caller argument", '{$steps.0.field}': "a field from step 0's result" } }),

  validate: (a) => F.validate(a.definition),
  forge:    (a) => F.forge(a.definition, { forgedBy: a.forgedBy || 'copilot', intent: a.intent }),
  list:     () => ({ ok: true, forged: F.list().map(r => ({ name: r.name, description: r.description, steps: r.steps.length, forgedBy: r.forgedBy, ts: r.ts })) }),
  revoke:   (a) => (a.name ? F.revoke(a.name) : { error: 'name required' }),
  reload:   () => ({ ok: true, ...F.loadAll() }),
};

module.exports = {
  name: 'forge_tool',
  description:
    'Create your own tools. A forged tool is a NAME + JSON-schema + STEPS that bind to things that ' +
    'already exist: "capability:<id>" (any of the 239 verified-served capabilities), "lens:<name>", ' +
    'or "tool:<name>". It is data, not code — nothing new executes, so a forged tool can only package ' +
    'what you could already do into one repeatable call. Actions: "schema" (read the contract and an ' +
    'example — start here), "validate" (check a definition without creating it), "forge" (create and ' +
    'register), "list", "revoke", "reload". Every step is verified BEFORE the tool exists; a step ' +
    'naming an unserved capability or an unknown lens is refused with the step number.',
  parameters: {
    type: 'object',
    properties: {
      action:     { type: 'string', enum: Object.keys(ACTIONS) },
      definition: { type: 'object', description: '{ name, description, parameters, steps } — see action "schema"' },
      name:       { type: 'string', description: 'for revoke' },
      intent:     { type: 'string', description: 'why you are forging this — recorded with the tool' },
      forgedBy:   { type: 'string' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action "${args.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(args); }
    catch (e) { return { error: `forge_tool ${args.action} failed: ${e.message}` }; }
  },
};
