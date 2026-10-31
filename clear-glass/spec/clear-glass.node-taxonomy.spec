# Node type → system map — Clear-glass

## Legend
WRITES / READS / VIA LOOM / PARTICIPATES / NOT USED — same as Guardian/Versionium.

| Type | Status | Grounding |
|---|---|---|
| `macro` | WRITES — founding source | `lib/agent-tools/tools/clear-glass/macro.js`'s real macro record — a named sequence of `browser_action` steps keyed to a URL pattern, storable and replayable, built on `browser_action` + `rewind_replay`'s real `clear-glass/src/rewind/engine.js` RewindEngine. Missed on the first clear-glass pass; added on direct re-check. |
| `command` | WRITES — founding source | `clear-glass/src/ipc/bridge.js`'s `_buildCommandIndex()` is literally `schema.command`'s own cited construction site (`GET /cli/commands`). |
| `capability` | WRITES | `clear-glass/registry-components.js` + `clear-glass/seam/registry-components.js` — the latter a stale duplicate per `capability-map.js`'s own dedupe comment (same 25 ids, older version, loser reported, not dropped silently). |
| `component` | VIA LOOM | Confirmed — both `'clear-glass'` and `'clear-glass/seam'` are separate entries in `capability-map.js`'s real `SYSTEMS` map. |
| `hook` | VIA LOOM | Same scan. |
| `wire` | VIA LOOM | Same scan — see also the name-collision note below. |
| `node` | VIA LOOM | Same scan. |
| `event` | WRITES — honestly incomplete by its own admission | `clear-glass/src/event-taxonomy.js` (ET3) is real but scoped to 3 of 36 real emit-call-sites so far — its own comment states `plugins/*` emits zero real error events yet. |
| `spec` | WRITES | `clear-glass/spec/clear-glass.spec`. |
| `agent` | ADJACENT, not confirmed identical | `clear-glass/src/mesh/agent-mesh.js` is real, describing browser-tab agent sessions (claude/chatgpt tabs) — same domain as guardian's `KNOWN_PROVIDERS`, not confirmed as the same shape. |
| `tool` | IS THE TARGET of several — doesn't host the loop | `lib/agent-tools/tools/clear-glass/*` (dom-archaeology, macro, tab-visibility, provider-deploy, command-index, userscripts) all call *into* clear-glass from outside. No `runToolLoop()` found inside clear-glass itself — same pattern as versionium: a target, not a host. |
| `wire` (the word, not the type) | NAME COLLISION, flagged | `clear-glass/wire/nexus-wire.js` is a real HTTP bridge process (ErosmancerOS↔ClearGlass↔NEXUS at :7704) — a different real "wire" than loom's component-graph edge type. Same collision class as `.contract` vs `guardian/interaction-contract.json`. |
| `system` | IS ONE | `clear-glass` is a real, named system in `NEXUS_MAP.md` and `capability-map.js`'s `SYSTEMS` map. |
| Everything else in the 32 | NOT CHECKED EXHAUSTIVELY | Not swept for every remaining type this pass. |
