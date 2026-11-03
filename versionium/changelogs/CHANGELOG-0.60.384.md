# CHANGELOG 0.60.384 — into CLAUDE.md: do not guess; each system is sovereign; component registries and the system registry

James, 2026-11-03: "Put in the Claude MD. Also put do not guess if you do not know. Ambiguity must be reconciled by me. Use the Atlas in
Idearium. The specs in each spec folder. Of each system. Nothing a system needs lies outside of its own boundaries, beyond another system. Like
Idearium needs Guardian, right? But I could slot another system in its place to use. It's not hardwired, it just uses the API routes and the
CLI server, which is the whole point. That's why the axiom exists that says hardwired, hard-coded must earn its place."

James, the same message: "Each system is sovereign. It is responsible for its own data, its own modules. Its own commands, lib is not a
directory for anything that a system uses that it does not have within its own directory. Each system needs to work independent of the system.
Loom is not the component registry. The lib folder is not the component registry. The component registry is the system's component registry,
you know, per system, right? Then the system registry is for connecting the component registries. Cos and The orchastrator uses that to
orchestrate."

## Written
- **docs/CLAUDE.md**, a dated addendum, with his words:
  - **Do not guess.** If you don't know, read or ask; ambiguity is his to reconcile, asked with the readings side by side.
  - **Read first:** the Atlas in Idearium (`docs/atlases/<system>-atlas.md`, shown by `idearium/ui/js/nexus-atlas.js`) and each system's own
    spec folder.
  - **Each system is sovereign:** its own data, modules and commands, all inside its own folder. Another system is reached only through its
    API routes and the CLI server, so it can be swapped (his example: Idearium uses Guardian, and another system could take Guardian's place).
    `lib/` is not a directory for what a system uses.
  - **The component registry is per system** (not Loom, not `lib/`). **The system registry connects the component registries**, and COS and
    the Orchestrator use it to orchestrate.
- **The root CLAUDE.md** says all of it in its opening lines.
- **AXIOMS §5.16** gains the system registry sentence and the routes-and-CLI rule, in his words.
- **docs/2026-11-03-registry-per-system-phasemap.spec:** the first planning question (how systems find each other) is answered by him.

## To confirm with him (not decided by the coder)
- "the axiom … that says hardwired, hard-coded must earn its place": the nearest text found is AXIOMS §0.5, "Complexity Must Earn Its
  Existence". No axiom uses the word "hardwired".
- Where the system registry lives and whose it is. Today's `lib/system-registry.js` is a read-only merge of autopilot's kernels, diagnostic's
  systems and lib/version.js (2026-09-06), not the registry he describes.

## Proof
- test-registry-sovereign 2/2: the law check still finds §5.16 in all three files.
