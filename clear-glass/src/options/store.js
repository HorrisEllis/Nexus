'use strict';
/**
 * src/options/store.js — Nexus Options Store
 * UUID: cg-options-store-v1-0000-0000-000000000011
 *
 * Persistent, bus-controllable settings for Clear Glass's own behavior —
 * distinct from src/api/settings.js (provider API keys/credentials).
 *
 * This is the home for "Nexus options": window behavior, defaults, and
 * (in later phases) bookmarks-bar visibility, userscript auto-attach,
 * rewind retention, etc. New option keys get added to DEFAULTS as each
 * phase lands — nothing here is a stub, every key wired here is read by
 * real code the moment it's added.
 *
 * Exposed on the bus as options.get / options.set so Cortex/copilot can
 * read and change these remotely, same as any other gate.
 */

const path = require('path');
const fs   = require('fs');
const { JaaKV } = require('../storage/jaa');
const { randomUUID } = require('crypto');
const { defaultPinnedIds } = require('../toolbar/commands');

const OPTIONS_PATH = path.join(
  process.env.APPDATA || process.env.HOME || '.', '.clear-glass', 'nexus-options.json'
);

// §BUILT 2026-09-19 — the real subset of lib/hat-forge.js's own
// VALID_BASE_AGENTS that have an external account to link at all.
// Deliberately excludes 'ollama' (a local model — no account exists)
// and 'copilot' (NEXUS itself, not an external service with its own
// login). A hardcoded literal list here, not a runtime require of
// hat-forge.js — this file has no reason to depend on that module at
// runtime, and the two sets are documented against each other so a
// real drift (hat-forge.js adding a real new provider) is at least
// visible in one grep, not silently missed.
const VALID_PROVIDERS = new Set(['claude', 'chatgpt', 'gemini', 'mistral', 'perplexity', 'deepseek']);

// §BUGFIX 2026-09-25 — James: "the ui, its not changed at all... just fix
// it." Real root cause, confirmed directly: src/main/index.js's boot path
// (§18, "Default window") opens the app's one real startup window with
// `nexusOptions.get().defaultStartUrl`, and that default has been
// 'about:blank' since before this store existed. Every UI build shipped —
// tv-shell, ui/home, all of it — has been fully real and fully reachable
// (confirmed: orchestrator's own root '/' already serves ui/tv-shell/
// index.html, the real, explicit, previously-decided homepage) but never
// the thing Clear Glass actually opens by default. Bumped to the real
// homepage. See OPTIONS_SCHEMA_VERSION below for why this alone isn't
// enough to fix an existing install.
const DEFAULT_START_URL = 'http://127.0.0.1:9000/';

// §BUGFIX 2026-09-25 — load()'s own `{...DEFAULTS, ...raw}` merge means an
// on-disk nexus-options.json with `defaultStartUrl: "about:blank"` (every
// real install so far — the constructor calls _persist() on first-ever
// boot, writing that literal value to disk) overrides this new default
// forever, silently, no matter how many times DEFAULTS changes in code.
// OPTIONS_SCHEMA_VERSION is a real, persisted one-time migration marker —
// load() upgrades defaultStartUrl exactly once for a file stamped below
// this version, then stamps it current so a person who deliberately sets
// 'about:blank' afterward (a real, valid choice) is never overwritten
// again.
const OPTIONS_SCHEMA_VERSION = 1;

