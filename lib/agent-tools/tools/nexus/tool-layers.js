'use strict';
/**
 * lib/agent-tools/tools/nexus/tool-layers.js — the agent tools as layers.
 * comp_id: nexus.lib.agent-tools.tools.nexus.tool-layers
 *
 * §0.39.278 — James: "need to expose the agent tools as layers. layer one is the command to list the 2 layer, which
 * is just the catogories of tools, then the next command expands a specific tree of tools."
 *
 *   nexus.tools.tool          layer 1 → the categories (layer 2): id, title, count, a few names
 *   nexus.tools_expand.tool   layer 2 → one category's tree: a branch per owning system, each tool with its summary,
 *                             its guide note and its parameters (name, type, required)
 *   <any tool>                layer 3 → called by name, the same way as always
 *
 * Nothing new is stored: both read the live registry (lib/agent-tools/index.js TOOLS) through the one catalog
 * (tool-catalog.js), so a tool registered later appears the moment it exists. A tool this agent may not use (the
 * tool-config gate, or the run's own allowedTools when the context carries them) is not shown — a model shown a tool
 * it cannot call plans around it and fails (the same rule getToolSchemas() follows).
 */

const { toolName } = require('../../naming.js');
const C = require('../../tool-catalog.js');

function _registry() { return require('../../index.js').TOOLS; }   // lazy: index.js registers this file

function _visible(ctx) {
  const TOOLS = _registry();
  const allowed = ctx && ctx.context && Array.isArray(ctx.context.allowedTools) && ctx.context.allowedTools.length
    ? new Set(ctx.context.allowedTools) : null;
  let cfg = null; try { cfg = require('../../../tool-config.js'); } catch (_) {}
  const entries = [...TOOLS.values()].filter(t => {
    if (allowed && !allowed.has(t.name)) return false;
    if (!cfg) return true;
    try { const c = cfg.check(t.name, { agent: ctx && ctx.agent }); return c.allow !== false || c.needsConfirm === true; }
    catch (_) { return true; }
  });
  let noteFor = null; try { noteFor = require('../../tool-guide.js').noteFor; } catch (_) {}
  return { list: C.catalog({ tools: entries, noteFor }), entries: new Map(entries.map(t => [t.name, t])) };
}

const EXPAND = toolName('nexus', 'tools_expand');

// §0.39.278 — James: "need to make them aware that the conversation will capture the code written automatically."
// Said where an agent looks for a way to write code: layer 1, and the Code category.
const CAPTURE = 'Your conversation is captured automatically (Clear Glass chat ledger: replies, code, thinking). In a repo agent, a fenced code block with its path (```js src/file.js) is written into the repo for you — no tool needed for a whole file. Use the code tools to read, search, edit part of a file and check.';

const tools = {
  name: toolName('nexus', 'tools'),
  description: 'Layer 1 of the tools: lists the tool categories (id, title, how many tools, a few names). Call nexus.tools_expand.tool with a category id to see that category\'s tools and their parameters, then call a tool by name.',
  parameters: { type: 'object', properties: {} },
  execute: async (_args = {}, ctx) => {
    const { list } = _visible(ctx);
    const cats = C.categories(list);
    return { layer: 1, total: list.length, categories: cats, next: `${EXPAND} with { "category": "<id>" }`, note: CAPTURE };
  },
};

const expand = {
  name: EXPAND,
  description: 'Layer 2 of the tools: one category\'s tools, grouped by the system that owns them, each with a one-line summary, when to use it, and its parameters (name, type, required). Get the category ids from nexus.tools.tool.',
  parameters: {
    type: 'object',
    properties: { category: { type: 'string', description: 'a category id (or title) from nexus.tools.tool, e.g. "code"' } },
    required: ['category'],
  },
  execute: async (args = {}, ctx) => {
    if (!args.category) return { error: 'category is required — call nexus.tools.tool for the ids' };
    const { list, entries } = _visible(ctx);
    const r = C.expand(list, args.category, { entries });
    if (!r.ok) return { error: r.error };
    return { layer: 2, ...r, next: 'call a tool by its name with the parameters shown', ...(r.category === 'code' ? { note: CAPTURE } : {}) };
  },
};

const LAYER_TOOLS = Object.freeze([tools.name, expand.name]);

module.exports = { tools, expand, LAYER_TOOLS };