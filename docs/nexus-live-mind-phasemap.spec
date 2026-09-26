spec:
  meta:
    name:        nexus-live-mind
    version:     0.1.0-phasemap
    status:      ALL 6 PHASES DONE 2026-08-12 (P1-P4 done 2026-08-07; P5/P6 completed same
                 session as the marker fix — P5 had a real silent bug (whoAmI's
                 getHypotheses call always returned empty), P6 had two real gaps
                 (switchAgent ungoverned, lib/chains.js unwired) — both found and
                 fixed by live verification, not assumed from the old "foundation
                 wired" note. The full vision, mapped before build, now built.
    uuid:        nexus-live-mind-v0-0000-2026-0807-001
    author:      James Brooks
    intent: >
      Make NEXUS a live, autonomous, self-aware system: every system's events
      flow through the intelligence system to autopilot + co-pilot, all logged in
      cortex, read by intelligence AND diagnostic; a real diagnostic kernel using
      RFR2+CFR+registry+loom+intelligence to find gaps/tension/friction AND their
      causes; the replay engine snapshotting on every sigma, used for bottleneck
      detection and timeline debug/revert; and co-pilot as the MIND — dynamic,
      fully system+user aware, with a full toolbox, programmable (schedule/
      automate/workflows/switch model or agent).

  architecture_restated:   # James, definitional — the map this builds toward
    cortex:       "the BRAIN — substrate, memory, event_log, CFR field, snapshots, RAID."
    copilot:      "the MIND — the self; bridges James and the system; port 3750."
    intelligence: "how the mind LEARNS/understands/optimizes/diagnoses — a faculty, not a peer."
    raid:         "decision-making + governance — what the mind may do."
    loom_registry:"self-awareness — the self-model of connections; how it fixes itself."

  substrate_already_built:   # §8.6 — this session. DO NOT rebuild; wire these.
    - "lib/ledger-fanin — unified event fan-in; every system emits, any consumer subscribes once; coverage() names silent systems."
    - "lib/activity-log — subscribes fan-in → cortex event_log + error_log per system, history preserved."
    - "cortex/intelligence/relational-field — RFR2 causality.traceToRoot + sigma.classify: the conditions behind friction."
    - "lib/snapshot-trigger — friction → relational-field → replay.snapshot tagged with causal root; debounced, meaningfulness-gated."
    - "lib/replay-engine — snapshot()/replay() over cortex state (exists)."
    - "loom/scanners/{capability-map,spec-map} — 3-layer self-model (spec vs capability vs source)."
    - "lib/gemini-toolbox — synchronized line addressing (separate track)."

  governing_axioms:
    - "§3.3 map before build (this file). §8.6 reuse — the substrate above is built; wire it, don't rebuild."
    - "§10.3 one source of truth — this is THE plan; no competing partial builds."
    - "§1.1 declared≠real — every wire proven against source. §1.2 nothing silently fails."
    - "§0.3 nothing lost. §always — every new component into loom WITH wires; addenda to specs; register specs."

  # ── DEPENDENCY ORDER — each phase assumes the ones before it ────────────────
  phases:

    P1_nervous_system_live:   # ← DONE 2026-08-07, suite 1319/0. Producer wire at component-ledger.write(); consumers wired at autopilot boot.
      priority: FOUNDATION — everything else assumes the stream is actually flowing.
      does: >
        Boot-wire the fan-in. At each system's boot, bridgeLedger() its event
        ledger into lib/ledger-fanin. Subscribe intelligence, autopilot, and
        co-pilot's continuous stream ONCE each. Enable activity-log for all
        systems. Result: every system's events → fan-in → intelligence + autopilot
        + co-pilot + cortex logs, live.
      reuse: "fan-in + activity-log already built; this is boot wiring, not new logic."
      gate:  "coverage() shows all expected systems feeding; intelligence/autopilot/copilot each receive events from every system; event_log grows for all."
      drift: "each system's boot differs — some emit already, some need a ledger bridged. Per-system wiring is the surface."
      axioms: [§8.6, §1.1, §1.2]

    P2_snapshot_on_sigma:   # ← DONE 2026-08-07, suite 1326/0. snapshot-trigger rebuilt (§0.3, lost between trees) + wired to the live sigma stream.
      depends_on: P1
      does: >
        Wire the snapshot-trigger to fire on EVERY sigma detected in the system
        (via the now-live stream): sigma event → relational-field traces the
        conditions → replay.snapshot tagged with causal root. The timeline of
        snapshots becomes the debug/revert tool.
      reuse: "snapshot-trigger + relational-field + replay-engine all built; wire to the live sigma stream from P1."
      gate:  "a real sigma produces a snapshot with its causal root; snapshots accrue a timeline; revert works."
      drift: "sigma volume — debounce/meaningfulness gate tuned live so it snapshots meaningfully, not every tick."
      axioms: [§13.4, §16.4]

    P3_diagnostic_kernel:   # ← DONE 2026-08-07. Fixed the CIRCUIT OPEN crash (sseClients TDZ) + added lib/diagnostic-causal (conditions behind findings via RFR2 + live substrate).
      priority: FOUNDATION — everything else assumes the stream is actually flowing.
      depends_on: [P1, P2]
      does: >
        A real diagnostic kernel with the same architecture as other systems: CLI
        + proper commands, dynamic component list in cortex, persistence through
        cortex, API + SSE with event-ledger fed to autopilot. It USES
        RFR2+CFR+registry+loom+intelligence to find gaps/tension/friction AND the
        conditions that created them (relational-field), and reads the fan-in +
        loom scanners. Replaces the crash-looping service/nexus-diagnostic.js
        (sseClients ReferenceError, circuit-open on James's boots).
      reuse: "relational-field, fan-in, loom scanners, CFR field, snapshot health — all built; the kernel composes them."
      gate:  "diagnostic kernel boots clean (no sseClients crash), CLI runs, findings persist to cortex, SSE→autopilot, findings include causal conditions."
      drift: "the existing diagnostic crashes on boot — fixing vs replacing is the decision; map the existing one first (§8.4 scan callers)."
      axioms: [§1.1, §1.2, §8.4, §17.6]
      addendum_2026_08_09: >
        CORRECTION, not a quiet edit (§0.3): P3 was marked DONE having built
        diagnostic-causal.js, but diagnoseDeep(findings) took findings as a
        parameter with no real default — its one live caller (copilot/lib/
        nexus-awareness.js) passed opts.findings || [], so "finds gaps/
        tension/friction" was never actually true by default; it only
        explained whatever a caller happened to hand it. Separately,
        cortex/gap-finder/index.js — a DIFFERENT, older organ, still live
        in cortex/boot.js — was independently writing anomaly/sigma gaps to
        the same 'gaps' table this whole time, unreconciled, exactly what
        §10.3 on this file's own header says shouldn't happen. A third,
        independent writer was found in the same pass: copilot/lib/
        user-model.js's checkContradictions() ("modeling James" — conflicting
        high-confidence hypotheses) was ALSO writing to 'gaps' directly, with
        no dedup check at all — a real bug, inserting a duplicate row on
        every call that found the same live contradiction.
        FIXED: lib/gap-field.js is now the one agnostic entry point — domain:
        'system' | 'user-model', same dedup/occurrence/causal-wire treatment
        either way (James: "needs to stay agnostic, gap field... this is also
        for modeling me, reducing ambiguity"). gap-finder and
        checkContradictions both route through it instead of their own inline
        writes; diagnoseDeep() now defaults to gap-field's real open gaps
        instead of silently accepting an empty array. 8 tests
        (tests/modules/test-gap-field.js), all three producers + the
        loop-closing default verified against the real store, not mocked.

    P4_copilot_awareness:   # ← DONE 2026-08-07. capabilities (what can you do) + nexus-awareness (rundown/whats-wrong/versions from real state).
      depends_on: [P1, P3]
      does: >
        Co-pilot becomes fully system-aware using loom + diagnostic + intelligence
        + the live stream. Ask it anything about cortex/models/system/diagnostic
        and it answers from real state. "What can you do?" → a full, real list of
        tools/capabilities/commands (from loom's registry + the capability map).
        A model OF nexus it uses for nexus questions. Reads the fan-in stream so
        it's aware of live activity.
      reuse: "loom capability-map (255 caps), diagnostic kernel (P3), intelligence, fan-in — co-pilot queries them."
      gate:  "'what can you do' returns the real capability list; 'what's wrong' uses the diagnostic kernel; nexus questions answered from real state, not guesses."
      drift: "co-pilot's current server has intercepts (status/diagnostics/accounts/user-model); extend that pattern, don't replace."
      axioms: [§1.1, §16.2]

    P5_copilot_dynamic_and_user_aware:   # ← DONE 2026-08-12 — real bug found and fixed, not just re-verified
      depends_on: P4
      does: >
        Co-pilot becomes DYNAMIC and user-aware. "Who am I?"/"what's my name?" →
        queries the user-model (getHypotheses) and answers, or asks back ("what
        would you like to know?") when genuinely ambiguous. Uses the user_model +
        user_lattice already in cortex.
      reuse: "copilot/lib/user-model (getHypotheses, UM1-UM4) already built; co-pilot queries it conversationally."
      gate:  "identity/user questions answered from the user-model; ambiguous asks get a real clarifying question, not a canned reply."
      drift: "don't over-claim knowledge of the user — answer from hypotheses with their confidence, per §1.1."
      axioms: [§1.1, user_wellbeing]

    P6_copilot_programmable:   # ← DONE 2026-08-12 — switchAgent now RAID-governed, lib/chains.js wired as run_chain tool
      depends_on: [P4, P5]
      does: >
        Co-pilot becomes programmable: schedule tasks, automate the system, create
        workflows, and switch to a different model/agent (incl. a clear-glass
        agent). Governed by RAID (what the mind may do).
      reuse: "autopilot (spawn/touch/lifecycle), clear-glass agent-mesh, RAID governance, raid/router universal entry — compose them."
      gate:  "a scheduled task runs; a workflow executes; 'switch to <agent>' routes through the agent-mesh; all governed by RAID."
      drift: "automation touches live control — RAID must gate every programmable action; scope tightly first (§Layer 0b)."
      axioms: [§RAID, §1.2, §17.6]

  ordering_rationale: >
    P1 first because nothing is "system-aware" until the stream is actually
    flowing — co-pilot's awareness (P4-P6) and the diagnostic kernel (P3) both
    read that stream. P2 rides P1's live sigma events. P3 composes P1+P2 plus the
    already-built relational-field/loom scanners. P4-P6 build co-pilot as the mind
    ON TOP of a live, diagnosable nervous system — awareness before dynamism
    before programmability, because you can't safely automate a system the mind
    can't yet see or diagnose.

  honest_risks:
    - "This is 6 phases; it is an ARC, not a turn. Each phase ships whole + tested + committed, one at a time."
    - "Live boot-wiring (P1) proves out on James's Windows boots — sandbox verifies the wiring logic + coverage, not the running mesh."
    - "P6 automation is the riskiest — programmable control of a live system. RAID gates it; scope conservatively."
    - "The existing diagnostic service crashes on boot (sseClients). P3 must decide fix-vs-replace after scanning it (§8.4)."

  first_build: "P1 — make the nervous system live. Recommended start."

---
## P1 COMPLETE 2026-08-07
The nervous system is live IN WIRING. Producer: lib/component-ledger.write() — the
universal ledger entry point every component calls — now also emits into
lib/ledger-fanin (tagged by system). Consumers: lib/ledger-fanin/boot.js wireFanin()
subscribes activity-log (→ cortex event_log + error_log), intelligence, autopilot,
and co-pilot; called at autopilot boot. So one write() reaches every consumer at
once, and coverage() names any silent system. §1.2 held: a throwing subscriber
never breaks the ledger write. §0.1 caught a real regression — the boot log went to
stdout and broke systems that parse autopilot's status JSON; moved to stderr.
Proves fully on James's boot (the sandbox verifies the wiring + fan-out + coverage).
Suite 1319/0. Next: P2 snapshot-on-sigma, riding this live stream.

---
## P2 COMPLETE 2026-08-07
The replay engine snapshots on every sigma. lib/snapshot-trigger.js (rebuilt — §0.3,
it was lost between trees; design in docs/snapshot-trigger-phasemap.spec) subscribes
the P1 fan-in and, on any sigma.spike/delta.tension event (the exact cfr/ledger
events at 0.70/0.75 thresholds — the 0.80-0.82 tensions from James's screenshots),
uses the relational-field reader (RFR2 causality.traceToRoot) to trace the CONDITIONS
that created it, then fires replay.snapshot tagged with the causal root + severity.
Debounced (§16.4, no storm), severity-gated (only real sigmas), §1.2 a snapshot
failure never breaks the stream. timeline() surfaces sigma snapshots as revertable
debug points (James: "the timeline as a tool for debugging and reverting"). Wired at
autopilot boot via wireFanin. In loom's graph. 7 tests, suite 1326/0.

---
## P3 COMPLETE 2026-08-07
Two parts. (1) FIXED the CIRCUIT OPEN crash: service/nexus-diagnostic.js declared
`const sseClients` at ~line 320, but onGap callbacks registered during monitor
setup call broadcast(); a gap firing mid-setup hit the temporal dead zone →
"Cannot access 'sseClients' before initialization" → crash loop on James's boots.
Hoisted sseClients + broadcast above first use; broadcast now also fans diagnostic
events into the live stream (autopilot/intelligence/co-pilot see them). (2) ADDED
lib/diagnostic-causal.js — the causal layer: for each gap/tension/friction finding
it traces the CONDITIONS that created it (relational-field/RFR2), and joins the
live substrate — fan-in coverage (silent systems = blind spots), the sigma
snapshot timeline, and loom's self-model (capabilities served by nothing, stale
dupes). "Gaps/tension/friction AND the conditions that created them." §8.6 composes
P1/P2 + loom scanners; no new detection. 5 tests, suite 1331/0.

---
## P4 (partial) 2026-08-07 — capability enumeration slice
Budget-scoped slice of P4: co-pilot answers "what can you do?" with its REAL
toolbox from loom. copilot/lib/capabilities.js: whatCanIDo() reads the capability-map
scanner (255 declared, verified against source) and returns 239 SERVED capabilities
grouped across 12 systems — §1.1, no phantom tools advertised. copilot/server.js
intercepts "what can you do / list tools / what can <system> do". §8.6 composes the
existing scanner. 4 tests. The rest of P4 (NEXUS self-model, query routing) + P5/P6
remain. In loom's graph.

---
## P4 COMPLETE 2026-08-07
Co-pilot is system-aware. Two modules, both composing existing substrate (§8.6):
copilot/lib/capabilities.js — "what can you do" → 239 SERVED capabilities from
loom, grouped by system (§1.1 no phantom tools; cached to not block the request
thread). copilot/lib/nexus-awareness.js — the mind's model of its body: systemRundown()
(real capabilities + 51 versioned systems + live fan-in coverage + loom self-model),
whatsWrong() (routes to the P3 diagnostic-causal kernel — findings WITH their
conditions), answerAbout() routes rundown/what's-wrong/versions questions to real
state and returns null for non-NEXUS prompts (never hijacks normal chat). Wired via
copilot/server.js intercepts, guarded + cached (the failed-to-fetch lesson). In
loom's graph. 9 P4 tests total. P5 (dynamic/user-aware) + P6 (programmable) remain.

---
## P5 (grammar engine) 2026-08-07 — the dynamic grammar engine, in the mind
James: "expand P5 exponentially — dynamic grammar engine." There already WAS one
(lib/grammar-engine.js, §8.6): reads the component registry grammar tree, builds a
trie, resolves NL → {componentId, params, confidence}, live-rebuilds on
component.registered. co-pilot's CLI used it; its CONVERSATIONAL path did not —
that was the gap. copilot/lib/grammar-router.js brings it into co-pilot's chat:
route(prompt) resolves any natural-language request to a real capability via the
trie. THE EXPONENTIAL PART: co-pilot's chat went from ~7 hand-written regex
intercepts to understanding ALL 239 capabilities — and every future one — with
zero new regex, because the grammar is generated FROM loom's registry. §1.1
confidence-gated (high → route, low → fall through to LLM; a confident wrong match
is worse than a miss — the misfire-tracker exists for this). §1.2 never blocks,
never throws to the caller. Wired as the FIRST resolution step in copilot/server.js.
6 tests. In loom's graph. REMAINING in P5: the user-model "who am I / what's my
name" conversational answers.

---
## P5 COMPLETE + P6 FOUNDATION 2026-08-07 — wired from existing lib (James: "check lib for more")
Checking lib/ first (§8.6) revealed the substrate already existed — these were
WIRING jobs, not builds. copilot/lib/self-model.js composes: lib/reflection
(trackIdentityEvidence), lib/constitutional-ai (getIdentityKernel/check), lib/agent-router
(routeAgent — switch model/agent), lib/intent-classifier (classify/risk).
- P5 who-am-I: whoAmI() from real user-model + reflection evidence; asks back when
  unknown (never fabricates). recordIdentityEvidence() → reflection.
- P6 foundation: governAction() = intent + constitutional gate; switchAgent() =
  agent-router (the "switch to clear-glass agent" ask).
- NEXUS MODEL IN CORTEX: buildNexusModel() assembles capabilities/versions/self-model/
  coverage and persists to cortex's self_model table (the brain). "The model of nexus
  it uses for nexus questions" now lives in cortex.
Registry updated with real wires; copilot.spec addendum added. 6 tests.
REMAINING in P6: scheduling, workflows, full automation (all RAID-governed).

---
## AUTOPILOT INTELLIGENCE WIRING 2026-08-08 (James: "completely update autopilot, wire in intelligence/RFR2/emergence/CFR/sigmas/baseline")
lib/autopilot-intelligence.js — the ONE place autopilot wires + VERIFIES the whole
intelligence substrate at boot: intelligence (learner, started idempotently) + RFR2
(relational-field) + CFR (meta/cfr field/regime) + baseline behaviour + sigma→
snapshot (P2) + emergence (intelligence's pattern-detection scan). wireIntelligence()
returns a wired/missing report (§1.1 declared≠real — verifies reachability, doesn't
claim). §8.6 composes existing modules; §1.2 a missing faculty degrades honestly,
boot never dies. Wired into autopilot.js boot alongside the P1 fan-in. On first live
run it immediately crystallised real patterns (incl. "kernel circuit open recurs 92×
— systemic bottleneck") — the substrate detecting emergence live. 4 tests. In loom's
graph. "emergence" clarified: not a separate module — it's intelligence's pattern
detection over the stream.

---
## --cli INTERFACE 2026-08-08 (James: "npm run start:all --cli for a cli interface with a help menu, add the co-pilot additions")
lib/nexus-cli-interface.js — an interactive CLI with a help menu, launched by
autopilot on --cli (npm run start:all:cli, or node autopilot.js --cli). Routes to
the co-pilot additions built this session (§8.6): capabilities ("what can you do" →
239 real capabilities), nexus-awareness (rundown / what's wrong), self-model (who am
i / switch agent), grammar-router (natural language → capability), + the loom
phasemap section (roadmap [system]). Everything answered from REAL state. §1.2 every
command degrades honestly; unknown input never throws the REPL. Gated to real boot
(require.main, not a status probe) so it never interferes with spawned-status
parsing. npm script start:all:cli added (npm swallows --cli as its own arg, so a
dedicated script is the reliable form). 8 tests. In loom's graph.
