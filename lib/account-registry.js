'use strict';
/**
 * lib/account-registry.js — CA7 (backend) of the awareness/routing phasemap
 * UUID: nexus-account-registry-v1-0000-2026-0730-001
 *
 * §PHASEMAP CA7 (docs/copilot-awareness-routing-phasemap.spec, CHUNK D). ClearGlass
 * routes to providers (claude/chatgpt/gemini/perplexity) one connection each
 * today. This adds MULTIPLE ACCOUNT SLOTS per provider (James: "login to multiple
 * accounts in ClearGlass like an app password"), so CA5 routing can target a
 * specific account. Stored as editable cortex rows (the schema-registry /
 * routing-config pattern) — §2.2 cortex is truth, §0.3 versioned, §0.4 fluid.
 *
 * SECURITY NOTE (§honest): this stores an account LABEL + a credential REFERENCE
 * (a key name / app-password id), NOT a raw secret in plaintext where avoidable.
 * The real secret lives in the OS/Electron credential store; this registry holds
 * the reference the ClearGlass shell resolves at login. The live login + the
 * tv-ui gear are Electron-side and prove out on James's machine — this backend
 * is what they read/write.
 */

const ACCOUNTS_TABLE = 'provider_accounts';
// §FIX 2026-08-29, TX1's own real open item — James: "tx1." Confirmed
// mismatch, resolved with real evidence, not a guess: hat-forge.js's
// VALID_BASE_AGENTS allows 'ollama' and 'mistral' as real base agents,
// and 16 real, live, already-forged personality hats (lib/hat-seed-
// ollama-personalities.js, this session's own earlier work) already use
// baseAgent:'ollama' — not hypothetical, already load-bearing. Confirmed
// the real, current consequence before fixing: addAccount('ollama', ...)
// returned a hard rejection error, getAccountForRoute('ollama') silently
// returned null — 16 real hats had no possible account to route through.
// Narrowing hat-forge instead (this phase's own other named option)
// would have been a real regression against those 16 already-forged
// hats, not a neutral choice. Checked both real callers (lib/agent-
// router.js, copilot/server.js) before extending this — both already
// fully generic over any provider string, neither assumes exactly 4 or
// this specific list, so this is a safe, additive change with nothing
// else needing to move.
const PROVIDERS = ['claude', 'chatgpt', 'gemini', 'perplexity', 'ollama', 'mistral', 'deepseek'];
// §ADDED 2026-09-02 — James: "I want deepseek added as an agent." Same
// real pattern mistral already uses (added above, same file) — checked
// again before extending: both real callers (lib/agent-router.js,
// copilot/server.js) remain fully generic over any provider string.

function _jaa() { return require('../cortex/memory/jaa-db'); }

/**
 * addAccount(provider, label, opts) — register an account slot for a provider.
 * opts.credentialRef is a REFERENCE (key name / app-password id), not a raw
 * secret. Returns the stored row.
 */
function addAccount(provider, label, opts = {}) {
  if (!_isKnownProvider(provider)) return { error: `unknown provider "${provider}" — one of: ${_allKnownProviders().join(', ')}` };
  if (!label) return { error: 'an account label is required' };
  const { jaaDB, uid } = _jaa();
  const row = {
    uuid: uid ? uid() : `acct-${provider}-${Date.now()}`,
    kind: 'provider_account',
    provider,
    label,                                   // e.g. "work", "personal"
    credentialRef: opts.credentialRef || null,  // reference, NOT a raw secret
    active: opts.active !== false,
    default: !!opts.default,
    addedBy: opts.addedBy || 'user',
    status: 'registered',                    // registered | connected | failed
    ts: Date.now(),
  };
  try {
    // If this is set default, clear other defaults for the provider first.
    if (row.default) {
      for (const a of listAccounts(provider)) {
        if (a.default) jaaDB.update(ACCOUNTS_TABLE, a.uuid, { default: false });
      }
    }
    jaaDB.insert(ACCOUNTS_TABLE, row);
    return row;
  } catch (e) { return { error: `failed to persist account: ${e.message}` }; }
}

/** listAccounts(provider?) — account slots, optionally filtered by provider. */
function listAccounts(provider) {
  try {
    const { jaaDB } = _jaa();
    const rows = jaaDB.query(ACCOUNTS_TABLE, r => (provider ? r.provider === provider : true) && r.status !== 'removed', 1000) || [];
    return rows;
  } catch (_) { return []; }
}

/** getAccountForRoute(provider, accountLabel?) — pick the account CA5 routing
 *  should use: the named one, else the provider's default, else the first active. */
function getAccountForRoute(provider, accountLabel) {
  const accts = listAccounts(provider).filter(a => a.active);
  if (!accts.length) return null;
  if (accountLabel) return accts.find(a => a.label === accountLabel) || null;
  return accts.find(a => a.default) || accts[0];
}

