'use strict';
/**
 * lib/agent-tools/tools/query/nexus-map.js — nexus_map tool
 * UUID: nexus-tool-nexus-map-v1-0000-2026-0814-jamesbrooks-001
 *
 * §WIRED 2026-08-14 — James: "mapping tool? tree, parse, chunking for
 * agents to build a map of nexus one file at a time." Checked before
 * building: loom's own registry already computes exactly this —
 * driver.graph() returns {nodes, edges, components} — the real
 * NEXUS -> systems -> components -> hooks -> wires hierarchy, confirmed
 * live (docs/repair-contract-and-loom-hub-phasemap.spec: "already exists
 * as live, queryable data"). Re-walking the file tree and parsing each
 * file from scratch (the literal reading of "tree, parse") would rebuild,
 * at real token cost, something loom has already computed once and keeps
 * current. §16.5: this tool is a chunked reader OVER that real graph, not
 * a second parser.
 *
 * The "for agents" / "one file at a time" part is the genuinely new
 * piece: components paginate, sized to the CALLING agent's real
 * constraints (lib/agent-system/contracts.js's getContract(agentId), the
 * same real per-provider token limits AM7(e) of that phasemap named —
 * chatgpt's real 900-token ceiling, claude's real 200k, etc.) instead of
 * dumping the whole graph and letting a small-context agent choke on it.
 *
 * §HONEST SCOPE — componentsPerPage is a character-count heuristic
 * (~4 chars/token, ~250 chars/component entry observed from a sample of
 * this tool's own output), not a real tokenizer call. Treat it as a safe
 * estimate that stays well under the limit, not an exact count — same
 * honesty standard this codebase already applies to RAID's own fitness
 * stubs.
 */
const CHARS_PER_TOKEN = 4;
const CHARS_PER_COMPONENT_ESTIMATE = 250;
const DEFAULT_MAX_TOKENS = 8000; // used when no agentId is given
const RESERVE_FRACTION = 0.5;    // leave half the budget for the rest of the conversation

function _loomDriver() {
  const { LoomDriver } = require('../../../../loom/schema/index.js');
  // §FIX 2026-08-14 — was overriding dataDir to project-root `data/loom/`
  // (nearly empty — a shadow location this session's own test writes had
  // been landing in). LoomRegistry's real default (loom/schema/registry.js:
  // `dataDir || path.join(__dirname, '..', 'data')`) is `loom/data/` — the
  // actual 39,867-line registry.json. Passing no dataDir lets it use that
  // real default instead of a second, wrong, hand-computed path.
  return new LoomDriver();
}

function _pageSizeFor(agentId) {
  let maxTokens = DEFAULT_MAX_TOKENS;
  if (agentId) {
    try {
      const { getContract } = require('../../../agent-system/contracts.js');
      const c = getContract(agentId);
      if (c && c.constraints && c.constraints.maxTokens) maxTokens = c.constraints.maxTokens;
    } catch (_) { /* fall through to default */ }
  }
  const budgetChars = maxTokens * CHARS_PER_TOKEN * RESERVE_FRACTION;
  const n = Math.floor(budgetChars / CHARS_PER_COMPONENT_ESTIMATE);
  return Math.max(5, Math.min(n, 200));
}

function _systemOf(component) {
  if (!component.dir) return component.id.split('.')[0] || 'unknown';
  return String(component.dir).split('/')[0] || 'unknown';
}

const ACTIONS = {
  systems: () => {
    const { components } = _loomDriver().graph();
    const counts = {};
    for (const c of components) {
      const s = _systemOf(c);
      counts[s] = (counts[s] || 0) + 1;
    }
    return { ok: true, totalComponents: components.length, systems: Object.entries(counts).map(([system, componentCount]) => ({ system, componentCount })).sort((a, b) => b.componentCount - a.componentCount) };
  },

  graph: (a) => {
    const { nodes, edges, components } = _loomDriver().graph();
    const filtered = a.system ? components.filter(c => _systemOf(c) === a.system) : components;

    const pageSize = a.pageSize && Number.isInteger(a.pageSize) ? a.pageSize : _pageSizeFor(a.agentId);
    const cursor = Number.isInteger(a.cursor) && a.cursor >= 0 ? a.cursor : 0;
    const page = filtered.slice(cursor, cursor + pageSize);

    const pageIds = new Set(page.map(c => c.id));
    const hookToComponent = new Map(nodes.map(n => [n.id, n.component_id]));
    const relevantEdges = edges.filter(e =>
      pageIds.has(hookToComponent.get(e.from)) || pageIds.has(hookToComponent.get(e.to)));

    const nextCursor = cursor + pageSize < filtered.length ? cursor + pageSize : null;

    return {
      ok: true,
      system: a.system || 'all',
      totalMatching: filtered.length,
      cursor, pageSize, nextCursor,
      note: nextCursor !== null ? `${filtered.length - nextCursor} more components — call again with cursor=${nextCursor} to continue` : 'end of this system\'s components',
      components: page,
      edges: relevantEdges,
    };
  },

  component: (a) => {
    if (!a.id) return { error: 'component needs id' };
    const { nodes, edges, components } = _loomDriver().graph();
    const component = components.find(c => c.id === a.id);
    if (!component) return { ok: false, error: `no component "${a.id}" in loom's registry` };
    const hooks = nodes.filter(n => n.component_id === a.id);
    const hookIds = new Set(hooks.map(h => h.id));
    const componentEdges = edges.filter(e => hookIds.has(e.from) || hookIds.has(e.to));
    return { ok: true, component, hooks, edges: componentEdges };
  },
};

module.exports = {
  name: 'nexus_map',
  description:
    'Walk NEXUS\'s real, already-computed system graph (loom\'s registry — components, hooks, wires) in ' +
    'agent-sized chunks, instead of reading the file tree from scratch. Actions: "systems" (list every ' +
    'system and its component count — start here to pick where to look), "graph" (optional system filter, ' +
    'optional agentId to size the page to that agent\'s real token limit, optional cursor/pageSize to ' +
    'page manually — returns a page of components plus the wires between them, and a nextCursor to ' +
    'continue), "component" (needs id — full detail for one real component: its hooks and every wire ' +
    'touching it).',
  parameters: {
    type: 'object',
    properties: {
      action:   { type: 'string', enum: Object.keys(ACTIONS) },
      system:   { type: 'string', description: 'for "graph" — restrict to one system, e.g. "guardian", "cortex" (see "systems" action for real names)' },
      agentId:  { type: 'string', description: 'for "graph" — size the page to this agent\'s real token limit (claude/chatgpt/gemini/perplexity/mistral/grok/ollama)' },
      cursor:   { type: 'integer', description: 'for "graph" — resume from this offset, from a prior call\'s nextCursor' },
      pageSize: { type: 'integer', description: 'for "graph" — override the auto-sized page, if you know better than the estimate' },
      id:       { type: 'string', description: 'for "component" — a real component id from "graph" or "systems"' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action "${args.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(args); }
    catch (e) { return { error: `nexus_map ${args.action} failed: ${e.message}` }; }
  },
};
