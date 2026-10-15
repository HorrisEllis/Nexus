'use strict';
/**
 * clear-glass/src/cookies/session-hub.js — ONE cookie store per provider.
 * comp_id: nexus.clear-glass.src.cookies.session-hub
 *
 * James (2026-10-13): "providers, accounts, and agent mesh all need to be using the same cookies. none of them are separate
 * but I'm signed in and the provider when opened is signed out. sync them together. migrate and consolidate them."
 * (His normal tab: signed in as himself. The provider tab: "Log in". The mesh tab: a third, empty jar.)
 *
 * Before this, one provider's sign-in lived in up to four places that only ever copied into each other at set moments:
 *   default session           every normal tab and agent window page (the <webview> in browser.html)
 *   persist:ncp-<provider>    the provider tab (ProviderHost)
 *   persist:mesh-<p>-<acct>   the Accounts sign-in window and the agent mesh's background tab
 *   persist:agent-<id>        the shell of an agent window (its page is in the default session)
 *
 * Now:
 *   CANONICAL   persist:ncp-<provider> is THE provider session. The Accounts sign-in window, the provider tab and the
 *               agent mesh tab all run in it (partition(provider)). Which ACCOUNT it is signed in as is account-switch's
 *               job (the encrypted vault keeps every account's cookies; use()/sync() swap the identity in).
 *   MIRRORED    the default session (a normal tab) is kept equal to it, live, in both directions, for the provider's own
 *               site(s): sign in in either and the other is signed in; sign out in either and the other is signed out.
 *   MIGRATED    consolidate(provider) takes the sign-in a person really has (provider session, else normal tab, else the
 *               old mesh partitions) into the canonical session once, and saves any other sign-in it finds to the vault
 *               first — nothing is lost, nothing is merged across identities.
 */
const CookieVault = require('./vault');

const MODULE_ID = 'clear-glass.session-hub';
const VERSION = '1.0.0';
const T_MIG = 'session_hub_migration';

// What counts as "signed in": a session credential, not a csrf token / callback url / consent flag that a signed-OUT
// page also sets (chatgpt.com sets __Host-next-auth.csrf-token and __Secure-next-auth.callback-url when signed out, which
// the old /auth|token|__Secure/ test read as a sign-in).
const AUTH_COOKIE_RE = /session[-_]?(token|key|id)?|^sid$|^s?sid$|SAPISID|__Secure-[13]PSID|^SSID$|auth[-_]?token|access[-_]?token|refresh[-_]?token|jwt|^sso(-rw)?$|_puid/i;
const NOT_AUTH_RE = /csrf|callback|state$|nonce|consent|test|^_ga|analytics|theme|locale|oai-did|device|tracking/i;
function isAuthCookie(c) { const n = String((c && c.name) || ''); return AUTH_COOKIE_RE.test(n) && !NOT_AUTH_RE.test(n); }

function siteOf(domain) {
  const h = String(domain || '').replace(/^\./, '').toLowerCase();
  const p = h.split('.');
  if (p.length <= 2) return h || '*';
  return (p[p.length - 2].length <= 3 && p[p.length - 1].length === 2 ? p.slice(-3) : p.slice(-2)).join('.');
}
const canonicalPartition = (provider) => `persist:ncp-${provider}`;
const legacyMeshPartition = (provider, accountId) => `persist:mesh-${provider}-${accountId}`;
const idOf = (c) => `${String(c.domain || '').toLowerCase()}|${c.path || '/'}|${c.name}`;
const urlOf = (c) => `${c.secure === false ? 'http' : 'https'}://${String(c.domain || 'localhost').replace(/^\./, '')}${c.path || '/'}`;

