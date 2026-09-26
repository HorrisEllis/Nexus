# NEXUS — The Mind Map
*Master phase map, 2026-07-21. The synthesis of the whole session's reading: NEXUS is an externalized mind — Co-pilot given James's own cognitive tools, reached through RAID, reasoning over a relationship+loop substrate. ~90% built, ~10% wired. This maps every piece bottom-up, nothing lost. Supersedes nothing; consolidates docs_out/{cortex-phase-map, nexus-worklog-and-phasemap, nexus-convergence-phasemap, nexus-orphan-inventory}.md into one spine.*

## The thesis (James, 2026-07-21)
"They are all tools. Like a human. Intuition, memory recall, mastermind. It's as much of my mind as I can get it." The intelligence modules are not subsystems — they are **cognitive tools**, the modes of thinking a mind uses. Co-pilot reaches them through RAID (the universal entry point) the way a person reaches for a mode of thought. Everything else read this session — CFR, lattice, RFR2, loops, gaps, crystallization — is what those tools reason WITH.

## The architecture, whole
```
   any surface (Co-pilot / UI / CLI / SSE)
             │  emits raid.route.request  (built this session)
             ▼
        ┌─────────┐
        │  RAID   │  universal entry point — start-point-agnostic router (built)
        └────┬────┘  resolves via capability-registry (built) — tools ARE capabilities
             │ routes thought to the right tool
    ┌────────┼────────┬───────────┬────────────┐
    ▼        ▼        ▼           ▼            ▼
 intuition mastermind adversarial hypothesis  memory-recall     ← COGNITIVE TOOLS
 (the leap)(strategy)(self-critic)(prediction)(push-recall 6-tier)  (built, NOT tool-registered)
    │        │        │           │            │
    └────────┴────────┴─── reason over ────────┴────────┐
                                                         ▼
   ┌─────────────────── THE SUBSTRATE (what the tools sense/remember) ──────────────────┐
   │ CFR (4-number physics: coherence/friction/resonance/entropy) — LIVE                 │
   │ associative-lattice (CFR per relationship, agnostic, any pair) — built, dormant     │
   │ RFR2 (causal query language, ancestors/CAUSED_BY) — built, ESM/CJS-BLOCKED          │
   │ loop engine (open-loop-taxonomy→resonance→loop-topology→ess) — built, dormant       │
   │ gap-hunter (8 types × domains × 8 reasons on every answer) — LIVE                    │
   │ crystallization (evidence→belief→Bayesian prior) — LIVE in liminal/intelligence     │
   │ reflection (scores decisions, opens loops when wrong) — built, dormant              │
   └────────────────────────────────────────────────────────────────────────────────────┘
             │ every hop logged
             ▼
   Cortex (memory/ledger authority) + per-system ledgers → consolidated (Phase-mapped)
```

## Verified interfaces (read this session, not guessed)
- **intuition**: `createIntuition({jaaDB, getField, getTaxonomy, getSystemLattice, buildPatterns})` → reads open gaps + senses, returns a felt pattern. Assembled in boot.js. Served? No RAID tool.
- **mastermind**: `createMastermind({jaaDB, getField, getCausalGraphClass})` → reads top-3 gaps + causal graph + RFR2 delta (via lib/rfr2-bridge.js), returns strategy. Assembled in boot.js.
- **adversarial**: `compare({left, right})` / `compareCortexFaculties(intuition, mastermind)` → the two faculties argue, adversarial judges/reconciles. Served at POST /api/intelligence/adversarial. NOT a RAID tool.
- **memory-recall**: `cortex/push-recall.js` — real 6-tier push/pull, exponential age-decay, tier-priority weighting. The recall tool Co-pilot lacks.
- **RAID router**: built this session — raid.route.request → resolve(capability) → raid.route.decided → fulfilled. Tools register as capabilities; RAID routes to them.
- **capability-registry**: built this session — 217 live components projected as tools. The registry the cognitive tools must register INTO.

