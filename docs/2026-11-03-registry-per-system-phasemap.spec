# docs/2026-11-03-registry-per-system-phasemap.spec
# Every system's component registry is its own: per system, sovereign, inside its compartment (.cos). AXIOMS §5.16. Registered in
# docs/SPEC-REGISTRY.spec. Only RG0 (the enforcement) is mapped; the rest is in PLANNING with him (his: "Brainstorming. Dont just do it
# without planning it. Not mapping. Planning."), and is mapped only when he has answered.

origin:
  date: 2026-11-03
  james: '"No see. The compartment is the .spec file. Look at the mini world concept. .cos. Like this is for creating, importing and creates a clear seperation for each system. That way it’s easy to backyp and still uswa the component registry for other systems to interact with it so it shouldnt be dofficult for using each orher." · "Not loom. Never said loom. Loom is going to be removed" · "No component registry is per system.  That needs to be implemented" · "And enforce that. I’m sick of you confusing that. It’s fucking sovereign. Do not  make this mistake again."'
  context: >-
    In planning the .cos compartment, the coder twice put Loom in the place of the component registry, following docs/CLAUDE.md rule 3's
    old wording ("Loom's registry"). Read in the code: the registry is built central — lib/component-registry.js, one store in Cortex's
    memory (JAA), filled by Cortex at boot, served by Orchestrator at /api/components — so with Cortex or Orchestrator down no system can
    find another (a §5.9 breach). Each system writes only a list (<system>/registry-components.js; COS and Orchestrator have none; Emerge's
    is in lib/emerge/).

decisions:
  RG_D0_the_registry_is_per_system:
    status: DECIDED 2026-11-03 (his)
    chosen: >-
      Each system owns its component registry: what it offers (routes, commands, events, permissions, hooks), written, stored and served by
      that system alone, inside its compartment. No central registry; no system stores, fills or serves another's entries. Loom is not the
      registry and is being removed. Written as law (docs/AXIOMS-v3.1.md §5.16), as docs/CLAUDE.md rule 3 (the old wording kept, struck), and
      in the root CLAUDE.md; enforced in code by RG0.
    by: "his; §5.9, §5.15"

phases:
  RG0_enforced:
    layer: backend
    status: "DONE 0.60.383 — test-registry-sovereign RS-01, RS-02"
    depends_on: [RG_D0_the_registry_is_per_system]
    files: [lib/registry-sovereign-check.js (new), lib/contracts/registry-sovereign-baseline.json (new), tests/modules/test-registry-sovereign.test.js (new), tests/modules/run-all.js, docs/AXIOMS-v3.1.md, docs/CLAUDE.md, CLAUDE.md]
    does: >-
      A ratchet like the boundary census's: the 12 files that use the central registry and the 22 Loom maps on 2026-11-03 are the baseline
      to undo; a new caller, a new Loom map or a grown one fails, named; the law missing from any of its three files fails; shrinking is
      counted and written back (--write). The coder stops adding Loom wires (since 0.60.376 it had added them by the old rule 3).
    proof: "RS-01 on the real tree; RS-02 on a fixture names each way of breaking it"

planning_with_him:
  status: "PLANNING — not mapped until he answers"
  questions:
    - "ANSWERED 2026-11-03 (his): \"Then the system registry is for connecting the component registries. Cos and The orchastrator uses that to orchestrate.\" Open, his to reconcile: where the system registry lives and whose it is (today's lib/system-registry.js is a read-only merge, not that)."
    - "Is each system's registry part of its .cos (its face), or a separate file the .cos points to?"
    - "One .cos with everything sealed inside, a small readable .cos pointing to its disk, or both forms (coder's recommendation: both)?"
    - "A running system's files: a normal folder, or the mounted virtual disk?"
    - "compartment.json folded into the .cos?"
    - "What .nex becomes: the history inside a .cos, or replaced by .cos?"

