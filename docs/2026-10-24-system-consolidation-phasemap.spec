# docs/2026-10-24-system-consolidation-phasemap.spec
# The least number of systems: the 15 Idearium lists, every other top-level folder folded into its home, archived, or kept as a part.
# Phase ids CN0–CN11. MAPPED 2026-10-24, before any folder moves (docs/CLAUDE.md rule 1; this crosses every system boundary, so it is
# mapped with its DAG and acts under lib/system-boundary.js's ratchet and docs/2026-10-17-system-drawbridge-phasemap.spec).
# This is a PLAN. Nothing moves until James okays it. Structural housekeeping (§0.3 fold/archive, never delete): it moves existing code
# and adds no new module, so it is a phasemap, not a full emerge-format spec (his 2026-10-20 rule is for new capabilities with modules).

origin:
  date: 2026-10-24
  james: >-
    "yeah, been folding and archiving. should be the least amount of systems." · "15 systems. only the ones with a .spec in the directory.
    all the systems in idearium" (0.60.231, on the parallel branch claude/brave-cori-eczug1). · 2026-10-24, on placement: warp to lib;
    emerge into idearium or a nested compartment; cockpit into idearium; cli maybe into nexus; ErosmancerOS into clear-glass/erosmancer-os.
  context: >-
    The branch claude/brave-cori-eczug1 did this folding/archiving as its own 0.60.229–0.60.234, in parallel with main's 0.60.225–0.60.230
    (my SL work) from the same split point (0.60.224). The two lines collide on version numbers and both re-implemented phase-node
    decomposition, so brave-cori cannot be merged or cherry-picked cleanly (its moves touch lib/version.js and tests/modules/run-all.js,
    which main edits on every commit). This map RE-APPLIES his decision fresh on current main instead. His 15 systems are already the list
    in lib/nexus-self/systems.js; what main lacks is the folding itself (every foldable folder is still present) and the FOLDED logic in
    lib/system-boundary.js.
  trace_2026_10_24: >-
    The three "spec engines" were traced before placing emerge and found DISTINCT, not duplicates (0 cross-requires): architect is the
    canvas→spec front door (/api/compile); idearium/spec-engine is the spec→chunks→build engine (warp-backed); emerge is the spec→knowledge
    -graph compiler/verifier (kg-builder, specDepth, no-BLACK; test-substrate-spec uses it). So there is nothing to consolidate among them.

