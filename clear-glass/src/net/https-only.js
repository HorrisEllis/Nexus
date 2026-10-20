'use strict';
/**
 * clear-glass/src/net/https-only.js — HTTPS-only for windows opened through a route (SF4, 0.60.178). Spec: clear-glass/spec/snowflake.spec
 * MOD-SF-HTTPS-ONLY. comp_id: cg.net.https-only
 *
 * James, 2026-10-21: "optional encryption." The coder's reading, to confirm: Tor encrypts every hop up to its exit relay, and the exit
 * relay sees plain http in the clear. HTTPS-only closes that: a page asked for over http is asked for over https instead, and a plain-http
 * piece of a page (an image, a script) is not fetched. On by default, his switch (Settings → Network, `net https-only on|off`). It adds
 * no cipher of its own; it makes sure the site's own TLS is always there.
 *
 *   decide({ url, resourceType }) → { action: 'allow' } | { action: 'upgrade', redirectURL } | { action: 'cancel' }
 *   attach(ses, enabled)          — Electron keeps ONE onBeforeRequest listener per session, and plugins/webrequest-adapter.js owns it when a
 *                                    content filter is installed. So this sets ses.__cgPreRequest (the adapter runs it first) and installs a
 *                                    plain listener of its own; if the adapter attaches later it replaces that listener and still runs this.
 */
const LOCAL = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/i;
const FRAME = new Set(['mainFrame', 'subFrame']);

function decide({ url, resourceType } = {}) {
  let u; try { u = new URL(String(url)); } catch (_) { return { action: 'allow' }; }
  if (u.protocol !== 'http:' && u.protocol !== 'ws:') return { action: 'allow' };   // https, wss, data, blob, about, devtools, chrome, file
  if (LOCAL.test(u.hostname)) return { action: 'allow' };                          // local tools stay local (the PAC sends them DIRECT, never to Tor)
  if (FRAME.has(resourceType) || u.protocol === 'ws:') {
    u.protocol = u.protocol === 'ws:' ? 'wss:' : 'https:';
    if (u.port === '80') u.port = '';
    return { action: 'upgrade', redirectURL: u.href };
  }
  return { action: 'cancel' };
}

/** toCallback(decision) → what an onBeforeRequest callback takes, or null to let the request through. */
function toCallback(d) { return d.action === 'upgrade' ? { redirectURL: d.redirectURL } : d.action === 'cancel' ? { cancel: true } : null; }

function attach(ses, enabled = () => true) {
  if (!ses || !ses.webRequest || typeof ses.webRequest.onBeforeRequest !== 'function') return false;
  ses.__cgPreRequest = (details) => { try { return enabled() ? toCallback(decide(details)) : null; } catch (_) { return null; } };
  ses.webRequest.onBeforeRequest((details, callback) => callback(ses.__cgPreRequest(details) || {}));
  return true;
}

module.exports = { decide, toCallback, attach };
