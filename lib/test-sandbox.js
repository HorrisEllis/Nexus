'use strict';
/**
 * lib/test-sandbox.js — a test process never writes real data.
 *
 * §BUILT 2026-09-25 — James, with a screenshot of the Repos tab showing
 * nothing but inject-test-*, prov-*, phase-sync-test-* and
 * phase-sync-standalone-*: "the tests need to stop in idearium. they keep
 * generating."
 *
 * Third time this has been cleaned up. The first two (§FIXED 2026-09-06 in
 * idearium/api/index.js and idearium/test/run-e2e-pipeline-isolated.cjs)
 * added an override env var and then relied on each test remembering to set
 * it. Opt-in isolation does not hold: of the ~50 tests that reach idearium's
 * stores, a handful set IDEARIUM_DATA_DIR, fewer also set JAA_DATA_DIR, none
 * isolated COMPARTMENT OS, and two repo-layer resolvers (repo-node.js,
 * chunk-nodes.js) ignored the override entirely. Every run left specs,
 * chunks, repo nodes and COS compartments behind. At the next boot
 * idearium's spec→repo reconcile adopted them as real repos, the build
 * queue built them, and guardian sent their "project agent" prompts to
 * ChatGPT (log of 2026-09-25: job 0631e27a for "inject-test-1790345265876").
 *
 * So the default flips. The resolvers for every store idearium writes —
 * idearium's data dir, cortex's JAA dir, COMPARTMENT OS's root, the inject
 * node dir — call ensure() before computing their real path. In a test
 * process ensure() creates ONE temp root per process tree and points every
 * store's override variable at it (only where the test has not already
 * chosen its own path). A test cannot forget, because it no longer has to
 * remember anything.
 *
 * The variables are set on process.env, so anything the test spawns
 * (idearium's API server, a helper script in tmpdir) inherits the same
 * sandbox. tests/modules/run-all.js and the autopilot vitals check also set
 * it up front for each suite they spawn.
 *
 * What counts as a test process: the entry script sits under tests/ or a
 * test/ directory, or is named *.test.js/.mjs/.cjs — or a runner already
 * marked it (NEXUS_TEST_SANDBOX / NEXUS_TEST_RUN_DEPTH). No production
 * entry point matches any of these; tests/modules/test-test-sandbox.test.js
 * checks that against every real entry point autopilot supervises.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const MODULE_ID = 'test-sandbox';
const VERSION = '1.0.0';
const ROOT = path.resolve(__dirname, '..');

// store → the override variable its own resolver already honours, and the
// subdirectory it gets inside the sandbox root.
const STORES = Object.freeze({
  IDEARIUM_DATA_DIR: 'idearium',
  JAA_DATA_DIR:      'cortex-memory',
  COS_DATA_ROOT:     'compartment-os',
  NEXUS_INJECT_DIR:  'inject',
  NEXUS_DATA_ROOT:   'data',        // lib/ledger-writer.js (data/<system>/event_log.jsonl), intelligence/alk, lib/chat-logger.js
  COPILOT_INJECTION_DIR: 'copilot-injection',   // 0.39.257 — copilot/tool-runtime.js .injection nodes (every tool-loop round through a browser agent)
});

// Where each store lives when nothing overrides it — only used by
// seedFromReal() below, never to write.
const REAL_DEFAULTS = Object.freeze({
  IDEARIUM_DATA_DIR: path.join(ROOT, 'idearium', 'data'),
  JAA_DATA_DIR:      path.join(ROOT, 'data', 'cortex', 'memory'),
});

function isTestProcess(argv1 = process.argv[1], env = process.env) {
  if (env.NEXUS_TEST_SANDBOX || env.NEXUS_TEST_RUN_DEPTH) return true;
  if (!argv1) return false;
  const p = path.resolve(argv1).split(path.sep).join('/');
  if (/\.test\.(c|m)?js$/.test(p)) return true;
  const rel = path.relative(ROOT, path.resolve(argv1)).split(path.sep).join('/');
  if (rel.startsWith('..')) return false;                  // outside the repo: not ours to judge
  return rel.startsWith('tests/') || /(^|\/)test\//.test(rel);
}

let _cleanupArmed = false;

/**
 * ensure() → the sandbox root, or null in a production process.
 * Idempotent; safe to call from every resolver on every call.
 */
function ensure(env = process.env) {
  if (env.NEXUS_TEST_SANDBOX) return env.NEXUS_TEST_SANDBOX;
  if (!isTestProcess(process.argv[1], env)) return null;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-test-sandbox-'));
  apply(root, env);
  if (!_cleanupArmed) {
    _cleanupArmed = true;
    // Only the process that created the root removes it. Children inherit
    // NEXUS_TEST_SANDBOX and take the early return above, so they never arm this.
    process.on('exit', () => { try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {} });
  }
  return root;
}

/** Point every store at `root` (existing choices win). Used by runners too. */
function apply(root, env = process.env) {
  env.NEXUS_TEST_SANDBOX = root;
  for (const [key, sub] of Object.entries(STORES)) {
    if (!env[key]) env[key] = path.join(root, sub);
  }
  return env;
}

/** A fresh env object for a child suite — for runners (run-all, autopilot). */
function childEnv(base = process.env) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-test-sandbox-'));
  const env = { ...base };
  // A runner inside a sandbox still gives each suite its own root, so
  // suites cannot see each other's leftovers either.
  delete env.NEXUS_TEST_SANDBOX;
  for (const key of Object.keys(STORES)) if (base.NEXUS_TEST_SANDBOX && base[key] && base[key].startsWith(base.NEXUS_TEST_SANDBOX)) delete env[key];
  apply(root, env);
  return { env, root, cleanup: () => { try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {} } };
}

/**
 * seedFromReal(key) — for the few tests whose point IS reading what the live
 * store holds right now (tablet graph, ALK lattice: "real rows, not
 * fabricated"). Copies the real store into this process's sandbox and
 * returns nothing else: the test reads the copy, and whatever it or the
 * modules it loads write goes to the copy. The real store is only read.
 * Must run before the store's module is first required.
 */
function seedFromReal(key) {
  const root = ensure();
  if (!root || !REAL_DEFAULTS[key]) return false;
  const dst = process.env[key];
  if (!dst || !dst.startsWith(root)) return false;       // the test chose its own dir — leave it
  if (!fs.existsSync(REAL_DEFAULTS[key])) return false;
  fs.cpSync(REAL_DEFAULTS[key], dst, { recursive: true, filter: (src) => !/\.cortex\.pid$/.test(src) });
  return true;
}

module.exports = { MODULE_ID, VERSION, STORES, REAL_DEFAULTS, isTestProcess, ensure, apply, childEnv, seedFromReal };
