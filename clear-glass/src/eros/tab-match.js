'use strict';
/**
 * clear-glass/src/eros/tab-match.js — which ErosmancerOS tab is this agent's page (ER1, 0.60.253).
 * comp_id: clear-glass.eros.tab-match
 * Map: docs/2026-10-25-erosmancer-hooks-phasemap.spec (ER1, ER_D2)
 *
 * James, 2026-10-25: "can you hook erosmanceros into snowflake, accounts manager, and the dom mutator."
 * Before: the wire took the tab whose url equalled the agent's, else the FIRST tab, and kept it for that agent forever — after a
 * navigation, or with two tabs open, Eros clicked and typed in the wrong page. Now the page itself says which target it is:
 * Clear Glass knows the agent's webContents (its url and title), Eros lists targets with the same two fields; a tie is broken by a
 * one-time marker stamped into that page and read back. No match is "none", said by the caller — never a guess.
 *
 *   pickTarget(targets, { url, title }) → { targetId } | { ambiguous: [targetId…] } | { none: true, why }
 *   NONCE_KEY                          → the window property the tie-break stamps
 *   resolveTab({ agentId, wc, eros, cache, profileOf, nonce }) → { tabId, url, profile, agentId } | { error }
 *     wc: the agent's webContents (getURL, getTitle, executeJavaScript); eros(method, path, body, timeoutMs) → { ok, status, body }.
 */
const NONCE_KEY = '__cgErosNonce';
const PAGE = new Set(['page', 'webview', undefined]);

function pickTarget(targets = [], { url = '', title = null } = {}) {
  const list = (Array.isArray(targets) ? targets : []).filter(t => t && t.targetId && PAGE.has(t.type));
  if (!url) return { none: true, why: 'the agent has no page loaded' };
  const sameUrl = list.filter(t => t.url === url);
  if (!sameUrl.length) return { none: true, why: `no Eros tab is on ${url}` };
  if (sameUrl.length === 1) return { targetId: sameUrl[0].targetId };
  const both = title != null ? sameUrl.filter(t => t.title === title) : [];
  if (both.length === 1) return { targetId: both[0].targetId };
  return { ambiguous: (both.length ? both : sameUrl).map(t => t.targetId) };
}

async function resolveTab({ agentId, wc, eros, cache = new Map(), profileOf = () => null, nonce = () => require('crypto').randomUUID() } = {}) {
  if (!wc || (wc.isDestroyed && wc.isDestroyed())) return { error: `no page is open for agent ${agentId}` };
  const url = wc.getURL(), title = wc.getTitle ? wc.getTitle() : null;
  const cached = cache.get(agentId);
  if (cached && cached.url === url) return cached;   // a navigation changes the url, so the page is found again
  const listed = await eros('GET', '/api/tabs', null, 5000);
  if (!listed.ok) return { error: `ErosmancerOS did not list its tabs (${listed.error || listed.status}) — is it connected (Settings → ErosmancerOS)?` };
  let pick = pickTarget((listed.body && listed.body.tabs) || [], { url, title });
  if (pick.ambiguous) {
    const n = nonce();
    try { await wc.executeJavaScript(`window.${NONCE_KEY} = ${JSON.stringify(n)}; true`, false); } catch (e) { return { error: `could not mark ${agentId}'s page to tell its ${pick.ambiguous.length} tabs apart: ${e.message}` }; }
    const ids = pick.ambiguous; pick = { none: true, why: `${ids.length} Eros tabs are on ${url} and none carried ${agentId}'s marker` };
    for (const id of ids) {
      await eros('POST', `/api/tabs/${id}/attach`, { role: 'primary' }, 8000);
      const ev = await eros('POST', '/api/evaluate', { tabId: id, expression: `window.${NONCE_KEY}` }, 5000);
      if (ev.ok && ev.body && ev.body.result === n) { pick = { targetId: id }; break; }
    }
  }
  if (!pick.targetId) return { error: `no ErosmancerOS tab for agent ${agentId}: ${pick.why}` };
  const att = await eros('POST', `/api/tabs/${pick.targetId}/attach`, { role: 'primary' }, 8000);
  if (att.status >= 400) return { error: `ErosmancerOS would not attach to ${agentId}'s page: ${(att.body && att.body.error) || att.status}` };
  const profile = profileOf(agentId) || null;
  if (profile) await eros('POST', '/api/behavior/profile', { sessionId: pick.targetId, profile }, 3000);
  const entry = { tabId: pick.targetId, url, profile, agentId };
  cache.set(agentId, entry);
  return entry;
}

module.exports = { pickTarget, resolveTab, NONCE_KEY };
