# docs/2026-10-24-agent-orchestration-phasemap.spec
# Guardian agent orchestration: deploy agents to systems, compartments, websites, automation and macros — BrainOS, brought
# in and made to deploy. The confidence gate (his rule) comes first: before an agent does anything, if confidence < 75% it
# obtains context — worksurface, dependencies, find the context — and asks the user LAST.
# MAPPED 2026-10-24 (docs/CLAUDE.md rule 1), before code. Reuses, never rebuilds (rule 2): the BrainOS fold is already a full
# spec (docs/brainos-in-idearium.spec, 11 modules MOD-BX-*); this map adds the confidence gate (CG) and the automation union
# (AU) in front of it and points the deploy/UI work at that spec. Order of delivery (his): backend → route → command → UI.

origin:
  date: 2026-10-24
  james: >-
    "we need a full agent orchastration system for guardian to deploy to different systems, compartments, websites, automation,
    macros, like brainos. all the agent features in ideairum?" · "we should be able to deploy agents by now. have that test done
    automatically. enterprise grade code, pro-plugin quality ui." · "before an agent does anything. if confidence is lower than
    75%, context must be obtained. build worksurface, compile list of dependancies, find the context, ask user last." · "copilot
    system, ollama, lib folder, clearglass, idearium, and brainos have automation." · (of the framework-trial) "that was done by
    hand in clearglass." · "merge first."
  context: >-
    His 2026-09-11, kept in docs/brainos-in-idearium.spec: "brainos needs to be the entire ui for agent orchestration — clear-glass,
    agent mesh, ncp, jobs, userscripts, agent router, RAID. deploying nodes on the canvas spawn agents." The substrate exists and is
    cited by that spec: guardian's dispatcher/jobs/dispatch-pool/agent-registry/NCP (the browser agents the framework-trial used by
    hand), clear-glass's agent-mesh/route-graph/automation at :7704, lib/repo-agent.js (a repo's own agent, per-compartment), RAID's
    router and SNR pre-gate, lib/phase-dag.js, lib/run-state.js. The framework-trial (uploaded; docs/framework-trial/) is the first
    automatic job: the same prompt × 2 arms × 3 models, deployed and collected, instead of pasted tab by tab.
  trace_2026_10_24: >-
    Reuse census (rule 2, from source): the confidence gate is mostly assembly of existing pieces — lib/repo-agent.js contextFor()
    gathers code-intel search + repo-context retrieval ("find the context"); _withMemory adds lib/context-atlas.js (memory + every
    store's graphs); cortex/core/raid/snr-filter.js already resolves confidence by tier (known invariant / crystallised pattern /
    open loop / unknown); lib/phase-graph.js + loom_impact + lib/code-intel compile dependencies; idearium/ui/js/work-surface.js is
    the worksurface. The NEW piece is the GATE: the <75% ladder, the ask-user-LAST escalation, and the record of what it did.
  merged_first: >-
    Done before this map (his "merge first"): origin/main (0.60.236, the RF2 systems-sovereignty refactor: auth→orchestrator,
    mesh→guardian, erosmancer→clear-glass, security/remote-desktop/tablet→cos) merged into this branch; the crystallizer renumbered
    0.60.231→0.60.237 to clear the parallel-branch collision. So this build starts current, not 43 commits stale.

decisions:
  CG_D1_gate_home:
    status: DECIDED 2026-10-24 by his axioms (§8.6 reuse, §5.2 routing goes through RAID)
    chosen: >-
      lib/agent-confidence-gate.js — a standalone, dependency-injected gate (the lib/repo-agent.js pattern), so every dispatch
      surface can call it: repo-agent.dispatch (idearium's per-repo agent), guardian's dispatcher, and the orchestrator's deploy.
      It composes RAID's SNR filter for the confidence read rather than inventing a second confidence model (no side door, §9.1).
  CG_D2_threshold:
    status: DECIDED 2026-10-24 by James — "if confidence is lower than 75%"
    chosen: "CONFIDENCE_THRESHOLD = 0.75. Below it the context ladder runs; at or above it the agent proceeds."
  CG_D3_order:
    status: DECIDED 2026-10-24 by James — "build worksurface, compile list of dependancies, find the context, ask user last"
    chosen: >-
      The ladder runs in his exact order, re-reading confidence after each rung and stopping as soon as it reaches 0.75:
      1) build worksurface, 2) compile dependencies, 3) find the context, 4) ask the user — LAST, only if still below after 1–3.
  AU_D1_automation_union:
    status: OPEN — the coder's reading, to confirm
    asked: "copilot, ollama, lib, clear-glass, idearium and brainos each have automation — one registry over all six, or adapters per source?"
    chosen: >-
      To confirm. The coder's reading by §8.6/NC0: one neutral automation registry (lib/automation-registry.js) with a thin adapter
      per source (each source keeps its own engine; the registry lists, runs and records across all six through the adapter contract),
      so Guardian deploys a workflow to any of them through one door. Built after the gate (AU phases below).

