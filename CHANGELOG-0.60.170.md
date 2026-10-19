# 0.60.170 — 2026-10-19 — the pipeline's root causes: a watcher can no longer kill a kernel, the node scan is linear, node and agent file names stay consistent

James, 2026-10-19: "we need to fix the pipeline though. like i said." · "files names must remain consistent."

0.60.169 is left to the session building plan-conflict (AQ1–AQ3): his uploaded test for it names that number.

## What his log showed, and the cause found in the code
- **Orchestrator and Guardian crashed** on `EPERM: operation not permitted, watch … Unhandled 'error' event` (16:22:46, 16:29:43, 16:30:24). No `fs.watch` in the tree listened for `'error'`; on Windows the error arrives after the surrounding try/catch has returned.
- **Idearium silent ~100 s at boot** (watchdog OFFLINE, missed pulses, phase 3 halted). `lib/node-registry.js` read every indexed row of a type once per file: O(n²) over his 12,058 nodes. The coder's reading, to confirm on his next boot: this is the bulk of the silence.
- **`ENOENT … phase:SP5_title:6ceaa59e8eee182c.graph`**: Windows refuses `:` in a file name; these nodes were also written where no listener reads.
- **"Gemini said tests/sp5-title.test.js", "tests/sp5-title.", "tests/sp5-title-test."** written beside the real test (his Versionium tab and Code tree).

## The fix
- RC1 `lib/safe-watch.js` — fs.watch's arguments, the error said once and the watcher re-armed; used at all 13 long-running sites (orchestrator ×2, guardian node registry, lib node registry, node-index watcher, queue, ico, auth ×2, architecture-spec watcher, COS file browser, diagnostic, emerge, idearium drop watcher).
- RC2 `lib/node-registry.js` — one index map per type per scan. Measured here: 12,000-node rescan 10.2 s → 0.95 s.
- RC3 `lib/node-export.js fileIdOf` — refused characters become `~` (a safe id keeps its name); `pipeline-nodes` and the registry use it; the build writes `nodes/graph/` and `nodes/phase/`.
- RC4 `lib/path-guard.js` at `repo-inject propose()` — a chat label removed; a cut name resolved to the one existing file it names, or refused; prose names refused; the change kept on the inject as `pathNote`.

## Proof
`tests/modules/test-pipeline-root-causes.test.js` 6/6. Neighbours: test-repo-inject 100/100 (the first path-guard rewrote an absolute path; this suite caught it, fixed), test-node-registry-system, node-index-watcher, idearium-repo-watcher, test-inject-screen, test-nexus-inject-approval, test-pipeline-nodes, test-node-export, queue, test-diagnostics, test-diagnostic-sweep, test-ico-ledger-writethrough — all green.

## Not proven
- Not run on Windows; no real EPERM was raised (the test injects the one the OS fires).
- Where "Gemini said" first enters a path is not found: RC4 guards the write door; RC5 maps the source.
- Seen while testing, unchanged here: `test-test-first` TF-04 fails (1 ask, not 2) and `test-agent-record` AR-41/AR-42 fail on the uploaded tree as they did before. The root `run-all.js` (the hand-kept copy) lacks every suite since 0.60.16x; only `tests/modules/run-all.js` lists the new one.

## Map, registry, spec
`docs/2026-10-19-pipeline-root-causes-phasemap.spec` (RC1–RC4 built; RC5, VF1–VF5 verify-first, SS1–SS4 each system's own store and seal, UI1–UI3 mapped). Loom: `lib/safe-watch.js` and `lib/path-guard.js` in `loom/maps/run-state-map.js` with 15 consumer wires.
