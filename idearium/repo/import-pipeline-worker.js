/**
 * idearium/repo/import-pipeline-worker.js — 0.60.124 SW1 — the import pipeline in its own thread.
 *
 * James's 0.60.122 boot log: idearium OFFLINE for 34 s, then 25 s ("missed its heartbeat"), each during the Nexus
 * self-sync's import pipeline (core: 2,556 files, 24 s at boot, 6 s after a one-file change). The pipeline is synchronous
 * end to end (parse, atlas, chunk, verify, index, graph, cards); while it ran, idearium answered nothing, so the Code
 * tab's dock panels sat at "reading…" and RAID's intake said "idearium unreachable". Run here, it costs the main
 * thread nothing. The same function, the same files written; events and the result come back as messages.
 *
 * workerData: { repo, repoDir, opts }   →   messages: { event } … then { result } | { error }
 */
import { parentPort, workerData } from 'worker_threads';
import { runImportPipeline } from './import-pipeline.js';

try {
  const { repo, repoDir, opts = {} } = workerData;
  const result = runImportPipeline(repo, repoDir, { ...opts, onEvent: opts.events ? (e) => parentPort.postMessage({ event: e }) : undefined });
  parentPort.postMessage({ result: JSON.parse(JSON.stringify(result)) });
} catch (e) {
  parentPort.postMessage({ error: e && e.message ? e.message : String(e) });
}