class SessionHub {
  /**
   * @param {object}   d
   * @param {object}   d.session      electron `session` (defaultSession, fromPartition)
   * @param {Function} d.defFor       (provider) => { url, hosts?, loginUrl? } | null
   * @param {Function} d.providers    () => [provider ids] to keep consolidated
   * @param {Function} [d.accounts]   () => [{ id, agentKeys }] (finds the old mesh partitions)
   * @param {object}   [d.vault]      CookieVault (snapshots what is not taken; the migration marker lives in its JAA store)
   * @param {Function} [d.dispatchAccount] (provider) => accountId | null
   * @param {Function} [d.onSettled]  (provider) => void — after the provider session's cookies stop changing
   * @param {Function} [d.cleanUA]    (ses) => void — the Chrome-not-Electron user agent, applied once per session
   */
  constructor({ session, defFor, providers, accounts = () => [], vault = null, dispatchAccount = () => null, onSettled = null, cleanUA = null, log = () => {}, debounceMs = 1500 } = {}) {
    if (!session || typeof defFor !== 'function' || typeof providers !== 'function') throw new Error('SessionHub needs session, defFor and providers');
    Object.assign(this, { session, defFor, providers, accounts, vault, dispatchAccount, onSettled, cleanUA, log, debounceMs });
    this._attached = new Map();   // provider -> { off() }
    this._echo = new Map();       // key -> expiry — a write the hub made, so its own 'changed' event is not mirrored back
    this._timers = new Map();
    this._held = new Map();       // provider -> count of identity switches in flight (see hold())
    this._quiet = new Map();      // provider -> count of sign-in windows open (see quiet())
    this._uaDone = new WeakSet();
  }

  partition(provider) { return canonicalPartition(provider); }
  sessionFor(provider) {
    const ses = this.session.fromPartition(canonicalPartition(provider));
    if (this.cleanUA && !this._uaDone.has(ses)) { this._uaDone.add(ses); try { this.cleanUA(ses); } catch (_) {} }
    return ses;
  }
  normalSession() { return this.session.defaultSession || null; }

  sitesFor(provider) {
    const out = new Set(); const d = this.defFor(provider) || {};
    for (const u of [d.url, d.loginUrl, ...(d.hosts || []).map(h => `https://${h}`)]) { try { out.add(siteOf(new URL(u).hostname)); } catch (_) {} }
    return out;
  }
  _mine(provider, c) { return this.sitesFor(provider).has(siteOf(c.domain)); }
  async _read(ses, provider) { try { return (await ses.cookies.get({})).filter(c => this._mine(provider, c)); } catch (_) { return []; } }
  _legacyIds(provider) {
    const ids = new Set(['default']);
    for (const a of (this.accounts() || [])) if ((a.agentKeys || []).includes(provider)) ids.add(a.id);
    return [...ids];
  }

