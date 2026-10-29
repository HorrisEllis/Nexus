'use strict';
/**
 * versionium/lib/release-backfill-worker.js — every release with its commits, computed in a child process (0.60.285).
 * Started by nexus-releases.js syncInWorker(). It reads lib/version.js's history and every release's commits (git log -p over all
 * history) and sends the list back; the parent records it. Why a child: 0.60.278 ran this in Versionium's own process and, on
 * James's machine with 486 releases, Versionium answered nothing for 1113 s after boot (his run log, 2026-10-29).
 */
const NR = require('./nexus-releases.js');
const root = process.argv[2] || undefined;
try {
  let all = NR.read({ root });
  all = require('./release-notes.js').attach(all, { root, since: null });
  process.send({ ok: true, releases: all }, () => process.exit(0));
} catch (e) { process.send({ ok: false, error: e.message }, () => process.exit(1)); }
