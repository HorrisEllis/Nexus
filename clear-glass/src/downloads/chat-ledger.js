'use strict';
/**
 * clear-glass/src/downloads/chat-ledger.js — every chat, kept live, in the download manager.
 * comp_id: clear-glass.src.downloads.chat-ledger
 *
 * §0.39.278 — James: "maybe use the download manager in clearglass for the chat ledgers. also said guardian is
 * polling, but it shouldn't be, live streams the dom mutation live to the download manager, that way we don't lose
 * progress. including you expanding elements for your thoughts."
 *
 * Before this a chat reached the download manager only as a whole transcript, and only once it had SETTLED (no DOM
 * change for 5s, or every 60s at most — guardian/lib/chat-transcripts.js). A reply still streaming, a thinking block,
 * a tab closed or a crash mid-answer: none of it was kept. The job stream (GUARDIAN_CHUNK) polled the page every
 * 500ms and existed only while a guardian job held the tab.
 *
 * NOW: the page's own MutationObserver (guardian/userscript-chat-stream.js, the shared prelude every provider script
 * gets) sends what CHANGED — per turn, appended text or a whole replacement, reply and thinking apart — straight to
 * Clear Glass (POST /cli/downloads/ledger, ipc/bridge.js). This module appends each delta as ONE line to the chat's own
 * ledger file:
 *
 *   <downloads index root>/ledgers/<chatKey>.jsonl      (the COS compartment 'clearglass-downloads-index' — the same
 *                                                        root as the .response files, so COS snapshots carry both)
 *
 *   line 1        { t:'head', chatKey, provider, chatId, url, agentId, startedAt }
 *   every delta   { t:'delta', ts, seq, url?, agentId?, generating, settled, turns:[{ i, role, text | add+at,
 *                                                                                     thinking | thinkingAdd+thinkingAt }] }
 *
 * Append-only: nothing written is ever rewritten, so a crash loses at most the line being written (a torn last line
 * is skipped on replay). The current chat is the replay of its lines (readChat). An 'add' whose 'at' is not the
 * length this ledger holds is REFUSED with the lengths it does hold ({ resync }), and the page sends that turn whole:
 * a missed delta can never splice text into the wrong place.
 *
 * The versioned transcript (artifact-chat-index.recordChat, one .response per settled version) is unchanged and
 * still written by guardian; the ledger is the live layer under it. The co-pilot pane's own conversation is mirrored
 * here too (provider 'copilot', src/copilot/bridge.js _remember) so every chat is listed in one place.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MODULE_ID = 'clear-glass/downloads/chat-ledger';
const VERSION = '1.0.0';
const MAX_TEXT = 2 * 1024 * 1024;     // one turn's text or thinking; beyond this the delta is refused, not truncated
const MAX_TURNS_PER_DELTA = 200;

function _root(root) {
  if (root) return root;
  if (process.env.CG_LEDGER_ROOT) return process.env.CG_LEDGER_ROOT;
  return require('./artifact-chat-index.js').defaultRoot();
}
function chatKeyOf(provider, chatId) { return `${provider}:${chatId}`; }
function _dir(root) { return path.join(root, 'ledgers'); }
function _file(root, chatKey) {
  const safe = String(chatKey).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
  const h = crypto.createHash('sha1').update(String(chatKey)).digest('hex').slice(0, 8);
  return path.join(_dir(root), `${safe}-${h}.jsonl`);
}

// replay cache: file -> { size, chat } — re-read only when the file grew by a write this cache did not see
const _cache = new Map();

function _emptyChat(head = {}) {
  return { chatKey: head.chatKey || null, provider: head.provider || null, chatId: head.chatId || null, url: head.url || null,
    agentId: head.agentId || null, startedAt: head.startedAt || null, updatedAt: head.startedAt || null,
    generating: null, settled: null, seq: 0, deltas: 0, turns: [] };
}

function _applyOps(chat, line) {
  for (const op of line.turns || []) {
    const i = op.i;
    if (!Number.isInteger(i) || i < 0) continue;
    while (chat.turns.length <= i) chat.turns.push({ i: chat.turns.length, role: null, text: '', thinking: '', updatedAt: null });
    const t = chat.turns[i];
    if (op.role) t.role = op.role;
    if (typeof op.text === 'string') t.text = op.text;
    else if (typeof op.add === 'string') t.text = t.text.slice(0, op.at) + op.add;
    if (typeof op.thinking === 'string') t.thinking = op.thinking;
    else if (typeof op.thinkingAdd === 'string') t.thinking = t.thinking.slice(0, op.thinkingAt) + op.thinkingAdd;
    if (op.via) t.via = op.via;
    t.updatedAt = line.ts;
  }
  if (line.url) chat.url = line.url;
  if (line.agentId) chat.agentId = line.agentId;
  if (typeof line.generating === 'boolean') chat.generating = line.generating;
  if (typeof line.settled === 'boolean') chat.settled = line.settled;
  if (Number.isFinite(line.seq)) chat.seq = Math.max(chat.seq, line.seq);
  chat.updatedAt = line.ts;
  chat.deltas++;
}

function _replay(file) {
  let size = 0;
  try { size = fs.statSync(file).size; } catch (_) { return null; }
  const hit = _cache.get(file);
  if (hit && hit.size === size) return hit.chat;
  const raw = fs.readFileSync(file, 'utf8');
  let chat = null;
  for (const l of raw.split('\n')) {
    if (!l.trim()) continue;
    let line; try { line = JSON.parse(l); } catch (_) { continue; }   // a torn last line (crash mid-write) is skipped
    if (line.t === 'head') { chat = _emptyChat(line); continue; }
    if (line.t === 'delta') { if (!chat) chat = _emptyChat(); _applyOps(chat, line); }
  }
  if (chat) _cache.set(file, { size, chat });
  return chat;
}

function _append(file, obj) {
  const s = JSON.stringify(obj) + '\n';
  fs.appendFileSync(file, s);
  return Buffer.byteLength(s);
}

const ROLES = new Set(['user', 'assistant']);

/**
 * applyDelta({ provider, chatId, url, agentId, seq, generating, settled, turns }, { root })
 *   -> { ok, chatKey, turns, lengths }  |  { ok:false, error }  |  { ok:false, resync:[{ i, text, thinking }] }
 * turns: [{ i, role, text } | { i, role, add, at } — and/or thinking / thinkingAdd+thinkingAt]
 */
