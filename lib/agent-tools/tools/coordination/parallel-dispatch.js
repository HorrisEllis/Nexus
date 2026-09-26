'use strict';
/**
 * lib/agent-tools/tools/parallel-dispatch.js — different jobs to
 * different agents at the same time, thin wrapper (§16.5) over
 * lib/parallel-dispatch.js.
 * comp_id: nexus.lib.agent-tools.tools.parallel-dispatch
 * UUID: nexus-tool-parallel-dispatch-v1-0000-2026-0813-001
 */
const pd = require('../../../parallel-dispatch.js');

async function _dispatchToAgent(agentOrHat, prompt) {
  const path = require('path');
  const ROOT = path.resolve(__dirname, '../../../..');
  const tr = require(path.join(ROOT, 'copilot/tool-runtime.js'));
  const lifeline = require(path.join(ROOT, 'copilot/lifeline.js'));

  let baseAgent = agentOrHat;
  try {
    const hf = require(path.join(ROOT, 'lib/hat-forge.js'));
    const hat = hf.get(agentOrHat);
    if (hat) baseAgent = hat.baseAgent;
  } catch (_) {}

  if (baseAgent === 'ollama') return await lifeline.route(prompt, { provider: 'ollama', requestId: `parallel-${Date.now()}` });
  const dispatchToAgent = (p, opts) => lifeline.dispatchToNcpAgent(p, { ...opts, provider: baseAgent });
  return await tr.runViaAgent(baseAgent, dispatchToAgent, prompt, {});
}

module.exports = {
  name: 'parallel_dispatch',
  description:
    'Real concurrent multi-agent dispatch — DIFFERENT jobs to DIFFERENT agents at the same time, each ' +
    'independently RAID-governed, concurrency-capped (default 3, set maxConcurrent). Needs jobs — array ' +
    'of {agent, prompt} (agent or hat name). Returns every real result, including real failures and real ' +
    'governance denials — never fabricates one "final answer" from independent jobs. Use for genuinely ' +
    'independent work (agent A researches X while agent B drafts Y), not for one question everyone should ' +
    'answer (that\'s agent_council) and not for steps that depend on each other (that\'s run_chain).',
  parameters: {
    type: 'object',
    properties: {
      jobs:          { type: 'array', items: { type: 'object' }, description: '[{agent, prompt, label?}, ...]' },
      maxConcurrent: { type: 'number', description: 'default 3 — real cap on how many run at once' },
    },
    required: ['jobs'],
  },
  async execute(args = {}) {
    if (!Array.isArray(args.jobs) || !args.jobs.length) return { error: 'parallel_dispatch needs jobs — array of {agent, prompt}' };
    try {
      const record = await pd.dispatchAll(args.jobs, { dispatchToAgent: _dispatchToAgent, maxConcurrent: args.maxConcurrent });
      return { ok: true, succeeded: record.succeeded, failed: record.failed, denied: record.denied, results: record.results };
    } catch (e) { return { error: `parallel_dispatch failed: ${e.message}` }; }
  },
};
