'use strict';
/**
 * lib/agent-tools/tools/agent-capability.js — real, measured per-agent
 * capability data, not assumed constraints. Thin wrapper (§16.5) over
 * lib/agent-capability-profile.js.
 * comp_id: nexus.lib.agent-tools.tools.agent-capability
 * UUID: nexus-tool-agent-capability-v1-0000-2026-0813-001
 */
const acp = require('../../../agent-capability-profile.js');

const ACTIONS = {
  profile: (a) => {
    if (!a.agent) return { error: 'profile needs agent — ollama/claude/chatgpt/gemini/mistral/perplexity' };
    return { ok: true, ...acp.profile(a.agent) };
  },
  profileAll: () => ({ ok: true, profiles: acp.profileAll() }),
};

module.exports = {
  name: 'agent_capability',
  description:
    'Real, measured capability data for an agent — not assumed constraints. Three sources, each clearly ' +
    'labeled: live (chat_log — real success rate, duration, response-size stats for exchanges that ' +
    'actually happened), historical (guardian_chat_log — real token counts, but this table has no current ' +
    'writer, frozen data), raid (cortex\'s own live health tracking, coarse — only ollama/claude/chatgpt ' +
    'currently wired). A field is null/absent rather than guessed when no real data exists. Use this ' +
    'before assuming what an agent can handle — check what actually happened, not what was hardcoded.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: Object.keys(ACTIONS) },
      agent:  { type: 'string', description: 'for "profile" — ollama/claude/chatgpt/gemini/mistral/perplexity' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action "${args.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(args); }
    catch (e) { return { error: `agent_capability ${args.action} failed: ${e.message}` }; }
  },
};
