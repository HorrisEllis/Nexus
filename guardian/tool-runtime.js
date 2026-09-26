'use strict';
/**
 * guardian/tool-runtime.js — P4 of the omniscience phasemap
 * UUID: nexus-guardian-tool-runtime-v1-0000-2026-0730-001
 * Version: 1.0.0
 *
 * §PHASEMAP P4 (docs/copilot-omniscience-phasemap.spec). Proof of B/non-linear:
 * the SAME sovereign loop (lib/agent-tools) copilot uses is wired into Guardian
 * with Guardian's OWN model backend — its job-based provider dispatch (NCP →
 * browser tabs: claude/chatgpt/gemini). agent-tools is untouched; Guardian
 * brings a different callModel. Nobody owns the loop (§10.3), and Guardian's
 * tool-loop has ZERO dependency on copilot (§5.14 — same contract, different
 * backend).
 *
 * The one real difference from copilot's runtime: Guardian's dispatch is
 * fire-and-forget (createJob → dispatchJob → NCP answers asynchronously and
 * updates the job in the `jobs` Map). So the callModel adapter must RESOLVE the
 * job — poll jobs.get(id) until status==='complete' — before returning to the
 * loop. That resolution is injected (Guardian owns its jobs Map), keeping this
 * module sovereign and testable.
 */

const agentTools = require('../lib/agent-tools');

/**
 * makeGuardianCallModel(createAndDispatch, resolveJob, opts)
 *   createAndDispatch(prompt, {provider, tools}) → jobId  (Guardian creates + dispatches a job)
 *   resolveJob(jobId) → { text, toolCalls?, provider }    (polls jobs.get until complete; injected)
 *
 * Adapts Guardian's async job model to runToolLoop's
 * (messages, toolSchemas) => { text, toolCalls } contract.
 */
function makeGuardianCallModel(createAndDispatch, resolveJob, opts = {}) {
  const provider = opts.provider || 'claude';
  return async function callModel(messages, toolSchemas) {
    const system = messages.find(m => m.role === 'system')?.content || '';
    const convo = messages
      .filter(m => m.role !== 'system')
      .map(m => {
        if (m.role === 'tool') return `[tool:${m.name}] ${m.content}`;
        if (m.role === 'assistant') return `ASSISTANT: ${m.content || ''}`;
        return `USER: ${m.content || ''}`;
      })
      .join('\n');

    const prompt = system ? `${system}\n\n${convo}` : convo;
    const jobId = await createAndDispatch(prompt, { provider, tools: toolSchemas });
    const final = await resolveJob(jobId);
    const toolCalls = _extractToolCalls(final);
    return { text: final.text || final.response || '', toolCalls: toolCalls && toolCalls.length ? toolCalls : null };
  };
}

/** Same tool_call extraction as copilot's runtime — providers return OpenAI/ollama shapes. */
function _extractToolCalls(final) {
  const raw = final.toolCalls || final.tool_calls || final.message?.tool_calls;
  if (!Array.isArray(raw)) return null;
  return raw.map((c, i) => {
    const rawArgs = c.arguments !== undefined ? c.arguments : c.function?.arguments;
    return {
      id: c.id || `call_${i}`,
      name: c.name || c.function?.name,
      arguments: typeof rawArgs === 'string' ? _safeParse(rawArgs) : (rawArgs || {}),
    };
  }).filter(c => c.name);
}

function _safeParse(s) { try { return JSON.parse(s); } catch { return {}; } }

/**
 * run(opts) — Guardian's tool-loop entry point.
 *   o.userPrompt
 *   o.createAndDispatch  — Guardian's job create+dispatch
 *   o.resolveJob         — Guardian's job resolver (poll to complete)
 *   o.provider           — which browser-tab provider (default claude)
 *   o.streamDigest       — live stream (P7 shares this across systems), optional
 *   o.maxIterations
 */
async function run(o = {}) {
  if (!o.createAndDispatch || !o.resolveJob) {
    throw new Error('[guardian tool-runtime] createAndDispatch and resolveJob are required');
  }
  const callModel = makeGuardianCallModel(o.createAndDispatch, o.resolveJob, { provider: o.provider });

  // Guardian's loop is NOT the user-memory surface (that's copilot's job — P2).
  // Guardian gets tools + the shared stream (P7: lib/stream-digest, the same
  // normalizer copilot reads — one stream, many readers), but no user-model.
  // Different caller, different purpose — the point of B.
  // §WIRED 2026-08-14 — a browser tab (claude.ai DOM session) has no
  // native tool-calling schema; toolSchemas is passed to callModel but a
  // human-facing web page can't act on a JSON schema it never sees. This
  // is the in-band substitute: a plain-text convention the model follows
  // in its reply, parsed back out by guardian/server.js's
  // _extractToolCallsFromDOM(). Both this prompt and that parser must
  // agree on the exact fence — 'tool_call', one JSON object per block.
  const toolNames = [...agentTools.TOOLS.keys()].sort();
  const systemPrompt = [
    'You are NEXUS Guardian with tools. Use them to read files, run diagnostics, query the system, and act. Prefer a tool over guessing.',
    '',
    `Available tools: ${toolNames.join(', ')}.`,
    'To call a tool, reply with ONLY a fenced block in exactly this form, one JSON object per block:',
    '```tool_call',
    '{"name": "file_tree", "arguments": {"path": "."}}',
    '```',
    'You may include more than one such block in a reply to call multiple tools. After a tool result comes back, use it to continue or give your final answer as plain text with no tool_call block.',
    o.streamDigest ? `\nLIVE SYSTEM STREAM:\n${o.streamDigest}` : '',
  ].filter(Boolean).join('\n');

  return agentTools.runToolLoop(callModel, systemPrompt, o.userPrompt, {
    maxIterations: o.maxIterations || 6,
  });
}

module.exports = { run, makeGuardianCallModel, _extractToolCalls, toolCount: () => agentTools.TOOLS.size };
