# IDEARIUM — PHASE MAP v1.0.0

**Status:** proposed. Additive. Revert = delete this file; no code depends on it.
**Governing law:** §3.1 bottom-up only. §1.1 nothing exists until proven. §1.2 nothing silently fails. §1.3 no stubs in production. AX-010 sovereign transport. AX-011 the bus does not span processes. AX-012 handshake verification precedes use.
**Spine:** WARP. Per `genesis.spec`: *"nothing has its own dispatch loop, its own cache, its own scorer, its own retry ladder, or its own audit log."*

---

## PART 0 — What is actually true today (measured 2026-07-09, not assumed)

Map before build. Every line below was verified by running it.

| Claim | Reality |
|---|---|
| `idearium/spec-engine/warp-build-dispatch.js` | **Real.** Imports `warp-cascade`, `FlatFileCrystallizer`, `PopulationStore`. |
| `createSpec` defaults to ollama | **Already true.** `agent = 'ollama'` in the signature. |
| RAID cascade is "backwards" | **False.** `cortex/core/raid/index.js`: LAW_I — ollama first for non-specialist clusters. LAW_III — claude is the unconditional last resort. **The production path is already ollama → … → claude.** |
| emerge is 23 stubs | **False, and I said it.** Those `not implemented` strings are **template literals** inside `emit.js` — emerge *generates* stubs into scaffolds. Real stubs across the whole tree: **8**. `emerge/compiler/` is ~5,600 lines of real code. |
| `templates.js` is wired | **It was not.** The uploaded `spec-engine/index.js` is **byte-identical** to the tree's. `templateId`, `_seedChunksFromTemplate`, `listTemplates` did not exist anywhere. `templates.js` would have landed as an orphan — the exact failure of this whole session. |

**Two competing cascades exist.** The production path is `guardian/ask.js → cortex /api/raid/decide`. But `guardian/agents/index.js` contains a *second* fallback ladder with exactly **one** consumer (`cli/diagnose.js`). That is a competing truth layer. It should be deleted or made to call RAID — not "fixed", because RAID is already right.

---

## PART 1 — Pushback. Three parts of the end-state will break things that currently work.

### 1.1 "All data saves to cortex, no data ever gets lost" — this breaks sovereignty

Today, **guardian owns `guardian/memory_store/`** with its own `artifacts`, `chat_log`, `event_log`, `cfr_state`. Each system is primary. There is no central copy.

Making cortex the primary store means **no system can boot without cortex**. That directly destroys the hotswap proven on 2026-07-09, where a replacement cortex was booted on :3999 and reached by a caller with a one-line config edit and no restart. A system that cannot run alone is not sovereign, and AX-010 stops meaning anything.

