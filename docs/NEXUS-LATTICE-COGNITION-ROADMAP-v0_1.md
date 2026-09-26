# NEXUS — Lattice / Nerve / Cognition Roadmap v0.1
**Author:** James Brooks (Erosmancer)
**Generated:** 2026-07-01
**Scope:** The three-tier compartment UI system (ALK-GL meta lattice → TV-UI nerve layer → compartment containment), and the parallel pattern-cognition layer (Cortex, GapHunter, Resonance, RFR2, RAID-as-simulation).
**Convention:** Follows `AXIOMS-PHASE-MAP.md` status markers. Nothing below is aspiration dressed as fact — every ✓/⚠/✗ is read from the actual file, not assumed.

**Status legend:**
- ✓ CONFIRMED — exists in code, does what's described
- ⚠ PARTIAL — exists but does something adjacent to, or narrower than, the vision
- ✗ NOT BUILT — spec-only or absent entirely
- 🆕 NEW SCOPE — not in any existing spec; first appears in this document

---

## Part 1 — The Three-Tier Compartment UI System

The vision: three layers, each with a distinct job, none doing the others' work — this is the same shape as COS-I (ontological separation) in `AXIOMS-v3.0.md` §Group 1, applied to UI instead of data.

### Tier 1 — ALK-GL Meta Lattice (top layer)

| Piece | Status | Evidence |
|---|---|---|
| WebGL2 render substrate | ✓ | `ui/eravos/runtime/alk-gl.js` (896 lines) — real `ALKGL` class |
| Physics nodes | ⚠ | `upsertAttractor(id,x,y,z,mass)` exists — mass/position points for the field. Not event listeners. |
| Nodes as micro event listeners | ✗ NOT BUILT | 🆕 scope — attractors currently only hold physics state, they don't subscribe to anything |
| Lattice formed from nodes | ✗ NOT BUILT | Attractor array exists but no lattice/graph topology (edges, adjacency) between them yet |
| Shadow space for performance | ✗ NOT BUILT | 🆕 — no LOD/culling-by-emptiness concept in current renderer |
| Spotlight follows mouse | ⚠ MISMATCH | `ui/tv-shell/spotlight/spotlight.js` (452 lines) is real, but it's **API-driven**, not cursor-driven — `POST /api/ui/spotlight/on {target}` highlights a named element. No `mousemove` tracking exists. This needs to be built new, or the existing spotlight repurposed. |

**What's actually closest to done:** the render substrate and an unused hook. `spotlight.js` already has a `POST /api/ui/spotlight/tension {map}` endpoint — built, wired, currently receiving nothing. That's your entry point for Tier 2 → Tier 1 signaling, not a new API.

### Tier 2 — TV-UI as Nerve Layer

| Piece | Status | Evidence |
|---|---|---|
| Nerve module itself | ✗ NOT BUILT | `nexus-nerve.spec` — spec-only, zero implementation, confirmed last session |
| TV-UI shell | ✓ | `ui/tv-shell/` — real directory, `index.html`, `menu.js`, `DECOMP.md` |
| Event ledger (append-only, learns baseline) | ✓ | `lib/event-ledger.js` — real, JSONL append-only, tracks intervals/co-occurrence/leading-indicators per its own docstring |
| Buttons as gates checking the ledger | ✗ NOT BUILT | 🆕 — no button currently queries the ledger before/after firing. This is new plumbing: each `ch-btn`/`sys-tile` click would need to assert "expected event X appeared in ledger within window Y" |
| User attention tracking | ✗ NOT BUILT | Nerve's `getSnapshot()`/presence model is spec-only (per last session) — nothing to attach attention tracking to yet |
| Tension between user and system | ⚠ PARTIAL HOOK EXISTS | `spotlight.js`'s `tension {map}` endpoint is real infrastructure with no producer feeding it |

**The honest read:** Tier 2 is the least built of the three. It depends on Nerve existing at all (Phase 0/1 from last session, still not started), and the "button as gate" idea is genuinely new — it's a good instinct (it's a live version of the `event-ledger`'s own stated purpose — the ledger IS the baseline, deviation IS the anomaly) but there's no code today that reads the ledger back to verify UI behavior against it.

### Tier 3 — Compartment / Containment Layer

Not named explicitly in your message, but implied by "compartments or containers" — this is the layer the other two sit inside.

