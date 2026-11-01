# docs/2026-11-01-emerge-bottom-up-phasemap.spec — Emerge rebuilt from the bottom up by its own method, and given Nexus's anomaly detection
# for its bottlenecks over a component registry with wires and hooks. The ideas and the bar are James's; the readings, the order and the
# proof are the coder's, said where they are.

origin: >-
  James, 2026-11-01, after the emergence channel: "emerge could also use the same anomoly detection for bottlenecks. also using nexus component
  registry, wire, hooks, and component logic. also what if we use you to build emerge from the bottom up. could be better than you. say we only
  use enterprise grade code. only the most effective methods and strategies. cant innovate the problem, innovate the method."
  The last line is his own principle from 2026-08-13, lib/emergence.js: "if it can't innovate the problem, innovate the method."

already_there_2026_11_01: >-
  - Emerge (github.com/HorrisEllis/emerge, at emerge/ locked by emerge/emerge.cos):
      `eg components` exports a program's components, hooks and wires as Loom records (emerge/lang/components.js);
      its ledger is read as a field (observe);
      gaps carry pressure.
    It is a separate repo, so it cannot require Nexus. What it shares with Nexus is shapes (records) and routes.
  - Nexus's detectors (Intelligence):
      bottleneck (a gap type that keeps recurring);
      co-occurrence with a base-rate lift gate;
      failure precursors;
      cross-system causes;
      CFR sigma and RFR2 friction on a wire.
    Loom holds components, hooks and wires.
  - The method: lib/emergence.js attempt(). Axioms and an end state; attempts verified for real in an isolated COS branch; after pivotAfter
    failures of one method, the ask changes shape and asks for a different method. The flight recorder counts what each run cost.
  - The gaps found on 2026-11-01 (emerge-primitives.spec walkthrough_gaps):
      kinds do not cross files;
      the registry is read one file at a time;
      the checker does not see across `use`.

readings_to_confirm:
  - "\"the same anomoly detection for bottlenecks\": Emerge's run (its ledger, its gaps, its wires) analysed by the same detectors Nexus uses. It
    is done through a contract, not a copy: Emerge emits its records in Loom's shapes, and Intelligence reads them through its route. Emerge stays
    standalone; without Nexus, its own observe still runs. To confirm."
  - "\"using nexus component registry, wire, hooks, and component logic\": an Emerge program's components, hooks and wires registered in Loom as
    real records with real wires, so Nexus can reason over an Emerge project like any system (rule 3). To confirm."
  - "\"use you to build emerge from the bottom up\": Emerge rebuilt module by module, foundation first, each module run through his emergence
    loop. Axioms are the enterprise bar; the end state is the module's acceptance; the method changes when it keeps failing. The coder plans and
    repairs, and local models write where a planned brief is enough (his 2026-10-13 rule on agents). To confirm."
  - "\"could be better than you\": read as the claim to test. It is not asserted. EB5 measures it on Emerge's own bench: the rebuilt module
    against today's on correctness, tokens to a passing build, and how small a model can write it."

decisions:
  EB_D0_his_bar:
    status: DECIDED 2026-11-01 (his; the readings above to confirm)
    chosen: >-
      Only enterprise-grade code and the most effective methods. Every module is held to the same axioms:
      - its spec first;
      - its tests;
      - its gates;
      - registered with real wires;
      - nothing failing silently;
      - a measured cost.
      When a method keeps failing, the method changes, not only the attempt.
    by: "his, 2026-11-01: \"say we only use enterprise grade code. only the most effective methods and strategies. cant innovate the problem, innovate the method.\""