phases:
  CG1_the_confidence_gate_backend:
    status: OPEN
    layer: library
    depends_on: [CG_D1_gate_home, CG_D2_threshold, CG_D3_order]
    files: [lib/agent-confidence-gate.js, tests/modules/test-agent-confidence-gate.test.js, tests/modules/run-all.js]
    spec: docs/brainos-in-idearium.spec
    does: >-
      lib/agent-confidence-gate.js: gate({ confidence, repo, repoDir, message, snr, deps }) runs the §CG_D3 ladder. Dependency-injected
      (buildWorksurface, compileDeps, findContext, askUser, estimate) so it is testable without a live backend; the defaults compose the
      real pieces (repo-agent.contextFor + context-atlas = findContext; phase-graph/loom/code-intel = compileDeps; work-surface = worksurface;
      snr-filter = the confidence read). Returns { proceed, confidence, context, asked, steps[], reason }. Nothing silently skipped (§1.2):
      every rung and why it stopped is in steps[].
    proof: "a call at confidence 0.8 proceeds with no context obtained; at 0.5 the ladder runs in order and each rung that raises confidence to 0.75 stops it; ask-user fires only after the first three; a rung that errors is recorded, not thrown"

  CG2_the_gate_on_every_dispatch:
    status: OPEN
    layer: integration
    depends_on: [CG1_the_confidence_gate_backend]
    files: [lib/repo-agent.js, guardian/lib/dispatcher.js, tests/modules/test-agent-confidence-gate.test.js]
    spec: docs/brainos-in-idearium.spec
    does: "repo-agent.dispatch and guardian's dispatcher call the gate before sending to a backend; the gathered context rides the prompt; the gate's steps are on the job/run record."
    proof: "a dispatch below threshold obtains context before the backend is called; the backend sees the worksurface and deps in its context; a scripted low-confidence dispatch records the ask-user rung"

  CG3_route_and_command:
    status: OPEN
    layer: integration
    depends_on: [CG2_the_gate_on_every_dispatch]
    files: [idearium/api/index.js, idearium/cli/route-commands.js]
    spec: docs/brainos-in-idearium.spec
    does: "GET/POST the gate's decision for a message (so the UI and the CLI can show what context an agent would gather before it acts); command row `agent gate <repo> <message>`."
    proof: "the route returns proceed/confidence/steps for a message; the command prints the ladder"

  CG4_the_gate_in_the_ui:
    status: OPEN
    layer: ui
    depends_on: [CG3_route_and_command]
    files: [idearium/ui/js/code-surface.js]
    spec: docs/brainos-in-idearium.spec
    does: "the Code tab's docked agent shows, before it answers, the confidence and (when below 75%) the context it gathered — worksurface, deps, found context — and only then asks the user. Idearium tokens only (pro-plugin quality)."
    proof: "Clear Glass: a low-confidence ask shows the gathered context before the reply; a high-confidence ask answers straight"

  BX_orchestration:
    status: OPEN
    layer: integration
    depends_on: [CG2_the_gate_on_every_dispatch]
    files: [idearium/lib/flow-sources.js]
    spec: docs/brainos-in-idearium.spec
    does: >-
      Build the BrainOS fold as already specced (docs/brainos-in-idearium.spec MOD-BX-SOURCES … MOD-BX-DOCK): deploy agents on the
      canvas, the mesh, the route/pipeline editor, automation — every deployed agent passing the confidence gate (CG2). This phase is
      the entry; the brainos spec's modules are its sub-phases (docs/2026-10-21-brainos-into-idearium-phasemap.spec BX2–BX8).
    proof: "flowFor(repo) returns the graph; a node deployed from the canvas spawns an agent through guardian, gated by CG"

  AU1_automation_union:
    status: OPEN
    layer: library
    depends_on: [BX_orchestration, AU_D1_automation_union]
    files: [lib/automation-registry.js]
    spec: docs/brainos-in-idearium.spec
    does: "one registry over the six automation sources (copilot, ollama, lib, clear-glass, idearium, brainos) via an adapter per source; list, run, record across all; Guardian deploys a workflow to any of them through one door."
    proof: "the registry lists workflows from each present source; running one records under the source; an absent source is named, not thrown"

  AU2_trial_automatic:
    status: OPEN
    layer: integration
    depends_on: [AU1_automation_union]
    files: [docs/framework-trial/trial.js]
    does: >-
      The framework-trial (his "that was done by hand in clearglass" → "have that test done automatically") as one automation workflow:
      deploy each (problem × arm × model) prompt to its agent through Guardian's mesh, collect the reply into answers/<model>/…, then blind
      and score — no tab-by-tab pasting. The trial is merged into the repo at docs/framework-trial/ first.
    proof: "the workflow runs the 36 one-each prompts through the mesh and writes the answers; blind + score produce results.md"

order: >-
  CG1 (gate backend) first, then CG2 (on every dispatch), CG3 (route+command), CG4 (UI) — his delivery order. BX_orchestration builds the
  BrainOS fold on top (its own 11-module spec), every deployed agent gated by CG2. AU1 unifies the six automations; AU2 runs the
  framework-trial automatically as the proof. Nothing is built before its spec module and its .phase/.graph (his 2026-10-20 rule).