const DEFAULTS = {
  // Window behavior
  hideToTrayOnClose:    true,   // close (✕) button / OS close → hide to tray instead of destroying
  defaultStartUrl:       DEFAULT_START_URL,

  // §NEW 2026-08-24 — real gap named in CLEAR-GLASS-FULL-CHROME-MAP-
  // 2026-08-23.md's §3: "no real 'change download directory' setting
  // anywhere — checked NexusOptions and main/index.js's session config
  // directly, zero matches." null means "use Electron's own default
  // downloads path" (unchanged behavior); a real path here is honored by
  // src/downloads/adapter.js's will-download handler.
  downloadDirectory: null,

  // Co-pilot pane
  autoOpenCopilotPane:   true,

  // Toolbar customization — ids of feature buttons pinned to the main
  // chrome bar. Anything not listed here lives in the command palette only.
  // §STRUCTURAL 2026-08-24 — was a hand-written array here, duplicating
  // src/toolbar/commands.js's defaultPinned flags with no link between the
  // two. Derived now so there's exactly one place that decides what's
  // pinned on a fresh install or a reset.
  pinnedToolbarButtons:  defaultPinnedIds(),

  // §NEW 2026-08-28 — TX16's real, first buildable slice (docs/clearglass-
  // agent-suite-and-cfr-loom-phasemap.spec's own TX16 entry, and TX14's own
  // honest §HONEST LIMIT naming this exact gap: "on-disk callto persistence
  // (matching UserscriptManager's own real convention)"). guardian-picker.js's
  // activeListeners is a plain in-memory Map — confirmed directly, dies on
  // page navigation and on restart. This is the persistence half of the
  // fix: a real listener config survives both. Keyed by id (same object-map
  // convention as accounts below, for the same reason — a real delete needs
  // a key that can actually disappear, which set()'s merge can never do).
  listeners: {},
  // §0.39.265 — James: "Page listeners -> needs decay." A listener that has not
  // fired or been re-armed for disableAfterDays is switched off; one left off
  // by decay until removeAfterDays is deleted. A pinned listener never decays.
  listenerDecay: { enabled: true, disableAfterDays: 14, removeAfterDays: 30 },
  // §0.39.265 — keyboard shortcuts: the user's changes on top of
  // src/shortcuts/registry.js's defaults ({ accel: action | null }).
  shortcuts: {},

  // §2026-08-28 — James: "a download listener for artifacts." Real,
  // separate registry from `listeners` above — a download isn't tied to
  // a page/DOM element the way guardian-picker.js's listeners are, so it
  // gets its own real key rather than being force-fit into the DOM
  // listener shape (which requires urlPattern+fingerprint, neither of
  // which a download has).
  downloadListeners: {},

  // §BUILT 2026-09-02 — AM8, James: "the guardian plugin maps to adding
  // a new agent to the mesh." Real, separate registry from `listeners`
  // above — an agent pairing isn't an observation-and-route rule (no
  // eventType/matchCriteria/linkTarget), it's a real, standing input+
  // output element pair that identifies a whole SITE as a dispatchable
  // agent. Keyed by id, same real convention as listeners/accounts.
  agents: {},

  // §2026-08-29 — James: "i want the guardian plugin to be for the
  // guardian system, like completely built for guardian... a tool that
  // links guardian directly to dom elements." Real gap found while
  // investigating: guardian-picker.js's "ADD TO INDEX" button has never
  // persisted anywhere — its only real attempt at persistence was
  // URCK.ingest()/registerCallto(), guarded by typeof URCK !== 'undefined'
  // — and URCK (Guardian's own real kernel, intelligence/rfr2/kernel/) is
  // never loaded into the Clear Glass webview at all (confirmed directly:
  // zero references anywhere under clear-glass/). The picker's OTHER real
  // path (window.__cg.send('dom:event', {type:'guardian.callto.added',...}))
  // already reaches ipc/bridge.js — it just never wrote anywhere. This is
  // that missing store.
  calltos: {},

  // §PHASE-1 2026-08-23 — CLEAR-GLASS-EXPANSION-PLAN-2026-08-23.md,
  // "NexusOptions: real config surface... per-provider autoStartOnBoot."
  // Real provider ids, matching src/providers/registry.js's own
  // NCP_PROVIDERS exactly (checked directly, not guessed) — a provider
  // added there later needs a matching entry here, same one-source-of-
  // truth discipline that file's own header already states for itself.
  autoStartOnBoot: {
    claude:     true,
    chatgpt:    true,
    gemini:     true,
    perplexity: true,
  },

  // §BL24 2026-08-23 — James: "also have the ability to disable opening
  // in the background on startup" (for userscripts specifically —
  // distinct from backgroundTabDefaults below, which is about tabs, not
  // script injection). Real, confirmed gap before this: autoInject() in
  // src/userscripts/manager.js fires unconditionally on every matching
  // nav.loaded event, with zero distinction between a real, person-
  // initiated navigation and a navigation that only happened because
  // autoBootAll() pre-warmed a hidden provider tab at startup. Default
  // false — matches the real, existing behavior exactly (auto-inject
  // everywhere, always) so this key changes nothing until someone
  // explicitly opts into the new, narrower behavior.
  disableUserscriptAutoInjectOnStartup: false,

  // Background tabs — real defaults for src/main/index.js's already-real
  // openBackgroundTab/closeBackgroundTab/listBackgroundTabs. No UI or
  // boot-time consumer reads this yet (that's Phase 2/5's job); the key
  // exists now so Phase 1 is a real, complete config surface rather than
  // one item short of what the plan named.
  backgroundTabDefaults: {
    openInBackground: true,   // "Move to Background Tab" context-menu default state
  },

  // §PHASE-3 2026-08-23 — CLEAR-GLASS-EXPANSION-PLAN-2026-08-23.md item 6:
  // real account entities now live here — the placeholder shape from
  // Phase 1 becomes real data as of this phase. Keyed by a stable, real
  // UUID (not the agentKey string, not the literal "default" that every
  // real call site in agent-mesh.js hardcoded before this phase), each
  // account real-linked to one or more agentKeys via its own agentKeys
  // array. See createAccount/resolveDefaultAccountForAgent below for the
  // real, safe CRUD surface — accounts are NEVER mutated through the
  // generic set() path (its one-level merge can't express a real delete
  // or a wholesale agentKeys replace without genuinely corrupting sibling
  // accounts), only through these dedicated methods.
  accounts: {},

  // §BUILT 2026-09-23 — James: "yes clearglass" — Clear Glass is the ONE
  // owner of which accounts exist and which is the default per provider
  // (docs/2026-09-19-guardian-mesh-first-dispatch-phasemap.spec's D3,
  // decided). agentKey -> account uuid. Guardian's dispatch ladder asks
  // Clear Glass (GET /accounts/resolve) instead of keeping its own list.
  // Absent key = no explicit default: resolveDefaultAccountForAgent keeps
  // its existing earliest-linked rule, so nothing changes until someone
  // picks a default.
  accountDefaults: {},
};

class NexusOptions {
  constructor() {
    this.data = { ...DEFAULTS };
  }

  async load() {
    try {
      const raw = this._kv().load();
      if (Object.keys(raw).length) {
        this.data = { ...DEFAULTS, ...raw };

        // §BUGFIX 2026-09-25 — one-time migration, real and versioned, not
        // a silent overwrite. A file with no _schemaVersion at all (every
        // real install before this fix) or one behind current gets its
        // defaultStartUrl upgraded ONLY if it's still exactly the old
        // literal default ('about:blank') — a person who already set a
        // real start URL of their own, including 'about:blank' on
        // purpose, is left alone. Stamped to current either way so this
        // never runs again for this file.
        const onDiskVersion = raw._schemaVersion || 0;
        if (onDiskVersion < OPTIONS_SCHEMA_VERSION) {
          if (raw.defaultStartUrl === 'about:blank' || raw.defaultStartUrl === undefined) {
            this.data.defaultStartUrl = DEFAULT_START_URL;
            console.log(`[NexusOptions] migrated defaultStartUrl 'about:blank' -> '${DEFAULT_START_URL}' (schema v${onDiskVersion} -> v${OPTIONS_SCHEMA_VERSION})`);
          }
          this.data._schemaVersion = OPTIONS_SCHEMA_VERSION;
          this._persist();
        }
      } else {
        this.data._schemaVersion = OPTIONS_SCHEMA_VERSION;
        this._persist();
      }
    } catch (err) {
      console.warn('[NexusOptions] Load error:', err.message);
    }
    return this.data;
  }

