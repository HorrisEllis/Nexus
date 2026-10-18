# 0.60.144 — 2026-10-17

James: "we need to continue building the flight recorder. look at rfr2, and cfr for friction and tension. versionium, cos test
envirenements and branching for benchmarks. compartemtns to sandbox. how much did it cost to build lang graph and how does mine
compare?"

James, just before, on what it is worth: "no im saying to once proven, email them and tell them i could save them money on
repair costs"

He sent his autopilot log of the IM1 build and a screenshot of the Code tab: IM1 failed after 8 attempts with
"contract-incomplete", and the changes view said "no changes yet".

## Why FR6 first

The coder's reading, to confirm: a claim that the product saves repair costs needs a measured number. That number is what a run
spent on attempts that never landed, and the runs already record it. Nothing read a run whole:

- `phase-cost` counts the calls;
- `phase-faults` names each failure;
- `run-watch` finds stalls;
- none of them says "landed" or "stuck", what was wasted, or why.

## FR6 — flight data

`lib/flight-data.js` (part of the product) reads one run whole from the rows the phase build already writes:

- **the ladder:** the agents it tried, in order;
- **cost:** calls and tokens (`lib/phase-cost.js`);
- **faults** by mode (`lib/phase-faults.js`);
- **landed or not;**
- **wasted:** the calls, tokens and minutes spent on attempts that never landed;
- **friction:** the diagnostic's own definition, failed calls over total calls;
- **tension:** CFR's delta, step to step (`intelligence/cfr/delta.js`). CFR's latency friction maxes out for any agent call
  over 30 s, so it is not used. The record says so.
- **a verdict:** landed, stuck, crashed, turbulent or flying.

A run is **STUCK** when the same failure comes back from two or more different agents. Then the cause is probably the brief
or the phase, not the agent (§17.7).

Where to read it:

- `GET /api/repos/:uuid/flight` (every run, with totals) and `/flight/:runId` (one run);
- the command `repo flight <repo> [<run>]`;
- the Code tab's new **flight** panel (`idearium/ui/js/code-tab-flight.js`, `css/code-tab-flight.css`).

His IM1 run, read by FR6:

```
STUCK · IM1_the_shape_census_as_a_command · 10 attempt(s) · 62 min
  the same failure (timeout) came back from 3 different agents — the brief or the phase is the likely cause, not the agent
ladder: gemini×2 (timeout×2) → chatgpt×2 (timeout×2) → claude×1 (timeout) → deepseek×2 (missed-files×2)
wasted: 7 call(s) · ~46k tokens · 62 min
```

On the log's own timeline, the STUCK verdict first holds at minute 15. Mapped as FR10, stopping there would have saved 5 of
the 7 calls and about 47 of the 62 minutes.

## Fixed, found while building

- **Flight Recorder's standalone command was broken on 0.60.142:** `test-flight-recorder-standalone` 0/6 and carve CV-14
  failing.
  - Cause: `products/flight-recorder/lib/project.js` reached `guardian/jaa-store.js` inside a `try`. That file has been a
    re-export since 0.60.130. The carve treats a require inside a `try` as optional and cut the file, so the copy lacked a file
    the product must carry.
  - Fix: the product now requires `lib/jaa-store.js`, and `product.json` lists it. Now 6/6 and 14/14.
- **Guardian's real timeout messages were filed as `unknown`:** "the caller stopped waiting after 295 s" and "no completion
  within 900000ms". In his IM1 run these were most of the failures. `lib/pipeline-routing.js` now classifies them as timeout.
- **A carved copy read every fault as `unknown`:** `lib/phase-faults.js` reached the classifier inside a `try`, so the carve cut
  it. It is a plain require now; the classifier has no top-level requires of its own.

## Mapped (FR7–FR10)

In `docs/2026-10-16-repo-carve-phasemap.spec`:

- **FR7, the causal record:** runs and changes go into RFR2 (with FM1).
- **FR8, branches for benchmarks:** GW16 through `lib/shadow-space.js`, each branch measured by FR6.
- **FR9, sandboxed in COS compartments:** FR2's tests run through `cos/testenv` auto (VM or process, said).
- **FR10, stop the ladder:** a STUCK run opens a debugging case.

Build order: FR6, FR10, FR8, FR9, FR7, FR5.

## Proof

- `test-flight-data` 7/7, new. His IM1 run is the fixture. FD-06 runs through the real router; FD-07 drives the panel in
  Clear Glass.
- `test-flight-recorder-standalone` 6/6 and `test-repo-carve` 14/14. Both failed on 0.60.142 (checked on the untouched zip).
- Neighbouring suites unchanged:
  - green: change-record 7/7, undo-any-change 6/6, tested-before-lands 5/5, run-state 33/33, route-eligibility 8/8,
    model-door 8/8, reasoning-route 15/15, hardening-pass 9/9, chunked-phase-build 16/16, reject-learn-retry 7/7,
    resource-adaptive 28/28, code-tab 16/16;
  - failing exactly as on the untouched 0.60.142: agent-record 33/35 (AR-41, AR-42) and phase-actually-builds 5/6. Not
    this release's.
- The carved Flight Recorder (189 files) loads `lib/flight-data.js` alone and classifies a timeout as timeout.
