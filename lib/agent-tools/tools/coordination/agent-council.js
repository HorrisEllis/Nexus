'use strict';
/**
 * lib/agent-tools/tools/agent-council.js — convene multiple real agents
 * on one decision. Thin wrapper (§16.5) over lib/agent-council.js, wired
 * to copilot/tool-runtime.js's real runViaAgent for actual dispatch.
 * comp_id: nexus.lib.agent-tools.tools.agent-council
 * UUID: nexus-tool-agent-council-v1-0000-2026-0813-001
 */
const councilMod = require('../../../agent-council.js');

async function _dispatchToAgent(member, question) {
  const path = require('path');
  const ROOT = path.resolve(__dirname, '../../../..');
  const tr = require(path.join(ROOT, 'copilot/tool-runtime.js'));
  const lifeline = require(path.join(ROOT, 'copilot/lifeline.js'));

  // member may be a forged hat name — resolve to its real baseAgent if so
  let baseAgent = member;
  try {
    const hf = require(path.join(ROOT, 'lib/hat-forge.js'));
    const hat = hf.get(member);
    if (hat) baseAgent = hat.baseAgent;
  } catch (_) {}

  if (baseAgent === 'ollama') {
    // ollama path goes through lifeline.route directly — simpler than duplicating its job/poll plumbing here
    return await lifeline.route(question, { provider: 'ollama', requestId: `council-${Date.now()}` });
  }
  const dispatchToAgent = (prompt, opts) => lifeline.dispatchToNcpAgent(prompt, { ...opts, provider: baseAgent });
  return await tr.runViaAgent(baseAgent, dispatchToAgent, question, {});
}

const ACTIONS = {
  convene: async (a) => {
    if (!a.question) return { error: 'convene needs question' };
    if (!Array.isArray(a.members) || !a.members.length) return { error: 'convene needs members — array of agent or hat names' };
    const record = await councilMod.convene(a.question, a.members, { dispatchToAgent: _dispatchToAgent });
    return { ok: true, ...councilMod.summarize(record), sessionId: record.id };
  },
};

module.exports = {
  name: 'agent_council',
  description:
    'Convene multiple real agents on the same decision, independently — no member sees another\'s answer ' +
    'before giving their own. Needs question and members (agent names like claude/perplexity/gemini, or ' +
    'forged hat names — resolved to their base agent). Returns every real verdict, including real failures ' +
    '(an agent that could not answer is recorded, not silently dropped). This tool only COLLECTS verdicts — ' +
    'it does not decide anything. Weighing the verdicts into an actual decision still goes through the same ' +
    'RAID/constitutional governance every other consequential action here does.',
  parameters: {
    type: 'object',
    properties: {
      action:   { type: 'string', enum: Object.keys(ACTIONS) },
      question: { type: 'string', description: 'the exact question every member is asked, identically' },
      members:  { type: 'array', items: { type: 'string' }, description: 'agent names or forged hat names' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action "${args.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(args); }
    catch (e) { return { error: `agent_council ${args.action} failed: ${e.message}` }; }
  },
};
