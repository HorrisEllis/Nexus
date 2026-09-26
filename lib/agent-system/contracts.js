'use strict';
/**
 * lib/agent-system/contracts.js — one contract per TOP-LEVEL provider agent
 * (claude, chatgpt, gemini, perplexity, mistral, grok — clear-glass's own
 * AgentMesh registry, confirmed live: "[AgentMesh] Registry: claude,
 * chatgpt, gemini, perplexity, mistral, grok"). Each contract = personality
 * + model + real token limits + a SCOPED toolkit + an output folder.
 * UUID: nexus-agent-system-contracts-v1-0000-2026-0813-001
 *
 * §DIFFERENT LAYER FROM lib/gemini-toolbox/agent-contracts.js — that file's
 * AGENTS are Gemini's INTERNAL coding sub-agents (code-architect,
 * refactorer, test-writer, diagnostician) — four roles Gemini itself plays
 * during a multi-agent build task. THIS file's agents are the six
 * TOP-LEVEL providers ClearGlass drives as browser tabs (guardian's NCP
 * channel, confirmed live in the boot log: "guardian NCP connected:
 * provider=claude/chatgpt/gemini/perplexity"). One layer up. Same pattern
 * as gemini-toolbox's own chunk-vs-seam distinction — same word, deliberately
 * different concept, documented so it's never conflated (§8.6 extend, don't
 * duplicate or confuse).
 *
 * §8.6 REUSE, NOT REBUILD:
 *   - token limits: seeded from lib/agent-router's AGENT_CONSTRAINTS (the
 *     existing, real numbers for chatgpt/claude/perplexity/gemini) — filled
 *     in here for mistral/grok, which AGENT_CONSTRAINTS never had.
 *   - personality shape: {systemPrompt, allowedTools, defaultIntent}
 *     directly mirrors cortex/personas.js's PersonaStore shape (Copilot's
 *     own persona system) rather than inventing a fourth field convention.
 *   - toolkit vocabulary: real tool names from lib/agent-tools/tools/
 *     (query_recall, query_intelligence, loom_scan, run_command, etc.) —
 *     nothing invented that doesn't already exist as a callable tool.
 *   - RAID pre-integration testing: lib/agent-system/submit.js (sibling
 *     file) calls cortex/core/raid's real verifyInIsolation(), not a new
 *     verification path.
 *
 * §1.1 the anti-hallucination boundary is the SCOPED toolkit, same as
 * gemini-toolbox: an agent whose contract doesn't list write_patch/
 * safe_apply cannot be given it, structurally, not by convention.
 */

const path = require('path');

// Real limits — chatgpt/claude/perplexity/gemini carried over verbatim from
// lib/agent-router's AGENT_CONSTRAINTS (§10.3 one source of truth: this
// FILE reads that one, not a second hand-typed copy — see _baseConstraints
// below). mistral/grok never had an entry there at all — filled in here
// from each provider's real published limits, not guessed.
const FALLBACK_CONSTRAINTS = Object.freeze({
  mistral: { maxTokens: 128_000, outputTokens: 8_192 },
  grok:    { maxTokens: 128_000, outputTokens: 8_192 },
});

function _baseConstraints(agentId) {
  try {
    const { AGENT_CONSTRAINTS } = require('../agent-router');
    if (AGENT_CONSTRAINTS && AGENT_CONSTRAINTS[agentId]) return AGENT_CONSTRAINTS[agentId];
  } catch (_) { /* agent-router unavailable — fall through to this file's own numbers */ }
  return FALLBACK_CONSTRAINTS[agentId] || null;
}