  async set(updates) {
    // §BUGFIX 2026-08-23 — found while adding the first real nested
    // option keys (autoStartOnBoot, backgroundTabDefaults, accounts):
    // the old shallow merge silently WIPED OUT every sibling key on a
    // partial nested update — set({autoStartOnBoot:{claude:false}})
    // deleted chatgpt/gemini/perplexity's real settings entirely, not
    // just left them unset. Confirmed directly before fixing, not
    // assumed. Real fix: merge one level deep specifically for values
    // that are plain objects (not arrays, not primitives) — arrays like
    // pinnedToolbarButtons and simple keys like hideToTrayOnClose keep
    // their original, correct "replace wholesale" behavior; only the
    // new nested-object keys get real, safe partial-update semantics.
    //
    // §NOTE — this one-level merge is exactly why accounts get their own
    // dedicated methods below instead of going through set({accounts:...}):
    // a real account delete needs a key to actually disappear, which this
    // merge can never do (it only adds/overwrites, never removes).
    const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
    const merged = { ...this.data };
    for (const [k, v] of Object.entries(updates)) {
      merged[k] = isPlainObject(v) && isPlainObject(this.data[k]) ? { ...this.data[k], ...v } : v;
    }
    this.data = merged;
    this._persist();
    return { ...this.data };
  }

  get() { return { ...this.data }; }

  // ── Accounts — §PHASE-3 2026-08-23, real CRUD, never through set() ──────
  // Real account entity: { id (stable uuid), label, agentKeys: [string],
  // createdAt, updatedAt }. One account can link more than one agentKey
  // (e.g. the same real person's Claude and ChatGPT logins); an agentKey
  // is not itself required to be linked to exactly one account, though
  // resolveDefaultAccountForAgent below picks a single, deterministic one
  // when a caller needs "the" account for a given agent and didn't say
  // which.

  // §JAA 2026-09-26 — James: "with clearglass, make it jaa. no json." Rows live in
  // the Clear Glass JAA store (src/storage/jaa.js); the old nexus-options.json is imported
  // once on first load and left on disk.
  _kv() { return this._jaa || (this._jaa = new JaaKV('cg_options', { legacyFile: OPTIONS_PATH })); }

  /** _persist() — the one real place this store writes: one JAA row per option key. */
  _persist() {
    this._kv().replaceAll(this.data);
  }

  listAccounts() {
    return Object.values(this.data.accounts || {}).sort((a, b) => a.createdAt - b.createdAt);
  }

  getAccount(id) {
    return this.data.accounts?.[id] || null;
  }

  /**
   * createAccount({label, agentKeys}) — real, stable uuid, never reused.
   * agentKeys defaults to [] — an account can exist unlinked (e.g. created
   * from an Agent Suite "add account" flow before the person picks which
   * agent it's for).
   */
  createAccount({ label, agentKeys = [] } = {}) {
    const id  = randomUUID();
    const now = Date.now();
    const account = {
      id,
      label:      label || `Account ${Object.keys(this.data.accounts || {}).length + 1}`,
      agentKeys:  [...new Set(agentKeys)],
      createdAt:  now,
      updatedAt:  now,
    };
    this.data = { ...this.data, accounts: { ...this.data.accounts, [id]: account } };
    this._persist();
    return { ...account };
  }

  /**
   * updateAccount(id, updates) — real, in-place field update (label and/or
   * a wholesale agentKeys replacement). Not a merge of agentKeys arrays —
   * an array field is always "replace wholesale," matching the same
   * convention set() already uses for arrays like pinnedToolbarButtons;
   * use linkAgent/unlinkAgent below for a real, additive/subtractive
   * single-key change instead of hand-building the whole array.
   */
  updateAccount(id, updates = {}) {
    const existing = this.data.accounts?.[id];
    if (!existing) return { error: `no account "${id}"` };
    const updated = {
      ...existing,
      ...(updates.label !== undefined ? { label: updates.label } : {}),
      ...(updates.agentKeys !== undefined ? { agentKeys: [...new Set(updates.agentKeys)] } : {}),
      updatedAt: Date.now(),
    };
    this.data = { ...this.data, accounts: { ...this.data.accounts, [id]: updated } };
    this._persist();
    return { ...updated };
  }

  /**
   * deleteAccount(id) — real removal, not a soft-delete flag. Rebuilds
   * the accounts object without this key rather than going through set()
   * (which, per the note above, cannot express a real delete).
   */
  deleteAccount(id) {
    if (!this.data.accounts?.[id]) return { error: `no account "${id}"` };
    const { [id]: _removed, ...rest } = this.data.accounts;
    // A default pointing at a deleted account would resolve to nothing real —
    // drop it with the account (§1.1), the earliest-linked rule takes over.
    const defaults = Object.fromEntries(Object.entries(this.data.accountDefaults || {}).filter(([, v]) => v !== id));
    this.data = { ...this.data, accounts: rest, accountDefaults: defaults };
    this._persist();
    return { ok: true, id };
  }

  linkAgent(id, agentKey) {
    const existing = this.data.accounts?.[id];
    if (!existing) return { error: `no account "${id}"` };
    if (existing.agentKeys.includes(agentKey)) return { ...existing };
    return this.updateAccount(id, { agentKeys: [...existing.agentKeys, agentKey] });
  }

  unlinkAgent(id, agentKey) {
    const existing = this.data.accounts?.[id];
    if (!existing) return { error: `no account "${id}"` };
    return this.updateAccount(id, { agentKeys: existing.agentKeys.filter(k => k !== agentKey) });
  }

