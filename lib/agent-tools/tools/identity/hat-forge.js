'use strict';
/**
 * lib/agent-tools/tools/hat-forge.js — the actual "command to make new
 * hats." Thin wrapper over lib/hat-forge.js (§16.5) — all validation,
 * verification-at-creation-time, and persistence logic lives there.
 * comp_id: nexus.lib.agent-tools.tools.hat-forge
 * UUID: nexus-tool-hat-forge-v1-0000-2026-0813-001
 */
const hf = require('../../../hat-forge.js');

const ACTIONS = {
  forge: (a) => {
    if (!a.name || !a.baseAgent) return { error: 'forge needs name and baseAgent' };
    return hf.forge({ name: a.name, baseAgent: a.baseAgent, allowedAgents: a.allowedAgents, toolScope: a.toolScope, personaPrompt: a.personaPrompt, responsibilities: a.responsibilities });
  },
  wear: (a) => {
    if (!a.name) return { error: 'wear needs name — a forged hat, or a raw base agent (ollama/claude/chatgpt/gemini/mistral/perplexity/auto)' };
    const sm = require('../../../../copilot/lib/self-model.js');
    return sm.setCurrentAgent(a.name);
  },
  list: () => ({ ok: true, hats: hf.list() }),
  get: (a) => {
    if (!a.name) return { error: 'get needs name' };
    const hat = hf.get(a.name);
    return hat ? { ok: true, hat } : { ok: false, error: `no forged hat named "${a.name}"` };
  },
  revoke: (a) => {
    if (!a.name) return { error: 'revoke needs name' };
    return hf.revoke(a.name);
  },
  // §BUGFIX 2026-08-19 — rename existed in lib/hat-forge.js but was never
  // wired into this tool wrapper, meaning an agent could forge, wear,
  // list, get, and revoke a hat, but never rename one — the one action
  // that matters most for keeping a permanent role (seedKey) under a
  // human-chosen, changeable name, which is the entire point of the
  // seedKey/name split (lib/hat-forge.js's own real design). Found
  // independently on both sides of a later merge (2026-08-22) — kept the
  // newer, more precise error message.
  rename: (a) => {
    if (!a.name || !a.newName) return { error: 'rename needs name (current name or uuid) and newName' };
    return hf.rename(a.name, a.newName);
  },
};

module.exports = {
  name: 'hat_forge',
  description:
    'Make and manage named, reusable hats — a bundle of base agent + optional scoped tools + optional ' +
    'persona + optional real recurring responsibilities, distinct from the raw per-message agent switch. ' +
    'Actions: "forge" (needs name, baseAgent — one of ollama/claude/chatgpt/gemini/mistral/perplexity/deepseek/copilot; ' +
    '"copilot" resolves through copilot\'s own real ollama/guardian routing, not a literal NCP provider; ' +
    'optional allowedAgents array for rotation/fallback, optional toolScope array of real tool names to ' +
    'narrow which tools are offered AND enforced, optional personaPrompt, optional responsibilities array ' +
    'of {description, everyMs (>=5000), prompt} — each becomes a REAL scheduled task dispatching through ' +
    'this hat\'s agent, findings written to gap-field), "wear" (needs name — a forged hat OR a raw base ' +
    'agent name, persists until changed), "list", "get", "revoke", "rename" (needs name — hat name or uuid ' +
    '— and newName; the permanent role/seedKey is untouched, only the human-facing name changes). A hat ' +
    'scoped to a tool or agent that doesn\'t exist is refused at forge time, not silently accepted.',
  parameters: {
    type: 'object',
    properties: {
      action:           { type: 'string', enum: Object.keys(ACTIONS) },
      name:             { type: 'string', description: 'hat name (or uuid) for forge/wear/get/revoke/rename' },
      newName:          { type: 'string', description: 'for "rename" — the new human-facing name; the hat\'s permanent uuid/seedKey are unaffected' },
      baseAgent:        { type: 'string', description: 'for "forge" — ollama/claude/chatgpt/gemini/mistral/perplexity/deepseek/copilot' },
      allowedAgents:    { type: 'array', items: { type: 'string' }, description: 'for "forge" — the full real agent set this hat may draw from, must include baseAgent' },
      toolScope:        { type: 'array', items: { type: 'string' }, description: 'for "forge" — real tool names this hat is limited to; omit for all 37' },
      personaPrompt:    { type: 'string', description: 'for "forge" — appended to the system prompt when worn' },
      responsibilities: { type: 'array', items: { type: 'object' }, description: 'for "forge" — [{description, everyMs, prompt}] real recurring jobs this hat owns' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action "${args.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(args); }
    catch (e) { return { error: `hat_forge ${args.action} failed: ${e.message}` }; }
  },
};
