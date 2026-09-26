# Node type → system map — Loom

Loom is different in kind from every other system mapped so far: it's not
a producer feeding into `component`/`hook`/`wire`/`node` via the scanner —
it **is** the scanner. Its own registry-components.js says it plainly:
"loom is THE registry authority (builds and maps NEXUS, owns the hook/wire/
component registry)."

## Legend
WRITES / READS / VIA LOOM / PARTICIPATES / NOT USED — same as Guardian/Versionium.

| Type | Status | Grounding |
|---|---|---|
| `component` | IS THE AUTHORITY, not "via" | `loom/schema/component.js`'s `COMPONENT_SCHEMA` is the real, central schema every other system's components are checked against. Loom doesn't get scanned into this — it defines it. |
| `hook` | IS THE AUTHORITY | `loom/schema/hook.js`'s `HOOK_SCHEMA`. |
| `wire` | IS THE AUTHORITY | `loom/schema/wire.js`'s `WIRE_SCHEMA`. |
| `node` | IS THE AUTHORITY | The generic component\|hook\|wire union itself is loom's own concept. |
| `capability` | WRITES — a real, notable fix | `loom/registry-components.js`'s own header: loom is "THE registry authority... and yet registered `components: []` and had no declaration file: 0 of its own capabilities in the registry. The mapmaker was not on the map." Fixed 2026-07-25 — loom now declares its own real routes into the same registry it authors for everyone else. |
| `command` | WRITES | Same registry, route-shaped entries (mirrored from loom's own `/health` route list). |
| `spec` | WRITES | `loom/spec/loom.spec`. |
| `system` | IS ONE | `loom` is a real, named system in `NEXUS_MAP.md` and `capability-map.js`'s `SYSTEMS` map — and simultaneously the thing that maintains that very map. |
| Everything else in the 32 | NOT CHECKED EXHAUSTIVELY | Loom's own scanner files (`source-map.js`, `spec-map.js`, `wiring-gaps.js`, `dangling-report.js`, `event-taxonomy-map.js`) weren't individually swept for every remaining type this pass. |
