'use strict';
/**
 * clear-glass/src/accounts/for-site.js — which of his accounts are signed in to a site (BS20, 0.60.185).
 * Spec: clear-glass/spec/browser-shell.spec MOD-BSH-BOOKMARK-ACCOUNTS. comp_id: cg.accounts.for-site
 *
 * James, 2026-10-21: "bookmarks are meant to be able to link to the accoubt being used for the relative site not the providers."
 * Reading, to confirm: the bookmark dialog offers the accounts signed in to THIS site. Each Clear Glass account has its own session
 * (persist:agent-acct-<id>); cookiesFor(id, url) reads that session's cookies for the site (main passes Electron's cookies.get). An account
 * holding a sign-in-looking cookie (context-need's cookieSummary: auth/session/token names, or httpOnly+secure) is 'signed-in'; one holding
 * only other cookies has 'visited'; a provider's account counts for that provider's own site ('provider'). Names only — never a value.
 */
const { cookieSummary } = require('../copilot/context-need');

const RANK = { 'signed-in': 0, provider: 1, visited: 2, none: 3 };
const hostOf = (u) => { try { return new URL(u).hostname.toLowerCase(); } catch (_) { return ''; } };
const onHost = (host, h) => host === h || host.endsWith('.' + h);

/** forSite({ url, accounts, cookiesFor, providers, current }) → { site, accounts: [{ id, label, state, cookies, signInCookies, who, current }] } */
async function forSite({ url, accounts = [], cookiesFor, providers = [], current = null } = {}) {
  const host = hostOf(url); if (!host) return { ok: false, error: `not a site: ${url}`, accounts: [] };
  const prov = providers.filter(p => (p.hosts || [hostOf(p.url)]).some(h => h && onHost(host, h))).map(p => p.id);
  const out = [];
  for (const a of accounts) {
    let cookies = [], err = null;
    try { cookies = cookiesFor ? (await cookiesFor(a.id, url)) || [] : []; } catch (e) { err = e.message; }
    const sum = cookieSummary(cookies, url);
    const viaProvider = prov.find(k => (a.agentKeys || []).includes(k));
    const pa = viaProvider && a.providerAccounts && a.providerAccounts[viaProvider];
    const state = sum.signIn.length ? 'signed-in' : viaProvider ? 'provider' : cookies.length ? 'visited' : 'none';
    out.push({ id: a.id, label: a.label, state, cookies: sum.count, signInCookies: sum.signIn.map(c => c.name).slice(0, 5), provider: viaProvider || null,
      who: pa ? (pa.email || pa.displayName || null) : null, current: a.id === current, ...(err ? { error: err } : {}) });
  }
  out.sort((x, y) => (RANK[x.state] - RANK[y.state]) || (y.current - x.current) || String(x.label).localeCompare(String(y.label)));
  return { ok: true, site: host, providers: prov, accounts: out };
}

module.exports = { forSite, RANK };
