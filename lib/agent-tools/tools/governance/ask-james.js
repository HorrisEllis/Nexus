'use strict';
/**
 * lib/agent-tools/tools/governance/ask-james.js — ask_james tool
 * UUID: nexus-tool-ask-james-v1-0000-2026-0814-jamesbrooks-001
 *
 * §WIRED 2026-08-14 — James, directly: "I want co-pilot to not give 'no'
 * for an answer. Either figures it out or asks me or uses lifeline
 * contract." Checked lifeline.js's real escalation chain first: Ollama ->
 * Guardian NCP (claude/chatgpt/gemini/perplexity), confidence-gated. That
 * chain is AI-to-AI only. Already found and mapped, three turns ago,
 * exactly this gap: AM8(d) of docs/agent-model-and-user-continuity-
 * phasemap.spec — "lifeline.js's escalation is AI-to-AI only — there is
 * no 'ask the actual person' rung on that ladder at all." Confirmed still
 * true by re-reading lifeline.js's route() directly this turn — never
 * built. This is that rung.
 *
 * Uses the shared {needs, why, whatWouldUnblock} shape AM7(e) of the
 * same phasemap already scoped for exactly this kind of honest-failure
 * report, rather than inventing a second shape — that gap said "every
 * module's honest-failure message is hand-written per call site, not a
 * shared format." This tool is the first real user of that shape.
 *
 * §HONEST SCOPE — this does not interrupt you live (no push notification
 * exists to build on here). It's a durable, checkable queue: copilot logs
 * a real blocked question with real context, you see it via "list" next
 * time you look, and "answer" lets your response flow back to whatever
 * asked. It's the escalation existing, not a new delivery channel.
 */
const TABLE = 'lifeline_human_escalations';
function _jaa() { try { return require('../../../../cortex/memory/jaa-db.js').jaaDB; } catch (_) { return null; } }

const ACTIONS = {
  ask: (a) => {
    if (!a.needs) return { error: 'ask needs "needs" — what copilot needs from James, in one sentence' };
    if (!a.why) return { error: 'ask needs "why" — why it couldn\'t figure this out itself or via the AI escalation chain first' };
    const jaa = _jaa();
    if (!jaa) return { error: 'JAA store unavailable' };
    const row = {
      uuid: jaa.uid ? jaa.uid() : `ask-${Date.now()}`,
      needs: a.needs,
      why: a.why,
      whatWouldUnblock: a.whatWouldUnblock || null,
      exhaustedLifeline: !!a.exhaustedLifeline,
      status: 'pending',
      answer: null,
      ts: Date.now(),
    };
    const jaaInsert = jaa.insert(TABLE, row);
    return { ok: true, question: jaaInsert, note: 'logged — James sees this via ask_james "list"; check back with "check" using this uuid' };
  },

  list: (a) => {
    const jaa = _jaa();
    if (!jaa) return { error: 'JAA store unavailable' };
    let rows = jaa.query(TABLE, () => true, 500) || [];
    if (!a.includeAnswered) rows = rows.filter(r => r.status === 'pending');
    return { ok: true, count: rows.length, questions: rows.sort((x, y) => y.ts - x.ts) };
  },

  // James answers via this action (or any client calling the same tool —
  // there is no separate "human-only" auth layer here, same trust model
  // as the rest of this session's tools running on localhost).
  // §BUILT 2026-08-14 — this used to just mark the escalation answered
  // and stop there. An answer from James is exactly the kind of thing
  // user-model.js exists to durably remember — wired directly into its
  // real, already-public observe() rather than leaving the answer to
  // sit unindexed in this table alone.
  answer: (a) => {
    if (!a.uuid || !a.answer) return { error: 'answer needs uuid and answer' };
    const jaa = _jaa();
    if (!jaa) return { error: 'JAA store unavailable' };
    const rows = jaa.query(TABLE, r => r.uuid === a.uuid, 1) || [];
    if (!rows.length) return { ok: false, error: `no pending question "${a.uuid}"` };
    const q = rows[0];
    const count = jaa.update(TABLE, r => r.uuid === a.uuid, { status: 'answered', answer: a.answer, answeredAt: Date.now() });
    let observed = null;
    try {
      const um = require('../../../../copilot/lib/user-model.js');
      observed = um.observe(`answered: ${q.needs} → ${a.answer}`, 'ask_james_answer', { needs: q.needs, why: q.why }, 0.9);
    } catch (e) { /* user-model unavailable — the answer is still saved on the escalation row either way */ }
    return count > 0 ? { ok: true, uuid: a.uuid, observedInUserModel: !!observed } : { ok: false, error: `no pending question "${a.uuid}"` };
  },

  check: (a) => {
    if (!a.uuid) return { error: 'check needs uuid' };
    const jaa = _jaa();
    if (!jaa) return { error: 'JAA store unavailable' };
    const row = (jaa.query(TABLE, r => r.uuid === a.uuid, 1) || [])[0];
    if (!row) return { ok: false, error: `no question "${a.uuid}"` };
    return { ok: true, status: row.status, answer: row.answer || null };
  },
};

module.exports = {
  name: 'ask_james',
  description:
    'The final rung on the escalation ladder — use this ONLY after trying to figure something out and, ' +
    'where relevant, escalating through lifeline\'s AI chain, and still being genuinely blocked. Never a ' +
    'substitute for trying first. Actions: "ask" (needs needs + why, optional whatWouldUnblock + ' +
    'exhaustedLifeline — logs a real durable question), "list" (pending questions, optional ' +
    'includeAnswered), "answer" (needs uuid + answer — James responds), "check" (needs uuid — has it been ' +
    'answered yet).',
  parameters: {
    type: 'object',
    properties: {
      action:            { type: 'string', enum: Object.keys(ACTIONS) },
      needs:             { type: 'string', description: 'for "ask" — what\'s needed, one sentence' },
      why:               { type: 'string', description: 'for "ask" — why self-resolution and the AI escalation chain weren\'t enough' },
      whatWouldUnblock:  { type: 'string', description: 'for "ask" — optional, what a good answer would look like' },
      exhaustedLifeline: { type: 'boolean', description: 'for "ask" — true if lifeline.route() was actually tried first' },
      includeAnswered:   { type: 'boolean', description: 'for "list"' },
      uuid:              { type: 'string', description: 'for "answer"/"check"' },
      answer:            { type: 'string', description: 'for "answer"' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action "${args.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(args); }
    catch (e) { return { error: `ask_james ${args.action} failed: ${e.message}` }; }
  },
};
