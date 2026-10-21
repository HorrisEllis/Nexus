'use strict';
/**
 * lib/chat-ledger-client.js — read Clear Glass's live chat ledgers through its own routes (0.60.192).
 * comp_id: nexus.lib.chat-ledger-client
 *
 * James, 2026-10-21: "look in clearglass download manager". His 0.39.278 idea already keeps every chat there as the page streams it
 * ("use the download manager in clearglass for the chat ledgers … live streams the dom mutation live to the download manager, that way
 * we don't lose progress"): clear-glass/src/downloads/chat-ledger.js, one append-only ledger per chat, served at
 * GET /cli/downloads/ledgers[/:chatKey] (clear-glass/src/ipc/bridge.js) on Clear Glass's IPC port.
 *
 * Clear Glass is another system, so it is read through its routes, never by requiring its code (the drawbridge). Two readers
 * needed it: lib/work-journal.js (0.60.146, which had its own copy pointed at :7701 — the SSE port, so every read failed outside the
 * tests) and guardian's reply recovery (chat-transcripts ledgerReplyFor). One client, the right port.
 */
const MODULE_ID = 'nexus.lib.chat-ledger-client';
const VERSION = '1.0.0';

/** url() — Clear Glass's IPC bridge (CLEARGL_IPC_PORT, 7702), as lib/agent-tools/tools/clear-glass/command-index.js reaches it */
function url() {
  return (process.env.CLEAR_GLASS_URL || `http://127.0.0.1:${process.env.CLEARGL_IPC_PORT || process.env.CLEAR_GLASS_PORT || 7702}`).replace(/\/$/, '');
}

async function _get(p, timeoutMs) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeoutMs); if (t.unref) t.unref();
  try { const r = await fetch(`${url()}${p}`, { signal: ac.signal }); return { status: r.status, body: r.ok ? await r.json() : null }; }
  finally { clearTimeout(t); }
}

/** chat(chatKey) → the chat's replay { chatKey, provider, chatId, url, turns:[{ i, role, text, thinking }], generating, updatedAt }
 *  | false (Clear Glass answered: no such chat) | null (Clear Glass not reachable) */
async function chat(chatKey, { timeoutMs = 2000 } = {}) {
  try {
    const r = await _get(`/cli/downloads/ledgers/${encodeURIComponent(chatKey)}`, timeoutMs);
    return r.body ? (r.body.chat || null) : (r.status === 404 ? false : null);
  } catch (_) { return null; }
}

/** list({ provider, agentId, limit }) → newest first [{ chatKey, provider, chatId, agentId, url, turns, generating, updatedAt }] | null */
async function list({ provider = null, agentId = null, limit = 5 } = {}, { timeoutMs = 2000 } = {}) {
  const q = new URLSearchParams({ limit: String(limit), ...(provider ? { provider } : {}), ...(agentId ? { agentId } : {}) });
  try { const r = await _get(`/cli/downloads/ledgers?${q}`, timeoutMs); return r.body ? (r.body.ledgers || []) : null; } catch (_) { return null; }
}

module.exports = { MODULE_ID, VERSION, url, chat, list };