function applyDelta(d = {}, { root = null } = {}) {
  const provider = String(d.provider || '').trim(), chatId = String(d.chatId || '').trim();
  if (!/^[a-z][a-z0-9_-]{0,31}$/.test(provider)) return { ok: false, error: 'provider required (lowercase name)' };
  if (!chatId || chatId.length > 200 || chatId === 'home') return { ok: false, error: 'chatId required' };
  if (!Array.isArray(d.turns)) return { ok: false, error: 'turns[] required' };
  if (d.turns.length > MAX_TURNS_PER_DELTA) return { ok: false, error: `at most ${MAX_TURNS_PER_DELTA} turns per delta` };
  const r = _root(root);
  const chatKey = chatKeyOf(provider, chatId);
  fs.mkdirSync(_dir(r), { recursive: true });
  const file = _file(r, chatKey);
  let chat = _replay(file);
  let size = chat ? _cache.get(file).size : 0;
  const ts = Date.now();
  if (!chat) {
    const head = { t: 'head', chatKey, provider, chatId, url: d.url || null, agentId: d.agentId || null, startedAt: ts, v: VERSION };
    size += _append(file, head);
    chat = _emptyChat(head);
  }

  // validate every op against what this ledger holds BEFORE writing anything: all or nothing
  const ops = [], resync = [];
  for (const op of d.turns) {
    if (!op || !Number.isInteger(op.i) || op.i < 0 || op.i > chat.turns.length + MAX_TURNS_PER_DELTA) return { ok: false, error: 'each turn needs an index i' };
    if (op.role != null && !ROLES.has(op.role)) return { ok: false, error: `role must be user or assistant (turn ${op.i})` };
    const have = chat.turns[op.i] || { role: null, text: '', thinking: '' };
    const o = { i: op.i };
    if (op.role && op.role !== have.role) o.role = op.role;
    if (op.via) o.via = String(op.via).slice(0, 40);
    let bad = false;
    if (typeof op.text === 'string') { if (op.text.length > MAX_TEXT) return { ok: false, error: `turn ${op.i} text over ${MAX_TEXT}` }; if (op.text !== have.text) o.text = op.text; }
    else if (typeof op.add === 'string') { if (op.at !== have.text.length) bad = true; else if (op.add) o.add = op.add, o.at = op.at; }
    if (typeof op.thinking === 'string') { if (op.thinking !== have.thinking) o.thinking = op.thinking; }
    else if (typeof op.thinkingAdd === 'string') { if (op.thinkingAt !== have.thinking.length) bad = true; else if (op.thinkingAdd) o.thinkingAdd = op.thinkingAdd, o.thinkingAt = op.thinkingAt; }
    if (bad) { resync.push({ i: op.i, text: have.text.length, thinking: have.thinking.length }); continue; }
    if (Object.keys(o).length > 1 || !chat.turns[op.i]) ops.push(o);
  }
  if (resync.length) return { ok: false, chatKey, resync };

  const changedState = (typeof d.generating === 'boolean' && d.generating !== chat.generating) || (typeof d.settled === 'boolean' && d.settled !== chat.settled);
  const appended = !!(ops.length || changedState);
  if (appended) {
    const line = { t: 'delta', ts, seq: Number.isFinite(d.seq) ? d.seq : chat.seq + 1, turns: ops,
      ...(d.url && d.url !== chat.url ? { url: d.url } : {}), ...(d.agentId && d.agentId !== chat.agentId ? { agentId: d.agentId } : {}),
      ...(typeof d.generating === 'boolean' ? { generating: d.generating } : {}), ...(typeof d.settled === 'boolean' ? { settled: d.settled } : {}) };
    size += _append(file, line);
    _applyOps(chat, line);
  }
  _cache.set(file, { size, chat });
  return { ok: true, chatKey, file, written: ops.length, appended, turns: chat.turns.length, lengths: chat.turns.map(t => [t.text.length, t.thinking.length]), generating: chat.generating };
}

