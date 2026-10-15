spec:
  meta:
    name:     one-contract-raid-releases
    version:  1.0.0
    date:     2026-10-15
    uuid:     nexus-one-contract-raid-releases-phasemap-v1-0000-2026-1015-jamesbrooks-001
    owner:    "raid (cortex/core/raid) · idearium · versionium · intelligence · cortex/self-heal · docs/atlases"
    release:  "0.60.35 onward — one release per phase"
    status:   "MAPPED 2026-10-15. GT1a built with this map (0.60.35)."
    origin: >-
      James, 2026-10-15, after the coder's look at Idearium's agents: "we added gating and chunking recursively,
      dynamically, like bricks. look at the contracts also and raid. i feel something happened". The coder found three
      things and one of its own (below). Then: "yes, read it all, map it first, in the phases, then update the atlas and
      .spec to reflect all the changes from the changelogs and use versioning in versionium for versions using the api.
      should be hooked into the atlas. just need more coordination for versions. rewind engine and snapshots for each
      gate, comparing using the contract, for the gating what ever is needed, so much of this exists, just need this
      working, so many stability tools and consistency tools, diagnostic system for failures and faults, failure mode
      reports using the intelligence system and the reflection engine, so much needs wiring and gaps filled."
      Earlier the same day: "need more coordination for releases. like i want idearium to have releases and a changelog
      for each version. it was added to the wrong place. like I want versionium to be working fully for versioning and
      revisioning, with the worksurface, file changes and diff."
    supersedes_in_part: >-
      docs/2026-10-13-gates-that-learn-and-priorities-phasemap.spec priority 6 ("RD0–RD2: RAID owns its contract and
      Idearium routes through RAID") — named there, never written as phases; written here. docs/2026-10-07-versionium-
      releases-phasemap.spec RN1–RN3 — built here, with one change named below (notes from commits before the lattice).
      0.60.34's GitHub-first release (the workflow decides a release) — demoted to a mirror (RN1). Nothing archived:
      every earlier entry stays and gets an addendum.

  # What happened — found 2026-10-15 by reading the code, not remembered
  found:
    two_contract_systems: >-
      RAID's contract queue (cortex/core/raid/contract-intake.js, 2026-08-28 — James: "we have all contracts, whether its
      from loom, idearium, co-pilot, self-heal go to raid's input folder, and queue, then through raid, creating a
      compartment per contract, setting the contract as the end state") and the .contract v2 bricks
      (cortex/core/raid/contract-gates.js, 0.60.15–0.60.18). They never meet: phase builds run v2 bricks and skip RAID's
      queue; spec-chunk builds and compile submit to RAID's queue "for observability" (the code's own word) and get no
      bricks. contract-gates lives in RAID's folder; RAID's processNext, officiator, boundary and context gate never call it.
    bricks_only_on_the_happy_path: >-
      _phaseBuild runs bricks only when a plan holds; routing.plan_code auto plans only with an Ollama model AND a
      reasoning agent on the ladder. No Ollama (down, or held by lean mode), no planner, or planner and derivePlan both
      failing → runWhole / runChunked: no bricks, no per-brick gates, no checkpoints — exactly when things go wrong.
    recursion_one_level: >-
      split() splits a brick into its actions once; a child is never split again (by design: CK-247, EA-02 guards against
      infinite decomposition). So "recursively" is one level today; a child still too big is "tried anyway".
    gt1_regression_the_coders: >-
      Idearium marks a whole failed ladder climb transient (0.60.18: only so Boundaries does not learn a size). GT1
      (0.60.30) made a transient failure not spend the brick's retry — so a failing brick re-climbed every agent up to
      retry_limit more times, and never got the capability lesson. Measured: 4 climbs where 2 were allowed. Fixed: GT1a.
    gates_not_versioned: >-
      A brick's checkpoint records the hashes of its inputs, not the Versionium commit it passed at; nothing rewinds a
      failed brick to its last passing state; nothing compares a gate's state now against what passed. The rewind and
      snapshot machinery exists (below) but is not joined to gates.
    releases_in_the_wrong_place: >-
      0.60.34 put releases on GitHub (a workflow) and changelogs as files at the root. His 2026-10-07 map puts them in
      Versionium (RN1–RN3: a release is a node and a tag; cortex is the bookkeeper; a Releases section per repo). The
      atlases were last regenerated at 0.60.19 — fifteen releases (0.60.20–0.60.34) are not in them.
    failures_scattered: >-
      A brick's failure is classed (GT1) and raises fault-taxonomy friction, but is not a fault_log row, not a
      .failure_mode node, never enriched by failure-mode forensics, never scored by the reflection engine, and no report
      says "what failed in this run, how often, why, and what to try".

  # What exists — read 2026-10-15; reuse, never rebuild
  grounded:
    raid_queue:        "contract-intake.js submitContract / processNext (a compartment per contract, qaqcLayer, retry / fallbackAgent, HEAL_REQUESTED on exhaustion), reportExternalOutcome, synthesizeContract, submitBuildPhaseContract, reconcileOnBoot; worker.js drains it"
    raid_gates:        "contract-boundary.js (primitive + invariants + principles), context-gate.js gateCandidate (in-bounds), officiator.js (contract synthesis from a staged artifact), lib/constitutional-ai.js (RAID's constitution), cortex/core/raid/index.js routing"
    bricks:            "contract-gates.js evaluate / check / packet / split / shouldSplit / schedule / Boundaries / classifyFailure; contract-adapters.js agentExecutor / fromPhasePlan / openCheckpoint / audit"
    phase_build:       "idearium/api/index.js _phaseBuild: planMode → planner → parsePlan → derivePlan (PF2) → runContract (CG.schedule) | runChunked | runWhole; _provePhase is the integration gate"
    versions:          "lib/repo-versions.js (every write a commit, settled), idearium/repo/snapshot.js commitRepoSnapshot, snapshot-restore.js, versionium routes (commit, branches, history, restore, state, calendar, files), repo.versions.index / diff / tree / restoreFile, the Versionium tab (ui/js/repo-versions.js), lib/repo-run-state.js (pause / rewind)"
    rewind_replay:     "lib/replay-engine.js (snapshot before every decision, replay, detectDivergence), clear-glass/src/rewind/engine.js (RewindEngine; agent tool rewind-replay)"
    faults:            "lib/fault-log.js logFault / checkFaultHistory, lib/phase-faults.js modeOf / faultsOf / precedent, cortex/self-heal/fault-taxonomy.js raiseFriction, cortex/self-heal/failure-mode-forensics.js enrichFailureMode / generateDebugMacro / computeSigmaDelta, schema.failure_mode, schema.debug_macro"
    intelligence:      "intelligence/causal (anomaly, compound), intelligence/cfr (contract-verifier, delta, ledger), lib/reflection.js runReflectionPass / scoreDecision, lib/introspect.js, lib/case-library.js"
    checks:            "lib/check-catalogue.js (CK-230 shadow, CK-233 deny, CK-248 toolchain, CK-253 versions), lib/import-checks.js"
    atlases:           "lib/atlas-generate.js (a generated section between markers per docs/atlases/<system>-atlas.md), scripts/generate-atlases.js, lib/context-atlas.js (search), README synced from the nexus atlas"
    release_version:   "lib/release-version.js (0.60.34): current / agreement / released / fromFiles / describe; scripts/release-zip.js; .github/workflows/release.yml"

  decided:
    - id: one_contract_raid_owns_it
      james: '"look at the contracts also and raid. i feel something happened" · "yes, read it all, map it first"'
      chosen: >-
        The .contract v2 is RAID's contract. RAID's queue (contract-intake) is the one door every build source uses;
        RAID runs a contract's bricks through contract-gates' scheduler with the submitting system's executors, applies
        its own gates before (boundary, constitution) and after (QA/QC verdict = the evaluator's completion), and keeps
        the row, retry / fallback and HEAL_REQUESTED it already has. Old contracts keep working: a legacy contract becomes
        a one-brick .contract. The coder's design; James said yes to "one contract system, owned by RAID".
    - id: bricks_everywhere
      chosen: "Every build path is bricks: no plan → the phase's own files become bricks; no files named → one brick for the phase. runWhole / runChunked stay only behind routing.contract_build: off."
    - id: recursion_depth_bounded
      james: '"yes" (to "do you want recursion deeper than one level?")'
      chosen: "A child still too big or failing twice splits again, by a different axis (its file's units, then its requirement's sentences), to routing.contract_depth (default 3); an indivisible piece stops and says so; never re-split on the same pieces (CK-247)."
    - id: notes_before_lattice
      chosen: >-
        The coder's change to the 2026-10-07 order (VR1 → LT1 → VR2 → RN1 → RN2): release notes are a projection of the
        commits, files, tests and his quote from the version line first; the provenance lattice (LT1) later. Said, to
        confirm.
    - id: github_is_a_mirror
      chosen: "Versionium decides a release; GitHub publishes what Versionium released (the workflow stays, demoted). The CHANGELOG-*.md files stay as a readable copy, written from the release record."

  phases:
    GT1a_exhausted_climb_spends_its_attempt:
      status: "DONE 0.60.35"
      files: [cortex/core/raid/contract-gates.js, cortex/core/raid/contract-adapters.js, idearium/api/index.js]
      does: "An executor that walked its whole ladder (out.exhausted) has tried: its transient failure spends the brick's attempt. The capability lesson still follows the classifier."
      proof: "test-contract-adapters GT-08: a failing brick climbs exactly retry_limit times (4 before the fix — the test fails on the old code)"

    RD0_raid_runs_the_contract:
      status: "DONE 0.60.36 — contract-intake runContract / submitV2 / registerExecutors / legacyToV2; processNext runs v2 rows; RAID's gates before (intent contract, _approveTool: constitution + the source's contract, action build); verdict = completion; HEAL_REQUESTED carries failed bricks and classes. test-raid-runs-contract RR-01..05"
      depends_on: [GT1a_exhausted_climb_spends_its_attempt]
      files: [cortex/core/raid/contract-intake.js, cortex/core/raid/contract-gates.js, cortex/core/raid/contract-boundary.js]
      does: >-
        contract-intake gains runContract(file | payload, { source, executors, onEvent, onCheckpoint }): one queue row
        (kind v2, the contract file, its bricks), RAID's gates before (contract-boundary resolves the boundary; the
        constitution check refuses what it forbids — said, BLOCKED, never run), then contract-gates.schedule inside the
        row's compartment, the verdict = evaluate().complete with the audit, and on exhaustion the HEAL_REQUESTED it
        already emits — carrying each failed brick's GT1 class. processNext runs v2 rows the same way (executors from a
        registry by source). A legacy contract is wrapped as a one-brick .contract (nothing lost).
      proof: "a .contract submitted to RAID: its bricks run, the row PASSes with the audit; a constitution-refused one is BLOCKED and never runs; an exhausted one emits HEAL_REQUESTED naming its bricks and their classes; a legacy contract still runs"

    RD1_every_build_goes_through_raid:
      status: "PARTLY DONE 0.60.37 (RD1a) — the phase build runs through RAID's runContract (a v2 row, RAID's gates, the verdict, self-heal); spec-chunk builds and compile pass RAID's gates (gateBefore) before they run. RD1b open: the spec engine's chunks as bricks of a contract (their completion arrives later through Guardian's job callback, so the chunk loop must become the scheduler's)"
      depends_on: [RD0_raid_runs_the_contract]
      files: [idearium/api/index.js, lib/repo-agent.js]
      does: >-
        _phaseBuild's runContract calls RAID's runContract (not CG.schedule directly); speceng.build's spec-chunk builds
        and compile stop being "observability only": each chunk is a brick of a contract RAID runs. RAID's queue shows
        every build, live; `raid queue` / the contract audit are one view.
      proof: "a phase build and a spec-chunk build each leave one RAID row with bricks; nothing builds outside RAID (a check: no CG.schedule call outside contract-intake)"

    BR1_bricks_on_every_path:
      status: "DONE 0.60.38 — no plan mode → the plan is written from the phase itself (PF2's derivePlan) and built as bricks through RAID; a phase that names no file → contract-adapters fromWholePhase (one gated brick + the integration gate). runWhole / runChunked only behind routing.contract_build: off. test-contract-phase-build CP-10/11, test-raid-runs-contract RR-07"
      depends_on: [RD1_every_build_goes_through_raid]
      files: [idearium/api/index.js, cortex/core/raid/contract-adapters.js, lib/phase-plan.js]
      does: "No plan → contract-adapters.fromPhase(phase): a brick per file the phase names (requirement = its body, does, proof), else one brick for the phase; the coders are whatever the ladder has (Ollama or the agents). Lean mode and a down Ollama keep gates and checkpoints."
      proof: "with no Ollama on the ladder and no planner: the phase still runs as bricks, checkpointed; a resumed build skips the passed ones"

    GS1_a_snapshot_per_gate_rewind_and_compare:
      status: OPEN
      depends_on: [BR1_bricks_on_every_path]
      files: [cortex/core/raid/contract-gates.js, lib/repo-versions.js, idearium/repo/snapshot-restore.js, lib/replay-engine.js]
      does: >-
        A brick that passes records the Versionium commit it passed at (repo-versions flush → commitId) on its
        checkpoint. A brick that fails rewinds its own files to its last passing commit (or the build's snapshot) before
        the retry — so a retry starts from known-good, not from the failed attempt's half-write. compare(gate): the
        evaluator's STALE reasons + the Versionium diff of the gate's files between its pass commit and now (the
        contract says which files are its). The replay engine logs the gate's decision (snapshot, alternatives, outcome)
        so detectDivergence can say where a rerun parted from the run that passed.
      proof: "a planted half-write by a failing brick is gone before its retry; `contract compare <file> <gate>` shows the diff since it passed; a rerun's divergence is named"

    BR2_recursion_to_a_depth:
      status: OPEN
      depends_on: [GS1_a_snapshot_per_gate_rewind_and_compare]
      files: [cortex/core/raid/contract-gates.js]
      does: "split(by: 'units') on a child: the file's existing code units (lib/chunker) or its requirement's sentences; routing.contract_depth bounds it; CK-247 is a runnable check (no re-split of the same pieces, depth said)."
      proof: "a child failing twice splits again by units; at the depth bound it stops and says so; never the same pieces twice"

    RN1_versionium_tags_and_releases:
      status: OPEN
      depends_on: [GS1_a_snapshot_per_gate_rewind_and_compare]
      files: [versionium/lib/engine.js, versionium/routes/versionium.js, lib/release-version.js, idearium/api/index.js]
      does: >-
        Versionium gains tags (a name on a commit that never moves) and releases (a record: repo, version, tag, commit,
        the commits since the previous release, his quote, notes, systems touched) — POST/GET /api/versionium/releases,
        /tags. Every Idearium repo has its own; Nexus's own repos (nexus-self) take the release from lib/version.js: a
        version change records the release through the API. Backfill: every version line and CHANGELOG (243 today)
        becomes a release record; the files stay. The GitHub workflow mirrors: it publishes a release Versionium has.
      proof: "a repo released twice: two tags, each release lists exactly its commits; Nexus's backfill has every release (243 at 0.60.34); restoring a release restores its tag's tree"

    RN2_changelog_from_the_commits:
      status: OPEN
      depends_on: [RN1_versionium_tags_and_releases]
      files: [lib/release-notes.js]
      does: "A release's changelog is written from what landed: his words (the version line), the files changed by system, the tests that ran, the gates that passed; nothing an agent claims. CHANGELOG-<version>.md is written from it (a readable copy)."
      proof: "a release's notes list exactly its commits' files; a claim with no commit behind it cannot appear"

    RN3_releases_in_idearium:
      status: OPEN
      depends_on: [RN2_changelog_from_the_commits]
      files: [idearium/ui/js/repo-versions.js, idearium/cli/route-commands.js]
      does: "The Versionium tab gains Releases: every version, newest first, its changelog, one click to its diff and files, and its work-surface revisions between releases. `repo releases`, `repo release <repo> [--version]`."
      proof: "Clear Glass: Nexus's Releases lists the backfill and the newest; opening one shows its commits and diff"

    AT1_atlases_and_specs_from_releases:
      status: OPEN
      depends_on: [RN2_changelog_from_the_commits]
      files: [lib/atlas-generate.js, scripts/generate-atlases.js]
      does: >-
        Each system's atlas gains a generated Releases section (the releases that touched it, newest first, from
        Versionium), and each system's own spec a generated release ledger block; the atlases are regenerated now
        (0.60.20–0.60.35 caught up) and on every release. The atlas search (lib/context-atlas.js) finds releases.
      proof: "every atlas names its system's newest release; the registry and the releases agree; a release regenerates the atlases it touched"

    FR1_failure_reports:
      status: OPEN
      depends_on: [RD0_raid_runs_the_contract]
      files: [lib/contract-failures.js, lib/fault-log.js, cortex/self-heal/failure-mode-forensics.js, lib/reflection.js]
      does: >-
        Every gate failure becomes a fault_log row (mode = its GT1 class, the brick, agent, kind, contract, commit) and,
        when it recurs, a .failure_mode node enriched by failure-mode forensics (the causal chain, sigma delta, a debug
        macro to replay it). A contract run ends with a failure report: what failed, how often, which agents, which
        classes, the precedent (phase-faults), what to try — and the reflection engine scores the run's decisions
        (routing, splitting) so the next route reads it. Shown on the Plan; `contract report`.
      proof: "a run with planted failures of three classes: three fault rows, one failure_mode for the recurring one with its macro, a report naming each with a next step, reflection's score written"

    ST1_stability_checks:
      status: OPEN
      depends_on: [FR1_failure_reports]
      files: [lib/checks/]
      does: "QA1's next runners where they guard this work: CK-231 half-states (bricks or rows left RUNNING past their timeout), CK-245 a retry changes something (consecutive identical attempts), CK-247 bounded decomposition, CK-239 every edge has two ends (contract depends_on, loom wires)."
      proof: "each runner red on a planted case, green on Nexus"

  order: "GT1a → RD0 → RD1 → BR1 → GS1 → BR2 → RN1 → RN2 → RN3 → AT1 → FR1 → ST1. RD0 first: one contract under RAID is the frame every later phase hangs on. Versions (RN1–AT1) after the gates can snapshot, since a gate's commit is what a release lists."