/** setAccountStatus(uuid, status) — mark connected/failed after a login attempt
 *  (§1.2 — a failed account is observable, not swallowed). */
function setAccountStatus(uuid, status) {
  try { const { jaaDB } = _jaa(); jaaDB.update(ACCOUNTS_TABLE, uuid, { status, statusAt: Date.now() }); return { ok: true }; }
  catch (e) { return { error: e.message }; }
}

/** removeAccount(uuid) — archive an account slot (§0.3 not deleted). */
function removeAccount(uuid) {
  try { const { jaaDB } = _jaa(); jaaDB.update(ACCOUNTS_TABLE, uuid, { status: 'removed', removedAt: Date.now() }); return { ok: true }; }
  catch (e) { return { error: e.message }; }
}

// §MCO14 2026-09-13 — James: "need to be able to add a new agent to
// ClearGlass, needs a new login per provider." Real finding first: the
// LOGIN half already fully works — addAccount() above already supports
// real multiple account slots per provider (CA7, 2026-07-30), for any
// provider already in PROVIDERS. The actual gap is narrower and more
// precise than "add an agent": PROVIDERS is a hardcoded array, so a
// genuinely NEW provider name is rejected outright — there's real
// precedent for adding one (deepseek, 2026-09-02, "same real pattern
// mistral already uses") but it required a code edit each time, not a
// runtime registration.
//
// KNOWN_PROVIDERS_TABLE below is additive, not a replacement — PROVIDERS
// stays exactly as-is (every existing caller that checks it directly,
// or imports it, is unaffected); a genuinely new name is now checked
// against BOTH the hardcoded seed list and this real, persisted
// extension table.
//
// §HONEST SCOPE — this closes the LOGIN/ACCOUNT-SLOT half of "add a new
// agent" only. Registering a provider name here makes addAccount() and
// getAccountForRoute() work for it; it does NOT make that provider
// dispatchable. Every existing real provider (chatgpt/claude/gemini/
// perplexity/deepseek) required its own hand-verified userscript with
// site-specific DOM selectors (confirmed directly: userscript-
// deepseek.js's own header names externally-verified selectors,
// #chat-input/.ds-markdown/etc., checked against live community
// userscripts) plus real entries in agent-mesh.js's AGENT_REGISTRY and
// dispatcher.js's routing. That per-provider automation work is real,
// substantial, and cannot be generalized the way the login/account
// layer can — registerProvider() does not attempt it, and nothing here
// pretends a registered-but-unautomated provider can actually be
// dispatched to.
const KNOWN_PROVIDERS_TABLE = 'known_providers';

function _allKnownProviders() {
  let extra = [];
  try {
    const { jaaDB } = _jaa();
    extra = jaaDB.query(KNOWN_PROVIDERS_TABLE, r => r.status !== 'removed', 200).map(r => r.name);
  } catch (_) { /* table not yet created, or jaa unreachable — seed list still applies */ }
  return [...PROVIDERS, ...extra.filter(n => !PROVIDERS.includes(n))];
}

function _isKnownProvider(provider) {
  return _allKnownProviders().includes(provider);
}

/**
 * registerProvider(name, opts) — the real, runtime mechanism to add a
 * genuinely new agent name so addAccount()/getAccountForRoute() work for
 * it, without editing this file's hardcoded PROVIDERS array. Does NOT
 * make the provider dispatchable (see §HONEST SCOPE above) — that's
 * separate, per-provider automation work.
 */
function registerProvider(name, opts = {}) {
  if (!name || typeof name !== 'string') return { error: 'a provider name (string) is required' };
  if (_isKnownProvider(name)) return { error: `provider "${name}" is already known` };
  try {
    const { jaaDB, uid } = _jaa();
    const row = {
      uuid: uid ? uid() : `provider-${name}-${Date.now()}`,
      kind: 'known_provider',
      name,
      dispatchable: false, // §HONEST SCOPE — never fabricated true here; real automation work is separate
      note: opts.note || null,
      addedBy: opts.addedBy || 'user',
      status: 'registered',
      ts: Date.now(),
    };
    jaaDB.insert(KNOWN_PROVIDERS_TABLE, row);
    return row;
  } catch (e) { return { error: `failed to persist provider: ${e.message}` }; }
}

/** listKnownProviders() — the real, current full set (seed + registered). */
function listKnownProviders() {
  return _allKnownProviders();
}

module.exports = {
  ACCOUNTS_TABLE, PROVIDERS, KNOWN_PROVIDERS_TABLE,
  addAccount, listAccounts, getAccountForRoute, setAccountStatus, removeAccount,
  registerProvider, listKnownProviders,
  MODULE_ID: 'account-registry', VERSION: '1.1.0',
};