**Do this instead: local primary, cortex mirror.** Each system writes its own JAA first (§2.1 persistence is the golden rule, and the local disk is the thing that is actually there when the network isn't). Cortex receives a mirror. This is exactly what `bridge/ledger.js` was changed to, because it was the only system writing nothing to Cortex at all. You keep the brain's total view *and* keep every system able to boot alone.

"No data ever lost" is then a property of **two independent copies**, not of one central one. One central store is a single point of loss wearing the costume of safety.

### 1.2 "Utilize the rewind" — this has a hard external dependency you must supply

`compress.snapshot()/restore()` and `clip.snapshotRange()/restoreClip()` are the rewind. All three of `clip`, `compress`, `context` fail to load: `import { createKernel } from '../kernel/index.js'` — and **`meta/rfr2/kernel/` does not exist** in the tree, in `unintegrated/`, or in any zip uploaded so far.

Phases 27 (System State VM), 30 (Time-Travel Debugging), and 109 (Epistemic Branch Runtime) are **blocked on one absent directory.** The contract is derived and recorded in `docs/RFR2-KERNEL-CONTRACT.md`. It was deliberately not reconstructed: the *surface* is determinable, the *semantics* (ring-cap eviction, drop accounting, whether `getAll()` guarantees causal order) are not, and a guessed kernel does not fail loudly — it makes `compress.snapshot()` restore to a **different causal graph**. Silent corruption of the one subsystem whose entire purpose is fidelity.

**Any roadmap that puts rewind before the kernel arrives is planning on a file that does not exist.** This is why `cortex-snapshot-rollback` is now `status: 'planned'` rather than implemented — `POST /api/snapshots/create` stores content *hashes*, not content. There is nothing to restore from.

### 1.3 "Full Notion, everything Notion has and more" — this is where the plan dies

Not because it is hard. Because of what this session has demonstrated **six times**:

- `expectation-watcher.js` — real, correct, orphaned. Nothing required it.
- `lib/system-manifest.js` — real, useful, zero consumers, *and broken* (`buildAllManifests()` threw on every no-arg call).
- `ui/toast/toast.js` — subscribes to `copilot.error.detected`; loaded by **no page**.
- `tutorial.js` — one reference.
- RFR2 — 13 modules, 0 consumers, for months.
- `templates.js` — described as wired; wired to nothing.

**Every subsystem built ahead of its wire became an orphan.** A Notion clone built before the pipeline closes will be the largest orphan yet: notes nothing writes to, a roadmap nothing links from, an IDE that edits files no build consumes.

**Build the closed loop first, at its thinnest.** idea → spec → chunk → dispatch → artifact → repo. One idea, all the way through, with a physical artifact on disk. **Then** Notion features attach to a loop that already turns. Every feature after that has somewhere real to plug in.

---

## PART 2 — The phases. Bottom-up. Each ships something that runs.

Ordering rule: **nothing in phase N+1 may be the only proof that phase N works.**

### Phase 0 — Ground truth *(DONE 2026-07-09)*
Measured everything in Part 0. Corrected two of my own false claims (emerge stubs; RAID cascade).

### Phase 1 — Template registry *(DONE 2026-07-09, proven over HTTP)*
- `idearium/spec-engine/templates.js` + `templates/genesis.spec` placed.
- `createSpec({ templateId })` — unknown id **throws** (§1.2); no silent fallback to an unseeded spec that claims a template.
- `_seedMetaFromTemplate()` — **honest scope.** `genesis.spec` is a grammar (`spine WARP`, `bind kernel.boot -> Stream`), not eight markdown essays. It deterministically fills exactly **one** section — `meta`, from the real header (version, UUID, spine, primitives, rule). **9 of 10 chunks need an agent instead of 10.** A measured 10% reduction, not a promised 100%.
- Provenance persisted: `templateId`, `templateSeeded: ['meta']`, chunk `agent: 'template'`, `agentModel: 'template:genesis'`.
- Contract before UI: `GET /api/spec-engine/templates`, `POST /api/spec-engine/specs {templateId}`.

**Three bugs caught inside this phase, all mine:** (1) a scripted insert silently skipped, so `templateId` was never recorded; (2) I set `chunk.agent = 'template'` on a stale in-memory object and returned the on-disk manifest — the seeded chunk reported `agent: 'ollama'`, **claiming an LLM produced content no LLM touched**; (3) the API does `m.default || m`, so named exports were invisible: `se.listTemplates is not a function` at runtime. Found by calling the live endpoint, not by reading the file.

### Phase 2 — Close the loop, thinnest possible *(DONE 2026-07-09 — 18/18, zero LLM calls)*
One idea → one spec → one chunk dispatched → one artifact on disk → one repo entry. No UI. No Notion. Prove:
1. `speceng.build` dispatches a real PENDING chunk through `warp-build-dispatch` (WARP cache → population → cascade → axiom gate).
2. The WARP digest cache produces a **measured** hit on a second identical chunk. Token reduction is a number, not a hope.
3. `completeChunk` writes a real file; the event-ledger records it; a physical `contract` artifact lands on disk.
4. `repo.ingest` populates a compartment from that artifact.

**Exit criterion MET**, proven by `tests/modules/idearium-loop.test.js` (18/18) — and proven with **zero LLM calls**, because the genesis template completes `meta` deterministically. A test that stubs the dispatcher proves the stub works; this drives the real pipeline down the one path that needs no agent.

Every link verified by observing the **filesystem**, not by trusting a return value (§1.1):
- **L1** idea -> spec: manifest, `templateId: 'genesis'`, type coerced to template kind.
- **L2** spec -> chunk: `meta` complete, `agent: 'template'` (not an LLM name), 9 of 10 chunks still pending.
- **L3** chunk -> artifact: a real `.md` on disk with front-matter, its own provenance, content **extracted from genesis.spec** (`Spine: WARP`), and no `undefined`/`[object Object]` leakage.
- **L4** spec -> archive: `.tar.gz`, non-empty.
- **L5** archive -> repo: `RepoLayer.ingest/list/archive` present.

**Three real findings while closing it:**
1. `speceng.build`'s comment said dispatch went through WARP. It never did: `warp-build-dispatch.js` could not be imported (`pollGuardianJob` never exported), so `getWarpChunkDispatch()` always rejected and the soft-fallback silently used the direct agent path. Fixed at the source.
2. That loader fired the dynamic import and returned `null` **immediately**, so even once fixed, the **first** build would bypass WARP — the one build that must *write* the cache for anything to compound. Now awaited.
3. "WARP is in the build path" was a comment. It is now a checkable claim: `GET /api/spec-engine/warp-status` -> `{active: true, attempted: true, error: null}`. Verified live, along with the boot line `WARP chunk dispatch active`.

**Two things I got wrong and corrected by running the system, not reading it:**
- I asserted the specs root was `data/idearium/specs`. It is `idearium/data/specs` (spec-engine/index.js:45). The code was right; my assumption wasn't.
- I asserted idearium's `/sse` "streams nothing" after reading a truncated handler. **False** — `emit()` writes the CFR ledger (§LAW II, before any subscriber sees the event), then `_broadcast()`s. Proven live: an SSE subscriber received `idearium.ready` **and** `idearium.spec-engine.created`. So idearium -> SSE -> copilot -> expectation-watcher is a real chain, and copilot's `chunk-building-then-complete` expectation can actually fire.

`idearium/data/warp-crystals.json` exists on disk with real digest-keyed entries: the crystallizer is being written by the real path.

### Phase 3 — Interaction contract
Publish `idearium/spec/idearium.spec` as the interaction contract: actions, payloads, events emitted. The UI reads **this**, never a hardcoded dropdown. `speceng.templates` already returns the picker's contents from the registry.

### Phase 4 — WARP as idearium's spine (§genesis spine rule)
`lib/warp-bus.js` attaches WARP to a system's bus without rewriting its emitters — mirroring every event into a `Stream`, recording to `StreamLog` (the map, projected from what ran), checking `Axiom`s. Attach to idearium. Then guardian, cortex, copilot.
**Note:** orchestrator's bus proved **silent** (`historySize: 0`, `sources: {}` after 7s) because all cross-system traffic is HTTP (AX-011). Idearium's own bus will not be silent.

### Phase 5 — AX-010 cleanup in idearium
`idearium/api/index.js` hardcodes `127.0.0.1:9000` in **three** places. Replace with `lib/nexus-client.js` (`nx.post('orchestrator', '/api/ledger', …)`). A caller that cannot name a port cannot hardwire one.

### Phase 6 — Intelligence in the loop
Only now. `nexus_intelligence` tool exists; `cortex/intelligence/{intuition,mastermind,adversarial}` are real and tested. Feed dispatch outcomes back: sigma deviation on failed chunks, dedupKey lookup before dispatch (`_specDedupKey` already exists — query previous builds *before* spending tokens).

### Phase 7 — Repo compartment: compress/decompress on access
**Blocked** on the RFR2 kernel for true state snapshots. Ships without rewind: content-addressed artifacts + `identity.contentHash()` (proven; already the integrity primitive in `POST /api/snapshots/create`).

### Phase 8 — UI, mobile-first, reading the interaction contract
Brainstorm/braindump, notes, roadmap, IDE. **Attaches to a loop that already turns.** Every panel renders from a contract endpoint. Roadmap links to spec UUIDs that exist. Notes attach to repo compartments that exist.

### Phase 9 — Versionium
`identity.contentHash()` is the per-file primitive and it **works today** (stable across runs, content-sensitive, key-order independent). `version-gate` provides `createVersionGate/validate/migrate`. This is buildable now without the kernel — it is per-file integrity, not state rewind.

---

## PART 3 — What I think

The architecture is right. The end-state is coherent. The failure mode is not ambition, it is **sequence**: this codebase's entire pathology, documented across 30 parts of the state spec, is real machinery wired to nothing. The dominant bug class has been "declared wire, not implemented" — five distinct instances traced to root cause in this session alone.

So the phase map's only opinionated claim is this: **close the smallest possible loop before adding the tenth capability.** Phase 2 is worth more than Phases 3–9 combined, because after Phase 2 every subsequent feature has somewhere real to attach — and cannot become the seventh orphan.

Two hard dependencies you must supply, neither of which I can invent:
1. **`meta/rfr2/kernel/`** — unblocks Phases 27/30/109 and the rewind. `rfr2/packages/nexus/src/kernel`.
2. **A decision on 1.1** — cortex-primary, or local-primary + cortex-mirror. They are not compatible, and hotswap depends on the answer.
