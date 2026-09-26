# NEXUS 0.39.260: dangling hooks cut from 545 to real ones, large imports no longer stall idearium, "online" means idearium

**Date:** 2026-09-26 · loom registry, source-map scanner, diagnostic wire-integrity, gap-field, idearium RepoLayer, idearium UI, orchestrator proxy

James, live on 0.39.259:

> *"can we fix some of these dangling hooks"* · *"imported my mastermind project and now idearium isn't running properly"* · *"should not show online at 9000, thats not useful"*

## Fixed: idearium stalled after the 1364-file MASTERMIND import

What the log showed:

| Time | Event |
|---|---|
| 04:55:43.9 | `ingested 1364/1364 file(s) … in 1980ms` |
| 04:55:53 | `[watchdog] idearium → OFFLINE`, then missed pulses without end. The process was alive but its event loop was blocked. |
| 05:00:25 (next boot) | `[cos-bridge] created compartment "idearium-repo-aaf6740f"`, then `phase 3 gate STALLED after 30s` and `BOOT HALTED at phase 3` |

- **Cause:** `RepoLayer.materialize()` wrote each file through `readFile()`. Each `readFile()` resolved its chunk through `se.loadSpec()`, which JSON-parses the whole manifest, including every chunk's content.
  - N files meant N full parses of an N-file manifest, so the cost was quadratic.
  - Measured on the old code: 200 files took 1.9 s and 500 files took 11.5 s. 1364 real files is far past the 30 s gate.
  - The same call runs twice: at the end of the upload, and in the next boot's spec→repo reconcile. The upload never finished, so the repo record was never materialized. The reconcile adopted the spec and hit the same wall inside the phase-3 boot step.
- **Fix:**
  - `materialize()` parses the manifest once and indexes the chunks by path. The lookup rule is unchanged: `realPath`, then `fileName`, then `sectionId`.
  - Measured after the fix: 500 files take 136 ms, and a 1364-file adoption (a 30 MB manifest) takes 276 ms.
  - A full import (ingest, materialize, pipeline) takes about 9 s. Most of that is disk writes and the L2–L5 graph pass, which were not touched.

## Fixed: 545 dangling-hook GAP lines per boot

- **Most were not wiring gaps.** About 530 of the 545 were `<file>.import` or `<file>.export` hooks.
  - loom derives these from the static `require()` graph, one pair per file.
  - An unwired end means one of three things:
    - a root file (tests, scripts, servers) that nothing requires;
    - a file whose requires are all dynamic or external;
    - leftovers from building the registry.
  - None of these is "an emit with no listener", which is what the gap claims.
  - `diagnostic/wire-integrity.js` (new, pure) now counts these as one line, not one gap each:
    `[diag] wire-integrity: N require-graph hook(s) without a wire … counted, not raised as gaps`.
- **Named contract hooks keep the old rules:**
  - They are event, IPC and HTTP hooks such as `copilot.prompt.reply`, `guardian.job.dispatch.complete` and `loom.hook.declare`.
  - The 11 in the log are still raised, once each.
- **Imported repos are no longer mapped as Nexus source.**
  - Upload Project writes into `idearium/repo/repos/`, which is inside the tree. The registry refresh had mapped MASTERMIND's own tests as Nexus components: `nexus.idearium.repo.repos.nexus-id-repo-….mm9.tests.…`.
  - `loom/scanners/source-map.js` now skips `idearium/repo/repos` and `idearium/data`, plus their env overrides.
- **The registry can now forget.** `registry.json` used to be add-only.
  - `loom/bootstrap.js` prunes records the scanner owns (uuid `nexus-loom-scan-`) whose file is gone or excluded. It also removes wires whose endpoint hook is gone.
  - Hand-mapped and seeded records are never touched.
  - In a copy of this tree the prune removed 87 components, 22 hooks and 112 wires.
- **Gaps can now close.**
  - A dangling-hook gap used to be opened and never closed, so every one ever raised came back at each boot.
  - `gap-field.resolve(uuid, resolution)` is new.
  - Each scan closes gaps whose hook was wired, removed from the registry, or is a require-graph hook. The row is kept with status `resolved`.
- **Bootstrap is about 3× faster.**
  - `LoomRegistry.has()`, `get()` and `all()` re-read `registry.json` (7 MB) before every read. That was most of the ~4 min bootstrap.
  - The re-read now skips the parse when the file's mtime and size are unchanged, so writes from another process are still seen.
  - Measured: 1 min 27 s.

**Live check:** the real `diagnostic/nexus-diagnostic.js`, run against the pruned registry with three planted stale gaps:

- the 2 stale gaps closed;
- the real one stayed open and was not re-announced;
- 10 real contract gaps were raised;
- 34 require-graph hooks were counted on one line.

## Fixed: the Idearium UI said "connected" when idearium was down

- **Cause:**
  - The UI probed `:4800/health`, then `:9000/api/idearium/health`, and accepted any HTTP 2xx.
  - With idearium down, the orchestrator's proxy answered `200 {ok:false, error:'Idearium timeout'}`. The page showed a green `nexus · :9000/api/idearium` and `connected`.
  - The page also checked only once, at load.
- **Fix, UI (`idearium/ui/js/app.js`):**
  - "Online" now requires idearium's own health body: `ok === true` plus a `version`.
  - Health is re-checked every 10 s. The indicator drops to `idearium offline — click to retry` when idearium dies, and recovers on its own when it comes back.
  - The label names what was checked: `idearium · online`, or `idearium · online via :9000`.
- **Fix, orchestrator:** `GET /api/idearium/health` now returns 503 when idearium is not ok.

## Tests

- **New:** `tests/modules/test-dangling-hooks-and-idearium-load.test.js`, 19 tests, all passing.
  - IM-001 and IM-003 fail on 0.39.259's `materialize`.
  - Registered in `run-all.js` together with 0.39.259's `test-back-and-forth.test.js`, which was missing from the list.
- **Still passing:**
  - idearium: `idearium-auto-repo-creation`, `idearium-ingest-stability`, `idearium-materialize-physical`, `idearium-repo-watcher`, `test-clear-idearium`
  - diagnostic, gap-field and loom: `test-diagnostic-sweep`, `test-diagnostics`, `test-gap-field`, `test-loom-map`, `test-loom-phasemap(-status)`, `loom/test/{contracts,ingest,component-detail}`
  - snapshots and versioning: `test-mco3-versionium-tab`, `test-mcob-*`
  - other: `test-p3-diagnostic-causal`, `loom-context-intent`, `test-back-and-forth`
- **Failing on 0.39.259 too, unchanged:**
  - `test-diagnostic-heal-path` (2)
  - `test-mco3-repo-snapshot` (1, PRESERVE set)
  - `loom/test/schema.test.js` (1)
  - `loom/test/phasemap-map.test.js` (1)

## Not changed

- **The committed `loom/data/registry.json` was not regenerated.**
  - Autopilot's background `node loom/bootstrap.js` refresh prunes it on the next boot.
  - Until that refresh finishes, the diagnostic already treats the leftover MASTERMIND hooks as require-graph hooks. It closes their persisted gaps on the first scan.
- **A new line to expect on the first boot:** `[diag] wire-integrity: closed N dangling-hook gap(s) that no longer qualify`, with N in the hundreds. After that the log should show only the ~11 contract hooks, and those only once.
