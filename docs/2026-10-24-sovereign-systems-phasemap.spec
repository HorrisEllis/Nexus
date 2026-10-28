# docs/2026-10-24-sovereign-systems-phasemap.spec — each system sovereign and in its COS compartment (SV0–SV8), and the placement
# moves phased with COS (CS12–CS21). The ideas and the calls are James's; the census, the phase cut and the order are the coder's.
# Moved here on 2026-10-24 from docs/2026-10-23-cos-spine-phasemap.spec, where they were first written that day (see its addendum (c)):
# that map is tied to cos-spine.spec's modules, and these phases build other things.
# Not tied to a full spec yet. By his 2026-10-20 rule ("everything needs to be speccced before built"), each phase from SV1 on that
# builds a new capability gets its full spec in emerge's module format before its code. SV0 was a fix to an existing module.
# A name clash, said: brave-cori's docs/2026-10-24-cos-services-phasemap.spec uses SV0–SV4 for his network engines. Different full names
# (SV0_the_engines_in_cos vs SV0_the_census_tells_the_truth), so the DAG keeps them apart. Both are kept as written.

origin: >-
  James, 2026-10-24: "then focus on the ones that get each system sovereign, bugs ad / anything not related to sovereignty, do last unless
  necassarry" · "i want to get each system soveriegn and inside a cos compartment" · "wait phase those along with the cos phases"

status: "SV0 DONE 0.60.244; the rest OPEN"