## ADDENDUM 2026-10-15 — RD0 built (0.60.36)

# RAID's own approval (_approveTool) is the gate before a contract runs — the constitution first, then the source's own
# RAID contract (cortex/contract/index.js allowed_actions): idearium, copilot and cli may 'build'; guardian and
# orchestrator may not, so a contract they submit is BLOCKED and said (RR-02). Found by RR-04: a queued contract did not
# remember the root its refs are relative to, so processNext ran it against Nexus's own tree; the row now carries root.
# Not changed: legacy rows still run through processNext's compartment path exactly as before; legacyToV2 is there for
# a caller that wants bricks (RD1 moves the build sources over).

## ADDENDUM 2026-10-15 — RD1a built (0.60.37); RD1b named

# The phase build calls contract-intake.runContract instead of contract-gates.schedule: RAID's queue row (kind v2), its
# gates, the bricks with the build's executors, the verdict, self-heal on failure (CP-09: the build's row names RAID's
# PASSed v2 row and the same contract file). Spec-chunk builds and compile were "observability only"; now RAID's gates
# decide before they run (gateBefore: the hat's intent contract when worn — or a base agent's — then RAID's approval);
# a refusal fails the chunk / the build, said (403 RAID_REFUSED). A ladder model (ollama:qwen…) is not asked the base-
# agent intent question (it is not a base agent); RAID's approval still applies.
# Found by the test: a loaded checkpoint (openCheckpoint) carries no `v`, and runContract refused it — fixed.
# RD1b, named: a spec's chunks become bricks of one contract. Not done here because a chunk's completion often arrives
# later through Guardian's job callback (result.queued), so the spec engine's own loop has to become the scheduler's.

## ADDENDUM 2026-10-15 — BR1 built (0.60.38)

# Before: bricks only when routing.plan_code planned (an Ollama model AND a reasoning agent on the ladder). Now every
# build with routing.contract_build on (the default) is bricks: no plan mode → Nexus writes the plan from the phase itself
# (derivePlan, 0.60.28 PF2) with no planner asked, and builds it as bricks through RAID (CP-10); a phase that names no
# file → one whole-phase brick (fromWholePhase) whose phase gate passes only on the proof run (RR-07). The old paths stay,
# kept, behind routing.contract_build: off (CP-11); test-chunked-phase-build is pinned to that setting so it still guards
# the one-file-at-a-time path (its 15 checks pass).
