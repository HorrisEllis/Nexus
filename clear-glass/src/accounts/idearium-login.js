'use strict';
/**
 * src/accounts/idearium-login.js — Clear Glass signs in to Idearium for you (IA4, docs/2026-10-10-idearium-access-phasemap.spec).
 * UUID: cg-idearium-login-v1-0000-0000-000000000058
 *
 * James, 2026-10-10: "what about a app password style login in idearium from clearglass panel, then we could accounts
 * per hat/repo?"
 *
 * The app password is kept where every other password is: the PasswordVault (OS-sealed, src/security/vault-key.js),
 * under Idearium's own origin. At start Clear Glass posts it to Idearium's /api/access/login and puts the session
 * cookie it gets back into its browser session — so every panel that shows Idearium is signed in, scoped to that
 * password's repos, capabilities and hat, and nobody types it. Cookies ignore the port, so one cookie for 127.0.0.1
 * covers every Nexus page that frames or calls Idearium. No password saved → nothing is done (Idearium's default,
 * origin mode, needs none from this machine). The password itself never leaves the main process.
 */

const ORIGIN = 'http://127.0.0.1:4800';

function _cookieFrom(setCookie) {
  const first = String(setCookie || '').split(/,(?=\s*\w+=)/)[0];
  const m = /^\s*([^=;\s]+)=([^;]*)/.exec(first);
  if (!m || !m[2]) return null;
  const age = /;\s*Max-Age=(\d+)/i.exec(first);
  return { name: m[1], value: m[2], maxAge: age ? parseInt(age[1], 10) : null };
}

/**
 * signIn({ vault, cookies, fetch, origin }) → { ok, skipped? , who?, error? }
 *   vault:   { get(origin) → [{ username, password }] }   (PasswordVault)
 *   cookies: { set({ url, name, value, httpOnly, sameSite, expirationDate }) }   (electron session.cookies)
 */
async function signIn({ vault, cookies, fetch = globalThis.fetch, origin = ORIGIN } = {}) {
  let saved = [];
  try { saved = (vault && vault.get(origin)) || []; } catch (e) { return { ok: false, error: `the password vault could not be read: ${e.message}` }; }
  const entry = saved.find(e => /^nxa_/.test(String(e.password || '')));
  if (!entry) return { ok: true, skipped: true, note: `no Idearium app password saved for ${origin}` };
  let r;
  try {
    r = await fetch(`${origin}/api/access/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: entry.password }) });
  } catch (e) { return { ok: false, error: `Idearium is not answering at ${origin}: ${e.message}` }; }
  let d = null; try { d = await r.json(); } catch (_) { /* said below */ }
  if (!r.ok || !d || d.ok === false) return { ok: false, error: (d && d.error) || `Idearium refused the sign-in (${r.status})` };
  const c = _cookieFrom(r.headers && r.headers.get && r.headers.get('set-cookie'));
  if (!c) return { ok: false, error: 'Idearium signed in but sent no session cookie' };
  await cookies.set({ url: origin, name: c.name, value: c.value, httpOnly: true, sameSite: 'strict', ...(c.maxAge ? { expirationDate: Math.floor(Date.now() / 1000) + c.maxAge } : {}) });
  return { ok: true, who: d.who || null };
}

module.exports = { signIn, ORIGIN };
