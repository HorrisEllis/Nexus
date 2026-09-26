'use strict';
/**
 * clear-glass/src/providers/download-capture.js — a file downloaded from a
 * provider tab is announced to Guardian, with the chat it came from attached.
 * comp_id: clear-glass.providers.download-capture
 * UUID: cg-download-capture-v1-0000-2026-0818-001
 * Version: 1.0.0
 *
 * WHY (James, 2026-08-18): "guardian to listen for the downloads from your
 * chat and move them to the compartment with the contract or repo/spec."
 *
 * §WHY HERE AND NOT A FOLDER WATCHER
 * A watcher on Downloads sees bytes and a filename. This sees the download
 * ITEM: the URL it came from, the tab that requested it, the provider that
 * served it, and the moment it finished. That provenance is the difference
 * between "a file called hat-forge.js appeared" and "claude, in this chat,
 * at this time, produced this file" — and provenance is the whole reason to
 * capture at all, since the drop is a CLAIM whose author matters.
 *
 * §1.1 — this rebuilds nothing. providers/host.js:141 already holds each
 * provider's own `session.fromPartition('persist:ncp-<id>')`. `will-download`
 * was hooked nowhere in the tree (checked, not assumed), so the capture point
 * existed and was simply unused. This is the wire, not a new mechanism.
 *
 * §NOTHING IS APPLIED HERE. This announces. Guardian stages. A gate decides.
 * A user promotes. See lib/intake.js for why arrival must not equal
 * acceptance.
 */

const path = require('path');
const http = require('http');

const GUARDIAN_HOST = process.env.GUARDIAN_HOST || '127.0.0.1';
const GUARDIAN_PORT = parseInt(process.env.GUARDIAN_HTTP_PORT || '7820', 10);
const VERSION = '1.1.0';   // 0.39.239: agentId on every capture; one listener per session; recorded in the downloads index

// §ARTIFACTS-LISTENER 2026-09-16 — James: "clearglass downloads manager
// used as a artifacts listener for agents." This file already IS a real
// artifacts listener — Electron's `will-download` fires for exactly the
// case that matters (an agent's chat producing a real, downloadable file:
// a code export, an artifact's "Download" button, a generated document),
// and it already carries real provenance no folder-watcher has (see this
// file's own §WHY HERE header). What it never did: write anywhere durable
// — only Guardian's /api/intake (a staging queue, consumed and gone) and,
// on failure, nothing at all. Same real, durable ledger src/dom/
// archaeology.js's DOM mutation stream now writes to (same date, same
// reasoning) — POST :9000/api/ledger, src/main/index.js's own established
// endpoint — so a downloaded artifact and an inline (never-downloaded)
// artifact both leave a real, permanent, per-agent-per-chatUrl record,
// not just a transient Guardian intake row.
function _ledgerWrite(system, type, payload) {
  const body = JSON.stringify({ system, type, payload });
  const req = http.request({
    hostname: '127.0.0.1', port: parseInt(process.env.ORCHESTRATOR_PORT || '9000', 10),
    path: '/api/ledger', method: 'POST', timeout: 2000,
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  }, (res) => { res.on('data', () => {}); });
  req.on('error',   () => {});
  req.on('timeout', () => req.destroy());
  req.write(body);
  req.end();
}

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
      // §1.2 — a failed announce is stated. A download that guardian never
      // heard about is a file sitting in Downloads that nobody is tracking,
      // and silence there looks exactly like success.
      if (res.statusCode >= 400) log(`[download-capture] guardian refused (${res.statusCode}): ${out.slice(0, 200)}`);
      else {
        let parsed = null; try { parsed = JSON.parse(out); } catch (_) {}
        log(`[download-capture] staged ${payload.filename} → drop ${parsed && parsed.dropId ? parsed.dropId : '(no id returned)'}`);
      }
    });
  });
  req.on('error', e => log(`[download-capture] guardian unreachable on :${GUARDIAN_PORT} — ${e.message}. File is on disk at ${payload.savePath}, untracked.`));
  req.on('timeout', () => { req.destroy(); log('[download-capture] guardian timed out — download is on disk, untracked'); });
  req.write(body);
  req.end();
}

/**
 * attach({ session, providerId, log }) — watch one provider session.
 *
 * @param {Electron.Session} session  the provider's own partition session
 * @param {string} providerId         'claude' | 'chatgpt' | 'gemini' | 'perplexity'
 * @param {function} [log]
 * @returns {{detach:function}}
 */
