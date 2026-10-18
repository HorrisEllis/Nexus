# docs/2026-10-18-debugging-product-phasemap.spec
# The product for debugging: one question, "what went wrong, why, and how do I go back", answered by joining the systems that
# already each answer a part of it, on one key.
# MAPPED 2026-10-18, nothing built (docs/CLAUDE.md rule 1). Registered in docs/SPEC-REGISTRY.spec.
# Extends: docs/2026-10-16-repo-carve-phasemap.spec (FR1-FR5, the flight recorder product); docs/2026-10-16-durable-work-
# timeline-phasemap.spec (TL1b built 0.60.143, TL3 the timeline, TL4 rewind); docs/2026-10-15-gate-held-work-phasemap.spec
# (GW17 friction per file, GW18 debug by bisect, GW27 everything a node); docs/2026-10-17-pieces-not-order-phasemap.spec (PC2).

origin:
  date: 2026-10-17
  james:
    - >-
      "can we spec the product for debugging. the intelligence system crystalization  memory, rewind engine, versionium, cos,
      rfr2, cos, runtime deviation and friction detection, gap detection, diagnostic system? look at the specs. after that.
      should the chunks, contracts, phases, dependancies all have syncronized ids or uuids, also in relation to the job. also
      what about using the dependencies to map gaps in codebases or repose, files or code"
    - >-
      (2026-10-18, before this map was written) "Continue. We need persistent data look at the last commit." — built first as
      TL1b (0.60.143): the agent's reply on disk as it streams. A debugger over data that a reload loses has nothing to read.
  context: >-
    On 2026-10-16 he asked of rfr2, versionium, the event ledgers, the causal graph and the COS test env: "its a product?" The
    coder's reading then was an undo button and flight recorder for AI coding agents (products/flight-recorder, FR1-FR4a
    built). This message names the debugging systems to bring into the product, and asks two design questions after it.
  reading: >-
    The coder's reading, to confirm. "The product for debugging" is the flight recorder grown into a debugger: the same
    product (products/flight-recorder), so a change is not only recorded, tested and undoable, but explainable. The second
    reading is a spec for debugging Nexus itself with these systems. One map serves both, because Nexus's own agents use the
    product on Nexus (decision_where_the_product_is_built, 2026-10-17). Which one he meant is DBG0c below.