# ── ADDENDUM 2026-11-03 — his decisions in planning (recorded, not mapped) ─────────────────────────────────────────────────────────────
decisions_in_planning:
  PL_D1_versions_hold_only_changes:
    status: "DECIDED 2026-11-03 (his)"
    james: '"I just don''t want the versions to be bigger than only the changes."'
    context: >-
      Asked whether .nex is system snapshots or versions. Measured the same day: Versionium's file layer already stores diffs (versionium/
      lib/files.js, each proven by re-applying it); lib/versionium-record.js stores each changed file whole, before and after (up to 256 KB);
      the .disk archive is a full copy each time; the coder's qcow2 refresh grew Loom's disk 1.3 → 11.4 → 21.5 MB with nothing changed (it
      rebuilds the whole filesystem), a bug against this.
    chosen: "every snapshot and version holds only what changed since the one before"
    still_his: "whether .nex is the name for those snapshots (the coder's recommendation: .nex = system snapshots, changes only; versions stay Versionium's diffs) — not answered yet"
  PL_D2_sandboxed_not_virtual_machines:
    status: "DECIDED 2026-11-03 (his)"
    james: '"I have a gaming pc with 16gb of ram and a 3700x. Get 1650" · "That''s why I just want sandboxed envirements. Like only what''s needed to run a sandboxed envirement." · "Okay for now. I just want them to be isolated from each other. This should make the system easier to manage but give me more control over resource usage and limits."'
    context: >-
      His machine: Ryzen 7 3700X, 16 GB RAM, a GTX 1650 (the coder's reading of "Get 1650", said). A QEMU VM per system costs 0.5–1 GB each;
      his boot logs of 2026-11-01 already reached 0.2% free memory. Shown the same day: Node 22's permission model, run on this host, confines
      a process to its own folder (a file outside refused, starting another program refused); it does not cover the network.
    chosen: >-
      Each system isolated from the others as an ordinary process in a sandbox — only what is needed: its own folder (Node's permission
      model), its own code (COS's wall), no other programs unless allowed, memory and CPU limits COS already sets (Configuration) — not a VM.
      The goal, his: easier to manage, more control over resource usage and limits.
    still_his: "network isolation (a firewall rule per program, a local proxy COS controls, or later); what becomes of the qcow2 virtual disk (kept for the rare system that needs a VM, or set aside)"
  pinned:
    - "drift check pinned 2026-11-03 (his: \"It's fine for now. Pin it.\"): SC7's .phase differs from its map (phase-specs --check); the DAG check was not run"
  PL_D3_server_js_is_each_systems_process:
    status: "DECIDED 2026-11-03 (his)"
    james: '"Yes like the server.js is the process for each system. It’s what cos manages. The spine and component registry for each system routes through there. Cli and api."'
    context: "Read the same day: 7 systems have a server.js (copilot, diagnostic, guardian, intelligence, loom, ollama, versionium); idearium, clear-glass, cortex, cos, orchestrator, architect and emerge have none."
    chosen: "each system's server.js is its one process, the thing COS manages; that system's spine and its own component registry route through it, for its CLI and its API"
    still_his: "whether \"the spine\" is server.js itself or a module server.js loads"
  PL_D4_versionium_records_the_changes:
    status: "DECIDED 2026-11-03 (his)"
    james: '"Look at versionium. It’s meant to record changes."'
    context: >-
      Read the same day: versionium/spec/versionium.file-versioning.spec keeps "a first full copy then diffs"; versionium/lib/files.js stores
      a file again only if it changed, each diff proven by re-applying it, a full copy every 20 diffs (FILE_KEYFRAME_INTERVAL) or when a diff
      would be ≥ 90% of the file (FILE_DELTA_MAX_RATIO). Others reach it only through its routes.
    chosen: >-
      Snapshots and versions of a system are Versionium's, recorded as changes, through its routes. COS keeps no snapshot store of its own
      (§5.15). Found against it, from the coder's own work: the qcow2 virtual disk's snapshots (a second store, a full copy each refresh),
      the .disk archive used as a version (full copies), and lib/versionium-record.js sending whole files before and after.
    still_his: "whether .nex names a system snapshot recorded in Versionium, or drops out"
  PL_D5_each_system_reflects_genesis:
    status: "DECIDED 2026-11-03 (his)"
    james: '"I’m overwhelmed. Yes. Each system needs to reflect genesis.spec."'
    reading: "WITHDRAWN 2026-11-03. The coder read \"Yes\" as yes to server.js being the spine — a guess, against his rule of the same day (\"do not guess if you do not know. Ambiguity must be reconciled by me\"). His correction is PL_D6."
    chosen: >-
      idearium/spec-engine/templates/genesis.spec (1.5.0; its proposed 1.6.0 mapped 2026-10-31) is the shape every system takes: server.js its
      one process and origin, its own component registry as its drawbridge (the only way in, by API routes and the CLI), its own nodes and
      data, its boundary. The open questions above are answered by genesis where it already answers them; only what genesis leaves open
      comes back to him, one at a time.
  PL_D6_the_component_registry_is_the_spine:
    status: "DECIDED 2026-11-03 (his; corrects the coder's guess in PL_D5 and answers PL_D3's open question)"
    james: '"No component registry is the spine. Why is this getting confused?"'
    context: >-
      Already his on 2026-10-17, in genesis.spec's own header: "i want to eventually have the component registry for each system be the
      interaction contract and event bus, with handshake verification. basically the spine of each system ... the drawbridge for each
      compartment for each system, the only way to interact between systems. using the api routes, and cli interface. ui floats ontop".
      The coder confused it by guessing at a one-word answer instead of asking.
    chosen: "his words only (the coder's paraphrase, with \"hosts\", withdrawn the same day): see PL_D7"
  PL_D7_the_drawbridge:
    status: "DECIDED 2026-11-03 (his; recorded in his words only)"
    james: '"Remeber how I just said don’t guess?" · "The drawbridge is the the component registry, which is also the event bus, and interaction contract and bridge into the compartment."'
    chosen: "his words, as written above, are the definition; with PL_D3 (\"the server.js is the process for each system ... The spine and component registry for each system routes through there. Cli and api.\") and PL_D6 (\"No component registry is the spine.\")"
  PL_D8_cos_is_the_orchestrator:
    status: "DECIDED (his; restated 2026-11-03 after the coder listed COS as 'not a compartment yet' and the old orchestrator/ as a system of its own)"
    james: '"Are you fucking serious.  Cos is the orchastrator now. That’s the point. The reason for the sandbox is to seperate the systems." · "Is this even possible to integrate an event bus and interaction contract and component registry into one door into the system? Like each component for each module connects" · "You’re the coder. I’m learning as I go."'
    chosen: "COS is the orchestrator (since MG17's handover). The old orchestrator/ process, and the central registry it serves, are what COS replaces. The sandbox exists to separate the systems."
  PL_D9_one_door_dumb_components:
    status: "DECIDED 2026-11-03 (his; the door's design proposed by the coder, confirmed by him)"
    james: '"Yes so each component can be dumb, and agnostic at some point."'
    context: >-
      The coder's proposal, the same day: the component registry, the interaction contract and the event bus are one door, because each
      component's entry carries all three (module, route, CLI command, contract in/out/errors/permission, events emitted and listened to).
      The door on each system's server.js reads out the registry (also the handshake), checks every call against the component's contract
      before any module sees it, and carries only the events the registry declares. COS's system registry knows every door; calls and the CLI
      go through COS to a door. The sandbox makes the door the only way in. The door's code lives inside each system (from genesis's
      template), only the entry schema shared; Guardian (genesis's reference) or Intelligence (closest today) first, then one at a time.
    chosen: >-
      One door per system. Each component is dumb and agnostic: it takes its input and returns its output; the door does the rest (who may
      call, checking the contract, the events, routing). A component knows nothing of other systems, of the bus or of COS — so it can be
      written in any language (his NC0, 2026-10-19) and moved or swapped.
    next: "write it down before anything is built: an addendum to idearium/spec-engine/templates/genesis.spec (the entry's shape and the door), then a map"
  PL_D10_the_template_is_the_reference:
    status: "DECIDED 2026-11-03 (his)"
    james: '"Yes. This reduces the complexity for each complement. Look at iseariums template for a new systme"'
    context: >-
      Read the same day: idearium/spec-engine/templates/architecture-spec.template.yaml (his, 2026-10-05 → 10-17), with the node schemas in
      templates/system/schemas/, already holds the one-door design: "the registry is the interaction contract, the event bus, the queue, the
      dependency graph, the wiring harness and the spine: systems reach each other only through it" · "every component connects only to the
      registry — never to another component" · server.js serves the route nodes, cli.js runs the command nodes · "a system is
      self-contained … runs in its own COS compartment" · "hardcoded has to earn its place". None of the 14 systems was made from it.
    chosen: "the template is the reference each system is rebuilt toward, one at a time, the door as its registry"
    still_his:
      - "the template lists registry-components.js, interaction-contract.json and event-taxonomy.js as three files while its rule makes the registry the contract and the bus: one source (the others generated or dropped)?"
      - "the template says \"what every system uses is the kernel's\" (and the kernel serves existing systems until each moves); today he said lib/ is not a directory for anything a system uses that is not in its own folder — superseded, or the same meaning?"
      - "where the .cos sits in the tree (the template lists compartment.json)"
  PL_D11_cos_orchestrates_completely:
    status: "DECIDED 2026-11-03 (his); the plan below is the coder's, not mapped"
    james: '"Look through all the phases. Cos is meant to be the orchastrator complelely. Replace autopilot."'
    found: >-
      Read the same day. COS's: supervising (MG15–MG17, 0.60.326–0.60.331), its window (MG18, MG29, MG33–MG37), walls, caps, pause, updates,
      configuration, bell, CLI, add system. Not yet: `npm run start:all` still runs lib/nexus/autopilot.js (now a launcher: starts COS, then
      six core duties from lib/ — wire, vitals, update, loom refresh, snapshot, follow); the old orchestrator/orchestrator.js (3,688 lines,
      :9000, what `npm start` runs) still holds the central component registry, system registration and heartbeats, the shared event
      stream, the agents' MCP door, the TV shell and /ui pages, and forwards for ideas, gaps, memory, snapshots, specs, intelligence,
      versionium, changelog, spec drift; it reaches 26 times into other systems' files. Open phases that already plan the rest are spread over
      four maps: CS3, CS4, CS4a, CS7 (cos-spine), MG12, MG19–MG22, MG28, MG32 (cos-manager), DO1–DO6 (system-doors), CP0–CP10 (compartment).
    plan_by_the_axioms: >-
      (1) COS starts itself — start and start:all start COS; autopilot archived (§0.3); each core duty to its owner (§5.15): update → COS,
      vitals → Diagnostic, wire and snapshot → their owners, follow → COS's bell and ledger, loom refresh dropped with Loom. (2) COS's system
      registry replaces the central registry: it reads each system's own door (§5.16). (3) The orchestrator's other jobs back to their
      owners, each through its door; its UI pages to COS's UI or the system's own. (4) The old orchestrator archived when nothing calls it.
      (5) The open phases gathered into one map.
    still_his: "the TV shell (/home, its channels): COS's UI, or a system of its own?"
  PL_D12_cos_ui_and_automation:
    status: "his words recorded 2026-11-03; the TV shell reading TO CONFIRM"
    james: '"Cos ui stays the cos ui. It’s already for ochastrating. Also the automation where is it?"'
    found: >-
      Read the same day: the automation engine is lib/automation/engine.js (in lib/, against his rule that day); the old orchestrator runs
      it (orchestrator/automation/index.js, his 2026-10-30 "need to finish the automation in orchestrator": agent steps through RAID to
      Guardian, browser and macro steps to Clear Glass); Clear Glass holds the workflow and macro engine (clear-glass/src/mesh/automation-
      engine.js, :7704); lib/automation-registry.js (in lib/, served by Idearium) is one view over six sources (Copilot, Ollama, lib, Clear
      Glass, Idearium, BrainOS). COS's Automation page holds only the supervisor's policy; macros and rules wait on MG7, never built.
    plan_by_the_axioms: "what runs automation moves from the old orchestrator to COS (the orchestrator, PL_D8, PL_D11); the engine out of lib/ into COS's folder; COS's Automation page shows and runs workflows, macros and rules; Clear Glass keeps its browser automation, reached at its door"
    reading_to_confirm: "\"Cos ui stays the cos ui\" read as: the TV shell does not become COS's UI — then does the TV shell stay as its own thing, or go?"
