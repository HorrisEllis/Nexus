/**
 * idearium/repo/snapshot-worker.js — 0.60.604: the snapshot before a build, in its own thread (the import pipeline's SW1 pattern,
 * import-pipeline-worker.js).
 *
 * James, 2026-11-19: "it is meant to chunk all of that, look at the import pipeline." · "look at the import pipeline for idearium. like for
 * importing projects". NM1a's build (phrun-mwo6egoh-vxh3): the snapshot read and hashed 34,798 files on the main thread, twice (the record's
 * source hash, then every file's bytes kept in memory), and Idearium answered nothing for 11 minutes. Here the same functions run off the
 * main thread, and the file pass keeps no bytes: only the files Versionium says it needs are read again, in the main thread, after.
 *
 * workerData: { repo, repoDir, now, maxBytes }   →   message: { built, col: { entries, skipped } | null } | { error }
 */
import { parentPort, workerData } from 'worker_threads';
import { buildSnapshotRecord } from './snapshot.js';
import { collectFiles } from './snapshot-files.js';

try {
  const { repo, repoDir, now, maxBytes } = workerData;
  const built = buildSnapshotRecord({ repo, repoDir, now });
  let col = null;
  if (built.ok && maxBytes != null) { const c = collectFiles(repo, repoDir, maxBytes, { keepBuffers: false }); col = { entries: c.entries, skipped: c.skipped }; }
  parentPort.postMessage({ built: JSON.parse(JSON.stringify(built)), col });
} catch (e) {
  parentPort.postMessage({ error: e && e.message ? e.message : String(e) });
}
