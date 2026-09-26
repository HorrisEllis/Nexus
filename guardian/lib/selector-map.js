'use strict';
/**
 * guardian/lib/selector-map.js — v0.39.249
 *
 * James: "i want to have the element picker, aware of the cleardriver and
 * userscripts, usermesh... could copilot potentially be tasked to fixing it
 * with the element picker?" — "lets do it."
 *
 * ONE map per provider of where its input box, send button and reply live.
 * guardian/lib/agent-registry.js already stored it (input/send/resp, with a
 * history of every change: when, from, to, source, evidence) and the mesh's
 * archaeology repair already wrote to it — but the userscripts carried their
 * own hard-coded selectors and never read it, so a repair never reached the
 * path every job actually takes. This module is the bridge:
 *
 *   - mapFor(provider): the current map, each key marked `verified` when its
 *     last change came from a source that checked it against a live page
 *     (the element picker, archaeology). A seed value is NOT verified.
 *   - on every NCP connect, guardian pushes GUARDIAN_SELECTORS to that tab;
 *   - assign(): records a change (with its source and evidence) and pushes the
 *     new map at once to every open tab of that provider — the next job uses
 *     it, no release needed.
 *
 * The userscript's precedence (userscript-chatgpt.js findResponseEl):
 *   verified map value  >  its own built-in lookup  >  unverified seed value.
 * So an unchecked seed never overrides something that works.
 */
const MODULE_ID = 'guardian.selector-map';
const VERSION = '1.0.0';
const KEYS = ['input', 'send', 'resp'];
// Sources that checked the selector against the live page before recording it.
const VERIFIED_SOURCES = new Set(['picker', 'archaeology']);

function mapFor(registry, provider) {
  const a = registry.get(provider);
  if (!a) return null;
  const verified = {}, source = {};
  for (const k of KEYS) {
    // The last history entry that changed this key decides; none -> the seed.
    const last = [...(a.selectorHistory || [])].reverse().find(h => h && h.to && typeof h.to[k] === 'string');
    source[k] = last ? (last.source || 'mesh') : 'seed';
    verified[k] = !!last && VERIFIED_SOURCES.has(last.source);
  }
  return { provider, selectors: { ...a.selectors }, verified, source };
}

function message(registry, provider) {
  const m = mapFor(registry, provider);
  return m ? { type: 'GUARDIAN_SELECTORS', ...m, at: Date.now() } : null;
}

/** Push the current map to one tab (on connect). Returns true if written. */
function pushToTab(ncp, registry, provider, tabId) {
  const msg = message(registry, provider);
  if (!msg) return false;
  try { return !!ncp.pushTab(provider, tabId, msg); } catch (_) { return false; }
}

/**
 * assign(registry, ncp, provider, selectors, { source, evidence })
 * Only known keys, only non-empty strings. `source: 'picker'` or 'archaeology'
 * must carry evidence of the live check — a claim of verification without it is
 * refused, not silently accepted.
 */
function assign(registry, ncp, provider, selectors, { source, evidence } = {}) {
  if (!registry.get(provider)) return { ok: false, error: `unknown provider: ${provider}` };
  if (!selectors || typeof selectors !== 'object') return { ok: false, error: 'selectors object required' };
  const keys = Object.keys(selectors).filter(k => KEYS.includes(k));
  if (!keys.length) return { ok: false, error: `no known key — one of ${KEYS.join(', ')}` };
  if (!source) return { ok: false, error: 'source required (picker, archaeology, copilot, …)' };
  if (VERIFIED_SOURCES.has(source) && !(evidence && evidence.matched >= 1 && typeof evidence.url === 'string')) {
    return { ok: false, error: `source '${source}' claims a live check — evidence { url, matched>=1, … } required` };
  }
  const r = registry.recordRepair(provider, Object.fromEntries(keys.map(k => [k, selectors[k]])), { source, evidence: evidence || null });
  let pushed = 0;
  if (r.changed) { const msg = message(registry, provider); try { pushed = ncp.push(provider, msg) || 0; } catch (_) { pushed = 0; } }
  return { ok: true, changed: r.changed, map: mapFor(registry, provider), pushedToTabs: pushed };
}

module.exports = { MODULE_ID, VERSION, KEYS, VERIFIED_SOURCES, mapFor, message, pushToTab, assign };
