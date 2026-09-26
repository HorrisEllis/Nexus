'use strict';
/**
 * lib/agent-tools/tools/emergence.js — the real "give it axioms and an
 * end-state, let it try, pivot the method if the same one keeps failing"
 * command. Wires lib/emergence.js's real loop to runViaAgent (proposing)
 * and lib/safe-apply.js (real isolated verification) — no new dispatch
 * or isolation mechanism, both already proven this session.
 * comp_id: nexus.lib.agent-tools.tools.emergence
 * UUID: nexus-tool-emergence-v1-0000-2026-0813-001
 */
const em = require('../../../emergence.js');
const sa = require('../../../safe-apply.js');

async function _proposeCandidate(agent, context) {
  const path = require('path');
  const ROOT = path.resolve(__dirname, '../../../..');
  const tr = require(path.join(ROOT, 'copilot/tool-runtime.js'));
  const lifeline = require(path.join(ROOT, 'copilot/lifeline.js'));

  const prompt = [
    `AXIOMS (must all hold): ${context.axioms.join('; ')}`,
    `END-STATE: ${context.endState}`,
    `CURRENT FILES: ${JSON.stringify(context.files)}`,
    context.priorAttempts.length ? `PRIOR ATTEMPTS: ${JSON.stringify(context.priorAttempts)}` : '',
    context.instruction,
    'Respond with a fenced ```candidate block containing JSON: {"method": "short label for your approach", "files": {"relative/path": "full new content"}}',
  ].filter(Boolean).join('\n\n');

  let result;
  if (agent === 'ollama') result = await lifeline.route(prompt, { provider: 'ollama' });
  else {
    const dispatchToAgent = (p, opts) => lifeline.dispatchToNcpAgent(p, { ...opts, provider: agent });
    result = await tr.runViaAgent(agent, dispatchToAgent, prompt, {});
  }
  const text = result.text || '';
  const m = text.match(/```candidate\s*\n([\s\S]*?)\n```/);
  if (!m) throw new Error('agent did not respond with a ```candidate block');
  const parsed = JSON.parse(m[1].trim());
  return { method: parsed.method || 'unspecified', files: parsed.files || {} };
}

async function _checkFn(compartment, files, entryFile) {
  const result = await sa.proposeChange(compartment, files, { entryFile, label: 'emergence-attempt' });
  return { passed: result.passed === true, why: result.passed ? null : (result.checkResult?.stderr || 'check did not pass'), branchId: result.branchId };
}

module.exports = {
  name: 'emergence',
  description:
    'Real axioms + end-state -> iteratively propose, verify in an isolated real branch (safe_apply), and ' +
    'refine. If the SAME method fails repeatedly (pivotAfter, default 3), the next prompt explicitly asks ' +
    'for a genuinely different approach instead of another refinement — "innovate the problem, or if that ' +
    'fails, innovate the method." Needs targetDir (mirrored into a fresh compartment), axioms (array of ' +
    'real constraints), endState (what acceptable means), files (starting content), agent (who proposes ' +
    'candidates), entryFile (the real check — usually the changed file itself).',
  parameters: {
    type: 'object',
    properties: {
      targetDir:     { type: 'string', description: 'real directory to mirror for isolated attempts' },
      axioms:        { type: 'array', items: { type: 'string' } },
      endState:      { type: 'string' },
      files:         { type: 'object', description: '{ "relative/path": "starting content" }' },
      agent:         { type: 'string', description: 'ollama/claude/chatgpt/gemini/mistral/perplexity, or a forged hat name' },
      entryFile:     { type: 'string', description: 'real file to run as the check each attempt' },
      maxIterations: { type: 'number' },
      pivotAfter:    { type: 'number', description: 'default 3 — consecutive same-method failures before the method itself is asked to change' },
    },
    required: ['targetDir', 'axioms', 'endState', 'files', 'agent', 'entryFile'],
  },
  async execute(args = {}) {
    try {
      const { compartment } = sa.mirrorCompartment(args.targetDir, {});
      const result = await em.attempt(compartment, { axioms: args.axioms, endState: args.endState, files: args.files }, {
        proposeCandidate: (context) => _proposeCandidate(args.agent, context),
        checkFn: (c, files) => _checkFn(c, files, args.entryFile),
        maxIterations: args.maxIterations, pivotAfter: args.pivotAfter,
      });
      return { ok: result.ok, ...result, compartmentId: compartment.id };
    } catch (e) { return { error: `emergence failed: ${e.message}` }; }
  },
};
