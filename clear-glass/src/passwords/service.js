'use strict';
/**
 * clear-glass/src/passwords/service.js — the one door between pages, the window and the password vault (PW1, 0.60.186).
 * Spec: clear-glass/spec/passwords.spec MOD-PW-SERVICE. comp_id: cg.passwords.service
 *
 * James, 2026-10-21: "can you have websites use the passowrd manager and hook it into the cookie vault or store what ever it uses."
 * A login a page submits is held here, in memory only (Pending), until the person answers the offer — Save, Not now, Never for this site —
 * or the cookie vault's "Save sign-in" takes it with the account (linkPending). Nothing is saved by itself (PW-003). A fill is given only
 * for an entry whose origin is exactly the asking page's (PW-002); main reads that origin from the sender's own URL, never from the page.
 */
const fs = require('fs');
const path = require('path');

const TTL = 10 * 60 * 1000;
const originOf = (u) => { try { const x = new URL(String(u)); return /^https?:$/.test(x.protocol) ? x.origin : null; } catch (_) { return null; } };

function createPasswordService({ vault, dir = null, now = () => Date.now(), ttlMs = TTL, log = () => {}, site = (o) => require('../site-settings/readers').passwordPolicy(o) } = {}) {
  // §0.60.216 SP2 — the site's own setting (offer never, autofill off, the account that signs in); null = unset, the global prefs decide
  const siteOf = (o) => { try { return site ? site(o) : null; } catch (_) { return null; } };
  if (!vault) throw new Error('passwords: a vault is required');
  const pending = new Map();   // `${wcId}|${origin}` → { origin, username, password, at }
  const file = dir ? path.join(dir, 'passwords-prefs.json') : null;
  let prefs = { offer: true, autofill: true, never: [] };
  try { if (file) prefs = { ...prefs, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch (e) { if (e.code !== 'ENOENT') log(`[passwords] prefs unreadable (${e.message}); defaults used`); }
  const savePrefs = () => { if (!file) return; try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(prefs, null, 2)); } catch (e) { log(`[passwords] prefs not saved: ${e.message}`); } };
  const sweep = () => { const t = now(); for (const [k, p] of pending) if (t - p.at > ttlMs) pending.delete(k); };
  const saved = (origin) => { try { return vault.get(origin) || []; } catch (_) { return []; } };

  /** capture(wcId, { origin, username, password }) → { offer: null | { kind: 'save'|'update', origin, username } } */
  function capture(wcId, { origin, username = '', password } = {}) {
    sweep();
    const o = originOf(origin); if (!o || !password) return { offer: null, why: !o ? 'not a web page' : 'no password' };
    if (!prefs.offer) return { offer: null, why: 'offer to save is off' };
    if (prefs.never.includes(o)) return { offer: null, why: 'never for this site' };
    if ((siteOf(o) || {}).offer === 'never') return { offer: null, why: 'never for this site (its site settings, passwords.offer)' };
    const user = String(username || '').trim();
    const same = saved(o).find(e => e.username === user);
    if (same && same.password === password) return { offer: null, why: 'already saved' };
    pending.set(`${wcId}|${o}`, { origin: o, username: user, password: String(password), at: now() });
    return { offer: { kind: same ? 'update' : 'save', origin: o, username: user } };
  }

  /** save(wcId, origin, { username, accountId }) — the person's Save: the pending login into the vault, with its account */
  function save(wcId, origin, { username, accountId = null } = {}) {
    sweep();
    const o = originOf(origin); const k = `${wcId}|${o}`; const p = pending.get(k);
    if (!p) return { ok: false, error: 'nothing to save (the login was not kept, or ten minutes passed)' };
    const user = String(username != null ? username : p.username).trim();
    if (!user) return { ok: false, error: 'a login needs a username' };
    const rec = vault.save(o, user, p.password, { accountId: accountId || (siteOf(o) || {}).accountId || null });
    pending.delete(k);
    return { ok: true, login: rec };
  }

  /** dismiss(wcId, origin, { never }) — Not now drops it; Never for this site also remembers the site */
  function dismiss(wcId, origin, { never = false } = {}) {
    const o = originOf(origin); pending.delete(`${wcId}|${o}`);
    if (never && o && !prefs.never.includes(o)) { prefs.never.push(o); savePrefs(); }
    return { ok: true, never: !!never };
  }

  /** logins(origin) → [{ id, username, accountId }] — no password */
  function logins(origin) { const o = originOf(origin); return o ? saved(o).map(e => ({ id: e.id, username: e.username, accountId: e.accountId || null })) : []; }

  /** fill(origin, id) → { username, password } only when the entry's origin is exactly origin (PW-002) */
  function fill(origin, id) {
    const o = originOf(origin); if (!o) return { ok: false, error: 'not a web page' };
    const e = saved(o).find(x => x.id === id);
    if (!e) return { ok: false, error: 'no such login for this site' };
    if (e.origin !== o) return { ok: false, error: 'that login belongs to another site' };
    return { ok: true, username: e.username, password: e.password };
  }

  /** linkPending(origins, accountId) — the cookie vault's "Save sign-in": the logins just typed on those sites saved with that account */
  function linkPending(origins = [], accountId = null) {
    sweep();
    const want = new Set([].concat(origins).map(originOf).filter(Boolean));
    const hosts = [...want].map(o => new URL(o).hostname);
    const out = [];
    for (const [k, p] of pending) {
      const h = new URL(p.origin).hostname;
      if (!want.has(p.origin) && !hosts.some(x => h === x || h.endsWith('.' + x) || x.endsWith('.' + h))) continue;
      if (!p.username) continue;
      out.push(vault.save(p.origin, p.username, p.password, { accountId }));
      pending.delete(k);
    }
    return { ok: true, saved: out };
  }

  function setPref(k, v) {
    if (k === 'offer' || k === 'autofill') prefs[k] = !!v;
    else if (k === 'never-remove') prefs.never = prefs.never.filter(o => o !== v);
    else return { ok: false, error: `no setting '${k}'` };
    savePrefs(); return { ok: true, prefs: { ...prefs } };
  }

  /** autofillLogin(origin) → the one login to fill without asking, or null: the site's autofill and the global pref both on; the
   *  site's account picks among several (SP2); otherwise only a lone login is filled, as before */
  function autofillLogin(origin) {
    const o = originOf(origin); if (!o || !prefs.autofill) return null;
    const st = siteOf(o); if (st && st.autofill === false) return null;
    const list = saved(o);
    if (st && st.accountId) { const mine = list.filter(e => e.accountId === st.accountId); if (mine.length === 1) return { id: mine[0].id, username: mine[0].username }; }
    return list.length === 1 ? { id: list[0].id, username: list[0].username } : null;
  }

  return { capture, save, autofillLogin, dismiss, logins, fill, linkPending, setPref, prefs: () => ({ ...prefs, never: [...prefs.never] }), pendingCount: () => (sweep(), pending.size), originOf };
}

let _one = null;
function service(opts) { if (opts) _one = createPasswordService(opts); return _one; }

module.exports = { createPasswordService, service, originOf, TTL };