/** appendTurn({ provider, chatId, agentId, role, text, via }) — a whole turn at the end (the co-pilot pane's path). */
function appendTurn({ provider, chatId, agentId = null, role, text, via = null, url = null } = {}, opts = {}) {
  const r = _root(opts.root);
  const cur = _replay(_file(r, chatKeyOf(provider, chatId)));
  const i = cur ? cur.turns.length : 0;
  return applyDelta({ provider, chatId, agentId, url, turns: [{ i, role, text: String(text || ''), via }], generating: false, settled: true }, { root: r });
}

/**
 * codeBlocksOf(text) -> [{ lang, path, code }] — the fenced blocks of a turn: the code a conversation wrote, kept as
 * written. `path` is what follows the language on the fence line (```js src/file.js — the .inject protocol's form).
 */
function codeBlocksOf(text) {
  const out = [];
  const re = /```([\w+#.-]*)[ \t]*([^\n`]*)\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(String(text || '')))) out.push({ lang: m[1] || null, path: m[2].trim() || null, code: m[3].replace(/\n$/, '') });
  return out;
}

/** readChat({ chatKey } | { provider, chatId }, { root }) -> the chat as replayed, with every code block found, or null. */
function readChat({ chatKey, provider, chatId } = {}, { root = null } = {}) {
  const key = chatKey || chatKeyOf(provider, chatId);
  const chat = _replay(_file(_root(root), key));
  if (!chat) return null;
  const code = [];
  chat.turns.forEach(t => { if (t.role === 'assistant') for (const b of codeBlocksOf(t.text)) code.push({ turn: t.i, ...b }); });
  return { ...chat, turns: chat.turns.map(t => ({ ...t })), code };
}

/** listLedgers({ agentId, provider, limit }, { root }) -> newest first: { chatKey, provider, chatId, agentId, url, turns, bytes, updatedAt, generating } */
function listLedgers({ agentId, provider, limit = 100 } = {}, { root = null } = {}) {
  const dir = _dir(_root(root));
  let names = [];
  try { names = fs.readdirSync(dir).filter(n => n.endsWith('.jsonl')); } catch (_) { return []; }
  const out = [];
  for (const n of names) {
    const f = path.join(dir, n);
    let chat; try { chat = _replay(f); } catch (_) { continue; }
    if (!chat) continue;
    if (agentId !== undefined && agentId !== null && chat.agentId !== agentId) continue;
    if (provider && chat.provider !== provider) continue;
    out.push({ chatKey: chat.chatKey, provider: chat.provider, chatId: chat.chatId, agentId: chat.agentId, url: chat.url,
      turns: chat.turns.length, deltas: chat.deltas, bytes: _cache.get(f).size, startedAt: chat.startedAt, updatedAt: chat.updatedAt, generating: chat.generating, file: f });
  }
  return out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, Math.max(1, Math.min(Number(limit) || 100, 1000)));
}

module.exports = { MODULE_ID, VERSION, chatKeyOf, applyDelta, appendTurn, readChat, listLedgers, codeBlocksOf, _file };
