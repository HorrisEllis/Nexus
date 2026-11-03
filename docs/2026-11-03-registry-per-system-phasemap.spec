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