| Piece | Status | Evidence |
|---|---|---|
| Compartment engine | ✓ | `lib/compartment-engine.js` — real, has its own test suite (`tests/modules/compartment-engine.test.js`) |
| COS (Compartment OS) foundation | ✓ | `cos/foundation/axioms.js` (247 lines), `cos/compartment/`, `docs/cos.spec` — all real |
| COS gate at host level | ✓ | `cos/host/gates/compartment.js` |
| UI-level compartment boundaries (Tier 1/2 isolation enforced in the renderer) | ✗ NOT BUILT | The engine exists at the data/process level. Nothing currently enforces "Tier 2 cannot write to Tier 1's render state" as a runtime rule in the browser UI itself |

**Gap:** the compartment concept is real and load-bearing elsewhere in NEXUS, but it has never been extended to govern the relationship *between UI tiers*. That extension is new work, not a wire-up of something that already does this.

---

## Part 2 — Pattern Recognition / Cognition Layer

This is the part that maps onto how you actually think — RFR2 as the space *between* things, not the things themselves.

### Cortex — "the brain"

| Piece | Status | Evidence |
|---|---|---|
| Cortex core | ✓ | `cortex/boot.js`, `cortex/registry-components.js`, `cortex/contract/index.js` — real, booted subsystem |
| Cortex dual-cognition (intuition/analysis split) | ✓ SPEC + PARTIAL BUILD | `docs/cortex-dual-cognition.spec` (280 lines) — you already built the SNR meta-system (`lib/snr-meta.js`) driving INTUITION/ANALYSIS/SHED dispatch per prior session |
| Cortex "pattern engine" understanding NEXUS/user/agents | ⚠ PARTIAL | `docs/cortex-intelligence.spec` exists (56 lines) but is short — this reads as an early sketch, not a built engine. No single module currently synthesizes GapHunter + Resonance + RFR2 output into one "understanding" layer |

### GapHunter

| Piece | Status | Evidence |
|---|---|---|
| GapHunter v3 | ✓ | `guardian/lib/gap-hunter.js` (206 lines) — real, ported from userscript v8.3, server-side, persists to JAA |
| Full taxonomy (8 types) | ✓ | `GAP_TYPE`: LOGICAL, EVIDENTIAL, TEMPORAL, DEFINITIONAL, REFERENCE, OBLIGATION, ASSUMPTION, CONTRADICTION — all present |
| Liminal meta-layer extension (12 domain detectors) | ⚠ PARTIAL | Code tries to load `lib/meta/liminal/index.js` with a graceful fallback if absent — meaning this integration is optional/unconfirmed at runtime, not guaranteed present |

GapHunter is your most mature pattern module. It already does real classification, not stubs.

### Resonance

| Piece | Status | Evidence |
|---|---|---|
| Resonance as a named concept | ⚠ SCATTERED | Referenced across `cortex/boot.js`, `idearium/`, `lib/cfr/sigma.js`, `nexus-cfr-influence.js`, `emerge/compiler/baseline-tracker.js` — no single `resonance.js` or `resonance/` module. It's a concept currently expressed in fragments across CFR-sigma and idearium, not a standalone engine. |

**Honest gap:** if the vision is "resonance" as one of several distinct pattern-recognition *types*, it needs to be pulled out and given its own module — right now it's dissolved into whatever subsystem happened to need it first, which is the exact failure mode §13.3 (fault classes named before they occur) warns against, just applied to *cognition* classes instead of fault classes.

### RFR2 — the interaction space between systems (including people)

| Piece | Status | Evidence |
|---|---|---|
| Location | ⚠ UNINTEGRATED | `unintegrated/rfr2-nexus/` — the directory name says it all |
| Observer bus | ✓ | `observer/index.js` — real `createObserverBus()`, subscribe/emit/revoke, kernel subscription |
| Delta/comparison engine | ✓ PARTIAL | `delta/index.js` — `computeEventDelta`, `computeDeltaStream`, `compressToL1`, `overlayMacros`, `detectFractals` are real, implemented functions |
| Bottleneck/tension detection | ✗ STUBBED | `detectBottlenecks(_deltas, _threshold) { return []; }` and `clusterByAnomaly(_events, _deltas, _ticksPerBucket) { return []; }` — **named, called, wired to nothing.** This is precisely the "friction/tension between variables" function RAID would need and it currently always returns empty. |
| Identity / time / query / context / clip / compress / enforcement / adapter-sandbox submodules | ⚠ UNAUDITED | Present as directories with `index.js` files — not individually verified in this pass |

