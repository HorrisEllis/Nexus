# COS is the spine: every system a compartment, a version is the whole system state, the registry is the bridge, rebuild from the spec (2026-10-23)

origin: >-
  James, 2026-10-23: "Okay, so COS would be the spine, right? It would be the orchestrator, right? Each system, a compartment ... use the
  component registry as an event bus and bridge to the back end of the compartment, whether it's an operating system's SSH connection or the
  server.js of one of the systems ... each compartment as the rewind engine, right? The snapshot system ... a load balancer ... spawn and
  despawn systems ... individual performance throttling ... compartments can branch to benchmark versions of systems. They could run in
  parallel." · "Because the component registry is the spine for each system, then it would also be the bridge for each compartment." ·
  "Versioning could be actual system states. And then that means testing new versions each new version, right? This would make the testing
  environments fucking immensely easier ... we can use the spec, the .spec, as a template to rebuild a system. Since that's what it's for."
  The design is his; the census, the join over what exists, and the phase cut are the coder's.

status: MAPPED 2026-10-23 — spec cos/spec/cos-spine.spec (compiles at full depth). Nothing built.

## Ground truth (the spec's `census:`, read 2026-10-23)
- Ten systems already declare themselves as compartments (<system>/compartment.json, nexus.compartment/1: compartmentId, entry, port,
  healthUrl, data, spec, dependsOn).
- Files: idearium/repo/snapshot.js commits a repo's state to Versionium (full copy then verified deltas) with the registry's four parts.
- Machines: QEMU overlays (base image then changed blocks), qemu-img disk snapshots, live checkpoints (savevm) with rewind (vm-control.js).
- Running: process-runner, the watchdog (alerts, not caps), COS app runtime (COSA3 built); the Debian machine provisioned (testenv T1–T7).
- Contracts: the orchestrator's handshake verifies each system's /api/contract and keeps a trust map.
- Mapped elsewhere, built on here, not repeated: snapshot-compartments SN0–SN4 (one branch mechanism, open a snapshot as a compartment, run
  in parallel, RFR2 benchmarks); compartment-environment CE1–CE7 (the Debian machine, the handshake, the terminal); infrastructure-spine
  IN3/IN6 (the registry as the spine, the systems onto it).

## Readings, the coder's (to confirm where marked)
- "Versioning could be actual system states": a version is one record over the Versionium commit (files) and the QEMU snapshot (machine),
  with the registry and the spec it stands on. His answer to the coder's question, taken as confirmed.
- "hook into the actual threads ... a PID instance or into the actual IO": COS owns each compartment's process tree, to measure and cap it
  (Job Objects on his Windows PC, cgroups on Linux, QEMU -m/-smp for machines), not reaching inside a running program's threads. To confirm.
- "It would be the orchestrator": COS uses the orchestrator's contract handshake through its route (§8.6); whether the orchestrator system
  itself moves into COS is his call. To confirm.

