# NEXUS node-taxonomy session deliverables

Everything built this session, laid out at the real repo-relative paths it
belongs at. Drop this directly over a checkout of the real NEXUS tree —
every path here matches where the corresponding real file lives.

## Corrected this pass — full sovereignty, not reference

The first version of this zip had each system's `schemas/index.js`
reference `lib/node-schemas.js` at runtime for shared types (a real,
working `SHARED_TYPES` + `shared.get()` pattern, copied from
`guardian/schemas/index.js`). Corrected on your direct instruction: that's
not actually sovereign — a system referencing a central module for most of
its own types still depends on it. Every system now has a genuine,
individual, local copy of every schema file it uses — **140 real
`schema.<type>` files total**, zero cross-system schema references left,
zero runtime dependency on `lib/node-schemas.js` from any system's own
`schemas/index.js`.

Found and fixed a real gap while doing this: `hook`, `wire`, and `system`
had been registered in `KNOWN_TYPES` and treated as `REAL` throughout this
session's mapping — but no `schema.hook`/`schema.wire`/`schema.system` file
had ever actually been created in `lib/node-schemas/`. Materializing
sovereign copies required a real source file to copy from, which is what
surfaced it. Built all three now, grounded in `loom/schema/hook.js`'s real
`HOOK_SCHEMA` and `loom/schema/wire.js`'s real `WIRE_SCHEMA` (both `REAL`);
`schema.system` stays `OPEN` — real grounding, no real persisted record
found to check it against.

**The honest tradeoff, not hidden**: sovereignty over centralization means
these 140 files can drift from each other and from whatever
`lib/node-schemas/` becomes later, if a canonical shape changes and a
system's local copy isn't re-synced. That's the same regression this
codebase already names for its own `hat`/`component` central schemas
("if HAT_SCHEMA... change later, these... schema files will silently go
stale"). Real cost of real sovereignty — every sovereign `schemas/index.js`
says so in its own header comment, not just here.

## What's here

- `NODE-TAXONOMY.md` — the central, 33-slot node taxonomy. Read this first.
- `lib/node-export.js` — updated `KNOWN_TYPES` (33, up from the original 20).
- `lib/node-schemas/` — the shared originals these sovereign copies were
  made from, including the 3 newly-built `hook`/`wire`/`system` files.
- `lib/agent-tools/tools/clear-glass/search-engine.js` — the generic
  `clearglass.search_engine.tool` (register/search/list/delete/
  register_from_pick/export_node).
- `lib/agent-tools/tools/execution/dedup-table.js` — `dedup_table`, wraps
  `cortex/memory/table-deduplicator.js`.
- `lib/node-index.js` — a live, jaaDB-backed index + per-type ledger for
  any node type (`nodes_<type>` / `nodes_<type>_ledger` tables), additive
  to the real file-based model, not a replacement for it.
- `guardian/lib/node-registry.js` — patched to call `lib/node-index.js`
  on every real add/change/delete, alongside its existing flat-file
  ledger, which is untouched.
- `test-new-plugins.js`, `test-node-index.js` — real, passing,
  end-to-end tests, run against a real (temp-directory-redirected)
  `jaaDB` and a real `node-export.js` round-trip.
- **One `<system>/spec/<system>.node-taxonomy.md` per system** — the
  stripped taxonomy (only node types that system actually, really uses).
- **One `<system>/schemas/index.js` per system**, now purely local
  (`loadAll()` over that folder only — no shared-registry reference),
  plus every `schema.<type>` file that system actually uses, materialized
  as a real, individual, standalone copy.

## Real-tested, not just written

Every `schemas/index.js` was actually `require()`'d (or, for `idearium`,
`import()`'d) against a real checkout and its `list()` called. One genuine
surprise surfaced by that testing: **`idearium` is written in real ES
modules** (`idearium/package.json` has `"type": "module"`, and
`idearium/index.js`/`registry-components.js` use real `import`/`export`).
Every other system here is CommonJS. `idearium/schemas/index.js` is real
ESM to match — and now that it no longer needs to dynamically `import()`
the shared CJS registry, `get()`/`list()` are synchronous again, same as
every other system's.

A second real bug was found and fixed while testing `lib/node-index.js`:
`guardian/jaa-store.js`'s real `insert()` uses `row.id` as its own internal
Map key. The first ledger design reused a node's own id as a ledger-row
field, so repeated entries for one node silently overwrote each other
instead of accumulating. Fixed by moving the node's id to a `nodeId` field
on ledger rows.

## What's flagged, not resolved

- **`job` vs `guardian_job`** — strong evidence they're the same shape, not unified.
- **`versionium_commit`, `ollama_job`, `clearglass_search_engine`,
  `healer_proposal`** — genuinely single-system-only types, each with its
  own local schema file. Not proposed as central.
- **`intelligence`'s `fault_taxonomy` and `sigma_record`** are honestly
  `status: OPEN` — the real source only names the writer, not the fields.
- **`schema.system`** is `OPEN` — grounded in `capability-map.js`'s real
  `SYSTEMS` map, but nothing persists an actual "system" record anywhere.
- **`bridge`** has no real directory in this snapshot — nothing was created for it.

