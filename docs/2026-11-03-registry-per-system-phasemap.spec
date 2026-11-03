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
