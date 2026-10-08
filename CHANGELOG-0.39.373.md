# 0.39.373 — 2026-10-07

James: "Wait what about brainos instead?"

## BO1 — BrainOS reads the same log
**One stream, two views.**
- **Each Idearium repo's Log view** reads its own compartment.
- **BrainOS** reads every compartment's.

What was built:
- `lib/activity-log/compartment.js` `list('*')` reads every compartment at once.
- `GET /api/activity` names each row by its repo. A row from an unknown compartment says it's unknown, rather than guessing a name.
- **BrainOS's right panel gains ACTIVITY.** It's fetched once, then each row arrives over Idearium's SSE as it's written. It follows BrainOS's own rule that nothing moves unless the system does. It shows:
  - agent calls and runs;
  - phase steps;
  - proposals, with who applied or undid them;
  - faults and checkpoints;
  - a system's restarts.

The per-system log (`lib/activity-log/index.js` → cortex `event_log`) is unchanged. The two are one family at two granularities.

## The phasemap is built
`docs/2026-10-07-compartment-control-and-activity-phasemap.spec`, every phase in order:

| Version | Phase | What it gave |
|---|---|---|
| 0.39.367 | CC1 | One write path for every agent's files, so Claude Code is safe inside a Nexus repo |
| 0.39.368 | AL1 | The durable activity log |
| 0.39.369 | AL2 | Its Log view |
| 0.39.370 | DT1 | The desktop as a source: runs and setup |
| 0.39.371 | VM1 + CK1 | Pause, live checkpoints and rewind, with a checkpoint before every task |
| 0.39.372 | NC2 | Each Nexus repo its system's control panel, with one inherited intent |
| 0.39.373 | BO1 | This |

## Proof
- `test-compartment-activity-log` AL-07 checks:
  - rows from more than one compartment, named;
  - a compartment it can't name, said as such;
  - filters;
  - the BrainOS wiring.
- `test-brainos-v2-rebuild` BV2-002 is a deliberate list of the right-panel tabs. It now names ACTIVITY; 13/13.
- **Every BrainOS suite is unchanged:**
  - `test-brainos-real-access-path` fails 1 of 9, as it did before this session;
  - `brainos-canvas`, `brainos-panel` and `brainos-panel-canvas-integration` print no count, as before;
  - every other BrainOS suite passes.