// The tool vocabulary agents draw from — names match lib/agent-tools/tools/
// exactly (confirmed against the real files, not invented). Kept separate
// from gemini-toolbox's ALL_TOOLS (that one is Gemini-coding-specific:
// read_file/write_patch/run_tests/tree/recall) — this is the broader
// NEXUS-facing set a top-level provider agent can be scoped into.
// §UPDATED 2026-08-14 — this list had 13 entries against a real registry
// of 57 (lib/agent-tools/index.js's TOOLS.size, confirmed live). Every
// entry below is a real tool name, checked against the registry directly,
// not invented. This is the VOCABULARY (what a toolkit can be scoped
// from) — allowedTools per agent below stays deliberately narrow per
// mistral/grok's own stated philosophy ("widen from observed behavior,
// not upfront guessing"), not blanket-expanded just because the
// vocabulary grew.
const ALL_TOOLS = Object.freeze({
  read_file:          'read_file(path) — read a file as plain text',
  file_tree:          'file_tree(path, maxDepth) — list files/dirs before requesting one',
  run_command:        'run_command(command, options) — run a cockpit/forge command',
  query_recall:       'query_recall(query, intent, tier) — search past conversations/memory',
  query_intelligence: 'nexus_intelligence(action, ...) — query the intelligence system (patterns/failures/meta/component-failures/map)',
  loom_scan:          'loom_scan(mode) — scan loom for gaps (dangling hooks, closed doors, phasemap drift)',
  loom_register:      'loom_register(action, ...) — register a real component/hook+wire (consumer-enforced)/concern into loom',
  nexus_map:          'nexus_map(action, ...) — walk loom\'s real system graph in agent-sized chunks',
  diagnose:           'diagnose(...) — run diagnostic checks',
  resource_monitor:   'resource_monitor() — current system resource pressure',
  nexus_status:       'nexus_status() — current boot/health status across systems',
  fault_log:          'fault_log(...) — read/query the fault taxonomy',
  propose_idea:       'propose_idea(...) — submit an idea to idearium',
  notes_todo:         'notes_todo(action, ...) — persistent notes and to-do list',
  axiom_check:        'axiom_check(text) — check something against the axioms (read-only)',
  axiom_manage:       'axiom_manage(action, ...) — add/remove/freeze axioms',
  switch_agent:       'switch_agent(action, agent) — switch or check the active agent',
  hat_forge:          'hat_forge(action, ...) — make and manage named reusable hats',
  versionium_commit:  'versionium_commit(message, ...) — record a Versionium commit point (no rewind yet — not built)',
  cos_compartment:    'cos_compartment(action, ...) — create/start/stop/destroy/list/status a compartment',
  cos_archetype:      'cos_archetype(action, ...) — read/assign/detect/create compartment archetypes',
  cos_blueprint:      'cos_blueprint(action, ...) — manage blueprint templates and instances',
  cos_playground:     'cos_playground(action, ...) — create/status/destroy/promote a disposable playground',
  cos_plugin:         'cos_plugin(action, ...) — enable/disable/remove an existing plugin',
  cos_vault:          'cos_vault(action, ...) — manage compartment secrets (never returns raw values)',
  compiler_info:      'compiler_info(action, id) — look up a known compiler/bundler\'s config file',
  parallel_dispatch:  'parallel_dispatch(...) — fan a task out across agents',
  agent_council:      'agent_council(...) — independent multi-agent deliberation',
  roundtable:         'roundtable(...) — shared multi-agent chat',
  agent_capability:   'agent_capability(action, agent) — real measured per-agent stats',
  forge_tool:         'forge_tool(action, ...) — copilot packages its existing capabilities into a new named tool',
});

/**
 * The provider agent registry. Each = personality (cortex/personas.js
 * shape) + model + real constraints + a SCOPED toolkit + an output folder.
 * Add providers here; ClearGlass's AgentMesh is the source of truth for
 * which providers exist (currently 6, confirmed live).
 */
