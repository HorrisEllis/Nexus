'use strict';
/**
 * clear-glass/src/copilot/chat-store.js — the co-pilot pane's conversation, kept.
 * comp_id: clear-glass.src.copilot.chat-store
 *
 * §0.39.278 — James: "copilot and clearglass, isnt really working. its dumb, isnt persistent, and needs to work in the
 * clearglass copilot panel." Before this the pane's conversation lived only in the DOM (renderer/browser.js addMsg):
 * a reload or restart erased it, and no backend was ever sent what was said before — the direct Ollama/Guardian paths
 * got one message and nothing else, and copilot's session lived in copilot's memory until copilot restarted (which,
 * in the 2026-09-28 log, was every few minutes).
 *
 * Sovereign (James 2026-09-29): Clear Glass owns this. Rows live in Clear Glass's own JAA store (src/storage/jaa.js,
 * table cg_copilot_chat) — not cortex's, not copilot's. Whatever answers is given the recent turns from here, so the
 * conversation survives a copilot restart, a pane reload and a Clear Glass restart alike.
 *
 * Conversations: one current conversation per pane agentId (table cg_copilot_conv). /new starts another; the old one is
 * kept (§0.3 — nothing lost). A conversation keeps its newest MAX_TURNS rows; older rows are dropped on append, so the
 * table cannot grow without bound (the memory lesson of 2026-09-28).
 */

const { randomUUID } = require('crypto');
const { store } = require('../storage/jaa');

const TABLE = 'cg_copilot_chat';
const CONV = 'cg_copilot_conv';
const MAX_TURNS = 400;          // per conversation — the pane's scrollback and the history window both fit well inside
const ROLES = new Set(['user', 'assistant']);

function _st(st) { return st || store(); }

// ts is strictly increasing in this process: two turns stored in the same millisecond keep their order when sorted
let _lastTs = 0;
function _tick() { const n = Date.now(); _lastTs = n > _lastTs ? n : _lastTs + 1; return _lastTs; }

/** current(agentId) -> conversation id for this pane (created on first use). */
function current(agentId = 'default', st) {
  const s = _st(st);
  const row = s.get(CONV, { id: String(agentId) });
  if (row && row.conversationId) return row.conversationId;
  const conversationId = _newId(agentId);
  s.insert(CONV, { id: String(agentId), conversationId, startedAt: Date.now() });
  return conversationId;
}

// time + a random tail: two conversations started in the same millisecond (/new right after the first message) differ
function _newId(agentId) { return `${agentId}:${Date.now().toString(36)}${randomUUID().slice(0, 4)}`; }

/** startNew(agentId) -> the new conversation id; the previous conversation stays stored. */
function startNew(agentId = 'default', st) {
  const s = _st(st);
  const conversationId = _newId(agentId);
  s.insert(CONV, { id: String(agentId), conversationId, startedAt: Date.now() });
  return conversationId;
}

/** append({ agentId, role, text, via, model }) -> the stored row, or null (empty text / unknown role). */
function append({ agentId = 'default', role, text, via = null, model = null, conversationId = null } = {}, st) {
  if (!ROLES.has(role)) return null;
  const t = String(text || '');
  if (!t.trim()) return null;
  const s = _st(st);
  const conv = conversationId || current(agentId, s);
  const row = { id: randomUUID(), conversationId: conv, agentId: String(agentId), role, text: t, via, model, ts: _tick() };
  s.insert(TABLE, row);
  const rows = s.all(TABLE, { conversationId: conv }, { orderBy: 'ts', order: 'DESC' });
  for (const old of rows.slice(MAX_TURNS)) s.delete(TABLE, { id: old.id });
  return row;
}

/** list({ agentId, limit }) -> oldest-first rows of the current conversation (the pane renders these on load). */
function list({ agentId = 'default', limit = 100, conversationId = null } = {}, st) {
  const s = _st(st);
  const conv = conversationId || current(agentId, s);
  const rows = s.all(TABLE, { conversationId: conv }, { orderBy: 'ts', order: 'DESC', limit: Math.max(1, Math.min(Number(limit) || 100, MAX_TURNS)) });
  return { conversationId: conv, turns: rows.reverse().map(({ role, text, ts, via, model }) => ({ role, text, ts, via, model })) };
}

/**
 * historyBlock({ agentId, turns, chars }) -> text for the prompt: the last `turns` exchanges, newest kept whole, oldest
 * dropped first when over `chars`. Empty string when there is nothing yet. Says how much was left out (§1.2).
 */
function historyBlock({ agentId = 'default', turns = 10, chars = 4000, excludeLast = false } = {}, st) {
  let rows = list({ agentId, limit: Math.max(1, turns) + (excludeLast ? 1 : 0) }, st).turns;
  if (excludeLast && rows.length) rows = rows.slice(0, -1);
  if (!rows.length) return '';
  const lines = [];
  let used = 0, dropped = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    const line = `${r.role === 'user' ? 'James' : 'You'}: ${r.text.length > 1200 ? r.text.slice(0, 1200) + ' …' : r.text}`;
    if (used + line.length > chars) { dropped = i + 1; break; }
    lines.unshift(line); used += line.length + 1;
  }
  if (!lines.length) return '';
  return `## Conversation so far (this pane, oldest first${dropped ? `; ${dropped} earlier turn(s) left out for length` : ''})\n${lines.join('\n')}`;
}

module.exports = { TABLE, CONV, MAX_TURNS, current, startNew, append, list, historyBlock };