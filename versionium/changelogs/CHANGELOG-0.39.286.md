# 0.39.286 — 2026-10-01

James: "can we have full options for fallback logic, routing. what could improve stability with the pipeline? can we add the
components registry as an 11th chunk for the systems template … after the file list and tree … is its self the doorway, and
the rest is isolated modular, interacting through the interaction contract/registry … routes, cli, nodes and dir … the nodes
based data structure exactly like guardian … have genesis the default spec? … remove anything from the architecture spec
thats absent from nexus?"

Map: `docs/2026-10-01-routing-registry-genesis-phasemap.spec`.

## Routing and fallback (RG1–RG4)
- `lib/pipeline-routing.js`, the policy every spec chunk build now follows. Before: one hard-coded hop (chatgpt → gemini).
  - **modes:** `fixed` · `chain` (default) · `local-first` · `economy` (the provider economy's learned order)
  - **chain:** global, plus each block's own `fallback:` in blocks.yaml; unknown providers skipped with the reason
  - **failure classes:** empty · truncated · refused · timeout · provider-down · rate-limit · login · unknown;
    `fallback_on` picks which move on (login never does)
  - **breaker:** per provider. N failures in a row skip it for a cooldown; a truncated or refused reply does not count against it.
  - **caps:** `max_hops`, `attempts_per_hop`
- Config `routing.*`, `GET /api/routing`, `GET /api/routing/plan?block=&agent=`, `POST /api/routing/breaker/reset`,
  `idearium routing [show|plan|set]`, and the settings console's **Routing & fallback** page.
- Each hop a chunk took is kept on the chunk (`chunk.route`: provider, outcome, class, ms).
- Stability fixes found on the way:
  - A hop's own error (ECONNREFUSED, log in…) was replaced by "exceeded outer wall-clock attempt cap"; it is now kept.
  - A login or a limit was retried six times against the same provider; it now ends that hop at once.
- `tests/modules/test-pipeline-routing.test.js` 14/14.

## The registry: the 11th block (RC1–RC2)
- `idearium/spec-engine/blocks.yaml` block 11, **registry** ("Component Registry & Interaction Contract"). It comes after
  build_order (the file list and tree) and waits on it.
- A repo's registry now also reads routes, CLI commands and events (emitter → consumer wires). POST
  `/api/repos/:uuid/architecture` writes it as Guardian-style nodes: `nodes/<type>/<id>.<type>` in the node-export
  envelope.
  - Node types: .component .hook .wire .event .command .contract (the doorway) .system.
  - Unchanged nodes are left alone; a node no longer produced moves to `nodes/_archive/`.
- The Architect tab shows routes, CLI and events.
- `test-repo-architecture` 12/12.

## Genesis and the architecture spec (GN1, AR1)
- **genesis 1.1.0:**
  - new domains: Domain 2c, the registry as the doorway (nodes), and Domain 11, routing;
  - axioms REGISTRY_IS_THE_DOORWAY and ALL_DATA_ARE_NODES;
  - files registry/node-registry.js and spine/route-policy.js;
  - the manifest check is still clean, now 41 files.
- Genesis is now the default: a `type: system` spec that names no template starts from it, and the New spec form opens
  with it checked.
- **architecture-spec 0.8.0** keeps only what exists in NEXUS:
  - module paths corrected (`registry/`, not `schema/` or `compiler/`) and three unlisted modules added;
  - the eleven events nothing emits, the six unbuilt routes, three unenforced proposed axioms and gap AS4 (BPM) moved to
    `docs/architecture-spec/_archive/architecture-spec-0.7.0.spec`, kept whole;
  - the registry block and routing added; AS1 and AS3 closed.
- `test-genesis-and-architecture-spec` 5/5.

## Noted, not changed
- chunk-dispatch.js is an ES module whose RAID default calls a `require` that does not exist there. It has never run;
  builds always pass an agent. Recorded in the map.
