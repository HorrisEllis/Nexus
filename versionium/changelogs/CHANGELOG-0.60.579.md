# 0.60.579 — a port already held is adopted (MG15b)

James, 2026-11-18: "get the pipeline built and upgraded. log all of the progress and notes."

## What changed
MG15b, a port already held is adopted: found running it, Idearium (4800), Guardian (7820) and Orchestrator (9000) were alive and answering but missing from running.node, so every start died on "port already in use" until the circuit opened and the pipeline could not reach Idearium. Before a spawn COS now reads who listens on the system's port (netstat); a live holder is adopted (its health decides up; one that does not answer in 30 s is stopped so a fresh one starts). test-cos-outlive 7/7 (MG15-7 new).

## Files
- cos/manager/supervisor.js: _holderOf(port), adopt-by-port before a spawn
- tests/modules/test-cos-outlive.test.js: MG15-7

## Not done
The running COS manager takes this only after `restart cos` (his act). Then the NM1 build is run again.
