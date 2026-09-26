'use strict';
/**
 * lib/agent-tools/tools/copilot-identity.js — copilot's own settable name.
 * comp_id: nexus.lib.agent-tools.tools.copilot-identity
 * UUID: nexus-tool-copilot-identity-v1-0000-2026-0812-001
 *
 * §WIRED 2026-08-12 (P6 of docs/copilot-full-capability-phasemap.spec).
 * copilot/lib/self-model.js's getIdentityName/setIdentityName — new this
 * session, same commit — kept deliberately separate from whoAmI() (which
 * answers "what does NEXUS know about the USER," a different axis). Thin
 * wrapper only; all persistence/default-handling logic lives in self-model.js.
 */

const sm = require('../../../../copilot/lib/self-model.js');

const ACTIONS = {
  get: () => ({ ok: true, ...sm.getIdentityName() }),
  set: (a) => {
    if (typeof a.name !== 'string') return { error: 'set needs name (string) — pass an empty string to clear back to default' };
    return sm.setIdentityName(a.name);
  },
  // §ADDED 2026-08-13 — "co-pilot should be like a hat, not a static
  // identity." getAgent/setAgent: WHICH provider copilot dispatches to by
  // default, persisted, swappable on demand — distinct from name (WHAT
  // it's called). setAgent is RAID-governed the same way switchAgent is.
  getAgent: () => ({ ok: true, ...sm.getCurrentAgent() }),
  setAgent: (a) => {
    if (typeof a.agent !== 'string') return { error: 'setAgent needs agent (string) — one of ollama/claude/chatgpt/gemini/mistral/perplexity/auto' };
    return sm.setCurrentAgent(a.agent);
  },
};

module.exports = {
  name: 'copilot_identity',
  description:
    'Get or set co-pilot\'s own display name, or which provider it dispatches to by default ("the hat" — ' +
    'ollama/claude/chatgpt/gemini/mistral/perplexity, or "auto" for the normal ollama-first cascade with ' +
    'confidence-based escalation). "get"/"set" are the name. "getAgent"/"setAgent" are the hat — persisted, ' +
    'applies to every future message until changed again, RAID-governed the same as switching agent for a ' +
    'single request. Setting an empty name or "auto" agent clears back to default. Both persist to cortex, ' +
    'survive a restart.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: Object.keys(ACTIONS) },
      name:   { type: 'string', description: 'for "set" — the new name, or "" to clear' },
      agent:  { type: 'string', description: 'for "setAgent" — ollama/claude/chatgpt/gemini/mistral/perplexity/auto' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action "${args.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(args); }
    catch (e) { return { error: `copilot_identity ${args.action} failed: ${e.message}` }; }
  },
};
