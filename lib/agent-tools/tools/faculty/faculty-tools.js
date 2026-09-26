'use strict';
/**
 * lib/agent-tools/tools/faculty-tools.js — P5 of the omniscience phasemap
 * UUID: nexus-agent-tools-faculty-v1-0000-2026-0730-001
 *
 * §PHASEMAP P5. The copilot faculties (adversarial, module-builder,
 * axiom-manager, analysis) are NOT tools — they have their own shapes. Rather
 * than move them (which would break their interfaces and mix abstractions),
 * these are thin ADAPTERS that give the agentic loop a tool-shaped door into
 * each faculty (§16.5 — wrap, don't move; the faculty keeps owning its logic,
 * §10.1). Requiring the faculty lazily inside execute() keeps this loadable even
 * where a faculty's own deps aren't all present.
 *
 * Registered by lib/agent-tools/index.js alongside the base 10 tools, so both
 * copilot's and Guardian's loops (P1/P4) get them for free — the mesh.
 */

function _lazy(modPath) {
  return () => require(modPath);
}

const moduleBuilderTool = {
  name: 'module_builder',
  description: 'Build a new NEXUS module from a natural-language description, running the full spec → QC → build pipeline. Returns the build result. Use when the user wants to CREATE a new component or capability.',
  parameters: {
    type: 'object',
    properties: {
      description: { type: 'string', description: 'What the module should do, in plain language.' },
    },
    required: ['description'],
  },
  execute: async ({ description }) => {
    if (!description) return { error: 'description is required' };
    try {
      const mb = require('../../../../copilot/module-builder');
      const result = await mb.build(description, { source: 'agent-tools' });
      return { ok: true, result };
    } catch (e) { return { error: `module_builder failed: ${e.message}` }; }
  },
};

const adversarialTool = {
  name: 'run_adversarial',
  description: 'Run an adversarial critique pass over the current system stream — attacks recent activity to surface violations, weaknesses, and contradictions. Use to stress-test a proposal or check for problems.',
  parameters: {
    type: 'object',
    properties: {
      stream: { type: 'array', description: 'Optional array of recent events to critique; empty uses the live stream.', items: { type: 'object' } },
    },
    required: [],
  },
  execute: async ({ stream }) => {
    try {
      const adv = require('../../../../copilot/adversarial');
      const result = await adv.run(Array.isArray(stream) ? stream : []);
      return { ok: true, result };
    } catch (e) { return { error: `run_adversarial failed: ${e.message}` }; }
  },
};

const axiomCheckTool = {
  name: 'axiom_check',
  description: 'Check a prompt, spec, or proposed action against the NEXUS axioms. Returns which axioms are engaged and any violations. Use before acting on something consequential.',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The prompt, spec, or action description to check against the axioms.' },
    },
    required: ['text'],
  },
  execute: async ({ text }) => {
    if (!text) return { error: 'text is required' };
    try {
      const ax = require('../../../../copilot/axiom-manager');
      const result = ax.check(text);
      return { ok: true, result };
    } catch (e) { return { error: `axiom_check failed: ${e.message}` }; }
  },
};

const analyzeTool = {
  name: 'analyze',
  description: 'Deep analytical answer to a question about the system or a problem, using the analysis faculty (assembles context and reasons over it). Use for "why" and "how" questions that need reasoning, not just a lookup.',
  parameters: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'The question to analyze.' },
    },
    required: ['question'],
  },
  execute: async ({ question }) => {
    if (!question) return { error: 'question is required' };
    try {
      const an = require('../../../../copilot/analysis');
      const result = await an.answer(question, 'agent-tools', [], {});
      return { ok: true, result };
    } catch (e) { return { error: `analyze failed: ${e.message}` }; }
  },
};

// §ADDED 2026-09-02 — James: "agent tool for analysis, intuition,
// mastermind, synthesis... co-pilot should have all those tools, same
// with guardian agents. all those should be hooked in." analyze (above)
// was already real and already hooked in; intuition and mastermind were
// real, live faculties with NO tool-shaped door at all — confirmed by
// grep before adding these, not assumed missing. Unlike analyze (which
// reaches copilot's own process-local faculty directly), intuition and
// mastermind are CORTEX's own faculties (intelligence/intuition.js,
// intelligence/mastermind.js — real, separate modules from copilot's
// own similarly-named copilot/intuition.js, a real, un-reconciled
// duplication flagged here, not fixed) with real, live-instantiated
// state (cortex/boot.js's own _intuition/_mastermind, wired to cortex's
// real jaaDB/field/causal-graph). Reaching them via a direct require()
// the way analyzeTool does would be the exact cross-process AX-010
// violation this session already found and fixed twice elsewhere
// (versionium, guardian's own agent-tool) — cortex already exposes both
// over real HTTP (GET /api/intelligence/intuition, POST /api/
// intelligence/mastermind), so these two go through sovereign transport
// instead.
const intuitionTool = {
  name: 'intuition',
  description: 'Fast, associative, pattern-based answer from what the system already knows — cortex\'s own intuition faculty (<50ms, no model call). Falls through to null if there is no confident answer; use analyze for a deeper, reasoned answer.',
  parameters: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'The prompt or question to answer intuitively.' },
    },
    required: ['prompt'],
  },
  execute: async ({ prompt }) => {
    if (!prompt) return { error: 'prompt is required' };
    try {
      const nx = require('../../../nexus-client.js');
      const result = await nx.get('intelligence', `/api/intelligence/intuition?prompt=${encodeURIComponent(prompt)}`);
      return { ok: true, result };
    } catch (e) { return { error: `intuition failed: ${e.message}` }; }
  },
};

