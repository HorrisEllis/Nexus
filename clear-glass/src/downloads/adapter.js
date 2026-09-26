'use strict';
/**
 * src/downloads/adapter.js — will-download wiring for agent sessions
 * UUID: cg-downloads-adapter-v1-0000-0000-000000000008
 *
 * Same session.on('will-download', ...) shape download-capture.js
 * already uses (read directly before writing this) — different job:
 * records into the real local DownloadsStore (so the UI has something
 * to show regardless of whether Guardian is reachable) and honors a
 * real configured download directory via item.setSavePath(), which
 * download-capture.js never did (it only observes, per its own header,
 * "NOTHING IS APPLIED HERE").
 *
 * §HONEST LIMIT — traced against Electron's real, documented
 * DownloadItem API (getFilename/getURL/getMimeType/getTotalBytes/
 * setSavePath/getSavePath, 'updated' and 'done' events). Same
 * session.fromPartition access pattern already proven elsewhere. Not
 * live-run — no Electron runtime in this sandbox, same caveat as every
 * other adapter this session built.
 */

const path = require('path');
const { emit } = require('../core/bus');

function attach({ session, agentId, store, getDownloadDirectory, log = console.log } = {}) {
  if (!session || typeof session.on !== 'function') throw new Error('downloads/adapter.attach needs a real Electron session');
  if (!store) throw new Error('downloads/adapter.attach needs a DownloadsStore');

  const handler = (event, item, webContents) => {
    const dir = typeof getDownloadDirectory === 'function' ? getDownloadDirectory() : null;
    if (dir) {
      try { item.setSavePath(path.join(dir, item.getFilename())); }
      catch (err) { log(`[downloads/adapter] setSavePath failed, using default: ${err.message}`); }
    }

    const record = store.add({
      agentId,
      filename: item.getFilename(),
      url: item.getURL(),
      savePath: item.getSavePath(),
      mimeType: item.getMimeType(),
      bytes: item.getTotalBytes(),
      state: 'in_progress',
    });

    item.on('updated', (_e, state) => {
      if (state === 'interrupted') store.updateState(record.id, 'interrupted');
      else if (state === 'progressing' && item.isPaused()) store.updateState(record.id, 'paused');
    });

    item.once('done', (_e, state) => {
      const updated = store.updateState(record.id, state === 'completed' ? 'completed' : state, {
        bytes: item.getReceivedBytes(),
        savePath: item.getSavePath(),
      });
      // §2026-08-28 — James: "maybe a download listener for artifacts."
      // Real prerequisite this adapter never had: it tracked every
      // download into DownloadsStore, but never emitted a real event on
      // completion — nothing could react to a download finishing even in
      // principle. Emits on 'done' only (not 'updated'), matching how a
      // real artifact listener would want to fire once the file is
      // actually usable, not on every progress tick. Real completion
      // state carried through, not assumed 'completed' regardless of
      // what actually happened (cancelled/interrupted are real, distinct
      // outcomes a listener should be able to tell apart).
      try {
        emit('downloads.completed', {
          agentId, id: record.id, filename: item.getFilename(), url: item.getURL(),
          savePath: item.getSavePath(), mimeType: item.getMimeType(),
          bytes: item.getReceivedBytes(), state: state === 'completed' ? 'completed' : state,
        });
      } catch (err) { log(`[downloads/adapter] completion event emit failed: ${err.message}`); }
    });
  };

  session.on('will-download', handler);
  log(`[downloads/adapter] armed for agent ${agentId}`);
  return { detach() { try { session.removeListener('will-download', handler); } catch (_) {} } };
}

module.exports = { attach };
