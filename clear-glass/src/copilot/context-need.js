'use strict';
/**
 * clear-glass/src/copilot/context-need.js — what a message needs from the page, decided before any model is asked (BS12, 0.60.182).
 * Spec: clear-glass/spec/browser-shell.spec MOD-BSH-AUTO-CONTEXT. comp_id: cg.copilot.context-need
 *
 * James, 2026-10-21: "can you have the dom, cookies, and picks buttons migrated into copilot so he does it automatically when he needs it."
 * The pane's DOM / Picks / Cookies chips are gone; the bridge calls need() for each message (deterministic first — no model is asked):
 *   dom      the message is about the page: this page/site/form, here, read, summarise, click, fill, find, a field or button, prices…
 *   picks    there are picked elements and the message points at them (this, that, it, picked, selected, element), or they are fresh (< 2 min)
 *   cookies  the message is about signing in: logged in/out, sign in, session, account, cookie, expired, auth
 * Co-pilot's own tools (readPage, pageMap, dom.query, cookies.health) still let it fetch more when the first answer needs it.
 * cookieSummary() reports names, domain, expiry and whether a cookie looks like a sign-in; it never reads a value.
 */
const PAGE = /\b(?:this|the|current)\s+(?:page|site|website|tab|form|article|post|screen|listing|thread|profile|product|table|doc(?:ument)?)\b|\bhere\b|\bon (?:it|this|screen)\b|\b(?:read|summari[sz]e|explain|translate|scrape|extract|click|fill|type|press|scroll|find|search (?:for|on)|select|choose|tick|check|submit|apply|sign ?up|download|copy)\b|\b(?:button|field|input|link|menu|dropdown|checkbox|price|prices|plan|plans|form|section|heading|image|video)s?\b|\bwhat(?:'s| is| does)\b.*\b(?:say|show|mean|on|in)\b/i;
const POINT = /\b(?:this|that|these|those|it|them|picked|selected|highlighted)\b|\belement/i;
const SIGNIN = /\blog(?:ged)?\s?(?:in|out)\b|\bsign(?:ed)?\s?(?:in|out)\b|\bsession\b|\bcookies?\b|\baccount\b|\bauth\w*\b|\bexpired?\b|\blogin\b|\bpassword\b/i;
const AUTH_NAME = /session|auth|token|sid\b|login|jwt|access|refresh|remember|__secure|__host/i;

function need(message, { picks = [], pickedAt = 0, now = Date.now(), force = {} } = {}) {
  const m = String(message || '').trim(); const why = [];
  if (!m || m.startsWith('/')) return { dom: !!force.dom, picks: !!force.picks && picks.length > 0, cookies: !!force.cookies, why: ['a command, not a question'] };
  const dom = !!force.dom || PAGE.test(m);
  if (dom) why.push(force.dom ? 'page: kept on (/ctx dom on)' : 'page: the message is about the page');
  const fresh = pickedAt && now - pickedAt < 120000;
  const pk = picks.length > 0 && (!!force.picks || POINT.test(m) || fresh);
  if (pk) why.push(force.picks ? 'picks: kept on' : fresh && !POINT.test(m) ? 'picks: picked moments ago' : 'picks: the message points at them');
  const ck = !!force.cookies || SIGNIN.test(m);
  if (ck) why.push(force.cookies ? 'cookies: kept on' : 'cookies: the message is about signing in');
  return { dom, picks: pk, cookies: ck, why };
}

/** cookieSummary(cookies, url) — names, domain, expiry, sign-in-looking; NEVER a value. */
function cookieSummary(cookies = [], url = '') {
  const now = Date.now() / 1000;
  const list = cookies.map(c => ({ name: String(c.name || ''), domain: c.domain || '', session: !c.expirationDate, expiresIn: c.expirationDate ? Math.round((c.expirationDate - now) / 3600) : null,
    signIn: AUTH_NAME.test(String(c.name || '')) || !!c.httpOnly && !!c.secure }));
  const signIn = list.filter(c => c.signIn);
  const soonest = signIn.filter(c => c.expiresIn !== null).sort((a, b) => a.expiresIn - b.expiresIn)[0] || null;
  return { url, count: list.length, signIn: signIn.slice(0, 12).map(c => ({ name: c.name, domain: c.domain, expiresInHours: c.expiresIn, session: c.session })), soonest: soonest ? { name: soonest.name, expiresInHours: soonest.expiresIn } : null };
}

module.exports = { need, cookieSummary, PAGE, POINT, SIGNIN };