const mastermindTool = {
  name: 'mastermind',
  description: 'Strategic, predictive, causal answer — cortex\'s own mastermind faculty, answering "if this is true, what follows?" using the real causal graph. The opposite question from intuition\'s "what does this resemble?".',
  parameters: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'The situation or claim to reason forward from.' },
      contextSnippet: { type: 'string', description: 'Optional additional context.' },
    },
    required: ['prompt'],
  },
  execute: async ({ prompt, contextSnippet }) => {
    if (!prompt) return { error: 'prompt is required' };
    try {
      const nx = require('../../../nexus-client.js');
      const result = await nx.post('intelligence', '/api/intelligence/mastermind', { prompt, contextSnippet: contextSnippet || '' });
      return { ok: true, result };
    } catch (e) { return { error: `mastermind failed: ${e.message}` }; }
  },
};

// §ADDED 2026-09-02 — "synthesis tool can read those [primitives] and
// use it to build contracts." The real, general-purpose door into
// cortex/core/raid/officiator.js's own synthesizeFromContext() — an
// agent can now hand it arbitrary context (a pasted spec, a chat
// excerpt, anything) mid-conversation and get back a real, gated RAID
// build contract, not just wait for an artifact to trigger it
// automatically. officiator.js runs in orchestrator's own process
// (started alongside raid-worker); reached here over real sovereign
// transport (POST /api/officiator/synthesize), not a direct require.
// §MERGED 2026-09-02 — a parallel session independently built a
// `synthesize` tool with a real, better design (separates preview from
// submission via submit:true/false — matches officiator.js's own
// merged synthesizeFromContext()) but reached officiator.js via a
// direct require(). officiator.js runs in ORCHESTRATOR's own process
// (started alongside raid-worker); this file is loaded by BOTH
// copilot's and guardian's processes, so that direct require would be
// the same cross-process AX-010 violation class this session already
// found and fixed twice elsewhere (versionium, guardian's own agent-
// tool) — a call from guardian's or copilot's process would get its
// own separate officiator.js module instance rather than reaching the
// real, running one. Fixed here by keeping their name/behavior but
// routing through the same real sovereign-transport door this session
// already built for exactly this (orchestrator's own POST /api/
// officiator/synthesize).
const synthesizeTool = {
  name: 'synthesize',
  description: 'Synthesize a real, structured build contract (fileName, primitives, compartmentUuid, synthesized context, endState, conditions, axioms, tools) from plain-text context — the same the_officiator hat and B1 schema officiate() uses for staged artifacts, but callable directly by any agent for its OWN reasoning. Does NOT queue a contract by default — pass submit:true to also submit one via the real RAID contract-intake path.',
  parameters: {
    type: 'object',
    properties: {
      contextText: { type: 'string', description: 'The context to synthesize a contract from — a task description, spec excerpt, or any real context the agent has.' },
      submit:      { type: 'boolean', description: 'If true, also queues the synthesized result as a real RAID build contract. Defaults to false (synthesis only, for the agent\'s own context).' },
      forAgent:    { type: 'string', description: 'Which agent wears the_officiator hat for this synthesis call. Defaults to claude.' },
      dispatchTo:  { type: 'string', description: 'Optional — if submit:true, which agent the resulting contract should be dispatched to. Defaults to forAgent.' },
    },
    required: ['contextText'],
  },
  execute: async ({ contextText, submit, forAgent, dispatchTo }) => {
    if (!contextText) return { error: 'contextText is required' };
    try {
      const nx = require('../../../nexus-client.js');
      const result = await nx.post('orchestrator', '/api/officiator/synthesize', { context: contextText, submit: !!submit, forAgent, dispatchTo });
      return result.ok ? { ok: true, result } : { error: `synthesize failed: ${result.reason || result.error}` };
    } catch (e) { return { error: `synthesize failed: ${e.message}` }; }
  },
};

module.exports = [moduleBuilderTool, adversarialTool, axiomCheckTool, analyzeTool, intuitionTool, mastermindTool, synthesizeTool];
