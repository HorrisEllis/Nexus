# 0.60.553: Idearium stays up while a self-sync replaces its spec (PF2 expanded)

James, 2026-11-17: "look at raid axioms. and the docs axioms 3.1 doc. get it done. i cant keep spending tokens. get the pipeline working, then it will be able to do all of this itself instead of you in theory."

The pipeline calls Idearium at every step, so Idearium staying up is the floor the pipeline stands on. RAID's axioms (§9.1–§9.6) govern
how the pipeline works once it can run; this release fixes what stopped it running.

## Found (his log, 10:43–10:44)
- Idearium went offline twice (34 s and 26 s) during a nexus-self sync, while his first pipeline build (GR0, nexus/cos) was running.
- Reproduced on a 5,400-file core in a sandbox and timed step by step. The one block left was `purgeSpecsOf`: 1.8–2.9 s in one block.
  By comparison, `replaceSpec` took 34 ms, writing the sources 30 ms, and materialize 40 ms.
- What `purgeSpecsOf` did, all synchronously:
  - removed the old spec's folder;
  - removed its 5,400 chunk nodes;
  - ran a quadratic loop over the mirror keys (`chunkUuids.some()` per key, about 29 million comparisons).

## Fixed
- `idearium/spec-engine/index.js` `purgeSpecAsync`:
  - the folder is removed by `fs.promises.rm`, off the event loop;
  - the chunk nodes are removed by `idearium/lib/chunk-nodes.js` `removeChunkNodesAsync`, yielding every 100;
  - the mirror keys are matched with a set lookup.
- The blocking `purgeSpec` keeps its behaviour, with the set lookup.
- `idearium/repo/index.js` `purgeSpecsOfAsync`; `idearium/repo/nexus-self.js` awaits it.

## Proof
- Same sandbox, two syncs of 5,400 files: the purge takes 0 ms on the event loop, and the sync's longest block went from 2,449 ms to
  521 ms.
- NI-008: the yielding purge removes the same folder and nodes as the blocking one.
- `test-nexus-self-incremental` 8/8, `test-nexus-specs-and-ideas-cleanup` 8/8.

## Not yet (said)
- Not run on his machine. The proof there: a self-sync with no Idearium "missed its heartbeat" or watchdog OFFLINE.
- His first build's planner ran on the Claude tab. To keep it local: Idearium, Settings, Routing & fallback, put Ollama first.
- Test runs still write tracked files under `data/` (the sandbox leak noted in 0.60.552). Restored by hand, not committed.
