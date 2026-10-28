# NEXUS 0.39.178 — overhaul phasemap audit

Every status in `docs/idearium-repository-overhaul-phasemap.spec`, checked
against the code and corrected with the evidence. No code changed; one test
added.

| Phase | Was | Now | Evidence |
|---|---|---|---|
| MCO0, MCO-A | DONE | DONE | (MCO-A note: file_delta is REAL since 176) |
| MCO-B | DONE, "MCO-C not wired" | DONE | clause fixed; MCO-C landed in 177 |
| MCO-C | DONE | DONE | 177 |
| MCO1 graph | NOT STARTED | **DONE** | repo/graph.js, 3 routes, test-repo-graph 53/53 |
| MCO2 verification | NOT STARTED | **DONE** | verify-lazy.js, test-mco2 18/18 |
| MCO3 snapshot | NOT STARTED | **DONE** | snapshot.js, test-mco3 38/38 (174) |
| MCO-F config | NOT STARTED | **DONE** | new test-mcof-config-gate 14/14 |
| MCO6 compartments | DONE | DONE | unchanged |
| MCO-E roadmap UI | NOT STARTED | NOT STARTED (verified) | no roadmap route or UI exists |
| MCO4 hooks/wires/flows/tools | NOT STARTED | NOT STARTED (verified) | no repository:hook/wire/.flow nodes |
| MCO-D zoom | NOT STARTED | NOT STARTED (verified) | `zoom_levels` declared, no reader |
| MCO-G git push/pull | NOT STARTED | NOT STARTED (verified) | no push/pull code; groundwork listed |

MCO1–MCO3 were built and recorded DONE in
`nexus-repository-system-build-phasemap.spec`; this merged file was never
updated. MCO-F was built but nothing had proven its gate.

## MCO-F's gate, now proven
`tests/modules/test-mcof-config-gate.js` (14/14), against the real
`idearium/lib/config.js` and the real spec-engine, isolated dirs:
- `chunk_cap` changes the REAL ingest cap live: 2 refuses 3 files naming the
  cap, 50 admits the same ingest, no restart.
- A copilot write and a human write produce events identical except `actor`
  (and timestamp), and the same resulting state.
- A copilot cannot write a key that is not `copilot_writable` (ssh key path,
  port, chunk node dir) or reset one; a human can.
- Out-of-range, wrong-type and unknown values throw; nothing is clamped.
- Layers default < file < runtime, edits need no restart, a bad config file is
  ignored and reported.
Mutation check: removing the `copilot_writable` enforcement fails the test.

Differences from the schema printed in the phasemap: `chunk_cap` defaults to
20000, not 500 (raised on purpose); `snapshots.import_baseline` exists (177);
`pipeline.snapshot_mode` is read since 177; `pipeline.zoom_levels` has no
reader yet (MCO-D).

## Observed, not fixed
`POST /api/config` takes `actor` from the request body. `copilot_writable:false`
therefore protects `cicd.ssh_key_path` only from a caller that reports its actor
honestly; a caller that sends `actor:"user"` is treated as a human. Section 31
(agents must not touch key material) needs the actor to come from an
authenticated identity. Not touched here: it is an auth-model decision, and MCO-G
(the only consumer of that key) is not started.

## Still open elsewhere
`docs/idearium-creative-repo-overhaul-phasemap.spec` is marked superseded but
still carries the old statuses. Left as history. The ingest-fidelity question
from 176 (an imported file's bytes on disk did not equal the string sent to
`POST /api/repos`) is not investigated.

## Verification
Run: test-mcof-config-gate 14/14, test-loom-phasemap-status, plus the MCO
suites (mco2, mco3, mcob, mcoc, repo-graph), precommit-check. Not run: the full
`run-all.js`.
