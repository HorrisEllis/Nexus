'use strict';
/**
 * lib/agent-tools/tools/roundtable.js — the real "shared chat where the
 * council can all talk to each other, me included." Thin wrapper (§16.5)
 * over lib/roundtable.js, wired to the real dispatch this session built.
 * comp_id: nexus.lib.agent-tools.tools.roundtable
 * UUID: nexus-tool-roundtable-v1-0000-2026-0813-001
 */
const rt = require('../../../roundtable.js');

async function _dispatchToMember(member, transcript) {
  const path = require('path');
  const ROOT = path.resolve(__dirname, '../../../..');
  const tr = require(path.join(ROOT, 'copilot/tool-runtime.js'));
  const lifeline = require(path.join(ROOT, 'copilot/lifeline.js'));

  let baseAgent = member;
  try {
    const hf = require(path.join(ROOT, 'lib/hat-forge.js'));
    const hat = hf.get(member);
    if (hat) baseAgent = hat.baseAgent;
  } catch (_) {}

  if (baseAgent === 'ollama') return await lifeline.route(transcript, { provider: 'ollama', requestId: `roundtable-${Date.now()}` });
  const dispatchToAgent = (prompt, opts) => lifeline.dispatchToNcpAgent(prompt, { ...opts, provider: baseAgent });
  return await tr.runViaAgent(baseAgent, dispatchToAgent, transcript, {});
}

const ACTIONS = {
  open: (a) => {
    if (!a.topic) return { error: 'open needs topic' };
    if (!Array.isArray(a.members) || !a.members.length) return { error: 'open needs members — agent or hat names (the user is added automatically)' };
    return { ok: true, session: rt.open(a.topic, a.members) };
  },
  post: (a) => {
    if (!a.roundtableId || !a.message) return { error: 'post needs roundtableId and message' };
    return { ok: true, message: rt.post(a.roundtableId, a.speaker || 'user', a.message) };
  },
  speak: async (a) => {
    if (!a.roundtableId || !a.member) return { error: 'speak needs roundtableId and member — who should respond next, given the full shared thread so far' };
    return { ok: true, message: await rt.speak(a.roundtableId, a.member, { dispatch: _dispatchToMember }) };
  },
  thread: (a) => {
    if (!a.roundtableId) return { error: 'thread needs roundtableId' };
    return { ok: true, thread: rt.thread(a.roundtableId) };
  },
  close: (a) => {
    if (!a.roundtableId) return { error: 'close needs roundtableId' };
    return rt.close(a.roundtableId);
  },
};

module.exports = {
  name: 'roundtable',
  description:
    'A real, shared, persisted multi-party conversation — the opposite of agent_council\'s independent ' +
    'verdicts. Every member (and the user) sees the SAME growing thread. "open" (needs topic, members — ' +
    'the user is added automatically), "post" (add a message — speaker defaults to "user"), "speak" ' +
    '(invite ONE member to respond, given the FULL shared thread as context — their real answer is ' +
    'posted back into it), "thread" (the full real conversation, in order), "close". Nothing auto-chains ' +
    'agents replying to each other — each turn is explicit, the caller decides who speaks next.',
  parameters: {
    type: 'object',
    properties: {
      action:       { type: 'string', enum: Object.keys(ACTIONS) },
      topic:        { type: 'string', description: 'for "open"' },
      members:      { type: 'array', items: { type: 'string' }, description: 'for "open" — agent or hat names' },
      roundtableId: { type: 'string', description: 'for post/speak/thread/close' },
      speaker:      { type: 'string', description: 'for "post" — defaults to "user"' },
      message:      { type: 'string', description: 'for "post"' },
      member:       { type: 'string', description: 'for "speak" — who responds next' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action "${args.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(args); }
    catch (e) { return { error: `roundtable ${args.action} failed: ${e.message}` }; }
  },
};
