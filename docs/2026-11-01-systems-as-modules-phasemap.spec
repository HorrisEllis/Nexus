# docs/2026-11-01-systems-as-modules-phasemap.spec — every system a folder and a module, recursively: core files at its root, each of its
# modules in its own folder with the same shape, all of them COS's to run. The idea and the calls are James's; the reading, the layout
# details, the cut into phases and the order are the coder's, said where they are.

origin: >-
  James, 2026-11-01: "need the systems merging to cos. each system should be its own folder but also a module. the each system has its own
  modules. recursive. but the folder structure should reflect that. core files in the root, then modules seperated into there own folder."
  Earlier the same day: "we need nexus to be more organized, by module, then all relevant components in each module folder. like the core for
  each module, what each system is built from, should be in the root." (BC_D5) · "each server.js in each system needs to connect to the
  component registry, then cos connects to the server.js. isolated and sandboxed." (DO_D9)

status: "MAPPED 2026-11-01. Nothing moved."

measured_2026_11_01: >-
  13 systems, ~5,900 tracked files outside data/. Folders at a system's root: cos 28, intelligence 20, clear-glass 16, idearium 15, loom 14,
  cortex 13, guardian 10, ollama 7, copilot 7, diagnostic 7, versionium 6, architect 6, orchestrator 5 — each laid out differently (lib/,
  src/, core/, routes/, commands/ …), with 2 to 26 loose .js files at the root. The shape to grow into exists: genesis's archetype
  cos/archetype/nexus-system (server.js, cli.js, config.js, compartment.json, registry-components.js, event-taxonomy.js,
  interaction-contract.json, skeleton.json, spec/, schemas/, lib/, input/ processing/ done/ failed/ output/), and lib/system-shape.js checks a
  system against it.

readings_to_confirm:
  - "\"merging to cos\": read as every system becoming a module COS holds and runs (its compartment, behind its wall, reached through its door: LM6, DO6), each staying in its own top-level folder. Not read as moving the folders under cos/: placing a folder in cos/ makes COS its owner (§5.15), and a system that is COS's cannot be sovereign. To confirm."
  - "\"core files in the root\": read as genesis's skeleton files at each system's root and nothing else loose there; everything else in modules/<name>/."

decisions:
  SM_D0_recursive_modules:
    status: DECIDED 2026-11-01 (his; the reading of "merging to cos" to confirm)
    chosen: >-
      One shape at every level. A system is <system>/ with its core at the root (server.js, cli.js, config.js, settings, compartment.json,
      registry-components.js, event-taxonomy.js, interaction-contract.json, skeleton.json) and folders spec/, schemas/, ui/, data/ and
      modules/. Each module is modules/<module>/ with the same shape one level down (index.js, module.json — its registry entry, its exports
      and its door — spec/, tests/, ui/ and its own modules/), recursively. Nothing else is loose at a root. COS holds every system as a module
      it runs; a system's registry lists its modules, and a module's registry lists its own.
    by: "his, 2026-11-01: \"each system should be its own folder but also a module. the each system has its own modules. recursive. but the folder structure should reflect that. core files in the root, then modules seperated into there own folder.\""
    by_the_axioms: "§5.15 (each owns its folder; COS runs, does not own), §8.6 (genesis's skeleton is the shape), §0.3 (moves archived, nothing deleted), §3.3 (the mover proven before any move)"

phases:
  SM0_the_module_schema:
    status: OPEN
    depends_on: [SM_D0_recursive_modules]
    files: [lib/node-schemas/schema.module, cos/archetype/nexus-system/skeleton.json, lib/system-shape.js, tests/modules/test-system-shape.test.js]
    interface: [cli]
    does: "module.json's schema; genesis's skeleton gains modules/ and the recursive rule; lib/system-shape.js checks any folder at any depth against it and says how far each system is (files to move, loose root files, modules without module.json)"
    proof: "the check runs over all 13 systems and prints each one's distance; a fixture system in the shape passes at three levels"
  SM1_the_mover_proven:
    status: OPEN
    depends_on: [CS12_the_mover_is_proven]
    files: [lib/architecture-apply.js]
    does: "the moves are done by the refactor tool, not by hand (RF2 needed 15 hand fixes); CS12 teaches it the three cases it missed and proves it on a fixture"
    proof: "CS12's proof"
  SM2_loom_first:
    status: OPEN
    depends_on: [SM0_the_module_schema, SM1_the_mover_proven]
    files: [loom]
    interface: [route, html]
    does: "Loom, the first system: no ways out, walled under COS (LM6). Its 14 root folders become modules/<name>/ with module.json; its root keeps only core files; its registry lists its modules; loom/maps re-wired"
    proof: "SM0's check passes for loom; its tests and test-cos-walled pass; COS starts it behind its wall as before"
  SM3_one_system_at_a_time:
    status: OPEN
    depends_on: [SM2_loom_first]
    files: [ollama, versionium, guardian, intelligence, diagnostic, copilot, architect, orchestrator, cortex, clear-glass, idearium, cos]
    interface: [route]
    does: "each remaining system the same way, in order of how decoupled it is (ollama, versionium, guardian, intelligence, diagnostic, copilot, architect, orchestrator, cortex, clear-glass, idearium, cos), one release each, with lib's files that belong to it moved home in the same release"
    proof: "per system: SM0's check passes, its suite and the boundary ratchet hold, COS runs it as before"

build_order: "SM0 → SM1 (CS12) → SM2 (loom) → SM3, one system per release. Each system's door (DO1–DO6) and settings (BC_D6) land in its release where they are missing."
