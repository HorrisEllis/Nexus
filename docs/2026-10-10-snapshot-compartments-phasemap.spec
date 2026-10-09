spec:
  meta:
    name:     snapshot-compartments
    version:  1.0.0
    date:     2026-10-10
    release:  0.56.0 (base)
    uuid:     nexus-snapshot-compartments-phasemap-v1-0000-2026-1010-jamesbrooks-001
    owner:    cos (compartments, branches, runs) · versionium (snapshots, file deltas) · intelligence/rfr2 (delta, sigma)
    status:   "MAPPED 2026-10-10, nothing built — after SD13 (the machine is COS's), behind the solid map"
    voice: >
      The ideas, the direction and the calls are James's. Each phase's `james:` is his, verbatim. `does:` is the coder's
      reading, his to correct. `pushback:` is where the coder thinks the plan as said has a hole — his to decide.
    axioms:   docs/AXIOMS-v3.1.md — §3.3 map before build, §8.6 reuse before build, §17.11 every performance claim names its benchmark
    origin: >
      James, 2026-10-10: "look at the architecture doc. what if a snapshot is a cos compartment? that can branch, or run in
      parralel to for benchmarks, using deltas and sigmas? using rfr2?" — the second time: docs/nexus-architecture-rebuild-
      phasemap.spec P10 (2026-08-13) answered his "cos to isolate or branch a copy? a snapshot before the compartment just
      in case. a test env." with lib/safe-apply.js.
  exists_already:
    snapshot:  "a versionium commit (vtm-…) with its file layer — a full copy then deltas (versionium/lib/files.js), restorable with a pre-restore snapshot (0.39.263, MCO-B)"
    branch:    "three kinds that do not know each other — cos/playground/branch.js BranchEngine.fork (a copy under .nex/branches), cos/workspace branchWorkspace + branchDisk (a git worktree + a qcow2 overlay, 0.39.279), lib/nexus-self/branch.js"
    run:       "cos/playground/sandbox.js SandboxRunner; lib/cos-run.js, lib/repo-run.js; lib/parallel-dispatch.js dispatchAll (governed, bounded concurrency)"
    compare:   "cos/playground/compare.js — file diff, run metrics (pass rate, exit codes, durations), stdout diff, regression map; cos CLI compare"
    safe:      "lib/safe-apply.js — mirror → branch → check → mergeBack (RAID-gated, refuses an unchecked branch)"
    rfr2:      "intelligence/rfr2 — delta: kinematic measurement of an event stream (rates per window, by logical eventTs, replay-deterministic); sigma: classifies a window of deltas into a trajectory (pure observer, never writes events); time: per-kernel logical clocks; adapter-sandbox: side-effect policy, null adapters in replay"
  feedback: >
    Yes — and almost every piece exists; what is missing is the join. Two meanings of "delta" meet here and both are
    needed: versionium's file deltas make a snapshot cheap to keep and to open; RFR2's deltas measure how a run behaves
    (its event rates over logical time), and sigma classifies that behaviour. A benchmark is then: the same workload run on
    two or more snapshots (or the same snapshot with two agents), each run's events → RFR2 delta → sigma, compared beside
    compare.js's file/metric/regression report.
  pushback: >
    (1) A snapshot is not a compartment until it is opened — opening every snapshot as a compartment would cost a copy (or
    a VM) per commit. A snapshot stays a record plus deltas; "open as compartment" makes a lazy branch of it (a worktree /
    a qcow2 overlay — the cheap kinds that exist), on demand, closed after. (2) Parallel runs on one machine compete for
    CPU and memory, so wall-clock numbers are noise: RFR2's logical time is replay-deterministic, but durations are not —
    benchmarks run the variants interleaved and repeated, and report spread, not one number (§17.11). (3) Sigma's output
    is never stored in event records (its own rule) — a benchmark's result is its own artifact, linked to the snapshots.
    (4) Three branch mechanisms is two too many — one is chosen (SN0) before anything is built on them.
  phases:
    SN0_one_branch:
      layer: library
      systems: [cos, core]
      status: "OPEN"
      james: '"that can branch"'
      depends_on: []
      files: [cos/playground/branch.js, cos/workspace/index.js, lib/nexus-self/branch.js, lib/safe-apply.js]
      does: "Read the three branch mechanisms against each other; keep one interface (fork, list, diff, merge back, close) with the cheap backends under it (worktree for files, qcow2 overlay for a VM); the others archived (§0.3), their callers moved."
      proof: "safe-apply, the workspace and nexus-self all branch through the one interface; the old paths are in _archive with a note"
    SN1_open_a_snapshot_as_a_compartment:
      layer: library
      systems: [versionium, cos, idearium]
      status: "OPEN"
      james: '"what if a snapshot is a cos compartment?"'
      depends_on: [SN0_one_branch]
      files: [versionium/lib/files.js, cos/workspace/index.js, idearium/repo/snapshot.js]
      does: "Any snapshot (a versionium commit) opens as a compartment: its files materialised from the full copy + deltas into a lazy branch, its desktop (if it had one) from the matching checkpoint. Closed after; a change made in it is a branch that can merge back through safe-apply."
      proof: "a commit from last week opens as a compartment, its tests run in it, the working repo untouched; closing it leaves nothing behind"
    SN2_run_in_parallel:
      layer: library
      systems: [core, cos]
      status: "OPEN"
      james: '"or run in parralel to for benchmarks"'
      depends_on: [SN1_open_a_snapshot_as_a_compartment]
      files: [lib/parallel-dispatch.js, cos/playground/sandbox.js, cos/playground/compare.js]
      does: "One workload (a command, a test suite, a phase build, an agent prompt) on N compartments — snapshots, or one snapshot with N agents — through dispatchAll's bounded concurrency; interleaved and repeated so the machine's own noise shows as spread."
      proof: "two snapshots × 5 repeats of the test suite: per-variant pass rates and durations with their spread"
    SN3_measured_by_rfr2:
      layer: library
      systems: [intelligence]
      status: "OPEN"
      james: '"using deltas and sigmas? using rfr2?"'
      depends_on: [SN2_run_in_parallel]
      files: [intelligence/rfr2/delta/index.js, intelligence/rfr2/sigma/index.js, intelligence/rfr2/time/index.js]
      does: "Each run's events stamped with its compartment's own logical clock (rfr2/time), streamed through rfr2/delta (rates, latencies per window) and classified by rfr2/sigma (its trajectory); the benchmark compares trajectories and deltas between variants beside compare.js's file/metric/regression report. Stored as a benchmark artifact linked to the snapshots and runs — never written into the event records."
      proof: "a deliberately slowed variant shows a different sigma trajectory and a delta gap; the same variant twice shows the same trajectory"
    SN4_benchmarks_teach:
      layer: library
      systems: [core]
      status: "OPEN"
      james: '"for benchmarks"'
      depends_on: [SN3_measured_by_rfr2]
      files: [lib/pipeline-routing.js, lib/economy/ledger.js]
      does: "A benchmark that ran agents against each other on the same snapshot feeds the learned order (as a verdict, like the gate's SD10) — which agent does which kind of job well is measured, not assumed; and a snapshot that regressed is said on its version in the repo's box (SD1)."
      proof: "after a benchmark, /api/routing's learned order for that job kind reflects it, with the benchmark named as its evidence"
