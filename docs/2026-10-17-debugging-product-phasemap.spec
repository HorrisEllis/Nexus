spec:
  meta:
    name:     debugging-product
    version:  1.0.0
    date:     2026-10-17
    release:  "0.60.143 (mapped)"
    uuid:     nexus-debugging-product-phasemap-v1-0000-2026-1017-jamesbrooks-001
    owner:    "diagnostic (the case and its stages) · intelligence (cfr, rfr2, sigma, gap, crystals, alk) · versionium (known-good) · cos (reproduce and prove) · cortex memory (fix_map) · idearium (the Debug tab)"
    status:   "MAPPED 2026-10-17, before building. Nothing here is built by this map; each phase names the phase that already owns it, or says it is new."
    voice: >-
      The ideas, the direction and the calls are James's. `james:` is his, verbatim. `does:` is the coder's reading, his to
      correct. `pushback:` is where the coder thinks the plan as said has a hole — his to decide.
    origin: >-
      James, 2026-10-17: "can we spec the product for debugging. the intelligence system crystalization memory, rewind engine,
      versionium, cos, rfr2, cos, runtime deviation and friction detection, gap detection, diagnostic system? look at the
      recent phase." · "after that. should the chunks, contracts, phases, dependancies all have syncronized ids or uuids,
      also in relation to the job. also what about using the dependencies to map gaps in codebases or repose, files or code"
      · "yes, its meant to be persistent. look at idearium, guardian, the atlas, the .spec files in each system spec folder.
      looms component registry."
      · earlier the same day (docs/2026-10-17-system-drawbridge-phasemap.spec origin): "need the debugging, intelligence,cos
      and debugging system, cfr and rfr2, sigma deviation and tensino and frictoin system for debugging. should be soome
      phases recentlty"
      · 2026-10-05 (docs/2026-10-05-failure-reproduction-phasemap.spec): "thats how i want failure mode reports, like creating
      a macro to reproduce the bug and be able to run it cos."
    axioms: "docs/AXIOMS-v3.1.md — §3.3 map before build, §8.6 reuse before build, §5.1 a UUID that never changes, §10.1 one write authority, §10.3 competing truth layers are a failure, §17.5 every output has provenance, §17.7 never fix the symptom twice, §1.2 nothing fails silently, §0.3 nothing lost"
    reading_of_his_words: >-
      The coder's reading, to confirm: one product that takes a failure from the moment Nexus notices it to the moment the fix
      is proven and remembered — detect, locate, explain, reproduce, put back to known-good, fix, prove, remember — built
      from the systems he named, with no new detector, no new rewind and no new store. "cos, rfr2, cos" is read as COS once
      (his 2026-10-17 list said "cos and debugging system" the same way); if a second system was meant, it is his to name.

  # ── The product in one line (the coder's reading) ───────────────────────────
  what_it_is: >-
    Flight Recorder (products/flight-recorder) is the change half: every change an agent makes is tested before it lands,
    versioned, recorded with its cause, undoable. This is the failure half: when something breaks, why, the conditions
    that made it, the bug reproduced in a compartment, the system put back to its last known-good state, the fix proven by
    the same reproduction, and the failure remembered so the second time is an investigation and the third is architecture
    (§17.7). The two share most of their seeds (versionium, rfr2, cos/testenv, lib/change-record.js).

  # ── What exists, stage by stage (read 2026-10-17 at 0.60.142, before mapping) ─
  exists:
    detect:
      - "Runtime deviation: intelligence/baseline.js (per-kernel baseline from first N events, deviations scored by sigma, 'sigma above threshold → gap.found → diagnostic'); intelligence/cfr/sigma.js (structural, temporal, contextual sigma stored at write time); intelligence/cfr/delta.js (tension, friction, slope per transition); intelligence/telemetry-codec (drift-engine, latent-model, topology; tc.drift.* events)."
      - "Friction and tension: diagnostic/nexus-diagnostic.js serves /friction (per system, failed/total over a window), /tension (friction × open gaps × slope), /tension/edges, /cfr/state, /cfr/field, /engines (lib/diagnostic-engines.js: the 12-engine suite — control, signal, epidemiology, fault trees, chaos, temporal logic …), /audit/contracts, /decay, /self-heal."
      - "Liveness: diagnostic/lib/pulse-watch.js — a missed beat is a gap (PR1–PR3 built 0.39.342)."
      - "Negative space: lib/shadow.js (a step declares what must exist; each absence is a gap and a liminal item); lib/drawbridge-registry.js (declared routes not served, dangling wires, files reached past the door)."
      - "Repo deviation (a different thing with the same word): idearium/repo/deviation.js — a repo's file manifest against its import baseline and its last version."
    gaps:
      - "One door, by design: lib/gap-field.js report() — dedup by domain::type::source, occurrence counting, causal parent from meta.causedBy, the repair-contract fields (requested, received, systems, location, error). 54 files use it."
      - "Detectors that feed it: loom/scanners/wiring-gaps.js (dangling-report + component-ledger writes with no hook), stub-finder, mock-data-finder, closed-door; intelligence/gap (hunter, predicate: every gap a checkable closure predicate; ledger); intelligence/liminal (12 detectors); idearium/repo/architecture.js (orphans, breaches, unhandled events); lib/system-boundary.js homes().unused."
    locate_and_explain:
      - "RFR2: intelligence/rfr2 — kernel (typed causal edges at ingestion, ring buffer), causality (traceToRoot, descendants), clip (snapshotRange, restoreClip), query, forge. Routes /api/intelligence/rfr2/{trace,query,children,descendants,stats,forge/patch}."
      - "lib/diagnostic-causal.js (each finding traced to its conditions through RFR2, joined to fan-in coverage, the snapshot timeline and loom) and lib/diagnostic-report.js ('a genuine, composed diagnostic report per gap … conditions leading up to the cause, and the effects', 2026-08-17)."
      - "/api/intelligence/rca (buildRCA), /api/intelligence/causal/{anomalies,compound}."
    rewind:
      note: "Nine rewinds, and they are not duplicates: each puts back a different unit."
      units:
        - "a decision — intelligence/alk (ALK: every decision by user, llm, raid, system, linked by causedBy; /api/intelligence/alk/rewind)"
        - "a moment of the system on sigma — intelligence/snapshot-trigger.js (snapshot when a sigma is seen, root-tagged by RFR2; his 'use the timeline as a tool for debugging and reverting')"
        - "a system's committed state — versionium/lib/engine.js (commit, history, restore/:commitId, state/:commitId)"
        - "every file one run changed — `repo rewind-run` (CV3 0.60.81)"
        - "one change, keeping later edits — `repo undo`, versionium/lib/merge3.js (FR3 0.60.117)"
        - "a repo's desktop VM — `repo desktop … rewind <tag>` (COS checkpoints)"
        - "a browser session — clear-glass/src/rewind/engine.js (reached by lib/agent-tools/tools/sandbox/rewind-replay.js)"
        - "a causal slice — intelligence/rfr2/clip restoreClip"
        - "vendored, not wired: emergence/vendor/rfr2/cfr-kernel/rewind.js"
    reproduce_and_prove:
      - "COS: cos/testenv (the test environment, any repo), cos/compartment, lib/cos-bridge.js; FR2 tested-before-it-lands (lib/proposal-evidence.js gatherBatch, lib/code-edit.js promoteTested)."
      - "Repair: diagnostic/lib/heal-loop.js, diagnostic/healer (propose → evaluate through forge, RAID-routed → merge)."
    remember:
      - "cortex/memory/tiers.js: long-term memory 'requires explicit graduation (crystallization)'; crystals are long-tier."
      - "intelligence liminal-space crystals (schema.resonance_crystal: focal point, evidence_threshold | focal_point_confirmation), served at /api/intelligence/crystals."
      - "cortex/memory/fix-map.js: failure signature → fix, matched by token overlap, confidence from success/failure counts."
      - "`repo lessons` (RL4 0.60.105): each rejection read for its failure mode, with the agent's own diagnosis."
    phases_already_mapped_for_it:
      - "docs/2026-10-05-failure-reproduction-phasemap.spec FM1–FM4 (ledgers into rfr2, a failure is a clip, run it in COS, the report) — all OPEN, parked 'later' at the 2026-10-09 declutter."
      - "docs/2026-10-05-announce-pulse-repair-phasemap.spec PR4 (deviation raises the bpm) and PR5 (repair for real) — OPEN."
      - "docs/2026-10-17-infrastructure-migration-phasemap.spec IM3 = docs/2026-10-17-system-drawbridge-phasemap.spec DB6 = docs/2026-10-15-gate-held-work-phasemap.spec GW23: command rows for cfr, rfr2, sigma, tension, rca and diagnose — OPEN."
      - "docs/2026-10-17-system-drawbridge-phasemap.spec DB10 (shadow and negative space at the drawbridge) — the source half built 0.60.127, the runtime half OPEN."
      - "docs/2026-10-16-proposal-evidence-phasemap.spec PE8 — the Debug tab shows the diagnostic system's records and has no logic of its own."

  # ── What the read found (each with its evidence) ────────────────────────────
  found:
    - "The diagnostic is reachable only by its port. idearium/cli/route-commands.js has no row for friction, tension, engines, cfr state, rfr2, rca, alk rewind or crystals, so no agent reaches them through nexus.command (IM3/DB6/GW23 says the same; still true at 0.60.142)."
    - "The one gap door is not the only one: 34 direct jaa.insert('gaps', …) calls in 26 files outside tests (intelligence/gap/ledger.js 4, guardian/server.js 3, lib/seam/queue.js 2, lib/reflection.js 2, architect/src/spec/Blueprint.js 2, orchestrator 3, nexus/autopilot.js, cortex/boot.js and others). They skip gap-field's dedup and occurrence count, which is the count §17.7 needs."
    - "fix_map does not learn: its own header says 'It is NOT an automatic failure→fix learner … a real, separate, much larger piece of work (would need to correlate a failure event with a later success event for the same causal chain)'. A proven case is exactly that correlation, already made."
    - "docs/atlases/diagnostic-atlas.md still says 'Not Confirmed As a Standalone System'. At 0.60.142 diagnostic/ has server.js, cli.js, registry-components.js, interaction-contract.json, event-taxonomy.js, compartment.json, spec/ and tests/ (0.60.136–0.60.138). An agent reading the atlas first is told the wrong thing (§10.3)."
    - "'Deviation' names two things: runtime sigma against a baseline (intelligence/baseline.js, PR4) and a repo's files against its import (idearium/repo/deviation.js). Both stay; the product uses the runtime one for detection and the repo one only as context in a report."
    - "lib/change-record.js joins a change to its run 'by the task's runId, else matched by path and time (said as matched, never as known)'. That fallback exists because a change, a run and a phase do not carry each other's ids. See ids_and_the_job."

  # ── The one new thing: the case ─────────────────────────────────────────────
  the_case:
    does: >-
      A case is one failure carried through every stage. It is not a new store and not a new format: it is a .contract v2
      (cortex/core/raid/contract-gates.js, his 2026-10-13 design), opened from a gap, whose gates are the stages. The gates
      already give what a case needs: depends_on, machine-checkable pass_when, evidence per gate, retry_limit, and STALE when
      a ref's content hash changes (a fix that is edited again stops counting as proven).
    why_a_contract: "§8.6 and §16.5: contract-gates.js already evaluates exactly this shape, and `contract status` / `contract packet` already serve it to agents with the smallest context per gate. A case file is one more .contract, not a new kind."
    gates:
      - "G1 located — pass_when: the systems, files and chunks it touches are named (lib/diagnostic-causal.js + loom impact)."
      - "G2 explained — pass_when: an RFR2 trace to a root, or each hole in the chain named (rule C-1: an observational row is never walked)."
      - "G3 seen_before — pass_when: the fix_map lookup ran (a hit attaches the earlier case and its fix; a miss is said)."
      - "G4 reproduced — pass_when: { test: <the case's macro> } fails in a COS compartment at the snapshot it failed on (FM2, FM3). Optional only when the failure is named as not reproducible here (his machine, Windows, QEMU), with why."
      - "G5 known_good — pass_when: the unit to put back is chosen (see the rewind list) and the target version exists."
      - "G6 fixed — pass_when: a change exists (a Flight Recorder change, an .inject, or a restart for a runtime failure), its cause naming this case."
      - "G7 proven — pass_when: the same macro passes in COS, the change's linked tests pass (FR2), and for a runtime failure the next beat closes the gap (PR5)."
      - "G8 remembered — pass_when: the fix_map row is written with the case as its proof (DP9)."
    status_is_computed: "A case's status is contract-gates' completion, never a field someone sets. That is the cure for the IM1 drift on this same day (its block said OPEN while its addendum said BUILT 0.60.133)."

  # ── His decisions, first ─────────────────────────────────────────────────────
  decisions:
    DP0a_one_product_or_two:
      question: "Is debugging its own product beside Flight Recorder, or the next phases of Flight Recorder (FR6 onward)?"
      options:
        - "its own product, sharing seeds (coder's recommendation): Flight Recorder answers 'what did the agent change, and can I undo it'; this answers 'what broke, why, and is it proven fixed'. Different first users, the same core. Carved separately with repo carve."
        - "one product: Flight Recorder grows the failure half; one name, one carve."
      status: "HIS — this is direction (what the products are), not a technical call the axioms settle."
    DP0b_its_name:
      question: "What is it called? The map uses 'debugging-product' as a placeholder."
      status: "HIS."
    DP0c_ids:
      status: "DECIDED 2026-10-17 by his axioms (§5.1, §10.3, §17.5) — D10 in docs/2026-10-17-decisions-by-the-axioms.spec; see ids_and_the_job. His to overturn."
    DP0d_one_gap_door:
      status: "DECIDED 2026-10-17 by his axioms (§10.1, §17.7, §1.2) — D11: the 34 direct writers move onto lib/gap-field.js report(), one file at a time (DP2)."
    DP0e_the_case_is_a_contract:
      status: "DECIDED 2026-10-17 by his axioms (§8.6, §16.5, §0.5) — D12: no case store; a .contract v2 per case."

  # ── Phases, bottom-up. Each names its owner; NEW means no map holds it yet ──
  phases:
    DP1_the_doors:
      status: OPEN
      owned_by: "IM3 / DB6 / GW23 — carried there, listed here because nothing below works for an agent without it"
      does: "Command rows (idearium/cli/route-commands.js) for diagnostic friction, tension, tension edges, engines, cfr state, gaps, self-heal, trace; intelligence rfr2 trace and query, rca, alk rewind, crystals; each route declared in its system's registry."
      proof: "every row runs through nexus.command against a live system and prints its answer; a system down is said, never empty"
    DP2_one_gap_door:
      status: OPEN
      owned_by: NEW
      depends_on: []
      does: "Each of the 34 direct inserts into the gaps table moves onto lib/gap-field.js report(), one file at a time, with the domain and type it already writes. A test fails on a new direct insert (a ratchet, like DB1's)."
      proof: "the same failure reported twice is one gap with occurrences 2; the ratchet's number only goes down"
    DP3_runtime_deviation_reaches_the_diagnostic:
      status: OPEN
      owned_by: "PR4 (announce-pulse-repair)"
      does: "A system's sigma against its baseline rides in its pulse and quickens it; the diagnostic records the deviation, and past threshold it is a gap through DP2."
    DP4_every_ledger_into_rfr2:
      status: OPEN
      owned_by: "FM1 (failure-reproduction)"
      note: "This is what makes G2 possible beyond the rows that carry causedBy. Coverage is measured, not assumed: the share of ledger rows that are causal/explicit, per system."
    DP5_the_case:
      status: OPEN
      owned_by: NEW
      depends_on: [DP2_one_gap_door]
      files: [diagnostic/lib/case.js, cortex/core/raid/contract-gates.js]
      does: >-
        diagnostic/lib/case.js: open(gap) writes a case .contract (gates G1–G8 above) into diagnostic's own data; it is
        opened on gap-field.found for a gap above a severity floor, or on request (`diagnose open <gap>`). advance(case)
        evaluates it with contract-gates. Diagnostic owns it, because a case is a debugging record (FILES_WITH_THEIR_SYSTEM).
      proof: "a fixture gap opens a case whose status is computed; editing a ref it proved makes the downstream gates STALE"
    DP6_reproduce_in_cos:
      status: OPEN
      owned_by: "FM2 + FM3 (failure-reproduction)"
      depends_on: [DP4_every_ledger_into_rfr2, DP5_the_case]
      note: "The macro becomes the case's G4 and G7 condition and, once proven, a regression test."
    DP7_back_to_known_good:
      status: OPEN
      owned_by: NEW
      depends_on: [DP5_the_case]
      files: [diagnostic/lib/known-good.js]
      does: >-
        Chooses which of the nine rewinds applies from what the case touched (a decision → ALK; files of one run →
        rewind-run; one change → undo; a system's state → versionium restore; a VM → the desktop checkpoint) and the last
        version where the case's macro passed. It calls that rewind through its route; it is not a tenth rewind. A dry run
        first, always (REVERSIBILITY).
      proof: "a fixture case names its unit and target and puts it back; a dry run changes nothing"
    DP8_a_proven_fix:
      status: OPEN
      owned_by: "PR5 (repair for real) + FR2 (tested before it lands) + the healer (evaluate, merge)"
      depends_on: [DP6_reproduce_in_cos]
      does: "A fix is a Flight Recorder change whose cause names the case; G7 passes only on the macro, the linked tests, and, for a runtime failure, the next beat."
    DP9_crystallize_the_fix:
      status: OPEN
      owned_by: NEW
      depends_on: [DP8_a_proven_fix]
      files: [cortex/memory/fix-map.js, diagnostic/lib/case.js]
      does: >-
        When a case completes, its failure signature, its root, its fix and its proof (the case id, the macro) are written
        to fix_map — the 'correlate a failure with a later success' its header says it lacks, made from a proven case rather
        than inferred. G3 reads it when a case opens. §17.7 by count: the gap's occurrences (DP2) at 2 mark the case
        'investigation'; at 3 it raises a gap of type architecture.missing_primitive naming the cases. The fix_map row is a
        long-tier memory, crystallized by proof, not by evidence threshold.
      proof: "the same fixture failure, closed once, is recognised when it recurs and offered its fix; a third occurrence raises the architecture gap"
    DP10_the_report_and_the_debug_tab:
      status: OPEN
      owned_by: "FM4 + PE8 + DB7"
      does: "The failure mode report is the case read through its routes: the chain, the systems crossed, the environment, the macro, the known-good unit, the fix, the proof. Reproduce, rewind and prove are buttons on routes. The tab holds no logic. Tested in Clear Glass."
    DP11_the_product_boundary:
      status: OPEN
      owned_by: "repo-carve CV1/PB1 (the boundary tooling)"
      depends_on: [DP0a_one_product_or_two]
      does: "products/<name>/product.json — seeds, must, cut — written when DP5 exists, not before (§1.1: a product.json that names unbuilt files would pretend)."

  build_order: [DP1, DP2, DP5, DP3, DP4, DP6, DP7, DP8, DP9, DP10, DP11]
  build_order_reason: >-
    §16.1, the nearest gap first. DP1 and DP2 are small, read-mostly, and every stage after them stands on them (an agent
    can reach the diagnostic; one gap is one gap). DP5 is the spine and needs nothing but DP2. DP3/DP4 widen what gets
    detected and explained. Reproduction (DP6) needs DP4's causal index. DP7–DP9 are the second half of the case. The UI
    comes last because it only reads routes.

  # ── His second question: synchronized ids, and the job ──────────────────────
  ids_and_the_job:
    james: '"should the chunks, contracts, phases, dependancies all have syncronized ids or uuids, also in relation to the job."'
    measured_today:
      - "chunk: chunk-<sha256(repo:path:kind+qualifiedName)[0:16]> (idearium/repo/import-pipeline.js chunkFile). Stable across edits (the content hash is kept beside it) — the coder said earlier today it was a content hash; it is not, corrected here. NOT stable across a move or rename: the path is in the key. Each chunk has contracts: [], tests: [], dependencies: [] slots the importer leaves empty; cards (lib/code-intel/cards.js) compute tests on read."
      - "contract (.contract v2): refs by { path, hash, lines, component? } — by place, not by chunk."
      - "phase: a key inside a map (IM1_the_shape_census_as_a_command), the map's own uuid in its meta."
      - "run: <repo>__<session> or <repo>__brick-<brick> (lib/run-state.js runIdFor); a retry is the same run with attempt+1."
      - "change: the .inject node's uuid; it reaches its run by task.runId when recorded, else by path and time."
      - "node: lib/node-export.js envelope uuid; gap: uuid + dedup_key."
    decision: >-
      Not one shared uuid. Each kind keeps its own id, minted once and never changed (§5.1), and points to the others with
      typed references, written where the link is made. A shared id would merge 'which thing' with 'which version of it',
      and one thing (a chunk) belongs to many phases, contracts and jobs over its life.
    the_reference: "One grammar for every link, so any record can name any other: <kind>:<id>, e.g. chunk:chunk-1f…, contract:<uuid>#G4, phase:<map uuid>#IM1, run:<runId>@<attempt>, change:<inject uuid>, gap:<uuid>, case:<uuid>, node:<type>/<id>. The two halves already exist; only the join is new."
    the_job: >-
      The job is the join and mints nothing but its own id. A run carries phase:, contract: and the gap:/case: it serves; a
      change carries run:@attempt; a gate's evidence carries change:. Then lib/change-record.js joins by reference and its
      'matched by path and time' fallback becomes a named hole, never a guess. It also answers 'which job broke this
      contract?' directly: a STALE gate names the change whose ref hash broke it.
    three_fixes:
      - "IDS1 chunk identity survives a move: the importer keeps the id it minted when it re-finds the same chunk at a new path (same key, same content hash, the old path gone); the lineage (old path → new path) is a version row. Owned by NEW; touches idearium/repo/import-pipeline.js only."
      - "IDS2 contract refs name chunks: refs.<id>.chunk beside path/lines; contract-gates resolves the chunk's current place and still invalidates by hash."
      - "IDS3 runs and changes carry their refs: run-state gains phase/contract/case refs; repo-inject records run:@attempt at propose. Owned by FR1's follow-up."
    pushback: "A phase key is a name inside a file, so renaming it breaks every ref. Refs use the map uuid plus the key, and a renamed phase keeps its old key as an alias in the map (like node aliases)."

  # ── His third question: using the dependencies to map gaps ──────────────────
  gaps_from_dependencies:
    james: '"what about using the dependencies to map gaps in codebases or repose, files or code"'
    answer: >-
      Yes. It is the negative space of the dependency graph: what the graph promises against what is there. Most of the
      readers exist; what is missing is running them together on any repo, and the runtime half that keeps the static half
      honest.
    kinds:
      - "dangling: required but absent — loom/scanners/dangling-report.js"
      - "orphan: nothing uses it and it uses nothing — idearium/repo/architecture.js orphans"
      - "declared, not served: a registry route no source serves — lib/drawbridge-registry.js"
      - "reached past the door: a file another system requires directly — lib/system-boundary.js, DB1"
      - "heard by nobody / emitted by nobody — architecture.js unhandledEvents, the atlas generator's 'no listener in the tree'"
      - "written with no hook — loom/scanners/wiring-gaps.js (component-ledger)"
      - "promised, not built: an export a spec module names that lib/code-intel/decls.js does not find — NEW join"
      - "built, not promised: an export no spec or registry names — NEW join"
      - "untested: a chunk whose card has no tests — lib/code-intel/cards.js"
      - "stub or mock where real code belongs — stub-finder.js, mock-data-finder.js"
    the_catch: >-
      Static edges miss dynamic wiring: a loader by name, createRequire, an event over the bus, an HTTP route. Nexus has the
      proof: DB1's census missed `_require(...)` and 22 real crossings stayed unseen until homes() contradicted it
      (drawbridge found_c). So a static orphan is a candidate, never a verdict, until the runtime half (component-ledger rows,
      bus events, served routes — DB10) has watched long enough to say it never ran. IM2 already requires this before
      anything is archived.
    phase:
      GD1_gaps_from_the_graph_for_any_repo:
        status: OPEN
        owned_by: "DB9 (a repo's registry generated by default) + DB10 (negative space at the drawbridge)"
        does: "On import or chunk, a repo's registry and its graph-gaps are generated and kept as nodes; each gap is reported through gap-field with domain 'repo' and opens no case until a person or a gate asks. The two NEW joins (promised/built) come from the repo's spec modules against its decls."
        proof: "a fixture repo with one dangling require, one orphan and one promised-but-missing export yields exactly those three gaps; a module loaded by name is not called an orphan"

  not_verified:
    - "That every one of the 34 direct gap writers can move to gap-field without changing what its readers expect (some read their own fields back)."
    - "That contract-gates.js handles a case's G4 'fails' condition (pass when the macro FAILS); today { test } passes on exit 0. A negated test condition may be needed — to check in DP5."
    - "That a COS compartment can run a Nexus system's replay route (FM3's pushback; still unverified)."

  # ── ADDENDUM 2026-10-17 (a) — the case opens from a .failure_mode ───────────────────────────────────────────────
  # Found by the sweep behind docs/2026-10-17-failure-mode-report-phasemap.spec: cortex already has the failure record — a
  # .failure_mode node with one writer (cortex/self-heal/index.js) and its forensics (causal chain, sigma delta, compound
  # class, .debug_macro). This map's DP5 said a case is "opened from a gap". Corrected, the earlier wording kept (§0.3):
  #   - a case opens from a .failure_mode and refers to it, its .debug_macro and its .heal by id; it copies none of them
  #     (§10.3). The case contract holds the gates and their evidence; the failure_mode holds what failed.
  #   - G4 reproduced = FMR6; G7 proven = FMR7; G1/G2 read FMR3's report; DP2 (one gap door) and FMR2 (every failure
  #     reaches the record) are the two roads in, and both dedup by signature.
  #   - DP6 is carried by FMR4–FMR6 (not FM2/FM3 directly).

# ## ADDENDUM 2026-10-18 (merge) — a second map for the same request: docs/2026-10-18-debugging-product-phasemap.spec (main)
# Kept beside this one, not collapsed: they agree on no shared uuid and one gap door, and differ on how a chunk is named (D10 here,
# D13 there). That map adds DBG4 (gaps mapped from dependency edges) and DBG1 (a derived key). Which naming stands is his call.
