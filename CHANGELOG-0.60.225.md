# 0.60.225 — 2026-10-23

James: "confused"

Sent with a screenshot of the Code tab: `RF2_shared_data_directory_is_the_root_of_the_crash` shown **DONE** under runs
(`changed: —`) and **FAILED** in Tasks (`contract-incomplete — gate phase is FAILED`), and the response file in which Gemini
answered "spec/RF2-shared-data-directory-crash.spec" when asked where its code block belonged.

## Why (traced, §0.1)

- RF2 is not a phase. It sits under `root_findings:` in
  `docs/2026-09-05-observability-sovereignty-and-agent-mesh-phasemap.spec`, and the map says of that block: "Not phases — these are
  the confirmed, evidence-backed facts every phase below cites back to."
- Its fix already shipped: DF1 moved guardian off cortex's store, and DL3 (0.60.208) points `guardian/config.js` at
  `lib/data-home.js`. Your boot log shows it working: "guardian brought 5 file(s) home".
- loom's phasemap parser (`loom/scanners/phasemap-map.js`) took anything shaped like `XX1_name:` as a phase. It marked only
  `decisions:` entries (CV6), so RF2 showed as pending work.
- The build sent it to Gemini. Gemini read `guardian/config.js` and `lib/data-home.js`, had nothing to change, and wrote a spec. The
  gate failed it because nothing it named was delivered. The run card's DONE means only that the agent's steps finished; the
  phase's verdict is the gate's FAILED.

## Built (NF1)

- `loom/scanners/phasemap-map.js`: an entry under `root_findings:` is `kind: 'finding'`. It is still listed, so no counts change.
  Nexus's maps hold 8 such entries, all in the 09-05 map.
- `idearium/repo/roadmap.js` carries the kind to the phases manager.
- `lib/phase-dag.js` holds a finding as closed (`status: finding`). It is never open and never queued, and it never blocks a phase
  that cites it. `lib/build-queue.js` does not count it as a phase.
- `idearium/api/index.js` `_phaseBuild` refuses a decision or a finding with 409 `NOT_A_PHASE`. `anyway` does not override this:
  `anyway` overrides an open dependency, and this refusal is about what the entry is.
- `idearium/ui/js/phases.js` labels the card "finding".

## Not changed, said

- Other non-`phases:` sections that hold `XX1_` keys (`traps:`, `blockers:`, `found_while_reading:` and others) are left as they
  are. Some of them hold real phases (FR6 was built from `found_while_reading:`), and they were not measured one by one (§16.4).
- The failed RF2 task stays in the Tasks panel as the record. Retry now returns NOT_A_PHASE instead of sending another job.

## Proof

- `tests/modules/test-root-findings-not-phases.test.js` 5/5. It covers the parser, the roadmap, the DAG, the real 09-05 map, and
  the wiring in the build and the card.
- Unchanged: phase-dag 8/8, phase-census 6/6, verify-first 10/10, loom-phasemap 8/8, loom-phasemap-status 14/14.
