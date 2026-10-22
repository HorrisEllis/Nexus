# Solid build foundation — local-first, dynamic chunking, COS test env, quality gates, autobuild (2026-10-19)

James, 2026-10-19 (across several messages):
- "need quality checks per gate, using the test file and anything else we can." · "we need as much qulaity checks, as necassary."
- "then we need cos to work for test env." · "its supposed to chunk dynamically."
- "the core foundation needs to be solid before t can build naything else. gate should use siso or warp logic"
- "do not add apis. i dont have money for that" — no paid APIs anywhere: ladder, checks, COS. Local (ollama) + free browser agents only.
- "i dont think it resumes." · (earlier) "can you builkd dsettings for autobuild?"
- "as long as local and free can handle it. thats why i wanted to guardian agents, only if strictly neccarry. like ollama first,
  but nexus should be learning. like thats why the component registry is vital for each project becuase its the spine that makes
  components dumb"

## The spine (his 2026-10-19, the why under all of it)

Ollama FIRST; a guardian/browser agent only if strictly necessary; and Nexus LEARNS which agent wins per job so it stays local more
over time (the learned ladder already exists — lib/agent-record.js orderLadder, a Beta posterior per jobType). The reason local-and-free
can carry the work is the **component registry as the per-project spine**: when the registry holds the wiring (require/consumer edges),
each component can stay DUMB — small, single-purpose — and a small local model only has to write that one dumb component. So the registry
is not bookkeeping; it is what makes dynamic chunking + model-fit + local-first actually work. Rule 3 (wire the registry) applies to every
BUILT project, not only to Nexus itself.

## Ground truth (verified against code, two reads 2026-10-19)

- **Resume HALTS.** No phase→phase orchestrator exists (`auto-advance`/`fault.lost` are display labels, not code). A ladder-exhausted
  phase writes terminal `failed` (`idearium/api/index.js:1531-1536`) and stops; the three auto-retry paths fire only on stall, on
  James's rejection, or on unmet conditions inside a success — never on a failed phase (`lib/run-watch.js:26,54`). No setting exists.
- **COS can run a test isolated, but not in the build.** `lib/cos-run.js:349 run()` → `cos/testenv/index.js:238 run()` →
  process sandbox (`cos/playground/sandbox.js SandboxRunner.run`, clean env/timeout/output-cap) or QEMU VM
  (`cos/compartment/qemu-runtime.js`). Wired ONLY to the Run menu (`idearium/api/index.js:6844,6974,7034`). The gate/proof runs on
  the HOST (`idearium/repo/proof-run.js:96,148-159`; `lib/expectation-tests.js` in-process). A compartment id IS provisioned per
  contract (`idearium/api/index.js:1514`); the exec/test door is mapped-only (docs/2026-10-18-compartment-environment-phasemap.spec).
  **This cloud container has no KVM** — the VM can't boot here; the portable backend is the process sandbox.
- **Dynamic chunking WIRED but DORMANT.** `cortex/core/raid/contract-adapters.js:102 fromPhasePlan` builds one brick per file
  statically, never calls `split`. The scheduler splits only reactively (fail-twice / agent `{decompose}`), and `{decompose}` needs
  ≥3 learned passes to arm (`contract-gates.js:382-385`). A fresh local build never splits.
- **Model-fit SKIP-AFTER-SELECT.** `lib/pipeline-routing.js:282 ladder()` orders by model-size-in-name; the RAM check
  (`idearium/api/index.js:1066-1076` → `lib/resource-monitor.js:188-202 fitsModel`) is a per-rung yes/no skip *after* selection.
  Nothing picks the largest model that fits free RAM. The OOM churn is this.
- **Ladder is HAT-BLIND.** Ordered by size → learned success → availability (`lib/pipeline-routing.js`); no hat/intent consulted;
  `lib/hat-forge.js` not referenced by routing.

## Decisions (by his axioms — §8.6 reuse, Cobalt Core is SISO, §1.2 nothing silent, no paid APIs)

- The gate and the autobuild loop run on **SISO** (Event→Gate→Stream); warp is generation, not gating.
- **Reuse, don't fork:** `fitsModel` (resource-monitor), `shouldSplit/split/unitsOf/Boundaries` (contract-gates), `SandboxRunner`
  (cos/testenv), `contract-gates` as the recorder, `hat-forge` for hats, the economy gate (`lib/economy/gate.js`) for slots.
- **Local-first, no APIs:** ollama FIRST; a guardian/browser agent is the last rung and only if strictly necessary, paced; the
  process sandbox is the test env (VM only where KVM exists). Nexus learns (the Beta-posterior ladder) to stay local more over time.
