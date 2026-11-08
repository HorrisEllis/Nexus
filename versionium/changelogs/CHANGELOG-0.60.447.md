# 0.60.447 — OC8a: COS, the hub of all automation

James, 2026-11-08: "basically i want it to be the main subrate for all automation like a hub for the automation pipeline, workflows, tasks, including or using raid as the authentication and tracking system. queues, contracts, dag, it should all be there, waiting to be wired in." · "yes, pick the structural solution. just some context. i want idearium to be used to build capability towards an endstate if nexus cant do it, build it. like synthesizing into a compartment."

## His call
Four readings were put to him side by side. His "yes" took them (AE_D4, docs/2026-10-25-automation-engine-to-orchestrator-phasemap.spec):
- **1a:** the hub is slots now, each wired as its phase lands.
- **2a:** RAID stays Cortex's and is reached by its route, so it can be swapped (§5.15).
- **The request spine comes after the hub.** RQ7, RQ8, RQ14, RQ15 and RQ16 are already slots waiting in it.
- **A gap goes to the free sources first,** then another agent (lifeline), then the web (Clear Glass), and to him last.

The coder reads "the structural solution" as the one his axioms pick. That reading is to confirm.

## What it does
- **COS's Hub** (the cockpit's page, `cos hub`, or GET /api/cos/hub) lists every piece of automation in one place. Each is read just now from the system that owns it:

  | Slot | Owner and route |
  |---|---|
  | automation | Idearium, AU1 |
  | pipelines | Clear Glass |
  | tasks and queues | COS's own |
  | RAID and its contract queue | Cortex |
  | the phase DAG | Idearium |

- **A slot is wired only when its owner answered.**
  - An owner that is silent is **down**, with the reason.
  - A route an owner refuses is **refused**, with its status.
- **The slots still waiting** each name the phase that wires them:
  - agents: OC4b;
  - a DAG per input: RQ14;
  - context: RQ7;
  - gaps: RQ8;
  - hypotheses: RQ16;
  - experiments: RQ15.
- **His end-state context is on RQ15.** Idearium builds what Nexus cannot do, synthesized into a compartment.

## Where it lives (sovereignty)
- **COS's own folder:** `cos/manager/hub.js`, `cos/ui/hub/`.
- **COS's contract:** its route and page are declared there.
- **COS only reads.** It reaches each owner by its route, never its files. The phase graph shows 0 crossings.

## Proof
tests/modules/test-cos-hub.test.js: 4/4.
- Stand-in Cortex and Idearium answer, so their slots are wired.
- Clear Glass is down, so its slot is down with ECONNREFUSED.
- A 404 is refused.
- The waiting slots name their phases.
- Clear Glass drives the Hub page through the real cockpit.

## Said
- docs/2026-10-25-automation-engine-to-orchestrator-phasemap.spec does not parse as YAML. It was already broken before this release, at line 133 at HEAD. It is not fixed here.
