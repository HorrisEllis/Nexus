'use strict';
/**
 * lib/agent-tools/tools/coordination/agent-notes.js — real, editable
 * per-agent constraint log, reachable from chat. Thin wrapper (§16.5)
 * over lib/agent-notes.js.
 * comp_id: nexus.lib.agent-tools.tools.agent-notes
 * UUID: nexus-tool-agent-notes-v1-0000-2026-0822-001
 */
const an = require('../../../agent-notes.js');

const ACTIONS = {
  note: (a) => {
    if (!a.agent || !a.body) return { error: 'note needs agent and body' };
    return an.note(a.agent, a.body, { kind: a.kind, source: a.source, relatesTo: a.relatesTo, supersedes: a.supersedes });
  },
  list: (a) => {
    if (!a.agent) return { error: 'list needs agent' };
    return { ok: true, notes: an.notesFor(a.agent, { kind: a.kind }) };
  },
  agents: () => ({ ok: true, agents: an.allAgents() }),
};

module.exports = {
  name: 'agent_notes',
  description:
    'A real, editable log of learned constraints and workarounds, per agent — distinct from agent_capability ' +
    '(which only ever measures passively from other tables). Use this to write down something you actually ' +
    'discovered mid-task that would otherwise evaporate at session end: a real gotcha in how a function behaves, ' +
    'a token-limit workaround that worked, a persistence quirk. "note" (needs agent, body; optional kind: ' +
    '"token-limit"/"workaround"/"constraint"/"persistence"/"other", source, relatesTo, supersedes — a prior ' +
    'note\'s uuid this corrects) writes one. "list" (needs agent, optional kind) reads every real note for that ' +
    'agent, newest first, with superseded notes flagged rather than hidden. "agents" lists every agent with at ' +
    'least one real note. Write specific, real lessons — not vague summaries; a note only earns its keep if a ' +
    'future reader can act on it directly.',
  parameters: {
    type: 'object',
    properties: {
      action:     { type: 'string', enum: Object.keys(ACTIONS) },
      agent:      { type: 'string', description: 'which agent this note is about' },
      body:       { type: 'string', description: 'for "note" — the real, specific lesson' },
      kind:       { type: 'string', enum: ['token-limit', 'workaround', 'constraint', 'persistence', 'other'] },
      source:     { type: 'string', description: 'who/what discovered this' },
      relatesTo:  { type: 'string', description: 'a real file/component/tool this concerns' },
      supersedes: { type: 'string', description: 'uuid of an older note this one corrects' },
    },
    required: ['action'],
  },
  execute: async (a) => {
    const fn = ACTIONS[a.action];
    if (!fn) return { error: `unknown action "${a.action}" — try: ${Object.keys(ACTIONS).join(', ')}` };
    return fn(a);
  },
};