found:
  # §8.6, read in code 2026-10-18. Each system already answers one part of the question; none of them asks the others.
  intelligence_crystallization_memory:
    files: [intelligence/index.js, warp/plugins/crystallizer-flatfile.js, warp/dispatch/deltaCache.js, lib/context-atlas.js]
    gives: >-
      Patterns that recur graduate: intelligence/index.js crystallises BEP pairs (threshold 3 for rare types, 10 for common)
      into bep_patterns / crystals, served at GET /api/intelligence/patterns and /crystals; WARP's crystallizer promotes a
      generation that passed and can invalidate it. The memory tables (context-atlas DESCRIBED): fix_map (failure → the fix
      that worked), failure_modes, fault_taxonomy, memory_unified.
    for_debugging: "has this happened before, and what fixed it"
    missing: "nothing keys a crystal or a fix_map row to the phase, chunk or file it came from, so a new failure cannot ask"
  rewind_engine:
    files: [lib/replay-engine.js, clear-glass/src/rewind/engine.js, lib/agent-tools/tools/sandbox/rewind-replay.js, cortex/core/raid/contract-gates.js]
    gives: >-
      Three rewinds, separate: lib/replay-engine.js (a snapshot before every decision, replay from any point, compare,
      merge or discard); Clear Glass's RewindEngine (the browser's, reached by copilot through rewind-replay); contract
      checkpoints { gate, at, hashes, agent, commit } with openCheckpoint (STALE when inputs changed). TL4 (open) is the
      one rewind to a gate, mapped to be built once.
    for_debugging: "go back to the last state that was good"
  versionium:
    files: [versionium/lib/engine.js, versionium/lib/files.js, versionium/lib/causality.js, versionium/lib/text-diff.js, versionium/lib/merge3.js, lib/repo-versions.js]
    gives: >-
      Every apply and revert is a commit (repo-versions commitNow, labels name the inject); file deltas; causality.js
      causalChain(commit) over versionium_commits + event_log; merge3 for an undo that keeps later edits (FR3).
    for_debugging: "what changed, in what order, caused by what"
  cos:
    files: [cos/testenv/index.js, cos/playground/branch.js, cos/playground/compare.js, cos/spec/check-catalogue.spec, lib/check-catalogue.js, docs/cos-debug-report.spec]
    gives: >-
      A throwaway place to run a change (testenv: a process, or a VM), branches that can be run and compared, and 119
      catalogued checks with stages including 'debug' and 'diagnostic'. proposal-evidence runs a change's linked tests
      before and after in a shadow (FR2).
    for_debugging: "reproduce it somewhere it can break safely; bisect (GW18, open)"
  rfr2:
    files: [intelligence/rfr2/index.js (observer, delta, clip, causality, sigma, time, query, version-gate, ...), docs/rfr2.spec]
    gives: "the relational field reader: what was around a moment (observer, clip, delta) and its causal reading (causality, sigma)"
    for_debugging: "the conditions a failure happened in"
  runtime_deviation:
    files: [lib/seam/detector.js, lib/expectation-tests.js, idearium/repo/proof-run.js, lib/sigma-roles.js]
    gives: >-
      The detector scores a reply on truncation, sigma (behavioural deviation from the expected shape) and delta; TF1
      expectation tests and the proof run state what a phase should do and check it.
    for_debugging: "where the run left what was expected"
    missing: "deviation is scored per reply, not per run: planned files vs written, expected time vs taken, retries"
  friction:
    files: [diagnostic/nexus-diagnostic.js (sigma / friction / drift per system, GET /friction, data/diagnostic/friction), lib/phase-faults.js, lib/fault-log.js]
    gives: "per-system friction scores; every way a phase build goes wrong as a fault record, read back before the next attempt (AR2)"
    missing: "friction per FILE and per piece (GW17, open): which file keeps costing retries, refusals and stalls"
  gap_detection:
    files: [lib/gap-field.js, lib/gap-priority.js, lib/gap-relay.js, loom/scanners/wiring-gaps.js, loom/scanners/dangling-report.js, loom/scanners/stub-finder.js, docs/gap-finder.spec, docs/gap-lifecycle.spec]
    gives: "one entry point, gap-field report() (dedup, occurrences, explainWhy, logFix, resolve); a priority score; loom's scanners for declared ≠ served"
  diagnostic:
    files: [diagnostic/ (its own system since 0.60.136/138: server.js, healer/, lib/heal-loop.js, lib/wire-integrity.js, lib/pulse-watch.js), lib/diag-engines/index.js, lib/diagnostic-causal.js, lib/diagnostic-report.js, lib/pressure-window.js]
    gives: >-
      diagnostic-report composes a report per gap (intelligence, CFR, RFR2: the conditions before, the effects after);
      diagnostic-causal traces each finding's conditions; pressure-window answers "what led to this?" as a story.
    note: "docs/atlases/diagnostic-atlas.md still says 'not confirmed as a standalone system' — stale since 0.60.138; to update"
  already_joined:
    - "lib/change-record.js (FR1): one change's what, who, why (task and run), checked, landed (commits), timeline, undo, holes"
    - "lib/work-journal.js (TL1b, 0.60.143): an agent reply and its thinking on disk as it streams, with a timeline"
  the_gap: >-
    Each system answers alone, keyed by its own id, so no one can ask the question across them. A failed phase build has a
    guardian jobId (random uuid), a run row (phrun-<ts>-<rand>), a run-state (<repo>__brick-<brick>), a contract
    (phase-<key>, its bricks b<n>.<file>), injects (random uuids), commits (versionium uuids), fault rows and gaps. Only
    change-record joins some of them, partly by "matched by path and time".

ids:
  # read in code 2026-10-18: what each thing is called, and how the id is made
  phase: "roadmap uuid `${projectId}:${mapPath}:${phaseId}` (idearium/repo/roadmap.js:115) — derived from what it is; phase_key is its name"
  dependency: "a phasemap's depends_on lists names (phase keys, decision keys); a contract gate's depends_on lists brick ids; a plan's imports list file paths"
  contract: "`phase-<phaseKey>` (contract-adapters.js), one file per repo: <map>.<phase>.contract — derived"
  chunk_of_a_contract: "`b<n>.<file>` — POSITIONAL: the n is the file's place in the plan's order, so a re-ordered plan renames every brick"
  chunk_of_a_spec: "crypto.randomUUID() (idearium/spec-engine/index.js:500, 1802)"
  run: "`phrun-<ts36>-<rand4>`, and -review / -proof suffixes (idearium/api/index.js:789) — one per attempt"
  run_state: "`<repo>__<session>` or `<repo>__brick-<map>::<phase>::<gate>` (lib/run-state.js runIdFor, 0.60.77) — derived"
  job: "guardian randomUUID (guardian/lib/jobs.js:214); its agentId is `repo-<repo uuid>`; it carries no phase, chunk or run"
  change: "inject uuid, randomUUID (lib/repo-inject.js); since FR1 it records the task it was written in"
  journal: "`<repo>/<jobId>` (lib/work-journal.js, 0.60.143)"

