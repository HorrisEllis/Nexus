'use strict';
/**
 * src/contexts/session-headers.js — Shared CSP / X-Frame-Options / PNA bypass
 * UUID: cg-session-headers-v1-0000-0000-000000000017
 *
 * Originally this lived inline in main/index.js's bootstrap, applied ONLY to
 * electronSession.defaultSession. Per-agent contexts (ContextMgr.create())
 * each get their own session.fromPartition(...) — a completely separate
 * cookie/header/CSP space — so the defaultSession-only version never
 * applied to any Agent Mesh context (chatgpt, claude, gemini, ...).
 *
 * Two gaps closed here vs. the original inline version:
 *   1. Reusable — call once per session, default or per-agent partition.
 *   2. Also strips X-Frame-Options. The original only deleted the CSP
 *      headers; legacy X-Frame-Options is a *separate* header some sites
 *      still send alongside (or instead of) a CSP frame-ancestors
 *      directive, and stripping CSP alone doesn't remove it.
 */

// §0.60.3 — James (fiverr: "It needs a human touch · PRESS & HOLD", PerimeterX). Every response on every site had its
// CSP and X-Frame-Options removed — a page whose own security headers vanish in transit is one a bot detector notices,
// and a human browsing fiverr is not Nexus injecting anything. Now a response is rewritten only where Nexus needs it:
//   - a frame (resourceType subFrame) — embedding a page in a Nexus panel needs its framing headers gone;
//   - a provider's own pages (registry hosts) and localhost — where the userscripts run and talk to 127.0.0.1;
// every other response — a top-level page a person browses — passes through exactly as the site sent it.
let _hosts = null, _hostsAt = 0;
function _providerHosts() {
  if (_hosts && Date.now() - _hostsAt < 60000) return _hosts;
  try { _hosts = require('../providers/registry').listProviders().flatMap(p => p.hosts || []); } catch (_) { _hosts = _hosts || []; }
  _hostsAt = Date.now();
  return _hosts;
}
/** needsRewrite(details, hosts) — pure: does Nexus need this response's CSP / framing headers gone? */
function needsRewrite(details = {}, hosts = []) {
  if (details.resourceType === 'subFrame') return true;
  let h = ''; try { h = new URL(details.url).hostname; } catch (_) { return false; }
  if (h === '127.0.0.1' || h === 'localhost') return true;
  return hosts.some(x => h === x || h.endsWith(`.${x}`));
}

function applyCspBypass(ses, { hosts = _providerHosts } = {}) {
  if (!ses || ses.__cgCspBypassApplied) return;
  ses.__cgCspBypassApplied = true;

  // Strip restrictive CSP / framing headers that would block NCP userscript
  // ↔ localhost connections, or block embedding inside a Nexus frame — only where that is what is happening.
  ses.webRequest.onHeadersReceived((details, callback) => {
    if (!needsRewrite(details, hosts())) return callback({});
    const headers = { ...details.responseHeaders };
    for (const k of Object.keys(headers)) if (/^(content-security-policy(-report-only)?|x-frame-options)$/i.test(k)) delete headers[k];
    callback({ responseHeaders: headers });
  });

  // Allow Private Network Access (http://127.0.0.1 from https://) — the request to localhost only; others untouched
  requestHook(ses, 'private-network', (details, headers) => {
    let h = ''; try { h = new URL(details.url).hostname; } catch (_) {}
    if (h !== '127.0.0.1' && h !== 'localhost') return null;
    return { ...headers, 'Access-Control-Request-Private-Network': 'true' };
  });
}

/**
 * §2026-10-16 (cg-google-signin) — requestHook(ses, name, fn): Electron keeps ONE onBeforeSendHeaders listener per session;
 * a second registration silently replaces the first. contexts/manager.js registered its Firefox-profile headers after
 * applyCspBypass, and the localhost Private Network header was gone for those sessions without a word. Every request-
 * header change now goes through here: one listener per session, the hooks run by `order` (lower first; the same order:
 * as added), each fn(details, headers) -> new headers or null (no change). A hook that throws is skipped and said.
 */
function requestHook(ses, name, fn, { order = 0 } = {}) {
  if (!ses || !ses.webRequest || typeof fn !== 'function') return false;
  if (!ses.__cgReqHooks) {
    ses.__cgReqHooks = new Map();
    ses.webRequest.onBeforeSendHeaders((details, callback) => {
      let headers = details.requestHeaders || {}, changed = false;
      for (const [n, { fn: h }] of [...ses.__cgReqHooks].sort((a, b) => a[1].order - b[1].order)) {
        try { const out = h(details, headers); if (out) { headers = out; changed = true; } }
        catch (e) { console.warn(`[session-headers] request hook ${n} failed (skipped): ${e.message}`); }
      }
      callback(changed ? { requestHeaders: headers } : {});
    });
  }
  ses.__cgReqHooks.set(name, { fn, order });
  return true;
}

module.exports = { applyCspBypass, needsRewrite, requestHook };