## Key blockers found by reading (honest, not assumed)
1. **RFR2 is ESM, everything else is CJS.** `export class` vs `module.exports`. This is WHY RFR2 is 90% orphaned — not neglect, a module-system split. mastermind reaches it only via `lib/rfr2-bridge.js` (the ESM↔CJS shim). Lighting up RFR2 broadly = resolve interop (route all consumers through the bridge, OR convert RFR2 to CJS) — a real architectural decision, not a quick wire.
2. **The tools are HTTP-served but not RAID-registered.** intuition/mastermind/adversarial exist and some have routes, but Co-pilot can't reach them as tools through RAID because they aren't in the capability-registry as invocable capabilities.
3. **Storage scattered** (guardian/idearium ledgers inside cortex/memory; two competing ledger roots) — blocks clean consolidation.

---

# PHASES — bottom-up, nothing lost

Each phase: map→build (or wire-in-existing)→test against real data→boots throughout. Where existing orphaned code implements the layer, the phase is WIRE-IN, not BUILD (per nexus-orphan-inventory.md).

## TIER 0 — Foundations (storage + names + module interop)
**P0.1 — Storage separation.** Cortex as data root; each system its own separated folder; migrate stray `data/cortex/memory/guardian_*` + `idearium_events` to owners; reconcile the two ledger roots to one. Path-reference audit FIRST (live paths — moving without updating readers breaks boot). Gate: boots, readers resolve, rollup counts match.

**P0.2 — SYSTEM-CONTRACTS as source of truth.** Wire `contracts/SYSTEM-CONTRACTS.js` (201 named entities: events, gaps, faults, ledgers, axioms-as-data) so systems import names instead of typing string literals. Gate: a typo'd event name becomes a boot-time require error, not a silent dead listener. **This is the immune system against the exact bug class that ate most of this session.**

**P0.3 — RFR2 module interop.** Read `lib/rfr2-bridge.js`; decide route-all-through-bridge vs convert-RFR2-to-CJS. Gate: any CJS module can call RFR2 CQL. Unblocks the entire relationship engine.

## TIER 1 — The substrate (senses + memory the tools reason over)
**P1.1 — Bidirectional registry (consumer side).** Add "who consumes" to hook/wire registry (loom-owned, Cortex-backed). Provider side exists. Gate: `list where consumers=0` = the live dormant-module list (permanent wiring audit); makes RAID hot-swap safe (blast radius).

**P1.2 — Wire registry as typed paths.** Wire-in existing `clear-glass/wire/nexus-wire.js` + `scripts/verify-wires.js` + `loom/seed/session-wires.js`. Seam-ring-typed paths (illegal ring jump = Gap, per cockpit.spec). Gate: a real flow (anomaly→gap-finder→gap.found) registers as a typed wire; illegal path emits a Gap.

**P1.3 — Consolidated event ledger.** One Cortex-rooted ledger unioning the now-clean per-system ledgers. Reuses RAID envelope trail shape. Gate: a cross-system flow appears with full trail.

