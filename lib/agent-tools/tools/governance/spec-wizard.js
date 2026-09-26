'use strict';
/**
 * lib/agent-tools/tools/governance/spec-wizard.js — spec_wizard tool
 * UUID: nexus-tool-spec-wizard-v1-0000-2026-0817-jamesbrooks-001
 *
 * §BUILT 2026-08-17 — James: "I also want co-pilot to be able to walk
 * through making a spec using the compiler, dimensions."
 *
 * Checked first, same discipline as everything else in cos.spec: idearium/
 * spec-engine IS the real "compiler" (already identified as such this
 * session), its 10 real SPEC_SECTIONS (meta/purpose/axioms/schema/api/
 * events/integration/failure_modes/build_order/tests) ARE the real
 * "dimensions" — checked directly in idearium/spec-engine/index.js, not
 * guessed. A real, LLM-driven wizard (idearium/agent-suite's
 * getNextWizardQuestion, reachable at POST /api/spec-engine/wizard)
 * ALREADY covers 6 of the 10 (name/type/description/agent/purpose/
 * axioms) — real, working, not duplicated here. The actual gap, confirmed
 * by grepping copilot/server.js and every agent-tool for any reference to
 * spec-engine (zero hits): co-pilot itself has no path to any of this at
 * all. This tool is that path, nothing more.
 *
 * Goes through idearium's real HTTP API (lib/nexus-client, already proven
 * — a real, existing CJS tool, run-closed-loop.js, already talks to
 * spec-engine this exact way), not a direct ESM import — spec-engine is a
 * real ES module; idearium runs it as its own sovereign HTTP service, and
 * that's the real, established cross-system contract in this codebase.
 *
 * Stateless per call, by design: co-pilot itself drives the actual
 * back-and-forth across a real conversation, one dimension at a time —
 * this tool doesn't hold conversation state, idearium's own manifest
 * (queried fresh each call) is the single source of truth for progress.
 */
const nx = require('../../../nexus-client.js');

async function _create({ name, type, description, agent, templateId }) {
  if (!name) return { error: 'create needs name' };
  const r = await nx.post('idearium', '/api/spec-engine/specs', { name, type, description, agent, templateId });
  return { specUuid: r.manifest.uuid, totalChunks: r.manifest.totalChunks, doneChunks: r.manifest.doneChunks, chunks: r.manifest.chunks.map(c => ({ uuid: c.uuid, sectionId: c.sectionId, status: c.status })) };
}

async function _wizardQuestion({ specMeta, answeredSections }) {
  const r = await nx.post('idearium', '/api/spec-engine/wizard', { specMeta: specMeta || {}, answeredSections: answeredSections || {} });
  return r.done ? { done: true, message: 'wizard metadata complete — call spec_wizard action:"create" next' } : { done: false, question: r.next };
}

async function _show({ specUuid }) {
  if (!specUuid) return { error: 'needs specUuid' };
  const r = await nx.get('idearium', `/api/spec-engine/specs/${specUuid}`);
  return { manifest: r.manifest, progress: r.manifest.progress, status: r.manifest.status };
}

async function _nextDimension({ specUuid }) {
  if (!specUuid) return { error: 'needs specUuid' };
  const r = await nx.get('idearium', `/api/spec-engine/specs/${specUuid}`);
  const next = (r.manifest.chunks || []).find(c => c.status === 'pending');
  if (!next) {
    return r.manifest.status === 'complete'
      ? { done: true, message: 'all dimensions answered — spec compiled', progress: 100 }
      : { done: false, message: 'no pending chunk, but spec not complete — check for failed/escalated chunks', chunks: r.manifest.chunks.map(c => ({ sectionId: c.sectionId, status: c.status })) };
  }
  return { done: false, chunkUuid: next.uuid, sectionId: next.sectionId, progress: r.manifest.progress };
}

async function _answerDimension({ specUuid, chunkUuid, content }) {
  if (!specUuid || !chunkUuid || !content) return { error: 'needs specUuid, chunkUuid, and content' };
  const r = await nx.post('idearium', `/api/spec-engine/specs/${specUuid}/chunk/${chunkUuid}/complete`, { content });
  return { sectionId: r.chunk.sectionId, progress: r.progress, complete: r.progress === 100 };
}

async function _templates() {
  const r = await nx.get('idearium', '/api/spec-engine/templates');
  return { templates: r.templates };
}

const ACTIONS = {
  list_templates:  _templates,
  wizard_question: _wizardQuestion,
  create:          _create,
  status:          _show,
  next_dimension:  _nextDimension,
  answer_dimension: _answerDimension,
};

const DIMENSIONS = ['meta', 'purpose', 'axioms', 'schema', 'api', 'events', 'integration', 'failure_modes', 'build_order', 'tests'];

module.exports = {
  name: 'spec_wizard',
  description:
    'Walk someone through building a real, compiled .spec file using idearium\'s real spec-engine — the 10 ' +
    `real dimensions (${DIMENSIONS.join(', ')}), one at a time. Typical flow: "list_templates" to show ` +
    'options, "wizard_question" repeatedly (passing back specMeta/answeredSections each time) until done:true ' +
    'for the first 6 dimensions, then "create" to start the real build, then loop "next_dimension" -> ask the ' +
    'person -> "answer_dimension" with their real answer, until progress reaches 100 — the real spec auto-' +
    'compiles the moment the last dimension completes, no separate finish step.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: Object.keys(ACTIONS) },
      name: { type: 'string', description: 'for "create"' },
      type: { type: 'string', description: 'for "create" — component/service/engine/bridge/agent/system/codebase/library' },
      description: { type: 'string', description: 'for "create"' },
      agent: { type: 'string', description: 'for "create" — which agent builds unanswered chunks' },
      templateId: { type: 'string', description: 'for "create" — optional, seeds some dimensions deterministically' },
      specMeta: { type: 'object', description: 'for "wizard_question" — what\'s been gathered so far' },
      answeredSections: { type: 'object', description: 'for "wizard_question" — {sectionId: answer} already given' },
      specUuid: { type: 'string', description: 'for "status"/"next_dimension"/"answer_dimension"' },
      chunkUuid: { type: 'string', description: 'for "answer_dimension"' },
      content: { type: 'string', description: 'for "answer_dimension" — the real content for that dimension' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action "${args.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(args); }
    catch (e) { return { error: `spec_wizard ${args.action} failed: ${e.message}` }; }
  },
};
