'use strict';
/**
 * lib/agent-tools/tools/coordination/agent-chat.js — address ONE other
 * agent (chatgpt/claude/gemini/perplexity/...) as a real conversational
 * turn, hop-capped, logged. Thin wrapper (§16.5) over lib/agent-chat.js,
 * same pattern as ./agent-council.js.
 * comp_id: nexus.lib.agent-tools.tools.agent-chat
 * UUID: nexus-tool-agent-chat-v1-0000-2026-0819-001
 *
 * §WHY A SEPARATE TOOL FROM agent_council — checked before building:
 * agent_council fans the SAME question out to multiple members, independently,
 * to collect verdicts; roundtable/parallel_dispatch are its siblings for that
 * shape. None of them address ONE agent with a hop cap, and none of them
 * write anything to guardian_chat_log — confirmed by grep, that table has
 * had zero writers anywhere in the tree until lib/agent-chat.js's ask().
 * This tool is the "hey nexus, ask chatgpt to..." shape: one addressee, a
 * real history other tools (agent_chat_search) can then read back.
 *
 * §REAL TOOL ACCESS FOR THE DISPATCHED AGENT — dispatch is
 * copilot/tool-runtime.js's runViaAgent, the SAME full tool loop co-pilot
 * itself runs on (that file's own words: "whichever agent is dispatched to
 * gets the SAME tool loop... as ollama"), not the narrower 4-tool
 * escalation set lifeline.js uses for its own fallback cascade. Asking
 * chatgpt or gemini something about nexus through this tool gives them real
 * read/diagnostic/query access to nexus while they answer, not just the
 * conversation.
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '../../../..');

function _resolveBaseAgent(member) {
  let baseAgent = member;
  try {
    const hf = require(path.join(ROOT, 'lib/hat-forge.js'));
    const hat = hf.get(member);
    if (hat) baseAgent = hat.baseAgent;
  } catch (_) {}
  return baseAgent;
}

// Injected into lib/agent-chat.js's ask() as opts.dispatch. Signature the
// core module expects: (prompt, {provider, ...}) => {ok, text, error}.
async function _dispatch(prompt, opts) {
  const tr = require(path.join(ROOT, 'copilot/tool-runtime.js'));
  const lifeline = require(path.join(ROOT, 'copilot/lifeline.js'));
  const baseAgent = _resolveBaseAgent(opts.provider);

  if (baseAgent === 'ollama') {
    return await lifeline.route(prompt, { provider: 'ollama', requestId: opts.requestId || `agent-chat-${Date.now()}` });
  }
  const dispatchToAgent = (p, o) => lifeline.dispatchToNcpAgent(p, { ...o, provider: baseAgent });
  const result = await tr.runViaAgent(baseAgent, dispatchToAgent, prompt, {});
  // runViaAgent (agentTools.runToolLoop) returns {text, iterations, toolCallLog};
  // lib/agent-chat.js's ask() wants {ok, text, error} — never assume the
  // richer shape means success on its own, an empty text is still a miss.
  return result && result.text ? { ok: true, text: result.text } : { ok: false, error: 'no text from tool loop' };
}

const ACTIONS = {
  ask: async (a) => {
    if (!a.provider) return { error: 'ask needs provider — chatgpt/claude/gemini/perplexity/ollama/mistral' };
    if (!a.message) return { error: 'ask needs message — what to say to that agent' };
    const agentChat = require(path.join(ROOT, 'lib/agent-chat.js'));
    const result = await agentChat.ask(a.provider, a.message, {
      from: a.from || 'nexus',
      hops: Array.isArray(a.hops) ? a.hops : [],
      maxHops: a.maxHops,
      dispatch: _dispatch,
    });
    return result;
  },
  read: async (a) => {
    const agentChat = require(path.join(ROOT, 'lib/agent-chat.js'));
    return agentChat.readChat(a.provider, { limit: a.limit });
  },
  // §BUILT 2026-08-19 — James: "I want them to be able to talk back and
  // forth." Genuine, multi-round conversation between two named agents,
  // not a single ask. Same real _dispatch as ask() above — every turn
  // independently gets the same real tool access and RAID routing.
  converse: async (a) => {
    if (!a.agentA || !a.agentB) return { error: 'converse needs agentA and agentB' };
    if (!a.openingLine) return { error: 'converse needs openingLine — what agentA opens with' };
    const agentChat = require(path.join(ROOT, 'lib/agent-chat.js'));
    return agentChat.converse({
      agentA: a.agentA, agentB: a.agentB, openingLine: a.openingLine,
      from: a.from || 'nexus', maxRounds: a.maxRounds, dispatch: _dispatch,
    });
  },
};

module.exports = {
  name: 'agent_chat',
  description:
    'Address ONE other agent (chatgpt/claude/gemini/perplexity/ollama/mistral, or a forged hat name) as a real ' +
    'conversational turn and get its answer back — that agent gets the SAME real tool access to nexus this loop ' +
    'has, not just a bare completion. "ask" (needs provider, message) sends one turn. "converse" (needs agentA, ' +
    'agentB, openingLine, optional maxRounds default 4) runs a genuine, multi-round, back-and-forth conversation ' +
    'between two DIFFERENT named agents — each side\'s real reply becomes the other\'s next real input, until ' +
    'either side signals it\'s done, maxRounds is reached, or a real dispatch failure stops it. "read" (needs ' +
    'provider) shows logged history with that agent. A hop cap (default 4, or pass maxHops) refuses a chain that ' +
    'would loop back through an agent already in it — pass hops forward if you are relaying on behalf of another ' +
    'agent, not starting a fresh chain yourself. Prefer agent_council when you want several independent verdicts ' +
    'on the same question instead of one addressed conversation.',
  parameters: {
    type: 'object',
    properties: {
      action:      { type: 'string', enum: Object.keys(ACTIONS) },
      provider:    { type: 'string', description: 'agent or hat name to address / read history for (ask, read)' },
      message:     { type: 'string', description: 'what to say (ask only)' },
      agentA:      { type: 'string', description: 'converse only — the agent that opens the conversation' },
      agentB:      { type: 'string', description: 'converse only — the agent that responds, must differ from agentA' },
      openingLine: { type: 'string', description: 'converse only — what agentA opens with' },
      maxRounds:   { type: 'number', description: 'converse only — real round-trip bound, default 4, hard-capped at 10' },
      from:        { type: 'string', description: 'who is asking — defaults to nexus' },
      hops:        { type: 'array', items: { type: 'string' }, description: 'existing chain, if relaying — do not set when starting fresh (ask only)' },
      maxHops:     { type: 'number', description: 'override the default hop cap (4) (ask only)' },
      limit:       { type: 'number', description: 'read only — how many rows, newest first' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action "${args.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(args); }
    catch (e) { return { error: `agent_chat ${args.action} failed: ${e.message}` }; }
  },
};