  /**
   * resolveDefaultAccountForAgent(agentKey) — the real replacement for
   * every hardcoded accountId:'default' call site in agent-mesh.js.
   * Deterministic: if one or more real accounts are already linked to
   * this agentKey, returns the earliest-created one's id (stable choice,
   * not "whichever iterates first"). If none exist yet, auto-creates a
   * real account — labeled "Default — <agentKey>" so it's identifiable
   * later in an Agent Suite UI, not a mystery uuid — links it, and
   * returns its id. Every future call for the same agentKey gets that
   * same real uuid back, not a fresh one each time.
   */
  resolveDefaultAccountForAgent(agentKey) {
    const explicit = this.getDefaultAccount(agentKey);
    if (explicit) return explicit;
    const linked = this.listAccounts().filter(a => a.agentKeys.includes(agentKey));
    if (linked.length) return linked[0].id;
    const created = this.createAccount({ label: `Default — ${agentKey}`, agentKeys: [agentKey] });
    return created.id;
  }

  // ── Per-provider default + resolution authority — §BUILT 2026-09-23 ──────

  /** getDefaultAccount(agentKey) — the explicit default's id, only if that account still exists and is linked. */
  getDefaultAccount(agentKey) {
    const id = this.data.accountDefaults?.[agentKey];
    const acc = id && this.data.accounts?.[id];
    return acc && acc.agentKeys.includes(agentKey) ? id : null;
  }

  /** setDefaultAccount(agentKey, id) — id null clears it. Links the agent if not yet linked (a default must be usable). */
  setDefaultAccount(agentKey, id) {
    if (!agentKey) return { error: 'agentKey required' };
    if (id === null || id === undefined || id === '') {
      const { [agentKey]: _gone, ...rest } = this.data.accountDefaults || {};
      this.data = { ...this.data, accountDefaults: rest };
      this._persist();
      return { ok: true, agentKey, id: null };
    }
    const acc = this.data.accounts?.[id];
    if (!acc) return { error: `no account "${id}"` };
    if (!acc.agentKeys.includes(agentKey)) this.linkAgent(id, agentKey);
    this.data = { ...this.data, accountDefaults: { ...(this.data.accountDefaults || {}), [agentKey]: id } };
    this._persist();
    return { ok: true, agentKey, id };
  }

  /**
   * resolveAccountForDispatch(agentKey, explicit) — the authority guardian
   * asks. Explicit id must exist AND be linked to this agent (never a silent
   * substitute — same invariant guardian's own resolveAccount enforced);
   * none given -> explicit default, else earliest linked, else null (the
   * agent's default profile). Unlike resolveDefaultAccountForAgent this
   * NEVER auto-creates: a remote read must not mint accounts as a side effect.
   */
  resolveAccountForDispatch(agentKey, explicit) {
    if (explicit) {
      const acc = this.data.accounts?.[explicit];
      if (!acc || !acc.agentKeys.includes(agentKey)) return { error: `unknown_account: ${explicit} for ${agentKey}`, code: 'unknown_account' };
      return { accountId: explicit, source: 'explicit' };
    }
    const d = this.getDefaultAccount(agentKey);
    if (d) return { accountId: d, source: 'default' };
    const linked = this.listAccounts().filter(a => a.agentKeys.includes(agentKey));
    return linked.length ? { accountId: linked[0].id, source: 'earliest-linked' } : { accountId: null, source: 'none' };
  }

  /** recordSession(id, provider, meta) — login-portal capture/sign-out state, per account per provider. meta null clears. */
  recordSession(id, provider, meta) {
    const existing = this.data.accounts?.[id];
    if (!existing) return { error: `no account "${id}"` };
    const sessions = { ...(existing.sessions || {}) };
    if (meta === null) delete sessions[provider]; else sessions[provider] = { ...(sessions[provider] || {}), ...meta };
    const updated = { ...existing, sessions, updatedAt: Date.now() };
    this.data = { ...this.data, accounts: { ...this.data.accounts, [id]: updated } };
    this._persist();
    return { ...updated };
  }

  // ── Provider account identity — §BUILT 2026-09-19 ────────────────────────
  // James: "account manager with account ids for providers." agentKeys
  // above only ever tracked which agent TYPES an account is linked to
  // ('chatgpt', 'claude') — not WHICH real chatgpt.com login it is. Two
  // real NEXUS accounts could both link agentKey:'chatgpt' while being
  // two entirely different real people's chatgpt.com sessions, and
  // nothing distinguished them. This is additive, not a replacement:
  // agentKeys/resolveDefaultAccountForAgent above are completely
  // unchanged and still govern which account a fresh agent-mesh dispatch
  // defaults to; providerAccounts adds real, verifiable identity ON TOP
  // of that linkage for the providers that actually have one (VALID_
  // PROVIDERS below deliberately excludes 'ollama' — a local model, no
  // account exists — and 'copilot' — NEXUS itself, not an external
  // service with its own login).
  //
  // Real shape per account, at data.accounts[id].providerAccounts[provider]:
  //   { accountId, email, displayName, status, linkedAt, lastVerifiedAt }
  // accountId is the one REQUIRED, real field — the provider's own
  // identifier for this login (its account UUID if the provider exposes
  // one, its email otherwise). Everything else is real metadata about
  // that identity, not a second source of truth for it.