decisions:
  DBG0a_synchronized_ids:
    asked: '"should the chunks, contracts, phases, dependancies all have syncronized ids or uuids, also in relation to the job"'
    status: "DECIDED 2026-10-18 by his axioms (applied by the coder) — D10 in docs/2026-10-17-decisions-by-the-axioms.spec"
    chosen: >-
      Synchronized by a shared KEY, not by one shared uuid. Two kinds of id, by what the thing is:
      (1) a thing that IS (a phase, a chunk, a contract, a dependency edge) gets a derived, stable key from its place in the
      map: `<repo>/<map>::<phase>` for a phase and its contract, `<repo>/<map>::<phase>::<chunk>` for a chunk, and an edge is
      `<from key> -> <to key>`. Restart, re-plan or another agent: the key is the same, so everything about it joins.
      run-state already does this for bricks (0.60.77); this makes it the rule.
      (2) a thing that HAPPENS (a job, a run attempt, a change, a commit, an event) keeps its own random id, and carries the
      key of what it happened to. A job carries { key, attempt }; so do the run row, the journal, the inject's task, the
      checkpoint and the fault row.
      A chunk's key is named for what it is (its file, or its purpose and interface after PC1), never its position: b<n> is
      replaced, kept readable as an alias (§0.3).
    axioms:
      - "§10.1 one write authority per data type: each system keeps writing its own ids; a shared uuid would make one system the authority for everyone's."
      - "§5.14 a component stays replaceable behind its contract: the key is part of the contract, the storage id is not."
      - "§1.1 / §0.1 evidence over memory: change-record had to match changes to runs 'by path and time'; a carried key makes that a lookup, and a missing key a named hole."
      - "§7.6 no second record: the key is a field on records that exist, not a new store."
      - "identity, a primitive of cos/spec/check-catalogue.spec: a thing's identity is what it is; an occurrence's is when it happened."
      - "PC2 (his: 'not linear, like a torrent'): pieces in any order need names that do not depend on order."
  DBG0b_dependencies_map_gaps:
    asked: '"what about using the dependencies to map gaps in codebases or repose, files or code"'
    status: "DECIDED 2026-10-18 by his axioms (applied by the coder) — D11 in docs/2026-10-17-decisions-by-the-axioms.spec"
    chosen: >-
      Yes. A dependency is a claim that something exists and provides something. Every edge whose far end is missing, or
      does not provide what is used, is a gap, found without a model. Five edges, all already read by some piece of Nexus
      and reported by none: a require or import to a file that is not there (component-store unresolved; repo-carve missing);
      a name used that its target does not export (test-first usesOf, code-intel decls); a phase or decision depends_on a
      name found nowhere (phase-deps-gate unknown); a declared wire or route that is not served (loom/scanners wiring-gaps,
      dangling-report); a plan's import that no planned or present file provides. Each goes through the one door,
      lib/gap-field.js report(), type reference, with the edge as its evidence. The reverse is also a finding: a file
      nothing depends on (an orphan) is said, never deleted (§0.5). It works on any repo the repo layer can read, and on a
      single file. Built as DBG4.
    axioms:
      - "§3.1 / deterministic first (docs/CLAUDE.md, 2026-10-13: 'A parser, a test, a grep or a check runs before any model is asked')."
      - "§8.6 reuse before build: the five readers exist; DBG4 composes them."
      - "§1.2 nothing fails silently: an edge to nothing is a failure that has not happened yet."
      - "one gap door (lib/gap-field.js, his 2026-08-09: 'keep one output. Needs to stay agnostic. Gap field.')."
  DBG0c_which_product:
    asked: "is the debugger the flight recorder grown (one product), a second product beside it, or debugging for Nexus itself?"
    coder_recommends: "one product: the flight recorder grown. Same records, one more question asked of them, and Nexus is its first user. To confirm."
    status: OPEN (his — direction, what the product is for)

