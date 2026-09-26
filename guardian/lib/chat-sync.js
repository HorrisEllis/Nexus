'use strict';
/**
 * guardian/lib/chat-sync.js — DOM-based chat synchronization.
 * comp_id: nexus.guardian.chat-sync
 *
 * §BUILT 2026-09-17 — James: "why indexdb? why can't we manipulate the
 * entire dom, what if we had a cli for each agent, then we use that as
 * a way to synchronize the chats. yes do it."
 *
 * requestSync(provider) pushes GUARDIAN_SYNC_REQUEST to that provider's
 * connected tab, which reads its own live DOM (see userscript-<provider>.js's
 * _nexusGetFullChat() — real selectors, already used elsewhere in that
 * file for _nexusGetMessages(), just without the 2000-char truncation)
 * and reports the full transcript back via GUARDIAN_SYNC_RESULT. Same
 * exact round-trip shape as this module's own proven precedent,
 * dispatcher.js's _pingProvider() / GUARDIAN_PING_ACK — copied
 * deliberately, not reinvented, because that shape is already correct:
 * push, wait on a bus event scoped to a random id, timeout, and a
 * zero-clients short-circuit so a provider with no connected tab fails
 * immediately instead of waiting out the full timeout for nothing.
 *
 * §HONEST SCOPE — read-only. This never touches the composer and never
 * submits anything; a sync must not risk sending a message. And per
 * each userscript's own header note, claude/chatgpt return a real,
 * verified full transcript; gemini/deepseek/perplexity return
 * `chat.partial: true` (assistant's last response only) until those
 * three get a verified human-turn selector the same way findResponseEl()
 * already has one — not invented blind here.
 */

function createChatSync({ bus, ncp }) {
  /**
   * requestSync(provider, timeoutMs, agentId) -> Promise<{ok, chat?, reason?}>
   * chat (when ok) is whatever the userscript's _nexusGetFullChat()
   * returned: { provider, chatId, url, extractedAt, messages, partial? }.
   *
   * §FIX 2026-09-22 — James: "the cli in clearglass to stream the dom to
   * the agent tabs of the repos." This module predates TR1/TR2's agentId
   * routing (its own header quotes an earlier version of this same ask,
   * 2026-09-17) and still called ncp.push(provider, ...) — a BROADCAST to
   * every connected tab for that provider, same one shared tab every sync
   * always resolved to, exactly the class of gap TR1 closed for job
   * dispatch but never reached this file. agentId is now optional: when
   * given, uses ncp.pushTab(provider, agentId, ...) — the SAME real,
   * already-proven per-tab routing dispatcher.js uses (pushTab is keyed
   * `${provider}:${tabId}`, and TR1's _stampAgent() is what makes a
   * repo's own tab register under tabId===agentId in the first place, so
   * this is the same mechanism, not a new one). No agentId -> unchanged,
   * real broadcast behavior, so every existing caller (bare `guardian
   * sync claude`) is unaffected.
   */
  function requestSync(provider, timeoutMs = 15000, agentId = null) {
    return new Promise((resolve) => {
      const syncId = require('crypto').randomUUID();
      let settled = false;

      const onResult = (ev) => {
        if (ev?.data?.provider !== provider || ev?.data?.syncId !== syncId) return;
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        bus.off('guardian.ncp.sync_result', onResult);
        if (ev.data.error) resolve({ ok: false, reason: ev.data.error });
        else resolve({ ok: true, chat: ev.data.chat });
      };

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        bus.off('guardian.ncp.sync_result', onResult);
        resolve({ ok: false, reason: 'sync timeout' });
      }, timeoutMs);

      bus.on('guardian.ncp.sync_result', onResult);
      const sent = agentId
        ? (ncp.pushTab(provider, agentId, { type: 'GUARDIAN_SYNC_REQUEST', syncId }) ? 1 : 0)
        : ncp.push(provider, { type: 'GUARDIAN_SYNC_REQUEST', syncId });
      if (sent === 0) {
        // Same real-evidence short-circuit as _pingProvider — no client
        // received the write, no reason to wait out the timeout.
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        bus.off('guardian.ncp.sync_result', onResult);
        resolve({ ok: false, reason: agentId
          ? `sync write reached no client for tab ${agentId} — that repo has no live tab (see TR2's own real gap: nothing calls ensureAgentTab yet, so one may never have been opened)`
          : 'sync write reached 0 clients — provider not connected' });
      }
    });
  }

  return { requestSync };
}

module.exports = { createChatSync };
