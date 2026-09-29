'use strict';
/**
 * lib/agent-tools/tools/query/context-atlas.js — nexus.context.tool: every memory system and graph, one door.
 * comp_id: nexus.agent-tools.context
 * Version: 1.0.0
 *
 * James, 2026-09-27: "idearium agents should be able to find the context easily when talking to them, all of the
 * memory systems, graphs, etc." lib/context-atlas.js does the work; this is the agent's handle on it.
 * A repo agent's run context (0.39.257: { repoDir, repoUuid }) scopes repo-graph and the repo's own learned memory
 * automatically — the agent does not have to know where its project lives.
 */

const { toolName } = require('../../naming.js');
const A = () => require('../../../context-atlas.js');

module.exports = {
  name: toolName('nexus', 'context'),
  description:
    'Find anything NEXUS remembers. directory: every memory system and graph (≈70 cortex tables — chat history, ' +
    'memory_unified, crystals, fix_map, fault_log, gaps, agent notes, what repo agents learned, ideas, the model of James, ' +
    'opportunities — plus the repo import graph, the system blueprint, every .spec and CHANGELOG), with row counts and ' +
    'which tool reads each deeper. search{query, sources?, limit?}: one query across all of it; every hit names its ' +
    'source and id. get{source,id}: the whole record behind a hit.',
  parameters: {
    type: 'object',
    properties: {
      action:  { type: 'string', enum: ['directory', 'search', 'get'] },
      query:   { type: 'string', description: 'search — plain words; names of files, functions, people, errors work best' },
      sources: { type: 'array', items: { type: 'string' }, description: 'search — optional: e.g. ["jaa:chat_log","repo-graph","spec","changelog","blueprint","vector","jaa:*"]' },
      limit:   { type: 'number', description: 'search — max hits (default 15)' },
      source:  { type: 'string', description: 'get — the hit\'s source' },
      id:      { type: 'string', description: 'get — the hit\'s id (for spec/changelog: the path)' },
      repoDir: { type: 'string', description: 'search — a repo to include the import graph of (a repo agent\'s own is automatic)' },
    },
    required: ['action'],
  },
  async execute(a = {}, run = {}) {
    const ctx = (run && run.context) || {};
    try {
      if (a.action === 'directory') return A().directory();
      if (a.action === 'search') {
        if (!a.query) return { ok: false, error: 'query required' };
        return A().search(a.query, { sources: a.sources || null, limit: a.limit || 15, repoDir: a.repoDir || ctx.repoDir || null, repoUuid: ctx.repoUuid || null });
      }
      if (a.action === 'get') return A().get(a.source, a.id);
      return { ok: false, error: `unknown action "${a.action}" — directory, search or get` };
    } catch (e) { return { ok: false, error: e.message }; }
  },
};