decisions:
  CN_D1_what_is_a_system:
    status: DECIDED 2026-10-24 by James — "15 systems … all the systems in idearium"
    chosen: >-
      A system is one of Idearium's list (lib/nexus-self/systems.js SYSTEMS, the one truth): orchestrator, cortex, guardian, idearium,
      architect, diagnostic, intelligence, ollama-bridge, versionium, copilot, loom, clear-glass, components, cos, and core (= lib, the
      kernel). Only those. Every other top-level folder with code is NOT a system: it folds into a home, is archived, is a part/face, or is
      a shared primitive in lib. It is still scanned (a require into it is a real edge the ratchet's baseline keeps), never listed as a system.
  CN_D2_warp_home:
    status: DECIDED 2026-10-24 by James — "1. moved to lib?"
    chosen: >-
      lib/warp. warp is a zero-dependency, publishable devkit (warp/MANIFEST.json decoupling_rule, warp/spec/warp.spec) used by 5 systems
      (lib, loom, intelligence, orchestrator, ollama) and idearium's spec-engine for build logic. A shared primitive, not one system's; lib
      is where primitives live. Its decoupling holds in lib/warp (it imports nothing outside its own folder).
  CN_D3_emerge_home:
    status: OPEN — the coder recommends lib/emerge; James proposed idearium/emerge
    asked: "emerge (the spec→KG verifier) — lib (shared primitive, like warp) or nested in idearium (its build pipeline's home)?"
    chosen: >-
      To confirm. The coder's reading by the edges (§0.1): emerge is a shared verifier used by idearium, guardian, copilot and lib — 3 of
      its 4 users are not idearium — so lib/emerge matches warp's placement and keeps it shared. James proposed idearium/emerge (the
      spec→phase→build pipeline, incl. emerge/compiler/phase-specs.js, is idearium's). His call on review; the phase below assumes lib/emerge
      and is trivially re-pointed to idearium/emerge if he chooses that.
  CN_D4_erosmancer:
    status: DECIDED 2026-10-24 by James — "clear-glass/erosmancer-os"
    chosen: ErosmancerOS moves into Clear Glass at clear-glass/erosmancer-os (it is already Clear-Glass-spawned; the boot log shows Clear Glass starting it).

phases:
  CN0_the_rule_in_force:
    status: OPEN
    layer: library
    depends_on: [CN_D1_what_is_a_system]
    files: [lib/system-boundary.js, tests/modules/test-system-boundary.test.js]
    does: >-
      lib/system-boundary.js gains the FOLDED map and the "systems are Idearium's list only" rule (realSystems from systems.js), so the
      sovereignty census names every other folder as folded/parked/part, not a system. The rule is in force before any folder moves, so each
      move below is checked against it. No folder moves in this phase.
    proof: "the census over the tree reports exactly the 15 systems; every folder in FOLDED is named with its home; test-system-boundary green"

  CN1_warp_to_lib:
    status: OPEN
    layer: integration
    depends_on: [CN0_the_rule_in_force, CN_D2_warp_home]
    files: [lib/warp]
    does: "warp/ → lib/warp/ (git mv, history kept); its 18 external requires repointed to lib/warp; warp's own internal requires unchanged (self-contained)."
    proof: "lib/warp present; grep finds no require of a top-level warp/; warp's own suite green from lib/warp; the 18 consumers load"

  CN2_siso_to_lib:
    status: OPEN
    layer: integration
    depends_on: [CN0_the_rule_in_force]
    files: [lib/siso]
    does: "siso/ → lib/siso/; requires repointed."
    proof: "no require of top-level siso/; the suite green"

  CN3_auth_to_orchestrator:
    status: OPEN
    layer: integration
    depends_on: [CN0_the_rule_in_force]
    files: [orchestrator/auth]
    does: "auth/ → orchestrator/auth/; requires repointed (orchestrator is auth's main consumer)."
    proof: "no require of top-level auth/; orchestrator boots; the suite green"

  CN4_mesh_and_jaa_to_guardian:
    status: OPEN
    layer: integration
    depends_on: [CN0_the_rule_in_force]
    files: [guardian/mesh, guardian/jaa]
    does: "mesh/ → guardian/mesh/ and jaa/ → guardian/jaa/ (guardian is the consumer of both); requires repointed. jaa is the store; move with care — many systems open it."
    proof: "no require of top-level mesh/ or jaa/; guardian boots; stores open; the suite green"

  CN5_emerge_home:
    status: OPEN
    layer: integration
    depends_on: [CN0_the_rule_in_force, CN_D3_emerge_home]
    files: [lib/emerge]
    does: "emerge/ → lib/emerge/ (or idearium/emerge/ if he chooses, CN_D3); its 5 external requires repointed; its 4 specs move with it; test-substrate-spec's paths updated."
    proof: "no require of a top-level emerge/; test-substrate-spec green; phase-specs.js --all still writes the nodes with 0 drift"

  CN6_cockpit_to_idearium:
    status: OPEN
    layer: integration
    depends_on: [CN0_the_rule_in_force]
    files: [idearium/forge-ide]
    does: "cockpit/ → idearium/forge-ide/ (its 2 consumers repointed); cockpit.spec renamed to forge-ide/spec/forge-ide.spec (the spec-drift report already flags the legacy path)."
    proof: "no require of top-level cockpit/; spec-drift no longer reports the legacy cockpit path; the suite green"

  CN7_cli_to_nexus:
    status: OPEN
    layer: integration
    depends_on: [CN0_the_rule_in_force]
    files: [nexus/cli]
    does: >-
      cli/ → nexus/cli/ (operator/supervisor tooling, paired with nexus/autopilot.js). Its 43 consumers repointed — heaviest is cos (29),
      then lib (10); watch those. The bin/ entry points (idearium CLI) keep working.
    proof: "no require of top-level cli/; the CLIs run; cos loads; the suite green"

  CN8_erosmancer_to_clear_glass:
    status: OPEN
    layer: integration
    depends_on: [CN0_the_rule_in_force, CN_D4_erosmancer]
    files: [clear-glass/erosmancer-os]
    does: "erosmancer/ → clear-glass/erosmancer-os/; requires repointed; the Clear-Glass spawn path updated to the new location."
    proof: "no require of top-level erosmancer/; Clear Glass starts ErosmancerOS from the new path; the suite green"

  CN9_archive_the_non_systems:
    status: OPEN
    layer: integration
    depends_on: [CN0_the_rule_in_force]
    files: [_archive/2026-10-24-not-systems]
    does: >-
      remote-desktop/, security/, sentinel/, emergence/ → _archive/2026-10-24-not-systems/ (archive, never delete; §0.3). Each kept only if
      nothing live requires it — a require found is reported and the folder stays until that consumer is handled, never broken silently (§1.2).
      Sentinel per his 2026-07-24 plan (only S1 built; diagnostic does its job).
    proof: "the four folders under _archive with a manifest; no live require left dangling, or each one named and left in place with why"

  CN10_leftovers_named:
    status: OPEN
    layer: integration
    depends_on: [CN0_the_rule_in_force]
    files: [lib/system-boundary.js]
    does: >-
      meta/ and nexus/ accounted for: nexus/ stays top-level as the supervisor/boot root (npm start:all runs nexus/autopilot.js; cli folds
      INTO it per CN7). meta/ named — folded or archived on his word; parts/faces kept in place (contracts, hooks, service, architecture-spec,
      seams, ui, tablet), listed in system-boundary as parts, not systems.
    proof: "every top-level folder is one of: a system (15), a part, a primitive in lib, folded, archived, or the supervisor root — none unaccounted"

  CN11_version_and_record:
    status: OPEN
    layer: integration
    depends_on: [CN1_warp_to_lib, CN2_siso_to_lib, CN3_auth_to_orchestrator, CN4_mesh_and_jaa_to_guardian, CN5_emerge_home, CN6_cockpit_to_idearium, CN7_cli_to_nexus, CN8_erosmancer_to_clear_glass, CN9_archive_the_non_systems, CN10_leftovers_named]
    files: [lib/version.js, docs/SPEC-REGISTRY.spec, loom/maps/warp-map.js]
    does: "one version line per moved folder (his words quoted), this map registered in SPEC-REGISTRY, loom's maps repointed to the new paths, phase-specs.js --all re-run so the nodes match the moved tree."
    proof: "lib/version.js has a line per move; SPEC-REGISTRY lists this map; phase-specs --all --check clean; the full suite green"

order: >-
  CN0 first (the rule in force, no moves). Then CN1–CN10 each independent (one folder each, its own commit, reversible), gated by CN0.
  CN11 last (the record, after every move). emerge (CN5) waits on his CN_D3 choice. Nothing moves until he okays this map.

## ADDENDUM 2026-10-24 (BC_D1) — emerge home: his in-session confirmation is "a system, warp folded in"
James, 2026-10-24: "okay warp and emerge." — confirmed in the brave-cori reconciliation (docs/2026-10-24-brave-cori-reconciliation.spec BC_D1),
where, asked "a system with warp folded in, or into core/lib?", he chose "A system, warp folded in". CN_D3 above was OPEN; this closes it: emerge
is its OWN SYSTEM with warp folded into it (docs/2026-10-24-emerge-warp-system-phasemap.spec, ported from the brave-cori line).

### CONFLICT SURFACED (§0.3 keep both, §1.2 say it, USER_AUTONOMY his to settle) — two readings of his words, acted on in parallel:
- This reconciliation (the brave-cori line) read "okay warp and emerge" as: emerge is a top-level SYSTEM, warp folded in. He CONFIRMED it in-session (BC_D1).
- Another session's RF2 batch 2 (0.60.241, the addendum below) read "emerge and warp consolidated. spec compiler and idearium consolidate." as:
  move emerge and warp INTO core — and ALREADY DID IT (emerge is at lib/emerge on main now, warp at lib/warp).
These contradict. By his later, explicit in-session word, emerge is a system and would be pulled back OUT of lib (the EW1 build, via BCR2/BCR3). But
RF2 is also his, and a 424-file move is not silently reversed — so this is SURFACED to him as a problem to settle, not resolved by the coder. Until he
settles it, emerge stays where RF2 put it (lib/emerge) and this conflict stands on the record. The merge that joined the two lines (0.60.243) keeps both.

# ## ADDENDUM 2026-10-24 (0.60.241) — RF2 applied the folding first; this map stays as his placement record
# The same day, another session's RF2 (docs/2026-10-24-fifteen-systems-migration-phasemap.spec) moved every folder, after James said
# "15 systems. the rest of the folders need to migrate." and "yes start rf2, security goes with remote desktop". Already done there:
# CN1 (lib/warp), CN2 (lib/siso), CN3 (orchestrator/auth), CN4's mesh (guardian/mesh). Where they differ, his words decide.
# The differences are listed in that map's ADDENDUM (b), which also carries the phases that close them (RF3_cockpit_to_idearium,
# RF3_erosmancer_os). His CN_D3 answer came 2026-10-24: "emerge and warp consolidated. spec compiler and idearium consolidate."
# (RF4_* there.) Nothing here is deleted (§0.3).
