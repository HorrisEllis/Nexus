'use strict';
/**
 * lib/account-identity-index.js — a real, stable UUID per (agent, account),
 * not per session. James: "having a uuid for accounts in the cookie
 * vault, that way it be can used for retry and fallback routing. then an
 * index of each agent and accounts... each id is connected to an account
 * name using the email."
 *
 * Real, previously-missing distinction found while building this: guardian's
 * existing /api/account-identity endpoint generates a UUID per SESSION —
 * the same real account gets a different, unrelated UUID on every new chat,
 * which defeats exactly the retry/fallback recognition James is asking for.
 * This is the stable half that was missing.
 * comp_id: nexus.lib.account-identity-index
 */
const path = require('path');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..');
const TABLE = 'account_identity_index';

function _jaa() {
  try { return require(path.join(ROOT, 'cortex/memory/jaa-db.js')).jaaDB; }
  catch (_) { return null; }
}

/**
 * resolve(agentId, account) — the real, stable UUID for this (agent,
 * account) pair. Creates one, once, the first time this exact pair is
 * seen; every later call for the same pair returns the same UUID.
 * §1.2 — a missing agentId or account is a real failure, not a guess.
 */
function resolve(agentId, account) {
  if (!agentId || !account) return { ok: false, reason: 'agentId and account are both required' };
  const jaa = _jaa();
  if (!jaa) return { ok: false, reason: 'cortex unavailable' };

  const existing = jaa.get(TABLE, { agentId, account });
  if (existing) return { ok: true, uuid: existing.uuid, agentId, account, isNew: false };

  const uuid = crypto.randomUUID();
  jaa.insert(TABLE, { uuid, agentId, account, createdAt: Date.now(), lastSeenAt: Date.now() });
  return { ok: true, uuid, agentId, account, isNew: true };
}

/** touch(uuid) — real, cheap "still in use" marker, for retry/fallback ordering (most-recently-used first). */
function touch(uuid) {
  const jaa = _jaa();
  if (!jaa) return;
  jaa.update(TABLE, { uuid }, { lastSeenAt: Date.now() });
}

/** forAgent(agentId) — every real, known account for one agent, most-recently-used first — the real "index of each agent and accounts." */
function forAgent(agentId) {
  const jaa = _jaa();
  if (!jaa) return [];
  const rows = jaa.query(TABLE, r => r.agentId === agentId, 10000) || [];
  return rows.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

module.exports = { resolve, touch, forAgent, TABLE, MODULE_ID: 'lib.account-identity-index', VERSION: '1.0.0' };