  /**
   * linkProviderAccount(id, provider, {accountId, email?, displayName?})
   * — real, validated link. Refuses loudly (§1.2), never partially
   * links, on:
   *   - an unknown account id
   *   - a provider outside VALID_PROVIDERS
   *   - a missing/empty accountId (the one field this can't be honest
   *     without)
   *   - accountId already linked to a DIFFERENT real NEXUS account for
   *     the SAME provider — the genuine invariant this whole feature
   *     exists to protect: two accounts silently sharing one real login
   *     is exactly the ambiguity "account ids for providers" was asked
   *     for to prevent, not a case to allow and sort out later.
   * Re-linking the SAME accountId to the SAME account (e.g. after a
   * re-auth) is allowed and refreshes status/lastVerifiedAt — this is
   * update-in-place, not a duplicate.
   */
  linkProviderAccount(id, provider, { accountId, email = null, displayName = null } = {}) {
    const existing = this.data.accounts?.[id];
    if (!existing) return { error: `no account "${id}"` };
    if (!VALID_PROVIDERS.has(provider)) {
      return { error: `"${provider}" is not a real provider with its own account — one of: ${[...VALID_PROVIDERS].join(', ')}` };
    }
    if (!accountId || typeof accountId !== 'string' || !accountId.trim()) {
      return { error: 'accountId is required — the provider\'s own real identifier for this login (its account id/uuid, or its email if that\'s all the provider exposes)' };
    }
    const clean = accountId.trim();
    const collision = this.findAccountByProviderAccountId(provider, clean);
    if (collision && collision.id !== id) {
      return { error: `"${clean}" on ${provider} is already linked to a different NEXUS account ("${collision.label}", ${collision.id}) — unlink it there first if this is really a re-assignment, not two people sharing one real login` };
    }
    const now = Date.now();
    const prior = existing.providerAccounts?.[provider];
    const entry = {
      accountId: clean,
      email,
      displayName,
      status: 'active',
      linkedAt: prior?.linkedAt ?? now, // real first-link time survives a re-link/refresh
      lastVerifiedAt: now,
    };
    const updated = {
      ...existing,
      providerAccounts: { ...(existing.providerAccounts || {}), [provider]: entry },
      updatedAt: now,
    };
    this.data = { ...this.data, accounts: { ...this.data.accounts, [id]: updated } };
    this._persist();
    return { ...updated };
  }

  /** unlinkProviderAccount(id, provider) — real removal of just that provider's identity; agentKeys/other providers on this account are untouched. */
  unlinkProviderAccount(id, provider) {
    const existing = this.data.accounts?.[id];
    if (!existing) return { error: `no account "${id}"` };
    if (!existing.providerAccounts?.[provider]) return { error: `account "${id}" has no linked ${provider} account` };
    const { [provider]: _removed, ...rest } = existing.providerAccounts;
    const updated = { ...existing, providerAccounts: rest, updatedAt: Date.now() };
    this.data = { ...this.data, accounts: { ...this.data.accounts, [id]: updated } };
    this._persist();
    return { ...updated };
  }

  /**
   * verifyProviderAccount(id, provider) — real, explicit "this login is
   * still good" timestamp update. Does not itself check the provider
   * (this store has no network access, by design — every ClearGlass-
   * facing check this session runs through a real gate/tool, not a
   * silent fetch from inside a data store); a caller that DID confirm
   * the session (a successful real dispatch through it, an explicit
   * re-auth) calls this to record that fact. status stays 'active' on
   * success; a caller that instead found the login dead should call
   * linkProviderAccount again on re-auth, not this.
   */
  verifyProviderAccount(id, provider) {
    const existing = this.data.accounts?.[id];
    if (!existing) return { error: `no account "${id}"` };
    const entry = existing.providerAccounts?.[provider];
    if (!entry) return { error: `account "${id}" has no linked ${provider} account` };
    const updated = {
      ...existing,
      providerAccounts: { ...existing.providerAccounts, [provider]: { ...entry, status: 'active', lastVerifiedAt: Date.now() } },
      updatedAt: Date.now(),
    };
    this.data = { ...this.data, accounts: { ...this.data.accounts, [id]: updated } };
    this._persist();
    return { ...updated };
  }

  /** getProviderAccount(id, provider) — real, single-entry read; null (not an error) when nothing is linked yet, matching getAccount's own honest-null convention. */
  getProviderAccount(id, provider) {
    return this.data.accounts?.[id]?.providerAccounts?.[provider] || null;
  }

  /**
   * findAccountByProviderAccountId(provider, accountId) — the real
   * reverse lookup linkProviderAccount's own collision check uses, also
   * useful on its own ("which of my NEXUS accounts is
   * user@example.com on chatgpt"). Returns the full account record, or
   * null — never throws on a miss, a miss is a real, valid answer.
   */
  findAccountByProviderAccountId(provider, accountId) {
    const clean = String(accountId || '').trim();
    if (!clean) return null;
    return this.listAccounts().find(a => a.providerAccounts?.[provider]?.accountId === clean) || null;
  }

  // ── Listeners — TX16 real slice, real CRUD, never through set() ─────────
  // Real listener entity: { id (stable uuid), urlPattern (glob, same
  // semantics as UserscriptManager's own @match — reused, not reinvented:
  // '*' wildcard segments, e.g. 'https://chatgpt.com/*'), fingerprint (the
  // real element fingerprint object guardian-picker.js's own fingerprint()
  // already produces — not re-derived here, just stored), eventType
  // ('mutation'|'click', matching the listener-config-modal's real options),
  // calltoId (the registered callto this listener triggers on fire —
  // reuses the existing callto system rather than inventing a second
  // action mechanism), enabled, createdAt, updatedAt }.
  //
  // §HONEST LIMIT — this store only holds and returns listener CONFIG. It
  // does not attach anything to a live DOM, does not know whether a tab
  // matching urlPattern is currently open, and does not re-run
  // fingerprint() to re-locate the element after a reload — that real
  // wiring (auto-reattach on navigation) is TX16's own next slice, named
  // honestly as not done here, same as TX14's own honest-limit convention.

