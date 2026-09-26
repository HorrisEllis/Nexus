# §SEED PROVENANCE — extracted verbatim from genesis.spec's own preamble
# (lines 1-71, everything before the first `domain "..."` declaration),
# authored by james-brooks. This is genesis's spine/root-types/axioms
# section with zero domains attached — real content, chosen as-is because
# it already IS the minimal case: kernel-as-Stream, no compartments yet.
// GENESIS CANONICAL SPEC v1.0.0
// UUID: genesis-devkit-v1-0000-2026-0710-jamesbrooks-001
// This file IS the schema-engine's definition of a valid sovereign system.
// Edit this file → every new compartment scaffolded from it inherits the change.
// Status: proposed. Foundation domains freeze at v1.0.0 per COS-5 pattern.

version 1.0.0

// ── Spine declaration ─────────────────────────────────────────────────────────
// WARP (warp-devkit-v1-0000-2026-0701-jamesbrooks-001) is not a dependency
// genesis happens to use — it is THE spine. Nothing in genesis has its own
// dispatch loop, its own cache, its own scorer, its own retry ladder, or its
// own audit log. Every domain below is a thin binding onto one of warp's five
// primitives. This is what makes the system fluid: one mechanism moves every
// signal, so any component, gate, or compartment can be added, removed, or
// hot-swapped without teaching a second dispatch system about it. genesis
// imports warp/core and warp/dispatch; warp imports nothing from genesis —
// the same asymmetric seam NEXUS already enforces (NEXUS imports WARP; WARP
// is zero-dependency and never imports NEXUS) — genesis inherits it as law.
spine WARP
spine.primitives  = Event, Gate, Stream, StreamLog, Axiom
spine.rule        = consumer_imports_spine_never_reverse
spine.binding     = universal                // not just cross-compartment — ALL state change is spine traffic
spine.manageability = one_dispatch_path_means_one_place_to_observe_throttle_or_halt_anything

// ── Spine binding table — every domain primitive resolves to a warp primitive.
// If a new domain can't be expressed as a row in this table, it does not
// belong in genesis; it belongs in a compartment's own component code instead.
bind kernel.boot          -> Stream            // the kernel IS a warp Stream instance
bind runtime.mount        -> Stream.hook       // mounting = registering a hook on the kernel stream
bind gate.*               -> Gate              // every gate is a warp Gate: matches()/transform(), no side effects
bind hook.*               -> Stream.hook       // wire registry entries are Stream.hook(kind, plugin) registrations
bind ledger.entry         -> StreamLog         // ledger IS warp's StreamLog, configured per runtime
bind schema.baseline      -> Axiom             // every baseline expectation is a hard Axiom, not a comment
bind pulse.heartbeat      -> Event             // every pulse is an Event; scored by a Stream.hook('scorer', ...)
bind nerve.listener       -> Event             // every micro-listener hit emits an Event, never a direct call
bind lattice.associate    -> Event             // edge creation/strengthening is itself a logged Event
bind tv_ui.spotlight      -> Stream (read-only subscriber) // never emits, only observes the stream

// ── Root types ────────────────────────────────────────────────────────────────
root Kernel
root Engine
root Runtime
root Compartment
root Component
root Contract
root Hook
root Wire
root Seam
root Gate
root Ledger
root Node
root Config

// ── Axioms ────────────────────────────────────────────────────────────────────
axiom SOVEREIGN                // the system answers to no external authority
axiom AGNOSTIC                 // core does not care what data or system touches it
axiom NOTHING_INLINE           // no cross-system call is ever hand-wired; wire or gate only
axiom SPINE_IS_WARP            // ALL state change, not just cross-compartment, routes through warp
axiom SCHEMA_IS_BASELINE       // nothing mounts, registers, or fires until it passes its warp Axiom check
axiom FOUNDATION_IMMUTABLE     // kernel/engine/runtime freeze after v1.0.0
axiom UUID_PER_FILE            // every file declares its own uuid; every reference is direct
axiom SMALLEST_UNIT            // one component = one file = one intent, nothing bundled
axiom HOT_SWAPPABLE            // any isolate module may be replaced at runtime without reboot
axiom CONFIG_OUTSIDE_CODE      // anything adjustable lives in config, never hardcoded
axiom LEDGER_IS_TRUTH          // every runtime writes its event stream to an append-only ledger
axiom GATE_BEFORE_CROSS        // no compartment reaches another without passing its gate

// ══════════════════════════════════════════════════════════════════════════════
// Domain 0 — Schema Baseline (the expectation every other domain is graded against)
// ══════════════════════════════════════════════════════════════════════════════
