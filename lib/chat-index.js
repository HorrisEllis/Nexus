'use strict';
// lib/chat-index.js — the real-time chat index James asked ClearGlass's
// download manager to become: "separated by provider, then agent, then
// url, sorted by the original timestamp."
//
// §REWRITTEN 2026-09-17 — James: "isn't there a log somewhere else." He
// was right, and it was a real, closer source than what this file
// originally read: lib/chat-logger.js's chat_log table already carries
// real message CONTENT (this file's original version, built against
// clear-glass's DOM-mutation ledger, only ever had mutation metadata —
// never actual text). Checked directly before rewriting: chat_log was
// missing chatUrl/agentId at its richer, vector-embedded write path
// (guardian/lib/ncp-handler.js's cl.log() calls) even though the exact
// same data was already sitting right there and already reaching a
// SEPARATE raw jaa.insert('chat_log', ...) two lines below — fixed at
// the source (lib/chat-logger.js + both ncp-handler.js call sites) so
// chat_log itself is now the one complete real record, rather than
// building a second index that joins two partial sources at read time.
//
// §HONEST LIMIT, stated plainly — agentId in chat_log is currently just
// `provider` (guardian has no identity deeper than provider yet; see
// copilot/lib/agent-model.js's own header for the same real limit).
// This file does not pretend otherwise; when a real per-hat or per-
// session agent identity exists, chat_log's agentId field is where it
// lands, and this index needs no change to pick it up.

function buildChatIndex({ jaa, limit = 5000 } = {}) {
  const index = {};
  if (!jaa || typeof jaa.query !== 'function') return index;

  const rows = jaa.query('chat_log', () => true, limit) || [];
  for (const row of rows) {
    const provider = row.provider || 'unknown';
    const agentId  = row.agentId || row.provider || 'unknown';
    const url      = row.chatUrl || '(no url)';

    const byProvider = index[provider] || (index[provider] = {});
    const byAgent = byProvider[agentId] || (byProvider[agentId] = {});
    (byAgent[url] = byAgent[url] || []).push({
      ts: row.ts, role: row.role, content: row.content,
      account: row.account || null, jobId: row.jobId || null,
    });
  }

  for (const provider of Object.values(index)) {
    for (const agent of Object.values(provider)) {
      for (const url of Object.keys(agent)) {
        agent[url].sort((a, b) => a.ts - b.ts);
      }
    }
  }
  return index;
}

module.exports = { buildChatIndex, MODULE_ID: 'lib.chat-index', VERSION: '0.2.0' };