  listListeners() {
    return Object.values(this.data.listeners || {}).sort((a, b) => a.createdAt - b.createdAt);
  }

  getListener(id) {
    return this.data.listeners?.[id] || null;
  }

  listAgents() {
    return Object.values(this.data.agents || {}).sort((a, b) => a.createdAt - b.createdAt);
  }

  getAgent(id) {
    return this.data.agents?.[id] || null;
  }

  /**
   * registerListener({urlPattern, fingerprint, eventType, calltoId}) —
   * real, stable uuid, never reused. enabled defaults true — a listener
   * a person just configured should fire the next time its page loads,
   * not require a second "turn it on" step.
   */
  registerListener({ urlPattern, fingerprint, eventType, calltoId, label, matchCriteria, linkTarget, pageListenerId } = {}) {
    if (!urlPattern)  return { error: 'urlPattern required' };
    if (!fingerprint) return { error: 'fingerprint required' };
    const now = Date.now();
    // §0.39.265 — the picker announces a listener every time it starts one, so
    // the same element on the same site used to be saved again on every
    // start and never went away. The same (site, element, event) is now one
    // listener: re-arming it refreshes that record instead of adding another.
    const same = Object.values(this.data.listeners || {}).find(l => l.urlPattern === urlPattern
      && (l.fingerprint && l.fingerprint.selector) === fingerprint.selector && l.eventType === (eventType || 'mutation'));
    if (same) {
      const refreshed = { ...same, label: label || same.label, matchCriteria: matchCriteria || same.matchCriteria,
        linkTarget: linkTarget || same.linkTarget, pageListenerId: pageListenerId || same.pageListenerId || null,
        lastSeenAt: now, updatedAt: now,
        // a listener switched off by decay comes back when it is armed again; one you switched off stays off
        ...(same.decayedAt ? { enabled: true, decayedAt: null } : {}) };
      this.data = { ...this.data, listeners: { ...this.data.listeners, [same.id]: refreshed } };
      this._persist();
      return { ...refreshed, reused: true };
    }
    const id  = randomUUID();
    const listener = {
      id, urlPattern, fingerprint, eventType: eventType || 'mutation',
      // §EXTENDED 2026-08-28 — James, live, in guardian-picker.js's real
      // listener-config modal: linkTarget already carries far more than a
      // bare calltoId (bridge url, external url, ledger, compartment,
      // sse-system, ollama-stream — real options already built there).
      // calltoId is kept for backward compatibility with anything already
      // written against the narrower shape; linkTarget is the real,
      // current one guardian-picker.js actually produces and this store
      // now holds it honestly instead of silently dropping everything
      // but a callto id.
      calltoId: calltoId || (linkTarget?.type === 'callto' ? linkTarget.calltoId : null) || null,
      label: label || null,
      matchCriteria: matchCriteria || null,
      linkTarget: linkTarget || null,
      pageListenerId: pageListenerId || null,
      pinned: false, fireCount: 0, lastFiredAt: null, lastSeenAt: now, decayedAt: null,
      enabled: true, createdAt: now, updatedAt: now,
    };
    this.data = { ...this.data, listeners: { ...this.data.listeners, [id]: listener } };
    this._persist();
    return { ...listener };
  }

  /**
   * registerAgent({agentName, origin, url, input, output}) — AM8's real
   * persistence: a custom agent identified purely by an input element +
   * an output element on a specific origin. Both real fingerprints
   * required — a one-sided pairing (only an input, or only an output)
   * isn't a real, dispatchable agent, it's an incomplete pairing that
   * shouldn't be silently accepted as if it were whole.
   *
   * §HONEST SCOPE — this is registration only. Actually DISPATCHING a
   * job to a custom agent (injecting text into `input`, reading a real
   * response back out of `output`, knowing when a response is "done"
   * streaming on a site this system has never seen before) is real,
   * separate, non-trivial work — not built here, not implied by this
   * method's own name. A caller reading this record back gets exactly
   * what was captured: two real element fingerprints and nothing more.
   */
  registerAgent({ agentName, origin, url, input, output } = {}) {
    if (!agentName) return { error: 'agentName required' };
    if (!origin)    return { error: 'origin required' };
    if (!input || !input.selector)   return { error: 'a real input element fingerprint is required' };
    if (!output || !output.selector) return { error: 'a real output element fingerprint is required' };
    const id  = randomUUID();
    const now = Date.now();
    const agent = {
      id, agentName, origin, url: url || null,
      input:  { selector: input.selector, xpath: input.xpath || null },
      output: { selector: output.selector, xpath: output.xpath || null },
      enabled: true, createdAt: now, updatedAt: now,
    };
    this.data = { ...this.data, agents: { ...this.data.agents, [id]: agent } };
    this._persist();
    return { ...agent };
  }

  updateListener(id, updates = {}) {
    const existing = this.data.listeners?.[id];
    if (!existing) return { error: `no listener "${id}"` };
    const updated = {
      ...existing,
      ...(updates.urlPattern !== undefined ? { urlPattern: updates.urlPattern } : {}),
      ...(updates.fingerprint !== undefined ? { fingerprint: updates.fingerprint } : {}),
      ...(updates.eventType !== undefined ? { eventType: updates.eventType } : {}),
      ...(updates.calltoId !== undefined ? { calltoId: updates.calltoId } : {}),
      ...(updates.enabled !== undefined ? { enabled: !!updates.enabled, decayedAt: null } : {}),
      ...(updates.pinned !== undefined ? { pinned: !!updates.pinned } : {}),
      ...(updates.label !== undefined ? { label: updates.label || null } : {}),
      // switching a listener on by hand restarts its decay clock
      ...(updates.enabled === true ? { lastSeenAt: Date.now() } : {}),
      updatedAt: Date.now(),
    };
    this.data = { ...this.data, listeners: { ...this.data.listeners, [id]: updated } };
    this._persist();
    return { ...updated };
  }

