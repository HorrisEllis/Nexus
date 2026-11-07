# docs/2026-11-07-wiring-harness-phasemap.spec — the wiring harness: the two phases nothing covered. The other four modules of the spec are built
# by phases that already existed and were expanded the same day, not written again (his 2026-11-03 rule): DB21 (the reader), CIE10 (Emerge's
# door), CS3 (COS's bridge), IN5 (Architect). Spec: idearium/spec-engine/templates/wiring-harness.spec.

origin: >-
  James, 2026-11-07: "The wiring harness" · "spec it. then lets continue emerge". His 2026-09-27 (Q0732): "use the component registry as the
  wiring harness like loom does for nexus, that way it makes the registry a map and event bus, so chunks can have minial context."

decisions:
  WH_D0_the_spec_is_the_harness:
    status: "DECIDED 2026-11-07 (his); three readings to confirm, listed in the spec's meta"
    james: '"That makes the spec the compartment file for cos and idearium. The spine for architect and thn the components can be dumb since the door is the event bus to route." · "The wiring harness" · "spec it."'
    chosen: >-
      Each system's .spec carries its harness: its metadata, its connectors with their contracts, its handshake. The system's door serves only
      what the harness declares, on CIE-EG; COS bridges only what both harnesses declare; Architect edits the harness; components are dumb.
      The template is Idearium's, beside genesis; each system's harness is its own (PIC_D3).
    by_the_axioms: "§5.9, §5.15, §5.16 (sovereign doors), §8.6 (four of six modules on phases that existed), §17.12 (every harness change in Versionium), §17.13 (.eg)"

phases:
  WH1_the_conformance_test:
    status: OPEN
    depends_on: [WH_D0_the_spec_is_the_harness, DB21_one_registry_schema_every_level, CIE10_the_door_in_emerge]
    spec: idearium/spec-engine/templates/wiring-harness.spec
    blocks: [MOD-HARNESS-CONFORMANCE]
    files: [idearium/spec-engine/templates/harness/conformance.eg, idearium/spec-engine/templates/wiring-harness.spec]
    requires: [node, "emerge (the .eg toolchain)"]
    prerequisites: ["Emerge's door serving from its harness (CIE10)"]
    does: "the four-part test (register, contract, gate, ledger) written once in the template, run by each system against its own door; Emerge first"
    proof: "Emerge's door conforms; a door with a route outside its harness fails the gate part (T8's prediction, read per system)"

  WH2_verified_reconstruction_coverage:
    status: OPEN
    depends_on: [WH1_the_conformance_test, CIE11_retire_the_interpreter]
    spec: idearium/spec-engine/templates/wiring-harness.spec
    blocks: [MOD-RECONSTRUCTION]
    files: [idearium/spec-engine/reconstruction.eg, docs/FRAMEWORK-THREADS.md, docs/BENCHMARKS.md]
    requires: [node, "emerge (the .eg toolchain)", "a generator: deterministic, or a model run blind (T7's protocol)"]
    prerequisites: ["the prediction registered in FRAMEWORK-THREADS before the run"]
    does: "each of Emerge's modules regenerated from its spec alone and judged by its contract tests; verified reconstruction coverage reported beside specification coverage, never mixed (INV-WH-6)"
    proof: "the two numbers for Emerge in BENCHMARKS.md, the run registered first; each regenerated module in Versionium with its spec hash and builder"