# ## ADDENDUM 2026-10-24 — the placement moves, phased with the COS phases (his)
# James, 2026-10-24, answering the coder's open questions after RF2 landed (0.60.241): "go / yes to inside. / cockpit becomes brainos? /
# yes move emerge and integrate with warp and make it as system. / the nspeccompiler and ide can move to idearium / versionium".
# Then, as the coder started on the refactor tool: "wait phase those along with the cos phases".
# What he was answering (the coder's questions, 2026-10-24):
# - cli: lib/cli, or inside nexus (his earlier "cli maybe into nexus")?
# - cockpit's name in idearium (cockpit, or forge-ide from the other session's map)?
# - the coder's reading of "emerge and warp consolidated. spec compiler and idearium consolidate"?
# - the changelogs: docs/changelogs (the coder's recommendation) or versionium?
# Also from the same day, carried in: "what about moving autopilot ot the porchastrator folder?" (the coder recommended yes) and the
# registry at every level (docs/2026-10-17-system-drawbridge-phasemap.spec addendum (g)).
# Where these sit in this map: placement is before sovereignty, and sovereignty is before COS opens a system (CS_D7, his: "Dont they need
# to be sovereign first?"). So CS12–CS21 come before DB6, and DB6 before CS4.
phases_b:
  CS12_the_mover_is_proven:
    status: OPEN
    depends_on: []
    files: [lib/architecture-apply.js, tests/modules/test-architecture-apply.test.js, tests/modules/run-all.js]
    does: >-
      The refactor tool learns the three things it missed in RF2: require.resolve(...) specifiers (the orchestrator's auth hot-swap),
      `node <path>` inside a string (package.json scripts, printed instructions), and a single file's own exact path as a literal (a
      file move, e.g. COS's entry list). It has had no test: one is written, on a fixture git repo, covering every case it has met, the
      misreads included (a bare 'dir/' label, a git hooks path, a regex).
    proof: "the fixture test passes, and re-running RF2's 22 moves in a scratch copy of the pre-RF2 tree yields today's tree, with none of the 15 hand fixes needed"
  CS13_autopilot_to_orchestrator:
    status: OPEN
    depends_on: [CS12_the_mover_is_proven, CS_D14_autopilot_to_orchestrator]
    files: [orchestrator/autopilot.js, lib/nexus/autopilot.js, package.json, cos/app/runtime.js, lib/nexus-self/systems.js]
    does: "the move (DB23): npm scripts and COS's entryOf learn orchestrator/autopilot.js, and keep the two old paths for installed releases"
    proof: "npm run start:all boots every system; a COS release with lib/nexus/autopilot.js or nexus/autopilot.js still starts"
  CS14_cli_inside_nexus:
    status: OPEN
    depends_on: [CS12_the_mover_is_proven, CS_D9_cli_inside_nexus]
    files: [lib/cli, lib/nexus/cli, package.json, cos/app/shell.js]
    does: "lib/cli → lib/nexus/cli; COS's shell finds the first of lib/nexus/cli/nexus.js, lib/cli/nexus.js, cli/nexus.js"
    proof: "the CLI runs from the new path; COS's shell runs it in old and new releases"
  CS15_changelogs_to_versionium:
    status: OPEN
    depends_on: [CS12_the_mover_is_proven, CS_D13_changelogs_to_versionium]
    files: [versionium/changelogs, versionium/server.js, lib/release-notes.js, lib/nexus-releases.js, lib/release-version.js, lib/checks/ck-253-versions.js, scripts/release-zip.js, lib/phase-census.js, lib/spec-census.js, lib/context-atlas.js, lib/readme-generate.js, docs/CLAUDE.md]
    does: >-
      The changelogs and the release tooling move into versionium (CS_D13); versionium serves the list and each changelog by route, and core's
      censuses read that route. The rule in docs/CLAUDE.md names the new place. Old releases (changelogs at the root) are still read.
    proof: "release notes, the releases list, ck-253 and the censuses give the same answers as before; the ratchet adds no crossing; the root holds no CHANGELOG"
  CS16_erosmancer_os:
    status: OPEN
    depends_on: [CS12_the_mover_is_proven]
    files: [clear-glass/erosmancer, clear-glass/erosmancer-os]
    does: "clear-glass/erosmancer → clear-glass/erosmancer-os (his name, CN_D4); Clear Glass's spawn path follows (RF3_erosmancer_os)"
    proof: "Clear Glass starts ErosmancerOS from the new path"
  CS17_cockpit_home:
    status: OPEN
    depends_on: [CS12_the_mover_is_proven, CS_D10_cockpit_home]
    files: [lib/cockpit, lib/ui/brainos]
    does: "after his answer to CS_D10: cockpit's back end joins BrainOS, under its UI (a), or the folder is renamed (b). Nothing moves before."
    proof: "BrainOS works from the new place, and cockpit's two consumers (copilot/cli.js, guardian/server.js) are repointed"
  CS18_one_copy_of_the_primitives:
    status: OPEN
    depends_on: [CS12_the_mover_is_proven]
    files: [lib/siso, lib/siso/core, lib/warp/core, lib/emerge/siso]
    does: >-
      One Event/Gate/Stream/StreamLog in core (RF4_primitives_one_copy). The four copies are compared method by method; warp/core is the most
      complete and tested, so it becomes the one copy, in lib/siso. The other copies re-export it for their callers (§0.3), with an ESM
      wrapper for the ESM copy.
    proof: "every caller of the four copies passes its tests on the one copy; warp's own tests pass on it"
  CS19_warp_the_system:
    status: OPEN
    depends_on: [CS18_one_copy_of_the_primitives, CS_D11_warp_is_a_system]
    files: [warp, lib/warp, lib/emerge, lib/nexus-self/systems.js, warp/registry-components.js, warp/compartment.json, warp/spec/warp.spec]
    does: >-
      warp leaves core and becomes a system: lib/warp's dispatch, crystallizer and benchmarks, with emerge's runtime (core/, chunk/, codegen,
      kernel), in warp/. It gets a server (its port), its registry, its compartment.json and its .spec, and it is added to systems.js (the 16th).
      Its users call it by route. A user it cannot serve by route yet is listed and stays on the in-process path until it is moved; that path
      is in the ratchet's baseline and comes down with DB6.
    proof: "warp boots under autopilot and answers /health; the census lists 15 systems besides core; the ratchet adds no crossing beyond the listed baseline"
  CS20_spec_compiler_and_ide_to_idearium:
    status: OPEN
    depends_on: [CS19_warp_the_system, CS_D12_spec_compiler_and_ide_to_idearium]
    files: [lib/emerge/compiler, lib/emerge/emerge-ide.js, idearium/spec-engine, copilot/module-builder.js, guardian/server.js, lib/cli/boot-systems.js]
    does: >-
      emerge's spec compiler and its IDE move into idearium (RF4_spec_compiler_into_idearium). The compiler is merged with compiler-t0.js where
      the two do the same job. copilot and guardian call idearium's compile route instead of requiring it (designed out before code). The
      IDE's boot entry (emerge :4242) follows.
    proof: "test-substrate-spec compiles every spec at specDepth 1.0 from idearium; copilot and guardian compile through the route; the IDE boots"
  CS21_the_registry_at_every_level:
    status: OPEN
    depends_on: [CS19_warp_the_system]
    files: [lib/registry-level.js, registry-components.js]
    does: "the drawbridge map's DB21 (one registry schema for root, system and component) and DB22 (the root and the missing registries), run here so that the 16 systems are what they cover"
    proof: "as DB21 and DB22"

# ## ADDENDUM 2026-10-24 (b) — sovereign and in a compartment, first; the placement moves last (his order)
# James, 2026-10-24, right after CS12–CS21 were mapped: "then focus on the ones that get each system sovereign, bugs ad / anything not
# related to sovereignty, do last unless necassarry" · "i want to get each system soveriegn and inside a cos compartment".
# What changes: the order. CS12 (the mover is proven) stays early, because sovereignty moves files home (DB17). CS19 (warp the system)
# is placement, but it changes which systems there are, so it comes before warp's own sovereignty. CS13–CS17, CS20 and CS21 come last.
# The census the plan is cut from (lib/system-boundary.js scan, 2026-10-24, after RF2; out = this system loads another's code,
# in = another system loads this one's, up = core loads this one's):
#   system         out   in   up | data  capability | compartment.json
#   components       0    0    0 |   0     0        | no
#   architect        4    0    0 |   1     3        | no
#   ollama           0    7    5 |   0     0        | yes
#   versionium       9    1    2 |   5     4        | yes
#   diagnostic      11    1    0 |   2     9        | yes
#   clear-glass     10    5    5 |   0    10        | yes
#   guardian        23    1    4 |   0    23        | yes
#   orchestrator    26    4    7 |   4    22        | no
#   loom             4   10   26 |   3     1        | yes
#   idearium        33    2    5 |   2    31        | yes
#   copilot         24    8   27 |  12    12        | yes
#   cos              1   21   52 |   1     0        | the host
#   intelligence     8   42   46 |   6     2        | yes
#   cortex          16   67   83 |   0    16        | yes
# Every "data" crossing is cortex/memory/jaa-db.js: one shared store in cortex's directory with several writers, tables owned by nobody.
# His rule for each system (CS_D7): sovereign (own data, no other system loading its code) → its registry with its bus and contract
# (DB16, DB4, DB5) → its compartment (DB11) → opened on demand (CS4). "Sovereign" here = out 0 and in 0 and up 0 in the census.
phases_c:
  SV0_the_census_tells_the_truth:
    status: "DONE 0.60.244 — comments skipped; sovereign both ways (inFrom, registry, compartment, step); the Sovereignty card; the ratchet green (3 crossings designed out: lib/phasemap-parse.js, COS's runTarget handed over). Only components is sovereign both ways."
    depends_on: []
    files: [lib/system-boundary.js, tests/modules/test-system-boundary.test.js, tests/modules/test-sovereign-systems.test.js]
    does: >-
      Bugs first, because the plan is cut from this census. The scanner counts a require written inside a comment as a crossing
      (intelligence/alk/index.js:122 shows as "cortex/versionium/"). It is fixed to skip comments. Sovereignty is counted both ways:
      out, in, and up (core loading a system's code) are all reported, not only out. The census also says whether a system has its
      compartment.json and its registry, so it shows each system's step on CS_D7's road.
    proof: "a require in a comment is not a crossing; the table above comes back from the route (`system sovereign`) with in, up and the step"
  SV1_every_table_has_one_owner:
    status: "PARTLY — the census DONE 0.60.250 (lib/system-boundary.js tables(): 127 tables, 43 one writer, 3 one system + core, 31 only core, 3 contested: event_log, failures, gaps; 47 read only; 21 of 106 store users name no table it can read); the declaration OPEN, his call (SV1_D1)"
    depends_on: [SV0_the_census_tells_the_truth]
    files: [lib/system-store.js, lib/table-owners.js, lib/jaa-store.js, cortex/memory/jaa-db.js, cortex/boot.js, idearium/cli/route-commands.js]
    reuse: "found 2026-10-24 (§8.6): lib/system-store.js openStore(system, { tables, migrate }) already gives a system its own store and brings its tables home from cortex's once, keeping the rows there (SV-01; guardian uses it, test-guardian-own-data). SV1 builds the ownership census on it, not beside it."
    does: >-
      Every table in the shared store gets one owner, decided from the evidence: the system whose code writes it. A table written by
      several is listed for his call, never guessed. The owner opens its tables through core's engine (lib/jaa-store.js, already in core);
      every other system reads or writes them through the owner's route (cortex already serves /api/gaps and /api/jaa/:table, §8.6).
      Route GET /api/system/tables and the row `system tables`. Where the files lie on disk does not change in this phase: moving his
      stored data is brought to him first.
    proof: "each table names its owner and its writers; a contested table is listed, not assigned; the census's data crossings drop for every owner"
  # 2026-10-24 — his answer on brave-cori to the same proposal (a table → owner map): "Look at emerge. Deeply Custom". The coder's reading
  # there, to confirm: each system declares its tables in Emergence (<system>.eg), and the owner map is compiled from the declarations.
  # No .eg program exists yet. guardian and loom already declare theirs as lib/system-store.js table lists. Which one is his call:
  SV1_D1_how_a_system_declares_its_tables:
    status: "OPEN — his to choose: (a) Emergence, <system>.eg compiled to its store module (brave-cori's proposal from his \"Look at emerge. Deeply Custom\"); (b) the system-store table lists already in use (lib/system-store.js openStore tables, guardian and loom); the three contested tables (event_log, failures, gaps) are his to assign either way"
  SV2_core_files_go_home:
    status: OPEN
    depends_on: [SV0_the_census_tells_the_truth, CS12_the_mover_is_proven]
    files: [lib, lib/system-boundary.js]
    does: >-
      The 262 "up" crossings, one system at a time. A core file that only one system's code uses, or that reaches into one system to do
      that system's job, moves to that system (DB17, through the mover). A core file several systems use, which reaches into one, gets that
      system's route instead. Each file's verdict is listed before it moves, with the users that decided it.
    proof: "per system, its 'up' count reaches 0; nothing that stays in core loads a system's code"
  SV3_components_and_architect:
    status: OPEN
    depends_on: [SV1_every_table_has_one_owner]
    files: [components/compartment.json, architect/compartment.json, architect/service.js]
    does: >-
      The two nearest. components is already sovereign (0/0/0) and needs only its compartment.json. architect has 4 out (RAID's contract
      intake, the shared store, alk, one more) and 0 in: the 4 become routes, then its compartment.json. Both then take CS_D7's last steps
      (registry, handshake, compartment, opened on demand), proving the road once end to end.
    proof: "both sovereign in the census; COS opens each in its compartment and closes it (CS4's proof, on these two)"
  SV4_ollama_versionium_diagnostic:
    status: OPEN
    depends_on: [SV3_components_and_architect, SV2_core_files_go_home]
    files: [ollama, versionium, diagnostic]
    does: "The next three (12 crossings each). ollama: 7 in + 5 up, other systems loading ollama's code, which become ollama's routes. versionium: 9 out (5 of them data). diagnostic: 11 out, its reach into intelligence's cfr and cortex's healer, which become routes (DH5 makes heal-loop diagnostic's own)."
    proof: "each sovereign in the census; each opened by COS in its compartment"
  SV5_clear_glass_guardian_orchestrator:
    status: OPEN
    depends_on: [SV4_ollama_versionium_diagnostic]
    files: [clear-glass, guardian, orchestrator, orchestrator/compartment.json]
    does: "20, 28 and 37 crossings. Almost all are capability crossings: each becomes a route on the system that owns it. orchestrator gets its compartment.json."
    proof: "each sovereign; each opened by COS in its compartment"
  SV6_loom_idearium_copilot:
    status: OPEN
    depends_on: [SV5_clear_glass_guardian_orchestrator]
    files: [loom, idearium, copilot]
    does: "40, 40 and 59 crossings. loom's are mostly core reading its scanners (26 up, through SV2). idearium's 33 out are mostly loom's phasemap scanner and cos's testenv. copilot has 12 data crossings (SV1)."
    proof: "each sovereign; each opened by COS in its compartment"
  SV7_intelligence_cos_cortex:
    status: OPEN
    depends_on: [SV6_loom_idearium_copilot]
    files: [intelligence, cos, cortex]
    does: >-
      The three everything leans on: 96, 74 and 166 crossings, nearly all inbound. Others load their code because they are the shared
      memory, the host and the cognition layer. Once SV1 and SV2 have taken the shared store and core's reach out, what remains becomes
      their routes. cos is the host, so its "compartment" is the exe itself (CS4a, CS11).
    proof: "the census reports every system sovereign; DB6 is done"
  SV8_warp_sovereign:
    status: OPEN
    depends_on: [CS19_warp_the_system, SV7_intelligence_cos_cortex]
    files: [warp]
    does: "warp, once it is a system (CS19): its users reach it by route except for the one copy of the primitives in core (CS18), then its compartment."
    proof: "warp sovereign in the census; COS opens it in its compartment"
build_order_c: "SV0 → CS12 → SV1 → SV2 → SV3 → SV4 → SV5 → SV6 → SV7 (= DB6) → CS4 per system as each is sovereign → CS18 → CS19 → SV8; last, unless sovereignty needs one sooner: CS13, CS14, CS15, CS16, CS17, CS20, CS21"
