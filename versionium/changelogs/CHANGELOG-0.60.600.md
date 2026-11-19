# 0.60.600 — identical steps linked across pipelines; the gates back

James, 2026-11-19: "I want the ability to have gates branch or expand to other steps if they are identical, like cross domain synthesis, like the relationship between things and the overlap." · "The fuck is this. This needs to go back to the gates."

## What changed
identical steps linked across pipelines, and the gates back (with 0.60.599): (1) a step whose fingerprint (its step, its gate, its inputs, the run's vars) already passed its gate in ANY pipeline links to that node instead of running: the reuse index keeps each passed step by its fingerprint too, and the step is marked reused with the pipeline and step it came from (0.60.594 matched only within one pipeline). The decision stays Emerge's (reuse.eg). (2) 0.60.599: COS's Pipelines tab opens the gate canvas again; the flight map is one click away (◂ Map), never the default. Recorded the same hour: his model of pipelines (from RAID contracts, a gate between every step, steps of steps expanding on events, gates through systems and pipelines, gates as nodes), inventoried in the factory map. test-pipeline-waits-for-a-system 11/11 (PW-11 new).

## Files
- cos/automation/pipeline.js: the reuse index by fingerprint, the link across pipelines
- cos/ui/automation/engine.js (0.60.599): the Pipelines tab opens the gates
- tests/modules/test-pipeline-waits-for-a-system.test.js: PW-11