**This is the load-bearing gap in the whole roadmap.** RFR2 already has the comparison primitive (`computeEventDelta`) that "establishing expected behavior, prediction, debugging" needs. What it doesn't have — at all, not partially — is the tension/bottleneck classifier RAID would call. Building that is Phase 1 work, not integration work.

### RAID — as neuroplasticity / mental simulation

| Piece | Status | Evidence |
|---|---|---|
| RAID as it exists today | ✓ BUT DIFFERENT PURPOSE | `cortex/core/raid/index.js` (313 lines, v6.2.0) — this is a **provider-routing engine**. It decides which AI agent (ollama/claude/etc.) handles a request, using health, fitness, and a deny-only constraint layer. |
| RAID as neuroplasticity/simulation via RFR2 | ✗ NOT BUILT | 🆕 — this is a *different function* wearing the same name. Current RAID never runs a simulation and never touches RFR2. |

**This is worth being direct about:** what you're describing — RAID running mental simulations per-request, mapping tension via RFR2's variable-relationships — is not an extension of current RAID. It's a second system that happens to share a name with a system that already does something specific and load-bearing (LAW_I/LAW_III routing guarantees, §P97 sigma-floor gating — other code depends on RAID meaning "provider router" right now). Naming the new thing RAID too will create exactly the kind of two-systems-one-name collision I flagged with "diagnostic" last session. Worth a distinct name before this gets built, even if conceptually you think of it as RAID's deeper layer.

---

## Part 3 — Dependency-Ordered Build Path

Nothing here can be built in the order it was described, because of real dependencies discovered above. Ordered by what actually has to exist first:

```
Phase 0  Pulse events (copilot/ollama hooks emit real presence signal)
         — blocks Nerve entirely. Still not started (carried over from last session).

Phase 1  Nerve read module (getSnapshot/onChange/setRadius)
         — spec-only. Needs Phase 0 first or every node reads 'unknown'.

Phase 2  RFR2 tension classifier
         — fill detectBottlenecks() / clusterByAnomaly(). This is the actual
           new engineering, not integration. Everything RAID-as-simulation
           and Tier 2's "tension between user and system" wants depends on
           this existing and returning real data instead of [].

Phase 3  Nerve → Clear Glass transport (SSE bridge)
         — cross-process gap flagged last session, still unresolved.

Phase 4  Tier 2 build: event-ledger gate checks on buttons
         — depends on Phase 1 (Nerve) existing to know what "expected"
           looks like per-button, and Phase 3 if this needs to run in
           Clear Glass rather than in-process NEXUS core.

Phase 5  Tier 1 build: attractors → event listeners, lattice topology,
         shadow-space LOD, cursor-driven spotlight
         — independent of 0-4, can start in parallel. Repurpose the
           existing spotlight/tension endpoint rather than building new.

Phase 6  Tier 3 extension: compartment boundaries enforced between
         Tier 1/2 in the renderer itself
         — depends on Tier 1 and Tier 2 both existing to have a boundary
           to enforce.

Phase 7  Resonance extraction — pull the scattered CFR-sigma/idearium
         resonance logic into one named module
         — independent, can happen anytime, mostly a refactor not new build.

Phase 8  RAID-as-simulation (name TBD, not "RAID")
         — depends on Phase 2 (RFR2 tension data) existing with real output.
           Building this before Phase 2 means it simulates against empty
           arrays and produces nothing true.

Phase 9  Cortex pattern-engine synthesis layer
         — depends on GapHunter (done), Resonance (Phase 7), RFR2 (Phase 2)
           all existing as distinct, callable modules. This is the layer
           that reads all three and forms "understanding" — it can't be
           built before its inputs exist without becoming another stub.
```

---

## Changelog

