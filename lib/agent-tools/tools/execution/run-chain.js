'use strict';
/**
 * lib/agent-tools/tools/run-chain.js — copilot's access to lib/chains.js.
 * comp_id: nexus.lib.agent-tools.tools.run-chain
 * UUID: nexus-tool-run-chain-v1-0000-2026-0812-001
 *
 * §WIRED 2026-08-12 — closes P6_copilot_programmable's second gap (docs/
 * nexus-live-mind-phasemap.spec: "a workflow executes"). lib/chains.js's
 * runChain() is real, complete, RAID-gated per step internally (§RAID —
 * every action, not just the chain as a whole; a denied step halts the
 * chain rather than skipping it) — confirmed zero requires from copilot/
 * or lib/agent-tools/ anywhere before this. Thin wrapper only (§16.5) — no
 * new chain logic, governance already lives inside runChain itself.
 */
const { runChain } = require('../../../chains.js');

module.exports = {
  name: 'run_chain',
  description:
    'Run a real ordered workflow — a sequence of steps (agent/command/system/http), each RAID-gated ' +
    'individually. Each step\'s output becomes the next step\'s input (carry) unless overridden. A ' +
    'denied or failing step HALTS the chain at that point rather than skipping ahead — a later step may ' +
    'depend on an earlier one\'s real output, so results past a halt are never produced. Needs steps: ' +
    'array of { kind: "agent"|"command"|"system"|"http", ...kind-specific fields }, optional name and ' +
    'input (initial carry value).',
  parameters: {
    type: 'object',
    properties: {
      name:  { type: 'string', description: 'chain name, for logging' },
      input: { description: 'initial carry value passed into step 1' },
      steps: {
        type: 'array',
        description: 'ordered steps — each { kind: "agent"|"command"|"system"|"http", ... }',
        items: { type: 'object' },
      },
    },
    required: ['steps'],
  },
  async execute(args = {}) {
    if (!Array.isArray(args.steps) || !args.steps.length) return { error: 'run_chain needs a non-empty steps array' };
    try { return await runChain({ name: args.name, input: args.input, steps: args.steps }); }
    catch (e) { return { error: `run_chain failed: ${e.message}` }; }
  },
};
