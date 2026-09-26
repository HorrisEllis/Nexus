'use strict';
/**
 * lib/gemini-toolbox/agent-contracts.js — per-agent contracts (§P1 multi-agent)
 * UUID: nexus-gemini-agent-contracts-v1-0000-2026-0807-001
 *
 * James's structured-injection blueprint: a DISTINCT contract per agent to
 * prevent context drift and hallucination — [AGENT_IDENTITY] + [AXIOMS_CONTRACT]
 * + [TOOLBOX_COMMANDS] (a SCOPED subset, not all tools) + [FRAMEWORK_INJECTED_
 * CONTEXT]. Extends the single gemini-toolbox CONTRACT into a registry (§8.6),
 * and draws token scoping from lib/agent-router AGENT_CONSTRAINTS.
 *
 * The scoped toolbox is the anti-hallucination lever: an agent that only has
 * read_file + run_tests literally cannot write outside its lane. §1.1 — a tool
 * not in an agent's scope is refused FOR THAT AGENT.
 */

const { CONTRACT: BASE } = require('./index');

// The full tool vocabulary agents draw from (names match lib/agent-tools/tools/).
const ALL_TOOLS = Object.freeze({
  read_file:    'read_file(path) — read a file as line-numbered plain text',
  write_patch:  'write_patch(path, edits[]) — line-anchored edits, verified then RAID-applied',
  run_tests:    'run_tests(suite) — run a test suite, get pass/fail',
  tree:         'tree(path) — file-structure tree (P2)',
  recall:       'recall(query) — cortex memory recall (P2)',
  query_intelligence: 'query_intelligence(q) — ask the intelligence system',
});

// Gemini's real limits (James 2026-08-07): 1-2M input, ~65,536 output.
const GEMINI_LIMITS = Object.freeze({ inputTokens: 1_000_000, outputTokens: 65_536, contextCaching: true });

/**
 * The agent registry. Each = identity + axioms + SCOPED toolbox + injected
 * context. Add agents here; each is a distinct, drift-resistant contract.
 */
const AGENTS = Object.freeze({
  'code-architect': {
    name: 'CodeArchitect-Alpha',
    role: 'Backend API & schema enforcement. Owns module boundaries and design patterns.',
    axioms: [
      'Never modify code outside your module boundary without an explicit cross-agent event trigger.',
      'Strict type safety, error handling, and adherence to existing repo patterns.',
      'If an ambiguity would violate the core schema, HALT and request state clarification (§1.2 — never guess through a schema conflict).',
    ],
    tools: ['read_file', 'write_patch', 'run_tests', 'tree', 'recall'],
    context: { stack: 'Node.js, NEXUS AXIOMS-v3.1', standard: 'existing repo conventions; component-ledger for all writes' },
  },
  'refactorer': {
    name: 'Refactorer-Beta',
    role: 'Improve existing code without changing behavior or schemas.',
    axioms: [
      'Behavior-preserving only — no API/schema changes (those belong to code-architect).',
      'Every refactor must keep the test suite green.',
      'Scan callers before changing a signature (§8.4).',
    ],
    tools: ['read_file', 'write_patch', 'run_tests', 'tree'],   // no recall — refactor from source, not memory
    context: { stack: 'Node.js', standard: 'no behavior change; tests are the contract' },
  },
  'test-writer': {
    name: 'TestWriter-Gamma',
    role: 'Write and extend tests. Never touches production code.',
    axioms: [
      'Write tests ONLY — never edit non-test files (read them, don\'t write them).',
      'A test must be able to fail — no fabricated passes (§1.1).',
      'Cover the edge cases, not just the happy path.',
    ],
    tools: ['read_file', 'run_tests', 'tree'],   // NO write_patch to prod — scoped out by design
    context: { stack: 'Node.js', standard: 'tests/modules/*.js, registered in run-all.js' },
  },
  'diagnostician': {
    name: 'Diagnostician-Delta',
    role: 'Read-only investigation — find gaps/tension/friction and their conditions.',
    axioms: ['Read-only — never write. Report findings with evidence.', 'Trace conditions, don\'t just name symptoms (RFR2).'],
    tools: ['read_file', 'tree', 'recall', 'query_intelligence'],   // zero write tools
    context: { stack: 'NEXUS', standard: 'findings as evidence, never assertions' },
  },
});

/**
 * getContract(agentId, opts) — assemble the full system-prompt block for an
 * agent: base framework + identity + axioms + SCOPED toolbox + injected context
 * + edit format + Gemini limits. This is what gets injected.
 */
function getContract(agentId, opts = {}) {
  const a = AGENTS[agentId];
  if (!a) return { error: `unknown agent "${agentId}"`, available: Object.keys(AGENTS) };
  const toolbox = {};
  for (const t of a.tools) if (ALL_TOOLS[t]) toolbox[t] = ALL_TOOLS[t];
  return {
    framework: BASE.framework,
    identity: { name: a.name, role: a.role },
    axioms: [...a.axioms, ...BASE.axioms],          // agent axioms + the base coding axioms
    toolbox,                                          // SCOPED — only this agent's tools
    injected_context: a.context,
    edit_format: BASE.edit_format,
    limits: GEMINI_LIMITS,
    ...(opts.injectionPayload ? { payload: opts.injectionPayload } : {}),
  };
}

/**
 * agentCan(agentId, tool) — §1.1 the scope check: is this tool in the agent's
 * contract? A tool not in scope is refused FOR THAT AGENT (the anti-hallucination
 * boundary — a test-writer cannot write_patch prod code).
 */
function agentCan(agentId, tool) {
  const a = AGENTS[agentId];
  return !!(a && a.tools.includes(tool));
}

function listAgents() { return Object.keys(AGENTS).map(id => ({ id, name: AGENTS[id].name, role: AGENTS[id].role, tools: AGENTS[id].tools })); }

module.exports = { getContract, agentCan, listAgents, AGENTS, ALL_TOOLS, GEMINI_LIMITS, MODULE_ID: 'gemini-agent-contracts', VERSION: '1.0.0' };
