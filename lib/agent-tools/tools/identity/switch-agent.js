'use strict';
/**
 * lib/agent-tools/tools/identity/switch-agent.js — switch_agent tool
 * UUID: nexus-tool-switch-agent-v1-0000-2026-0814-jamesbrooks-001
 *
 * §WIRED 2026-08-14 — James: "I want the switch agent to work." Checked
 * first: it already does — copilot/lib/self-model.js's setCurrentAgent/
 * getCurrentAgent are real, JAA-backed, governance-checked (governAction
 * refuses if disallowed), and hat_forge's "wear" action already calls
 * setCurrentAgent under the hood. Nothing was broken. The real gap: hat_
 * forge's own tool description leads with hats (name, baseAgent, toolScope,
 * personaPrompt, responsibilities) — "just switch to gemini" is buried
 * inside a tool shaped around something bigger. This is that same real
 * function, alone, named what it does.
 */
const sm = require('../../../../copilot/lib/self-model.js');

const ACTIONS = {
  switch: (a) => {
    if (!a.agent) return { error: 'switch needs agent — ollama/claude/chatgpt/gemini/mistral/perplexity/auto, or a forged hat name' };
    return sm.setCurrentAgent(a.agent);
  },
  current: () => ({ ok: true, ...sm.getCurrentAgent() }),
};

module.exports = {
  name: 'switch_agent',
  description:
    'Switch which agent handles the conversation, or check which one is active. Actions: "switch" ' +
    '(needs agent — ollama/claude/chatgpt/gemini/mistral/perplexity/auto, or the name of a forged hat), ' +
    '"current" (no args — reports the active agent and, if it was set via a hat, that hat\'s name).',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: Object.keys(ACTIONS) },
      agent:  { type: 'string', description: 'for "switch"' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action "${args.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(args); }
    catch (e) { return { error: `switch_agent ${args.action} failed: ${e.message}` }; }
  },
};
