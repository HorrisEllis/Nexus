# CHANGELOG 0.60.383 — RG0: every system's component registry is its own (AXIOMS §5.16), written as law and enforced

James, 2026-11-03: "Not loom. Never said loom. Loom is going to be removed"

James, 2026-11-03: "No component registry is per system.  That needs to be implemented"

James, 2026-11-03: "And enforce that. I’m sick of you confusing that. It’s fucking sovereign. Do not  make this mistake again."

## The mistake, and where it came from
While planning the `.cos` compartment, the coder twice put Loom where the component registry belongs. That followed docs/CLAUDE.md rule 3,
which called Loom's registry "the component registry". Read in the code, the registry is also built the way he says it must not be:
- one central store, `lib/component-registry.js`, kept in Cortex's memory;
- filled by Cortex at boot and served by Orchestrator;
- so with either of them down, no system can find another.

## Written as law
- **docs/AXIOMS-v3.1.md §5.16, "Every System's Component Registry Is Its Own":**
  - per system and sovereign, inside its compartment;
  - no central registry, and no system stores, fills or serves another's entries;
  - only the schema is shared;
  - Loom is not it, and is being removed.

  Also in Part IV's quick reference.
- **docs/CLAUDE.md:**
  - rule 3 restated the same way, the old wording struck and kept (§0.3);
  - "where to get context" no longer sends the coder to Loom;
  - the 2026-10-29 "every component wired" rule now asks for an entry in its own system's registry.
- **The root CLAUDE.md** says it in its first lines, with his words.

## Enforced in code
- **`lib/registry-sovereign-check.js`**, a ratchet like the boundary census:
  - what exists today is the baseline to undo (`lib/contracts/registry-sovereign-baseline.json`): 12 files using the central registry,
    22 Loom maps;
  - fails on a new caller of the central registry, a new Loom map, or a Loom map that grows, each named;
  - fails if the law is missing from any of its three files;
  - shrinking is counted and written back.
- **The coder stops adding Loom wires.** It had added them to every new file since 0.60.376, by the old rule.

## Proof
- test-registry-sovereign 2/2:
  - RS-01: the real tree holds the line;
  - RS-02: on a fixture, each way of breaking it is named, shrinking is counted, and a missing baseline is said instead of passing.

## Not done: planning with him
The per-system registry itself, and the `.cos` compartment it lives in, are in planning, not mapped. The open questions are listed in
docs/2026-11-03-registry-per-system-phasemap.spec.