  /**
   * removeListener(id) — real removal, not a soft-delete flag. Same
   * rebuild-without-the-key pattern deleteAccount uses, for the same
   * reason: set()'s one-level merge can only add/overwrite, never delete.
   */
  removeListener(id) {
    if (!this.data.listeners?.[id]) return { error: `no listener "${id}"` };
    const { [id]: _removed, ...rest } = this.data.listeners;
    this.data = { ...this.data, listeners: rest };
    this._persist();
    return { ok: true, id };
  }

  /**
   * findListenersForUrl(url) — every enabled, persisted listener whose
   * urlPattern matches this url. Real caller: whatever wires TX16's next
   * slice (auto-reattach on navigation) calls this on every real page
   * load to know what to re-attach — this store doesn't call it itself.
   * Same glob semantics as UserscriptManager._matchesUrl (a '*' wildcard
   * segment, anchored full-string match) — but with one honest
   * improvement, not a silent behavior change: this version escapes real
   * regex special characters (the literal '.' in 'chatgpt.com', for one)
   * before building the pattern, where the original leaves them
   * unescaped and matching-too-loosely as a side effect. Worth fixing
   * here since a listener firing on the wrong page is a real, visible
   * mistake in a way userscript over-matching mostly isn't.
   */
  // ── Keyboard shortcuts — §0.39.265 ──────────────────────────────────────
  // Stored as overrides only; src/shortcuts/registry.js owns the defaults and
  // the rules (one key → one action, one action → one key, no bare typing keys).
  getShortcuts() {
    const R = require('../shortcuts/registry');
    return { bindings: R.effective(this.data.shortcuts || {}), overrides: { ...(this.data.shortcuts || {}) } };
  }

  setShortcut(accel, action) {
    const R = require('../shortcuts/registry');
    const r = R.bind(this.data.shortcuts || {}, accel, action);
    if (r.error) return { error: r.error };
    this.data = { ...this.data, shortcuts: r.overrides };
    this._persist();
    return { ...this.getShortcuts(), replaced: r.replaced };
  }

  removeShortcut(accel) {
    const R = require('../shortcuts/registry');
    const r = R.unbind(this.data.shortcuts || {}, accel);
    if (r.error) return { error: r.error };
    this.data = { ...this.data, shortcuts: r.overrides };
    this._persist();
    return this.getShortcuts();
  }

  resetShortcuts() {
    this.data = { ...this.data, shortcuts: {} };
    this._persist();
    return this.getShortcuts();
  }

  // ── Listener decay — §0.39.265 ───────────────────────────────────────────

  /** touchListener — a listener fired (kind 'fired') or was armed on a page ('seen'). */
  touchListener(idOrPageId, kind = 'fired') {
    const l = this.data.listeners?.[idOrPageId]
      || Object.values(this.data.listeners || {}).find(x => x.pageListenerId && x.pageListenerId === idOrPageId);
    if (!l) return null;
    const now = Date.now();
    const next = { ...l, lastSeenAt: now, ...(kind === 'fired' ? { lastFiredAt: now, fireCount: (l.fireCount || 0) + 1 } : {}) };
    this.data = { ...this.data, listeners: { ...this.data.listeners, [l.id]: next } };
    this._persist();
    return { ...next };
  }

  getListenerDecay() {
    return { ...DEFAULTS.listenerDecay, ...(this.data.listenerDecay || {}) };
  }

  setListenerDecay(patch = {}) {
    const cur = this.getListenerDecay();
    const num = (v, d) => (Number.isFinite(+v) && +v > 0 ? Math.round(+v) : d);
    const next = {
      enabled: patch.enabled !== undefined ? !!patch.enabled : cur.enabled,
      disableAfterDays: num(patch.disableAfterDays, cur.disableAfterDays),
      removeAfterDays: num(patch.removeAfterDays, cur.removeAfterDays),
    };
    if (next.removeAfterDays <= next.disableAfterDays) return { error: 'removeAfterDays must be more than disableAfterDays' };
    this.data = { ...this.data, listenerDecay: next };
    this._persist();
    return next;
  }

  /**
   * listenerStrength(l) — 1 when just used, falling linearly to 0 at the
   * point decay switches it off. `fadesAt` is when that happens (null when
   * pinned or decay is off); `removeAt` is when a decayed listener is deleted.
   */
  listenerStrength(l, now = Date.now()) {
    const cfg = this.getListenerDecay();
    const DAY = 86400000;
    const last = Math.max(l.lastFiredAt || 0, l.lastSeenAt || 0, l.createdAt || 0);
    if (l.pinned || !cfg.enabled) return { strength: 1, lastActiveAt: last, fadesAt: null, removeAt: null };
    const fadesAt = last + cfg.disableAfterDays * DAY;
    return { strength: Math.max(0, Math.min(1, (fadesAt - now) / (cfg.disableAfterDays * DAY))), lastActiveAt: last, fadesAt, removeAt: last + cfg.removeAfterDays * DAY };
  }

  /**
   * decayListeners(now) — switch off listeners idle past disableAfterDays,
   * delete ones decay switched off that stay idle past removeAfterDays.
   * A listener switched off BY HAND is never deleted by decay.
   */
  decayListeners(now = Date.now()) {
    const cfg = this.getListenerDecay();
    const out = { disabled: [], removed: [] };
    if (!cfg.enabled) return out;
    const next = { ...(this.data.listeners || {}) };
    for (const l of Object.values(next)) {
      if (l.pinned) continue;
      const { fadesAt, removeAt } = this.listenerStrength(l, now);
      if (l.decayedAt && now >= removeAt) { delete next[l.id]; out.removed.push(l.id); }
      else if (l.enabled && now >= fadesAt) { next[l.id] = { ...l, enabled: false, decayedAt: now, updatedAt: now }; out.disabled.push(l.id); }
    }
    if (out.disabled.length || out.removed.length) { this.data = { ...this.data, listeners: next }; this._persist(); }
    return out;
  }