**P1.4 — Associative lattice live (the relationship engine's memory).** Wire-in `meta/lattice/associative-lattice.js` (built, step 7/13). Build the feed (steps 8-13): event → CFR delta → lattice write-through, event-triggered recompute, traversal API, causal-root trace, cross-graph correlation. Agnostic: same 4 CFR numbers for any pair (system↔system, user↔system, idea↔spec, session↔baseline). Gate: guardian↔cortex relationship shows coherence/friction/trajectory/causal-root from real events. **Reconcile with radiate()/user-model — different engines (co-occurrence vs CFR-shape), confirmed NOT redundant, but must interoperate.**

## TIER 2 — The reasoning (RFR2 + loops feeding on the substrate)
**P2.1 — RFR2 into the substrate.** With P0.3 unblocked, wire RFR2 observer + CQL to read the lattice + consolidated ledger. Gate: a CQL query (`FIND chains WHERE ... CAUSED_BY ...`) answers over real ledger data.

**P2.2 — Loop engine lifecycle.** Wire-in the 4 dormant CJS files as one lifecycle: `open-loop-taxonomy.js` (a gap IS an open loop) → CFR resonance (loop cycling) → `loop-topology.js` (loops cascade, correlated failure) → `ess.js` (loop closes). Gate: a gap opens a tracked loop; a resonant/cascading loop is detected; closing it is recorded. **Not module-blocked — all CJS, wireable now.**

**P2.3 — Wire instrumentation → friction/tension/bottleneck.** Each wire traversal records latency/backpressure/failure → bottleneck/tension/friction → feeds sigma + escalation friction ledger (both built this session, both waiting for exactly this). Gate: a throttled wire raises measurable friction in fault_taxonomy.

## TIER 3 — The mind (cognitive tools reachable through RAID)
**P3.1 — Crystallization as Bayesian prior-formation.** Confirm/wire crystallization (liminal L1/L2 + intelligence bep_patterns) as the mechanism where evidence accumulates, confidence updates Bayesian-style, belief crystallizes at threshold (or dissolves). A crystallized pattern = a prior the tools reason FROM. Gate: a pattern crosses threshold with real confidence math and becomes a queryable prior.

**P3.2 — Cognitive tools register as RAID capabilities.** intuition, mastermind, adversarial, hypothesis, memory-recall (push-recall) each register in the capability-registry as invocable tools. Gate: Co-pilot emits raid.route.request("recall X"/"strategize Y"/"stress-test Z"), RAID routes to the right faculty, result returns over SSE.

**P3.3 — The faculties reason over the full substrate.** Now that intuition can read the live lattice, mastermind the causal RFR2, adversarial can compare with loop/CFR evidence — they stop reading only the gaps table. Gate: mastermind answers a strategy question using a causal chain traced through RFR2 over real ledger data; adversarial reconciles intuition vs mastermind with CFR evidence.

**P3.4 — Reflection closes the learning loop.** Wire `lib/reflection.js`: score each faculty decision (fill the null satisfaction slot), track low-satisfaction streaks per decision class, open a gap when the system keeps being wrong. Never auto-rewrites its constitution — proposes, human decides. Gate: a repeatedly-bad decision class opens a self-gap.

## TIER 4 — The face
**P4.1 — cockpit/forge-ide as visualization.** Wire-in `cockpit/core.js` + pipeline/live; boot :7800. See every seam/component/hook/wire, provider+consumer edges, live CFR/friction on wires, the dormant-module list, ledger flow, the faculties thinking. "So much isn't wired" becomes a screen. Gate: the graph renders live from the registries + lattice.

## Parallel / independent
- **Wiring-audit tool** (require-graph scan) — interim dormant list until P1.1 makes it a query. (Ran once this session → nexus-orphan-inventory.md.)
- **Playwright removal** (my mistaken addition; check cos/archetype/registry.js ref first).
- **New warp** (parked, not backwards-compatible; when it lands = migration ahead of all, breaks every warp/core consumer).
- **Clear-glass minimize-on-compartmentalize** (crash-loop fixed this session via P-A spawn guard; the hide-vs-quit-on-compartment behavior confirmed already-present, may need one wire).

## Competing-truth risks to resolve (§10.3) — decide, don't let linger
- Two lattices (radiate/user-model vs associative-lattice) — confirmed different engines, must interoperate not compete.
- `cortex-v2.js` — RESOLVED this session: it's a CLI, not a second cortex. No conflict.
- gap-hunter shim (guardian/lib) — RESOLVED: forwarding shim to canonical meta/gap/hunter.js, correct.

## Already shipped this session (the spine these phases stand on)
Cortex organs 0-6, three jaa-store _matches fixes at source, JaaDB class, intelligence accumulation fix, user-model+radiate, phased boot, pressure reflex, sigma-compaction, hook migration architect→loom, capability-registry (Phase B), RAID universal router + envelope. Suite 724/0, git through 401b8aa.

## Discipline (load-bearing)
Map before build. Smallest first. Wire-in-existing over rebuild where the code exists (orphan inventory says where). Real tests, real data, boots throughout. Nothing built claimed wired, nothing wired claimed done, nothing lost silently (§0.3). TIER 0 before TIER 1 — you cannot feed the mind through scattered storage, unverified names, or a module-blocked reasoner.