phases:
  # bottom-up: backend -> route -> command -> UI (docs/CLAUDE.md). Tested in Clear Glass, never Playwright.
  DBG1_the_key:
    status: OPEN
    depends_on: [DBG0a_synchronized_ids]
    files: [lib/lineage.js (new), cortex/core/raid/contract-adapters.js, idearium/api/index.js, guardian/lib/jobs.js, lib/run-state.js, lib/work-journal.js, lib/repo-inject.js, lib/phase-faults.js]
    does: >-
      lib/lineage.js key({ repo, map, phase, chunk }) and parse(key): the derived key (DBG0a). A phase build's dispatch
      puts { key, attempt } on the guardian job (its meta, passed through to its frames), the run row, the run-state, the
      journal, the inject's task, the contract checkpoint and the fault row. Brick ids become name-derived (the file, or the
      piece's purpose after PC1); the old b<n> id is kept as an alias on the gate so saved contracts and checkpoints still
      resolve.
    proof: "one real phase build, killed and rebuilt with its plan re-ordered: every record of both attempts carries the same keys; the old b<n> ids still open the saved contract"
  DBG2_the_case:
    status: OPEN
    depends_on: [DBG1_the_key]
    files: [lib/debug-case.js (new), lib/change-record.js, lib/work-journal.js, lib/run-state.js, cortex/core/raid/contract-gates.js, versionium/lib/causality.js, lib/fault-log.js, lib/seam/detector.js, lib/gap-field.js, lib/diagnostic-report.js]
    does: >-
      case(key | jobId | runId) → one record of what happened to that phase or chunk, every system's part in its own
      section, each with its source: the replies (journal), what it did (run-state, run rows), the gates and their hashes
      (checkpoints), what it changed (change-record), the commits and their causal chain (versionium causality), what failed
      and failed before (fault-log, phase-faults), how far the replies deviated (detector), the open gaps on its files
      (gap-field), the conditions (diagnostic-report, rfr2), and what fixed this before (fix_map, crystals). A section with
      nothing is a named hole, never left out (§1.2). A projection of records that exist, never a second record (§7.6).
    proof: "a fixture phase that fails twice then passes: its case lists both attempts, both replies, the fault each time, the change that fixed it and its commit; a missing commit is a hole, named"
  DBG3_deviation_and_friction_per_run:
    status: OPEN
    depends_on: [DBG2_the_case]
    files: [lib/debug-case.js, lib/phase-faults.js, lib/seam/detector.js, lib/expectation-tests.js, diagnostic/nexus-diagnostic.js]
    does: >-
      Deviation per run, not only per reply: planned files against written files, the expected conditions against the
      proof, the time and attempts against the phase's own history. Friction per file and per piece (GW17, built here):
      retries, refusals, stalls and reverts counted by key, so the file that keeps costing is named. Both read in the case,
      and friction per file joins diagnostic's per-system friction.
    proof: "a file that needed three attempts across two phases tops the friction list with the attempts named; a run that wrote a file its plan never named shows that deviation"
  DBG4_dependency_gaps:
    status: OPEN
    depends_on: [DBG0b_dependencies_map_gaps]
    files: [lib/dep-gaps.js (new), lib/component-store.js, lib/repo-carve.js, lib/test-first.js, lib/code-intel/decls.js, lib/phase-deps-gate.js, loom/scanners/wiring-gaps.js, loom/scanners/dangling-report.js, lib/gap-field.js, idearium/api/index.js, idearium/cli/route-commands.js]
    does: >-
      scan({ root | repo, files? }) → the five edge gaps of DBG0b and the orphans, each with its edge (from, to, what is
      used) and the reader that found it; report() each through lib/gap-field.js (type reference, source dep-gaps;
      dedup means a re-scan bumps occurrences, never doubles them). Any Idearium repo, Nexus, or one file.
      GET /api/repos/:uuid/gaps/deps, `repo gaps <repo> --deps [--file p]`, and the Code tab's gaps view.
      Independent of DBG1-DBG3: buildable first.
    proof: "a fixture repo with a require to a missing file, a use of a name its target does not export, a depends_on to nowhere, a declared route not served, and an orphan: five gaps and one orphan, each with its edge; a second scan bumps occurrences"
  DBG5_rewind_from_a_case:
    status: OPEN
    depends_on: [DBG2_the_case, TL4_rewind_to_a_gate]
    does: >-
      The case names its rewind points (checkpoints with a commit, versionium commits, the change's undo) and opens TL4's
      rewind on one. Built once in TL4 (pipeline-focus: build each once); here it is only the door from the case.
    proof: "from a failed case, rewind to the last passed gate: files back to its commit, later pieces pending, the rewind on the timeline"
  DBG6_cases_crystallize:
    status: OPEN
    depends_on: [DBG2_the_case, DBG3_deviation_and_friction_per_run]
    files: [lib/debug-case.js, intelligence/index.js, lib/fault-log.js]
    does: >-
      A closed case (a fault, then a change whose proof passed) writes fault → fix to fix_map with the key's kind and the
      fault's fingerprint. The next case with the same fingerprint says "seen before: <fix>, in <case>", with the count. The
      crystallisation thresholds stay intelligence's own.
    proof: "the same fixture failure twice in two repos: the second case names the first fix"
  DBG7_route_command_ui:
    status: OPEN
    depends_on: [DBG2_the_case]
    files: [idearium/api/index.js, idearium/cli/route-commands.js, idearium/ui/js/code-surface.js]
    does: "GET /api/repos/:uuid/debug?key=|job=|run=, `repo why <repo> <key|job|run>`, and a 'why' panel in the Code tab's Runs view (TB0-TB8) that opens the case"
    proof: "in Clear Glass: a failed run in the Runs view opens its case, each section linked to its source"
  DBG8_in_the_product:
    status: OPEN
    depends_on: [DBG2_the_case, DBG0c_which_product]
    files: [products/flight-recorder/product.json, products/flight-recorder/bin/flight-recorder.js, products/flight-recorder/README.md]
    does: "the case files join the product's must list; `flight-recorder why <id>` from a carved copy, state in <project>/.flight-recorder/"
    proof: "carved into an empty folder: propose, apply, a failing test, why — the case from the copy alone"

build_order: [DBG4, DBG1, DBG2, DBG3, DBG7, DBG6, DBG5, DBG8]
first_slice: >-
  DBG4 first: it needs no other phase, it is deterministic, it works on any repo (his "codebases or repose, files or code"),
  and it can be shown to someone. Then DBG1 + DBG2, the key and the case, which every other phase reads.

not_verified:
  - "docs/rfr2.spec and the eight intelligence/rfr2 modules were named from the index, not read through; DBG2 reads them before it calls them"
  - "lib/replay-engine.js and clear-glass/src/rewind/engine.js: whether either holds anything TL4 should reuse was not read"
  - "whether a guardian job's meta reaches every frame it emits (DBG1 depends on it) was not traced"

# ## ADDENDUM 2026-10-18 (a) — a second debugging-product map exists: two contracts, kept (docs/CLAUDE.md rule 4)
# His same request ("can we spec the product for debugging … should the chunks, contracts, phases, dependancies all have
# syncronized ids or uuids, also in relation to the job …") was answered twice, by two sessions working from 0.60.142:
#   docs/2026-10-17-debugging-product-phasemap.spec (his line, released there as 0.60.143, renumbered 0.60.147 at the merge) —
#     DP0a-e; D10 ids kept and referenced, D11 one gap door, D12 a case is a contract; its phases went on to be built on that line:
#     flight data (FR6), the failure-mode report (docs/2026-10-17-failure-mode-report-phasemap.spec, FMR0/FMR3), DG2 the phase graph.
#   this map (2026-10-18, main) — DBG0a-c; D13 synchronized by a derived key (written as D10), D14 dependency edges are gap evidence
#     (written as D11); nothing built.
# Where they agree: no one shared uuid; every gap through lib/gap-field.js (his D11 is the door D14's gaps go through); a case
# joins what already exists, never a second store. Where they differ: how a chunk is named and kept (his D10: a chunk keeps its
# id across a move, links are typed <kind>:<id> references; D13: a chunk's key is what it is, <repo>/<map>::<phase>::<chunk>).
# The built work is on his line's map; this map's DBG4 (dependency gaps) and DBG1 (the key) are the parts it adds. Which naming
# stands is his to say (docs/2026-10-17-decisions-by-the-axioms.spec, merge note).