decisions:
  CS_D1_registry_is_the_bridge:
    chosen: "one registry: read from inside a system as its spine, from outside as the bridge to its compartment; no second protocol"
    by: "his, 2026-10-23 (quoted in origin); recorded first in the infrastructure-spine map's addendum"
  CS_D2_a_version_is_the_whole_state:
    chosen: "a CompartmentVersion joins the existing Versionium commit and the existing QEMU snapshot under one id; neither copied into the other"
    by: "his, 2026-10-23: \"Versioning could be actual system states\"; the join is the coder's, by his axioms §8.6, §10.3"
  CS_D3_the_spec_rebuilds_the_system:
    chosen: "a rebuild compiles the system's spec and builds it into a new compartment, then compares registries; drift is listed"
    by: "his, 2026-10-20 (the spec is the rebuild contract) and 2026-10-23; REVERSIBILITY: never over the running system"
  CS_D6_every_project_a_compartment:
    chosen: "every imported project and every new specced-and-phased project is a new compartment that gets built; versions are snapshots of each project's or system's states; each hat binds its agent to the compartment"
    by: "his, 2026-10-23 (addendum below)"
  CS_D7_sovereign_first:
    chosen: "a system is opened and closed by COS only after it is sovereign (its own data, no other system loading its code: DB6), on its own registry with its event bus and interaction contract (DB16, DB4, DB5), in its own compartment (DB11); the lowest-friction systems first"
    by: "his, 2026-10-23: \"Dont they need to be sovereign first? Then hooked into their own component registry for the event bus, and interaction contract\" — the same precondition DB11 states"
  CS_D8_raid_home:
    chosen: "RAID's always-on half (queue, contracts, gates, revert, routing) lives in the COS exe, moved last when its callers are on its route; its reasoning half (RQ27) is opened on demand; RAID's routing becomes the load balancer"
    by: "his, 2026-10-23 (\"Then what if we moved RAID to the primary application ... the actual exe ... a load balancer as well\"; \"Yes do it\" to the order). Answers request-spine decision_raid_home (2026-10-12, open) with a fifth choice"
  CS_D4_caps_by_the_os:
    chosen: "caps are applied by the OS or the hypervisor and read back; what cannot be enforced is said"
    by: "his axioms §1.2, §0.1; the 'hook in' reading above is to confirm"

  # ── 2026-10-24, his answers (see the ADDENDUM at the end for the context) ──
  CS_D9_cli_inside_nexus:
    chosen: "lib/cli → lib/nexus/cli"
    by: "his, 2026-10-24: \"yes to inside.\" (asked: lib/nexus/cli, or keep lib/cli)"
  CS_D10_cockpit_home:
    status: "OPEN, to confirm"
    asked_back: "his, 2026-10-24: \"cockpit becomes brainos?\" (asked: its name inside idearium, cockpit or forge-ide)"
    readings: >-
      The coder's two readings: (a) cockpit's back end (forge-ide per its own spec: cli, core, live, pipeline) becomes BrainOS's back end,
      under BrainOS's UI (lib/ui/brainos, "the ui floating on top"); (b) the folder is renamed brainos. He asked it as a question, so it waits
      on his answer.
  CS_D11_warp_is_a_system:
    chosen: "emerge integrates with warp, and the two are one system (the 16th): warp"
    by: "his, 2026-10-24: \"yes move emerge and integrate with warp and make it as system.\" Supersedes CN_D2 (\"1. moved to lib?\", warp as a lib primitive) by his later word; CN_D2 is kept (§0.3)."
    reading_to_confirm: >-
      The coder's reading, by his axioms (DB0a primitives are kernel; DB0b only routes between systems): a system is reached by route, but
      Event/Gate/Stream/StreamLog are used in-process by every system. So one copy of those primitives stays in core (lib/siso, from the four
      copies), and the warp system is warp's dispatch, crystallizer and benchmarks with emerge's runtime (core/, chunk/, codegen, kernel). Its
      name: "warp" (the coder's). To confirm.
  CS_D12_spec_compiler_and_ide_to_idearium:
    chosen: "emerge's spec compiler (lib/emerge/compiler, SPEC_COMPILER.spec) and its IDE (emerge-ide.js) move to idearium"
    by: "his, 2026-10-24: \"the nspeccompiler and ide can move to idearium\""
  CS_D13_changelogs_to_versionium:
    chosen: "the 442 CHANGELOG-*.md move to versionium"
    by: "his, 2026-10-24: \"versionium\" (asked: docs/changelogs, the coder's recommendation, or versionium). The coder's recommendation was docs; his call is versionium."
    design_by_the_axioms: >-
      Core must not reach into a system (the ratchet refuses it). So the release tooling that is version work moves with them: lib/release-notes.js,
      lib/nexus-releases.js, lib/release-version.js, lib/checks/ck-253-versions.js and scripts/release-zip.js. Core's censuses
      (lib/phase-census.js, lib/spec-census.js, lib/context-atlas.js, lib/readme-generate.js) read them through versionium's route.
  CS_D14_autopilot_to_orchestrator:
    chosen: "lib/nexus/autopilot.js → orchestrator/autopilot.js, still its own process"
    by: "his question, 2026-10-24: \"what about moving autopilot ot the porchastrator folder?\"; the coder recommended yes. Recorded as DB23 in the drawbridge map; phased here."

phases:

  CS1_a_version_is_a_system_state:
    layer: foundation
    status: OPEN
    depends_on: [CS_D2_a_version_is_the_whole_state]
    files: [cos/spine/version.js, idearium/repo/snapshot.js, cos/workspace/vm-control.js, cos/compartment/qemu-runtime.js, versionium/lib/files.js]
    spec: cos/spec/cos-spine.spec
    blocks: [MOD-CS-VERSION]
    does: >-
      (Graphed 2026-10-23: no new crossing. COS reaches the files part through Idearium's POST /api/repos/:uuid/snapshot, never by requiring
      idearium/repo/snapshot.js — designed out before code, per DG2.)
      take / list / get / restore a CompartmentVersion: files through the existing repo snapshot, the machine through the existing checkpoint
      or disk snapshot (or none, said), the registry and spec hashes; restore takes a version of now first. Route /api/cos/versions, command
      `cos version`.
    proof: a process compartment's version restored byte for byte; a machine compartment's files and machine back to the same tag (where QEMU runs)

  CS2_test_every_version:
    layer: integration
    status: OPEN
    depends_on: [CS1_a_version_is_a_system_state, SN1_open_a_snapshot_as_a_compartment]
    files: [cos/spine/test-version.js, cos/testenv/index.js, cos/workspace/index.js]
    spec: cos/spec/cos-spine.spec
    blocks: [MOD-CS-TEST]
    does: >-
      Each new version opened as its own compartment (SN1's lazy branch), its own tests run there, the result recorded on the version, the
      branch closed. Branches in parallel and their benchmarks are SN2–SN4's, run over these versions.
    proof: yesterday's version tested in its branch while today's keeps running; nothing left behind

  CS3_the_registry_is_the_bridge:
    layer: integration
    status: OPEN
    depends_on: [CS_D1_registry_is_the_bridge, IN3_registry_is_the_spine, CE3_the_handshake, DB16_a_registry_for_each_system]
    files: [cos/spine/bridge.js, orchestrator/lib/contract-handshake.js, idearium/repo/snapshot.js]
    spec: cos/spec/cos-spine.spec
    blocks: [MOD-CS-BRIDGE]
    does: >-
      link(from, to) reads the target's registry contract and verifies it through the orchestrator's handshake; call() sends only what the
      contract declares; a server.js system and a Debian machine are bridged the same way.
    proof: a declared route passes, an undeclared one is refused before sending, naming the contract and its hash

  CS4_every_system_a_compartment:
    layer: backend
    status: OPEN
    depends_on: [CS4a_cos_boots_alone, CS3_the_registry_is_the_bridge, CS_D7_sovereign_first, DB6_move_the_crossings, DB16_a_registry_for_each_system, DB4_one_bus_per_system, DB5_the_handshake_for_every_system, DB11_cos_compartment_per_system]
    files: [cos/spine/systems.js, cos/compartment/process-runner.js, cos/watchdog/monitor.js, cos/app/runtime.js]
    spec: cos/spec/cos-spine.spec
    blocks: [MOD-CS-SUPERVISE]
    does: >-
      COS starts alone (his decision, addendum below). Each system is opened when something needs it: read from its .spec (compartment.json is the
      derived cache), its dependsOn opened first, health from its healthUrl, watched; closed when idle by his rule. A system already running is
      adopted by its port. Route /api/cos/systems, command `cos systems`.
    proof: COS boots with no system running; asking Idearium for work opens Idearium and what it depends on, and nothing else

  CS4a_cos_boots_alone:
    layer: foundation
    status: OPEN
    depends_on: [CS_D7_sovereign_first, COSA3_run_and_supervise]
    files: [cos/spine/boot.js, cos/app/runtime.js, lib/nexus/autopilot.js, cos/compartment/process-runner.js]
    spec: cos/spec/cos-spine.spec
    blocks: [MOD-CS-BOOT]
    does: >-
      The first step of his order (lowest friction): COS starts alone; Cortex, with RAID inside it unchanged, is opened as the one
      always-open core compartment; every other system opens when asked for once it is sovereign, and until then with the core set (said).
      All-at-once spawning at boot stops. No code moves.
    proof: COS boots; Cortex opens; nothing else opens until asked; a request for Idearium opens it

  CS5_caps_per_compartment:
    layer: backend
    status: OPEN
    depends_on: [CS4_every_system_a_compartment, CS_D4_caps_by_the_os]
    files: [cos/spine/caps.js, cos/compartment/qemu-runtime.js]
    spec: cos/spec/cos-spine.spec
    blocks: [MOD-CS-CAPS]
    does: >-
      CPU, cores and memory per compartment: a Job Object on Windows, a cgroup v2 slice (or prlimit) on Linux, -m/-smp for a machine; read back
      from the OS. Disk (a machine's image size) and network said as not enforced until a later phase.
    proof: a capped process compartment is held to its memory by the OS on the platform the test runs on; the read-back matches

  CS6_rebuild_from_the_spec:
    layer: integration
    status: OPEN
    depends_on: [CS1_a_version_is_a_system_state, CS4_every_system_a_compartment, CS_D3_the_spec_rebuilds_the_system]
    files: [cos/spine/rebuild.js, cos/spine/version.js, cos/workspace/index.js, lib/emerge/compiler/kg-builder.js, lib/emerge/compiler/phase-specs.js]
    spec: cos/spec/cos-spine.spec
    blocks: [MOD-CS-REBUILD]
    does: >-
      (Graphed 2026-10-23: COS asks Idearium to compile and build through its routes — the repo phase build and POST /api/repos/:uuid/chunk —
      and reads the rebuilt registry from the snapshot it takes; it does not require emerge. Designed out before code, per DG2.)
      A system's spec compiled (refused below depth 1.0, with its gaps) and built into a new compartment, indexed, its registry's four hashes
      compared with the version's; each differing part listed as the drift between the spec and the system.
    proof: a small system rebuilt from its spec matches its version's registry, or names each difference

  CS7_spawn_despawn_and_balance:
    layer: backend
    status: OPEN
    depends_on: [CS5_caps_per_compartment, CS11_raid_in_the_exe]
    files: [cos/spine/scale.js, cos/spine/systems.js, cos/spine/bridge.js]
    spec: cos/spec/cos-spine.spec
    blocks: [MOD-CS-SCALE]
    does: >-
      Replicas of a system from the same version on their own ports, a request to its name sent to the least loaded healthy one, idle replicas
      despawned by his rule; a system whose data cannot be shared is refused replication, said.
    proof: two replicas of a stateless system share load; one stopped, traffic goes to the other

  CS9_every_project_a_compartment:
    layer: integration
    status: OPEN
    depends_on: [CS4_every_system_a_compartment, CS1_a_version_is_a_system_state, CS_D6_every_project_a_compartment]
    files: [cos/spine/projects.js, idearium/repo/index.js, lib/cos-bridge.js]
    spec: cos/spec/cos-spine.spec
    blocks: [MOD-CS-PROJECTS]
    does: >-
      Every import and every new specced-and-phased project gets its compartment under its repo's id, declared by its .spec, with its first
      version; existing repos get one on first open. Idearium reaches COS through lib/cos-bridge.js, as it does today.
    proof: importing a zip makes a repo, its compartment and its first version under one id

  CS10_hats_bound_to_the_compartment:
    layer: integration
    status: OPEN
    depends_on: [CS9_every_project_a_compartment, CS5_caps_per_compartment, CS3_the_registry_is_the_bridge]
    files: [cos/spine/hat-bind.js, lib/repo-hat.js, lib/hat-forge.js, lib/repo-agent.js]
    spec: cos/spec/cos-spine.spec
    blocks: [MOD-CS-HAT]
    does: >-
      A hat's file and command tools run inside its compartment (directory, caps, or machine), so the hat's stated "capability boundary, not a
      filesystem jail" becomes an enforced one; another compartment is reached only through the registry bridge.
    proof: a repo hat's run_command writing outside its compartment is refused or lands inside it, never outside

  CS11_raid_in_the_exe:
    layer: backend
    status: OPEN
    depends_on: [CS4_every_system_a_compartment, DB6_move_the_crossings, IM6_cortex_unclumped, CS_D8_raid_home]
    files: [cos/raid/index.js, cos/raid/store.js, cos/raid/routes.js, cos/app/desktop/main.js, cortex/core/raid/router.js, cortex/core/raid/worker.js, cortex/core/raid/officiator.js]
    spec: cos/spec/cos-spine.spec
    blocks: [MOD-CS-RAID]
    does: >-
      The last step of his order: once every caller reaches RAID by its route (DB6; 25 files load it in-process today, 50 tests) and its
      tables are its own (IM6; data/raid 168 files), RAID's always-on half moves into the COS app's process and serves the same /api/raid/*
      routes; the reasoning half (RQ27) is opened on demand. RAID weighs live compartment load, so it is the load balancer (CS7 rides on it).
      cortex/core/raid archived (§0.3).
    proof: with Cortex closed a routing decision is still made from COS; of two fit agents the less loaded is chosen and said

  CS8_the_cos_screen:
    layer: ui
    status: OPEN
    depends_on: [CS2_test_every_version, CS5_caps_per_compartment, CS7_spawn_despawn_and_balance]
    files: [cos/app/desktop/spine.html, cos/app/desktop/spine.js, cos/app/controller.js]
    spec: cos/spec/cos-spine.spec
    blocks: [MOD-CS-UI]
    does: >-
      The COS window's Systems, Versions and Links: each compartment's state, process, memory, CPU and caps; take, test, restore and branch a
      version; replicas. Co-pilot in it through the same `cos` commands. (Each phase above ships its route and command; the screen gathers
      them here — said, per the order of delivery.)
    proof: in Clear Glass, a version taken and restored from the screen

# ── ADDENDUM 2026-10-23 — the .spec is how a compartment declares; the virtual disk and miniworlds (his correction) ───────────────
# Context: the map above had CS4 read each system's compartment.json as its declaration. James, 2026-10-23: "No .spec is how it declares.
# Also what we can use as a virtual disk for os based? Or miniworlds? Look at the specs."
# Decided (his): a compartment declares itself through its .spec. guardian/spec/guardian.spec already declares core, events, routes,
# command_index and handshake. compartment.json (10 systems, lib/system-shape.js role 'compartment') becomes a derived cache, kept (§0.3)
# and checked against the spec. versionium/spec/versionium.spec has no routes or events sections yet, so not every system's spec declares
# enough today; CS4 lists which do.
# The coder's reading, by his NC0 evidence rule: the spec is what is declared and the component registry is what is discovered. The bridge
# (CS3) passes a call only where both agree. Rebuild (CS6) and drift compare the same two.
# Found in the specs, not built in code:
#   - docs/specs/IDEARIUM.spec.md, Miniworld Manager: "Each miniworld is a .nex file opened as a COS compartment sandbox" — nexus miniworld
#     list | boot | fork | snapshot | discard. No code names a miniworld.
#   - docs/cos.spec §GAP 2026-08-14: the ".cos portable archive" — a tar.gz of manifest.json, spec/compartment.spec, code/ and
#     history/*.nex.gz, "a blueprint's SOURCE artifact". Mapped, not built.
#   - docs/2026-09-02-nexus-vision-master-phasemap.spec D2: "Maybe we call it an idearium compartment... or miniworld." — naming left open.
#   - cos/playgrounds/cow-fs.js: copy-on-write is an eager full copy today. Lazy copy-on-write needs reflinks (Btrfs/XFS, or ReFS block
#     cloning on a Windows Dev Drive).
#   - The machine disk in use: qcow2 (cos/compartment/qemu-runtime.js) — a read-only base image, overlays of changed blocks, internal
#     snapshots.
# Proposed (to confirm): a miniworld is the .cos archive. Its spec declares it; its code/ holds the files; history/*.nex.gz holds its
# versions; for an OS-based miniworld, machine/ holds the qcow2 overlay chain, naming its base image by hash. Boot opens it as a
# compartment; fork is a new overlay or a copy-on-write copy; snapshot is a CompartmentVersion; discard drops the overlay.

# ── ADDENDUM 2026-10-23 — start with just COS; open systems as needed (his decision) ─────────────────────────────────────────────
# Context: the coder asked whether Idearium and COS should merge, whether Idearium becomes the orchestrator, whether specs are the repos
# and each repo a compartment and a system or project, and whether Versionium and QEMU should merge. The coder recommended: separate roles
# (Idearium orchestrates the work, COS runs it), one id across spec, repo, compartment and miniworld, and Versionium owning every version
# with QEMU as its machine part.
# James, 2026-10-23: "The point is that you start with just cos. Then open systems as needed."
# Decided (his): COS is the only thing that starts. Every other system (Idearium, Guardian, Clear Glass, Versionium, …) is a compartment
# COS opens when something needs it, its dependencies opened first, and closes when it is idle. Nothing merges: each system stays its own,
# and the question of who orchestrates is answered by who is running: COS. Idearium is the first compartment opened when there is work.
# Today's opposite, read in the code: cos/app/runtime.js (COSA3) starts nexus/autopilot.js, and autopilot spawns every system at boot.
# His runs on 2026-10-21 and 2026-10-22 hit critical memory, at 1–9% free (0.60.203, 0.60.205 in lib/version.js).
# What it changes in this map:
#   - CS4: each system is opened on demand from its .spec (the spec declares it; earlier addendum), not all at once; autopilot stays as
#     the supervisor of an opened set (§0.3), no longer the boot path.
#   - CS7: "despawn when idle" becomes the normal life of every system, not only of replicas.
# Still open, his: (a) one id across spec, repo, compartment and miniworld; (b) Versionium owning every version with QEMU as its machine
# part; (c) the miniworld as the .cos archive.

# ── ADDENDUM 2026-10-23 — every project a compartment; versions are its states; hats bind to the compartment (his decision) ──────────
# Context: still open from the coder's questions: one id across spec, repo, compartment and miniworld; Versionium owning every version.
# James, 2026-10-23: "Yeah, then versioning could also be the snapshotting of system states of different versions of each project or
# system. This is also for new. Anything imported, any projects imported, any new projects that have been spec'd and phased, get, like I
# said, any new Ethereum project would be a new compartment that gets built. Each hat for the agent, you know, how it binds them to the
# repo, would bind them to the compartment."
# Read as (the coder's): "Ethereum project" is the voice transcription of "Idearium project" — to confirm.
# Decided (his):
#   - versions are snapshots of the system states of every project and system, not only Nexus's own;
#   - every import and every new specced-and-phased project is a new compartment, built (CS9);
#   - each hat binds its agent to the compartment (CS10).
# This also answers open question (a) in practice: one repo, one compartment, one id.
# Found in the code (lib/repo-hat.js, its own header): a hat today is "a capability boundary, not a filesystem jail" — a scoped-in
# run_command can reach outside the repo. Binding the hat to the compartment makes that boundary real. That is the coder's observation;
# the decision is his.

# ── ADDENDUM 2026-10-23 — the order: sovereign first, then the registry, then the compartment; RAID in the exe last (his decision) ──────
# Context: he proposed moving RAID into the COS exe as the decision engine and load balancer. The coder read every related phasemap:
#   - request-spine decision_raid_home (2026-10-12): his "what if we move raid to a copilot module or intelligence system?", choices A–D,
#     never chosen; RQ27 blocked on it.
#   - drawbridge DB6 (move the crossings), DB11 (a COS compartment per system, partly built 0.60.134, loom/templates/cos-compartment.js,
#     with its stated precondition "a system cannot be isolated while other systems still require() its files"), DB16 (a registry for each
#     system), DB4 (one bus per system) and DB5 (the handshake for every system).
#   - infrastructure-migration IM5 and IM6 (Cortex's store unclumped); infrastructure-spine IN3 and IN6; projects-RAID RD0–RD4;
#     cortex-to-intelligence B3 (/context is called on every prompt).
# Measured in the tree (lib/system-boundary.js census): direct code links into each system from other systems: cortex 151, intelligence
# 88, copilot 35, ollama 12, clear-glass 10, idearium 8, guardian 6, versionium 3, diagnostic 1. RAID: 25 files outside Cortex load it
# in-process, 24 reach it over HTTP, 50 tests load it.
# The coder answered his "This will be minimal friction right?" with no: the leaf systems are cheap, Cortex and RAID are not. It proposed
# the order: COS boots alone with Cortex as the always-open core; the leaf systems open on demand; RAID moves into the exe last.
# James, 2026-10-23: "Yes do it. Dont they need to be sovereign first? Then hooked into their own component registry for the event bus, and
# interaction contract"
# Decided (his): CS_D7 (sovereign first: own data and no inbound code links, then its own registry with its event bus and contract, then its
# compartment, then opened on demand) and CS_D8 (RAID's always-on half in the exe, last; the reasoning half on demand; its routing is the
# load balancer).
# The order in this map is now: CS4a (COS boots alone, Cortex core; no code moves) → per system, lowest friction first: DB6 → DB16/DB4/DB5 →
# DB11 → CS4 (open on demand) → IM6 → CS11 (RAID in the exe) → CS7 (balance through RAID).

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
    status: OPEN
    depends_on: []
    files: [lib/system-boundary.js, tests/modules/test-system-boundary.test.js, tests/modules/test-sovereign-systems.test.js]
    does: >-
      Bugs first, because the plan is cut from this census. The scanner counts a require written inside a comment as a crossing
      (intelligence/alk/index.js:122 shows as "cortex/versionium/"). It is fixed to skip comments. Sovereignty is counted both ways:
      out, in, and up (core loading a system's code) are all reported, not only out. The census also says whether a system has its
      compartment.json and its registry, so it shows each system's step on CS_D7's road.
    proof: "a require in a comment is not a crossing; the table above comes back from the route (`system sovereign`) with in, up and the step"
  SV1_every_table_has_one_owner:
    status: OPEN
    depends_on: [SV0_the_census_tells_the_truth]
    files: [lib/table-owners.js, lib/jaa-store.js, cortex/memory/jaa-db.js, cortex/boot.js, idearium/cli/route-commands.js]
    does: >-
      Every table in the shared store gets one owner, decided from the evidence: the system whose code writes it. A table written by
      several is listed for his call, never guessed. The owner opens its tables through core's engine (lib/jaa-store.js, already in core);
      every other system reads or writes them through the owner's route (cortex already serves /api/gaps and /api/jaa/:table, §8.6).
      Route GET /api/system/tables and the row `system tables`. Where the files lie on disk does not change in this phase: moving his
      stored data is brought to him first.
    proof: "each table names its owner and its writers; a contested table is listed, not assigned; the census's data crossings drop for every owner"
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
