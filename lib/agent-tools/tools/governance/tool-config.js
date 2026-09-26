'use strict';
/**
 * lib/agent-tools/tools/governance/tool-config.js — tool_config tool
 * comp_id: nexus.lib.agent-tools.tool-config
 * UUID: nexus-tool-config-cmd-v1-0000-2026-0819-001
 * Version: 1.0.0
 * spec: docs/copilot-tool-system.spec § P1
 *
 * James, 2026-08-19: "i want to use co-pilot to change the options in the
 * configs." This is that — the conversational surface over lib/tool-config.js.
 *
 * §THE `by` PARAMETER DOES NOT EXIST HERE, AND THAT IS THE POINT.
 * lib/tool-config.js lets a caller declare who is asking, and loosening
 * requires `by:'user'`. This tool is called BY THE MODEL, so if it accepted a
 * `by` argument the model could simply pass 'user' and the entire ratchet
 * would be decorative. It hard-codes ACTOR.AGENT. There is no argument, no
 * override, and no flag — the same reason lib/intake.js refuses a verdict from
 * anything that is not a real gate.
 *
 * So through this tool:
 *   TIGHTENING applies immediately — disable, require confirmation, narrow.
 *   LOOSENING returns a proposal for James, and says so plainly.
 *
 * That is not a limit on usefulness. Co-pilot noticing "run_command has failed
 * four times this session, I'm disabling it and saying why" is the case this
 * exists for, and it needs nobody's permission.
 */
const cfg = require('../../../tool-config.js');

const ACTIONS = {
  /** What is configured right now. */
  list: () => {
    const all = cfg.list();
    return {
      ok: true,
      configured: all.length,
      tools: all.map(c => ({
        tool: c.toolName, enabled: c.enabled, requiresConfirm: c.requiresConfirm,
        allowedAgents: c.allowedAgents, defaults: c.defaults, notes: c.notes,
        changedBy: c.changedBy, reason: c.reason,
      })),
      note: 'Tools absent from this list are unconfigured and behave exactly as they always have.',
    };
  },

  /** One tool's effective config — always answers, configured or not. */
  get: (a) => {
    if (!a.tool) return { error: 'get needs tool' };
    return { ok: true, config: cfg.get(a.tool) };
  },

  /** Why is this tool behaving differently than last week (§0.3). */
  history: (a) => {
    if (!a.tool) return { error: 'history needs tool' };
    const h = cfg.history(a.tool);
    return h.length ? { ok: true, tool: a.tool, changes: h } : { ok: true, tool: a.tool, changes: [], note: 'never configured — no history to show' };
  },

  /** Turn a tool off. Tightening: applies immediately. */
  disable: (a) => {
    if (!a.tool) return { error: 'disable needs tool' };
    if (!a.reason) return { error: 'disable needs reason — a config change with no stated why is unreadable later (§17.3)' };
    return cfg.set(a.tool, { enabled: false }, { by: cfg.ACTOR.AGENT, reason: a.reason });
  },

  /** Turn a tool on. Loosening: returns a proposal for James. */
  enable: (a) => {
    if (!a.tool) return { error: 'enable needs tool' };
    const r = cfg.set(a.tool, { enabled: true }, { by: cfg.ACTOR.AGENT, reason: a.reason || null });
    if (r.needsUser) return { ...r, tellJames: `I can't enable "${a.tool}" myself — enabling loosens the config, and that's yours. Say the word and it's done.` };
    return r;
  },

  /** Make a tool ask before it runs. Tightening. */
  require_confirm: (a) => {
    if (!a.tool) return { error: 'require_confirm needs tool' };
    if (!a.reason) return { error: 'require_confirm needs reason' };
    return cfg.set(a.tool, { requiresConfirm: true }, { by: cfg.ACTOR.AGENT, reason: a.reason });
  },

  /** Change argument defaults or notes. Neutral — grants no new reach. */
  set_defaults: (a) => {
    if (!a.tool) return { error: 'set_defaults needs tool' };
    if (a.defaults === undefined && a.notes === undefined) return { error: 'set_defaults needs defaults and/or notes' };
    const changes = {};
    if (a.defaults !== undefined) changes.defaults = a.defaults;
    if (a.notes !== undefined) changes.notes = a.notes;
    return cfg.set(a.tool, changes, { by: cfg.ACTOR.AGENT, reason: a.reason || null });
  },

  /** Restrict a tool to named agents. Narrowing tightens; widening proposes. */
  restrict: (a) => {
    if (!a.tool) return { error: 'restrict needs tool' };
    if (!Array.isArray(a.agents)) return { error: 'restrict needs agents — an array of agent names, or use unrestrict' };
    if (!a.reason) return { error: 'restrict needs reason' };
    const r = cfg.set(a.tool, { allowedAgents: a.agents }, { by: cfg.ACTOR.AGENT, reason: a.reason });
    if (r.needsUser) return { ...r, tellJames: `Widening "${a.tool}" to more agents loosens it — that's your call, not mine.` };
    return r;
  },
};

module.exports = {
  name: 'tool_config',
  description:
    'Read and change the configuration of NEXUS tools. Actions: "list" (every configured tool), ' +
    '"get" (one tool\'s effective config — unconfigured tools report their defaults), "history" ' +
    '(every change to a tool, with who and why), "disable" (needs tool + reason), "enable" (needs tool), ' +
    '"require_confirm" (needs tool + reason), "set_defaults" (needs tool + defaults and/or notes), ' +
    '"restrict" (needs tool + agents array + reason). ' +
    'TIGHTENING a config — disabling, requiring confirmation, narrowing which agents may use a tool — ' +
    'applies immediately. LOOSENING — enabling, widening — returns a proposal for James to confirm, ' +
    'because an agent that can grant itself capability has no gate at all. Say so plainly when it happens.',
  parameters: {
    type: 'object',
    properties: {
      action:   { type: 'string', enum: Object.keys(ACTIONS) },
      tool:     { type: 'string', description: 'the tool being configured' },
      reason:   { type: 'string', description: 'why — required for every tightening change' },
      defaults: { type: 'object', description: 'for "set_defaults" — argument defaults, merged UNDER caller arguments' },
      notes:    { type: 'string', description: 'for "set_defaults"' },
      agents:   { type: 'array', items: { type: 'string' }, description: 'for "restrict"' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action "${args.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(args); }
    catch (e) { return { error: `tool_config ${args.action} failed: ${e.message}` }; }
  },
  VERSION: '1.0.0',
};