phases:
  EB1_the_registry_whole:
    status: OPEN
    depends_on: [EB_D0_his_bar, EP2_the_registry_first]
    files: ["Emerge:emerge/lang/components.js", "Emerge:emerge/lang/checker.js", "Emerge:emerge/lang/interpreter.js"]
    interface: [cli]
    does: "the three gaps of 2026-11-01 closed in Emerge's repo: a kind used across files; `eg components` follows `use` and exports the whole program's components, hooks and wires; the checker sees wires made in another file"
    proof: "the say/ walkthrough (docs/emerge-walkthrough/say): kind Command in its own file; `eg components main.eg` names Echo, its two hooks and both wires; `eg check main.eg` clean"
  EB2_emerge_in_loom:
    status: OPEN
    depends_on: [EB1_the_registry_whole]
    files: [loom/maps, scripts/emerge-lock.js]
    interface: [route, cli]
    does: "an Emerge project's registry (EB1's export) loaded into Loom as components with real wires, under its compartment; Loom's impact and query answer over it like any system"
    proof: "`nexus_loom_impact` on an Emerge component names its consumers across files"
  EB3_bottlenecks_for_emerge:
    status: OPEN
    depends_on: [EB2_emerge_in_loom]
    files: [intelligence/index.js, intelligence/routes.js]
    interface: [route, html]
    does: "Intelligence's detectors over an Emerge run (its ledger events and gaps, read through Emerge's door): bottleneck, co-occurrence, failure precursor, friction on a wire. Shown in the Emergence channel and COS's page, filtered to the project"
    proof: "a fixture Emerge program with one gap that recurs: Intelligence names it a bottleneck on its wire; with Nexus away, Emerge's own observe still says it"
  EB4_the_rebuild_loop:
    status: OPEN
    depends_on: [EB1_the_registry_whole, EB_D0_his_bar]
    files: [lib/emergence.js, "Emerge:emerge/lang"]
    interface: [cli, html]
    does: "one Emerge module at a time, foundation first (lexer → parser → checker → interpreter → registry → runtime), rebuilt through attempt(): its axioms the bar, its end state its existing tests plus its spec's acceptance; each run in the flight recorder; a method pivot said in the Emergence channel's runs"
    proof: "the lexer rebuilt and passing Emerge's whole suite (266 + 13 + 353 today), with its run, its attempts and its cost recorded"
  EB5_better_measured:
    status: OPEN
    depends_on: [EB4_the_rebuild_loop]
    files: ["Emerge:bench"]
    interface: [cli]
    does: "the rebuilt modules against today's on Emerge's bench: correctness, tokens to a passing build, the smallest model that writes it; said as measured, better or not"
    proof: "the bench's report, both columns"

build_order: "EB1 (Emerge's repo, then a new lock) → EB2 → EB3; EB4 from EB1 on; EB5 last."

# ── ADDENDUM 2026-11-01 — his correction: "look at idearium. all of that is in there" ───────────────────────────────────────────────
# James, 2026-11-01, after the coder listed what it would take for Emerge to beat a frontier model (complete specs, small pieces, strict
# checks, many cheap tries, reuse, memory, measurement): "look at idearium. all of that is in there"
# He is right; the coder answered from memory instead of from the tree (his 2026-10-17 rule, "always make effective use of what you already
# have"). Read in the tree on 2026-11-01:
#   specs → phases → .phase + graph (DG2);
#   chunks (spec engine, WARP chunk dispatch);
#   lib/pipeline-routing.js: local-first, chain, a learned order (economy router), breakers, failure classes, and verdicts that teach it;
#   test-first build plans (idearium/repo/build-plan.js);
#   the component store; the flight recorder (lib/flight-data.js: calls, tokens, attempts, what was wasted);
#   COS compartments, rewind and Versionium.
# Emerge is already an Idearium repo (nexus/emerge, 0.60.340, in compartment nexus-self-emerge).
# So EB4 is re-read: no new rebuild machinery. Emerge's phases are built through Idearium, local-first, and read in its flight recorder.
# Two parts Idearium does not have, found by reading it:
# - it changes the MODEL on a failed attempt (the routing chain), never the METHOD; his rule lives in lib/emergence.js and lib/end-state.js,
#   which no Idearium build uses;
# - its attempts are sequential fallback; nothing writes several candidates at once and keeps the one its tests pass.
phases_addendum_2026_11_01:
  EB4a_idearium_innovates_the_method:
    status: OPEN
    depends_on: [EB_D0_his_bar]
    files: [lib/pipeline-routing.js, lib/emergence.js, lib/end-state.js, idearium/repo/phases.js]
    interface: [route, html]
    does: "when one failure class repeats on a phase (pivotAfter, default 3), the next attempt is asked for a different method, said as such (lib/emergence.js's pivot prompt), not just sent to the next model; the pivot is a row in the flight recorder and a run in the Emergence channel"
    proof: "a fixture phase whose first method always fails the test: three same-class failures, then a pivot attempt with the changed ask, and its row in the flight data"
  EB4b_many_cheap_tries:
    status: OPEN
    depends_on: [EB4a_idearium_innovates_the_method]
    files: [lib/pipeline-routing.js, idearium/repo/phases.js]
    interface: [route, html]
    does: "a phase may ask for N candidates at once from local models (each in its own COS branch); its tests choose; the flight recorder counts all N"
    proof: "N=5 on a fixture phase with one passing candidate: that one lands, four are counted as spent"
  EB4_the_rebuild_loop_reread:
    status: OPEN
    depends_on: [EB1_the_registry_whole, EB4a_idearium_innovates_the_method]
    files: [idearium/repo, emerge]
    interface: [html]
    does: "EB4 as Idearium's own work: nexus/emerge's phases built local-first through Idearium, the pivots and candidates from EB4a/EB4b, each run in the flight recorder; replaces EB4's 'rebuild loop' wording (kept above, §0.3)"
    proof: "as EB4's, read from the flight recorder"