  // ── live mirror: provider session <-> normal tabs ────────────────────────────────────────────────────────────────
  _mark(side, c, removed) { this._echo.set(`${side}|${idOf(c)}|${removed ? '-' : '+'}|${removed ? '' : c.value}`, Date.now() + 4000); }
  _isEcho(side, c, removed) {
    const k = `${side}|${idOf(c)}|${removed ? '-' : '+'}|${removed ? '' : c.value}`;
    const now = Date.now();
    for (const [key, t] of this._echo) if (t < now) this._echo.delete(key);
    if (this._echo.has(k)) { this._echo.delete(k); return true; }
    return false;
  }
  async _apply(ses, side, c, removed) {
    this._mark(side, c, removed);
    try { if (removed) await ses.cookies.remove(urlOf(c), c.name); else await ses.cookies.set(CookieVault.cookieSetArgs(c)); return true; }
    catch (_) { this._echo.delete(`${side}|${idOf(c)}|${removed ? '-' : '+'}|${removed ? '' : c.value}`); return false; }
  }
  _listen(provider, ses, side, other, otherSide) {
    const h = (_e, cookie, cause, removed) => {
      try {
        if (!cookie || !this._mine(provider, cookie)) return;
        if (removed && (cause === 'overwrite' || /^expired/.test(cause))) return;   // a rewrite, or each jar's own expiry
        if (this._isEcho(side, cookie, removed)) return;
        // an account switch is rewriting the provider session: that is a change of WHO it is signed in as, not a sign-in or
        // sign-out the normal tabs should follow (guardian routes jobs to other accounts all day)
        if (side === 'canonical' && this._held.get(provider)) return;
        // §0.60.51 — a sign-in window is open in the provider session: Google's sign-in sets a test cookie on one page and reads it
        // back on the next, so nothing else may write into that jar meanwhile. A normal tab's Google cookies rotate constantly (NID,
        // SIDCC) and were being copied INTO the jar mid sign-in ("We've detected a problem with your cookie settings").
        if (side === 'normal' && this._quiet.get(provider)) return;
        if (side === 'canonical') this._settle(provider);
        this._apply(other, otherSide, cookie, removed).then(ok => { if (ok && otherSide === 'canonical') this._settle(provider); });
      } catch (_) {}
    };
    ses.cookies.on('changed', h);
    return () => { try { ses.cookies.removeListener('changed', h); } catch (_) {} };
  }
  /** hold(provider) -> release() — the provider session's cookies are being swapped for another account's; nothing is mirrored out of it until released (a moment after, for the events still on their way) */
  hold(provider) {
    this._held.set(provider, (this._held.get(provider) || 0) + 1);
    let done = false;
    return () => { if (done) return; done = true; setTimeout(() => { const n = (this._held.get(provider) || 1) - 1; if (n > 0) this._held.set(provider, n); else this._held.delete(provider); }, 1500).unref?.(); };
  }
  /** quiet(provider) -> release() — a sign-in window is open in the provider session; cookies from the normal tabs are not copied into it until released */
  quiet(provider) {
    this._quiet.set(provider, (this._quiet.get(provider) || 0) + 1);
    let done = false;
    return () => { if (done) return; done = true; const n = (this._quiet.get(provider) || 1) - 1; if (n > 0) this._quiet.set(provider, n); else this._quiet.delete(provider); };
  }
  _settle(provider) {
    if (!this.onSettled) return;
    clearTimeout(this._timers.get(provider));
    this._timers.set(provider, setTimeout(() => { this._timers.delete(provider); try { Promise.resolve(this.onSettled(provider)).catch(() => {}); } catch (_) {} }, this.debounceMs));
  }
  /** attach(provider) — start mirroring; idempotent */
  attach(provider) {
    if (this._attached.has(provider)) return false;
    const canon = this.sessionFor(provider), norm = this.normalSession();
    if (!norm || typeof canon.cookies.on !== 'function') { this._attached.set(provider, { off() {} }); return false; }
    const offs = [this._listen(provider, canon, 'canonical', norm, 'normal'), this._listen(provider, norm, 'normal', canon, 'canonical')];
    this._attached.set(provider, { off: () => offs.forEach(f => f()) });
    return true;
  }
  attachAll() { let n = 0; for (const p of this.providers()) { try { if (this.attach(p)) n++; } catch (e) { this.log(`[session-hub] ${p}: not attached — ${e.message}`); } } return n; }
  detachAll() { for (const [, a] of this._attached) a.off(); this._attached.clear(); }

  // ── migration ────────────────────────────────────────────────────────────────────────────────────────────────────
  _marker(provider) { try { return this.vault._jaa().get(T_MIG, { id: provider }) || null; } catch (_) { return null; } }
  _setMarker(provider, rec) { try { const st = this.vault._jaa(); st.upsert(T_MIG, { id: provider, ...rec, at: Date.now() }); st.flushAll(); } catch (_) {} }

