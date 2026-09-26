'use strict';
/**
 * src/downloads/intake-bridge.js — regular-window downloads -> guardian's
 * real intake/artifacts pipeline.
 * UUID: cg-downloads-intake-bridge-v1-0000-2026-0903-001
 *
 * §THE GAP THIS CLOSES — checked directly before writing this, not
 * assumed: download-capture.js and downloads/adapter.js run on completely
 * DISJOINT sessions (confirmed via src/main/index.js and src/providers/
 * host.js's own partition strings — `persist:agent-${agentId}` for regular
 * windows vs `persist:ncp-${providerId}` for provider chat tabs), so there
 * is zero double-announce risk between the two. But that also means a
 * download from a REGULAR agent-browsing window only ever reaches the
 * local DownloadsStore (src/downloads/store.js) and emits
 * `downloads.completed` on the in-process bus (src/core/bus.js) —
 * confirmed by grep, that event has zero consumers anywhere in this tree.
 * The file exists on disk and in the local downloads list; guardian, RAID
 * contracts, and the real /artifacts manager never hear about it at all.
 * This module is that missing consumer — the same real path download-
 * capture.js already proved out for provider-chat downloads, reused
 * rather than reimplemented as a second POST-to-guardian mechanism, now
 * also covering plain browsing downloads.
 *
 * §PROVENANCE, HONESTLY DISTINCT — this is NOT a chat-download. There is
 * no chatUrl, no LLM-authored intent behind the file. provider is set to
 * the literal string 'browsing' (never a real provider id, so nothing
 * downstream mistakes this for a provider-chat artifact), and the real
 * agentId is carried in a separate field so it stays queryable without
 * being confused with the provider field's real, narrower meaning
 * (guardian's own _findActiveJobForProvider correctly finds nothing for
 * 'browsing' — no active provider job exists for a plain window, which is
 * the honest, correct outcome, not a bug to work around).
 *
 * §WHY NOT EVERY downloads.completed EVENT — only state === 'completed'
 * is announced, matching download-capture.js's own real behavior
 * (cancelled/interrupted downloads are real, distinct outcomes that
 * should not become a staged intake claim for a file that may be
 * partial or absent).
 */

const http = require('http');
const { on } = require('../core/bus');

const GUARDIAN_HOST = process.env.GUARDIAN_HOST || '127.0.0.1';
const GUARDIAN_PORT = parseInt(process.env.GUARDIAN_HTTP_PORT || '7820', 10);
const VERSION = '1.0.0';
const MODULE_ID = 'clear-glass.downloads.intake-bridge';

function _announce(payload, log) {
  const body = Buffer.from(JSON.stringify(payload));
  const req = http.request({
    host: GUARDIAN_HOST, port: GUARDIAN_PORT, path: '/api/intake', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': body.length },
    timeout: 5000,
  }, res => {
    let out = '';
    res.on('data', d => (out += d));
    res.on('end', () => {
      if (res.statusCode >= 400) log(`[downloads/intake-bridge] guardian refused (${res.statusCode}): ${out.slice(0, 200)}`);
      else {
        let parsed = null; try { parsed = JSON.parse(out); } catch (_) {}
        log(`[downloads/intake-bridge] staged ${payload.filename} → drop ${parsed && parsed.dropId ? parsed.dropId : '(no id returned)'}`);
      }
    });
  });
  req.on('error', e => log(`[downloads/intake-bridge] guardian unreachable on :${GUARDIAN_PORT} — ${e.message}. File is on disk at ${payload.source}, untracked.`));
  req.on('timeout', () => { req.destroy(); log('[downloads/intake-bridge] guardian timed out — download is on disk, untracked'); });
  req.write(body);
  req.end();
}

/**
 * install({ log }) — arm the bridge once, process-wide (the bus event
 * already carries agentId per-download; this is not per-session wiring
 * like adapter.js/download-capture.js are).
 * Returns { detach() }.
 */
function install({ log = console.log } = {}) {
  const handler = (ev) => {
    const d = ev && ev.data ? ev.data : ev;
    if (!d || d.state !== 'completed') {
      if (d) log(`[downloads/intake-bridge] ${d.filename || '(unknown)'} ended as ${d && d.state} — not announced`);
      return;
    }
    if (!d.savePath) { log('[downloads/intake-bridge] completed download has no savePath — cannot stage, skipping'); return; }
    _announce({
      source:       d.savePath,
      provider:     'browsing',       // real, distinct from any actual provider id — see header
      agentId:      d.agentId || null, // real, additive — not part of provider's own meaning
      chatUrl:      null,              // honest: a browsing download has no originating chat
      filename:     d.filename || null,
      url:          d.url || null,
      mimeType:     d.mimeType || null,
      bytes:        d.bytes || 0,
      downloadedAt: Date.now(),
      capturedBy:   `${MODULE_ID}@${VERSION}`,
    }, log);
  };

  on('downloads.completed', handler);
  log(`[downloads/intake-bridge] armed → guardian :${GUARDIAN_PORT}/api/intake`);
  return { detach() { try { require('../core/bus').off('downloads.completed', handler); } catch (_) {} } };
}

module.exports = { install, VERSION, MODULE_ID };
