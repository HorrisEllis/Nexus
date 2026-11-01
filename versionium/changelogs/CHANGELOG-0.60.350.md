# 0.60.350 — CI7: the tension formula is Intelligence's

James, 2026-11-01: "migrating looms friction and tension system to the intelligence system"

## What "Loom's friction and tension system" was
- **Loom computed nothing.** Its /api/friction and /api/tension forwarded; since 0.60.346 they ask Intelligence first.
- **The formula was Diagnostic's** (§TENSION-05): monitor tension from friction, monitor gaps and slope, plus 0.3 × the open gaps scored by
  Cortex's fault taxonomy.

## Moved
- **intelligence/friction.js** holds the formula, moved unchanged so the numbers do not jump.
- **Intelligence's GET /api/intelligence/tension** computes it from two routes:
  - Diagnostic's GET /friction, which now also gives each system's monitor gap count. Diagnostic measures.
  - Cortex's new GET /api/gaps/tension: every open gap, scored by Cortex's own fault taxonomy, grouped by system. Cortex owns the gaps.
- **If Cortex is down,** loop tension is said as unknown, never 0.

## Found and gone with the move
- Diagnostic's tension asked Cortex for open gaps without a limit, and Cortex's default is 20, so only the newest 20 were ever counted.
- Diagnostic required a Cortex file directly (cortex/self-heal/fault-taxonomy.js): a crossing between systems.

## Kept (§0.3)
Diagnostic's /tension, marked superseded, remains Loom's fallback when Intelligence is down. Addenda:
- loom.spec;
- diagnostic.spec;
- Intelligence's atlas.

Wired in Loom (build-surface map).

## Proof
- tests/modules/test-friction-home.test.js 6/6:
  - the same numbers as the old formula for the same inputs;
  - 25 open gaps counted, not 20;
  - Cortex down said.
- loom/test/friction-proxy.test.js 3/3.
