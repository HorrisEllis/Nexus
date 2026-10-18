# 0.60.150 — 2026-10-17

> Built as **0.60.146** on his line (another session, from 0.60.142; uploaded as nexus.zip on 2026-10-18). Renumbered **0.60.150** at the merge into main, which had already released 0.60.143–0.60.146. Version tags in this release's code comments (§0.60.146) are kept as they were written.

James: "do it. did you spec it out. we need to add this all to nexus, there is boundaries mapping it"

His "do it" answers FMR0a. The coder reads it as the recommendation, to confirm: report every failure; replay on request,
and automatically on recurrence or STUCK.

## The boundary, first

The coder checked his boundary census before building. `lib/system-boundary.js check()` showed that the coder's own FR6
(0.60.144) had added a crossing: `lib/flight-data.js -> intelligence/cfr/delta.js`, kernel code reaching up into a system.
The ratchet went from 540 to 541, and `test-system-boundary` SB-06 and SB-08 failed.

His decision D7/IM0e says CFR is intelligence's capability, so the fix is a route:

- `POST /api/intelligence/cfr/delta` (in `intelligence/routes.js` and its registry) returns tension, friction and slope for
  each pair of events.
- `lib/flight-data.js` takes the delta as an input instead of requiring it.
- Idearium's flight route asks intelligence through `lib/nexus-client.js`. When intelligence is down, the flight says
  "tension unavailable" rather than showing zero.

The census is back at 540, and FD-09 and FM-07 hold it there.

## FMR0 — causality measured (diagnostic)

- `diagnostic/lib/causality.js` reads every system's ledger files, from their last 2 MB. Per system it reports how many rows
  name their cause and how many of those causes resolve.
- It is served as `GET /causality`, declared in diagnostic's contract (and so its registry), with the command
  `system causality [<system>]`.
- A share only rises: the high-water mark lives in diagnostic's own data, and a fall is named.
- `diagnostic/config.js` gains `DIAGNOSTIC_DATA_DIR`, like the port.
- On the tree: 72 of 1,467 rows name a cause (4.9%), and **none of the 72 resolves** to a row in any ledger read.

## FMR2 — every failure reaches the record (cortex), partly

- **One writer.** `cortex/self-heal/failure-intake.js` holds the only insert into `failure_modes`. The self-heal ladder now
  writes through it; its rows are unchanged.
- **Dedup.** `record()` dedups by signature (`<faultClass>::<where>`) and counts occurrences: the count §17.7 needs.
- **Enrichment.** A new row is enriched by the existing forensics, with the anchor it came with.
- **Route.** `POST /api/failure-modes` stamps three things on a new row: the CFR field, Nerve's windows (labelled view,
  never evidence) and the environment.
- **The existing route was found and kept.** Cortex already served `GET /api/failure-modes`, read by two provider
  userscripts; the map's sweep missed it. It keeps `modes` exactly as before and adds `failureModes`. There is no second
  route.
- **Callers.** `lib/failure-post.js` is how any system posts, by route through `postDurable` (buffered when cortex is down).
  Two callers are wired:
  - `lib/cos-run.js`: a failed run, with its debug report;
  - `idearium/api`: a phase run ending contract-incomplete, unproven, stalled, refused, or failed with every rung tried, with
    its flight. A STUCK run arrives under the failure its agents shared.
- **Open:** a FAILED contract gate, `lib/error-log.js`, Clear Glass error capture.
- `lib/nexus-client.js`'s buffer now honours `NEXUS_DATA_ROOT`, so tests buffer into their sandbox.

## FMR3 — the report, and its screen

`cortex/self-heal/failure-report.js` reads a failure mode as ten sections. Each names its source, and a missing one is a hole
with the reason:

1. what failed
2. the chain
3. ripple, wave or tidal
4. sigma
5. the CFR field
6. recurrence and fixes on record
7. candidate causes, each with the experiment that separates them (CK-185)
8. on screen (view, not evidence)
9. the environment
10. the macro

Where to read it:

- `GET /api/failure-modes/:id/report`;
- the commands `failure list` and `failure show <id>`;
- the Debug tab's new **failure modes** section (`idearium/ui/js/debug-failures.js`, `css/debug-failures.css`), through
  Idearium `GET /api/repos/:uuid/failure-modes(/:id)`, which asks cortex by route.

## The specs

- The map: `docs/2026-10-17-failure-mode-report-phasemap.spec`, with statuses and addendum (a).
- Addenda in each owning system's spec: `cortex/spec/cortex.spec`, `diagnostic/spec/diagnostic.spec`,
  `intelligence/spec/intelligence.spec`.
- `docs/2026-10-16-repo-carve-phasemap.spec` records the FR6 fix.
- Loom: every new component with its real edges (`loom/maps/build-surface-map.js`).

## Proof

- `test-failure-modes` 9/9, new:
  - his IM1 run reaches cortex as one `timeout` failure, with its flight and hypotheses;
  - the cortex routes run on the real server;
  - FM-08 drives the Debug tab in Clear Glass.
- `diagnostic/tests/causality.test.js` 4/4, new; the route is served by the real diagnostic server.
- `test-flight-data` 9/9 (FD-08 the intelligence route, FD-09 the boundary).
- `test-system-boundary` 10/10, which failed 8/10 on 0.60.144.
- Every suite touching a changed file was run here and on the untouched 0.60.142. The comparison is in this release's notes
  in the session.
