'use strict';
/**
 * idearium/test/run-e2e-pipeline-isolated.js — real isolation wrapper for
 * e2e-pipeline.test.js.
 *
 * §FIXED 2026-09-06 — James: "need to clear out test data from idearium
 * ... anytime you run a test for the pipeline you only need to simulate
 * you as a ncp instance, nothing more, so we can have a more accurate
 * test." Real, confirmed cause of the test-data pollution: e2e-pipeline
 * .test.js writes real ideas/specs through idearium/index.js's DATA_DIR
 * (now IDEARIUM_DATA_DIR-overridable) with no isolation at all — every
 * run this whole session wrote into the same real data directory that
 * ships in every zip. 63 test-generated specs found and removed from
 * idearium/data/specs/ the same pass this wrapper was built in.
 *
 * e2e-pipeline.test.js's own top-level `import { getIdeaOS } from
 * '../core/index.js'` is a static ES import — hoisted, evaluated before
 * ANY other statement in that file runs, including one setting
 * process.env first. Setting the env var inside that file would always
 * run too late. This wrapper sets it BEFORE dynamically importing the
 * real test (a dynamic import() genuinely runs at the point it's
 * reached, unlike a static one) — the real test file itself is
 * unchanged, still real, still no mocks of idearium's own pipeline; only
 * where its output lands is different.
 *
 * Run: node idearium/test/run-e2e-pipeline-isolated.js /path/to/some.spec
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idearium-e2e-test-'));
process.env.IDEARIUM_DATA_DIR = tmpDir;
// §FIXED 2026-09-06 — the manifest/chunk data loadSpec() actually reads
// lives in cortex's own shared JAA store (data/cortex/memory), a real,
// completely separate path from IDEARIUM_DATA_DIR. That store already
// has its own established override (JAA_DATA_DIR — cortex/memory/
// jaa-db.js's own real DATA_DIR constant) built for exactly this same
// reason, for a different test, already. Isolating both together is
// what actually gives this run zero real footprint anywhere, not just
// in the specs/ files.
process.env.JAA_DATA_DIR = path.join(tmpDir, 'cortex-memory');
console.log(`[e2e-pipeline-isolated] real data dir for this run: ${tmpDir} (not the real idearium/data/ or data/cortex/memory)`);

process.on('exit', () => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); }
  catch (e) { console.warn(`[e2e-pipeline-isolated] cleanup of ${tmpDir} failed: ${e.message} — remove it by hand`); }
});

import(path.join(__dirname, 'e2e-pipeline.test.js'));
