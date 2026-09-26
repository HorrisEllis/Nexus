# NEXUS Convergence Phase Map
*Written 2026-07-21. The plan for consolidating what this session revealed: a system ~70% built, ~30% wired, with the built pieces scattered across competing locations. Bottom-up, smallest-first, each phase gated on tests + booting throughout. Companion to docs_out/cortex-phase-map.md (organs) and nexus-worklog-and-phasemap.md (RAID spine etc.).*

## The core finding this session
Almost everything in NEXUS is **built-but-not-wired**: real code, specced, dormant, nothing calling its `init()`. Confirmed repeatedly — escalation, self-heal, gap-finder, capability-registry, user-model, radiate, RFR2, cockpit/forge-ide, the ledger tree, the input/output pipeline folders were all fully written and inert until pointed at. `lib/` and `meta/` are worst. The registries are the permanent fix: a registered-but-consumer-less module IS the "isn't wired in" list, queryable forever instead of re-grepped every session.

## Verified current state (mechanical, not assumed)
- **Registries scattered, 3 of them:** component-registry (lib/, JAA-backed, 217 live, orchestrator-init'd), hook-registry (lib/, loom-owned as of this session), wire/seam (loom's banner claim, **no code**). No **consumer** side on any of them — they record what provides, never who consumes. Half-blind.
- **Storage split across competing roots:** `data/ledger/<system>/<hook>/<date>.jsonl` (clean per-system-per-hook-per-day, 14 systems) vs `data/<system>/ledger/` (second copy) vs **stray cross-contamination** — `data/cortex/memory/guardian_*.json` (10+ guardian files) and `idearium_events.json` living inside CORTEX's folder. Same data in up to 3 places; guardian's ledger polluting cortex's.
- **Per-system pipeline folders already exist:** `data/guardian/` and `data/diagnostic/` have `input/ → queue/ → output/`, `ledger/`, `failures/`, `invariant/` — the contract-lifecycle skeleton, physically present, not yet wired to move contracts.
- **RFR2 ~10% wired:** mastermind loads only the `delta` sub-engine via lib/rfr2-bridge.js (2026-07-09). Observer, query/CQL, identity, enforcement, time, clip, version-gate, lazy — all dormant. intuition/adversarial/sigma don't touch RFR2 at all.
- **cockpit/forge-ide:** built (core/pipeline/live/cli + 74KB spec), NOT booted (:7800 unserved). Guardian cannibalizes one piece (`require('../cockpit/forge')`). The spec is the origin of the whole paradigm (.spec-as-container, seam rings, GTCI self-heal loop, word lattice).

## The model being converged toward (James's, from cockpit.spec + this session)
Four registry layers — **seam** (ring-typed minimal unit) → **component** (executable code) → **hook** (endpoint) → **wire** (typed web-path between hooks) — each with **provider AND consumer** sides. Plus **event ledgers**: one per system, rolling up to one consolidated NEXUS ledger. All **Cortex-rooted, per-system-separated, loom-owned**. Wires instrumented: each traversal recorded → bottleneck/tension/friction derived → fed to sigma + escalation. RFR2 reads ledger+registry to find causal chains; intelligence consumes RFR2. RAID (the spine, built this session) routes every request across this graph; the consumer side is what makes its hot-swap safe.

---

## PHASES — bottom-up

### Phase 1 — Storage separation  [FOUNDATION — a migration, not a build; delicate]
Cortex as data root; each system cleanly under it; one canonical location per datum.
- **1a — path-reference audit (no file moves):** map every code reference to `data/cortex/memory/guardian_*`, `data/<system>/ledger/`, `data/ledger/`. Who reads/writes each. This MUST precede any move — live code holds these paths; moving files without updating readers breaks boot.
- **1b — migrate stray ledgers out of cortex/memory:** guardian_*/idearium_* → their own system folders. Update readers found in 1a. Boot-verify each.
- **1c — reconcile the two ledger roots** to one canonical (`data/ledger/<system>/...` is the cleaner shape; the per-system `data/<system>/ledger/` folded in).
- Gate: system boots, every migrated reader resolves, no data lost (rollup counts match pre/post).

