// COMPARTMENTS TEMPLATE v1.0.0
// UUID: idearium-template-compartments-v1-0000-2026-0711-jamesbrooks-001
// §MAP FIRST — this template exists to be promoted to a repository
// immediately (mode:'manual'), before a single component chunk is built.
// The compartment map + gate boundaries + seam list ARE the repo's initial
// skeleton: folders, a MAP.md, and a gate-cross-compartment stub for every
// declared compartment. Deep component builds land inside that skeleton
// afterward — the map is drawn first, the rooms get furnished later.

version 1.0.0

## SECTION: meta

# Meta — Compartment Map

Seeded from the compartments template. This spec's purpose is to be
promoted to a repository first, deep-build second — see integration
section for the mapping rule.

## SECTION: purpose

## Purpose & Intent

A compartment is the smallest sovereign boundary in the system: one
folder, one seam, one gate. This spec exists to declare that boundary
set BEFORE any component inside a compartment is written, so the repo's
folder structure — and the rule for how compartments may talk to each
other — is fixed and promotable on day one, not discovered by an agent
mid-build.

For each compartment this idea needs, declare:

```
compartment "<name>"
  intent      = <one sentence: what this compartment owns and nothing else>
  seam        = compartments/<name>/seam.json   // isolation boundary declaration only
  gate        = gate-cross-compartment.js        // sole authorized cross-compartment path
  mounts      = <what this compartment registers on boot>
  depends_on  = <other compartment names, or none>
```

A compartment with no stated `intent` is not yet a compartment — it's an
unscoped folder, and GATE_BEFORE_CROSS has nothing to enforce a boundary
around.

## SECTION: integration

## Integration Points

**The map-first rule**: this spec is designed to be promoted
(`spec.promote`, `mode:'manual'`) the moment its meta/purpose/axioms/
integration chunks are seeded — before schema, api, events, or any
component code exists. That promotion creates the repository's real
folder skeleton (one folder per declared compartment, each holding a
`seam.json` stub and referencing the shared `gate-cross-compartment.js`)
with every other section marked TODO. Subsequent specs — one per
compartment, or one per component — promote INTO that same repository
(`parent: <this idea's uuid>`), filling in what the map only outlined.

Rules enforced at the gate, not just documented here:

- **GATE_BEFORE_CROSS** — no compartment reaches another except through
  `gate-cross-compartment.js`; a direct import across compartment
  folders is a violation to flag, not a shortcut to take.
- **NOTHING_INLINE** — no cross-compartment call is ever hand-wired.
- **SEAM_IS_DUMB** — a seam declares a boundary only: no ports, no
  direction, no methods of its own.
- Every cross-compartment call, pass or reject, emits an event — the
  gate is observable, not a silent pass-through.
