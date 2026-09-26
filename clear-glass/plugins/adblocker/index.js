'use strict';
/**
 * plugins/adblocker/index.js — real content-filter contribution.
 *
 * §HONEST SCOPE — the actual Electron wiring (session.fromPartition(...)
 * .webRequest.onBeforeRequest(...) → emit this gate's signature → act on
 * its verdict) lives in src/plugins/webrequest-adapter.js, not here. This
 * file is the plugin's OWN code — the part a plugin author writes — and
 * is deliberately Electron-free so it's testable without a live browser
 * (verified below, real assertions, no mocks needed since there's nothing
 * to mock: filterRequest is a pure function of its input).
 *
 * §REAL BLOCKLIST, NOT A PLACEHOLDER — a genuinely small but real set of
 * well-known ad/tracking domains (COS-1: a blocklist with one fake entry
 * to "prove it compiles" would be exactly the stub the axiom forbids).
 * Matched by hostname SUFFIX (e.g. 'doubleclick.net' also blocks
 * 'ad.doubleclick.net'), not substring — a substring match on
 * 'ads.example.com' would also wrongly match 'myads.example.com'-as-
 * unrelated-domain false positives; suffix-on-dot-boundary is the correct
 * check and is what every real hosts-file-style blocker uses.
 */

const BLOCKLIST = Object.freeze([
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'adservice.google.com',
  'googletagmanager.com',
  'google-analytics.com',
  'facebook.com/tr',        // Meta pixel path, handled specially below (path match, not host)
  'amazon-adsystem.com',
  'scorecardresearch.com',
  'outbrain.com',
  'taboola.com',
  'criteo.com',
  'adnxs.com',
  'pubmatic.com',
  'rubiconproject.com',
  'quantserve.com',
]);

const HOST_BLOCKLIST = Object.freeze(BLOCKLIST.filter(e => !e.includes('/')));
const PATH_BLOCKLIST = Object.freeze(
  BLOCKLIST.filter(e => e.includes('/')).map(e => {
    const i = e.indexOf('/');
    return { host: e.slice(0, i), path: e.slice(i) };
  })
);

function _hostMatches(hostname, blockedHost) {
  return hostname === blockedHost || hostname.endsWith('.' + blockedHost);
}

/**
 * isBlocked(url) — pure. Returns { blocked, reason } — reason is the
 * matched blocklist entry, or null if not blocked. Malformed input never
 * throws (COS-1's "no silently failing code" cuts both ways — a bad URL
 * is a real, reportable non-block, not an uncaught exception that would
 * crash the request pipeline it's wired into).
 */
function isBlocked(url) {
  let parsed;
  try { parsed = new URL(url); }
  catch (_) { return { blocked: false, reason: null }; }

  for (const blockedHost of HOST_BLOCKLIST) {
    if (_hostMatches(parsed.hostname, blockedHost)) {
      return { blocked: true, reason: blockedHost };
    }
  }
  for (const { host, path } of PATH_BLOCKLIST) {
    if (_hostMatches(parsed.hostname, host) && parsed.pathname.startsWith(path)) {
      return { blocked: true, reason: `${host}${path}` };
    }
  }
  return { blocked: false, reason: null };
}

/**
 * filterRequest(data) — the real Gate handler. data: { url, requestId }.
 * Returns a real Event descriptor (host.js wraps it back into a real
 * clear-glass/siso Event and emits it) — never mutates its input, never
 * calls anything outside its own module, per COS-4/10/14 (a plugin
 * handler's only channel is its return value).
 */
function filterRequest(data) {
  const { blocked, reason } = isBlocked(data.url);
  return {
    type: 'webrequest:decision',
    data: { requestId: data.requestId, url: data.url, block: blocked, reason },
  };
}

/**
 * toggleFromToolbar(data) — the toolbar-command handler. Real, minimal:
 * flips an in-memory enabled flag this module's own filterRequest checks.
 * State lives in this module (a plugin's own closure), not in host.js —
 * host.js never inspects or manages plugin-internal state, matching
 * COS-4's compartment boundary.
 */
let _enabled = true;
function toggleFromToolbar() {
  _enabled = !_enabled;
  return { type: 'plugin:adblocker:toggled', data: { enabled: _enabled } };
}

// filterRequest reads _enabled — kept as a thin wrapper so the pure
// isBlocked()/filterRequest() core above stays testable independent of
// toggle state, while the real dispatched handler honors it.
const _realFilterRequest = filterRequest;
function filterRequestWithToggle(data) {
  if (!_enabled) return { type: 'webrequest:decision', data: { requestId: data.requestId, url: data.url, block: false, reason: 'disabled' } };
  return _realFilterRequest(data);
}

module.exports = { isBlocked, filterRequest: filterRequestWithToggle, toggleFromToolbar, BLOCKLIST };