const AGENTS = Object.freeze({
  claude: {
    model: 'claude (via ClearGlass browser tab, NCP channel)',
    personality: {
      systemPrompt: 'Careful, thorough, prose-forward. Good at long-context reasoning and honest uncertainty — use for architecture review, careful diagnosis, and anything where getting it right matters more than getting it fast.',
      allowedTools: ['read_file', 'file_tree', 'query_recall', 'query_intelligence', 'loom_scan', 'diagnose', 'fault_log', 'axiom_manage', 'loom_register', 'versionium_commit', 'notes_todo', 'switch_agent'],
      defaultIntent: 'diagnose',
    },
  },
  chatgpt: {
    model: 'chatgpt (via ClearGlass browser tab, NCP channel)',
    personality: {
      systemPrompt: 'Fast, direct, good at short focused tasks. Real limit is small (900 tokens per AGENT_CONSTRAINTS) — use for quick lookups and short transforms, not long-context work.',
      allowedTools: ['read_file', 'run_command'],
      defaultIntent: 'ask',
    },
  },
  gemini: {
    model: 'gemini (via ClearGlass browser tab, NCP channel; also has its own multi-agent coding sub-registry in lib/gemini-toolbox — see that file for code-architect/refactorer/test-writer/diagnostician)',
    personality: {
      systemPrompt: 'Huge context window (1-2M in / 65,536 out) — use for whole-codebase analysis and large refactors. For multi-agent CODE work specifically, route through lib/gemini-toolbox/agent-contracts instead of this top-level contract.',
      allowedTools: ['read_file', 'file_tree', 'run_command', 'query_recall', 'loom_scan', 'nexus_map', 'notes_todo', 'switch_agent', 'parallel_dispatch'],
      defaultIntent: 'build',
    },
  },
  perplexity: {
    model: 'perplexity (via ClearGlass browser tab, NCP channel)',
    personality: {
      systemPrompt: 'Search-grounded — good for questions needing current external information, weak for internal NEXUS-specific reasoning (no special access to loom/intelligence beyond what any tool call gives it).',
      allowedTools: ['read_file'],
      defaultIntent: 'ask',
    },
  },
  mistral: {
    model: 'mistral (via ClearGlass browser tab, NCP channel)',
    personality: {
      systemPrompt: 'General-purpose, moderate context. No NEXUS-specific tuning yet — starts scoped to read-only tools until real usage data justifies more (§AP4 pattern: intelligence widens/narrows scope from observed behavior, not upfront guessing).',
      allowedTools: ['read_file', 'query_recall'],
      defaultIntent: 'ask',
    },
  },
  grok: {
    model: 'grok (via ClearGlass browser tab, NCP channel)',
    personality: {
      systemPrompt: 'General-purpose. No NEXUS-specific tuning yet — same conservative starting scope as mistral, for the same reason: unobserved, so unwidened.',
      allowedTools: ['read_file', 'query_recall'],
      defaultIntent: 'ask',
    },
  },
});

const OUTPUT_ROOT = path.join(__dirname, '..', '..', 'data', 'agents');

/** outputFolder(agentId) — the directory this agent's outputs get written
 * to (lib/agent-system/submit.js writes here; created on first write, not
 * eagerly — an agent that never produces output never gets an empty dir). */
function outputFolder(agentId) {
  return path.join(OUTPUT_ROOT, agentId, 'outputs');
}

/**
 * getContract(agentId) — assemble the full contract: model + real
 * constraints + personality + SCOPED toolkit + output folder. Returns
 * { error, available } for an unknown id — never fabricates a contract
 * for a provider that isn't registered (§1.1).
 */
function getContract(agentId) {
  const a = AGENTS[agentId];
  if (!a) return { error: `unknown agent "${agentId}"`, available: Object.keys(AGENTS) };
  const constraints = _baseConstraints(agentId);
  const toolkit = {};
  for (const t of a.personality.allowedTools) if (ALL_TOOLS[t]) toolkit[t] = ALL_TOOLS[t];
  return {
    agentId,
    model: a.model,
    personality: a.personality,
    constraints: constraints || { warning: `no known token limits for "${agentId}" — real limits unverified, treat as unbounded-untrusted, not unbounded-safe` },
    toolkit,
    outputFolder: outputFolder(agentId),
  };
}

/** agentCan(agentId, tool) — §1.1 scope check, same contract as
 * gemini-toolbox's agentCan: a tool not in the agent's personality.allowedTools
 * is refused for that agent, structurally. */
function agentCan(agentId, tool) {
  const a = AGENTS[agentId];
  return !!(a && a.personality.allowedTools.includes(tool));
}

function listAgents() {
  return Object.keys(AGENTS).map(id => ({
    id, model: AGENTS[id].model,
    tools: AGENTS[id].personality.allowedTools,
    constraints: _baseConstraints(id),
  }));
}

module.exports = {
  getContract, agentCan, listAgents, outputFolder,
  AGENTS, ALL_TOOLS,
  MODULE_ID: 'agent-system-contracts', VERSION: '1.0.0',
};