  findListenersForUrl(url) {
    if (!url) return [];
    return this.listListeners().filter(l => {
      if (!l.enabled) return false;
      const re = new RegExp('^' + l.urlPattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
      return re.test(url);
    });
  }

  // ── Download listeners — §2026-08-28 ──────────────────────────────────────
  // Same real CRUD shape as registerListener/updateListener/removeListener
  // above, deliberately not merged with them: a download listener has no
  // urlPattern/fingerprint (nothing DOM-shaped to match), just an
  // optional filename glob and where to route a completed download.
  // agentId null/omitted means "every agent" — matching how the DOM
  // listener registry already treats a missing filter as "match
  // everything" rather than silently matching nothing.

  getDownloadListener(id) {
    return this.data.downloadListeners?.[id] || null;
  }

  listDownloadListeners() {
    return Object.values(this.data.downloadListeners || {});
  }

  registerDownloadListener({ agentId, filenamePattern, linkTarget } = {}) {
    if (!linkTarget?.type) return { error: 'linkTarget required' };
    const id  = randomUUID();
    const now = Date.now();
    const listener = {
      id, agentId: agentId || null, filenamePattern: filenamePattern || null,
      linkTarget, enabled: true, createdAt: now, updatedAt: now,
    };
    this.data = { ...this.data, downloadListeners: { ...this.data.downloadListeners, [id]: listener } };
    this._persist();
    return { ...listener };
  }

  updateDownloadListener(id, updates = {}) {
    const existing = this.data.downloadListeners?.[id];
    if (!existing) return { error: `no download listener "${id}"` };
    const updated = {
      ...existing,
      ...(updates.filenamePattern !== undefined ? { filenamePattern: updates.filenamePattern } : {}),
      ...(updates.linkTarget !== undefined ? { linkTarget: updates.linkTarget } : {}),
      ...(updates.enabled !== undefined ? { enabled: !!updates.enabled } : {}),
      updatedAt: Date.now(),
    };
    this.data = { ...this.data, downloadListeners: { ...this.data.downloadListeners, [id]: updated } };
    this._persist();
    return { ...updated };
  }

  removeDownloadListener(id) {
    if (!this.data.downloadListeners?.[id]) return { error: `no download listener "${id}"` };
    const { [id]: _removed, ...rest } = this.data.downloadListeners;
    this.data = { ...this.data, downloadListeners: rest };
    this._persist();
    return { ok: true, id };
  }

  /**
   * findDownloadListenersForDownload(agentId, filename) — every enabled
   * listener whose agentId filter matches (or is unset) and whose
   * filenamePattern glob matches (or is unset). Same escape-then-glob
   * regex construction as findListenersForUrl above, for the same real
   * reason (a literal '.' in "report.pdf" must not become "any char").
   */
  findDownloadListenersForDownload(agentId, filename) {
    return this.listDownloadListeners().filter(l => {
      if (!l.enabled) return false;
      if (l.agentId && l.agentId !== agentId) return false;
      if (!l.filenamePattern) return true;
      const re = new RegExp('^' + l.filenamePattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
      return re.test(filename || '');
    });
  }

  // ── Callto Index — §2026-08-29 ──────────────────────────────────────────
  // Real, persistent registry for guardian-picker.js's "ADD TO INDEX"
  // button. A callto is a picked DOM element registered as a callable
  // action (click/type/focus/hover/extract/screenshot) — distinct from a
  // listener (which observes and reports) — "linking Guardian directly to
  // a DOM element" in the literal, executable sense. Real id is the
  // picker's own calltoId (already a stable, generated uuid — no reason
  // to mint a second one), so re-adding the same picked element with the
  // same id updates in place rather than accumulating duplicates.

  getCallto(id) {
    return this.data.calltos?.[id] || null;
  }

  listCalltos() {
    return Object.values(this.data.calltos || {});
  }

  registerCallto(callto = {}) {
    if (!callto.id) return { error: 'callto.id required' };
    if (!callto.selector) return { error: 'callto.selector required' };
    const now = Date.now();
    const existing = this.data.calltos?.[callto.id];
    const record = {
      id: callto.id, selector: callto.selector, xpath: callto.xpath || null,
      label: callto.label || callto.selector, action: callto.action || 'click',
      url: callto.url || null, host: callto.host || null,
      enabled: true, createdAt: existing?.createdAt || now, updatedAt: now,
    };
    this.data = { ...this.data, calltos: { ...this.data.calltos, [callto.id]: record } };
    this._persist();
    return { ...record };
  }

  removeCallto(id) {
    if (!this.data.calltos?.[id]) return { error: `no callto "${id}"` };
    const { [id]: _removed, ...rest } = this.data.calltos;
    this.data = { ...this.data, calltos: rest };
    this._persist();
    return { ok: true, id };
  }

  /**
   * findCalltosForUrl(url) — same real origin-pattern matching as
   * findListenersForUrl (a callto registered on one page of a site
   * should still be findable navigating to another page of the same
   * site), applied to the callto's own stored url instead of a glob
   * pattern a person configured — converts the stored url to an origin
   * once, at lookup time, not at registration time, so this stays
   * correct even for calltos registered before this method existed.
   */
  findCalltosForUrl(url) {
    if (!url) return [];
    let targetOrigin;
    try { targetOrigin = new URL(url).origin; } catch (_) { return []; }
    return this.listCalltos().filter(c => {
      if (!c.enabled || !c.url) return false;
      try { return new URL(c.url).origin === targetOrigin; } catch (_) { return false; }
    });
  }
}

module.exports = NexusOptions;
