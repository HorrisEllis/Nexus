# 0.60.351 — CI8: tension on the TV

James, 2026-11-01: "72% so make sure it is tv ui and i can access it,"

## Where to find it
- **The TV.** Open the rail and pick **◬ Tension**. It is appended after COS. A rail you saved before this release gets it added at the end.
- **Agents and the CLI.** Use `tension`, or `tension friction`, through nexus.command.

## What it shows
- Every system, sorted by tension, with:
  - its regime: stable, elevated, turbulent or critical;
  - the parts of its tension: monitor tension, loop tension, friction, monitor gaps, open loops and slope;
  - the worst open loops, as scored by Cortex.
- The overall maximum and regime, and the field's friction.
- Each source (Diagnostic, Cortex, CFR), with whether it answered.
- It refreshes every 10 s while shown.

## How it is reached
- The TV page asks only the orchestrator: `GET /api/tension-field/tension`.
- The orchestrator asks Intelligence's `/api/intelligence/tension`, whose numbers come from `intelligence/friction.js` (0.60.350).
- If Cortex is down, open loops are shown as unknown, never 0.
- If Intelligence is down, the page says so in red and names it.

## Proof
tests/modules/test-tension-channel.test.js passes 5/5. TC-03 and TC-04 run in Clear Glass against a stand-in orchestrator:
- guardian shows 2.34, critical: 0.9 × 1.4 × 1.5 = 1.89, plus 0.3 × 1.5.
- With Cortex down, its open loops show as unknown.
- With Intelligence down, the page names it.
