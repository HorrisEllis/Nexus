# NEXUS — Working Agreement (read this first, every session)

This file is the persistent contract for anyone (human or AI) building NEXUS.
It exists because these rules kept living only in conversation memory and drifting.
They are law here. AXIOMS-v3.1 governs; this is the operational distillation.

## The five standing rules — non-negotiable

1. **MAP BEFORE BUILD (§3.3).** No code before the work is mapped. For anything
   non-trivial, write or extend a phasemap in `docs/*-phasemap.spec` — chunked,
   bottom-up, drift accounted per phase — BEFORE touching source. Grounding
   (§8.6, below) is part of mapping.

2. **REUSE BEFORE BUILD (§8.6).** Read the codebase first. Nearly everything has
   substrate already. Before writing a "new" module, grep for what exists and
   compose it. Most drift this project has seen came from building beside
   something that already existed.

3. **ALWAYS UPDATE THE COMPONENT REGISTRY — WITH WIRES.** Loom's registry is the
   system's self-model of its own connections; it is how NEXUS stays aware of
   itself so it can fix itself. Every new component MUST be mapped into loom
   **with its real `require()`/consumer edges as wires**, not as a bare
   declaration. A component with no wires is an isolated dot the system cannot
   reason over. Mirror `loom/maps/warp-map.js`; add to
   `loom/maps/observability-map.js` (or a sibling map). Bare `driver.declare`
   with no hooks/wires is a defect, not an update.

4. **ADDENDA TO RELEVANT SPECS (§12.5).** A living spec documents drift. When you
   change behavior, add a dated `## ADDENDUM` to the spec(s) that own it, and
   register new specs in `docs/SPEC-REGISTRY.md` (§6.3). Divergent copies of a
   spec are two contracts — surface them, don't collapse them silently.

5. **NOTHING GETS LOST UNLESS REDUNDANT (§0.3).** Archive, don't delete. A stale
   thing is superseded-and-kept, not erased. The only removable thing is a true
   duplicate, and even then the drop is reported, not silent.

## Delivery discipline

- **ONE zip, named `nexus.zip`, no fragments.** The user sees work only through
  `/mnt/user-data/outputs/nexus.zip`. Remove preview files before presenting.
- **NEVER commit `data/**`.** That is state, not code. Commit code + docs only.
- **Version bump per phase/chunk** in `lib/version.js` (the single source of
  truth; package.json follows it).
- **Tests:** register in `tests/modules/run-all.js`; silence `[jaa]`-style logs
  or the runner miscounts. Suite must stay green.

## James's voice (2026-10-01)

James: "can you make it a rule to quote me, in the versions, changelogs, like i want my voice to be here. I have no
job, or portfolio. i want this as much me as possible. you're the coder."

- Every version line in `lib/version.js`, every `CHANGELOG-*.md`, and every phasemap's `origin` opens with James's
  own words, quoted verbatim — his spelling, his phrasing, not cleaned up. Then what was built, and the proof.
- The idea, the direction and the calls are his; say so. The code is the coder's job; the project is his work.

## Evidence discipline (§0.1, §1.1)

- Evidence over memory. Verify against the actual file/behavior before asserting.
- Nothing is real until proven — a declaration/route/wire is a CLAIM until
  checked against source. Don't let paperwork stand as truth (see
  `loom/scanners/` — declared ≠ served).
- Nothing silently fails (§1.2). A skip/failure is stated with a reason.

## When unsure

Ask with a specific proposed action rather than guessing silently or refusing.
Improvise with the best available tool; ask only when the action is consequential
and uncertain.

---
*If you are an AI reading this at the start of a session: these five rules are not
suggestions. Map first, reuse first, wire the registry, addend the specs, lose
nothing. Then build.*
