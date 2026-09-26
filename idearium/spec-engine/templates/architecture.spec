// ARCHITECTURE TEMPLATE v1.0.0
// UUID: idearium-template-architecture-v1-0000-2026-0711-jamesbrooks-001
// This template exists to make "where does this file go, and in what order
// do we build it" a deterministic answer instead of a per-spec agent guess.
// It does not replace genesis.spec (the full sovereign-system scaffold) —
// it is the smaller, reusable shape for "give this idea a real folder
// structure and a real build order" on its own, for any spec type.

version 1.0.0

## SECTION: meta

# Meta — Architecture Map

Seeded from the architecture template. This spec's structure and build
order are deterministic — not proposed by an agent, drawn from the
standing NEXUS layering rule below.

- **Structural layers (bottom-up, §3.1)**: data/schema → core/kernel →
  lib (shared, zero-dependency) → subsystem modules → orchestration/bus
  wiring → api → ui.
- **Rule**: nothing in a higher layer is built before everything it
  depends on in a lower layer exists and is proven (PARSES < BOOTS <
  SERVING < HEALTHY < CONTRACT — evidence tiers, not vibes).

## SECTION: purpose

## Purpose & Intent

This spec's purpose is to give an idea a concrete, on-disk structure
before any component code is written — the "where do things live" answer,
fixed once, so every chunk built after this one inherits the same
folder layout instead of each agent call inventing its own.

Standard folder skeleton (adapt names, keep the order):

```
<name>/
  data/            # schemas, seed data, fixtures — nothing here imports anything
  lib/              # zero-dependency shared code; never imports the subsystem itself
  core/             # kernel/runtime — the thing that boots
  <subsystem>/      # one folder per independent module, one intent each (§5.1 smallest unit)
  api/              # HTTP/route layer — talks to core, never to another subsystem's internals
  ui/               # presentation — talks only to api, never to core directly
  docs/             # CHANGELOG, MANIFEST, README — kept current, not written once and abandoned
```

## SECTION: build_order

## Build Order

Bottom-up, §3.1 — each step must be PARSES-tier before the next starts:

1. `data/` schemas and fixtures — the shapes everything else is graded against
2. `lib/` shared utilities — zero dependency on anything above this line
3. `core/` kernel/runtime — boots on its own, no subsystem wired yet
4. Each subsystem module, one at a time, smallest unit first (§5.1)
5. `api/` routes — wires subsystems to HTTP, no UI dependency
6. `ui/` — talks only to `api/`, never reaches into `core/` or a subsystem directly
7. `docs/` — CHANGELOG and MANIFEST updated to match what was actually built,
   not what was planned
