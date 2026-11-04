# 0.60.323 — the origin is server.js (his correction)

James, 2026-10-31, correcting the coder's reading of his "like it all builds from the origin as a foundation/core like the system.js, which
needs the config":
> "system.js i meant server.js"
> "yes go ahead, then merge and push."

## Changed (specs and maps only)

- **SE_D3_the_origin_is_server_js (his):** the origin every piece traces to is its system's server.js, which needs the config:
  config → server.js → the registry → components → UI.
  - It supersedes SE_D2, the coder's reading of "system.js" as the skeleton's lib/system.js. That reading is kept and marked superseded
    (§0.3).
- **The origin trace (SE2, `idearium/spec/spec-library.spec`):** a file traces to its origin when its system's server.js reaches it, through
  the require graph from the door or a registry component the door mounts.
  - Six systems have no server.js, so no origin yet: idearium, clear-glass, cortex, architect, orchestrator and cos.
  - The door phases DO1–DO5 give them one. Those phases are his origin work now.
- **The lib/system.js boot core (DO2a) is now only the coder's suggestion,** to confirm (DO_D2). The Architect door (DO2) no longer waits
  on it.
- Addended to match: architecture-spec (b), the genesis note, and docs/CLAUDE.md.

## Proof

- Both changed specs compile at depth 1.0 with no BLACK node.
- `test-substrate-spec` 3/3, `test-phase-dag` 8/8, `test-genesis-and-architecture-spec` 7/7.
- The regenerated phase graphs have no new crossings.
