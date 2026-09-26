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

function applyCspBypass(ses) {
  if (!ses || ses.__cgCspBypassApplied) return;
  ses.__cgCspBypassApplied = true;

  // Strip restrictive CSP / framing headers that would block NCP userscript
  // ↔ localhost connections, or block embedding inside <webview>.
  ses.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    delete headers['content-security-policy'];
    delete headers['content-security-policy-report-only'];
    delete headers['x-frame-options'];
    delete headers['X-Frame-Options'];
    callback({ responseHeaders: headers });
  });

  // Allow Private Network Access (http://127.0.0.1 from https://)
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders };
    if (details.url.includes('127.0.0.1') || details.url.includes('localhost')) {
      headers['Access-Control-Request-Private-Network'] = 'true';
    }
    callback({ requestHeaders: headers });
  });
}

module.exports = { applyCspBypass };