### Phase 2 — Bidirectional registry  [the permanent wiring audit]
Add the **consumer** side to the existing hook/wire registry (loom-owned, Cortex-backed). Provider side exists; consumer side is new: "component A consumes hook Z / rides wire W."
- Makes the registry a bidirectional flow graph. Immediately answers, as queries: dead modules (provider, 0 consumers = the "isn't wired in" list), orphaned consumers (consumes a vanished hook), chokepoints (hook with many consumers), blast radius (who breaks if I swap this — makes RAID hot-swap SAFE).
- Gate: `list where consumers=0` returns the real dormant-module set, verified against a manual grep of a sample.

### Phase 3 — Wire registry as typed paths
Build the missing wire layer (loom's unfulfilled banner) as **seam-ring-typed web-paths between hooks** (cockpit.spec's model: non-adjacent ring jump = type error → Gap). A wire connects a provider hook to a consumer hook, typed.
- Gate: a real data path (e.g. anomaly.detected → gap-finder → cortex.gap.found) registers as a typed wire; an illegal path emits a Gap.

### Phase 4 — Consolidated event ledger
One Cortex-rooted NEXUS ledger unioning the now-clean per-system ledgers (Phase 1). Every wire traversal / hook call / component execution writes to its per-system ledger (mostly already happening); the consolidated layer is the union where cross-system bottlenecks become visible.
- Gate: a cross-system flow appears in the consolidated ledger with its full trail (reuses the RAID envelope trail shape from this session).

### Phase 5 — Wire instrumentation → friction/tension/bottleneck
Each wire traversal records latency/backpressure/failure. Derive: slow wire = bottleneck, backpressured = tension, failing handoff = friction. Feed into sigma + escalation's friction ledger (both built this session, both waiting for exactly this signal).
- Gate: a deliberately-throttled wire produces a measurable friction rise in escalation's fault_taxonomy.

### Phase 6 — RFR2 into the intelligence system
Wire the dormant 90% of RFR2 (observer, query/CQL especially) into intuition/mastermind/adversarial/sigma, so intelligence reads the ledger+registry graph CAUSALLY ("what chain caused this bottleneck") instead of counting gaps. mastermind's existing delta wire is the template.
- Gate: an intelligence module answers a causal query over real ledger data via RFR2 CQL.

### Phase 7 — cockpit/forge-ide as the visualization
The forge IDE becomes the front-end over all of it: see every seam/component/hook/wire, provider+consumer edges, live friction/tension on the wires, the dormant-module list, the ledger flow. Boot it (:7800) as its own system. This is where "so much isn't wired" becomes a screen you look at.

## Parallel / independent (not blocked by the above)
- **Wiring audit tool** (mechanical require-graph + init-call scan) — could ship before Phase 2 as the interim dormant-module list, then Phase 2's registry makes it permanent.
- **Playwright removal** (my mistaken addition — 250MB node_modules, package.json, lockfile, stray test; check cos/archetype/registry.js ref first).
- **New warp** (parked, James: "might not be important right now") — when it lands, it's a bottom-up migration ahead of everything, since it breaks every warp/core consumer.

## Standing ledger (older, still open)
raid route/engine split (§10.3); chat_log dual schema (§10.1); cortex/heartbeat unbuilt; oscillation damping (named in escalation.spec); ~12 unspecced modules incl. loom.spec; the contract-lifecycle subsystem (handshake-ledger.spec drafted) — which Phases 1+4 lay the physical groundwork for (the input/output folders + consolidated ledger).

## Discipline (unchanged, and load-bearing here)
Every phase: map before build; smallest first; real tests against real data; system boots throughout; nothing built claimed as wired, nothing wired claimed as done, nothing lost silently (§0.3). Phase 1 especially — it's a migration of live paths; the audit (1a) is non-negotiable before any move.