  /**
   * consolidate(provider, { force }) — the sign-in a person really has goes into the canonical session (and so into the
   * mirrored normal tab). Order of who is believed: the provider session, the normal tab, the dispatch account's old mesh
   * partition, the other accounts' old mesh partitions — the first with a real session credential wins, WHOLE (cookies of
   * two identities are never mixed). Every other source that holds a sign-in is saved to the vault as a snapshot first.
   * Runs once per provider (a marker in the vault); { force: true } runs it again. Old partitions are left untouched.
   * -> { ok, provider, action: 'consolidated'|'unchanged'|'nothing'|'already-done', from?, cookies?, saved? }
   */
  async consolidate(provider, { force = false } = {}) {
    if (!force && this._marker(provider)) return { ok: true, provider, action: 'already-done' };
    const canon = this.sessionFor(provider), norm = this.normalSession();
    const dispatch = (() => { try { return this.dispatchAccount(provider); } catch (_) { return null; } })();
    const sources = [{ key: 'provider', ses: canon, side: 'canonical' }];
    if (norm) sources.push({ key: 'normal', ses: norm, side: 'normal' });
    const legacy = this._legacyIds(provider).sort((a, b) => (a === dispatch ? -1 : b === dispatch ? 1 : 0));
    for (const id of legacy) { try { sources.push({ key: `mesh:${id}`, ses: this.session.fromPartition(legacyMeshPartition(provider, id)), side: null }); } catch (_) {} }

    const read = [];
    for (const s of sources) { const cookies = await this._read(s.ses, provider); read.push({ ...s, cookies, auth: cookies.filter(isAuthCookie).length }); }
    const winner = read.find(r => r.auth > 0);
    if (!winner) { this._setMarker(provider, { action: 'nothing', from: null }); return { ok: true, provider, action: 'nothing', why: `no ${provider} sign-in in any session` }; }

    // sign-ins that are not taken are kept, never dropped
    let saved = 0;
    if (this.vault) for (const r of read) {
      if (r === winner || r.auth === 0) continue;
      try { await this.vault.snapshot(provider, r.ses, `before consolidation — ${r.key}`); saved++; } catch (_) {}
    }
    // the winner's cookies, whole, into the provider session and the normal tab
    let wrote = 0;
    for (const target of [{ ses: canon, side: 'canonical' }, norm && { ses: norm, side: 'normal' }].filter(Boolean)) {
      if (target.ses === winner.ses) continue;
      const have = new Map((await this._read(target.ses, provider)).map(c => [idOf(c), c.value]));
      for (const c of winner.cookies) { if (have.get(idOf(c)) === c.value) continue; if (await this._apply(target.ses, target.side, c, false)) wrote++; }
    }
    this._setMarker(provider, { action: wrote ? 'consolidated' : 'unchanged', from: winner.key, cookies: winner.cookies.length, saved });
    this.log(`[session-hub] ${provider} — one sign-in: taken from ${winner.key} (${winner.cookies.length} cookie(s), ${wrote} written${saved ? `, ${saved} other sign-in(s) saved to the vault` : ''})`);
    this._settle(provider);
    return { ok: true, provider, action: wrote ? 'consolidated' : 'unchanged', from: winner.key, cookies: winner.cookies.length, written: wrote, saved };
  }
  async consolidateAll(opts = {}) { const out = []; for (const p of this.providers()) { try { out.push(await this.consolidate(p, opts)); } catch (e) { out.push({ ok: false, provider: p, error: e.message }); } } return out; }

  /** clearNormal(provider) — the provider's own site(s)' cookies removed from the normal tabs' session (a sign-out must reach it) */
  async clearNormal(provider) {
    const norm = this.normalSession(); if (!norm) return 0;
    let n = 0;
    for (const c of await this._read(norm, provider)) { this._mark('normal', c, true); try { await norm.cookies.remove(urlOf(c), c.name); n++; } catch (_) {} }
    return n;
  }

  /** status(provider) — what each place holds right now (counts only): the provider session, the normal tab */
  async status(provider) {
    const row = async (ses) => { const c = await this._read(ses, provider); return { cookies: c.length, signedIn: c.some(isAuthCookie) }; };
    const norm = this.normalSession();
    return { provider, partition: canonicalPartition(provider), provider_session: await row(this.sessionFor(provider)), normal_tab: norm ? await row(norm) : null,
      mirrored: this._attached.has(provider), migrated: this._marker(provider) };
  }
}

module.exports = { MODULE_ID, VERSION, SessionHub, canonicalPartition, legacyMeshPartition, isAuthCookie, AUTH_COOKIE_RE, siteOf };
