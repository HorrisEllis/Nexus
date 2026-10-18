spec:
  meta:
    name:     failure-mode-report
    version:  1.0.0
    date:     2026-10-17
    release:  "0.60.145 (mapped)"
    uuid:     nexus-failure-mode-report-phasemap-v1-0000-2026-1017-jamesbrooks-001
    owner:    "cortex (the .failure_mode record and its one writer) · diagnostic (the case) · intelligence (rfr2, cfr) · cos (the compartment it replays in) · clear-glass (field, spotlight, macros, the replay viewer) · guardian (fake tab, transcripts) · ollama (the tape) · idearium (the Debug tab)"
    status:   "MAPPED 2026-10-17, before building. Nothing here is built by this map. It joins what exists; each phase names the phase that already owns it, or says NEW."
    voice: >-
      The ideas, the direction and the calls are James's. `james:` is his, verbatim. `does:` is the coder's reading, his to
      correct. `pushback:` is where the coder thinks the plan as said has a hole — his to decide.
    origin: >-
      James, 2026-10-17: "failure mode report thats also a macro to import into a cos test env. nexus nerve, spotlight and
      interaction field for debugging. like look deeply at those systems. so this is a good direction?" · then, on the
      coder's answer (yes, with Nerve as the view and never the evidence, two kinds of macro, semantic addresses, the
      code-side half first): "lets do it. map it all, be thorough. there is probably more lurking around nexus that is useful"
    his_earlier_words_this_answers:
      - "2026-09-12 (cortex/self-heal/failure-mode-forensics.js): \"each system needs .failure_mode nodes that uses the intelligence system to map the events leading up to a failure mode and the effect its having on the system. delta and sigmas for tension and friction score. like the system debugs and uses rfr2 to understand the conditions leading up to a bug/gap/error, make a .failure_mode and .macro to replicate the bug.\""
      - "2026-10-05 (docs/2026-10-05-failure-reproduction-phasemap.spec): \"thats how i want failure mode reports, like creating a macro to reproduce the bug and be able to run it cos.\""
      - "2026-10-07 (docs/2026-10-07-ollama-recorder-phasemap.spec): \"can we use the rewind engine on ollama? like record ollamas process as a macro?\""
      - "2026-10-09 (tests/sim/fake-tab.js): \"loop simulations of every deep and drecursive test and debug method you can for idearium and the agents.\""
      - "2026-10-10 (clear-glass/src/page/attention.js): \"Can you make the commands for the interaction field and maybe integrate it with nexus nerve?\""
      - "2026-10-10 (cos/spec/torture-chamber.spec): \"like maybe a cos template called torture chamber, or something. like with the branching and parralel.\""
    axioms: "docs/AXIOMS-v3.1.md — §3.3 map before build, §8.6 reuse before build, §10.1 one write authority, §10.3 competing truth layers, §17.5 provenance, §17.7 never fix the symptom twice, §1.1 nothing is real until proven, §1.2 nothing fails silently, §0.3 nothing lost"

  # ── The product in one line (the coder's reading, to confirm) ─────────────────
  what_it_is: >-
    When anything in Nexus fails — a test in a COS run, a phase build, a contract gate, an agent run that goes STUCK, a
    crash, a UI action — it becomes a .failure_mode: one report saying what failed, the conditions that led to it (RFR2,
    CFR), what it touched, and what was on screen (Nerve, the field). It carries a .debug_macro: one bundle that reproduces
    it in a sealed COS compartment, with the code at that version, the events that led in, the agents' parts played back
    (the Ollama tape for local models, the fake tab for remote ones) and the UI steps addressed by meaning. The same macro
    passing is the proof of a fix, and it stays as a regression test.

  # ── What exists, read 2026-10-17 at 0.60.144 (the sweep he asked for) ────────
  exists:
    the_record:
      - "cortex/self-heal/failure-mode-forensics.js (his 2026-09-12 ask): a failure_modes row → enriched with the causal chain (cortex/self-heal/index.js _gatherFailureContext → lib/gap-field explainWhy → lib/diagnostic-causal explainFinding → intelligence/relational-field), a sigma delta from sigma_records around the failure, a compound class from orchestrator GET /cfr/compound/:uuid (ripple · wave · tidal, intelligence/causal/compound.js), then exported as a .failure_mode node and a .debug_macro node."
      - "cortex/self-heal/index.js _enterFailureMode — the one writer of failure_modes (§10.1); reached only when a fault class's friction band hits FAILURE_MODE on the self-heal ladder."
      - "lib/node-schemas/schema.debug_macro (+ cortex/schemas copy): status OPEN — 'no general executor exists yet to actually replay these steps against a live system'. generateDebugMacro() writes executable:false."
      - "docs/2026-10-07-heal-nodes-phasemap.spec (MAPPED, nothing built): a .heal node answers a .failure_mode and is 'proven by macro (FM3) or by metric'; 'a heal whose signature recurs … is demoted and its failure_mode reopened'."
    what_failed_sections:
      - "code: lib/cos-debug-report.js — a failed COS run → the error line, the stack frames in the repo, the source around each (node, python, go, rust, ruby, php), read before the run directory is cleaned."
      - "agent runs: lib/flight-data.js (FR6, 0.60.144) — ladder, cost, faults by mode, wasted, friction, tension, verdict STUCK when one failure mode recurs across agents."
      - "phase builds: lib/phase-faults.js modeOf (timeout, wrote-nothing, missed-files, blocked, tool-errors, unproven …), lib/fault-log.js, cortex/self-heal/fault-taxonomy.js (the one writer of fault_taxonomy)."
      - "UI: clear-glass/src/diagnostic/error-capture.js (main-process and page errors, passive), process-metrics.js; lib/error-log.js (the one physical error.log)."
      - "contracts: cortex/core/raid/contract-gates.js (gate FAILED with reasons, evidence, hashes), contract-trace.js (GW3: a contract joined with the ledger)."
    the_conditions:
      - "intelligence/rfr2: kernel (typed edges at ingestion), causality traceToRoot/descendants, clip snapshotRange → a NEX-CLIP (entry events, exit events, parameters, a stability profile, an embedded snapshot), restoreClip → a ReplayContext, validateClipStability(clip, liveDeltas) → does a live run behave like the clipped one."
      - "intelligence/cfr (field: coherence, friction, resonance, entropy, regime; sigma; delta), intelligence/baseline.js, intelligence/causal (anomaly, compound), lib/diagnostic-causal.js, lib/diagnostic-report.js, intelligence/snapshot-trigger.js (snapshot when a sigma is seen, root-tagged)."
      - "the ledgers: lib/component-ledger.js (per component, per system, per day; causedBy when the writer knows it), idearium/lib/event-ledger.cjs, lib/ledger-fanin, lib/activity-log."
    the_view:
      - "Nexus Nerve, lib/nerve/index.js: getSnapshot() — the CFR field, which systems are present (heartbeats), each Clear Glass window's activity. Its invariant (docs/nexus-nerve.spec): 'Nerve determines what is shown, not what is true. No system decision logic may be derived directly from Nerve output.'"
      - "clear-glass/src/page/field.js (0.39.279): field() every interactive target numbered with x, y, w, h and z (layers covering it), at(x,y) the stack under a point, spotlight() a ring on a target with a label, describe() as short text lines; an overlay drawn so he sees what the agent sees."
      - "clear-glass/src/page/attention.js (FN2, 0.59.0): each window's last field map, spotlight and pointer, served at GET /cli/attention; Nerve reads it."
      - "clear-glass/src/page/semantic-tree.js (SP1): an element's address by role and name — main › form \"chat\" › button \"Send prompt\" — that survives class renames."
    the_macros:
      - "clear-glass/src/macros: recorder-script (click, input never from a password field, Enter, scroll, navigation keys), live-recording (MR1: the .macro node exists from the first second, grows on every drain), recording.js (events → steps)."
      - "clear-glass/src/automation/nodes.js: .macro and .workflow as node files; a .workflow carries the macros it runs inside payload.requires, so importing it elsewhere gives something that runs — the bundle pattern a .debug_macro needs."
      - "clear-glass/src/rewind/engine.js: a browser time machine per agent (URL, DOM hash, cookies, local/session storage, scroll) — a UI macro's starting state. It persists auth tokens to disk (its own header says so)."
    the_agents_played_back:
      - "ollama/lib/tape.js (OR1–OR3 built 0.44.0): every local model call is a frame (model, options, seed, prompt, answer, timings); NEXUS_OLLAMA_REPLAY=<run>|all answers the same with Ollama stopped and refuses an unrecorded call (test-ollama-tape OR-03, OR-04)."
      - "tests/sim/fake-tab.js (HP19 0.55.2): speaks guardian's real NCP like a provider userscript; MODE answer | smart | silent | slow (SLOW_MS) | error | pickreply | dropafterdeliver | partial — the whole stack with no browser. tests/sim/loop.js drives Idearium's loop through it."
      - "guardian/lib/chat-transcripts.js: every provider chat kept as one versioned transcript — what a remote agent actually answered."
    the_sandbox:
      - "cos/testenv (process | vm | auto; an ephemeral qcow2 overlay, no network after install, a tar disk that works on Windows hosts); cos/compartment/qemu-runtime.js; cos/playground/sandbox.js (a branch in an isolated child process)."
      - "branching: cos/playground/branch.js, cos/workspace (git worktree + qcow2 overlay), lib/nexus-self/branch.js — three mechanisms (SN0 picks one); lib/shadow-space.js; lib/safe-apply.js (mirror → branch → check → merge back, RAID-gated)."
      - "cos/playground/compare.js: file diff, run metrics, stdout diff, regression map across branches."
      - "cos/spec/torture-chamber.spec and cos/spec/lab.spec (specced 2026-10-10, not built): stations from the QA catalog in branched compartments; variants include slow-agent and failing-agent."
    the_surface:
      - "Idearium's Debug tab (idearium/ui/js/app.js renderRepoDebug ← GET /api/repos/:uuid/debug): syntax, broken imports, missing packages, parse failures, failed tiers, COS runs with each failure's debug report, agent errors."
      - "the Code tab's flight panel (FR6), changes panel (FR1, undo FR3), runs panel (rewind-run)."
    the_methods:
      - "cos/spec/check-catalogue.spec — the cause family a report is held to: CK-122 one id follows a request across every system; CK-184 five whys; CK-185 differential diagnosis (hypotheses listed, one experiment separates them); CK-107 the fix lands at the rule that produced the symptom; CK-202 a failure examined through more than one signal."

  # ── What the sweep found (each with its evidence) ───────────────────────────
  found:
    hollow_failure_modes: >-
      All 9 .failure_mode nodes in the tree (cortex/data/nodes/failure_mode, from his machine) are memory_pressure, with
      root null, conditions [], no compound class and no .debug_macro; cortex/data/nodes/debug_macro does not exist. The
      record works; nothing reaches it with a cause attached.
    only_one_road_in: >-
      failure_modes is written only by _enterFailureMode, which only the self-heal ladder reaches (a fault class's friction
      band hitting FAILURE_MODE). A failed COS test, a contract-incomplete phase, a STUCK agent run, a FAILED gate, a
      crash: none of them ever becomes a .failure_mode. That is why every one in the tree is memory_pressure.
    causality_is_thin: >-
      Of 1,467 ledger rows tracked in the tree, 72 (4.9%) carry causedBy; architect's 1,055 rows, copilot's 112 and the
      orchestrator's 99 carry none. RFR2 never walks a row without one (rule C-1), so a chain from such a row stops at
      once. (A sample tracked in git, not his live machine; to measure there, FMR0.)
    crystals_from_noise: >-
      His autopilot log of 2026-10-17 shows intelligence crystallising 'component: registered reliably appears before
      failures [failure scan] — 161×' and 'ledger: eros registered … 40×': boot events that co-occur with the failure scan
      itself. Without causal edges, co-occurrence is crystallised as precursor. The same root as the two above.
    stale_claim_in_forensics: >-
      failure-mode-forensics.js says RFR2's kernel 'does NOT exist in this codebase' (citing docs/RFR2-KERNEL-CONTRACT.md,
      2026-07-09). intelligence/rfr2/kernel was harvested on 2026-07-24 (intelligence/rfr2/index.js §JOB 2). The module
      routes around a kernel that exists.
    the_map_missed_the_module: >-
      docs/2026-10-05-failure-reproduction-phasemap.spec (FM1–FM4) never names failure-mode-forensics.js, .failure_mode or
      .debug_macro, and plans 'lib/failure-macro.js' beside them. Two plans for one thing (§10.3); this map joins them:
      FM2's macro IS the .debug_macro, made executable.
    no_replay_route: >-
      No system has an event replay route (searched '/replay'): cortex's GET /api/replay/inspect returns the last 50
      event_log rows. FM3's pushback of 2026-10-05 still holds: without one, an event macro can be read, not run.
    the_first_proof_case: >-
      IM1 (his log, 2026-10-17): the caller waits 300000 ms (lib/repo-agent.js:724, idearium/api/index.js:2199; guardian
      abandons at 295 s: 'the caller stopped waiting after 295 s', guardian/ask.js:297) while guardian itself waits 900000
      ms for a completion, and Gemini thinks for minutes before its reply element fills (0.60.142's finding). Five of IM1's
      seven calls ended that way across three agents. It reproduces with no browser and no provider: the real stack plus
      tests/sim/fake-tab.js MODE=slow SLOW_MS=360000. The first macro this map builds is that one.
    secrets_in_state: "clear-glass/src/rewind/engine.js persists cookies and storage, auth tokens included, to its snapshot files: a UI macro that carries its starting state carries them unless masked."
    three_branchers: "cos/playground/branch.js, cos/workspace, lib/nexus-self/branch.js — SN0 (docs/2026-10-10-snapshot-compartments-phasemap.spec) is open; every replay compartment stands on whichever it picks."

  # ── How the pieces join (the coder's design, to confirm) ────────────────────
  design:
    the_failure_mode_is_the_report: >-
      No new record. The .failure_mode node (cortex's, one writer) is the report's record; the report is a projection over
      it (like lib/change-record.js): it reads the sections from where they live and stores none of them twice.
    nerve_is_the_view_never_the_evidence: >-
      By his own invariant. The report's cause comes from the ledgers, RFR2 and CFR. Nerve and the field give the timeline
      a person watches: which windows were active, the field map, the spotlight, the pointer, at each step. A section that
      says what was on screen is labelled as such and is never used to pick a root.
    one_macro_three_kinds_of_step: >-
      The .debug_macro stays the one node, made executable, bundled like a .workflow (payload.requires):
        snapshot   the versionium commit of the code it failed on, and the environment (Nexus version, host OS, systems up,
                   providers, models and digests)
        events     the clip (rfr2 snapshotRange) cut from the on-disk ledger: what entered from outside, masked
        agents     local model calls → an Ollama tape run id; a remote provider → a fake-tab profile { provider, mode,
                   slowMs (measured from the flight), reply (from chat-transcripts) }
        ui         Clear Glass .macro steps addressed by semantic-tree address; field number, x/y and the spotlight kept for
                   display only; the starting state from the rewind engine, secrets masked
        expect     the exit condition that is the failure (the error line, the gate FAILED, the fault mode, the beat that
                   did not come) and the clip's stability profile
    what_reproduced_means: >-
      In a sealed compartment at the snapshot, the macro's expect condition recurs AND validateClipStability says the run
      behaved like the clip. Recurs without matching: 'reproduced, by a different path' (said). Does not recur: 'not
      reproduced', with what differed. Needs what the compartment cannot have (a live login, Windows, a GPU): 'not
      reproducible here', named — never a pass.
    what_proven_means: "the same macro, at the fix's version, does not hit the expect condition, and the fix's linked tests pass (FR2). The macro then stays as a regression test."

  # ── His decisions, first ─────────────────────────────────────────────────────
  decisions:
    FMR0a_reproduce_when:
      question: "Every failure gets a report (cheap). Should every failure also be replayed in a compartment automatically, or only on request?"
      options:
        - "report always; replay on request, and automatically for a failure that recurs (its second occurrence, §17.7) or a run that goes STUCK (coder's recommendation)"
        - "replay every failure automatically (a compartment per failure: machine time and disk)"
        - "replay only on request"
      status: "HIS — it spends his machine's time and disk."
      answered: "2026-10-17 — James: 'do it.' — read by the coder as the recommendation above (report always; replay on request, and automatically on recurrence or STUCK). To confirm."
    FMR0b_macros_leave_the_machine:
      question: "Can a .debug_macro be exported to someone else (a demo, a customer)?"
      status: "DECIDED 2026-10-17 by his axioms — yes, and always masked: config keys marked secret, tokens, cookies and storage values are replaced with {{secret:<name>}} at cut time, never at export time (a secret that reached the file is already lost). §17.6 auditable, the security lens of the Six Lenses; FM's own pushback of 2026-10-05."
    FMR0c_first_replay_route:
      question: "Which system gets the first replay route?"
      status: "DECIDED 2026-10-17 by his axioms (§16.1 the nearest gap; §3.1 bottom-up): guardian's job path first, because the first proof case (IM1) is an agent failure and guardian + fake-tab already run sealed; then versionium (3 systems depend on it, its operations are deterministic)."
    FMR0d_nerve_role:
      status: "DECIDED by his own invariant (docs/nexus-nerve.spec attention-non-truth): Nerve is the report's view, never its evidence."

  # ── Phases, bottom-up. Each names its owner; NEW means no map holds it yet ──
  phases:
    FMR0_causality_measured:
      status: "BUILT 0.60.146 — diagnostic/lib/causality.js, GET /causality, `system causality`, a high-water ratchet in diagnostic's own data; diagnostic/tests/causality.test.js 4/4. OPEN: the writers it names (phase-run, guardian job, cos-run rows) passing causedBy (IDS3)"
      owned_by: NEW
      depends_on: []
      does: >-
        A number per system: the share of its ledger rows that carry causedBy, and of those, how many resolve to a row that
        exists. `system causality [<system>]`, GET /api/system/causality, a ratchet like DB1's (it only goes up). The first
        writers to fix are the ones a failure passes through: phase-run rows (phase:, run:@attempt — IDS3 of
        docs/2026-10-17-debugging-product-phasemap.spec), guardian job rows (job → run), cos-run rows (run → snapshot).
      proof: "a fixture ledger with 3 of 10 rows linked reads 30%; a writer that starts passing causedBy raises it; a row whose causedBy points at nothing is counted as dangling"
    FMR1_every_ledger_into_rfr2:
      status: OPEN
      owned_by: "FM1 (docs/2026-10-05-failure-reproduction-phasemap.spec)"
      depends_on: [FMR0_causality_measured]
      also: "failure-mode-forensics.js uses intelligence/rfr2/causality traceToRoot when relational-field returns no conditions, and its stale 'kernel absent' note is corrected by addendum (§0.3)."
    FMR2_every_failure_reaches_the_record:
      status: "PARTLY BUILT 0.60.146 — cortex/self-heal/failure-intake.js (the one insert; the ladder writes through it), POST /api/failure-modes (the existing GET kept), lib/failure-post.js; a failed COS run and an unlanded phase run (with its flight) post by route. test-failure-modes FM-01..07. OPEN: a FAILED contract gate, lib/error-log.js, Clear Glass error capture"
      owned_by: NEW
      depends_on: []
      does: >-
        cortex gains POST /api/failure-modes (the one writer behind its route, DB3's drawbridge rule; never a second
        insert). Failures that today never arrive post to it with their anchor (ledger system + entry uuid, so forensics
        and /cfr/compound can walk from it): a failed COS run (lib/cos-run.js, with its cos-debug-report), a phase run that
        ends contract-incomplete or unproven (idearium/api), a flight that turns STUCK (lib/flight-data.js), a contract gate
        FAILED (contract-gates.js), an uncaught error (lib/error-log.js, clear-glass error-capture). Dedup by signature
        (fault class + where), occurrences counted — the count §17.7 and FMR0a need.
      proof: "a fixture COS run that fails a test becomes one .failure_mode with its debug report and anchor; the same failure again is occurrences 2, not a second node"
    FMR3_the_report:
      status: "BUILT 0.60.146 — cortex/self-heal/failure-report.js; GET /api/failure-modes/:id/report; `failure list`, `failure show <id>`; test-failure-modes FM-03/04/06"
      owned_by: "FM4's content (failure-reproduction) — built here as the projection"
      depends_on: [FMR2_every_failure_reaches_the_record]
      files: [cortex/self-heal/failure-report.js]
      does: >-
        report(failureMode) → sections, each pointing at its source and saying when it is missing (a hole, named):
        what failed (cos-debug-report · flight · fault mode · gate · error) · the chain (forensics conditions, rfr2 trace,
        holes where causedBy was absent) · compound class · sigma before/at · the CFR field at the failure · the systems it
        crossed (drawbridge crossings on the chain) · recurrence (occurrences, fix_map precedent, phase-faults precedent) ·
        the hypotheses (CK-185: each candidate cause and the one experiment that would separate them) · on screen (Nerve and
        the field around the failure, labelled as view) · the environment. GET /api/failure-modes(/:id)(/report),
        `failure list | show <id>`.
      proof: "a fixture failure with a two-step causedBy chain reports both steps; one with a broken link reports the hole; the on-screen section is present and marked 'view'"
    FMR4_the_macro_bundle:
      status: OPEN
      owned_by: "FM2 (failure-reproduction) — as the existing .debug_macro, not a new lib/failure-macro.js"
      depends_on: [FMR1_every_ledger_into_rfr2, FMR3_the_report]
      files: [cortex/self-heal/failure-mode-forensics.js, lib/node-schemas/schema.debug_macro, intelligence/rfr2/clip/index.js, clear-glass/src/automation/nodes.js]
      does: >-
        generateDebugMacro grows the five parts of the design (snapshot, events, agents, ui, expect), bundled the
        .workflow way. Secrets masked at cut time (FMR0b). The schema moves from OPEN to REAL only when FMR6 runs one.
        An agent failure's agent part is built from the flight (FR6): the provider, the mode its attempts ended in, the
        time it took, and the reply from chat-transcripts.
      proof: "IM1's failure becomes a macro whose agent part is { provider: gemini, mode: slow, slowMs ≥ 300000 }, whose expect is fault mode timeout, and whose snapshot is the commit it ran on; a token in a row arrives as {{secret:…}}"
    FMR5_replay_routes:
      status: OPEN
      owned_by: "FM3's pushback (failure-reproduction); the genesis skeleton gains it so every new system has one"
      depends_on: [FMR4_the_macro_bundle]
      files: [guardian/server.js, guardian/lib/replay-mode.js, versionium/server.js, versionium/routes/system.js]   # 0.60.147 DG2: given so the phase has a graph (the coder's placement, each in the system it serves, to confirm)
      does: >-
        A sealed replay mode (NEXUS_REPLAY=1): no outbound calls, the Ollama tape in replay, guardian pointed at a fake tab,
        clocks from the macro. Each system: POST /replay { events } that feeds its own bus through the same entry its real
        events use, marked replay in its ledger. Guardian first (FMR0c), then versionium; then each system as it moves to
        the genesis shape (IM5).
      proof: "guardian in replay mode takes a job, the fake tab answers slow, the caller abandons at its limit exactly as in the log; nothing leaves the process"
    FMR6_run_it_in_cos:
      status: OPEN
      owned_by: "FM3 (failure-reproduction) + SN1 (snapshot as compartment)"
      depends_on: [FMR5_replay_routes, "SN0_one_branch (snapshot-compartments)"]
      files: [cos/testenv/index.js, cos/testenv/replay.js]   # 0.60.147 DG2: moved into cos, the system it serves (addendum b)
      does: >-
        cos/testenv/replay.js run(macro): open the snapshot as a lazy branch (SN0's mechanism), start the systems the macro
        names in replay mode inside the compartment (process backend by default, VM when the macro needs a guest), start
        the fake tab with its profile and the tape, feed the events through the replay routes, drive the ui steps with
        Clear Glass's driver (clear-glass/src/driver/glass.js — the same engine the tests use), watch for expect, then
        validateClipStability. Verdict: reproduced · reproduced by a different path · not reproduced (what differed) · not
        reproducible here (what it needs). POST /api/failure-modes/:id/reproduce, `failure reproduce <id>`.
      proof: "IM1's macro reproduces in a compartment with no browser and no network: the caller abandons at 295 s against a 360 s agent; the verdict is reproduced"
    FMR7_a_fix_proven_by_its_macro:
      status: OPEN
      owned_by: "the .heal node (docs/2026-10-07-heal-nodes-phasemap.spec) + FR2 + DP8/DP9 (debugging product)"
      depends_on: [FMR6_run_it_in_cos]
      does: >-
        `failure prove <id> --at <version|change>`: the same macro at the fix. Passes → the .heal is proven, the fix_map
        row is written (crystallized by proof, DP9), the macro is registered as a regression test (tests/failure-macros/,
        run by run-all). Fails → the heal stays proposed and the report says what still happens. A heal whose failure
        recurs later is demoted and its failure_mode reopened (heal-nodes' own rule).
      proof: "IM1's fix (the caller's wait raised past guardian's, or a thinking keep-alive extending it) — the macro passes at the fix and fails at the commit before it"
    FMR8_the_report_on_screen:
      status: "PARTLY BUILT 0.60.146 — the report section: the Debug tab's failure modes (idearium/ui/js/debug-failures.js, css/debug-failures.css) through Idearium GET /api/repos/:uuid/failure-modes(/:id), cortex by route; FM-08 in Clear Glass. OPEN: Reproduce in COS, Prove a fix, Export, the replay viewer (they need FMR4–FMR7)"
      owned_by: "FM4 + PE8 + DB7 (the UI reads routes and holds no logic)"
      depends_on: [FMR3_the_report]
      does: >-
        The Debug tab's 'failure modes' section: each failure with its verdict and occurrences; the report; Reproduce in
        COS, Prove a fix, Export macro. The replay viewer in Clear Glass: a ui part replays with the field overlay on and
        the spotlight ring on each step's target (field.js spotlight), the step that breaks marked; beside it the Nerve
        strip (attention over time) and the causal chain. Tested in Clear Glass.
      ui_first_slice: "the report section can ship right after FMR3, before any replay exists — it is the first thing he sees."
    FMR9_agents_have_it:
      status: OPEN
      owned_by: "DB8 (every route has a command)"
      does: "failure list · show · report · reproduce · prove · export · import as command rows, so copilot and every repo agent reach them through nexus.command; an agent fixing a failure is handed the report as its brief."
    FMR10_it_compounds:
      status: OPEN
      owned_by: "torture chamber (cos/spec/torture-chamber.spec) · FR8 / GW16 (branches for benchmarks) · DP9 (fix_map) · crystals"
      depends_on: [FMR7_a_fix_proven_by_its_macro]
      does: >-
        Every proven macro becomes a torture-chamber station ('this failure must not come back') and a benchmark task (the
        same macro handed to N agents in branches, compared with cos/playground/compare.js: who lands the fix, at what
        cost). Crystallization is gated on causal edges: a pattern is crystallised as a failure precursor only when an RFR2
        path joins it to the failure, never on co-occurrence alone (found: crystals_from_noise).
    FMR11_import_into_any_test_env:
      status: OPEN
      owned_by: "FR4 (stands alone) + the carve (products/flight-recorder)"
      depends_on: [FMR6_run_it_in_cos]
      james: '"a macro to import into a cos test env"'
      does: >-
        `failure import <file.debug_macro>` into any COS test environment — another machine, a carved Flight Recorder, a
        customer's repo: the bundle carries its snapshot reference (or the files, for an outside repo), its profiles and its
        tape, and runs there the same way. This is the piece that makes it a product, and the demo (FR5).

  build_order: [FMR0, FMR2, FMR3, FMR8 (report section only), FMR1, FMR4, FMR5, FMR6, FMR7, FMR9, FMR11, FMR10]
  build_order_reason: >-
    §16.1, the nearest gap first, and value early. FMR0 and FMR2 are small and every report after them depends on them: a
    cause to walk, and a road into the record. FMR3 with its screen is what he sees first, on real failures, before any
    replay exists. Then the macro (FMR1, FMR4), its executor (FMR5, FMR6) and the proof (FMR7), each with IM1 as the case
    that must pass. Commands with each phase as they land (order of delivery); FMR9 collects the rest. FMR11 makes it travel;
    FMR10 makes it compound.
  first_proof_case: >-
    IM1, from his own log: a timeout shared by three agents, reproducible offline through the fake tab. Every phase from
    FMR4 to FMR7 is proven on it first, so the first end-to-end run of the product is a real failure of his, reproduced,
    fixed, and proven — the recording FR5 and the outreach email need.

  not_verified:
    - "that the process backend can run guardian, idearium and a fake tab together inside one compartment without ports clashing (each needs its own; to check in FMR6)."
    - "that Clear Glass's driver engine is available inside a compartment on his Windows host (it is in this coder's Linux container: CR-06 and FD-07 ran)."
    - "that validateClipStability's thresholds suit agent runs measured in minutes (it was written for event streams); FMR6 measures before trusting it."
    - "that every writer FMR0 names can learn causedBy without changing its readers."

  # ── ADDENDUM 2026-10-17 (a) — built 0.60.146, and the boundary it had to respect ───────────────────────────────
  # James, 2026-10-17: "do it. did you spec it out. we need to add this all to nexus, there is boundaries mapping it"
  # The spec: this map, plus a dated addendum in each owning system's spec (cortex/spec/cortex.spec, diagnostic/spec/diagnostic.spec,
  # intelligence/spec/intelligence.spec). The boundaries: lib/system-boundary.js check() found that FR6 (0.60.144) had added an
  # upward crossing, lib/flight-data.js -> intelligence/cfr/delta.js (540 -> 541; test-system-boundary SB-06/SB-08 failing). Fixed by
  # offering CFR's delta on intelligence's route; every piece here crosses only by route (lib/nexus-client.js); FD-09 and FM-07
  # hold the census at 540.
  # Found while building: cortex already served GET /api/failure-modes (the last 20 rows, read by two provider userscripts) —
  # missed by this map's sweep. Kept and extended (one answer per path, §10.3), never a second route.
  built_a: [FMR0 (built), FMR2 (partly), FMR3 (built), FMR8 (the report section)]
  next_a: [FMR2 rest (gate FAILED, error-log, Clear Glass errors), FMR1, FMR4 (the macro, IM1 first), FMR5, FMR6, FMR7]

  # ── ADDENDUM 2026-10-18 (b) — every open phase's dependency graph, before any of it is built ─────────────────────
  # James, 2026-10-18: "each phase, has to have a dependany graph before executing." (DG2, 0.60.147; docs/CLAUDE.md)
  # Run on this map with lib/phase-graph.js before writing any more code for it. What the graphs said, and what changed:
  #   - FMR5 had no graph: it named no file and none could be found. Given files, each in the system it serves: guardian
  #     first (FMR0c), then versionium. The placement is the coder's; to confirm.
  #   - FMR6 planned lib/failure-replay.js, which requires cos/testenv: a new upward crossing that the graph cannot see for a
  #     file that does not exist yet. The coder caught it reading the graph. Moved to cos/testenv/replay.js (D1: lib/ is the
  #     kernel and never reaches up). The earlier name stays in the comment beside it (§0.3).
  #   - FMR1, FMR4, FMR10: graphs ready. Every crossing they show is already in the ratchet's baseline; none would be new.
  #   - FMR11: its graph is mapped from words ("evidence") and pulls in files the phase only mentions. Its files are to be
  #     declared before it is built.