- **The component registry is the per-project spine:** the build wires every built component into the project's registry with real
  require/consumer edges, so components stay dumb and a small local model can write each one. Reuse loom + lib/component-store.js.
- **COS test-env = process sandbox here** (portable); VM is a local upgrade. Coder's call by the axioms (REVERSIBILITY/EXPLAINABILITY).

## Supersedes (kept, §0.3)

docs/2026-10-19-gate-quality-checks-phasemap.spec (GQ1–GQ6) is folded into this map's GQ layer and superseded-and-kept: its gate
ran the test on the host; here the test runs in COS and after dynamic chunking. The GQ file stays as the earlier reading.

## Phases (bottom-up; each layer solid before the next). Order of delivery per phase: backend → route → command → UI.

phases:

  MF1_model_fit_routing:
    layer: foundation
    status: BUILT 2026-10-19 (0.60.163)
    depends_on: []
    axioms: [§3.1, §1.1, §1.3, §0.3]
    blocks: ["model_fit"]
    files: [lib/pipeline-routing.js, lib/resource-monitor.js]
    does: >-
      The ladder never selects a local model that cannot load, and prefers the largest model that fits free RAM. Reuse
      fitsModel (resource-monitor.js:188-202): pre-filter the Ollama rungs by current free memory BEFORE dispatch and order
      largest-that-fits-first (not size-in-name ascending). A model whose size is unknown is still tried. No paid APIs added.
      This keeps the build on free local models instead of climbing to the rate-limited browser rung on every OOM.
    proof: >-
      tests/mf1-model-fit.test.js — a ladder built with freeMem=3.6GB excludes qwen3.5:9b (7.3GB) and qwen2.5-coder:7b (5.2GB)
      and selects the largest model that fits; with ample RAM the order is unchanged; unknown-size model still included.

  DC1_dynamic_chunk_at_plan:
    layer: library
    status: OPEN
    depends_on: [MF1_model_fit_routing]
    axioms: [§3.1, §8.6, §1.3, §12.1]
    blocks: ["dynamic_chunk"]
    files: [cortex/core/raid/contract-adapters.js, cortex/core/raid/contract-gates.js]
    does: >-
      Chunk dynamically at plan→contract time, sized to the fitting local model's budget — not one-brick-per-file-static,
      and not only reactively after a failure. fromPhasePlan asks the chunker (reuse shouldSplit/unitsOf/Boundaries) to split
      a file brick whose estimated work exceeds the budget of the model chosen by MF1, so each unit is small enough for a
      model that fits RAM. Reactive split (fail-twice) stays as the safety net.
    proof: >-
      tests/dc1-dynamic-chunk.test.js — a phase file whose work exceeds a small model's budget is split into ≥2 ordered units
      at contract-build time (today it is one static brick); a small file stays one unit.

  CR1_project_registry_spine:
    layer: library
    status: BUILT 2026-10-19 (0.60.164)
    depends_on: []
    axioms: [§3.1, §8.6, §1.3, §0.3]
    blocks: ["project_registry"]
    files: [lib/project-registry.js]
    does: >-
      The build wires every component it creates into the BUILT project's own component registry with real require/consumer
      edges (rule 3, applied per project) — the spine that lets components stay dumb. Reuse loom and lib/component-store.js
      (which already resolves a decomposed project's components + dependencies); do not invent a second registry. A built
      component with no wires is the defect this closes: the registry is how a small local model's dumb component composes
      with the rest. First: verify what per-project registry already exists (component-store) and extend it, not duplicate.
    proof: >-
      tests/cr1-project-registry.test.js — after a phase builds N files, each is a registry component with its real
      require/consumer wires (not a bare declaration); a component with no edge is flagged, not silently accepted.

  CT1_cos_test_runner:
    layer: library
    status: BUILT 2026-10-19 (0.60.166)
    depends_on: []
    axioms: [§3.4, §1.1, §12.1, §0.3]
    blocks: ["cos_test_runner"]
    files: [cos/testenv/run-target.js]
    does: >-
      A build-callable door to run a test target inside COS's process sandbox (SandboxRunner: clean env, timeout, output cap),
      isolated, no external services. Lives in cos/ (its own system) and is reached by the gate through a route/registry door,
      not a lib→cos require, so no new boundary crossing (CE3 drawbridge is the eventual handshake; here a plain route). The
      QEMU VM backend is used only where KVM exists; the process backend is the portable default (this container has no KVM).
    proof: >-
      a test (cos/testenv's own suite, process backend) — a passing and a failing target run in the sandbox return the right
      verdicts with clean env and a honoured timeout; no network.

  GQ1_quality_stream:
    layer: library
    status: OPEN
    depends_on: [CT1_cos_test_runner]
    axioms: [§3.1, §1.1, §1.3, §0.3]
    blocks: ["quality_stream"]
    files: [lib/quality-stream.js]
    does: >-
      The SISO quality-gate primitive (siso/core Event→Gate→Stream). A check.requested event for a unit fans out one gate per
      applicable check — the covering test (run in COS via CT1), TF1 shape, catalogue checks (CK-nnn), lint — "as many as
      necessary". Each emits a check.result with provenance; a check that cannot run is named residue (pending[]), never a
      silent pass (§1.2). Pure composition over existing runners; collision is a hard error (SISO law).
    proof: >-
      tests/gq1-quality-stream.test.js — a unit with one passing and one failing covering test yields two correct verdicts and
      names an un-runnable check as residue; the test runs inside the COS sandbox, not on the host.

  GQ3_brick_tests:
    layer: library
    status: OPEN
    depends_on: [GQ1_quality_stream]
    axioms: [§3.1, §8.6, §1.1, §12.1]
    blocks: ["brick_tests"]
    files: [lib/brick-tests.js]
    does: >-
      Which test(s) cover a brick — reuse lib/test-map.js plus the plan's per-file test and the phase test-first file, resolved
      against the proposal overlay (test-map alone returns 0/0 for a fresh file). The holistic phase test is attributed to the
      last brick, so GQ2 runs what is real at each brick, not the whole phase test at brick 1.
    proof: >-
      tests/gq3-brick-tests.test.js — a fresh file with a test-first that requires it links to that test; the holistic phase
      test is attributed to the last brick, not the first.

  GQ2_brick_gate_runs_the_test:
    layer: api
    status: OPEN
    depends_on: [GQ1_quality_stream, GQ3_brick_tests, DC1_dynamic_chunk_at_plan]
    axioms: [§3.4, §8.6, §1.1, §12.1]
    blocks: ["brick_gate_quality"]
    files: [idearium/api/index.js, cortex/core/raid/contract-adapters.js]
    does: >-
      The per-brick gate requires behaviour, not only shape. verifyBrick (idearium/api/index.js:1394) runs the quality-stream
      (GQ1) for the brick — TF1 shape AND the covering test(s) (GQ3), executed in COS (CT1) against the overlay of this brick's
      upstream deps applied in brick-DAG order ("each chunk uses a dag" at the gate). `<gid>.verified` is ok only when every
      runnable check passed; the brick pass_when shape (contract-adapters.js:122) is unchanged — the evidence now carries a
      real test result.
    proof: >-
      tests/gq2-brick-gate.test.js — a brick whose file loads and exports correctly but FAILS its covering test is HELD (the
      case the old shape-only gate let through), the failing test named; a passing file passes.

  GQ4_phase_gate_keeps_the_test:
    layer: api
    status: OPEN
    depends_on: [GQ1_quality_stream]
    axioms: [§3.4, §1.1, §12.1, §17.5]
    blocks: ["phase_gate_quality"]
    files: [idearium/api/index.js]
    does: >-
      The phase gate always runs the test-first. Fix idearium/api/index.js:1726-1729 to MERGE the generated test-first
      condition with the map's own conditions instead of replacing it — so TF2's test is never silently dropped.
    proof: >-
      tests/gq4-phase-condition.test.js — a phasemap that declares its own conditions STILL runs the test-first (today dropped).

  AB1_autobuild_loop_and_resume:
    layer: automation
    status: BUILT 2026-10-19 (0.60.165, economy-resume slice)
    depends_on: [GQ2_brick_gate_runs_the_test, GQ4_phase_gate_keeps_the_test, MF1_model_fit_routing]
    axioms: [§3.4, §1.1, §12.1, §0.3]
    blocks: ["autobuild"]
    files: [lib/autobuild.js, idearium/api/index.js]
    does: >-
      The autobuild loop on SISO — the missing orchestrator. On phase.proven, advance to the next ready phase (nextReady).
      On a failed phase (ladder exhausted by economy/OOM/selector-drift), schedule a RETRY with backoff for when the economy
      slot (lib/economy/gate.js) and RAM (MF1) are free — real resume, not a terminal stop. Pre-dispatch guards so it waits
      instead of hammering. Every transition is an event; nothing silent (§1.2). Off by default until SET1 turns it on.
    proof: >-
      tests/ab1-autobuild.test.js — with a fake clock, a phase that fails on an economy limit is re-attempted after the slot
      frees (not left terminal); a proven phase advances to the next ready phase; a phase with open deps is not advanced to.

  AB2_hat_aware_ladder:
    layer: automation
    status: OPEN
    depends_on: [MF1_model_fit_routing]
    axioms: [§3.4, §8.6, §1.1, §12.1]
    blocks: ["hat_routing"]
    files: [lib/pipeline-routing.js, lib/hat-forge.js]
    does: >-
      The ladder is derived per hat/intent, not one size-ordered list for every job. Each hat (plan | test-first | code)
      declares its eligible agents and order; fallback climbs within that hat's roster. Reuse hat-forge and the existing
      reasoning-route hook (routing.reason_route). Local-first and model-fit (MF1) still apply within a hat.
    proof: >-
      tests/ab2-hat-ladder.test.js — a test-first job and a code job derive different ladders from their hats; fallback stays
      within the hat's roster; an empty/absent hat falls back to today's size-ordered ladder (no regression).

  SET1_autobuild_config_and_command:
    layer: cli
    status: OPEN
    depends_on: [AB1_autobuild_loop_and_resume]
    axioms: [§3.4, §1.1, §12.1]
    blocks: ["autobuild_config"]
    files: [idearium/lib/config-core.cjs, idearium/cli/route-commands.js]
    does: >-
      The autobuild settings as config keys + nexus.command rows (so every agent gets them): auto_advance on/off,
      resume_on_fault + backoff, required_checks (which quality checks must pass), serial-vs-parallel concurrency
      (reuse routing.contract_concurrency), pre-dispatch guards (skip at-limit / skip no-RAM), test_first. Surface the
      existing-but-hidden repos.* build controls through the same door. No paid-API keys.
    proof: >-
      tests/set1-autobuild-config.test.js — each key validates and round-trips through config-core; the command reads/writes
      them through the real route; an unknown key is refused.

  SET2_autobuild_settings_ui:
    layer: ui
    status: OPEN
    depends_on: [SET1_autobuild_config_and_command]
    axioms: [§3.4, §1.3, §12.1]
    blocks: ["autobuild_ui"]
    files: [idearium/ui/settings.html, idearium/ui/js/settings.js]
    does: >-
      Settings → Autobuild panel: auto-advance, resume-on-fault + backoff, per-hat ladder, concurrency, pre-dispatch guards,
      required checks, test-first — plus the repos.* controls that are config-only today. Driven in Clear Glass, never Playwright.
    proof: >-
      a Clear Glass test (clear-glass/src/driver/glass.js) — the panel reads the current autobuild config, toggles
      auto-advance and resume-on-fault, and the change round-trips through /api/config.

## ADDENDUM 2026-10-20 — DC1 generalized; GQ1 named in two maps
James, 2026-10-20: "spec it. the chunking system. can you also spec the graphs, traversal, dynamic chunking, gating,"
- DC1_dynamic_chunk_at_plan stays here as the contract-brick instance; DK1_dynamic_chunking of
  docs/2026-10-20-substrate-graph-traversal-chunking-gating-phasemap.spec depends on it and generalizes it (size by the consumer's
  learned budget AND split along what a gate failed), with DK2 learning the granularity by counting.
- Found: GQ1_quality_stream is defined both here and in docs/2026-10-19-gate-quality-checks-phasemap.spec (superseded by this map), so
  a bare `GQ1_quality_stream` in a depends_on is ambiguous and reads as dangling. The new maps name it as
  `docs/2026-10-19-solid-build-foundation-phasemap.spec::GQ1_quality_stream`. Both definitions kept (§0.3).

## ADDENDUM 2026-10-22 (0.60.203, SD20) — a starved machine does not spin
James, 2026-10-22: "yes" — to the coder's three fixes after his SP5 run at 1–9% free memory (map: docs/2026-10-10-idearium-solid-phasemap.spec
SD20_a_starved_machine_does_not_spin; CHANGELOG-0.60.203.md). What changes for the behaviour this map owns:
- Routing (MF1 here): a build with no ladder whose repo Settings pins Ollama climbs the pin, then the chain's agents
  (lib/pipeline-routing.js pinnedLadder). present and the MF1 fit check now apply to the pin: missing or too big for free memory → left off;
  critical memory → moved after the agents. Said on the run's route. The pin is never dropped by minBuildB.
- The officiator (RT1): a synthesized goal (intention + file) already queued, running, or failed/blocked within the hour is not queued again
  (the drop is marked duplicateOf); three of its own contracts failing in a row hold synthesis for an hour (unpark all clears it); memory is
  read before each synthesis, and the RAID worker waits on memory too.
- Landing an agent's files (CC1): while a phase builds, a file outside the phase's files, or a spec/doc while it asked for code, stays a
  proposal with why, whatever the inject mode (lib/repo-inject.js expectPhase/outOfPhase; land(); lib/code-edit.js commit).
Decided by his axioms: §8.6 (each fix routes into what existed: present, byFit, the attempts store, land's propose), §1.2 (every hold and
skip is said), USER_AUTONOMY (an off-phase file is his call), §0.3 (nothing deleted; a duplicate drop is kept and points at its contract).
