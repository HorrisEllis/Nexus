# 0.39.320 — 2026-10-05

James: "next."

EV0 is done (emerge map 1.7.15).

- `cos/`, `emerge/` and `warp/interaction-contract.json` are built from the code: the routes each server actually serves.
  - cos: vaultd's 7 routes. cos core has no http, and `/api/cos/*` is idearium's.
  - emerge: emerge-ide's 10 routes.
  - warp: none. It is a library.
- `lib/route-contract-check.js` is the route half of the contract check. A served route that isn't declared fails, and so does a declared route that isn't served. It runs in `nexus contracts check`, and loom has it as a component wired to the CLI.
- warp has no `event-taxonomy.js`. It emits no event of its own (its Streams carry their callers' events), and ET1 refuses an empty taxonomy.
- Found, not fixed: emerge-ide's `POST /api/codegen` can never be reached. The POST block before it answers every POST with 404, and it reads an undefined `method`. The contract marks it `reachable: false`.
- Loom registry regenerated from empty: 2783 → 2853 components (emergence/ is in), 3044 → 3143 edges, none lost. The 114 unresolved declarations are the same 114 as before this change (diffed).
- `emergence/` is placed in the nexus atlas. Bringing it in at 0.39.319 had broken atlas-refs; that test passes again (51/51).
- Tests: test-route-contracts 4/4 (registered), event-contracts 8/8, emergence-and-warp 198/198, plus the loom tests (component-registry, dangling-hooks, loom-map, phasemap, registration-shape).
