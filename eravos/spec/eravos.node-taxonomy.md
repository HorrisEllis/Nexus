# Node type → system map — Eravos

## Legend
WRITES / READS / VIA LOOM / PARTICIPATES / NOT USED — same as Guardian/Versionium.

| Type | Status | Grounding |
|---|---|---|
| `capability` | WRITES | `eravos/registry-components.js`, same `_c()` convention (`canvas`, `mod.spawn`, etc.). |
| `command` | WRITES | Same registry, route-shaped entries. |
| `component` | VIA LOOM | Confirmed — `'eravos'` is in `capability-map.js`'s real `SYSTEMS` map. |
| `hook` | VIA LOOM | Same scan. |
| `wire` | VIA LOOM | Same scan. |
| `node` | VIA LOOM | Same scan. |
| `spec` | WRITES — extensively, own convention | `eravos/spec/eravos.spec`, plus a full family of UI-mod specs under `eravos/ui/specs/`: `ERAVOS.kernel.spec`, `eravos.mod.sample-player.spec`, `eravos.mod.pads.spec`, `eravos.mod.timeline.spec`, `eravos.mod.sequencer.spec`, `eravos.pack.format.spec`, `eravos.genomes-ecosystems-behaviors.spec`, `eravos.nexus.build-contract.spec`. Real `.spec` usage well beyond the single-file-per-system norm. |
| `system` | IS ONE | `eravos` is a real, named system in `NEXUS_MAP.md` and `capability-map.js`'s `SYSTEMS` map. |
| Everything else in the 32 | NOT CHECKED EXHAUSTIVELY | Eravos's "mod" concept (spawn/canvas/genomes/behaviors) is a real, distinct domain vocabulary not obviously mapped to anything in the 32 — not forcing a fit; flagged rather than shoehorned. |