// §ONE-LISTENER 0.39.239 — every window of a provider (the shared one and each
// repo agent tab) uses the SAME session partition (persist:ncp-<provider>), and
// ProviderHost.start() calls attach() once per window. Each call added another
// will-download listener to that one session, so every download was announced
// once per open window. attach() is now idempotent per session.
const _attached = new WeakMap(); // session -> { detach }

// Index size cap: a download up to this size is copied into the downloads index
// (a self-contained backup); larger files are recorded by path only.
const INDEX_COPY_MAX_BYTES = 10 * 1024 * 1024;

function _recordInIndex({ providerId, agentId, chatUrl, filename, savePath, bytes, mimeType, url }, log) {
  try {
    const index = require('../downloads/artifact-chat-index.js');
    const fs = require('fs');
    let buf = null;
    if (bytes && bytes <= INDEX_COPY_MAX_BYTES) { try { buf = fs.readFileSync(savePath); } catch (_) { buf = null; } }
    const r = index.recordResponse(index.defaultRoot(), {
      kind: 'artifact', provider: providerId, agentId: agentId || null,
      chatId: chatUrl || null, artifactBuffer: buf, artifactFileName: buf ? path.basename(filename) : undefined,
      raw: { agentId: agentId || null, provider: providerId, chatUrl, filename, savePath, bytes, mimeType, url,
             copied: !!buf, capturedBy: `clear-glass.download-capture@${VERSION}` },
    });
    log(`[download-capture] indexed ${filename} → ${agentId || providerId} (${r.responsePath}${buf ? '' : ', by path'})`);
  } catch (e) {
    // §1.2 — stated, not swallowed; the announce and ledger write already happened.
    log(`[download-capture] ${filename}: could not record in the downloads index — ${e.message}`);
  }
}

/**
 * @param {function} [agentIdFor]  (webContents) => the agent id of the tab the
 *   download came from, or null for the shared provider window. Supplied by
 *   ProviderHost, which owns the agentId -> window map.
 */
function attach({ session, providerId, log = console.log, agentIdFor = null } = {}) {
  if (!session || typeof session.on !== 'function') throw new Error('download-capture.attach needs a real Electron session');
  if (!providerId) throw new Error('download-capture.attach needs a providerId — a drop with no author is not provenance');
  if (_attached.has(session)) return _attached.get(session);

  const handler = (event, item, webContents) => {
    const filename = item.getFilename();
    // The page the download was requested FROM — this is the chat URL, and it
    // is the field that makes a drop traceable back to the exchange that
    // produced it. Captured before the item completes, since webContents can
    // navigate away while a large file is still downloading.
    let chatUrl = null;
    try { chatUrl = webContents && typeof webContents.getURL === 'function' ? webContents.getURL() : null; } catch (_) {}
    // Which agent's tab asked for it — resolved now, while the tab still exists.
    let agentId = null;
    try { agentId = typeof agentIdFor === 'function' ? (agentIdFor(webContents) || null) : null; } catch (_) {}
    const startedAt = Date.now();

    item.once('done', (_e, state) => {
      if (state !== 'completed') {
        log(`[download-capture] ${providerId}: "${filename}" ended as ${state} — not announced`);
        return;
      }
      const savePath = item.getSavePath();
      const payload = {
        source:   savePath,
        provider: providerId,
        agentId,
        chatUrl,
        filename,
        url:          item.getURL(),
        mimeType:     item.getMimeType(),
        bytes:        item.getTotalBytes(),
        startedAt,
        downloadedAt: Date.now(),
        capturedBy:   `clear-glass.download-capture@${VERSION}`,
      };
      _announce(payload, log);
      // §ARTIFACTS-LISTENER — durable regardless of whether Guardian's
      // staging queue is even up; a ledger write and an /api/intake
      // announce are two different real jobs (permanent record vs.
      // "something to act on now"), so this doesn't wait on or depend
      // on _announce's own result.
      // 0.39.239 — agentId was set to the PROVIDER name here; it is now the tab's agent (null for the shared window).
      _ledgerWrite('clear-glass', 'artifact.downloaded', { chatUrl, ...payload });
      _recordInIndex({ providerId, agentId, chatUrl, filename, savePath, bytes: payload.bytes, mimeType: payload.mimeType, url: payload.url }, log);
    });
  };

  session.on('will-download', handler);
  log(`[download-capture] armed for ${providerId} → guardian :${GUARDIAN_PORT}/api/intake`);
  const handle = { detach() { try { session.removeListener('will-download', handler); } catch (_) {} _attached.delete(session); } };
  _attached.set(session, handle);
  return handle;
}

module.exports = { attach, VERSION, MODULE_ID: 'clear-glass.providers.download-capture' };
