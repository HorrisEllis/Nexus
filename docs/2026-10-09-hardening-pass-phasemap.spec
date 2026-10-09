spec:
  meta:
    name:     hardening-pass
    version:  1.0.0
    date:     2026-10-09
    release:  0.51.0 (base)
    uuid:     nexus-hardening-pass-phasemap-v1-0000-2026-1009-jamesbrooks-001
    owner:    idearium (the thread, the runs, the ladder) · lib (spec-document, pipeline-routing, economy router)
    status:   "MAPPED 2026-10-09, before building; HP1–HP5 done (0.52.0); the learning's held-out evaluation stays open (HP4 pushback)"
    voice: >
      The ideas, the direction and the calls are James's. Each phase's `james:` is his, verbatim. `does:` is the coder's
      reading, his to correct. `pushback:` is where the coder thinks the plan as said has a hole — his to decide.
    axioms:   docs/AXIOMS-v3.1.md — §1.1 nothing pretends, §1.2 nothing silently fails, §0.3 nothing lost, §3.3 map before build
    origin: >
      James, 2026-10-09, after forwarding a review of 0.51.0 ("Thoughts?" — "It's ChatGPT"): "Do the hardening pass".
      The review's five invariants were checked against the code before this map: two hold already (a stale diff is
      refused at apply — lib/repo-inject.js compares the base sha256; the ladder is bounded by rungs × retries_per_rung),
      the others are real gaps, each a phase below.
  found:
    - "the thread marks stale only the phases that name an edited block; a phase that depends on a stale phase is not marked (idearium/repo/thread.js)"
    - "a run whose process died (idearium restarted mid-dispatch) keeps its last row — 'building' — forever; nothing reconciles it (idearium_phase_runs)"
    - "the ladder takes routing.ollama_models or routing.escalation as written: a model listed and not installed is still a rung, fails as provider-down, and reads as that model's failure (lib/pipeline-routing.js ladder)"
    - "every failure counts as 1 in the learning (lib/economy/router.js scores): a dismissed draft weighs as much as a failed test"
    - "byte-for-byte round trips are tested on LF files only (tests/modules/test-spec-document.test.js)"
  pushback:
    - >-
      Interrupted runs are found at boot, not by a timer: a run's dispatch lives in the idearium process (a promise), so
      every run left non-final by a process that is gone is, by definition, interrupted. No guess, no heartbeat needed.
      A run that hangs inside a living process is bounded already (copilot's wait, the tool loop's iteration cap).
    - >-
      The learning's held-out check (does routing improve on unseen tasks) needs history this repo does not have yet;
      weighting the signals is done now, the held-out check is said as open, not faked with a toy set.
  phases:
    HP1_stale_spreads_along_dependencies:
      layer: library
      status: "DONE (0.52.0) — idearium/repo/thread.js: each phase carries dependsOn; breadth-first from the directly stale phases, within the map, by full id or short key; staleVia names the nearest stale dependency; a cycle cannot loop. summary.stalePhases counts them, staleDownstream says how many came through a dependency. Phases tab: ↻ via SH1 on the card, stale through X in the detail. test-thread TH-05."
      james: '"Do the hardening pass"'
      depends_on: []
      files: [idearium/repo/thread.js, idearium/ui/js/phases.js]
      does: >-
        A phase that depends (depends_on, transitively) on a stale phase is stale too, saying through which phase
        (staleVia). The Phases tab marks it "↻ via SH1"; the summary counts it.
      proof: "an edited block stales its phase and every phase downstream of it, each naming the phase it came through; an unrelated phase stays clean; a dependency cycle does not loop"
    HP2_interrupted_runs_are_said:
      layer: api
      status: "DONE (0.52.0) — idearium/repo/run-reconcile.js interruptedRows (pure); idearium/api/index.js _reconcileRuns runs in the listen callback: each run whose latest row is building · running · reviewing · retrying · escalating · dispatched · planning and older than this process gets one interrupted row (interruptedFrom, lastAt, provider and rung, build it again). interrupted is final, so a second pass adds nothing; agent-record and phase-faults never count it against an agent. Plan and Phases colour it amber. test-hardening-pass HR-01, HR-02."
      james: '"Do the hardening pass"'
      depends_on: []
      files: [idearium/api/index.js, idearium/repo/run-reconcile.js]
      does: >-
        When idearium starts, every run whose latest row is not final (building, escalating, retrying, reviewing,
        dispatched) gets an 'interrupted' row: idearium restarted while it ran, nothing came back. Its shadow and the
        Plan read it as stopped; a build can be started again.
      proof: "a run left 'building' by a previous process reads 'interrupted' after a restart, with the reason; a finished run is untouched; reconciling twice adds nothing"
    HP3_the_ladder_climbs_only_what_is_installed:
      layer: library
      status: "DONE (0.52.0) — lib/pipeline-routing.js present(rungs, { reachable, installed, error }) → { rungs, skipped }; name ≡ name:latest; agents always stay. The phase build filters before the learned order and the climb, says it on ladderFrom and route.skipped (the Plan shows left off: …), and refuses NO_RUNG with a row when nothing is left. GET /api/routing gives ladder.runnable and ladder.skipped; Settings → Routing says what is left off now. A skip is never an attempt row. test-hardening-pass HR-03, HR-04."
      james: '"Do the hardening pass"'
      depends_on: []
      files: [lib/pipeline-routing.js, idearium/api/index.js, idearium/ui/settings.html]
      does: >-
        Before a phase build climbs, the Ollama rungs are checked against the models installed (the bridge's list): a
        model not installed is skipped, said on the Plan and in Settings → Routing; with the bridge unreachable every
        Ollama rung is skipped, said. A skip is never recorded as that model's failure.
      proof: "a ladder of 3b > 7b > claude with only the 7b installed climbs 7b > claude and says the 3b was skipped; with no bridge it climbs claude, saying why; no failure row names the skipped model"
    HP4_signals_weighted:
      layer: library
      status: "DONE (0.52.0) — lib/economy/router.js scores(): a failed record adds its class weight (SIGNAL_WEIGHTS test-failed 1 · constraint 1 · dismissed 0.5; any other 1); failed stays the count, bad the weight. routing.signal_weights (config-core, Settings → Routing) overrides; policyFrom reads it, plan() and learned() pass it. The ledger keeps class beside reason; recordHop passes it. Held-out evaluation stays open. test-hardening-pass HR-05."
      james: '"Do the hardening pass"'
      depends_on: []
      files: [lib/economy/router.js, lib/pipeline-routing.js, idearium/lib/config-core.cjs]
      does: >-
        A failure counts by what it is: a crash or a failed test 1, a broken constraint 1, a dismissed draft 0.5 (his
        reason may be the spec, not the model) — routing.signal_weights, configurable. Held-out evaluation stays open.
      proof: "two dismissed drafts weigh as one failed test in the learned order; a written weight is used"
    HP5_odd_files_round_trip:
      layer: library
      status: "DONE (0.52.0) — found: a byte-order mark hid every block (the first head line never matched). lib/spec-document.js detect() and parse() read heads without it; the bytes are kept. CRLF, BOM, BOM+CRLF, no final newline, tabs and trailing spaces, mixed endings, an emerge file in CRLF with a BOM: byte-identical, blocks read, an edit to one block leaves every other block's bytes and hash unchanged. test-spec-document SD-08."
      james: '"Do the hardening pass"'
      depends_on: []
      files: [lib/spec-document.js, tests/modules/test-spec-document.test.js]
      does: >-
        CRLF, a byte-order mark, tabs, trailing spaces, no final newline, mixed line endings: an untouched file saves
        byte-identical, an edited block keeps the rest byte for byte, and a block's hash does not move with another
        block's line endings.
      proof: "each odd file round-trips byte-identical; an edit to one block of a CRLF file leaves every other block's bytes and hash unchanged"
