# Node type → system map — Idearium

## Legend
WRITES / READS / VIA LOOM / PARTICIPATES / NOT USED — same as Guardian/Versionium.

| Type | Status | Grounding |
|---|---|---|
| `idea` | WRITES — founding source | `idearium/index.js`'s real `IdeaCreateGate` class — this is `schema.idea`'s own original grounding. |
| `capability` | WRITES | `idearium/registry-components.js`, same `_c()` convention. |
| `command` | WRITES | Same registry, route-shaped entries. |
| `component` | VIA LOOM | Confirmed — `'idearium'` is in `capability-map.js`'s real `SYSTEMS` map. |
| `hook` | VIA LOOM | Same scan. |
| `wire` | VIA LOOM | Same scan. |
| `node` | VIA LOOM | Same scan. |
| `spec` | WRITES — extensively | `idearium/spec/idearium.spec`, plus `idearium/spec-engine/templates/*.spec` (event-system, minimal-kernel, schemas, axioms, genesis, api-service, architecture, compartments, ai-agent-system, checklists), plus a real per-idea `.spec` file generated under `idearium/data/specs/<uuid>/`. Idearium is the heaviest real `.spec` producer of any system checked so far. |
| `cos` | ADJACENT, template only | `idearium/spec-engine/templates/compartments.spec` exists as a real spec *template* for generating compartment specs — not a live `cos/kernel.js` Compartment instance itself. Flagged, not conflated. |
| `system` | IS ONE | `idearium` is a real, named system in `NEXUS_MAP.md` and `capability-map.js`'s `SYSTEMS` map. |
| Everything else in the 32 | NOT CHECKED EXHAUSTIVELY | Not swept for every remaining type this pass. |
