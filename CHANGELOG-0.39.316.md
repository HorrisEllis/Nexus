# 0.39.316 — 2026-10-05

James: "Like I want this to be a skeleton, only using the minimal code. Then expands from there. Using the .spec as a living model. Then an atlas in the atlas template but not a list, each detailed, and referenced. All expanded."
James: "Okay now update the architecture spec."
James: "what about with status, we also have stub"

## Mapped first
`docs/2026-10-05-build-from-the-spec-phasemap.spec` 1.11.0:
- **SB30, the template is a skeleton.** It builds the tree, the registry, the schemas and only the minimal code that makes them live. The system then grows by adding nodes.
- **SB25 is widened:** the atlas is written in the atlas template, each part detailed and referenced, never a bare list.

## The architecture spec, 0.10.0
`docs/architecture-spec/architecture-spec.spec` is edited in place as a living model, with an entry in its version history:
- **His words** are in `meta.james`.
- **It points at the template and its schemas** (`meta.template`, `meta.schemas`) instead of restating them, so each fact has one home.
- **His rules are axioms:**
  - `SKELETON_FIRST`
  - `REGISTRY_IS_THE_SPINE`
  - `COMPONENT_SHAPE`
  - `ATLAS_IS_DETAILED`
- **Statuses are the template's:** open, stub, unproven, built. The old set (stub, wired, verified) wasn't read by any code.
- **Node kinds** gain capability, command, event, route, toast and contract.

## Also
The template's component status now includes `stub` (built, stub, unproven, open), in the template and in `schema.component`.

## Proof
- `test-genesis-and-architecture-spec` passes **6/6**. The new GA-06 checks the template and schema pointers, his words, the axioms, and that the spec doesn't copy the tree.
- `test-system-template` passes **5/5** and `test-nexus-atlas-refs` passes **51/51**.