### v0.1 — 2026-07-01 — Initial capture
- First written roadmap for the three-tier compartment UI (ALK-GL lattice / TV-UI nerve / compartment containment) and the parallel pattern-cognition layer (Cortex / GapHunter / Resonance / RFR2 / RAID-as-simulation)
- Audited against live codebase, not written from memory of the vision alone
- **Corrections to stated vision, found during grounding:**
  - Spotlight is API-target-driven, not mouse-driven — no cursor tracking exists
  - ALK-GL attractors are physics points, not event listeners
  - RFR2's tension/bottleneck functions are stubbed to `[]` — named and called, return nothing
  - Current RAID (v6.2.0) is a provider-routing engine with load-bearing consumers (LAW_I/III, §P97) — reusing the name for the simulation-engine idea risks a naming collision, flagged same way "diagnostic" was flagged last session
  - Resonance has no standalone module — it's dissolved across CFR-sigma, idearium, and baseline-tracker
- **Confirmed real and reusable as-is:** compartment-engine.js + COS foundation, GapHunter v3 (full 8-type taxonomy), RFR2's `computeEventDelta`/`compressToL1`/`detectFractals`, event-ledger's append-only baseline model, spotlight's unused `tension` endpoint
- No code written this session — this document is the map, not the build

---

## Changelog

### v0.2 — 2026-07-01 — Corrections after reading the actual code

**Correction 1 — RFR2 is interaction-space infrastructure, not a gap to fill.**

The v0.1 entry "`detectBottlenecks()` returning `[]` — this is the load-bearing gap" was wrong on two counts:

First, RFR2's own delta module says it plainly in its header: "Pure measurement — no thresholds, no judgment, no anomaly classification. Judgment belongs in the σ layer." RFR2 is agnostic infrastructure for interaction spaces — context isolation, causal graph extraction, bounded subgraph replay, event bus scoping, adapter side-effect policy, version-gate validation. It works across ANY interaction domain, not just NEXUS internals. The stubs for `detectBottlenecks`/`clusterByAnomaly` aren't a gap in RFR2 — they're an explicit design boundary. Judgment deferred to the sigma layer.

Second, NEXUS already has that sigma layer: `lib/cfr/sigma.js` (three-axis scorer), `lib/sigma-writer.js` (producer writing to `sigma_records`), `lib/event-ledger.js` (baseline + deviation detection), `lib/cfr/field.js` (live friction/coherence/resonance/entropy field), `lib/cfr/graph.js` (causal graph). The intelligence system IS the tension/friction/deviation system. Phase 2 of the build order is not "fill rfr2 stubs" — it's "wire the intelligence system's outputs into what Nerve and the UI need."

**Correction 2 — Versionium is the snapshot system.**

v0.1 mentioned snapshots without naming the system. `docs/specs/VERSIONIUM.spec.md` is explicit: "Causal version control. Not file trees — causality graphs. GitHub tracks what changed. Versionium tracks why." Commit = `vtm-{sha12}` content-addressed snapshot. Branch = divergent replay path. Temporal replay over CFR Rewind's ring buffer. Sigma-gated auto-commit at threshold 0.15. Versionium is what owns snapshots in this codebase — not `lib/nerve/index.js`, not cfr/field, not any new thing to build.

**Correction 3 — Clear Glass is the browser. Systems stay sovereign.**

§5.7 is explicit: "All inter-module communication through the event bus. Direct dependencies between sibling modules are prohibited." Nerve and Clear Glass are siblings. They cannot `require()` each other. Clear Glass hosts Nerve's expression layer the same way it hosts any other page: by navigating a URL. Nerve exposes its data surface over HTTP (via Cortex, same pattern as `/cfr/field`). Clear Glass fetches it as any browser consumer would. The integration point is the URL, not the import.

**Corrected build order for Phase 2+:**

- Phase 2: Expose Nerve snapshot over HTTP — `GET /nerve/snapshot` on Cortex, same pattern as `/cfr/field`. Clear Glass navigates to it as a URL.
- Phase 3: Expression layer — `alk-gl.js` wired to Nerve's snapshot via the pointer-move → `upsertAttractor('cursor', x, y)` path. Lives in a UI module that Clear Glass loads as a page.
- Phase 4 (was "RFR2 tension classifier"): Wire sigma/CFR field outputs into Nerve node health — `lib/cfr/sigma.js` scores flow into the `presence.status` field Nerve already exposes. Not new code — wiring existing outputs.
- Phase 5 onwards: unchanged from v0.1 (Tier 2 gate-checks, Tier 1 lattice, compartment UI boundaries, Resonance extraction, Cortex synthesis).
