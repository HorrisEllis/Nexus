# 0.39.321 — 2026-10-05

James: "next"

EM1 is done (emerge map 1.7.16): Emerge's core, his Rheon primitives as code, in `emerge/core/`.

- **Field:** holds the state. A proposal from a model, a rule or James passes every constraint before it changes anything.
- **Constraint:** names the variables it needs. Each check has three possible answers:
  - the next state is valid;
  - it is broken, and the constraint's id says which one;
  - it can't be checked, which makes a **Gap** naming the missing input. Nothing changes.
  - Soft and probabilistic constraints let a violation through at its cost. Every other type refuses it.
- **Transition** and **Observation:** an observation carries a confidence from 0 to 1, a source and a cost, and never changes the state.
- **Lens:** looks at a deep-frozen copy, so it can't write.
- **History:** append-only and hash-chained, with logical ticks only.
- **Level:** a node's hash includes its children's, so a change below shows above.
- **Budget:** every cost is counted, and `budgetConstraint(limit)` sets a ceiling on it.
- **Seed:** one per run. Every draw and every id comes from it, so one seed replays a byte-identical history.
- Meaning is left out. It is his.
- Identity hashing and logical time are reused from `intelligence/rfr2`. Zero dependencies.
- `emerge/spec/emerge-core.spec`. `tests/modules/test-emerge-core.test.js` 6/6 (registered).
- Loom regenerated: 12 new components, 22 new edges, none lost. The 114 unresolved declarations are unchanged.
