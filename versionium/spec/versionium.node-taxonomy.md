# Node type → system map — Versionium

## Legend
Same as Guardian's map: WRITES / READS / VIA LOOM / PARTICIPATES / NOT USED.

| Type | Status | Grounding |
|---|---|---|
| `component` | NOT USED — real, confirmed gap | `versionium/registry-components.js` uses the identical `_c()` shape every capability-map.js-scanned system uses — but checked `capability-map.js`'s actual `SYSTEMS` map directly: `cortex, idearium, guardian, loom, ollama, eravos, clear-glass (×2), emerge, architect, copilot, bridge, nexus-healer`. Versionium isn't in it. Real capabilities exist and are simply never scanned into the component/hook/wire graph — this is the concrete gap `wiring-gaps.js`/`dangling-report.js` exist to catch, confirmed here directly rather than left as a maybe. |
| `schema` | READS (shared, no local registry seen) | No `versionium/schemas/` folder found, unlike guardian's — versionium doesn't appear to have adopted the per-system schema-folder convention yet. |
| `command` | WRITES | `versionium/registry-components.js`'s routes (commit/history/calendar/state/restore) are real `{method,path}` command-shaped entries. |
| `tool` | IS THE TARGET of two, doesn't write its own | `versionium.history.tool` and `versionium.snapshot.tool` (this batch) wrap versionium's routes from outside — versionium itself has no `lib/agent-tools`-style tools calling out from within it. |
| `node` | NOT USED — same confirmed gap | Same reasoning as `component`. |
| `hook` | NOT USED — same confirmed gap | Same reasoning as `component`. |
| `wire` | NOT USED — same confirmed gap | Same reasoning as `component`. |
| `system` | IS ONE | `versionium` is a real, named system in `NEXUS_MAP.md`'s own top-level list (port-adjacent, "commit/causal history"). |
| `spec` | WRITES | `versionium/spec/versionium.spec` — real, same universal convention. |
| `nex` | NOT CONFIRMED | Versionium's own snapshots (`_kernelSnapshotFor`, `versionium.commit` kernel ingest) are a *different* real mechanism from cortex's `.nex` format — not verified as the same thing, likely isn't. |
| `capability` | WRITES | `versionium/registry-components.js`'s `_c()` — same real shape as guardian's, same universal convention. |
| `event` | WRITES (real, but not fully identical shape) | `versionium/lib/engine.js` writes to a real `versionium_events` jaaDB table: `{uuid, type, payload, ts}` — matches `schema.event`'s required fields (`uuid`, `type`, `ts`) but its optional `source`/`id` fields weren't directly confirmed present. Close enough to call REAL, not identical enough to call verified-exact. |

## A real, unslotted type found while mapping — not silently folded in

Versionium's actual core record — a **commit** — doesn't match any of the 32.
`versionium/lib/engine.js`'s real `commit({message, branch, causedBy, system,
state})` produces `{uuid, commitId, parentId, branch, system, ...}`, stored
in `versionium_commits`-shaped rows, distinct from `versionium_branches`
(head-pointer rows) and `versionium_events` (the `.event`-shaped log above).
Neither `.nex` (cortex's snapshot format) nor `.job` nor anything else in the
32 covers this — it's a genuinely separate real thing with no home yet. Not
adding a 33rd type on my own initiative; flagging it the way `.clips` and
the ledger/gap fragmentation were flagged, for you to decide.

## Next
