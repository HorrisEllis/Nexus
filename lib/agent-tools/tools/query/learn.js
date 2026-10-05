'use strict';
/**
 * lib/agent-tools/tools/query/learn.js — nexus.learn.tool: learn anything, as a checklist.
 * comp_id: nexus.agent-tools.learn
 * UUID: nexus-agent-tools-learn-v1-0000-2026-1005-jamesbrooks-001
 * Version: 1.0.0
 *
 * §0.39.339 SB39. James: "im saying for anything it wants to learn. agnostic tool for context". lib/context-prereqs.js
 * learn() does the work: what the thing needs to be understood (a checklist), each item found in its source — the code
 * index, an input record, or every store Nexus keeps (context-atlas) — then in past conversations, and what is still
 * missing comes back as questions for James, never a guess. A repo agent's run context ({ repoDir, repoUuid, agentId })
 * scopes it automatically.
 */

const { toolName } = require('../../naming.js');
const P = () => require('../../../context-prereqs.js');

module.exports = {
  name: toolName('nexus', 'learn'),
  description:
    'Learn anything before you answer or act. Give what you want to learn ("about"); you get a checklist of what it takes ' +
    'to understand it — what it is, where it lives, what it connects to, what was said before (or, for code: the code, ' +
    'what it uses, what uses it, its tests) — each item with the context found for it, from the code index, every memory ' +
    'and graph Nexus keeps, and past conversations. Anything not found comes back in "ask": questions for James — ask ' +
    'them, do not guess. domain: topic (default), code, or data (with input: a record, and needs: [{id, need, path, ask}]).',
  parameters: {
    type: 'object',
    properties: {
      about:  { type: 'string', description: 'what you want to learn — a question, a name, a feature, an error, a page' },
      domain: { type: 'string', enum: ['topic', 'code', 'data'], description: 'optional — picked from what you give when left out' },
      input:  { type: 'object', description: 'data — the record being fed into a pipeline' },
      needs:  { type: 'array', items: { type: 'object' }, description: 'data — what the record must hold: [{ id, need, path: "a.b", ask }]' },
    },
    required: ['about'],
  },
  async execute(a = {}, run = {}) {
    const ctx = (run && run.context) || {};
    if (!a.about || !String(a.about).trim()) return { ok: false, error: 'about required — what do you want to learn?' };
    try {
      const r = await P().learn({ about: String(a.about), domain: a.domain || undefined, input: a.input, needs: a.needs,
        repoDir: ctx.repoDir || null, repoUuid: ctx.repoUuid || null, agentId: ctx.agentId || null, record: true });
      return { ok: true, domain: r.domain, intent: r.intent, complete: r.complete, checklist: r.lines,
        found: r.items.filter(i => i.status !== 'missing' && i.content).map(i => ({ need: i.need, from: i.source, context: i.content })),
        ask: r.ask, ...(r.target ? { target: r.target } : {}) };
    } catch (e) { return { ok: false, error: e.message }; }
  },
};
