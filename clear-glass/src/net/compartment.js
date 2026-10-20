'use strict';
/**
 * clear-glass/src/net/compartment.js — a window opened through a route is one compartment, page and all (SF3, 0.60.178).
 * Spec: clear-glass/spec/snowflake.spec MOD-SF-COMPARTMENT. comp_id: cg.net.compartment
 *
 * James, 2026-10-21: "can you get snowflake working. connected to the compartment? ... make it look as nromal as it can."
 * Root cause (read in the source): the page of an agent window loads in a <webview> with no partition, which in Electron is the app's
 * DEFAULT session. "Open link with Snowflake" routed persist:agent-snow-<id>, the window shell's session, so the page itself went direct.
 * A routed window now has ONE session for shell and page, and it is:
 *   - in memory: cg-snow-<id> has no persist: prefix, so cookies, cache and storage never reach disk, and dispose() clears them on close;
 *   - ordinary: the engine's own UA with the Electron / Node / Clear Glass tokens removed and no persona, so the UA, the client hints and
 *     the TLS handshake all say the same Chromium (a Firefox UA over a Chromium handshake is the thing that stands out on Tor);
 *   - quiet about its address: every webContents on it gets WebRTC 'disable_non_proxied_udp', so STUN cannot go around the proxy;
 *   - HTTPS-only when his switch is on (net/https-only.js).
 * A window without a route is untouched: persist:agent-<id> and its persona, as before.
 */
const PREFIX = 'cg-snow-';
const MARK = '__cgCompartment';

const partitionFor = (agentId) => `${PREFIX}${String(agentId).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64)}`;
const isPartition = (p) => typeof p === 'string' && p.startsWith(PREFIX) && !p.startsWith('persist:');
const isCompartment = (ses) => !!(ses && ses[MARK]);

/** cleanUserAgent(ua) — what Chrome itself would send: no Electron/x, Node/x or Clear Glass/x token (the same three main/index.js strips). */
function cleanUserAgent(ua) {
  return String(ua || '')
    .replace(/\s+Electron\/[\d.]+/gi, '')
    .replace(/\s+(?:Node\.js|node)\/[\d.]+/gi, '')
    .replace(/\s+clear[\s-]?glass\/[\d.]+/gi, '')
    .replace(/\s{2,}/g, ' ').trim();
}

/** harden(ses, { httpsOnly }) — the compartment's session settings; httpsOnly is a function so his switch applies without reopening. */
function harden(ses, { httpsOnly = () => true, log = console.warn } = {}) {
  if (!ses) return ses;
  ses[MARK] = true;
  try { ses.setUserAgent(cleanUserAgent(ses.getUserAgent())); } catch (e) { log(`[compartment] UA not set: ${e.message}`); }
  try { require('./https-only').attach(ses, httpsOnly); } catch (e) { log(`[compartment] HTTPS-only not attached: ${e.message}`); }
  return ses;
}

/** onContents(contents) — call for every webContents created (main's web-contents-created): true when it was a compartment's and was set. */
function onContents(contents, { log = console.warn } = {}) {
  if (!contents || !isCompartment(contents.session)) return false;
  if (typeof contents.setWebRTCIPHandlingPolicy !== 'function') { log('[compartment] setWebRTCIPHandlingPolicy missing: WebRTC not restricted in this window'); return false; }
  contents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
  return true;
}

/** dispose(ses) — on close: storage and cache cleared (in-memory already; this ends it before the process does). */
async function dispose(ses) {
  if (!ses) return { ok: false };
  const out = { ok: true };
  try { await ses.clearStorageData(); } catch (e) { out.ok = false; out.error = e.message; }
  try { await ses.clearCache(); } catch (_) { /* nothing cached */ }
  return out;
}

module.exports = { PREFIX, partitionFor, isPartition, isCompartment, cleanUserAgent, harden, onContents, dispose };
