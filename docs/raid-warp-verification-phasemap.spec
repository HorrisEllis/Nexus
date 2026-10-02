spec:
  meta:
    name:        raid-warp-verification-spine
    version:     0.2.0-phasemap
    supersedes:  raid-verification-spine v0.1.0 (folds in AXIOMS-v3.1, WARP logic, drift accounting)
    status: >-
      ALL 11 PHASES COMPLETE 2026-07-30 (Part I verify spine P1-P7 + Part II bridge P8-P11). PHASEMAP. Governed by AXIOMS-v3.1 (all 87 parsed).
      New code uses WARP logic (warp/core: weighted Axiom → Gate →
      Stream → StreamLog). Drift accounted for at every phase.
    uuid:        nexus-raid-warp-verification-v0-0000-2026-0730-001
    axioms_read: "AXIOMS-v3.1, 2026-07-06 — Groups 0-17, 87 laws, parsed in full."
    related_phasemaps: >
      This spine WRITES raid_decisions to cortex with no enforced shape — the
      direct motivator for docs/cortex-schema-registry-phasemap.spec, which is
      the integrity foundation beneath it and folds in the user-model work.
      One chain: RAID verify (this, P1-P4 done) → schema-registry → user-model
      trustworthy+queried-everywhere. Not three competing plans (§10.3, §13.4).

  governing_axioms:
    build_order:   "§3.1 bottom-up, phase gated · §3.3 map before build (this doc) · §3.4 raw→lib→API→CLI→UI · §16.1 close nearest gap first"
    warp_logic:    "§8.3 WARP is a load-order prerequisite · §17.10 hard axioms never skipped, soft may skip on verified digest, every skip logged · §17.11 every perf claim names its benchmark · warp/core/Axiom weighted hard(1.0)/soft(0.3)"
    verification:  "§1.1 nothing exists until proven · §12.2 tests must be able to fail · §17.10 verify before promote · §4.1 untestable = untrusted"
    truth_drift:   "§0.1 evidence over memory · §12.5 living spec documents drift · §13.4 drift is data, untracked drift is failure · §3.3 map names what drifted"
    sovereignty:   "§5.9 sovereign systems · §5.10 contracts only · §5.14 replaceable impl · §10.3 no competing truth · §16.5 delete/wire before add"
    no_silent:     "§1.2 nothing silently fails · §17.6 always auditable · §9.2 ledger write before dispatch"
    provenance:    "§17.1 every artifact owned · §17.3 decisions recorded w/ alternatives · §17.5 every output has provenance · §16.2 explain themselves"

  the_finding_restated: >
    (§3.3 map) Every verification system named EXISTS: constitution
    (lib/constitutional-ai), COS isolation (cos/playground + compartment-engine),
    rewind (lib/replay-engine), sigma, drift (meta/bda), compare
    (cos/playground/compare). WARP is real (warp/core: Axiom/Gate/Stream/
    StreamLog) and is the sanctioned way to add verified gates (§8.3). RAID's
    _approveTool is sync + contract-ONLY — it drives none of them. GAP = the
    wire, not the engines (§16.5 wire before add).

  drift_accounting:
    principle: "§13.4 — drift is data; untracked drift is the only failure. Every phase declares its drift surface."
    mechanism: >
      Each new WARP gate versions its Axiom (warp/core/Axiom .version bumps when
      check logic changes). The living spec (§12.5) records expected-vs-actual
      per phase. A drift row is written when a gate's verdict distribution shifts
      (meta/bda regime change on the gate itself) — the verifier is watched for
      drift the same way it watches contracts. SPEC-REGISTRY (§6.3) updated each
      phase.

  phases:

    P1_raid_records_every_decision:   # ← DONE 2026-07-30, cortex-persisted, 1066/0
      does: "agent-tools executeTool → RAID decision record (source, tool, args-digest, outcome). No block yet (§1.2 observable, §17.6 auditable, §9.2 ledger-before-dispatch)."
      warp: "the record path is a WARP Gate (pure fn §14.2) emitting onto the stream; StreamLog is the ledger."
      drift: "baseline the tool-call verdict distribution now, so P2+ drift is measurable against it."
      gate: "a tool call is a queryable RAID decision record with outcome (§1.1 proven, not claimed)."
      axioms: [§1.2, §17.6, §9.2, §14.2, §13.4]

    P2_constitution_gate:   # ← DONE 2026-07-30, hard gate, 1071/0
      does: "_approveTool runs constitutional-ai.check() as a WARP HARD axiom (§17.10 never skipped). Violation → deny, axiom named (§1.2 specific)."
      warp: "constitution wrapped as a warp/core Axiom, severity:hard, weight 1.0 — runs every time."
      drift: "Axiom.version pinned; a change to constitution logic bumps it, logged."
      gate: "an axiom-violating action is denied, naming the axiom (§12.2 the test can fail)."
      axioms: [§17.10, §16.3, §1.2, §0.1]

    P3_cos_isolate_and_verify:   # ← DONE 2026-07-30, sync callers untouched, 1077/0
      does: "consequential actions run in a COS compartment (BranchEngine.fork → SandboxRunner.run) before touching real state; commit only on PASS (§1.1, §2.1 no mutation before pass)."
      warp: "the isolate→verify step is a WARP Gate; SandboxRunner result is the axiom check (hard)."
      drift: "'consequential' is a declared, versioned predicate — its scope drift is tracked, not silent."
      gate: "a failing action is caught in the sandbox; real target untouched (§1.1)."
      axioms: [§1.1, §2.1, §17.10, §5.9]

    P4_sigma_drift_score:   # ← DONE 2026-07-30, soft signals, 1083/0
      does: "score the sandboxed run: sigma (halt-risk) + meta/bda (behavioral regime). Spike/unstable regime → soft-fail signal to RAID."
      warp: "sigma+bda as SOFT axioms (§17.10 weight 0.3, may skip on identical verified digest, skip logged)."
      drift: "THIS is the drift engine itself, now also applied to gates (§13.4). bda regime on the verdict stream."
      gate: "a drifting run is flagged with regime + score (§13.4 drift as data)."
      axioms: [§17.10, §11.3, §13.4, §1.2]

    P5_compare_contract_vs_output:   # ← DONE 2026-07-30, contract-breach first-class, 1132/0
      does: "CompareEngine diffs run output vs contract/golden. Regression/mismatch → fail (§5.14 output honours contract, §16.3 invariant sacred)."
      warp: "compare as a HARD axiom (a contract breach is never soft-skippable)."
      drift: "golden baseline is versioned; a golden update is a logged decision (§17.3)."
      gate: "an output regressing against its contract is caught (§12.3 expectation vs reality)."
      axioms: [§5.14, §16.3, §17.10, §12.3]

    P6_rewind_on_fail:   # ← DONE 2026-07-30, failed decisions replayable, 1137/0
      does: "any P2-P5 fail → replay-engine snapshots the decision point; failure becomes replayable training data (§0.3 nothing lost, §7.4 dead branches are data)."
      warp: "snapshot trigger is a WARP stream subscriber on any deny verdict."
      drift: "snapshots accumulate the drift history — the timeline §13.4 wants."
      gate: "a failed decision is replayable from a snapshot (§0.3, §16.2 reads like a story)."
      axioms: [§0.3, §7.4, §16.2, §17.6]

    P7_one_raid_verify_spine:   # ← DONE 2026-07-30, fused GateFusion, 1143/0
      does: "unify P1-P6 into raid.verify(decision): record→constitution→isolate→sigma/drift→compare→snapshot-on-fail→approve/deny. agent-tools, execution-pipeline, autonomous-loop all call it (§10.3 one path, §5.14 same contract)."
      warp: "raid.verify IS a WARP GateFusion — the phases are fused gates on one stream, StreamLog is the audit trail (§17.6)."
      drift: "the whole spine's verdict distribution is monitored; the spine watches itself for drift (§13.4)."
      gate: "agent-tools, pipeline, and autonomous-loop verify through ONE raid.verify() (§1.1 proven across all three callers)."
      axioms: [§10.3, §5.14, §17.6, §1.1, §16.2]

  ordering_rationale: >
    §3.1 bottom-up + §16.1 nearest-gap: P1 (see, cheapest) → P2 (constitution,
    cheap hard check) → P3 (isolate) → P4/P5 (score+compare the isolated run) →
    P6 (catch) → P7 (fuse). §17.10 governs the order WITHIN a verify: hard axioms
    (constitution P2, sandbox P3, compare P5) always run; soft (sigma/drift P4)
    may skip on a verified digest. Cheapest hard checks first so most denials
    never reach a sandbox.

  honest_risks_and_drift:
    - "§8.4: P3 makes _approveTool async — every caller must handle a Promise. Callers mapped before the change, not after."
    - "§16.4/§0.5: 'consequential' filter must stay tight — not every tool call earns a sandbox. Complexity earns its existence."
    - "§0.1: sandbox can't run live here — gates are James-verified on real boot, stated plainly, not claimed passed."
    - "§13.4: fault_taxonomy still 0 rows — drift/compare data thin until real runs populate it. Named, not hidden."
    - "§17.11: any 'faster/safer' claim about this spine names its benchmark or isn't made."

  # ═══════════════════════════════════════════════════════════════════════════
  # PART II — CO-PILOT AS THE BRIDGE (user ↔ UI ↔ NEXUS)
  # James: "the system is at co-pilot's disposal, not the other way around. it's
  # all built for bridging the system with the co-pilot, the user, and nexus."
  # §8.6 read first: spotlight + nerve are ALREADY co-pilot-callable (their own
  # headers say so); diagnose.js + recursive-diagnose exist; _logToData is the
  # gated-event surface. These phases WIRE co-pilot's tool-loop to those built
  # surfaces — bridging, not new UI (§16.5 wire before add).
  # ═══════════════════════════════════════════════════════════════════════════

  bridge_phases:

    P8_ui_as_copilot_tools:   # ← DONE 2026-07-30, 17 tools
      why: "Co-pilot must be able to ACT on the UI to assist the user. spotlight + nerve are already HTTP-callable and 'register with co-pilot' (their headers)."
      does: >
        Wrap the existing UI surfaces as agent-tools (§16.5 wrap don't rebuild):
        ui_spotlight (Spotlight.on/step/execute — light up + guide), ui_navigate
        (Spotlight.navigate — move the shell), ui_nerve (nerve on/off/sigma —
        surface the live field). Co-pilot's loop can now direct the UI.
      warp: "each UI tool's dispatch is a WARP Gate emitting to StreamLog (§17.6 the assist is auditable)."
      reuse: "§8.6 — POST /api/ui/spotlight/*, /api/ui/nerve/* already exist; these tools call them, build nothing new."
      gate: "co-pilot, mid-task, lights up the relevant system in the UI to guide the user (§1.1 proven live)."
      axioms: [§16.5, §8.6, §5.12, §17.6]

    P9_gated_events_to_copilot:   # ← DONE 2026-07-30, relevance classifier, 1154/0
      why: "Co-pilot must DETECT relevant events from the user's gated interactions to assist proactively."
      does: >
        The gated-event surface (_logToData in tv-shell) streams UI interaction
        events into the continuous stream (P3/P7 shared digest). Co-pilot sees
        what the user is doing — a gated interaction becomes context, and a
        relevant pattern (repeated error, stuck flow) is a trigger.
      warp: "the gate is a WARP Gate (§14.2 pure) classifying interaction events; relevance is a soft axiom."
      reuse: "§8.6 — _logToData already emits structured UI events; wire them into lib/stream-digest, don't add a new bus."
      drift: "the relevance predicate is versioned; its trigger-rate drift is watched (§13.4)."
      gate: "a repeated user error surfaces to co-pilot as a relevant event, no explicit ask (§13.1 intent logged)."
      axioms: [§14.2, §8.6, §13.1, §13.4]

    P10_diagnose_and_notify:   # ← DONE 2026-07-30, assist loop
      why: "'Automatically diagnose and notify the user using a toast or cli command.'"
      does: >
        On a relevant detected event (P9), co-pilot runs diagnose (the existing
        diagnose tool + recursive-diagnose faculty, P5), and notifies via the
        UI: a toast (tv-shell) or a CLI line (copilot/cli.js). Notification is
        the OUTPUT half of the bridge — the user is told what NEXUS found.
      warp: "diagnose is a WARP-gated tool run (P1 records it); the notify is a stream event → toast/cli."
      reuse: "§8.6 — diagnose.js, recursive-diagnose.js, the toast path, and copilot/cli.js all exist; wire them."
      gate: "a detected fault is auto-diagnosed and the user sees a toast/CLI line explaining it (§1.2 specific, §16.2 reads like a story)."
      axioms: [§8.6, §1.2, §16.2, §15.1]

    P11_diagnose_and_repair_on_prompt:   # ← DONE 2026-07-30, repair through raid.verify, 1168/0
      why: "'Diagnose AND repair when prompted.' The full bridge: user asks, co-pilot fixes through the verified spine."
      does: >
        On a repair prompt, co-pilot diagnoses, proposes a fix, and — routed
        through the P7 raid.verify() spine (constitution → COS isolate → sigma/
        drift → compare) — applies it only if verification passes. Repair is a
        governed action, not a raw write. The user prompted; the spine made it safe.
      warp: "the repair IS a raid.verify() GateFusion run — the whole Part I spine gates the fix."
      reuse: "§8.6 — self-heal (cortex/self-heal), forge, execution-pipeline already do isolated repair; co-pilot drives them through raid.verify."
      gate: "a prompted repair is diagnosed, verified in isolation, and applied only on PASS — the real target untouched on fail (§1.1, §2.1)."
      axioms: [§8.6, §1.1, §2.1, §17.10, §16.3]

  bridge_ordering_rationale: >
    P8 (co-pilot can act on UI) → P9 (co-pilot can sense UI events) → P10 (sense
    → diagnose → notify: the assist loop) → P11 (prompt → diagnose → verified
    repair: the full bridge). P11 depends on Part I's P7 spine existing — a repair
    must go through raid.verify(), so the verification spine is its prerequisite
    (§3.1 nothing built on what doesn't exist; §16.1 the spine is the nearest gap
    before repair). The whole of Part II is the realization of "the system is at
    co-pilot's disposal": co-pilot senses (P9), acts (P8), explains (P10), and
    fixes (P11) — bridging user, UI, and NEXUS.
