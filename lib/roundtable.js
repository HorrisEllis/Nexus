'use strict';
/**
 * lib/roundtable.js — a shared thread, not independent verdicts. Every
 * member (and the user) sees the same conversation, in order.
 * comp_id: nexus.lib.roundtable
 * UUID: nexus-roundtable-v1-0000-2026-0813-001
 * Version: 1.0.0
 *
 * WHY (James, 2026-08-13): "what about a shared chat where the council
 * can all talk to each other, me included?"
 *
 * §DELIBERATELY THE OPPOSITE OF agent-council.js — convene() there is
 * independent BY DESIGN (no member sees another's answer, so a real
 * disagreement is provably real, not an echo). A roundtable is the
 * opposite need: everyone sees everything, in order, and can respond to
 * what was actually said. Both are real, both stay — this is not a
 * replacement, it's the other real thing that was asked for.
 *
 * §TURN-BASED, NOT AUTO-CHAINING — nothing here makes agents reply to
 * each other automatically forever. Each turn is an explicit call
 * (speak()) naming who is about to talk. That's a real, considered
 * choice: an unbounded auto-reply loop between agents is a genuine risk
 * (cost, runaway dispatch, no natural stopping point) that James did not
 * ask for and this doesn't build. The caller (a human, or an orchestration
 * loop with its own real stopping condition) decides who speaks next —
 * "me included" is honored structurally: the user can post at any point,
 * same as any other member, not as a special case bolted on.
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const TABLE = 'roundtable_sessions';
const MSG_TABLE = 'roundtable_messages';

function _jaa() {
  try { return require(path.join(ROOT, 'cortex/memory/jaa-db.js')).jaaDB; }
  catch (_) { return null; }
}

/** open(topic, members) — start a real, persisted shared session. */
function open(topic, members = []) {
  const jaa = _jaa();
  if (!jaa) throw new Error('roundtable: cortex unavailable — cannot persist a session that would vanish on restart');
  const id = `rt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const record = { id, topic, members: ['user', ...members], openedAt: Date.now(), closed: false };
  jaa.insert(TABLE, record);
  return record;
}

/**
 * post(roundtableId, speaker, message) — add a real message to the shared
 * thread. speaker: 'user' or any member name (agent or forged hat). Every
 * post is visible to everyone from this point forward — there is no
 * private side-channel here.
 */
function post(roundtableId, speaker, message) {
  const jaa = _jaa();
  if (!jaa) throw new Error('roundtable: cortex unavailable');
  const session = get(roundtableId);
  if (!session) throw new Error(`roundtable: no session "${roundtableId}"`);
  if (session.closed) throw new Error(`roundtable: session "${roundtableId}" is closed`);
  const msg = { id: `${roundtableId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, roundtableId, speaker, message, ts: Date.now() };
  jaa.insert(MSG_TABLE, msg);
  return msg;
}

/** thread(roundtableId) — the real, full shared conversation, in order. */
function thread(roundtableId) {
  const jaa = _jaa();
  if (!jaa) return [];
  return jaa.query(MSG_TABLE, r => r.roundtableId === roundtableId).sort((a, b) => a.ts - b.ts);
}

/** get(roundtableId) — the session record, or null. */
function get(roundtableId) {
  const jaa = _jaa();
  if (!jaa) return null;
  const rows = jaa.query(TABLE, r => r.id === roundtableId);
  return rows.length ? rows[rows.length - 1] : null;
}

/**
 * speak(roundtableId, member, opts) — invite ONE member to respond, given
 * the FULL real shared thread as context (not an isolated exchange). Their
 * real response is posted back into the same shared thread. opts.dispatch
 * (member, fullThreadAsText) => Promise<{text}> — required, same
 * separation-of-concerns as agent-council.js: this module doesn't know how
 * to reach an agent, the caller supplies real dispatch.
 */
async function speak(roundtableId, member, opts = {}) {
  if (!opts.dispatch) throw new Error('roundtable: opts.dispatch is required');
  const session = get(roundtableId);
  if (!session) throw new Error(`roundtable: no session "${roundtableId}"`);
  if (!session.members.includes(member)) throw new Error(`roundtable: "${member}" is not a member of this session — members: ${session.members.join(', ')}`);

  const msgs = thread(roundtableId);
  const transcript = [`TOPIC: ${session.topic}`, ...msgs.map(m => `${m.speaker}: ${m.message}`)].join('\n');

  const result = await opts.dispatch(member, transcript);
  return post(roundtableId, member, result.text || String(result));
}

/** close(roundtableId) — no more posts. The thread itself is never deleted. */
function close(roundtableId) {
  const jaa = _jaa();
  const session = get(roundtableId);
  if (!session) return { ok: false, reason: `no session "${roundtableId}"` };
  jaa.insert(TABLE, { ...session, closed: true, closedAt: Date.now() });
  return { ok: true };
}

module.exports = { open, post, thread, get, speak, close, MODULE_ID: 'roundtable', VERSION: '1.0.0' };
